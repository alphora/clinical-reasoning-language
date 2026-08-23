// #189 / disc 495 Q6 — the LANE-NEUTRAL authority for "which FHIR resource types the emitter backs as a
// CASE-FEATURE datum." It lives in `fhir-model/` (a model-fact layer), NOT in `emit/`, precisely so BOTH lanes
// can consult it: the EMIT lane (via the registry) and the VALIDATE lane (`validate_crl`'s emit-capability
// warning). The validate lane MUST NOT import `emit/resourceEmitRegistry` — that boundary is mechanically
// enforced (`emit/tests/effectiveRepresentation.test.ts`: the registry may be imported only by two sanctioned
// emit sites). A shared import across the boundary is therefore impossible, so this neutral set is the single
// LOGICAL authority, and `resourceEmitRegistry`'s per-row `caseFeature: true` flags are kept in lock-step with it
// by a consistency test in `emit/tests/resourceEmitRegistry.test.ts` (the only way to bridge an enforced boundary
// without drift). Encounter is deliberately ABSENT: it has a registry row but `caseFeature: false` (a
// CEL-writer-only ambient datum), so it is emittable but not a case-feature datum.

/** The FHIR resource types the emitter can produce as a case-feature datum (a `caseFeature: true` registry row).
 *  Kept equal to the registry's flags by the consistency test cited above. */
export const CASE_FEATURE_EMITTABLE_TYPES: ReadonlySet<string> = new Set([
  "Observation",
  "Condition",
  "Procedure",
  "ServiceRequest",
  "MedicationRequest",
]);

/** Can a resource type back a case-feature datum? Lane-neutral — safe to import from the validate lane. Mirrors
 *  the descriptor deriver's A′ gate (`effectiveRepresentation.ts` `!row || !row.caseFeature`): an unlisted type
 *  and Encounter's CEL-writer-only row both return `false`. */
export function isCaseFeatureEmittable(resourceType: string): boolean {
  return CASE_FEATURE_EMITTABLE_TYPES.has(resourceType);
}
