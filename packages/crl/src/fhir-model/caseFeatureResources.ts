// #189 / disc 495 Q6 — the LANE-NEUTRAL authority for "which FHIR resource types the emitter backs as a
// CASE-FEATURE datum." It lives in `fhir-model/` (a model-fact layer), NOT in `emit/`, precisely so BOTH lanes
// can consult it: the EMIT lane (via the registry) and the VALIDATE lane (`validate_crl`'s emit-capability
// warning). The validate lane MUST NOT import `emit/resourceEmitRegistry` — that boundary is mechanically
// enforced (`emit/tests/effectiveRepresentation.test.ts`: the registry may be imported only by two sanctioned
// emit sites). A shared import across the boundary is therefore impossible, so this neutral set is the single
// LOGICAL authority, and `resourceEmitRegistry`'s per-row `caseFeature: true` flags are kept in lock-step with it
// by a consistency test in `emit/tests/resourceEmitRegistry.test.ts` (the only way to bridge an enforced boundary
// without drift).
//
// ⭐ Encounter JOINED this set 2026-08-30 (operator: "we should be able to create an Encounter CF"). It was
// absent on the stated grounds that no case-feature had `type is Encounter` — an EMPIRICAL claim the registry
// itself called "the intended one-line reversibility, NOT a category impossibility". Both mechanics it was
// assumed to lack were MEASURED to work: the `type[]` ARRAY coding round-trips, and the nested `period.start`
// recency CONSTRUCTS and sorts.

/** The FHIR resource types the emitter can produce as a case-feature datum (a `caseFeature: true` registry row).
 *  Kept equal to the registry's flags by the consistency test cited above. */
export const CASE_FEATURE_EMITTABLE_TYPES: ReadonlySet<string> = new Set([
  "Observation",
  "Condition",
  "Procedure",
  "ServiceRequest",
  "MedicationRequest",
  "Encounter",
]);

/** Can a resource type back a case-feature datum? Lane-neutral — safe to import from the validate lane. Mirrors
 *  the descriptor deriver's A′ gate (`effectiveRepresentation.ts` `!row || !row.caseFeature`): an unlisted type
 *  returns `false`. */
export function isCaseFeatureEmittable(resourceType: string): boolean {
  return CASE_FEATURE_EMITTABLE_TYPES.has(resourceType);
}
