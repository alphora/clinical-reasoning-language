library CRLCommon version '0.6.0'

/*
 * CRLCommon — the CRL→CQL emitter's target library.
 *
 * Each function below implements one entry in the inference-pattern catalog
 * (src/cql-emitter/catalog/inference-pattern-catalog.md).
 * The catalog row's `CQL function` column points here.
 *
 * Design notes:
 *
 * 1. Type strategy. CQL is statically typed and lacks generics, so patterns
 *    that range over heterogeneous FHIR resources have multiple overloads —
 *    one per resource type the corpus uses (Condition, Encounter,
 *    Observation, Procedure, ServiceRequest, MedicationRequest,
 *    AllergyIntolerance). Patterns that range over Quantity-bearing concepts
 *    take a `Quantity` parameter; temporal patterns take `Interval<DateTime>`
 *    or a `List<Encounter>` anchor where useful.
 *
 * 2. Return-shape strategy — generics-by-composition. Filter patterns return
 *    the PRIMITIVE list-shaped form (`List<Resource>` — the filtered list).
 *    The boolean realization is composed at the call site by wrapping with
 *    `exists(...)`. This honors the CRL principle that **patterns carry
 *    semantic intent, not a fixed return type**; the author's
 *    `(type, valuetype)` declaration drives whether the emitter wraps with
 *    `exists` (boolean) or uses the call directly (refinement). See
 *    [[defined-as-is-semantic-composition]] / [[patterns-are-semantic]]
 *    memory + the catalog v0.6.0 / v0.7.0 changelog.
 *
 *    Some patterns are inherently boolean (Without, range classifiers like
 *    High/Low, value comparators like AtLeast/Between, count predicates
 *    like AtLeastN) — these stay boolean because there is no meaningful
 *    list realization. Some return non-list / non-boolean shapes
 *    (Period, Instance, Quantity, Interval) — these stay as-is because
 *    they're semantically primitives of their own shape.
 *
 * 3. Subject under test. CRL is patient-context — every pattern is implicitly
 *    "for the patient in scope". CQL's `context Patient` declaration applies
 *    transitively to caller libraries; this library does not redeclare it.
 *
 * 4. Helper dependencies. FHIRHelpers for primitive coercion, FHIRCommon for
 *    choice-type normalization (`toInterval`), USCoreCommon for observation
 *    ordering and blood pressure component access. The set of allowed helpers
 *    is documented in `issues/rough-backlog.md` (helper-library inventory).
 *
 * 5. Versioning. v0.1.0 was the boolean-returning first cut; v0.2.0 was the
 *    refactor to list-returning primitives. v0.3.0 is the correctness pass
 *    described below. v0.4.0 adds the fluent invocation surface. Each catalog
 *    row still has a function; the call-site dispatch determines whether the
 *    consumer wraps with `exists`.
 *
 * 6. Per-pattern docs. Each function carries a short comment naming the
 *    catalog row it implements + the return-shape category. The catalog is
 *    the source of truth for narrative form, intent, and parameter naming.
 */

/*
 * ====================================================================
 * v0.3.0 REVIEW PASS
 * ====================================================================
 *
 * All changes are in this library only; no emitted library was edited. Every
 * change below is marked inline with "REVIEW (n)".
 *
 * FIXED - these were silently producing wrong answers:
 *
 *  1. Choice-type casts. Every temporal pattern cast with `X as Period`.
 *     Observation.effective[x] is dateTime|Period|Timing|instant and is
 *     recorded overwhelmingly as effectiveDateTime, for which `as Period`
 *     yields NULL - so those records dropped silently out of every temporal
 *     filter. Condition.onset[x] and Procedure.performed[x] had the same
 *     problem. All now use FHIRCommon.toInterval(), which normalizes the
 *     whole choice.
 *
 *  2. Selection patterns did not sort. LastOf/MostRecent/Earliest/FirstOf
 *     called Last()/First() on an unsorted retrieve, which returns whatever
 *     came last in retrieve order rather than the chronologically last
 *     record. They now order via USCoreCommon.chronologically().
 *
 *  3. NotDoneWithReason ignored its `reason` argument entirely, making
 *     "patient declined" and "medical reason" indistinguishable, and counted
 *     status='completed' ServiceRequests as not-done. See the FIXME on that
 *     function - a faithful implementation needs the USQualityCore negation
 *     profiles, which are out of reach while this library is base-FHIR only.
 *
 *  4. Between was half-open. `Between(x, 120, 129)` meant 120..128. The
 *     narrative form "between A and B" is inclusive of both bounds.
 *
 *  5. Justified used `singleton from (A.reasonCode)`, which throws when a
 *     request carries more than one reasonCode. Now an existential over
 *     reasonCode.
 *
 *  6. IsVerified(Condition) required verificationStatus ~ confirmed, which
 *     drops most real records. Widened to the community set, with absent
 *     status passing.
 *
 *  7. WasOrdered required intent = 'order', missing the other four order
 *     intents.
 *
 * ADDED - correct targets for the emitter to move onto:
 *
 *  8. ComponentOf(panel, Code) overload. The existing List<Observation>
 *     discriminator overload requires the patient to independently have a
 *     standalone observation of the discriminating code, or it matches
 *     nothing. Kept for compatibility, deprecated.
 *  9. SystolicOf / DiastolicOf, delegating to USCoreCommon.
 *
 * KNOWN REMAINING - needs a catalog/signature decision, not fixable here:
 *
 * 10. The window-from-anchor sub-grammar (OnDayOf, BeforeStartOf, ...) returns
 *     a single Interval and so collapses a multi-encounter anchor to one
 *     encounter. For an encounter-scoped measure this silently evaluates all
 *     downstream logic against one visit. Made deterministic here (earliest
 *     rather than arbitrary), but the fix is a per-anchor pattern shape.
 */

/*
 * ====================================================================
 * PATTERN CLASSES - which invocation surface a pattern gets, and why
 * ====================================================================
 *
 * Patterns are not uniform in arity, so they do not all want the same surface.
 * Every function in this library belongs to exactly one of four classes, and
 * the class determines what is offered. Each section below is labelled with
 * its class.
 *
 * CLASS 1 - ITEM PREDICATES.  item -> Boolean, and list -> filtered list.
 *   WasOrdered, WasPerformed, IsVerified, Active, Justified,
 *   NotDoneWithReason, DocumentedAs.
 *
 *   BOTH surfaces are offered, following the FHIRCommon convention:
 *
 *     R.isOrdered()          // item  -> Boolean   ("is" prefix = Boolean)
 *     X.wasOrdered()         // list  -> List      (catalog name = filter)
 *
 *   The ITEM form carries the logic; the list form is one line over it. This
 *   avoids the duplication FHIRCommon itself has, where verified() and
 *   isVerified() each restate the same predicate.
 *
 *   The item form is the important half. A Boolean predicate composes
 *   ANYWHERE - `where`, `such that`, `return`, `sort` - whereas a list filter
 *   can only ever be a pipeline stage. Correlating a record with a specific
 *   encounter needs that composability, and its absence is a large part of why
 *   the emitted measures could not express encounter scope.
 *
 *   ADMISSION TEST (revised in v0.6.0). A pattern is Class 1 only if CQL
 *   CANNOT ALREADY EXPRESS IT. "Has a per-record truth value" was the original
 *   test and it was too weak: `E.period during MP` also has a per-record truth
 *   value, and the language already provides it. Under the weak test the
 *   temporal patterns - During, Overlaps, SameDay, Within, OnOrBefore,
 *   OnDayOfOrAfter - were admitted as item predicates in v0.5.0 and removed
 *   again in v0.6.0.
 *
 *   Status and code rules pass the test: CQL has no syntax for "status and
 *   intent together indicate an order". Temporal relations fail it: CQL has a
 *   rich generative timing grammar, and any fixed set of named predicates can
 *   only enumerate a fraction of it. For those, this library supplies TIME
 *   ACCESSORS instead (see the section after `context Patient`) and leaves the
 *   comparison to the language.
 *
 * CLASS 2 - VALUE COMPARATORS.  item -> Boolean only.
 *   AtLeast, AtMost, Between, Exceeds, Below, High, Low, Normal, Abnormal.
 *
 *   These are scalar comparisons and are correct only at item level. A
 *   list-level comparator has to choose a quantifier, and choosing one
 *   silently is a trap: `Below(values, 120)` reads as "the value is below 120"
 *   but means "SOME value is below 120". That is a live defect in the emitted
 *   content - "Last Systolic Below 120" AND "Last Diastolic Below 80" can be
 *   satisfied by two different readings.
 *
 *   The list overloads are therefore DEPRECATED in place (still working, so
 *   nothing breaks) and replaced by anyXxx / allXxx forms that put the
 *   quantifier in the name where the reader can see it.
 *
 * CLASS 3 - SELECTIONS.  list -> item.
 *   LastOf, FirstOf, Earliest, MostRecent, Lowest, Highest, EarliestOf.
 *   Irreducibly list-level: choosing one record out of many has no item-level
 *   form. List surface only.
 *
 * CLASS 4 - AGGREGATES AND RELATIONS.  list -> Boolean.
 *   AtLeastN, Consecutive, AtLeastApart, AtMostApart, BaselineAndFollowUp.
 *   The predicate is about the SET, not any member of it. List surface only.
 *
 * REUSE. Where FHIRCommon already exports an item predicate with matching
 * semantics, this library delegates rather than redefining - see IsVerified
 * and Active. That both removes duplicated logic and avoids exact-signature
 * collisions, which in CQL are silent until the ambiguous call is written.
 */

/*
 * ====================================================================
 * v0.4.0 FLUENT INVOCATION SURFACE
 * ====================================================================
 *
 * Purely additive. No existing function body changed; nothing that compiled
 * against v0.3.0 stops compiling.
 *
 * Adds lowerCamelCase fluent siblings for the patterns whose FIRST PARAMETER
 * IS THE SEMANTIC SUBJECT, so they can be written `X.wasOrdered()` as well as
 * `CRLCommon.WasOrdered(X)`. See the section at the bottom of this library for
 * the full rationale, the translator behaviour that forced the sibling
 * approach rather than converting in place, and the list of patterns
 * deliberately left prefix-only.
 */

/*
 * ====================================================================
 * v0.5.0 PATTERN CLASSES AND THE ITEM-LEVEL SURFACE
 * ====================================================================
 *
 * Sorts every pattern into one of the four classes documented above and gives
 * each the surface its arity actually warrants.
 *
 * ADDED
 *  - Class 1 item predicates (isOrdered, isPerformed, isJustified,
 *    isNotDoneWithReason, isDocumentedAs, isDuring, isOverlapping, isSameDay,
 *    isWithin, isOnOrBefore, isOnDayOfOrAfter). These now carry the logic; the
 *    list-level functions are one line over them, so there is a single
 *    implementation per pattern rather than one per surface.
 *  - Class 2 explicit quantifiers (anyAtLeast/allAtLeast, anyBelow/allBelow,
 *    and the rest), so the quantifier is visible at the call site.
 *
 * DEPRECATED, still working
 *  - The List<...> overloads of AtLeast / AtMost / Between / Exceeds / Below.
 *    They are existential quantifiers wearing the name of a scalar comparison.
 *
 * REMOVED - these were added in v0.4.0 and were latent errors
 *  - fluent active(List<Condition>): exact-signature collision with
 *    FHIRCommon's, which would have failed at the first ambiguous call site.
 *  - fluent isVerified(List<...>): a list-returning function with an "is"
 *    prefix contradicts the Class 1 naming rule.
 *
 * BEHAVIORAL - requires validation
 *  - Active now uses FHIRCommon.isActive, which also accepts clinicalStatus
 *    recurrence and relapse. Previously 'active' only.
 *  - IsVerified now delegates to FHIRCommon verified() / resulted(). The
 *    predicates match what v0.3.0 converged on, so this should be inert, but
 *    it is a change of source of truth.
 */

/*
 * ====================================================================
 * v0.6.0 TIME ACCESSORS INSTEAD OF TEMPORAL PREDICATES
 * ====================================================================
 *
 * PARSIMONY. A helper that re-implements a language feature is not a
 * convenience, it is a second, weaker way to say the same thing. CQL's timing
 * syntax is a generative grammar - relation x precision x offset x boundary -
 * and it is the most natural-language part of the language. Wrapping it in
 * named functions produced an enumeration that covered a handful of points in
 * that space, could not be extended without adding more functions, and read
 * LESS like the source narrative than the native syntax it replaced:
 *
 *   O.isSameDay(Enc)
 *   O.relevantInterval() same day as Enc.relevantInterval()   <- closer to the
 *                                                                requirement
 *
 * Confirmed against the ecosystem: not one fluent function in FHIRCommon wraps
 * a timing phrase. Every temporal helper it ships is an interval ACCESSOR -
 * toInterval, prevalenceInterval, abatementInterval. That is a deliberate
 * stance and this library now follows it.
 *
 * WHAT THE PREDICATES WERE ACTUALLY FOR. Their real content was never the
 * relation, it was the resource-specific question of which element carries the
 * time and how its choice type is normalised - `effective` vs `performed` vs
 * `onset` vs `authoredOn`. That question does deserve a helper. So it gets one,
 * and only one, per resource type.
 *
 * The split follows QDM, which has drawn this distinction all along:
 * relevantPeriod / relevantDatetime for when something happened to the
 * patient, authorDatetime for when the record was written.
 *
 * ADDED
 *  - relevantInterval(Observation | Procedure | Encounter | Condition |
 *    AllergyIntolerance) and authorDateTime(ServiceRequest | MedicationRequest).
 *
 * REMOVED - added in v0.5.0, superseded
 *  - The 18 temporal item-predicate overloads: isDuring, isOverlapping,
 *    isSameDay, isWithin, isOnOrBefore, isOnDayOfOrAfter.
 *
 * DEPRECATED, still working
 *  - The window-from-anchor sub-grammar (BeforeStartOf, AfterStartOf,
 *    BeforeEndOf, AfterEndOf, OnDayOf). It existed only to express offsets the
 *    predicates could not, and offsets are native syntax. Emitting the phrase
 *    form also dissolves the anchor-collapse scope error, because the anchor
 *    stays a per-encounter correlation instead of one materialised interval.
 *
 * REWRITTEN, semantics preserved
 *  - The Class 1 temporal LIST functions (During, Overlaps, SameDay, Within,
 *    OnOrBefore, OnDayOfOrAfter) now read as accessor + timing phrase. These
 *    stay: filtering a list by a temporal relation is a genuine catalog
 *    pattern, and it is the surface the emitter targets. Only the item-level
 *    duplicates of language features are gone.
 *
 * NET
 *  - 7 accessors replace 18 predicate overloads and supersede 5 window
 *    functions, while covering the entire timing grammar rather than six
 *    points in it.
 */

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include hl7.fhir.uv.cql.FHIRCommon version '2.0.0' called FHIRCommon
include hl7.fhir.us.cql.USCoreCommon version '2.0.0-cibuild' called USCoreCommon

codesystem "AllergyIntoleranceClinicalStatusCodes": 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical'

code "AllergyActive": 'active' from "AllergyIntoleranceClinicalStatusCodes" display 'Active'

/*
REVIEW (v0.5.0): the condition clinical-status and verification-status code
declarations that used to live here are gone. Active and IsVerified now
delegate to FHIRCommon's isActive / verified / resulted, which declare and test
those codes themselves. See the Class 1 notes in the header.
*/

context Patient

// ====================================================================
// TIME ACCESSORS (v0.6.0)
// ====================================================================

/*
 * "Where does this resource carry its clinically relevant time?"
 *
 * These are the ONLY temporal helpers this library provides. They answer the
 * resource-specific question - which element holds the time, and how is its
 * choice type normalized - and then get out of the way, so the comparison
 * itself is written with CQL's native timing phrases:
 *
 *   Encounters E where E.relevantInterval() during "Measurement Period"
 *   Readings R where R.relevantInterval() ends 1 year or less before or on
 *                      start of Enc.relevantInterval()
 *   Orders O with Encounters E
 *     such that O.authorDateTime() same day as start of E.relevantInterval()
 *
 * Two accessors, not one, because relevant time and authoring time are
 * genuinely different facts about a record - the QDM distinction between
 * relevantPeriod / relevantDatetime and authorDatetime. A ServiceRequest's
 * authoredOn is when the order was written, which is not when anything
 * happened to the patient. Keeping them as separate accessors makes that
 * distinction visible at each call site instead of buried in a comparison
 * helper.
 *
 * FHIRCommon.prevalenceInterval is the same idea already in the ecosystem, and
 * is reused directly for Condition and AllergyIntolerance rather than restated.
 */

define fluent function relevantInterval(O Observation):
  O.effective.toInterval()
define fluent function relevantInterval(P Procedure):
  P.performed.toInterval()
define fluent function relevantInterval(E Encounter):
  E.period.toInterval()
/*
OPEN ITEM (v0.6.0): relevantInterval(Condition) is prevalence - onset through
abatement - which is what "the patient HAS this condition during X" means. The
Condition-typed temporal functions in this library still test onset alone
(C.onset.toInterval()), which asks the narrower question "did this condition
BEGIN during X". A condition that started before the window and continued into
it satisfies the first and fails the second.

Left as found: switching them to prevalence changes which conditions qualify in
every measure using them, so it is a catalog decision rather than a refactor.
Flagged here because the accessor now makes the discrepancy visible - these
overloads are currently unused for exactly that reason.
*/
define fluent function relevantInterval(C Condition):
  C.prevalenceInterval()
define fluent function relevantInterval(A AllergyIntolerance):
  A.prevalenceInterval()

define fluent function authorDateTime(S ServiceRequest):
  S.authoredOn
define fluent function authorDateTime(M MedicationRequest):
  M.authoredOn

// ====================================================================
// Classification
// ====================================================================

/**
 * Has(X) — narrative: `has <X>`. Returns the list itself; the boolean
 * realization is `exists CRLCommon.Has(X)`. The author who declares
 * a boolean shape gets that wrapping at the call site.
 */
define function "Has"(X List<Condition>):
  X
define function "Has"(X List<Encounter>):
  X
define function "Has"(X List<Observation>):
  X
define function "Has"(X List<Procedure>):
  X
define function "Has"(X List<ServiceRequest>):
  X
define function "Has"(X List<MedicationRequest>):
  X
define function "Has"(X List<AllergyIntolerance>):
  X

/**
 * HasHistoryOf(X[, anchor]) — narrative: `has history of <X>` (optionally
 * `prior to <anchor>`). Returns the filtered list. `exists` wrapping at
 * the call site for boolean intent.
 */
define function "HasHistoryOf"(X List<Condition>):
  X
// REVIEW (1): onset as Period -> onset.toInterval()
define function "HasHistoryOf"(X List<Condition>, anchor DateTime):
  (X) C where C.onset.toInterval() ends before anchor

/**
 * Without(kind, X) — narrative: `without <kind> <X>`. INHERENTLY BOOLEAN
 * (the absence semantic doesn't have a meaningful list realization).
 */
define function "Without"(kind String, X List<Condition>):
  not exists X
define function "Without"(kind String, X List<Observation>):
  not exists X
define function "Without"(kind String, X List<Procedure>):
  not exists X
define function "Without"(kind String, X Boolean):
  not X

/**
 * CurrentlyTaking(med) — narrative: `currently taking <med>`.
 * Returns the active medication list.
 */
define function "CurrentlyTaking"(med List<MedicationRequest>):
  (med) M where M.status = 'active'

/**
 * HasAdverseReactionTo(X) — narrative: `has adverse reaction to <X>`.
 * Returns the active allergies list.
 */
define function "HasAdverseReactionTo"(X List<AllergyIntolerance>):
  (X) A where A.clinicalStatus ~ "AllergyActive"

// ====================================================================
// Contextualization
// ====================================================================

/**
 * With(X, Y) — narrative: `<X> with <Y>`. INHERENTLY BOOLEAN at the v0.1
 * surface (Y is a Boolean closure). Full per-element closure semantics is
 * a v0.3 task.
 */
define function "With"(X List<Observation>, Y Boolean):
  exists (X) E where Y

/**
 * AsOf(anchor, X) — narrative: `<X> as of <anchor>`. Returns the list of
 * X whose prevalence aligns with anchor.
 *
 * REVIEW (1): onset as Period -> onset.toInterval() throughout.
 */
define function "AsOf"(anchor List<Encounter>, X List<Condition>):
  (X) C with (anchor) E
    such that C.onset.toInterval() overlaps E.period
define function "AsOf"(anchor DateTime, X List<Condition>):
  (X) C where C.onset.toInterval() contains anchor
define function "AsOf"(anchor Period, X List<Condition>):
  (X) C where C.onset.toInterval() overlaps FHIRHelpers.ToInterval(anchor)

/**
 * Within(X, window) — narrative: `<X> within <window>`. Returns the
 * subset of X falling inside window.
 *
 * REVIEW (1): effective/performed as Period -> .toInterval().
 */
define function "Within"(X List<Observation>, window Interval<DateTime>):
  (X) E where E.relevantInterval() during window
define function "Within"(X List<Procedure>, window Interval<DateTime>):
  (X) P where P.relevantInterval() during window
define function "Within"(X List<Encounter>, window Interval<DateTime>):
  (X) E where E.relevantInterval() during window

/**
 * ComponentOf(panel, discriminator) — narrative: `<discriminator> component
 * of <panel>`. Returns the matching components' Quantity values as a
 * `List<Quantity>`. Returning Quantity directly (vs Observation.Component)
 * lets downstream value-comparator patterns dispatch cleanly without having
 * to know about CQL's awkward backbone-element type names.
 *
 * REVIEW (8): DEPRECATED. This overload takes the discriminator as a list of
 * Observations, which the emitter supplies by retrieving the patient's own
 * standalone observations of that code. When the patient has no such
 * standalone record the discriminator list is empty, `exists` is false, and
 * NO component matches - the panel is discarded because of an unrelated
 * missing record. Emit against the Code overload below instead.
 */
define function "ComponentOf"(panel List<Observation>, discriminator List<Observation>):
  flatten (
    (panel) P return (
      P.component CMP
        where exists ((discriminator) D where D.code ~ CMP.code)
        return FHIRHelpers.ToQuantity(CMP.value as Quantity)
    )
  )

/**
 * REVIEW (8): ComponentOf(panel, Code) — the discriminator is the code
 * itself, so the match no longer depends on what else is in the patient's
 * record. This is the overload the emitter should target.
 */
define function "ComponentOf"(panel List<Observation>, discriminator System.Code):
  flatten (
    (panel) P return (
      P.component CMP
        where CMP.code ~ discriminator
        return FHIRHelpers.ToQuantity(CMP.value as Quantity)
    )
  )

/**
 * REVIEW (9): SystolicOf / DiastolicOf — blood pressure component access
 * delegated to USCoreCommon, which resolves the LOINC codes (8480-6 /
 * 8462-4) itself. Preferred over ComponentOf for blood pressure.
 */
define function "SystolicOf"(panel List<Observation>):
  (panel) P
    where P.systolic() is not null
    return FHIRHelpers.ToQuantity(P.systolic().value as Quantity)

define function "DiastolicOf"(panel List<Observation>):
  (panel) P
    where P.diastolic() is not null
    return FHIRHelpers.ToQuantity(P.diastolic().value as Quantity)

/**
 * NotDoneWithReason(action, reason) — narrative: `<action> not done with
 * reason <reason>`. Returns the list of cancelled/refused actions.
 *
 * REVIEW (3): the `reason` argument was previously accepted and never read,
 * so every caller distinguishing "patient declined" from "medical reason"
 * got the same answer; and status='completed' ServiceRequests were counted
 * as not-done. Status lists are corrected, and reason is now matched against
 * the action's reasonCode.
 *
 * FIXME: base FHIR carries no reason-not-done element, so this reads
 * reasonCode - which on a live request means "why it was ordered", not "why
 * it was not". A faithful implementation needs the USQualityCore negation
 * profiles (ServiceNotRequested / ObservationCancelled /
 * MedicationNotRequested) with reasonRefused() / notDoneReason(), which
 * requires this library to adopt the USQualityCore model. Until then the
 * Observation overload cannot honour `reason` at all.
 */
define function "NotDoneWithReason"(action List<Observation>, reason List<Observation>):
  (action) A where A.isNotDoneWithReason(reason)
define function "NotDoneWithReason"(action List<ServiceRequest>, reason List<Observation>):
  (action) A where A.isNotDoneWithReason(reason)
define function "NotDoneWithReason"(action List<MedicationRequest>, reason List<Observation>):
  (action) A where A.isNotDoneWithReason(reason)

/**
 * BaselineAndFollowUp(initial, followup) — narrative: `<initial> with
 * follow-up <followup>`. Returns the initial observations that have a
 * later followup.
 *
 * REVIEW (1): effective as Period -> .toInterval().
 */
define function "BaselineAndFollowUp"(initial List<Observation>, followup List<Observation>):
  (initial) I where exists (
    (followup) F where start of F.effective.toInterval() after end of I.effective.toInterval()
  )

/**
 * InpatientStay(encounter[, includePrelude]) — returns Period (not a
 * list and not boolean). Stays as-is.
 *
 * FIXME: the includePrelude overload returns E.period on both branches, so
 * the flag has no effect. Left as found - the intended prelude semantic is a
 * catalog question.
 */
define function "InpatientStay"(encounter List<Encounter>):
  First((encounter) E return E.period)
define function "InpatientStay"(encounter List<Encounter>, includePrelude Boolean):
  First((encounter) E return
    if includePrelude then E.period else E.period
  )

/**
 * WasOrdered(X) — narrative: `<X> ordered`. Returns the list of ordered
 * requests.
 *
 * REVIEW (7): intent = 'order' missed the other four order intents.
 */
define function "WasOrdered"(X List<ServiceRequest>):
  (X) R where R.isOrdered()
define function "WasOrdered"(X List<MedicationRequest>):
  (X) R where R.isOrdered()

// ====================================================================
// Assertion
// ====================================================================

/**
 * Justified(action, reason) — narrative: `<action> justified by <reason>`.
 * Returns the actions whose reasonCode references the reason.
 *
 * REVIEW (5): `singleton from (A.reasonCode)` throws when an action carries
 * more than one reasonCode. Now existential over reasonCode.
 */
define function "Justified"(action List<ServiceRequest>, reason List<Condition>):
  (action) A where A.isJustified(reason)
define function "Justified"(action List<MedicationRequest>, reason List<Condition>):
  (action) A where A.isJustified(reason)
define function "Justified"(action List<Procedure>, reason List<Condition>):
  (action) A where A.isJustified(reason)
define function "Justified"(action List<ServiceRequest>, reason List<Observation>):
  (action) A where A.isJustified(reason)
define function "Justified"(action List<MedicationRequest>, reason List<Observation>):
  (action) A where A.isJustified(reason)
define function "Justified"(action List<Procedure>, reason List<Observation>):
  (action) A where A.isJustified(reason)

/**
 * Active(X[, during]) — narrative: `<X> active` (optionally `during
 * <period>`). Returns the active condition list.
 *
 * REVIEW (1): onset as Period -> onset.toInterval().
 */
define function "Active"(X List<Condition>):
  (X) C where C.isActive()
define function "Active"(X List<Condition>, over List<Encounter>):
  (X) C where C.isActive()
    and exists ((over) E where C.onset.toInterval() overlaps E.period)
define function "Active"(X List<Condition>, over Interval<DateTime>):
  (X) C where C.isActive()
    and C.onset.toInterval() overlaps over

/**
 * IsVerified(X) — narrative: `<X> verified`. Returns the verified list.
 *
 * REVIEW (6): confirmed-only dropped most real records. Widened to the
 * community set, with an absent verificationStatus passing - matching
 * Status.verified() and USCoreCommon's treatment.
 */
define function "IsVerified"(X List<Observation>):
  X.resulted()
define function "IsVerified"(X List<Condition>):
  X.verified()

/**
 * DocumentedAs(X, classification) — narrative: `<X> documented as
 * <classification>`. Returns the X observations whose value matches a
 * classification code.
 */
define function "DocumentedAs"(X List<Observation>, classification List<Observation>):
  (X) O where O.isDocumentedAs(classification)

// ====================================================================
// Qualification (temporal)
// ====================================================================

/**
 * During(event, period) — narrative: `<event> during <period>`. Returns
 * the events whose effective time falls within period.
 *
 * REVIEW (1): effective/performed/onset as Period -> .toInterval().
 */
define function "During"(event List<Observation>, period List<Encounter>):
  (event) E with (period) P
    such that E.relevantInterval() during P.relevantInterval()
define function "During"(event List<Encounter>, period Interval<DateTime>):
  (event) E where E.relevantInterval() during period
define function "During"(event List<Observation>, period Interval<DateTime>):
  (event) E where E.relevantInterval() during period
define function "During"(event List<Procedure>, period Interval<DateTime>):
  (event) P where P.relevantInterval() during period
define function "During"(event List<Condition>, period Interval<DateTime>):
  (event) C where C.onset.toInterval() during period

/**
 * Overlaps(eventA, eventB) — narrative: `<eventA> overlaps <eventB>`.
 * Returns eventA whose period overlaps eventB.
 *
 * REVIEW (1): as Period -> .toInterval().
 */
define function "Overlaps"(eventA List<Observation>, eventB List<Encounter>):
  (eventA) A with (eventB) B
    such that A.relevantInterval() overlaps B.relevantInterval()
define function "Overlaps"(eventA List<Condition>, eventB List<Encounter>):
  (eventA) A with (eventB) B
    such that A.onset.toInterval() overlaps B.relevantInterval()
define function "Overlaps"(eventA List<Observation>, eventB Interval<DateTime>):
  (eventA) A where A.relevantInterval() overlaps eventB

/**
 * OnDayOfOrAfter(X, anchor) — narrative: `<X> on day of or after
 * <anchor>`. Returns X whose start is on/after anchor's day.
 *
 * REVIEW (1): effective as Period -> .toInterval().
 */
define function "OnDayOfOrAfter"(X List<Observation>, anchor List<Encounter>):
  (X) O with (anchor) E
    such that O.relevantInterval() starts on or after day of start of E.relevantInterval()

/**
 * OnOrBefore(X, anchor) — narrative: `<X> on or before <anchor>`.
 *
 * REVIEW (1): onset as Period -> onset.toInterval().
 */
define function "OnOrBefore"(X List<Condition>, anchor DateTime):
  (X) C where C.onset.toInterval() starts before or on day of anchor
define function "OnOrBefore"(X Boolean, anchor DateTime):
  X
define function "OnOrBefore"(X DateTime, anchor DateTime):
  X same day or before anchor

/**
 * SameDay(eventA, eventB) — narrative: `<eventA> same day as <eventB>`.
 * Returns eventA list filtered to same-day with eventB.
 *
 * REVIEW (1): as Period -> .toInterval().
 */
/*
REVIEW (v0.6.0): the accessors make an asymmetry visible that the previous
isSameDay overloads hid. Events carrying a relevant interval are compared
interval-to-interval; requests carry only an authoring instant, so they are
compared to the START of the encounter. That is a real difference in what the
records mean, and it now shows at the point of comparison rather than being
decided inside a helper.
*/
define function "SameDay"(eventA List<Observation>, eventB List<Encounter>):
  (eventA) A with (eventB) B
    such that A.relevantInterval() same day as B.relevantInterval()
define function "SameDay"(eventA List<ServiceRequest>, eventB List<Encounter>):
  (eventA) S with (eventB) E
    such that S.authorDateTime() same day as start of E.relevantInterval()
define function "SameDay"(eventA List<MedicationRequest>, eventB List<Encounter>):
  (eventA) M with (eventB) E
    such that M.authorDateTime() same day as start of E.relevantInterval()
define function "SameDay"(eventA List<Procedure>, eventB List<Encounter>):
  (eventA) P with (eventB) E
    such that P.relevantInterval() same day as E.relevantInterval()

/**
 * BetweenAnchors(X, start, end) — narrative: `<X> between <start> and
 * <end>`. Returns X within the interval.
 *
 * REVIEW (1): effective as Period -> .toInterval().
 */
define function "BetweenAnchors"(X List<Observation>, firstAnchor DateTime, lastAnchor DateTime):
  (X) E where E.effective.toInterval() during Interval[firstAnchor, lastAnchor]
define function "BetweenAnchors"(X List<Encounter>, firstAnchor DateTime, lastAnchor DateTime):
  (X) E where E.period during Interval[firstAnchor, lastAnchor]

/**
 * AtLeastApart(eventA, eventB, duration) — narrative: `<eventA> and
 * <eventB> at least <duration> apart`. INHERENTLY BOOLEAN (pair-existence
 * predicate; no meaningful list-of-pairs realization at v0.2).
 *
 * REVIEW (1): effective as Period -> .toInterval().
 */
define function "AtLeastApart"(eventA List<Observation>, eventB List<Observation>, len Quantity):
  exists (eventA) A with (eventB) B
    such that difference in days between
      (start of A.effective.toInterval()) and (start of B.effective.toInterval())
      >= ToDays(len)

/**
 * AtMostApart(eventA, eventB, duration) — narrative: `<eventA> and
 * <eventB> at most <duration> apart`. INHERENTLY BOOLEAN.
 *
 * REVIEW (1): effective as Period -> .toInterval().
 */
define function "AtMostApart"(eventA List<Observation>, eventB List<Observation>, len Quantity):
  exists (eventA) A with (eventB) B
    such that difference in days between
      (start of A.effective.toInterval()) and (start of B.effective.toInterval())
      <= ToDays(len)

/**
 * Helper: convert a UCUM time quantity to a day count.
 */
define function "ToDays"(quantityValue Quantity):
  case
    when quantityValue.unit ~ 'days' then quantityValue.value
    when quantityValue.unit ~ 'weeks' then quantityValue.value * 7.0
    when quantityValue.unit ~ 'months' then quantityValue.value * 30.0
    when quantityValue.unit ~ 'years' then quantityValue.value * 365.0
    else quantityValue.value
  end

/**
 * CLASS 3 - SELECTIONS. List surface only: choosing one record out of many
 * has no item-level form.
 *
 * MostRecent / LastOf / Earliest / FirstOf — selection patterns. Return
 * an `Instance<X>` (a single resource), not a list and not boolean.
 * Author declares the matching resource type; the emitter calls
 * directly. CQL's built-in `Last`/`First` are shadowed by user-defined
 * `LastOf`/`FirstOf` (the catalog uses `LastOf` etc. to avoid shadow).
 *
 * REVIEW (2): these previously called Last()/First() on an UNSORTED list, so
 * "most recent" was whatever the retrieve happened to return last. Ordering
 * now goes through USCoreCommon.chronologically(), which sorts by start of
 * effective.toInterval(). Scoped overloads also pick up the toInterval fix.
 */
define function "MostRecent"(X List<Observation>):
  Last(X.chronologically())
define function "MostRecent"(X List<Observation>, scope Interval<DateTime>):
  Last(((X) O where O.effective.toInterval() during scope).chronologically())

define function "LastOf"(X List<Observation>):
  Last(X.chronologically())
define function "LastOf"(X List<Observation>, scope Interval<DateTime>):
  Last(((X) O where O.effective.toInterval() during scope).chronologically())

define function "Earliest"(X List<Observation>):
  First(X.chronologically())
define function "Earliest"(X List<Observation>, scope Interval<DateTime>):
  First(((X) O where O.effective.toInterval() during scope).chronologically())

define function "FirstOf"(X List<Observation>):
  First(X.chronologically())
define function "FirstOf"(X List<Observation>, scope Interval<DateTime>):
  First(((X) O where O.effective.toInterval() during scope).chronologically())

// ====================================================================
// Window-from-anchor sub-grammar
// ====================================================================

/**
 * Window-from-anchor sub-grammar. Return Interval<DateTime>. Stay as-is.
 *
 * REVIEW (10): each of these builds its window from a single encounter out of
 * the anchor list, so when the anchor holds several encounters ALL downstream
 * logic is evaluated against just one of them. For an encounter-scoped
 * measure that is a scope error, not an approximation.
 *
 * These previously used First(anchor) on an unsorted list, so which encounter
 * won was arbitrary. They now anchor deterministically on the EARLIEST
 * encounter via "EarliestOf" below. That makes the behaviour predictable and
 * testable but does not make it correct: the catalog needs a per-anchor
 * pattern shape (one window per encounter) for encounter-scoped measures.
 *
 * REVIEW (v0.6.0): DEPRECATED, still working. This sub-grammar exists only
 * because the temporal item predicates could not express offsets - it is a
 * second, also-lossy encoding of relations CQL already composes. Everything
 * these five functions build is directly expressible with a time accessor and
 * an offset phrase, without materialising an interval or collapsing the anchor:
 *
 *   BeforeStartOf(1 'year', Enc)   ->  R.relevantInterval() ends 1 year or less
 *                                        before or on start of
 *                                        E.relevantInterval()
 *   OnDayOf(Enc)                   ->  R.relevantInterval() during day of
 *                                        E.relevantInterval()
 *
 * Written that way the anchor stays a per-encounter correlation instead of one
 * arbitrary interval, which also dissolves the scope error described above.
 *
 * Retained because the emitted Cms22Inferred calls OnDayOf and BeforeStartOf.
 * Emit the phrase forms instead; these can be deleted once nothing calls them.
 */
define function "EarliestOf"(anchor List<Encounter>):
  First((anchor) E sort by start of period.toInterval())

define function "BeforeStartOf"(len System.Quantity, anchor List<Encounter>):
  Interval[
    (start of ("EarliestOf"(anchor)).period) - len,
    (start of ("EarliestOf"(anchor)).period)
  ]

define function "AfterStartOf"(len System.Quantity, anchor List<Encounter>):
  Interval[
    (start of ("EarliestOf"(anchor)).period),
    (start of ("EarliestOf"(anchor)).period) + len
  ]

define function "BeforeEndOf"(len System.Quantity, anchor List<Encounter>):
  Interval[
    (end of ("EarliestOf"(anchor)).period) - len,
    (end of ("EarliestOf"(anchor)).period)
  ]

define function "AfterEndOf"(len System.Quantity, anchor List<Encounter>):
  Interval[
    (end of ("EarliestOf"(anchor)).period),
    (end of ("EarliestOf"(anchor)).period) + len
  ]

define function "OnDayOf"(anchor List<Encounter>):
  Interval[
    date from (start of ("EarliestOf"(anchor)).period),
    date from (start of ("EarliestOf"(anchor)).period) + 1 day
  )

// ====================================================================
// Calculation
// ====================================================================

/**
 * AgeAt(anchor) — returns Quantity. Stays as-is.
 *
 * REVIEW (10): the List<Encounter> overload anchors on the earliest
 * encounter rather than an arbitrary one.
 */
define function "AgeAt"(anchor DateTime):
  AgeInYearsAt(anchor)
define function "AgeAt"(anchor List<Encounter>):
  AgeInYearsAt(start of ("EarliestOf"(anchor)).period)
// No-arg overload — the patient's age (in years) as of the ENGINE evaluation
// date (`Today()`, a Date). Keeps CQL's `Today()` off the author surface and off
// the `AgeAt(DateTime)` overload (which would type-error on a Date). `Today()`
// resolves to the `AgeInYearsAt(Date)` overload.
define function "AgeAt"():
  AgeInYearsAt(Today())

/**
 * Calculate(X) — pass-through that surfaces a derived Quantity.
 */
define function "Calculate"(X Quantity):
  X

/**
 * CLASS 3 - SELECTIONS. List surface only.
 *
 * Lowest / Highest — return Quantity (the min/max value). Stay as-is.
 *
 * REVIEW (1): effective as Period -> .toInterval() in the scoped overloads.
 */
define function "Lowest"(X List<Observation>):
  Min((X) O return FHIRHelpers.ToQuantity(O.value as Quantity))
define function "Lowest"(X List<Observation>, scope Interval<DateTime>):
  Min((X) O
    where O.effective.toInterval() during scope
    return FHIRHelpers.ToQuantity(O.value as Quantity))

define function "Highest"(X List<Observation>):
  Max((X) O return FHIRHelpers.ToQuantity(O.value as Quantity))
define function "Highest"(X List<Observation>, scope Interval<DateTime>):
  Max((X) O
    where O.effective.toInterval() during scope
    return FHIRHelpers.ToQuantity(O.value as Quantity))

/**
 * CLASS 4 - AGGREGATES. List surface only: the predicate is about the SET,
 * not about any member of it, so there is nothing to test item-level.
 *
 * AtLeastN / Consecutive — INHERENTLY BOOLEAN count predicates.
 */
define function "AtLeastN"(events List<Observation>, n Integer):
  Count(events) >= n

define function "Consecutive"(events List<Observation>, n Integer):
  Count(events) >= n
  // FIXME: refine to require temporal contiguity per measure semantics.

/**
 * High / Low / Normal / Abnormal — INHERENTLY BOOLEAN range classifiers.
 *
 * Normal/Abnormal stay half-open, which is the convention for a reference
 * range expressed as lo..hi. Contrast Between, below.
 */
define function "High"(X Quantity, threshold Quantity):
  X > threshold

define function "Low"(X Quantity, threshold Quantity):
  X < threshold

define function "Normal"(X Quantity, lo Quantity, hi Quantity):
  X >= lo and X < hi

define function "Abnormal"(X Quantity, lo Quantity, hi Quantity):
  X < lo or X >= hi

/**
 * Value comparators — INHERENTLY BOOLEAN. Overloads cover:
 *   - scalar value (Quantity, Integer) — direct comparison
 *   - list of values (List<Observation>, List<Observation.Component>) —
 *     existential: "any element in the list satisfies the comparison"
 *   - cross-type (Integer × Quantity) — for year-Integer ages compared
 *     to Quantity-year thresholds. Carried on AtLeast (`age today at least`),
 *     AtMost (`age today at most`), and Below (`age today under`/`younger than`)
 *     so every sanctioned age-predicate comparator resolves (#215). The overload
 *     is unit-BLIND (compares `.value` only), so the year-unit guard at the
 *     lowering gate is load-bearing.
 */
/*
 * CLASS 2 DEPRECATION (v0.5.0). Every List<...> overload in this section is
 * DEPRECATED. Each one silently means "SOME element satisfies the comparison",
 * which is not what a reader of `Below(values, 120 'mm[Hg]')` expects and is
 * the cause of a live defect in the emitted content: "Last Systolic Below 120"
 * AND "Last Diastolic Below 80" can be satisfied by two different readings.
 *
 * They still work, so nothing breaks. Emit against either:
 *   - the scalar overload, applied to a single selected value; or
 *   - the anyXxx / allXxx forms at the end of this section, which put the
 *     quantifier in the name where the reader can see it.
 *
 * The scalar overloads are the correct surface for this class and are not
 * deprecated.
 */
define function "AtLeast"(value Quantity, target Quantity):
  value >= target
define function "AtLeast"(value Integer, target Integer):
  value >= target
define function "AtLeast"(value Integer, target System.Quantity):
  value >= target.value
define function "AtLeast"(values List<Observation>, target Quantity):
  exists (values) V where (V.value as Quantity) >= target
define function "AtLeast"(values List<System.Quantity>, target System.Quantity):
  exists (values) v where v >= target

define function "AtMost"(value Quantity, target Quantity):
  value <= target
define function "AtMost"(value Integer, target Integer):
  value <= target
define function "AtMost"(value Integer, target System.Quantity):
  value <= target.value
define function "AtMost"(values List<Observation>, target Quantity):
  exists (values) V where (V.value as Quantity) <= target
define function "AtMost"(values List<System.Quantity>, target System.Quantity):
  exists (values) v where v <= target

/**
 * REVIEW (4): Between was half-open — `Between(x, 120, 129)` meant 120..128,
 * silently excluding the upper bound of every range the narrative states.
 * The narrative form "between A and B" is inclusive of both bounds, so all
 * four overloads now close the upper end.
 *
 * BEHAVIORAL: every caller of Between now admits values equal to `hi`.
 */
define function "Between"(value Quantity, lo Quantity, hi Quantity):
  value >= lo and value <= hi
define function "Between"(value Integer, lo Integer, hi Integer):
  value >= lo and value <= hi
define function "Between"(values List<Observation>, lo Quantity, hi Quantity):
  exists (values) V
    where (V.value as Quantity) >= lo and (V.value as Quantity) <= hi
define function "Between"(values List<System.Quantity>, lo System.Quantity, hi System.Quantity):
  exists (values) v where v >= lo and v <= hi

define function "Exceeds"(value Quantity, target System.Quantity):
  value > target
define function "Exceeds"(value Integer, target System.Integer):
  value > target
define function "Exceeds"(values List<Observation>, target System.Quantity):
  exists (values) V where (V.value as Quantity) > target
define function "Exceeds"(values List<System.Quantity>, target System.Quantity):
  exists (values) v where v > target

define function "Below"(value Quantity, target Quantity):
  value < target
define function "Below"(value Integer, target Integer):
  value < target
define function "Below"(value Integer, target System.Quantity):
  value < target.value
define function "Below"(values List<Observation>, target Quantity):
  exists (values) V where (V.value as Quantity) < target
define function "Below"(values List<System.Quantity>, target System.Quantity):
  exists (values) v where v < target

// ====================================================================
// CLASS 2 - Explicit quantifiers (v0.5.0)
// ====================================================================

/*
 * Replacements for the deprecated List<...> comparator overloads above. The
 * quantifier is in the name, so `anyBelow` and `allBelow` cannot be mistaken
 * for each other or for the scalar comparison.
 *
 * `all` forms are vacuously true on an empty list, which is standard universal
 * quantification and worth knowing at the call site - guard with `exists` if an
 * empty list should not satisfy the criterion.
 */

define fluent function anyAtLeast(values List<Observation>, target Quantity):
  exists (values) V where (V.value as Quantity) >= target
define fluent function anyAtLeast(values List<System.Quantity>, target System.Quantity):
  exists (values) v where v >= target
define fluent function allAtLeast(values List<Observation>, target Quantity):
  not exists ((values) V where not ((V.value as Quantity) >= target))
define fluent function allAtLeast(values List<System.Quantity>, target System.Quantity):
  not exists ((values) v where not (v >= target))

define fluent function anyAtMost(values List<Observation>, target Quantity):
  exists (values) V where (V.value as Quantity) <= target
define fluent function anyAtMost(values List<System.Quantity>, target System.Quantity):
  exists (values) v where v <= target
define fluent function allAtMost(values List<Observation>, target Quantity):
  not exists ((values) V where not ((V.value as Quantity) <= target))
define fluent function allAtMost(values List<System.Quantity>, target System.Quantity):
  not exists ((values) v where not (v <= target))

define fluent function anyBetween(values List<Observation>, lo Quantity, hi Quantity):
  exists (values) V where (V.value as Quantity) >= lo and (V.value as Quantity) <= hi
define fluent function anyBetween(values List<System.Quantity>, lo System.Quantity, hi System.Quantity):
  exists (values) v where v >= lo and v <= hi
define fluent function allBetween(values List<Observation>, lo Quantity, hi Quantity):
  not exists ((values) V where not ((V.value as Quantity) >= lo and (V.value as Quantity) <= hi))
define fluent function allBetween(values List<System.Quantity>, lo System.Quantity, hi System.Quantity):
  not exists ((values) v where not (v >= lo and v <= hi))

define fluent function anyExceeds(values List<Observation>, target System.Quantity):
  exists (values) V where (V.value as Quantity) > target
define fluent function anyExceeds(values List<System.Quantity>, target System.Quantity):
  exists (values) v where v > target
define fluent function allExceed(values List<Observation>, target System.Quantity):
  not exists ((values) V where not ((V.value as Quantity) > target))
define fluent function allExceed(values List<System.Quantity>, target System.Quantity):
  not exists ((values) v where not (v > target))

define fluent function anyBelow(values List<Observation>, target Quantity):
  exists (values) V where (V.value as Quantity) < target
define fluent function anyBelow(values List<System.Quantity>, target System.Quantity):
  exists (values) v where v < target
define fluent function allBelow(values List<Observation>, target Quantity):
  not exists ((values) V where not ((V.value as Quantity) < target))
define fluent function allBelow(values List<System.Quantity>, target System.Quantity):
  not exists ((values) v where not (v < target))

// ====================================================================
// State / Process Inference
// ====================================================================

/**
 * WasPerformed(X) — narrative: `<X> performed`. Returns the performed
 * resource list. Per-resource status discriminator.
 */
define function "WasPerformed"(X List<Procedure>):
  (X) P where P.isPerformed()
define function "WasPerformed"(X List<ServiceRequest>):
  (X) S where S.isPerformed()
define function "WasPerformed"(X List<Observation>):
  (X) O where O.isPerformed()
define function "WasPerformed"(X List<Encounter>):
  (X) E where E.isPerformed()
define function "WasPerformed"(X List<MedicationRequest>):
  (X) M where M.isPerformed()

// ====================================================================
// CLASS 1 - Item predicates (v0.5.0)
// ====================================================================

/*
 * item -> Boolean. These carry the LOGIC for every Class 1 pattern; the
 * list-level filters above are one line over them.
 *
 * The "is" prefix marks a Boolean return, per the FHIRCommon convention. Where
 * the catalog name is past-tense (WasOrdered, WasPerformed) the item form drops
 * the tense rather than producing isWasOrdered.
 *
 * Not defined here, because FHIRCommon already supplies them with the semantics
 * this library wants:
 *   condition.isVerified()      condition.isActive()
 *   observation.isResulted()
 */

// --- WasOrdered ---

define fluent function isOrdered(R ServiceRequest):
  R.status in { 'active', 'completed', 'on-hold' }
    and R.intent in { 'order', 'original-order', 'reflex-order', 'filler-order', 'instance-order' }
define fluent function isOrdered(R MedicationRequest):
  R.status in { 'active', 'completed', 'on-hold' }
    and R.intent in { 'order', 'original-order', 'reflex-order', 'filler-order', 'instance-order' }

// --- WasPerformed ---

define fluent function isPerformed(P Procedure):
  P.status = 'completed'
define fluent function isPerformed(S ServiceRequest):
  S.status = 'completed'
define fluent function isPerformed(O Observation):
  O.isResulted()
define fluent function isPerformed(E Encounter):
  E.status = 'finished'
define fluent function isPerformed(M MedicationRequest):
  M.status = 'completed'

// --- Justified ---

define fluent function isJustified(A ServiceRequest, reason List<Condition>):
  exists (A.reasonCode RC where exists ((reason) R where R.code ~ RC))
define fluent function isJustified(A MedicationRequest, reason List<Condition>):
  exists (A.reasonCode RC where exists ((reason) R where R.code ~ RC))
define fluent function isJustified(A Procedure, reason List<Condition>):
  exists (A.reasonCode RC where exists ((reason) R where R.code ~ RC))
define fluent function isJustified(A ServiceRequest, reason List<Observation>):
  exists (A.reasonCode RC where exists ((reason) R where (R.value as CodeableConcept) ~ RC))
define fluent function isJustified(A MedicationRequest, reason List<Observation>):
  exists (A.reasonCode RC where exists ((reason) R where (R.value as CodeableConcept) ~ RC))
define fluent function isJustified(A Procedure, reason List<Observation>):
  exists (A.reasonCode RC where exists ((reason) R where (R.value as CodeableConcept) ~ RC))

// --- NotDoneWithReason ---
// See the FIXME on the list-level function above: base FHIR has no
// reason-not-done element, so the ServiceRequest and MedicationRequest forms
// read reasonCode, and the Observation form cannot honour `reason` at all.

define fluent function isNotDoneWithReason(A Observation, reason List<Observation>):
  A.status = 'cancelled'
define fluent function isNotDoneWithReason(A ServiceRequest, reason List<Observation>):
  A.status = 'revoked'
    and exists (
      A.reasonCode RC
        where exists ((reason) R where R.code ~ RC or (R.value as CodeableConcept) ~ RC)
    )
define fluent function isNotDoneWithReason(A MedicationRequest, reason List<Observation>):
  A.status in { 'cancelled', 'stopped' }
    and exists (
      A.reasonCode RC
        where exists ((reason) R where R.code ~ RC or (R.value as CodeableConcept) ~ RC)
    )

// --- DocumentedAs ---

define fluent function isDocumentedAs(O Observation, classification List<Observation>):
  exists ((classification) C where O.value as CodeableConcept ~ C.value as CodeableConcept)

/*
 * REVIEW (v0.6.0): the temporal item predicates that v0.5.0 declared here -
 * isDuring, isOverlapping, isSameDay, isWithin, isOnOrBefore,
 * isOnDayOfOrAfter - have been REMOVED. Use the time accessors near the top of
 * this library together with CQL's own timing phrases:
 *
 *   BEFORE                            AFTER
 *   O.isSameDay(Enc)                  O.relevantInterval() same day as
 *                                       Enc.relevantInterval()
 *   O.isDuring("Measurement Period")  O.relevantInterval() during
 *                                       "Measurement Period"
 *
 * They were a lossy enumeration of a generative grammar. CQL composes relation
 * x precision x offset x boundary into hundreds of expressible temporal
 * relationships; these six covered six of them, each freezing one precision and
 * one boundary. Anything outside that set - month precision, "1 year or less
 * before or on start of" - had no function and no way to get one short of
 * adding more. That pressure is visible in this library's own history: the
 * window-from-anchor sub-grammar exists only because these predicates could not
 * express offsets, so the file grew a SECOND lossy encoding of the same
 * grammar.
 *
 * See the Class 1 note in the header for the rule this replaced.
 */

// ====================================================================
// Fluent invocation surface (v0.4.0)
// ====================================================================

/*
 * CQL's `fluent` modifier is NOT additive - it REPLACES qualified invocation.
 * Verified against the translator:
 *
 *   "Operator WasPerformed with signature (list<FHIR.Procedure>) is a fluent
 *    function and can only be invoked with fluent syntax."
 *
 * So marking the catalog functions above `fluent` in place would break every
 * emitted `CRLCommon.Xxx(...)` call at once. Instead this section adds
 * lowerCamelCase fluent SIBLINGS that delegate to them. Both call styles work,
 * and the emitter can migrate a pattern at a time:
 *
 *   CRLCommon.WasOrdered(X)   // still supported
 *   X.wasOrdered()            // new
 *
 * NAMING. lowerCamelCase is the fluent convention everywhere else in the
 * ecosystem - FHIRCommon.toInterval(), USCoreCommon.chronologically(),
 * Status.isOrder() - so the case difference also signals which surface you are
 * on. Names that shadow CQL keywords (`within`, `during`, `between`,
 * `overlaps`) were checked against the translator and parse correctly after a
 * `.`, so the catalog names are preserved rather than mangled.
 *
 * DELEGATION DIRECTION. The logic stays in the PascalCase functions and the
 * fluent siblings are one-line delegates, rather than the other way round.
 * That keeps the v0.3.0 bodies and their REVIEW markers untouched, so this
 * revision is a purely additive diff. When the emitter finishes migrating,
 * invert the delegation or simply delete the PascalCase layer.
 *
 * NOT GIVEN A FLUENT SIBLING, and why:
 *
 *   Has, HasHistoryOf, CurrentlyTaking, HasAdverseReactionTo
 *       The narrative subject is the PATIENT, not the argument - `X.has()`
 *       inverts the sentence. These read correctly only in prefix form.
 *   Without(kind, X), AsOf(anchor, X)
 *       First parameter is a modifier, not the subject.
 *   BeforeStartOf / AfterStartOf / BeforeEndOf / AfterEndOf
 *       First parameter is the window length, not the subject.
 *   With(X, Y)
 *       `with` is too central a CQL keyword to shadow, and the pattern is
 *       flagged above as an incomplete v0.1 surface anyway.
 *   AgeAt
 *       Has a zero-argument overload, which cannot be fluent. Splitting the
 *       overload set across both surfaces would be worse than neither.
 *   MostRecent
 *       FHIRCommon already exports a fluent mostRecent(List<FHIR.Observation>)
 *       with an identical signature, and it sorts by issued rather than
 *       effective. Adding ours would make `X.mostRecent()` ambiguous and, if it
 *       resolved to theirs, silently wrong. Use lastOf(), which is the same
 *       implementation under a name that does not collide.
 */

// --- Contextualization ---

define fluent function within(X List<Observation>, window Interval<DateTime>):
  "Within"(X, window)
define fluent function within(X List<Procedure>, window Interval<DateTime>):
  "Within"(X, window)
define fluent function within(X List<Encounter>, window Interval<DateTime>):
  "Within"(X, window)

define fluent function componentOf(panel List<Observation>, discriminator List<Observation>):
  "ComponentOf"(panel, discriminator)
define fluent function componentOf(panel List<Observation>, discriminator System.Code):
  "ComponentOf"(panel, discriminator)

define fluent function systolicOf(panel List<Observation>):
  "SystolicOf"(panel)
define fluent function diastolicOf(panel List<Observation>):
  "DiastolicOf"(panel)

define fluent function notDoneWithReason(action List<Observation>, reason List<Observation>):
  "NotDoneWithReason"(action, reason)
define fluent function notDoneWithReason(action List<ServiceRequest>, reason List<Observation>):
  "NotDoneWithReason"(action, reason)
define fluent function notDoneWithReason(action List<MedicationRequest>, reason List<Observation>):
  "NotDoneWithReason"(action, reason)

define fluent function baselineAndFollowUp(initial List<Observation>, followup List<Observation>):
  "BaselineAndFollowUp"(initial, followup)

define fluent function inpatientStay(encounter List<Encounter>):
  "InpatientStay"(encounter)
define fluent function inpatientStay(encounter List<Encounter>, includePrelude Boolean):
  "InpatientStay"(encounter, includePrelude)

define fluent function wasOrdered(X List<ServiceRequest>):
  "WasOrdered"(X)
define fluent function wasOrdered(X List<MedicationRequest>):
  "WasOrdered"(X)

// --- Assertion ---

define fluent function justified(action List<ServiceRequest>, reason List<Condition>):
  "Justified"(action, reason)
define fluent function justified(action List<MedicationRequest>, reason List<Condition>):
  "Justified"(action, reason)
define fluent function justified(action List<Procedure>, reason List<Condition>):
  "Justified"(action, reason)
define fluent function justified(action List<ServiceRequest>, reason List<Observation>):
  "Justified"(action, reason)
define fluent function justified(action List<MedicationRequest>, reason List<Observation>):
  "Justified"(action, reason)
define fluent function justified(action List<Procedure>, reason List<Observation>):
  "Justified"(action, reason)

/*
REVIEW (v0.5.0): the single-argument fluent `active(List<Condition>)` that
v0.4.0 declared here has been REMOVED. FHIRCommon already exports
active(List<FHIR.Condition>) with an identical signature, so the two were an
exact collision - legal to declare, but an ambiguous-resolution error the first
time anyone wrote X.active(). Use FHIRCommon's directly; the semantics this
library now uses are FHIRCommon's anyway.

BEHAVIORAL: FHIRCommon treats clinicalStatus recurrence and relapse as active,
where this library previously accepted only 'active'. That is a widening, of
the same kind as the v0.3.0 IsVerified fix, and it changes which conditions
qualify.
*/
define fluent function active(X List<Condition>, over List<Encounter>):
  "Active"(X, over)
define fluent function active(X List<Condition>, over Interval<DateTime>):
  "Active"(X, over)

/*
REVIEW (v0.5.0): the fluent isVerified(List<...>) forms that v0.4.0 declared
here have been REMOVED. Under the Class 1 convention an "is" prefix means an
item-level Boolean, so a list-returning isVerified contradicted the naming rule
it was meant to follow. FHIRCommon supplies both surfaces already, with
semantics matching what v0.3.0 converged on:

  condition.isVerified()   / conditions.verified()
  observation.isResulted() / observations.resulted()

The prefix-form "IsVerified" catalog function is retained above and delegates to
them, so the emitter needs no change.
*/

define fluent function documentedAs(X List<Observation>, classification List<Observation>):
  "DocumentedAs"(X, classification)

// --- Qualification (temporal) ---

define fluent function during(event List<Observation>, period List<Encounter>):
  "During"(event, period)
define fluent function during(event List<Encounter>, period Interval<DateTime>):
  "During"(event, period)
define fluent function during(event List<Observation>, period Interval<DateTime>):
  "During"(event, period)
define fluent function during(event List<Procedure>, period Interval<DateTime>):
  "During"(event, period)
define fluent function during(event List<Condition>, period Interval<DateTime>):
  "During"(event, period)

define fluent function overlaps(eventA List<Observation>, eventB List<Encounter>):
  "Overlaps"(eventA, eventB)
define fluent function overlaps(eventA List<Condition>, eventB List<Encounter>):
  "Overlaps"(eventA, eventB)
define fluent function overlaps(eventA List<Observation>, eventB Interval<DateTime>):
  "Overlaps"(eventA, eventB)

define fluent function onDayOfOrAfter(X List<Observation>, anchor List<Encounter>):
  "OnDayOfOrAfter"(X, anchor)

define fluent function onOrBefore(X List<Condition>, anchor DateTime):
  "OnOrBefore"(X, anchor)
define fluent function onOrBefore(X Boolean, anchor DateTime):
  "OnOrBefore"(X, anchor)
define fluent function onOrBefore(X DateTime, anchor DateTime):
  "OnOrBefore"(X, anchor)

define fluent function sameDay(eventA List<Observation>, eventB List<Encounter>):
  "SameDay"(eventA, eventB)
define fluent function sameDay(eventA List<ServiceRequest>, eventB List<Encounter>):
  "SameDay"(eventA, eventB)
define fluent function sameDay(eventA List<MedicationRequest>, eventB List<Encounter>):
  "SameDay"(eventA, eventB)
define fluent function sameDay(eventA List<Procedure>, eventB List<Encounter>):
  "SameDay"(eventA, eventB)

define fluent function betweenAnchors(X List<Observation>, firstAnchor DateTime, lastAnchor DateTime):
  "BetweenAnchors"(X, firstAnchor, lastAnchor)
define fluent function betweenAnchors(X List<Encounter>, firstAnchor DateTime, lastAnchor DateTime):
  "BetweenAnchors"(X, firstAnchor, lastAnchor)

define fluent function atLeastApart(eventA List<Observation>, eventB List<Observation>, len Quantity):
  "AtLeastApart"(eventA, eventB, len)
define fluent function atMostApart(eventA List<Observation>, eventB List<Observation>, len Quantity):
  "AtMostApart"(eventA, eventB, len)

define fluent function toDays(quantityValue Quantity):
  "ToDays"(quantityValue)

// --- Selection ---

define fluent function lastOf(X List<Observation>):
  "LastOf"(X)
define fluent function lastOf(X List<Observation>, scope Interval<DateTime>):
  "LastOf"(X, scope)

define fluent function earliest(X List<Observation>):
  "Earliest"(X)
define fluent function earliest(X List<Observation>, scope Interval<DateTime>):
  "Earliest"(X, scope)

define fluent function firstOf(X List<Observation>):
  "FirstOf"(X)
define fluent function firstOf(X List<Observation>, scope Interval<DateTime>):
  "FirstOf"(X, scope)

define fluent function earliestOf(anchor List<Encounter>):
  "EarliestOf"(anchor)

define fluent function onDayOf(anchor List<Encounter>):
  "OnDayOf"(anchor)

// --- Calculation ---

define fluent function calculate(X Quantity):
  "Calculate"(X)

define fluent function lowest(X List<Observation>):
  "Lowest"(X)
define fluent function lowest(X List<Observation>, scope Interval<DateTime>):
  "Lowest"(X, scope)

define fluent function highest(X List<Observation>):
  "Highest"(X)
define fluent function highest(X List<Observation>, scope Interval<DateTime>):
  "Highest"(X, scope)

define fluent function atLeastN(events List<Observation>, n Integer):
  "AtLeastN"(events, n)
define fluent function consecutive(events List<Observation>, n Integer):
  "Consecutive"(events, n)

define fluent function high(X Quantity, threshold Quantity):
  "High"(X, threshold)
define fluent function low(X Quantity, threshold Quantity):
  "Low"(X, threshold)
define fluent function normal(X Quantity, lo Quantity, hi Quantity):
  "Normal"(X, lo, hi)
define fluent function abnormal(X Quantity, lo Quantity, hi Quantity):
  "Abnormal"(X, lo, hi)

// --- Value comparators ---

define fluent function atLeast(value Quantity, target Quantity):
  "AtLeast"(value, target)
define fluent function atLeast(value Integer, target Integer):
  "AtLeast"(value, target)
define fluent function atLeast(value Integer, target System.Quantity):
  "AtLeast"(value, target)
define fluent function atLeast(values List<Observation>, target Quantity):
  "AtLeast"(values, target)
define fluent function atLeast(values List<System.Quantity>, target System.Quantity):
  "AtLeast"(values, target)

define fluent function atMost(value Quantity, target Quantity):
  "AtMost"(value, target)
define fluent function atMost(value Integer, target Integer):
  "AtMost"(value, target)
define fluent function atMost(value Integer, target System.Quantity):
  "AtMost"(value, target)
define fluent function atMost(values List<Observation>, target Quantity):
  "AtMost"(values, target)
define fluent function atMost(values List<System.Quantity>, target System.Quantity):
  "AtMost"(values, target)

define fluent function between(value Quantity, lo Quantity, hi Quantity):
  "Between"(value, lo, hi)
define fluent function between(value Integer, lo Integer, hi Integer):
  "Between"(value, lo, hi)
define fluent function between(values List<Observation>, lo Quantity, hi Quantity):
  "Between"(values, lo, hi)
define fluent function between(values List<System.Quantity>, lo System.Quantity, hi System.Quantity):
  "Between"(values, lo, hi)

define fluent function exceeds(value Quantity, target System.Quantity):
  "Exceeds"(value, target)
define fluent function exceeds(value Integer, target System.Integer):
  "Exceeds"(value, target)
define fluent function exceeds(values List<Observation>, target System.Quantity):
  "Exceeds"(values, target)
define fluent function exceeds(values List<System.Quantity>, target System.Quantity):
  "Exceeds"(values, target)

define fluent function below(value Quantity, target Quantity):
  "Below"(value, target)
define fluent function below(value Integer, target Integer):
  "Below"(value, target)
define fluent function below(value Integer, target System.Quantity):
  "Below"(value, target)
define fluent function below(values List<Observation>, target Quantity):
  "Below"(values, target)
define fluent function below(values List<System.Quantity>, target System.Quantity):
  "Below"(values, target)

// --- State / Process Inference ---

define fluent function wasPerformed(X List<Procedure>):
  "WasPerformed"(X)
define fluent function wasPerformed(X List<ServiceRequest>):
  "WasPerformed"(X)
define fluent function wasPerformed(X List<Observation>):
  "WasPerformed"(X)
define fluent function wasPerformed(X List<Encounter>):
  "WasPerformed"(X)
define fluent function wasPerformed(X List<MedicationRequest>):
  "WasPerformed"(X)
