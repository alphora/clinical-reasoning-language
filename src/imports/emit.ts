import type { CRL, Statement } from "../ast/types";
import { emitCQLFromAST } from "../emitter/emitCQL";
import type { EmitOptions } from "../emitter/emitCQL";
import type { CRLError } from "../types/errors";

import { resolveImports } from "./index";
import {
  ImportDiagnostic,
  ParseFailureDiagnostic,
  ResolvedGraph,
  emptyNamespace,
} from "./types";

// v0.7 emit strategy: FLAT-INLINE. All transitive declarations from the
// resolved include graph are flattened into one synthetic CRL AST and
// emitted as a single CQL library. This matches the spec at
// `issues/crl/todo/imports/description.md` ("Emit: flat-inline imported
// declarations into the importing file's CQL output").
//
// Per-library emit (N CRL files → N CQL libraries with CQL `include`
// statements) is deferred to v0.8 if ever needed.
//
// CRLPatterns version is shared across the whole emit — CRL has no per-
// library CRLPatterns version declaration today, so EmitOptions.
// crlPatternsVersion (default "0.2.0") applies to everything.

export interface EmitImportsResult {
  // success === true iff no error-severity import diagnostics AND emit succeeded.
  success: boolean;
  graph: ResolvedGraph;
  // Convenience: same data as graph.diagnostics, lifted for caller ergonomics.
  importDiagnostics: ImportDiagnostic[];
  // Present when success === true.
  cql?: string;
  // Present only on EMITTER exception (not on import-side failures —
  // those surface via importDiagnostics). Disambiguates the two failure modes.
  errors?: CRLError[];
}

export function emitCQLImports(
  rootPath: string,
  sourcePaths: string[] = [],
  options: EmitOptions = {},
): EmitImportsResult {
  let graph: ResolvedGraph;
  try {
    graph = resolveImports(rootPath, sourcePaths);
  } catch (err) {
    // scanSourcePaths throws on missing explicit source path; convert to
    // synthetic parse-failure (severity error) so callers always get a result.
    const diag: ParseFailureDiagnostic = {
      kind: "parse-failure",
      severity: "error",
      filePath: rootPath,
      errors: [
        {
          type: "Exception",
          message: err instanceof Error ? err.message : String(err),
        },
      ],
    };
    return {
      success: false,
      graph: {
        rootPath,
        resolvedLibraries: [],
        namespace: emptyNamespace(),
        diagnostics: [diag],
      },
      importDiagnostics: [diag],
    };
  }

  if (graph.resolvedLibraries.length === 0) {
    return {
      success: false,
      graph,
      importDiagnostics: graph.diagnostics,
    };
  }

  // Short-circuit on error-severity import diagnostics. Don't emit a CQL
  // library with unresolved cross-file refs, cycles, or unresolved includes.
  const errorDiags = graph.diagnostics.filter((d) => d.severity === "error");
  if (errorDiags.length > 0) {
    return {
      success: false,
      graph,
      importDiagnostics: graph.diagnostics,
    };
  }

  // Flatten with first-wins-per-(kind, name) dedup. Matches Todo 3's
  // validator pattern: leaves come first in topo order (resolver post-order),
  // so leaf declarations win on conflict. The resolver already emitted
  // `name-conflict` diagnostics for any duplicates; this dedup just keeps
  // the AST consistent with what the validator sees.
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

  // Default emit options from root library identity (override via explicit options).
  const merged: EmitOptions = {
    ...(rootAst.library?.name ? { libraryName: rootAst.library.name } : {}),
    ...(rootAst.library?.version ? { libraryVersion: rootAst.library.version } : {}),
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
