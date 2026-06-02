import {
  ImportDiagnostic,
  Namespace,
  NamespaceEntry,
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
        // v2.1.0: cross-library same-name declarations are benign under
        // per-library scoping (each library has its own scope) and per-CRL
        // emit (each library emits its own CQL with its own namespace).
        // First-wins dedup is kept here only so the legacy flat `Namespace`
        // shape stays well-formed for any consumer still reading it; no
        // diagnostic fires. The legacy flat view itself is deprecated and
        // will be removed when consumers migrate to per-library `scopes`.
        continue;
      }

      map.set(name, newEntry);
    }
  }

  return { namespace, diagnostics };
}
