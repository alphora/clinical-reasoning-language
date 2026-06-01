import { readdirSync, readFileSync, statSync } from "fs";
import * as path from "path";

import { buildCRL } from "../index";

import {
  Registry,
  RegistryEntry,
  ImportDiagnostic,
  ParseFailureDiagnostic,
  PackageResolutionFailureDiagnostic,
  RegistryDuplicateDiagnostic,
} from "./types";

const SKIP_DIRS = new Set(["node_modules", "dist", "build"]);

function listCrlFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listCrlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".crl")) {
      out.push(full);
    }
  }
  return out;
}

function pathExists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk up from a file path looking for the nearest package.json.
 * Returns the directory containing it, or null if none found up to the root.
 */
export function findProjectRoot(startPath: string): string | null {
  let current = path.resolve(startPath);
  if (statSync(current).isFile()) {
    current = path.dirname(current);
  }
  while (true) {
    if (pathExists(path.join(current, "package.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null; // reached filesystem root
    current = parent;
  }
}

/**
 * Recursively scan a project root for .crl files. Returns one registry entry
 * per file that declares a `library` line. Files without a library declaration
 * are skipped silently (anonymous local files are not includable by name).
 *
 * Skips node_modules/, dist/, build/, and dot-prefixed directories.
 */
function scanProjectLocal(projectRoot: string): {
  entries: RegistryEntry[];
  diagnostics: ImportDiagnostic[];
} {
  const entries: RegistryEntry[] = [];
  const diagnostics: ImportDiagnostic[] = [];

  for (const filePath of listCrlFiles(projectRoot)) {
    const canonical = path.resolve(filePath);
    let source: string;
    try {
      source = readFileSync(canonical, "utf-8");
    } catch (err) {
      const diag: ParseFailureDiagnostic = {
        kind: "parse-failure",
        severity: "warning",
        filePath: canonical,
        errors: [
          {
            type: "Exception",
            message: err instanceof Error ? err.message : String(err),
          },
        ],
      };
      diagnostics.push(diag);
      continue;
    }
    const parsed = buildCRL(source);
    if (!parsed.success || !parsed.result) {
      const diag: ParseFailureDiagnostic = {
        kind: "parse-failure",
        severity: "warning",
        filePath: canonical,
        errors: parsed.errors ?? [],
      };
      diagnostics.push(diag);
      continue;
    }
    const ast = parsed.result;
    if (!ast.library) continue;
    entries.push({
      name: ast.library.name,
      filePath: canonical,
      ast,
      isRoot: false,
      origin: "local",
    });
  }

  return { entries, diagnostics };
}

interface CrlField {
  libraries?: unknown;
  // Unknown sub-fields are silently ignored — forward-compat for future
  // crl.aliases, crl.exclude, etc.
}

const packageJsonCache = new Map<string, unknown>();

function readPackageJson(packagePath: string): unknown | undefined {
  const cached = packageJsonCache.get(packagePath);
  if (cached !== undefined) return cached;
  try {
    const text = readFileSync(packagePath, "utf-8");
    const parsed = JSON.parse(text);
    packageJsonCache.set(packagePath, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Walk a project's node_modules for packages declaring `crl.libraries` in
 * their package.json. Each listed file is parsed; entries are returned for
 * files that have a `library` declaration.
 *
 * v0.7 assumption: transitive CRL deps are hoisted to the top-level
 * node_modules/ (npm's default). The scanner does NOT recurse into nested
 * node_modules/.
 */
function scanNodeModules(projectRoot: string): {
  entries: RegistryEntry[];
  diagnostics: ImportDiagnostic[];
} {
  const entries: RegistryEntry[] = [];
  const diagnostics: ImportDiagnostic[] = [];
  const nodeModules = path.join(projectRoot, "node_modules");
  if (!pathExists(nodeModules)) return { entries, diagnostics };

  const candidates: string[] = [];
  let topLevel: ReturnType<typeof readdirSync>;
  try {
    topLevel = readdirSync(nodeModules, { withFileTypes: true });
  } catch {
    return { entries, diagnostics };
  }
  for (const entry of topLevel) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const full = path.join(nodeModules, entry.name);
    if (entry.name.startsWith("@")) {
      // Scoped: walk one more level for @org/pkg
      let scoped: ReturnType<typeof readdirSync>;
      try {
        scoped = readdirSync(full, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const sub of scoped) {
        if (!sub.isDirectory()) continue;
        if (sub.name.startsWith(".")) continue;
        candidates.push(path.join(full, sub.name));
      }
    } else {
      candidates.push(full);
    }
  }

  for (const packageDir of candidates) {
    const packageJsonPath = path.join(packageDir, "package.json");
    const pkgRaw = readPackageJson(packageJsonPath);
    if (pkgRaw === undefined) continue;
    if (typeof pkgRaw !== "object" || pkgRaw === null) continue;
    const pkg = pkgRaw as { crl?: unknown };
    if (pkg.crl === undefined) continue;
    if (typeof pkg.crl !== "object" || pkg.crl === null || Array.isArray(pkg.crl)) {
      diagnostics.push({
        kind: "package-resolution-failure",
        severity: "warning",
        packagePath: packageDir,
        reason: "crl-libraries-not-array",
        message: `Package ${path.basename(packageDir)} has malformed \`crl\` field (must be an object)`,
      });
      continue;
    }
    const crl = pkg.crl as CrlField;
    if (crl.libraries === undefined) continue;
    if (
      !Array.isArray(crl.libraries) ||
      !crl.libraries.every((x) => typeof x === "string")
    ) {
      diagnostics.push({
        kind: "package-resolution-failure",
        severity: "warning",
        packagePath: packageDir,
        reason: "crl-libraries-not-array",
        message: `Package ${path.basename(packageDir)} has invalid \`crl.libraries\` (must be a string array)`,
      });
      continue;
    }

    for (const listed of crl.libraries) {
      const resolved = path.resolve(packageDir, listed);
      // Reject path escapes.
      const packageDirNormalized = path.resolve(packageDir);
      if (!resolved.startsWith(packageDirNormalized + path.sep) && resolved !== packageDirNormalized) {
        diagnostics.push({
          kind: "package-resolution-failure",
          severity: "warning",
          packagePath: packageDir,
          listedPath: listed,
          reason: "path-escapes-package",
          message: `\`crl.libraries\` entry "${listed}" escapes the package directory`,
        });
        continue;
      }
      if (!pathExists(resolved)) {
        diagnostics.push({
          kind: "package-resolution-failure",
          severity: "warning",
          packagePath: packageDir,
          listedPath: listed,
          reason: "missing-file",
          message: `\`crl.libraries\` entry "${listed}" does not exist`,
        });
        continue;
      }
      let source: string;
      try {
        source = readFileSync(resolved, "utf-8");
      } catch (err) {
        diagnostics.push({
          kind: "package-resolution-failure",
          severity: "warning",
          packagePath: packageDir,
          listedPath: listed,
          reason: "missing-file",
          message: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      const parsed = buildCRL(source);
      if (!parsed.success || !parsed.result) {
        diagnostics.push({
          kind: "package-resolution-failure",
          severity: "warning",
          packagePath: packageDir,
          listedPath: listed,
          reason: "parse-error",
          message: `\`crl.libraries\` entry "${listed}" failed to parse`,
        });
        continue;
      }
      const ast = parsed.result;
      if (!ast.library) {
        diagnostics.push({
          kind: "package-resolution-failure",
          severity: "warning",
          packagePath: packageDir,
          listedPath: listed,
          reason: "no-library-declaration",
          message: `\`crl.libraries\` entry "${listed}" has no \`library "Name".\` declaration`,
        });
        continue;
      }
      entries.push({
        name: ast.library.name,
        filePath: resolved,
        ast,
        isRoot: false,
        origin: "package",
      });
    }
  }
  return { entries, diagnostics };
}

/**
 * Build the registry from a project root.
 *
 * Local files (scanned recursively from the project root) are added first,
 * then node_modules packages. Cross-source name collisions emit
 * `registry-duplicate` and the later registration is rejected.
 */
export function buildRegistry(projectRoot: string): {
  registry: Registry;
  diagnostics: ImportDiagnostic[];
} {
  const diagnostics: ImportDiagnostic[] = [];
  const registry: Registry = { byName: new Map() };

  const { entries: localEntries, diagnostics: localDiags } = scanProjectLocal(projectRoot);
  diagnostics.push(...localDiags);
  for (const entry of localEntries) {
    if (entry.name === null) continue;
    const existing = registry.byName.get(entry.name);
    if (existing) {
      diagnostics.push({
        kind: "registry-duplicate",
        severity: "error",
        name: entry.name,
        filePaths: [existing.filePath, entry.filePath],
      } as RegistryDuplicateDiagnostic);
      continue;
    }
    registry.byName.set(entry.name, entry);
  }

  const { entries: pkgEntries, diagnostics: pkgDiags } = scanNodeModules(projectRoot);
  diagnostics.push(...pkgDiags);
  for (const entry of pkgEntries) {
    if (entry.name === null) continue;
    const existing = registry.byName.get(entry.name);
    if (existing) {
      diagnostics.push({
        kind: "registry-duplicate",
        severity: "error",
        name: entry.name,
        filePaths: [existing.filePath, entry.filePath],
      } as RegistryDuplicateDiagnostic);
      continue;
    }
    registry.byName.set(entry.name, entry);
  }

  return { registry, diagnostics };
}

// Internal use only; exported for unit tests of finer-grained behavior.
export const __testing__ = { scanProjectLocal, scanNodeModules, packageJsonCache };
