import { emitCrlTwoLane } from "./emit-two-lane";
import { buildEngineRepoBundle, cqlIndex, type RepoBundleResult } from "./results/repoBundle";
import { localCanonicalReview, type LocalCanonicalReviewProjection } from './results/localCanonicalReview';

export interface BundleDiagnostic {
  source: "emit" | "cql" | "fhir" | "bundle";
  severity: "error" | "warning";
  detail: unknown;
}
/** Exact source owners for host UI joins; separate from executable FHIR definitions. */
export interface DefinitionOrigin {
  canonical: string; version?: string; library: string; name: string; kind: NonNullable<import('./fhir-emitter/types').EmittedResource['sourceKind']>;
  decision?: import('./ast/types').Decision;
  conditions?: readonly import('./ast/guardDefines').SyntheticGuardDefine[];
  actions?: readonly import('./fhir-emitter/types').SourceActionBinding[];
}
export type EmitCrlBundleResult =
  | { success: true; bundle: RepoBundleResult["bundle"]; resourceCount: number; inlinedLibraries: string[]; diagnostics: BundleDiagnostic[]; definitionOrigins?: DefinitionOrigin[]; localReview?: LocalCanonicalReviewProjection }
  | { success: false; diagnostics: BundleDiagnostic[]; missingCql?: string[] };

/** REFACTOR:grounded (#111): definitions-only collection using the native repository
 * composition. No patient data, static Questionnaire generation, or filesystem writes. */
export function emitCrlBundle(filePath: string, options: NonNullable<Parameters<typeof emitCrlTwoLane>[1]> & { sourceOrigins?: boolean; localReview?: true } = {}): EmitCrlBundleResult {
  const { sourceOrigins, localReview, ...emitOptions } = options;
  const emitted = emitCrlTwoLane(filePath, emitOptions);
  const diagnostics: BundleDiagnostic[] = [
    ...emitted.hardErrors.map(detail => ({ source: "emit" as const, severity: "error" as const, detail })),
    ...emitted.warnings.map(detail => ({ source: "emit" as const, severity: "warning" as const, detail })),
    ...emitted.fhir.unmatched.map(detail => ({ source: "fhir" as const, severity: "error" as const, detail })),
    ...emitted.filenameCollisions.map(filename => ({ source: "cql" as const, severity: "error" as const,
      detail: { kind: "filename-collision", filename } })),
  ];
  // CQL can refuse with import diagnostics and no errors array. Keep that channel
  // even when the FHIR lane reports a different closure failure.
  for (const detail of emitted.cql.importDiagnostics) {
    if (!diagnostics.some(d => JSON.stringify(d.detail) === JSON.stringify(detail)))
      diagnostics.push({ source: "cql", severity: detail.severity === "error" ? "error" : "warning", detail });
  }
  if (!emitted.success) {
    if (!diagnostics.some(d => d.severity === "error")) diagnostics.push({ source: "emit", severity: "error",
      detail: { kind: "emit-failed", message: "The two-lane emitter refused this definition closure." } });
    return { success: false, diagnostics };
  }
  // REFACTOR:grounded: explicit MV-only projection; ordinary bundle emission remains the delivery graph.
  const review = localReview ? localCanonicalReview(emitted.fhir.resources, cqlIndex(emitted.cqlLibraries)) : undefined;
  const result = buildEngineRepoBundle({
    definitions: (review?.definitions ?? emitted.fhir.resources.map(r => r.resource)).map(resource => {
      if (typeof resource.resourceType !== "string") throw new Error("Emitted definition is missing resourceType.");
      return { ...resource, resourceType: resource.resourceType };
    }),
    cqlByLibraryFile: cqlIndex(emitted.cqlLibraries),
    caseInput: { caseName: "", resources: [] },
  });
  if (result.missingCql.length) return { success: false, missingCql: result.missingCql,
    diagnostics: [...diagnostics, { source: "bundle", severity: "error", detail: {
      kind: "missing-cql", libraries: result.missingCql,
    } }] };
  const definitionOrigins = emitted.fhir.resources.flatMap(r =>
    r.sourceLibraryName && r.sourceName && r.sourceKind && typeof r.resource.url === 'string'
      ? [{ canonical: r.resource.url, ...(typeof r.resource.version === 'string' ? { version: r.resource.version } : {}),
          library: r.sourceLibraryName, name: r.sourceName, kind: r.sourceKind,
          ...(r.sourceDecision ? { decision: r.sourceDecision, conditions: r.sourceConditions, ...(r.sourceActions?.length ? { actions: r.sourceActions } : {}) } : {}) }] : []);
  return { success: true, bundle: result.bundle, resourceCount: result.bundle.entry.length, ...(sourceOrigins ? {definitionOrigins} : {}), ...(review?.projection ? { localReview: review.projection } : {}),
    inlinedLibraries: result.inlined, diagnostics };
}
