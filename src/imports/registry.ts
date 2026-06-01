import { readdirSync, readFileSync, statSync } from "fs";
import * as path from "path";

import { buildCRL } from "../index";

import {
  Registry,
  RegistryEntry,
  ImportDiagnostic,
  ParseFailureDiagnostic,
  RegistryDuplicateDiagnostic,
} from "./types";

const SKIP_DIRS = new Set(["node_modules", "dist", "build"]);

interface ScanOptions {
  // If true, the path is implicit (root-dir default). Missing-dir is silently tolerated.
  // If false, the path is explicit (operator-supplied). Missing-dir throws.
  implicit?: boolean;
}

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

export function scanSourcePaths(
  sourcePaths: { path: string; implicit?: boolean }[],
): { registry: Registry; diagnostics: ImportDiagnostic[] } {
  const seenDirs = new Set<string>();
  const diagnostics: ImportDiagnostic[] = [];
  const registry: Registry = { byName: new Map() };
  const seenFiles = new Set<string>();

  for (const { path: rawPath, implicit } of sourcePaths) {
    const dir = path.resolve(rawPath);
    if (seenDirs.has(dir)) continue;
    seenDirs.add(dir);

    if (!pathExists(dir)) {
      if (implicit) continue;
      throw new Error(`Source path does not exist: ${dir}`);
    }

    for (const filePath of listCrlFiles(dir)) {
      const canonical = path.resolve(filePath);
      if (seenFiles.has(canonical)) continue;
      seenFiles.add(canonical);

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
      if (!ast.library) continue; // anonymous file: skip silently

      const name = ast.library.name;
      const version = ast.library.version;
      const existing = registry.byName.get(name) ?? [];
      const duplicate = existing.find((e) => e.version === version);

      if (duplicate) {
        const diag: RegistryDuplicateDiagnostic = {
          kind: "registry-duplicate",
          severity: "error",
          name,
          ...(version !== undefined ? { version } : {}),
          filePaths: [duplicate.filePath, canonical],
        };
        diagnostics.push(diag);
        continue;
      }

      const entry: RegistryEntry = {
        name,
        ...(version !== undefined ? { version } : {}),
        filePath: canonical,
        ast,
        isRoot: false,
      };
      existing.push(entry);
      registry.byName.set(name, existing);
    }
  }

  return { registry, diagnostics };
}
