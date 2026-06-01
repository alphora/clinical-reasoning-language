import { readFileSync } from "fs";
import * as path from "path";

import type { CRL, Statement } from "../ast/types";
import { emitCQLFromAST } from "../emitter/emitCQL";
import type { EmitOptions } from "../emitter/emitCQL";
import type { CRLError } from "../types/errors";

import { resolveImports } from "./index";
import { ImportDiagnostic, ResolvedGraph } from "./types";

// v0.7 emit strategy: FLAT-INLINE. All transitive declarations from the
// resolved include graph are flattened into one synthetic CRL AST and
// emitted as a single CQL library. Per-library emit deferred to v0.8.
//
// CRL has no source-level version syntax — npm packaging handles versioning.
// The emitted CQL library's `library X version 'Y'` line uses, in priority:
//   1. explicit options.libraryVersion if provided,
//   2. the project root's package.json `version` field,
//   3. EmitOptions default ("0.1.0").

export interface EmitImportsResult {
  success: boolean;
  graph: ResolvedGraph;
  importDiagnostics: ImportDiagnostic[];
  cql?: string;
  // Populated only on EMITTER exception (not on import-side failures, which
  // surface via importDiagnostics).
  errors?: CRLError[];
}

function readPackageVersion(projectRoot: string | undefined): string | undefined {
  if (!projectRoot) return undefined;
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf-8"),
    ) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

export function emitCQLImports(
  rootPath: string,
  options: EmitOptions = {},
): EmitImportsResult {
  const graph: ResolvedGraph = resolveImports(rootPath);

  if (graph.resolvedLibraries.length === 0) {
    return {
      success: false,
      graph,
      importDiagnostics: graph.diagnostics,
    };
  }

  // Short-circuit on error-severity import diagnostics.
  const errorDiags = graph.diagnostics.filter((d) => d.severity === "error");
  if (errorDiags.length > 0) {
    return {
      success: false,
      graph,
      importDiagnostics: graph.diagnostics,
    };
  }

  // Flatten with first-wins-per-(kind, name) dedup.
  const seen = new Set<string>();
  const flatStatements: Statement[] = [];
  for (const entry of graph.resolvedLibraries) {
    for (const stmt of entry.ast.statements) {
      const key = `${stmt.type}|${stmt.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flatStatements.push(stmt);
    }
  }

  const rootEntry = graph.resolvedLibraries[graph.resolvedLibraries.length - 1];
  const rootAst = rootEntry.ast;
  const synthetic: CRL = {
    type: "CRL",
    ...(rootAst.header ? { header: rootAst.header } : {}),
    ...(rootAst.library ? { library: rootAst.library } : {}),
    includes: [],
    statements: flatStatements,
    location: rootAst.location,
  };

  // Default emit options:
  // - libraryName from root's `library "X".` declaration
  // - libraryVersion from project root's package.json (the npm package version
  //   IS the library version under the new model)
  // Explicit options always override.
  const packageVersion = readPackageVersion(graph.projectRoot);
  const merged: EmitOptions = {
    ...(rootAst.library?.name ? { libraryName: rootAst.library.name } : {}),
    ...(packageVersion ? { libraryVersion: packageVersion } : {}),
    ...options,
  };

  const emit = emitCQLFromAST(synthetic, merged);
  if (!emit.success || !emit.result) {
    return {
      success: false,
      graph,
      importDiagnostics: graph.diagnostics,
      errors: emit.errors,
    };
  }

  return {
    success: true,
    graph,
    importDiagnostics: graph.diagnostics,
    cql: emit.result,
  };
}
