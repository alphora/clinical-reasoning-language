import { join } from "node:path";

import type { CRL, Statement } from "../ast/types";
import { resolveDispositionConfig } from "../dispositions";
import { Validator, ValidationError } from "../validator/validator";

import { resolveImports } from "./index";
import { findProjectRoot } from "./registry";
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

  // Resolve the project's PA disposition config (feature: configurable PA leaves) and thread it in — the Validator
  // is filesystem-free, so the project-aware caller supplies it. No project root / no config → the disposition
  // rules don't run; the closed-set enforcement is further gated on an EXPLICIT `options` block inside the resolver.
  const projectRoot = findProjectRoot(rootPath);
  const dispositionResolution = projectRoot ? resolveDispositionConfig(projectRoot) : undefined;
  const configHasErrors = (dispositionResolution?.errors ?? []).some((e) => e.severity === "error");
  // Enforce the closed set ONLY on a clean config — a broken config is surfaced below as a blocking diagnostic;
  // don't also pile closed-set errors on top of it (avoids a flood against a partial/empty set).
  const dispositionConfig = configHasErrors ? undefined : dispositionResolution?.config;

  const validator = new Validator();
  const result = validator.validate(synthetic, { soft: options.soft, dispositionConfig }, sources);

  // Surface disposition-config problems as (package.json-anchored) import diagnostics — a malformed config MUST NOT
  // silently disable the guardrail. Error-severity ones block validation via the success check below.
  const pkgPath = projectRoot ? join(projectRoot, "package.json") : "";
  const configDiagnostics: ImportDiagnostic[] = (dispositionResolution?.errors ?? []).map((e) => ({
    kind: "disposition-config",
    severity: e.severity,
    filePath: pkgPath,
    configKind: e.kind,
    path: e.path,
    message: `crl.dispositions${e.path.length ? "." + e.path.join(".") : ""}: ${e.message}`,
  }));
  const allDiagnostics: ImportDiagnostic[] = [...graph.diagnostics, ...configDiagnostics];

  const importErrorSeverity = allDiagnostics.filter((d) => d.severity === "error");
  const success = result.errors.length === 0 && importErrorSeverity.length === 0;

  return {
    success,
    graph,
    importDiagnostics: allDiagnostics,
    validationErrors: result.errors,
    validationWarnings: result.warnings,
  };
}
