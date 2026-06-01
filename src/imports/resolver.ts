import type { Include } from "../ast/types";

import {
  Registry,
  RegistryEntry,
  ImportDiagnostic,
  CycleDiagnostic,
  UnresolvedIncludeDiagnostic,
} from "./types";

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
      const found = registry.byName.get(include.name);
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
