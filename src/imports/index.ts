import { readFileSync } from "fs";
import * as path from "path";

import { buildCRL } from "../index";

import { buildCombinedNamespace } from "./namespace";
import { buildRegistry, findProjectRoot } from "./registry";
import { walkIncludes } from "./resolver";
import {
  ImportDiagnostic,
  ParseFailureDiagnostic,
  ProjectRootNotFoundDiagnostic,
  RegistryEntry,
  ResolvedGraph,
  emptyNamespace,
} from "./types";

export function resolveImports(rootPath: string): ResolvedGraph {
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
      localLibraries: [],
      namespace: emptyNamespace(),
      diagnostics: [diag],
    } as ResolvedGraph;
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
      localLibraries: [],
      namespace: emptyNamespace(),
      diagnostics: [diag],
    } as ResolvedGraph;
  }

  const projectRoot = findProjectRoot(canonicalRoot);
  if (projectRoot === null) {
    const diag: ProjectRootNotFoundDiagnostic = {
      kind: "project-root-not-found",
      severity: "error",
      fromPath: canonicalRoot,
    };
    return {
      rootPath: canonicalRoot,
      resolvedLibraries: [],
      localLibraries: [],
      namespace: emptyNamespace(),
      diagnostics: [diag],
    } as ResolvedGraph;
  }

  const rootAst = parsed.result;
  const rootEntry: RegistryEntry = {
    name: rootAst.library?.name ?? null,
    filePath: canonicalRoot,
    ast: rootAst,
    isRoot: true,
    origin: "root",
  };

  const { registry, diagnostics: registryDiags } = buildRegistry(projectRoot);

  // The root file is also seen by the local scan. Replace the scan's entry
  // (same path) with the canonical root entry so cycle detection and topo
  // order treat root as one identity. Guard on non-empty name (placeholder
  // post-parse-error) and on same-path: if `byNameLocal[rootName]` exists at
  // a DIFFERENT path, that's a local-vs-local name collision and the
  // registry-duplicate diagnostic already fired — don't silently overwrite.
  if (rootAst.library && rootAst.library.name !== "") {
    const existing = registry.byNameLocal.get(rootAst.library.name);
    if (!existing || existing.filePath === rootEntry.filePath) {
      registry.byNameLocal.set(rootAst.library.name, rootEntry);
    }
  }

  const { resolvedLibraries, diagnostics: resolverDiags } = walkIncludes(
    rootEntry,
    registry,
  );

  // Surface every local-origin library NOT include-walked from root as an
  // implicit local. 2c's scope-builder + 2d's per-CRL emit consume this set;
  // 2b emit/validate paths still iterate `resolvedLibraries` only, so this
  // is a non-behavior-change additive field for now. Path-sort with byte
  // comparison for determinism (no locale dependence).
  const walkedPaths = new Set(resolvedLibraries.map((e) => e.filePath));
  const localLibraries = Array.from(registry.byNameLocal.values())
    .filter((e) => !walkedPaths.has(e.filePath))
    .sort((a, b) => (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0));

  const { namespace, diagnostics: namespaceDiags } =
    buildCombinedNamespace(resolvedLibraries);

  const diagnostics: ImportDiagnostic[] = [
    ...registryDiags,
    ...resolverDiags,
    ...namespaceDiags,
  ];

  return {
    rootPath: canonicalRoot,
    projectRoot,
    resolvedLibraries,
    localLibraries,
    registry,
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
  ProjectRootNotFoundDiagnostic,
  PackageResolutionFailureDiagnostic,
  RegistryDuplicateDiagnostic,
  UnresolvedIncludeDiagnostic,
  CycleDiagnostic,
  NameConflictDiagnostic,
  AliasNotYetSupportedDiagnostic,
  RedundantLocalIncludeDiagnostic,
} from "./types";

export { buildRegistry, findProjectRoot } from "./registry";
export { walkIncludes } from "./resolver";
export { buildCombinedNamespace } from "./namespace";
export { emptyNamespace } from "./types";
