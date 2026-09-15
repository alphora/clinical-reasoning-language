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

/*
 * answeredValue — the THREE-STATE read of a PURE QUESTION (#189 null/pause).
 *
 * `asTruths`/`satisfied` above collapse three DISTINCT states into one: no record at all, a record
 * valued `false`, and a valueless record all become the empty set, hence `false`. That makes an
 * UNANSWERED question indistinguishable from one answered "no" — so a decision DENIES where it must
 * PAUSE and ask. That is the #189 null/pause defect, and this function is the fix:
 *
 *   newest answer record valued true   -> true
 *   newest answer record valued false  -> false
 *   NO answer record at all            -> null   (unknown: the gate pauses and the question is asked)
 *
 * Deliberately NOT `Coalesce`d — totality belongs at the ARM (the branch guard), never per operand.
 * Coalescing here is exactly what forecloses the pause (design of record §3.3).
 *
 * Observation-only by construction: a pure question is `type is Observation` + `value type is boolean`
 * + `code is`, because only a stored boolean lets a user answer true / false / leave-unanswered
 * (design §3.1). The `where` keeps a valueless record from winning the recency sort and reading null.
 *
 * Newest-wins on (effective, id) — a SORT, not a judgment (design §3.7) — byte-matching the emitter's
 * own `emitSelectNewest` spelling for Observation (`recency.sortExpr = "effective"`, cast `dateTime`),
 * so the two cannot drift.
 */
define fluent function answeredValue(obs List<FHIR.Observation>):
  FHIRHelpers.ToBoolean(
    Last(
      obs O
        where O.value is FHIR.boolean
        sort by (effective as FHIR.dateTime).value, id
    ).value as FHIR.boolean
  )

// REFACTOR:suspect (#320): legacy generic value arbitration; age uses pattern-owned publication.
// Generic recency-value callers still use source-newer, otherwise-local behavior.
define function recencyLocalWins(localTs System.DateTime, sourceTs System.DateTime):
  not Coalesce(sourceTs after localTs, false)
