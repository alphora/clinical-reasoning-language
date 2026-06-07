import type {
  CRL,
  Concept,
  CompositionExpression,
  DefinedAsComposition,
  NarrativeClause,
  NarrativeElement,
  ArgValue,
  ReferenceName,
} from "../ast/types";
import { getRefLibrary, isQualifiedRef } from "../ast/types";
import { emitCQLFromAST, infoForParameterStatement } from "../cql-emitter/emitCQL";
import type { AstParameterInfo } from "../cql-emitter/emitCQL";
import type { CRLError } from "../types/errors";

import { resolveImports } from "./index";
import { buildLibraryScopes, lookupKnownLibrary } from "./scopes";
import { ImportDiagnostic, RegistryEntry, ResolvedGraph } from "./types";

/**
 * Per-CRL emit (v2.1.0): one CQL file per CRL library.
 *
 * Each library in the emit closure produces its own `<libraryName>.cql` with
 * its own `library X` header, native `include FHIRHelpers`/`include CRLCommon`
 * lines, AND native CQL `include OtherLib` for every CRL library it
 * qualified-refs. Cross-library refs `"Lib"."X"` in CRL emit as CQL's native
 * `Lib."X"`. No more flat-inlining; same-name across libraries is now benign
 * because each library lives in its own CQL namespace.
 *
 * Emit closure rules:
 *   - Always include the include-walked closure from root (`graph.resolvedLibraries`).
 *   - ADDITIONALLY include any local-origin sibling library (`graph.localLibraries`)
 *     transitively referenced via qualified refs from any already-included
 *     library. Under v2.1.0 lock 026, locals auto-resolve without an explicit
 *     `include`, so they belong in the emit closure even when not walked.
 *   - Packages NOT in `graph.resolvedLibraries` (i.e., qualified-referenced
 *     without an `include`) are NOT emitted — `external-library-not-included`
 *     would have fired during validate.
 */

export interface PerLibraryEmit {
  libraryName: string;
  filePath: string;
  // Sanitized filename suitable for use in `--out-dir`. Currently just the
  // raw library name with `.cql` appended; safety enforced by
  // `safeOutputFilename`.
  outputFilename: string;
  cql: string;
}

export interface EmitImportsResult {
  success: boolean;
  graph: ResolvedGraph;
  importDiagnostics: ImportDiagnostic[];
  // One emit per library in the per-CRL closure. Each entry is a complete
  // CQL library file. Empty on failure.
  cqlByLibrary: PerLibraryEmit[];
  errors?: CRLError[];
}

// safeOutputFilename factored to ./safeOutputFilename so the CRL→FHIR-def
// emit lane (#73) can derive matching <libraryName>.cql filenames for
// Library.content[0].attachment.url.
import { safeOutputFilename } from "./safeOutputFilename";
// Ref-walking + closure expansion factored to ./computeEmitClosure so the
// CRL→FHIR-def lane can compute its own strict-superset closure (Todo 4 of #73).
import { collectCqlEmitRefs, computeCqlEmitClosure } from "./computeEmitClosure";
import type { LibraryScope } from "./scopes";

function collectCrossLibraryRefs(entry: RegistryEntry): Set<string> {
  // 2nd arg unused by the CQL collector but required by the shared signature
  return collectCqlEmitRefs(entry, undefined as unknown as LibraryScope);
}

/**
 * v2.2 Todo 3 (issue #59) — build per-library AST parameter index for
 * cross-library qualified-ref resolution in the emitter. Mirrors the
 * Emitter's own `indexNames` second pass: concept-first shadow rule (a
 * parameter is omitted from this map when a same-named concept exists in
 * the same library).
 *
 * Returned shape: outer Map keyed by library NAME (the qualifier string used
 * in `arg.library`); inner Map keyed by parameter name → info.
 */
function buildAstParameterIndex(emitClosure: RegistryEntry[]): Map<string, Map<string, AstParameterInfo>> {
  const out = new Map<string, Map<string, AstParameterInfo>>();
  for (const entry of emitClosure) {
    if (!entry.name) continue;
    const conceptNames = new Set<string>();
    for (const stmt of entry.ast.statements) {
      if (stmt.type === "Concept" && stmt.name) conceptNames.add(stmt.name);
    }
    const map = new Map<string, AstParameterInfo>();
    for (const stmt of entry.ast.statements) {
      if (stmt.type !== "Parameter" || !stmt.name) continue;
      if (conceptNames.has(stmt.name)) continue;
      map.set(stmt.name, infoForParameterStatement(stmt));
    }
    if (map.size > 0) out.set(entry.name, map);
  }
  return out;
}

export function emitCQLImports(rootPath: string): EmitImportsResult {
  const graph: ResolvedGraph = resolveImports(rootPath);

  if (graph.resolvedLibraries.length === 0) {
    return {
      success: false,
      graph,
      importDiagnostics: graph.diagnostics,
      cqlByLibrary: [],
    };
  }

  const errorDiags = graph.diagnostics.filter((d) => d.severity === "error");
  if (errorDiags.length > 0) {
    return {
      success: false,
      graph,
      importDiagnostics: graph.diagnostics,
      cqlByLibrary: [],
    };
  }

  // Compute the emit closure via the factored shared expander
  // (CRL→FHIR-def consumes a strict-superset variant). Scope-aware ref
  // resolution preserves v2.1.0 lookup precedence (local-first for non-
  // explicit-include refs).
  const emitClosure = computeCqlEmitClosure(graph);

  // v2.2 Todo 3 (issue #59) — index every emitted library's AST parameters
  // once so per-library emit can resolve qualified context-parameter refs.
  const crossLibraryParameters = buildAstParameterIndex(emitClosure);

  // Emit each library independently.
  const cqlByLibrary: PerLibraryEmit[] = [];
  for (const entry of emitClosure) {
    // Skip parse-error placeholders (`null` name or empty-string library
    // synthesized after a parse error). The parse-failure diagnostic is
    // the real signal; emitting a library without a name would produce
    // invalid CQL.
    if (entry.name === null || entry.name === "") continue;
    const crossLibs = Array.from(collectCrossLibraryRefs(entry)).sort();
    const synthetic: CRL = {
      type: "CRL",
      ...(entry.ast.header ? { header: entry.ast.header } : {}),
      library: entry.ast.library,
      // Drop the AST's `include` lines — under per-CRL emit the include set
      // is decided by qualified-ref discovery, not by source `include` lines
      // (which under 026 are package-only and may not cover every needed
      // cross-library ref).
      includes: [],
      statements: entry.ast.statements,
      location: entry.ast.location,
    };
    let outputFilename: string;
    try {
      outputFilename = safeOutputFilename(entry.name);
    } catch (e) {
      return {
        success: false,
        graph,
        importDiagnostics: graph.diagnostics,
        cqlByLibrary: [],
        errors: [{ type: "Exception", message: e instanceof Error ? e.message : String(e) }],
      };
    }
    const emit = emitCQLFromAST(synthetic, {
      libraryName: entry.name,
      crossLibraryIncludes: crossLibs,
      crossLibraryParameters,
    });
    if (!emit.success || !emit.result) {
      return {
        success: false,
        graph,
        importDiagnostics: graph.diagnostics,
        cqlByLibrary: [],
        errors: emit.errors,
      };
    }
    cqlByLibrary.push({
      libraryName: entry.name,
      filePath: entry.filePath,
      outputFilename,
      cql: emit.result,
    });
  }

  return {
    success: true,
    graph,
    importDiagnostics: graph.diagnostics,
    cqlByLibrary,
  };
}
