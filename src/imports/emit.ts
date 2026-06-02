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
// The emitted CQL library declaration carries no version — npm packaging
// IS the version system, so emitting `library X version 'Y'` would just
// duplicate npm metadata in the output. The `using FHIR version` and
// `include FHIRHelpers/CRLPatterns version` lines stay because they're
// CQL syntax for pinning ITS own dependencies.

export interface EmitImportsResult {
  success: boolean;
  graph: ResolvedGraph;
  importDiagnostics: ImportDiagnostic[];
  cql?: string;
  // Populated only on EMITTER exception (not on import-side failures, which
  // surface via importDiagnostics).
  errors?: CRLError[];
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
    library: rootAst.library,
    includes: [],
    statements: flatStatements,
    location: rootAst.location,
  };

  // Default libraryName from root's `library "X".` declaration; explicit
  // options.libraryName always overrides. No version field — the emitted
  // CQL library declaration is unversioned.
  const merged: EmitOptions = {
    ...(rootAst.library?.name ? { libraryName: rootAst.library.name } : {}),
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
