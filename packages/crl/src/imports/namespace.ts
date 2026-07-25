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
    case "Parameter":
      return ns.parameters;
  }
}

export function buildCombinedNamespace(
  resolvedLibraries: RegistryEntry[],
): { namespace: Namespace; diagnostics: ImportDiagnostic[] } {
  const namespace = emptyNamespace();
  const diagnostics: ImportDiagnostic[] = [];

  for (const entry of resolvedLibraries) {
    for (const statement of entry.ast.statements) {
      // #224 ii: a `criterion` has NO cross-library namespace entry — it is a
      // source-side, library-local guard macro (expanded away before emit), not a
      // `NodeKind`. Skip it so the `statement.type as NodeKind` cast below can't push
      // "Criterion" into `mapForKind` (which returns undefined → a `map.get` crash on
      // EVERY multi-file flow via `resolveImports`). Criterion name uniqueness / the
      // Concept-XOR-Criterion rule is the validator's job (ii.1a-2), not the namespace.
      if (statement.type === "Criterion") continue;
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
