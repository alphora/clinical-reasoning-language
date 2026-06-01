import { readFileSync } from "fs";
import * as path from "path";

import { buildCRL } from "../index";

import { buildCombinedNamespace } from "./namespace";
import { scanSourcePaths } from "./registry";
import { walkIncludes } from "./resolver";
import {
  ImportDiagnostic,
  ParseFailureDiagnostic,
  RegistryEntry,
  ResolvedGraph,
  emptyNamespace,
} from "./types";

export function resolveImports(
  rootPath: string,
  explicitSourcePaths: string[] = [],
): ResolvedGraph {
  const canonicalRoot = path.resolve(rootPath);

  let rootSource: string;
  try {
    rootSource = readFileSync(canonicalRoot, "utf-8");
  } catch (err) {
    const diag: ParseFailureDiagnostic = {
      kind: "parse-failure",
      severity: "error",
      filePath: canonicalRoot,
      errors: [
        {
          type: "Exception",
          message: err instanceof Error ? err.message : String(err),
        },
      ],
    };
    return {
      rootPath: canonicalRoot,
      resolvedLibraries: [],
      namespace: emptyNamespace(),
      diagnostics: [diag],
    };
  }

  const parsed = buildCRL(rootSource);
  if (!parsed.success || !parsed.result) {
    const diag: ParseFailureDiagnostic = {
      kind: "parse-failure",
      severity: "error",
      filePath: canonicalRoot,
      errors: parsed.errors ?? [],
    };
    return {
      rootPath: canonicalRoot,
      resolvedLibraries: [],
      namespace: emptyNamespace(),
      diagnostics: [diag],
    };
  }

  const rootAst = parsed.result;
  const rootEntry: RegistryEntry = {
    name: rootAst.library?.name ?? null,
    ...(rootAst.library?.version !== undefined
      ? { version: rootAst.library.version }
      : {}),
    filePath: canonicalRoot,
    ast: rootAst,
    isRoot: true,
  };

  const implicitDir = path.dirname(canonicalRoot);
  const sourcePathInputs = [
    ...explicitSourcePaths.map((p) => ({ path: p, implicit: false })),
    { path: implicitDir, implicit: true },
  ];

  const { registry, diagnostics: registryDiags } = scanSourcePaths(sourcePathInputs);

  // The root's library (if it has one) takes precedence over a registry entry
  // pointing at the same file. Replace the same-path entry with the canonical
  // root entry so includes back to root resolve to the same object (cycle
  // detection compares filePath, but other consumers want object identity).
  if (rootAst.library) {
    const sameNameEntries = registry.byName.get(rootAst.library.name) ?? [];
    const filtered = sameNameEntries.filter((e) => e.filePath !== canonicalRoot);
    registry.byName.set(rootAst.library.name, [rootEntry, ...filtered]);
  }

  const { resolvedLibraries, diagnostics: resolverDiags } = walkIncludes(
    rootEntry,
    registry,
  );

  const { namespace, diagnostics: namespaceDiags } =
    buildCombinedNamespace(resolvedLibraries);

  const diagnostics: ImportDiagnostic[] = [
    ...registryDiags,
    ...resolverDiags,
    ...namespaceDiags,
  ];

  return {
    rootPath: canonicalRoot,
    resolvedLibraries,
    namespace,
    diagnostics,
  };
}

export type {
  ResolvedGraph,
  RegistryEntry,
  Registry,
  Namespace,
  NamespaceEntry,
  NodeKind,
  ImportDiagnostic,
  ParseFailureDiagnostic,
  RegistryDuplicateDiagnostic,
  UnresolvedIncludeDiagnostic,
  AmbiguousIncludeDiagnostic,
  CycleDiagnostic,
  NameConflictDiagnostic,
} from "./types";

export { scanSourcePaths } from "./registry";
export { walkIncludes } from "./resolver";
export { buildCombinedNamespace } from "./namespace";
export { emptyNamespace } from "./types";
