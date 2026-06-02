import type { CRL, Statement } from "../ast/types";
import { Validator, ValidationError } from "../validator/validator";

import { resolveImports } from "./index";
import { buildLibraryScopes, SourceContext } from "./scopes";
import { ImportDiagnostic, ResolvedGraph } from "./types";

export interface ValidateImportsOptions {
  soft?: boolean;
  /**
   * In-memory overrides for file content, keyed by absolute canonical path.
   * Threaded through to `resolveImports` so editor callers (extension /
   * MCP / future LSP) can validate against open-but-unsaved buffers
   * without writing to disk.
   */
  overlays?: ReadonlyMap<string, string>;
}

export interface ValidateImportsResult {
  success: boolean;
  graph: ResolvedGraph;
  importDiagnostics: ImportDiagnostic[];
  validationErrors: ValidationError[];
  validationWarnings: ValidationError[];
}

export function validateCRLImports(
  rootPath: string,
  options: ValidateImportsOptions = {},
): ValidateImportsResult {
  const graph: ResolvedGraph = resolveImports(rootPath, { overlays: options.overlays });

  if (graph.resolvedLibraries.length === 0) {
    return {
      success: false,
      graph,
      importDiagnostics: graph.diagnostics,
      validationErrors: [],
      validationWarnings: [],
    };
  }

  // Build per-library scopes covering BOTH the include-walked closure AND
  // any non-included local siblings (per 030 round-1 disposition: locals
  // auto-resolve via qualified refs without `include` per v2.1.0 lock 026).
  // The graph's full registry feeds `knownLibraries` so a sibling's
  // `include "Pkg".` resolves even if root didn't transitively pull Pkg in.
  const registry = graph.registry ?? { byNameLocal: new Map(), byNamePackage: new Map() };
  const scopes = buildLibraryScopes(
    graph.resolvedLibraries,
    graph.localLibraries,
    registry,
  );

  // Build the per-statement source context list. Includes EVERY library's
  // statements, not just the include-walked closure — so cross-local cycles
  // and references to non-included siblings are validated.
  //
  // No first-wins (kind, name) dedup: under per-library scoping, the same
  // declaration name across libraries is benign and must be preserved for
  // per-library uniqueness + scoped resolution to work.
  const sources: SourceContext[] = [];
  const flatStatements: Statement[] = [];
  const allEntries = new Map<string, typeof graph.resolvedLibraries[number]>();
  for (const e of graph.resolvedLibraries) allEntries.set(e.filePath, e);
  for (const e of graph.localLibraries) {
    if (!allEntries.has(e.filePath)) allEntries.set(e.filePath, e);
  }
  for (const entry of allEntries.values()) {
    const scope = scopes.get(entry.filePath);
    if (!scope) continue;
    for (const stmt of entry.ast.statements) {
      flatStatements.push(stmt);
      sources.push({ stmt, entry, scope });
    }
  }

  // Build the synthetic flat AST the Validator iterates. Root entry is last
  // in resolvedLibraries; use its shell (header, library, location) so the
  // synthetic AST is well-typed.
  const rootEntry = graph.resolvedLibraries[graph.resolvedLibraries.length - 1];
  const synthetic: CRL = {
    type: "CRL",
    ...(rootEntry.ast.header ? { header: rootEntry.ast.header } : {}),
    library: rootEntry.ast.library,
    includes: [],
    statements: flatStatements,
    location: rootEntry.ast.location,
  };

  const validator = new Validator();
  const result = validator.validate(synthetic, { soft: options.soft }, sources);

  const importErrorSeverity = graph.diagnostics.filter((d) => d.severity === "error");
  const success = result.errors.length === 0 && importErrorSeverity.length === 0;

  return {
    success,
    graph,
    importDiagnostics: graph.diagnostics,
    validationErrors: result.errors,
    validationWarnings: result.warnings,
  };
}
