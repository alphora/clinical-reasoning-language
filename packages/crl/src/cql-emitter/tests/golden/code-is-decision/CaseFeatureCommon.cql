library CaseFeatureCommon version '1.0.0'

/*
 * CaseFeatureCommon (CFH) — shared truth-set helpers for the case-feature
 * model. Like CRLCommon, this is a FIXED shared helper library that the
 * emitted policy libraries `include` (one shared file, not a per-policy copy).
 *
 * The case-feature model represents each leaf `code is` concept as a boolean
 * case feature: an Observation with a boolean value. `asTruths` lifts the
 * retrieved Observation list into a truth-set — a `List<System.Boolean>` that
 * holds a single `true` when any retrieved Observation asserts the feature,
 * and is empty otherwise. Truth-sets compose with CQL's list set operators:
 *   - `sem-or`  → `union`
 *   - `sem-and` → `intersect`
 *   - `sem-not` → `except`
 * `satisfied` collapses a truth-set back to a boolean for the Interface layer.
 *
 * Both functions are FLUENT, so call sites invoke them method-style
 * (`LocalSource."X".asTruths()`, `Inferred."Y".satisfied()`) and do not need
 * the `CFH.` qualifier — only the `include` is required.
 */

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers

context Patient

define fluent function asTruths(obs List<FHIR.Observation>):
  if exists (obs O where O.value.value is true) then { true } else {} as List<System.Boolean>

define fluent function satisfied(truths List<System.Boolean>):
  exists truths
