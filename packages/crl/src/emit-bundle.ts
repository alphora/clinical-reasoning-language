import { emitCrlTwoLane } from "./emit-two-lane";
import { buildEngineRepoBundle, cqlIndex, type RepoBundleResult } from "./results/repoBundle";

export interface BundleDiagnostic {
  source: "emit" | "cql" | "fhir" | "bundle";
  severity: "error" | "warning";
  detail: unknown;
}
export type EmitCrlBundleResult =
  | { success: true; bundle: RepoBundleResult["bundle"]; resourceCount: number; inlinedLibraries: string[]; diagnostics: BundleDiagnostic[] }
  | { success: false; diagnostics: BundleDiagnostic[]; missingCql?: string[] };

/** REFACTOR:grounded (#111): definitions-only collection using the native repository
 * composition. No patient data, static Questionnaire generation, or filesystem writes. */
export function emitCrlBundle(filePath: string, options: Parameters<typeof emitCrlTwoLane>[1] = {}): EmitCrlBundleResult {
  const emitted = emitCrlTwoLane(filePath, options);
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
  const result = buildEngineRepoBundle({
    definitions: emitted.fhir.resources.map(({ resource }) => {
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
  return { success: true, bundle: result.bundle, resourceCount: result.bundle.entry.length,
    inlinedLibraries: result.inlined, diagnostics };
}
