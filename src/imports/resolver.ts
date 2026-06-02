import type { Include } from "../ast/types";

import {
  Registry,
  RegistryEntry,
  ImportDiagnostic,
  CycleDiagnostic,
  UnresolvedIncludeDiagnostic,
  AliasNotYetSupportedDiagnostic,
  RedundantLocalIncludeDiagnostic,
} from "./types";

/**
 * Resolve a single `include` declaration to a registry entry.
 *
 * Lookup precedence per discussion 030:
 *   - From `origin: "local" | "root"`: check `byNamePackage` first
 *     (`include` is external-only per v2.1.0 lock 026), fall back to
 *     `byNameLocal` for fixtures that still write `include "Sibling".`.
 *     Commit 2e adds a `redundant-local-include` warning when the local
 *     fallback path is hit.
 *   - From `origin: "package"`: check `byNamePackage` only. A package
 *     cannot depend on consumer-local libraries.
 *
 * Returns `undefined` if no match; the caller emits `unresolved-include`.
 */
interface IncludeResolution {
  entry: RegistryEntry;
  // True only when the package lookup MISSED and the local-fallback path
  // returned the result. The caller uses this to fire
  // `redundant-local-include` per v2.1.0 lock 026 (locals auto-resolve
  // without an `include`). Carrying the flag avoids reconstructing the
  // decision from `entry.origin` post-hoc, which would mis-fire when
  // package wins package-first while a local of the same name exists.
  viaLocalFallback: boolean;
}

function resolveIncludeTarget(
  from: RegistryEntry,
  includeName: string,
  registry: Registry,
): IncludeResolution | undefined {
  const pkg = registry.byNamePackage.get(includeName);
  if (pkg) return { entry: pkg, viaLocalFallback: false };
  if (from.origin === "local" || from.origin === "root") {
    const local = registry.byNameLocal.get(includeName);
    if (local) return { entry: local, viaLocalFallback: true };
  }
  return undefined;
}

export function walkIncludes(
  rootEntry: RegistryEntry,
  registry: Registry,
): { resolvedLibraries: RegistryEntry[]; diagnostics: ImportDiagnostic[] } {
  const activeStack: string[] = [];
  const activeSet = new Set<string>();
  const visited = new Set<string>();
  const out: RegistryEntry[] = [];
  const diagnostics: ImportDiagnostic[] = [];
  const activeIncludes: (Include | null)[] = [];

  function visit(entry: RegistryEntry, viaInclude: Include | null): void {
    if (visited.has(entry.filePath)) return;

    if (activeSet.has(entry.filePath)) {
      const startIdx = activeStack.indexOf(entry.filePath);
      const cyclePaths = activeStack.slice(startIdx).concat([entry.filePath]);
      const cycleIncludes: Include[] = [];
      for (let i = startIdx + 1; i < activeIncludes.length; i++) {
        const inc = activeIncludes[i];
        if (inc) cycleIncludes.push(inc);
      }
      if (viaInclude) cycleIncludes.push(viaInclude);
      diagnostics.push({
        kind: "cycle",
        severity: "error",
        filePaths: cyclePaths,
        includeChain: cycleIncludes,
      } as CycleDiagnostic);
      return;
    }

    activeStack.push(entry.filePath);
    activeSet.add(entry.filePath);
    activeIncludes.push(viaInclude);

    for (const include of entry.ast.includes) {
      // v2.1.0: alias clause parses + carries into AST but resolver doesn't
      // honor it yet. Emit a warning so users aren't silently surprised when
      // `include "Foo" as "Ext".` doesn't expose Ext. Full alias semantics
      // ship in v2.2.
      if (include.alias && entry.name !== null) {
        diagnostics.push({
          kind: "alias-not-yet-supported",
          severity: "warning",
          include,
          from: { filePath: entry.filePath, libraryName: entry.name },
        } as AliasNotYetSupportedDiagnostic);
      }

      const found = resolveIncludeTarget(entry, include.name, registry);
      if (!found) {
        diagnostics.push({
          kind: "unresolved-include",
          severity: "error",
          include,
          from: {
            filePath: entry.filePath,
            ...(entry.name !== null ? { libraryName: entry.name } : {}),
          },
        } as UnresolvedIncludeDiagnostic);
        continue;
      }
      // v2.1.0: warn when the include resolved via the local-fallback
      // path. Per lock 026, local siblings auto-resolve via qualified
      // refs without an `include`; writing `include "Sibling"` is
      // redundant scaffolding. Warning, not error — operators may still
      // be in the habit of writing them.
      if (found.viaLocalFallback && entry.name !== null) {
        diagnostics.push({
          kind: "redundant-local-include",
          severity: "warning",
          include,
          from: { filePath: entry.filePath, libraryName: entry.name },
        } as RedundantLocalIncludeDiagnostic);
      }
      visit(found.entry, include);
    }

    activeStack.pop();
    activeSet.delete(entry.filePath);
    activeIncludes.pop();
    visited.add(entry.filePath);
    out.push(entry);
  }

  visit(rootEntry, null);
  return { resolvedLibraries: out, diagnostics };
}
