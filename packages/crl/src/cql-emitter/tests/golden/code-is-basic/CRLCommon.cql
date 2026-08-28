library CRLCommon version '0.2.0'

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
 * 2. Return-shape strategy — one NATURAL shape per pattern. Filter patterns
 *    return the PRIMITIVE list-shaped form (`List<Resource>` — the filtered
 *    list). This honors the CRL principle that **patterns carry semantic
 *    intent, not a fixed return type**: a catalog signature never constrains
 *    what an author may DECLARE, and the author's `(type, valuetype)` selects
 *    which realization form the emitter emits.
 *
 *    REFACTOR:grounded (#189 null/pause) — this section was re-derived from
 *    [[patterns-are-semantic]] AS CORRECTED, not from the emitter's current
 *    behaviour. This file is a PRIME mis-attribution target: a reviewer reads
 *    it as the catalog's rationale, so what it says about the emitter carries
 *    weight it should not. Do not silently drop this mark.
 *
 *    ⚠ Selecting a realization form is NOT licence to synthesize one. The
 *    emitter must never INSERT A REDUCTION (`exists`, a singleton lift `{ }`,
 *    a `Coalesce`) to bridge a shape the author declared. A boolean over a
 *    filter pattern is `definition is exists ( … )` — AUTHORED. A mismatch is
 *    an author-time error naming the reduction, not an emitter bridge.
 *    (The emitter still bridges today; that code is the patient, pending
 *    reduction nesting. Do not read it as intent.)
 *    See [[patterns-are-semantic]] + the catalog v0.6.0 / v0.7.0 changelog.
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
 * 4. Helper dependencies. FHIRHelpers for primitive coercion. The set of
 *    allowed helpers is documented in `issues/rough-backlog.md`
 *    (helper-library inventory).
 *
 * 5. Versioning. v0.1.0 was the boolean-returning first cut; v0.2.0 is this
 *    refactor to list-returning primitives. Each catalog row still has a
 *    function; the call-site dispatch determines whether the consumer wraps
 *    with `exists`.
 *
 * 6. Per-pattern docs. Each function carries a short comment naming the
 *    catalog row it implements + the return-shape category. The catalog is
 *    the source of truth for narrative form, intent, and parameter naming.
 */

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers

codesystem "ConditionClinicalStatusCodes": 'http://terminology.hl7.org/CodeSystem/condition-clinical'
codesystem "ConditionVerStatusCodes": 'http://terminology.hl7.org/CodeSystem/condition-ver-status'
codesystem "AllergyIntoleranceClinicalStatusCodes": 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical'

code "ActiveCondition": 'active' from "ConditionClinicalStatusCodes" display 'Active'
code "Confirmed": 'confirmed' from "ConditionVerStatusCodes" display 'Confirmed'
code "AllergyActive": 'active' from "AllergyIntoleranceClinicalStatusCodes" display 'Active'

context Patient

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
define function "HasHistoryOf"(X List<Condition>, anchor DateTime):
  (X) C where (C.onset as Period) ends before anchor

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
 */
define function "AsOf"(anchor List<Encounter>, X List<Condition>):
  (X) C with (anchor) E
    such that (C.onset as Period) overlaps (E.period)
define function "AsOf"(anchor DateTime, X List<Condition>):
  (X) C where (C.onset as Period) contains anchor
define function "AsOf"(anchor Period, X List<Condition>):
  (X) C where (C.onset as Period) overlaps (FHIRHelpers.ToInterval(anchor))

/**
 * Within(X, window) — narrative: `<X> within <window>`. Returns the
 * subset of X falling inside window.
 */
define function "Within"(X List<Observation>, window Interval<DateTime>):
  (X) E where (E.effective as Period) during window
define function "Within"(X List<Procedure>, window Interval<DateTime>):
  (X) P where (P.performed as Period) during window
define function "Within"(X List<Encounter>, window Interval<DateTime>):
  (X) E where E.period during window

/**
 * ComponentOf(panel, discriminator) — narrative: `<discriminator> component
 * of <panel>`. Returns the matching components' Quantity values as a
 * `List<Quantity>`. Returning Quantity directly (vs Observation.Component)
 * lets downstream value-comparator patterns dispatch cleanly without having
 * to know about CQL's awkward backbone-element type names.
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
 * NotDoneWithReason(action, reason) — narrative: `<action> not done with
 * reason <reason>`. Returns the list of cancelled/refused actions.
 */
define function "NotDoneWithReason"(action List<Observation>, reason List<Observation>):
  (action) A
    where A.status = 'cancelled' or A.status = 'entered-in-error'
define function "NotDoneWithReason"(action List<ServiceRequest>, reason List<Observation>):
  (action) A
    where A.status = 'revoked' or A.status = 'completed'
define function "NotDoneWithReason"(action List<MedicationRequest>, reason List<Observation>):
  (action) A
    where A.status = 'cancelled' or A.status = 'stopped'

/**
 * BaselineAndFollowUp(initial, followup) — narrative: `<initial> with
 * follow-up <followup>`. Returns the initial observations that have a
 * later followup.
 */
define function "BaselineAndFollowUp"(initial List<Observation>, followup List<Observation>):
  (initial) I where exists (
    (followup) F where start of (F.effective as Period) after end of (I.effective as Period)
  )

/**
 * InpatientStay(encounter[, includePrelude]) — returns Period (not a
 * list and not boolean). Stays as-is.
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
 */
define function "WasOrdered"(X List<ServiceRequest>):
  (X) R where R.status in { 'active', 'completed', 'on-hold' }
    and R.intent = 'order'
define function "WasOrdered"(X List<MedicationRequest>):
  (X) R where R.status in { 'active', 'completed', 'on-hold' }
    and R.intent = 'order'

// ====================================================================
// Assertion
// ====================================================================

/**
 * Justified(action, reason) — narrative: `<action> justified by <reason>`.
 * Returns the actions whose reasonCode references the reason.
 */
define function "Justified"(action List<ServiceRequest>, reason List<Condition>):
  (action) A
    where exists ((reason) R where R.code ~ singleton from (A.reasonCode))
define function "Justified"(action List<MedicationRequest>, reason List<Condition>):
  (action) A
    where exists ((reason) R where R.code ~ singleton from (A.reasonCode))
define function "Justified"(action List<Procedure>, reason List<Condition>):
  (action) A
    where exists ((reason) R where R.code ~ singleton from (A.reasonCode))
define function "Justified"(action List<ServiceRequest>, reason List<Observation>):
  (action) A
    where exists ((reason) R where (R.value as CodeableConcept) ~ singleton from (A.reasonCode))
define function "Justified"(action List<MedicationRequest>, reason List<Observation>):
  (action) A
    where exists ((reason) R where (R.value as CodeableConcept) ~ singleton from (A.reasonCode))
define function "Justified"(action List<Procedure>, reason List<Observation>):
  (action) A
    where exists ((reason) R where (R.value as CodeableConcept) ~ singleton from (A.reasonCode))

/**
 * Active(X[, during]) — narrative: `<X> active` (optionally `during
 * <period>`). Returns the active condition list.
 */
define function "Active"(X List<Condition>):
  (X) C where C.clinicalStatus ~ "ActiveCondition"
define function "Active"(X List<Condition>, over List<Encounter>):
  (X) C where C.clinicalStatus ~ "ActiveCondition"
    and exists ((over) E where (C.onset as Period) overlaps (E.period))
define function "Active"(X List<Condition>, over Interval<DateTime>):
  (X) C where C.clinicalStatus ~ "ActiveCondition"
    and (C.onset as Period) overlaps over

/**
 * IsVerified(X) — narrative: `<X> verified`. Returns the verified list.
 */
define function "IsVerified"(X List<Observation>):
  (X) O where O.status in { 'final', 'amended', 'corrected' }
define function "IsVerified"(X List<Condition>):
  (X) C where C.verificationStatus ~ "Confirmed"

/**
 * DocumentedAs(X, classification) — narrative: `<X> documented as
 * <classification>`. Returns the X observations whose value matches a
 * classification code.
 */
define function "DocumentedAs"(X List<Observation>, classification List<Observation>):
  (X) O
    where exists ((classification) C where O.value as CodeableConcept ~ C.value as CodeableConcept)

// ====================================================================
// Qualification (temporal)
// ====================================================================

/**
 * During(event, period) — narrative: `<event> during <period>`. Returns
 * the events whose effective time falls within period.
 */
define function "During"(event List<Observation>, period List<Encounter>):
  (event) E with (period) P
    such that (E.effective as Period) during P.period
define function "During"(event List<Encounter>, period Interval<DateTime>):
  (event) E where E.period during period
define function "During"(event List<Observation>, period Interval<DateTime>):
  (event) E where (E.effective as Period) during period
define function "During"(event List<Procedure>, period Interval<DateTime>):
  (event) P where (P.performed as Period) during period
define function "During"(event List<Condition>, period Interval<DateTime>):
  (event) C where (C.onset as Period) during period
define function "During"(event List<ServiceRequest>, period Interval<DateTime>):
  (event) S where S.authoredOn during period
define function "During"(event List<MedicationRequest>, period Interval<DateTime>):
  (event) M where M.authoredOn during period

/**
 * Overlaps(eventA, eventB) — narrative: `<eventA> overlaps <eventB>`.
 * Returns eventA whose period overlaps eventB.
 */
define function "Overlaps"(eventA List<Observation>, eventB List<Encounter>):
  (eventA) A with (eventB) B
    such that (A.effective as Period) overlaps B.period
define function "Overlaps"(eventA List<Condition>, eventB List<Encounter>):
  (eventA) A with (eventB) B
    such that (A.onset as Period) overlaps B.period
define function "Overlaps"(eventA List<Observation>, eventB Interval<DateTime>):
  (eventA) A where (A.effective as Period) overlaps eventB

/**
 * OnDayOfOrAfter(X, anchor) — narrative: `<X> on day of or after
 * <anchor>`. Returns X whose start is on/after anchor's day.
 *
 * Correlated resource↔resource overloads (order/procedure X, Condition anchor)
 * express "the orders/procedures for which a qualifying condition was
 * documented on/before the order" — a day-granular, inclusive temporal
 * refinement producing the order SUBSET (not a boolean). The condition's
 * clinical time is its `onset as Period` start; the order's is `authoredOn`,
 * the procedure's is `performed`. Mirrors the published CMS69 correlation
 * (`Condition.prevalenceInterval() starts before or on day of order.authoredOn`).
 */
define function "OnDayOfOrAfter"(X List<Observation>, anchor List<Encounter>):
  (X) O with (anchor) E
    such that (O.effective as Period) starts on or after day of start of E.period
define function "OnDayOfOrAfter"(X List<ServiceRequest>, anchor List<Condition>):
  (X) O with (anchor) C
    such that (C.onset as Period) starts before or on day of O.authoredOn
define function "OnDayOfOrAfter"(X List<MedicationRequest>, anchor List<Condition>):
  (X) O with (anchor) C
    such that (C.onset as Period) starts before or on day of O.authoredOn
define function "OnDayOfOrAfter"(X List<Procedure>, anchor List<Condition>):
  (X) P with (anchor) C
    such that (C.onset as Period) starts before or on day of start of (P.performed as Period)

/**
 * OnOrBefore(X, anchor) — narrative: `<X> on or before <anchor>`.
 */
define function "OnOrBefore"(X List<Condition>, anchor DateTime):
  (X) C where (C.onset as Period) starts before or on day of anchor
define function "OnOrBefore"(X Boolean, anchor DateTime):
  X
define function "OnOrBefore"(X DateTime, anchor DateTime):
  X same day or before anchor

/**
 * SameDay(eventA, eventB) — narrative: `<eventA> same day as <eventB>`.
 * Returns eventA list filtered to same-day with eventB.
 */
define function "SameDay"(eventA List<Observation>, eventB List<Encounter>):
  (eventA) A with (eventB) B
    such that (A.effective as Period) same day as B.period
define function "SameDay"(eventA List<ServiceRequest>, eventB List<Encounter>):
  (eventA) S with (eventB) E
    such that S.authoredOn same day as start of E.period
define function "SameDay"(eventA List<MedicationRequest>, eventB List<Encounter>):
  (eventA) M with (eventB) E
    such that M.authoredOn same day as start of E.period
define function "SameDay"(eventA List<Procedure>, eventB List<Encounter>):
  (eventA) P with (eventB) E
    such that (P.performed as Period) same day as E.period

/**
 * BetweenAnchors(X, start, end) — narrative: `<X> between <start> and
 * <end>`. Returns X within the interval.
 */
define function "BetweenAnchors"(X List<Observation>, firstAnchor DateTime, lastAnchor DateTime):
  (X) E where (E.effective as Period) during Interval[firstAnchor, lastAnchor]
define function "BetweenAnchors"(X List<Encounter>, firstAnchor DateTime, lastAnchor DateTime):
  (X) E where E.period during Interval[firstAnchor, lastAnchor]

/**
 * AtLeastApart(eventA, eventB, duration) — narrative: `<eventA> and
 * <eventB> at least <duration> apart`. INHERENTLY BOOLEAN (pair-existence
 * predicate; no meaningful list-of-pairs realization at v0.2).
 */
define function "AtLeastApart"(eventA List<Observation>, eventB List<Observation>, len Quantity):
  exists (eventA) A with (eventB) B
    such that difference in days between
      (start of (A.effective as Period)) and (start of (B.effective as Period))
      >= ToDays(len)

/**
 * AtMostApart(eventA, eventB, duration) — narrative: `<eventA> and
 * <eventB> at most <duration> apart`. INHERENTLY BOOLEAN.
 */
define function "AtMostApart"(eventA List<Observation>, eventB List<Observation>, len Quantity):
  exists (eventA) A with (eventB) B
    such that difference in days between
      (start of (A.effective as Period)) and (start of (B.effective as Period))
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
 * MostRecent / LastOf / Earliest / FirstOf — selection patterns. Return
 * an `Instance<X>` (a single resource), not a list and not boolean.
 * Author declares the matching resource type; the emitter calls
 * directly. CQL's built-in `Last`/`First` are shadowed by user-defined
 * `LastOf`/`FirstOf` (the catalog uses `LastOf` etc. to avoid shadow).
 */
define function "MostRecent"(X List<Observation>):
  Last(X)
define function "MostRecent"(X List<Observation>, scope Interval<DateTime>):
  Last((X) O where (O.effective as Period) during scope)

define function "LastOf"(X List<Observation>):
  Last(X)
define function "LastOf"(X List<Observation>, scope Interval<DateTime>):
  Last((X) O where (O.effective as Period) during scope)

define function "Earliest"(X List<Observation>):
  First(X)
define function "Earliest"(X List<Observation>, scope Interval<DateTime>):
  First((X) O where (O.effective as Period) during scope)

define function "FirstOf"(X List<Observation>):
  First(X)
define function "FirstOf"(X List<Observation>, scope Interval<DateTime>):
  First((X) O where (O.effective as Period) during scope)

// ====================================================================
// Window-from-anchor sub-grammar
// ====================================================================

/**
 * Window-from-anchor sub-grammar. Return Interval<DateTime>. Stay as-is.
 */
define function "BeforeStartOf"(len System.Quantity, anchor List<Encounter>):
  Interval[
    (start of (First(anchor)).period) - len,
    (start of (First(anchor)).period)
  ]

define function "AfterStartOf"(len System.Quantity, anchor List<Encounter>):
  Interval[
    (start of (First(anchor)).period),
    (start of (First(anchor)).period) + len
  ]

define function "BeforeEndOf"(len System.Quantity, anchor List<Encounter>):
  Interval[
    (end of (First(anchor)).period) - len,
    (end of (First(anchor)).period)
  ]

define function "AfterEndOf"(len System.Quantity, anchor List<Encounter>):
  Interval[
    (end of (First(anchor)).period),
    (end of (First(anchor)).period) + len
  ]

define function "OnDayOf"(anchor List<Encounter>):
  Interval[
    date from (start of (First(anchor)).period),
    date from (start of (First(anchor)).period) + 1 day
  )

// ====================================================================
// Calculation
// ====================================================================

/**
 * AgeAt(anchor) — returns Quantity. Stays as-is.
 */
define function "AgeAt"(anchor DateTime):
  AgeInYearsAt(anchor)
define function "AgeAt"(anchor List<Encounter>):
  AgeInYearsAt(start of (First(anchor)).period)
// No-arg overload — the patient's age (in years) as of the ENGINE evaluation
// date (`Today()`, a Date). Keeps CQL's `Today()` off the author surface and off
// the `AgeAt(DateTime)` overload (which would type-error on a Date). `Today()`
// resolves to the `AgeInYearsAt(Date)` overload.
define function "AgeAt"():
  AgeInYearsAt(Today())
// No-arg MONTHS overload (#257 T2) — the patient's age in whole MONTHS as of the
// ENGINE evaluation date, for `age today <cmp> <n> months`. Truncates to whole
// months (CQL `AgeInMonthsAt`), mirroring `AgeAt()`'s whole-years truncation, and
// feeds the SAME unit-blind `<Op>(Integer, System.Quantity)` overloads below —
// correct ONLY because the threshold is also in months (the matcher pairs the
// compute fn with the unit; #215). NAMING: `AgeAt()` predates months and keeps its
// name for byte-identity; a future age unit should follow this `AgeIn<Unit>()`
// convention, not coin a third.
define function "AgeInMonths"():
  AgeInMonthsAt(Today())

/**
 * Calculate(X) — pass-through that surfaces a derived Quantity.
 */
define function "Calculate"(X Quantity):
  X

/**
 * Lowest / Highest — return Quantity (the min/max value). Stay as-is.
 */
define function "Lowest"(X List<Observation>):
  Min((X) O return FHIRHelpers.ToQuantity(O.value as Quantity))
define function "Lowest"(X List<Observation>, scope Interval<DateTime>):
  Min((X) O
    where (O.effective as Period) during scope
    return FHIRHelpers.ToQuantity(O.value as Quantity))

define function "Highest"(X List<Observation>):
  Max((X) O return FHIRHelpers.ToQuantity(O.value as Quantity))
define function "Highest"(X List<Observation>, scope Interval<DateTime>):
  Max((X) O
    where (O.effective as Period) during scope
    return FHIRHelpers.ToQuantity(O.value as Quantity))

/**
 * AtLeastN / Consecutive — INHERENTLY BOOLEAN count predicates.
 */
define function "AtLeastN"(events List<Observation>, n Integer):
  Count(events) >= n

define function "Consecutive"(events List<Observation>, n Integer):
  Count(events) >= n
  // FIXME: refine to require temporal contiguity per measure semantics.

/**
 * High / Low / Normal / Abnormal — INHERENTLY BOOLEAN range classifiers.
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
 *   - cross-type (Integer × Quantity) — for whole-unit Integer ages compared
 *     to Quantity thresholds. Carried on AtLeast (`age today at least`),
 *     AtMost (`age today at most`), and Below (`age today under`/`younger than`)
 *     so every sanctioned age-predicate comparator resolves (#215). The overload
 *     is unit-BLIND (compares `.value` only), so the unit guard at the match is
 *     load-bearing: it pairs the compute fn (`AgeAt()` years / `AgeInMonths()`
 *     months, #257 T2) with the threshold's unit so like is compared to like.
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

define function "Between"(value Quantity, lo Quantity, hi Quantity):
  value >= lo and value < hi
define function "Between"(value Integer, lo Integer, hi Integer):
  value >= lo and value < hi
define function "Between"(values List<Observation>, lo Quantity, hi Quantity):
  exists (values) V
    where (V.value as Quantity) >= lo and (V.value as Quantity) < hi
define function "Between"(values List<System.Quantity>, lo System.Quantity, hi System.Quantity):
  exists (values) v where v >= lo and v < hi

define function "Exceeds"(value Quantity, target Quantity):
  value > target
define function "Exceeds"(value Integer, target Integer):
  value > target
define function "Exceeds"(values List<Observation>, target Quantity):
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
// State / Process Inference
// ====================================================================

/**
 * WasPerformed(X) — narrative: `<X> performed`. Returns the performed
 * resource list. Per-resource status discriminator.
 */
define function "WasPerformed"(X List<Procedure>):
  (X) P where P.status = 'completed'
define function "WasPerformed"(X List<ServiceRequest>):
  (X) S where S.status = 'completed'
define function "WasPerformed"(X List<Observation>):
  (X) O where O.status in { 'final', 'amended', 'corrected' }
define function "WasPerformed"(X List<Encounter>):
  (X) E where E.status = 'finished'
define function "WasPerformed"(X List<MedicationRequest>):
  (X) M where M.status = 'completed'
