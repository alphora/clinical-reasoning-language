import type { Include } from "../ast/types";

import {
  Registry,
  RegistryEntry,
  ImportDiagnostic,
  CycleDiagnostic,
  UnresolvedIncludeDiagnostic,
  AmbiguousIncludeDiagnostic,
} from "./types";

export function walkIncludes(
  rootEntry: RegistryEntry,
  registry: Registry,
): { resolvedLibraries: RegistryEntry[]; diagnostics: ImportDiagnostic[] } {
  const activeStack: string[] = [];      // ordered for cycle path reporting
  const activeSet = new Set<string>();
  const visited = new Set<string>();
  const out: RegistryEntry[] = [];
  const diagnostics: ImportDiagnostic[] = [];

  // Parallel chain of includes that led us to each active-stack entry.
  // includeChain[i] is the include statement in activeStack[i-1] that
  // brought us to activeStack[i]. There is no include leading to the root.
  const activeIncludes: (Include | null)[] = [];

  function visit(entry: RegistryEntry, viaInclude: Include | null): void {
    if (visited.has(entry.filePath)) return;

    if (activeSet.has(entry.filePath)) {
      // Build the cycle path: from where it appears in the stack to here.
      const startIdx = activeStack.indexOf(entry.filePath);
      const cyclePaths = activeStack.slice(startIdx).concat([entry.filePath]);
      const cycleIncludes: Include[] = [];
      for (let i = startIdx + 1; i < activeIncludes.length; i++) {
        const inc = activeIncludes[i];
        if (inc) cycleIncludes.push(inc);
      }
      if (viaInclude) cycleIncludes.push(viaInclude);

      const diag: CycleDiagnostic = {
        kind: "cycle",
        severity: "error",
        filePaths: cyclePaths,
        includeChain: cycleIncludes,
      };
      diagnostics.push(diag);
      return;
    }

    activeStack.push(entry.filePath);
    activeSet.add(entry.filePath);
    activeIncludes.push(viaInclude);

    for (const include of entry.ast.includes) {
      const candidates = registry.byName.get(include.name) ?? [];
      const filtered =
        include.version === undefined
          ? candidates
          : candidates.filter((c) => c.version === include.version);

      if (filtered.length === 0) {
        const diag: UnresolvedIncludeDiagnostic = {
          kind: "unresolved-include",
          severity: "error",
          include,
          from: {
            filePath: entry.filePath,
            ...(entry.name !== null ? { libraryName: entry.name } : {}),
          },
        };
        diagnostics.push(diag);
        continue;
      }

      if (filtered.length > 1) {
        const diag: AmbiguousIncludeDiagnostic = {
          kind: "ambiguous-include",
          severity: "error",
          include,
          from: {
            filePath: entry.filePath,
            ...(entry.name !== null ? { libraryName: entry.name } : {}),
          },
          candidates: filtered,
        };
        diagnostics.push(diag);
        continue;
      }

      visit(filtered[0], include);
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
