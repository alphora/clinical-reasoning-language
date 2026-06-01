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
      namespace: emptyNamespace(),
      diagnostics: [diag],
    };
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

  // The root file may also be in the local scan. Replace any same-path entry
  // (or same-name entry pointing at the root path) with the canonical root
  // entry so cycle detection and topo order treat root as one identity.
  if (rootAst.library) {
    registry.byName.set(rootAst.library.name, rootEntry);
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
    projectRoot,
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
  ProjectRootNotFoundDiagnostic,
  PackageResolutionFailureDiagnostic,
  RegistryDuplicateDiagnostic,
  UnresolvedIncludeDiagnostic,
  CycleDiagnostic,
  NameConflictDiagnostic,
} from "./types";

export { buildRegistry, findProjectRoot } from "./registry";
export { walkIncludes } from "./resolver";
export { buildCombinedNamespace } from "./namespace";
export { emptyNamespace } from "./types";
