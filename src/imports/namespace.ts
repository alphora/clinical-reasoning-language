import {
  ImportDiagnostic,
  Namespace,
  NamespaceEntry,
  NameConflictDiagnostic,
  NodeKind,
  RegistryEntry,
  emptyNamespace,
} from "./types";

function mapForKind(ns: Namespace, kind: NodeKind): Map<string, NamespaceEntry> {
  switch (kind) {
    case "Concept":
      return ns.concepts;
    case "Decision":
      return ns.decisions;
    case "Activity":
      return ns.activities;
    case "Terminology":
      return ns.terminologies;
  }
}

export function buildCombinedNamespace(
  resolvedLibraries: RegistryEntry[],
): { namespace: Namespace; diagnostics: ImportDiagnostic[] } {
  const namespace = emptyNamespace();
  const diagnostics: ImportDiagnostic[] = [];

  for (const entry of resolvedLibraries) {
    for (const statement of entry.ast.statements) {
      const kind = statement.type as NodeKind;
      const name = statement.name;
      const map = mapForKind(namespace, kind);
      const existing = map.get(name);
      const newEntry: NamespaceEntry = {
        kind,
        libraryName: entry.name,
        filePath: entry.filePath,
        node: statement,
      };

      if (existing) {
        const diag: NameConflictDiagnostic = {
          kind: "name-conflict",
          severity: "error",
          name,
          nodeKind: kind,
          sources: [
            { libraryName: existing.libraryName, filePath: existing.filePath },
            { libraryName: newEntry.libraryName, filePath: newEntry.filePath },
          ],
        };
        diagnostics.push(diag);
        // leaves-win: keep the first registration
        continue;
      }

      map.set(name, newEntry);
    }
  }

  return { namespace, diagnostics };
}
