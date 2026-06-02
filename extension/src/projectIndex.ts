import * as fs from "node:fs";
import * as path from "node:path";

import {
  findProjectRoot,
  resolveImports,
  type ResolvedGraph,
  type RegistryEntry,
} from "@smile-digital-health/crl";

/**
 * Project-wide indexed view of a single .crl file: which library it
 * belongs to, what kind of declaration it is, where it lives.
 */
export interface IndexedDeclaration {
  /** The quoted name as written, without surrounding quotes. */
  name: string;
  kind: "concept" | "terminology" | "decision" | "activity";
  /** The library this declaration belongs to. */
  libraryName: string;
  /** Absolute path of the .crl file containing the declaration. */
  filePath: string;
  /** 0-based line of the declaration header. */
  line: number;
  /** Concept-only: declared `type is X.` */
  type?: string;
  /** Concept-only: declared `valuetype is X.` */
  valuetype?: string;
  /** First body bullet text for hover preview. */
  bodyPreview?: string;
}

/**
 * Cached per-project state. Keyed by canonical projectRoot path.
 */
interface CachedProject {
  projectRoot: string;
  graph: ResolvedGraph;
  declarations: IndexedDeclaration[];
  /** Set of file paths the validator touched on the last validate pass. */
  knownFilePaths: Set<string>;
}

/**
 * Singleton-ish index that:
 *   - maintains an overlay map of in-memory editor text (keyed by absolute path)
 *   - finds project roots with a CRL-project guard (rejects "stray package.json
 *     above an orphan .crl" false positives)
 *   - caches `resolveImports` results per project root
 *   - enumerates IndexedDeclarations from the cached graph for completion + hover
 *
 * Cache invalidation policy:
 *   - manual: `invalidate(projectRoot)` clears one project
 *   - manual: `invalidateAll()` clears everything (used by file-system events
 *     and the `CRL: Refresh project cache` command)
 *   - the extension calls `invalidate` from onDidChangeTextDocument /
 *     onDidSaveTextDocument / onDidCloseTextDocument / file watcher events
 *     before re-asking for the graph
 */
export class ProjectIndex {
  /** Absolute canonical path → in-memory editor text. */
  private readonly overlays = new Map<string, string>();
  /** projectRoot → cached graph + declarations. */
  private readonly cache = new Map<string, CachedProject>();

  /**
   * Push or update an open editor's in-memory text. The next `getGraph`
   * for any project containing this file will read the overlay text
   * instead of the disk content.
   *
   * The overlay key is the canonical absolute path with the drive letter
   * uppercased — this matches Windows `fs.readdirSync` behavior (which
   * returns canonical case) and prevents drive-letter case mismatch when
   * VS Code's `uri.fsPath` lowercases the drive letter on some hosts.
   */
  setOverlay(absPath: string, text: string): void {
    const canonical = canonicalize(absPath);
    this.overlays.set(canonical, text);
    // Invalidate caches that could include this file. Today we don't track
    // per-project file membership before the first scan, so clear all
    // caches; future optimization can scope to projects whose
    // `knownFilePaths` includes the changed path.
    this.cache.clear();
  }

  /** Remove an overlay (called when the editor closes the file). */
  clearOverlay(absPath: string): void {
    const canonical = canonicalize(absPath);
    if (this.overlays.delete(canonical)) {
      this.cache.clear();
    }
  }

  /** Read-only snapshot of the current overlay state. */
  getOverlays(): ReadonlyMap<string, string> {
    return this.overlays;
  }

  /**
   * Find the project root for a given .crl file, applying a CRL-project
   * guard: a `package.json` only counts as a project root if it either
   * (a) declares `crl.libraries`, OR (b) the discovered project root
   * directory contains 2+ `.crl` files. Otherwise return null and let
   * callers fall back to single-file mode.
   *
   * This prevents `findProjectRoot` from walking up into a stray
   * `~/projects/package.json` for an orphan .crl file.
   */
  getProjectRoot(filePath: string): string | null {
    const root = findProjectRoot(path.resolve(filePath));
    if (root === null) return null;
    if (isCrlProject(root)) return root;
    return null;
  }

  /**
   * Get or build the cached `ResolvedGraph` for the project containing
   * the given file. Returns null when no CRL project is reachable
   * (orphan file).
   */
  getGraph(filePath: string): ResolvedGraph | null {
    const projectRoot = this.getProjectRoot(filePath);
    if (projectRoot === null) return null;
    const cached = this.cache.get(projectRoot);
    if (cached) return cached.graph;

    // Resolve from the file's own perspective so its root semantics are
    // preserved (root vs sibling).
    const graph = resolveImports(path.resolve(filePath), { overlays: this.overlays });
    const declarations = enumerateDeclarations(graph);
    const knownFilePaths = collectKnownFilePaths(graph);
    this.cache.set(projectRoot, { projectRoot, graph, declarations, knownFilePaths });
    return graph;
  }

  /**
   * Enumerate all declarations visible to the project that owns this
   * file. Empty for orphan files. Includes concept + terminology +
   * decision + activity from every library in the resolved graph and
   * any non-included local siblings.
   */
  getDeclarations(filePath: string): IndexedDeclaration[] {
    const graph = this.getGraph(filePath);
    if (graph === null) return [];
    const cached = this.cache.get(this.getProjectRoot(filePath) ?? "");
    return cached?.declarations ?? [];
  }

  /**
   * File paths the last `getGraph` for this project touched. Used by
   * diagnostics to compute the stale-URI cleanup diff.
   */
  getKnownFilePaths(filePath: string): Set<string> {
    const projectRoot = this.getProjectRoot(filePath);
    if (projectRoot === null) return new Set();
    const cached = this.cache.get(projectRoot);
    return cached?.knownFilePaths ?? new Set();
  }

  /** Invalidate one project's cache. */
  invalidate(projectRoot: string): void {
    this.cache.delete(projectRoot);
  }

  /** Invalidate every project's cache. */
  invalidateAll(): void {
    this.cache.clear();
  }
}

/**
 * "Does this directory look like a CRL project?" Returns true if either:
 *   - the directory's package.json has a `crl.libraries` field, OR
 *   - the directory contains 2+ `.crl` files (recursively, skipping
 *     node_modules + dist + build)
 *
 * This prevents `findProjectRoot` from claiming an unrelated parent
 * `package.json` as the CRL project root for an orphan .crl file.
 */
function isCrlProject(projectRoot: string): boolean {
  // Check (a): crl.libraries in package.json.
  try {
    const pkgPath = path.join(projectRoot, "package.json");
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { crl?: { libraries?: unknown } };
    if (pkg.crl && Array.isArray(pkg.crl.libraries)) return true;
  } catch {
    // Missing or malformed package.json — fall through to (b).
  }

  // Check (b): 2+ .crl files in the project.
  let count = 0;
  try {
    countCrlFiles(projectRoot, (n) => {
      count = n;
      return n >= 2; // early-exit signal
    });
  } catch {
    // Filesystem errors → not a CRL project.
    return false;
  }
  return count >= 2;
}

const SKIP_DIRS = new Set(["node_modules", "dist", "build"]);

/**
 * Count .crl files in `dir` recursively. The `tick` callback receives
 * the running count after each find; if it returns true, recursion
 * stops early (used to bail at >=2 for the CRL-project guard).
 */
function countCrlFiles(dir: string, tick: (count: number) => boolean): void {
  let count = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith(".crl")) {
        count++;
        if (tick(count)) return;
      }
    }
  }
  tick(count);
}

/**
 * Walk the resolved graph's libraries (root closure + non-included local
 * siblings) and enumerate every declaration as an IndexedDeclaration.
 * Uses the parsed AST directly — no regex.
 */
function enumerateDeclarations(graph: ResolvedGraph): IndexedDeclaration[] {
  const out: IndexedDeclaration[] = [];
  const seen = new Set<string>();
  const collect = (entries: RegistryEntry[]): void => {
    for (const entry of entries) {
      if (seen.has(entry.filePath)) continue;
      seen.add(entry.filePath);
      if (entry.name === null || entry.name === "") continue;
      for (const stmt of entry.ast.statements) {
        if (!stmt.name) continue;
        const base: Omit<IndexedDeclaration, "kind"> = {
          name: stmt.name,
          libraryName: entry.name,
          filePath: entry.filePath,
          line: Math.max(0, (stmt.location?.start.line ?? 1) - 1),
        };
        switch (stmt.type) {
          case "Concept":
            out.push({
              ...base,
              kind: "concept",
              ...(stmt.conceptType ? { type: stmt.conceptType } : {}),
              ...(stmt.valueTypes?.[0] ? { valuetype: stmt.valueTypes[0] } : {}),
              bodyPreview: describeConceptBody(stmt.definition),
            });
            break;
          case "Terminology":
            out.push({ ...base, kind: "terminology" });
            break;
          case "Decision":
            out.push({ ...base, kind: "decision" });
            break;
          case "Activity":
            out.push({ ...base, kind: "activity" });
            break;
        }
      }
    }
  };
  collect(graph.resolvedLibraries);
  collect(graph.localLibraries);
  return out;
}

function describeConceptBody(def: unknown): string | undefined {
  if (!def || typeof def !== "object") return undefined;
  const d = def as { type?: string };
  switch (d.type) {
    case "CodedFromDefinition":
      return "coded from ...";
    case "DefinedAsDefinition":
      return "defined as ...";
    case "DefinitionIsDefinition":
      return "definition is ...";
    default:
      return undefined;
  }
}

function collectKnownFilePaths(graph: ResolvedGraph): Set<string> {
  const out = new Set<string>();
  for (const e of graph.resolvedLibraries) out.add(e.filePath);
  for (const e of graph.localLibraries) out.add(e.filePath);
  return out;
}

/**
 * Canonicalize a file path for use as an overlay-map key. `path.resolve`
 * normalizes slashes and `..`, but on Windows the drive letter case can
 * still differ between `uri.fsPath` callers (sometimes lowercase) and
 * `readdirSync`-walked paths (always uppercase). Uppercasing the drive
 * letter here makes both callers and the package-side scanner agree on
 * the key.
 */
function canonicalize(absPath: string): string {
  const resolved = path.resolve(absPath);
  if (process.platform === "win32" && /^[a-z]:/.test(resolved)) {
    return resolved.charAt(0).toUpperCase() + resolved.slice(1);
  }
  return resolved;
}
