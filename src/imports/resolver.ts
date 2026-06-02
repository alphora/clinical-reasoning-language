import type { Include } from "../ast/types";

import {
  Registry,
  RegistryEntry,
  ImportDiagnostic,
  CycleDiagnostic,
  UnresolvedIncludeDiagnostic,
  AliasNotYetSupportedDiagnostic,
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
function resolveIncludeTarget(
  from: RegistryEntry,
  includeName: string,
  registry: Registry,
): RegistryEntry | undefined {
  const pkg = registry.byNamePackage.get(includeName);
  if (pkg) return pkg;
  if (from.origin === "local" || from.origin === "root") {
    return registry.byNameLocal.get(includeName);
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
      visit(found, include);
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
