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

/**
 * The FHIR resource types that have a CODE-BASED RETRIEVE — i.e. where `[Resource: "VS"]` is meaningful.
 *
 * ⭐ This is the model fact behind the charter's rule that `coded from` "is decided by MODEL INFO, not by the
 * author and not by the projection: it is required exactly when CQL has a code-based retrieve for that
 * resource type." `Condition` has one; `Patient` does NOT — you retrieve the patient, never
 * patients-with-code-X. That is also what removes the patient-age carve-out: `Patient/birthDate` has no
 * `coded from` because Patient has no coded retrieve, not because age is special.
 *
 * ⚠ Lane-neutral BY NECESSITY. The same fact lives in `emit/resourceEmitRegistry` as each row's `coding`
 * strategy, but the validate lane may not import that registry — the boundary is mechanically enforced
 * (`emit/tests/effectiveRepresentation.test.ts`). This set is the validate-side authority, kept in lock-step
 * with the registry's `coding` fields by the consistency test in `emit/tests/resourceEmitRegistry.test.ts`.
 */
export const CODED_RETRIEVE_TYPES: ReadonlySet<string> = new Set([
  "Observation",
  "Condition",
  "Procedure",
  "ServiceRequest",
  "MedicationRequest",
  "Encounter",
]);

/**
 * Does `resourceType` support `[Resource: "VS"]`?
 *
 * ⚠ Used to decide whether a `value projection` needs a `coded from`. An earlier version asked the PATTERN
 * instead and marked `exists this` as always requiring one — which REJECTED the legal
 * `- type is Patient.` + `- value projection is exists this.`, because a per-pattern boolean cannot know
 * what the resource supports.
 */
export function hasCodedRetrieve(resourceType: string): boolean {
  return CODED_RETRIEVE_TYPES.has(resourceType);
}
