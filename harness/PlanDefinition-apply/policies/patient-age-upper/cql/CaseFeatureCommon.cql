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
 *   - `sem-not` → `except` — from a positive base (`A sem-and sem-not B` → `A
 *     except B`); a NO-BASE `sem-not` (standalone, or a `sem-or` term) negates
 *     from the unit universe: `sem-not X` → `({ true } except (X))` (#232). On
 *     singleton/empty truth-sets `except` is exactly closed-world `and not`, so
 *     `{ true } except X` is `{ true }` iff X is not established.
 * `satisfied` collapses a truth-set back to a boolean for the Interface layer.
 *
 * Both functions are FLUENT, so call sites invoke them method-style
 * (`LocalPrimitives."X".asTruths()`, `Inferences."Y".satisfied()`) and do not need
 * the `CFH.` qualifier — only the `include` is required.
 */

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers

context Patient

define fluent function asTruths(obs List<FHIR.Observation>):
  if exists (obs O where O.value.value is true) then { true } else {} as List<System.Boolean>

define fluent function satisfied(truths List<System.Boolean>):
  exists truths

/*
 * recencyAgeTruths — the patient-age both-representation RECENCY merge.
 *
 * Selects between a locally-asserted age boolean (the newest valid
 * `age-…` Observation) and a live computed age boolean (`AtLeast(AgeAt(), n)`),
 * then LIFTS the selection back to a truth-set so it composes in the
 * Inferences/Interface truth-set lane. This does NOT use `asTruths` — that reads
 * only `value.value is true`, discarding the Observation and ERASING an explicit
 * `false`. The recency select must see the raw asserted boolean (incl. false).
 *
 * Precedence lattice (total function):
 *   1. local-source WINS (`recencyAgeAssertedWins`) → the ASSERTED boolean (incl. false).
 *   2. else if a COMPUTED age is available (`computed is not null`) → the COMPUTED boolean.
 *   3. else if assertion present → the ASSERTED boolean (fallback, no computed age).
 *   4. else → NOT DETERMINED (empty truth-set).
 *
 * RESOLVED recency clock + null-lastUpdated behavior (operator decision 2026-07-01):
 *   - Recency keys on `Observation.effective`: a DTR/SDC `definitionExtractValue`
 *     extraction (ProcessDefinitionItem) populates `effective` from
 *     QuestionnaireResponse.authored, NOT `issued` — so the merge reads `effective`
 *     and the call site takes the MOST RECENT (`Last(... sort by effective, id)`).
 *   - When recency is INDETERMINATE — `Patient.meta.lastUpdated` absent (we can't
 *     prove the computed/live state is fresher), OR `effective` null — the
 *     LOCAL-SOURCE WINS. This KEEPS the prior null-lastUpdated behavior and REJECTS
 *     the reviewers' proposed flip to computed. It is safe because the case-3
 *     local-source answer is SESSION-FRESH (not persisted beyond the client session
 *     — see the `@business-logic-deferred:` marker on the authoring concept and
 *     backlog #190). The reviewers' stale-assertion concern is mitigated by that
 *     do-not-persist-beyond-session marker.
 *
 * Params:
 *   local    — the newest valid local age Observation (or null). The call site
 *              pre-filters boolean value ONLY — NO status filter, because a
 *              DTR-extracted answer is not stamped `final` and restricting status
 *              would silently drop it.
 *   computed — the live computed age boolean (`AtLeast(AgeAt(), n years)`).
 */
// The selected age BOOLEAN (or null when NOT determined). Split from the
// truth-set lift below so the precedence lattice is one flat nested-if over
// small boolean-returning helpers (translator-safe: no query `let` in a
// function body). `local` may be null (no valid local Observation).
//
// `recencyAgeAssertedWins` is TRUE when the local-source assertion should win:
// there IS a local Observation AND we CANNOT prove the computed/live age is
// fresher — i.e. `Patient.meta.lastUpdated` absent, OR `effective` null, OR
// `effective after lastUpdated` (effective read as FHIR.dateTime — extraction
// yields effectiveDateTime). Per operator decision 2026-07-01 (see the docblock):
// indeterminate recency → the (session-fresh) local-source wins.
define function recencyAgeAssertedWins(local FHIR.Observation):
  local is not null
    and (
      Patient.meta.lastUpdated.value is null
      or (local.effective as FHIR.dateTime).value is null
      or (local.effective as FHIR.dateTime).value after Patient.meta.lastUpdated.value
    )

// The recency-selected age boolean, or null when nothing determines it.
// LOCK-STEP: the `local.value as FHIR.boolean` cast here mirrors the emit
// subquery's `O.value is FHIR.boolean` filter (emitCQL.ts `emitRecencyMerge`) —
// the call site only passes boolean-valued Observations, so this cast is always
// safe. If you change the boolean-value contract in one place, change the other.
// Cell 2 gates on the COMPUTED value being non-null (not on birthDate presence),
// so a null computed (malformed/absent birthDate) falls through to the
// local-source fallback (cell 3) rather than collapsing to {} (gpt55 refinement E).
define function recencyAgeSelected(local FHIR.Observation, computed Boolean):
  if recencyAgeAssertedWins(local) then
    FHIRHelpers.ToBoolean(local.value as FHIR.boolean)
  else if computed is not null then
    computed
  else if local is not null then
    FHIRHelpers.ToBoolean(local.value as FHIR.boolean)
  else
    null

// Public entry: lift the recency-selected boolean back to the truth-set lane.
// `null` (not determined) → empty truth-set; `false` → empty; `true` → { true }.
define function recencyAgeTruths(local FHIR.Observation, computed Boolean):
  if recencyAgeSelected(local, computed) is true then { true } else {} as List<System.Boolean>
