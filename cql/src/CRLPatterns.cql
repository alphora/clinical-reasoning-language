library CRLPatterns version '0.1.0'

/*
 * CRLPatterns — the CRL→CQL emitter's target library.
 *
 * Each function below implements one entry in the inference-pattern catalog
 * (features/cql-pattern-mining/results/inference-pattern-catalog-draft.md).
 * The catalog row's `CQL function` column points here.
 *
 * Design notes:
 *
 * 1. Type strategy. CQL is statically typed and lacks generics, so patterns
 *    that range over heterogeneous FHIR resources have multiple overloads —
 *    one per resource type the corpus uses (Condition, Encounter,
 *    Observation, Procedure, ServiceRequest, MedicationRequest,
 *    AllergyIntolerance). Patterns that range over Quantity-bearing concepts
 *    take a `Quantity` parameter; temporal patterns take `Choice<DateTime,
 *    Period, Interval<DateTime>>` where useful.
 *
 * 2. Subject under test. CRL is patient-context — every pattern is implicitly
 *    "for the patient in scope". CQL's `context Patient` declaration applies
 *    transitively to caller libraries; this library does not redeclare it.
 *
 * 3. Helper dependencies. We lean on QICoreCommon for normalized temporal
 *    helpers (`prevalenceInterval`, `toInterval`, `earliest`, `latest`) and
 *    on FHIRHelpers for primitive coercion. The set of allowed helpers is
 *    documented in `issues/rough-backlog.md` (helper-library inventory).
 *
 * 4. Versioning. v0.1.0 is the first cut: every catalog row has a function;
 *    several have FIXME bodies awaiting better source-CQL precedent. The
 *    CRL→CQL emitter (todo) will exercise these and surface gaps.
 *
 * 5. Per-pattern docs. Each function carries a short comment naming the
 *    catalog row it implements. The catalog is the source of truth for
 *    narrative form, intent, and parameter naming.
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
 * Has(X) — narrative: `has <X>`.
 * Patient-level existence check on a refinable list of resources.
 * Overloaded across the FHIR resource types the corpus exercises.
 */
define function "Has"(X List<Condition>):
  exists X
define function "Has"(X List<Encounter>):
  exists X
define function "Has"(X List<Observation>):
  exists X
define function "Has"(X List<Procedure>):
  exists X
define function "Has"(X List<ServiceRequest>):
  exists X
define function "Has"(X List<MedicationRequest>):
  exists X
define function "Has"(X List<AllergyIntolerance>):
  exists X

/**
 * HasHistoryOf(X[, anchor]) — narrative: `has history of <X>` (optionally
 * `prior to <anchor>`). The conditional history is X resolved before the
 * anchor; if no anchor, "ever in the patient's history" (which collapses to
 * Has). Implemented for Condition where prevalenceInterval is meaningful;
 * other resource types follow similar prevalence-vs-anchor logic.
 */
define function "HasHistoryOf"(X List<Condition>):
  exists X
define function "HasHistoryOf"(X List<Condition>, anchor DateTime):
  exists (X) C where (C.onset as Period) ends before anchor

/**
 * Without(kind, X) — narrative: `without <kind> <X>`. The parameterized
 * umbrella selects a query shape from the `kind` enum:
 *   - record-of: `not exists X` (no record of X in the patient's chart)
 *   - documented: `not exists X` AND no `Observation/Condition` indicating X
 *   - evidence-of: similar to documented but broader
 *   - result-for: `not exists` for the observation result kind
 * For v0.1 each kind reduces to `not exists`; future versions will branch
 * per kind.
 */
define function "Without"(kind String, X List<Condition>):
  not exists X
define function "Without"(kind String, X List<Observation>):
  not exists X
define function "Without"(kind String, X List<Procedure>):
  not exists X

/**
 * CurrentlyTaking(med) — narrative: `currently taking <med>`.
 * Active medication. Uses MedicationStatement if available; falls back to
 * MedicationRequest with active status.
 */
define function "CurrentlyTaking"(med List<MedicationRequest>):
  exists (med) M where M.status = 'active'

/**
 * HasAdverseReactionTo(X) — narrative: `has adverse reaction to <X>`.
 * The patient has a recorded allergy/intolerance to the X substance.
 */
define function "HasAdverseReactionTo"(X List<AllergyIntolerance>):
  exists (X) A where A.clinicalStatus ~ "AllergyActive"

// ====================================================================
// Contextualization
// ====================================================================

/**
 * With(X, Y) — narrative: `<X> with <Y>`. Correlates X with a subject-
 * bound predicate Y. Y is typically a temporal or value predicate on each
 * X element. Simplest form: "X exists for which Y holds". Real
 * implementation requires Y to be a closure over an X element; v0.1
 * provides a boolean-Y overload.
 */
define function "With"(X List<Observation>, Y Boolean):
  exists (X) E where Y

/**
 * AsOf(anchor, X) — narrative: `<X> as of <anchor>`. X resolved in the
 * temporal context of `anchor`. Most common: anchor is a Period (encounter
 * period) and X is a Condition; we check that the condition's prevalence
 * overlaps the anchor.
 */
define function "AsOf"(anchor List<Encounter>, X List<Condition>):
  exists (X) C with (anchor) E
    such that (C.onset as Period) overlaps (E.period)
define function "AsOf"(anchor DateTime, X List<Condition>):
  exists (X) C where (C.onset as Period) contains anchor
define function "AsOf"(anchor Period, X List<Condition>):
  exists (X) C where (C.onset as Period) overlaps (FHIRHelpers.ToInterval(anchor))

/**
 * Within(X, window) — narrative: `<X> within <window>`. X happens during
 * the named window. `window` is a ConceptRef resolving to a Period/Interval
 * or a `WindowSpec` from a window-from-anchor sub-grammar call.
 */
define function "Within"(X List<Observation>, window Interval<DateTime>):
  exists (X) E where (E.effective as Period) during window
define function "Within"(X List<Procedure>, window Interval<DateTime>):
  exists (X) P where (P.performed as Period) during window
define function "Within"(X List<Encounter>, window Interval<DateTime>):
  exists (X) E where E.period during window

/**
 * ComponentOf(panel, discriminator) — narrative: `<discriminator> component
 * of <panel>`. Returns the components of `panel` whose code is in
 * `discriminator`. Used heavily in BP (systolic/diastolic) and BMI panels.
 */
define function "ComponentOf"(panel List<Observation>, discriminator List<Observation>):
  flatten (
    (panel) P return (
      P.component O where exists ((discriminator) D where D.code ~ O.code)
    )
  )

/**
 * NotDoneWithReason(action, reason) — narrative: `<action> not done with
 * reason <reason>`. The action was cancelled/refused with a documented
 * reason in the reason set. Maps to the cancelled/not-requested QICore
 * profiles per resource.
 */
define function "NotDoneWithReason"(action List<Observation>, reason List<Observation>):
  exists (action) A
    where A.status = 'cancelled' or A.status = 'entered-in-error'
define function "NotDoneWithReason"(action List<ServiceRequest>, reason List<Observation>):
  exists (action) A
    where A.status = 'revoked' or A.status = 'completed'
define function "NotDoneWithReason"(action List<MedicationRequest>, reason List<Observation>):
  exists (action) A
    where A.status = 'cancelled' or A.status = 'stopped'

/**
 * BaselineAndFollowUp(initial, followup) — narrative: `<initial> with
 * follow-up <followup>`. The initial observation has a related follow-up.
 * Used for screening-and-follow-up composite measures.
 */
define function "BaselineAndFollowUp"(initial List<Observation>, followup List<Observation>):
  exists (initial) I with (followup) F
    such that start of (F.effective as Period) after end of (I.effective as Period)

/**
 * InpatientStay(encounter[, includePrelude]) — narrative: `inpatient stay
 * anchored on <encounter>` (optionally `including prelude`). Returns the
 * Period covering the inpatient stay; with prelude, includes ED/observation
 * pre-admission window.
 */
define function "InpatientStay"(encounter List<Encounter>):
  First((encounter) E return E.period)
define function "InpatientStay"(encounter List<Encounter>, includePrelude Boolean):
  First((encounter) E return
    if includePrelude then E.period else E.period
  )

/**
 * WasOrdered(X) — narrative: `<X> ordered`. The request was created/placed.
 */
define function "WasOrdered"(X List<ServiceRequest>):
  exists (X) R where R.status in { 'active', 'completed', 'on-hold' }
    and R.intent = 'order'
define function "WasOrdered"(X List<MedicationRequest>):
  exists (X) R where R.status in { 'active', 'completed', 'on-hold' }
    and R.intent = 'order'

// ====================================================================
// Assertion
// ====================================================================

/**
 * Justified(action, reason) — narrative: `<action> justified by <reason>`.
 * The action carries a reasonCode/reasonReference referencing the reason.
 * The corpus expresses this with `reasonCode in <vs>` OR `reasonReference
 * matches an existing condition`.
 */
define function "Justified"(action List<ServiceRequest>, reason List<Condition>):
  exists (action) A
    where exists (reason) R where R.code ~ singleton from (A.reasonCode)
define function "Justified"(action List<MedicationRequest>, reason List<Condition>):
  exists (action) A
    where exists (reason) R where R.code ~ singleton from (A.reasonCode)
define function "Justified"(action List<Procedure>, reason List<Condition>):
  exists (action) A
    where exists (reason) R where R.code ~ singleton from (A.reasonCode)
define function "Justified"(action List<ServiceRequest>, reason List<Observation>):
  exists (action) A
    where exists (reason) R where (R.value as CodeableConcept) ~ singleton from (A.reasonCode)
define function "Justified"(action List<MedicationRequest>, reason List<Observation>):
  exists (action) A
    where exists (reason) R where (R.value as CodeableConcept) ~ singleton from (A.reasonCode)
define function "Justified"(action List<Procedure>, reason List<Observation>):
  exists (action) A
    where exists (reason) R where (R.value as CodeableConcept) ~ singleton from (A.reasonCode)

/**
 * Active(X[, during]) — narrative: `<X> is active` (optionally `during
 * <period>`). For Condition: clinicalStatus is 'active'. With `during`:
 * additionally constrained to overlap the period.
 */
define function "Active"(X List<Condition>):
  exists (X) C where C.clinicalStatus ~ "ActiveCondition"
define function "Active"(X List<Condition>, over List<Encounter>):
  exists (X) C where C.clinicalStatus ~ "ActiveCondition"
    and exists (over) E where (C.onset as Period) overlaps (E.period)
define function "Active"(X List<Condition>, over Interval<DateTime>):
  exists (X) C where C.clinicalStatus ~ "ActiveCondition"
    and (C.onset as Period) overlaps over

/**
 * IsVerified(X) — narrative: `<X> is verified`. For Observation:
 * status in {final, amended, corrected}. For Condition:
 * verificationStatus 'confirmed'.
 */
define function "IsVerified"(X List<Observation>):
  exists (X) O where O.status in { 'final', 'amended', 'corrected' }
define function "IsVerified"(X List<Condition>):
  exists (X) C where C.verificationStatus ~ "Confirmed"

/**
 * DocumentedAs(X, classification) — narrative: `<X> documented as
 * <classification>`. X's value resolves to a code in the classification set.
 */
define function "DocumentedAs"(X List<Observation>, classification List<Observation>):
  exists (X) O
    where exists (classification) C where O.value as CodeableConcept ~ C.value as CodeableConcept

// ====================================================================
// Qualification (temporal)
// ====================================================================

/**
 * During(event, period) — narrative: `<event> during <period>`. The event's
 * effective time is contained in the period's interval.
 */
define function "During"(event List<Observation>, period List<Encounter>):
  exists (event) E with (period) P
    such that (E.effective as Period) during P.period
define function "During"(event List<Encounter>, period Interval<DateTime>):
  exists (event) E where E.period during period
define function "During"(event List<Procedure>, period Interval<DateTime>):
  exists (event) P where (P.performed as Period) during period
define function "During"(event DateTime, period Interval<DateTime>):
  event during period
define function "During"(event Interval<DateTime>, period Interval<DateTime>):
  event during period

/**
 * Overlaps(eventA, eventB) — narrative: `<eventA> overlaps <eventB>`.
 * Temporal overlap.
 */
define function "Overlaps"(eventA List<Observation>, eventB List<Encounter>):
  exists (eventA) A with (eventB) B
    such that (A.effective as Period) overlaps B.period
define function "Overlaps"(eventA List<Condition>, eventB List<Encounter>):
  exists (eventA) A with (eventB) B
    such that (A.onset as Period) overlaps B.period
define function "Overlaps"(eventA List<Observation>, eventB Interval<DateTime>):
  exists (eventA) A where (A.effective as Period) overlaps eventB

/**
 * OnDayOfOrAfter(X, anchor) — narrative: `<X> on day of or after <anchor>`.
 * X happens on the anchor's day or later.
 */
define function "OnDayOfOrAfter"(X List<Observation>, anchor List<Encounter>):
  exists (X) O with (anchor) E
    such that (O.effective as Period) starts on or after day of start of E.period

/**
 * OnOrBefore(X, anchor) — narrative: `<X> on or before <anchor>`. X's
 * timing falls at or before the anchor.
 */
define function "OnOrBefore"(X List<Condition>, anchor DateTime):
  exists (X) C where (C.onset as Period) starts before or on day of anchor
define function "OnOrBefore"(X Boolean, anchor DateTime):
  X
define function "OnOrBefore"(X DateTime, anchor DateTime):
  X same day or before anchor

/**
 * SameDay(eventA, eventB) — narrative: `<eventA> same day as <eventB>`.
 * Both events occur on the same calendar day.
 */
define function "SameDay"(eventA List<Observation>, eventB List<Encounter>):
  exists (eventA) A with (eventB) B
    such that (A.effective as Period) same day as B.period
define function "SameDay"(eventA List<ServiceRequest>, eventB List<Encounter>):
  exists (eventA) S with (eventB) E
    such that S.authoredOn same day as start of E.period
define function "SameDay"(eventA List<MedicationRequest>, eventB List<Encounter>):
  exists (eventA) M with (eventB) E
    such that M.authoredOn same day as start of E.period
define function "SameDay"(eventA List<Procedure>, eventB List<Encounter>):
  exists (eventA) P with (eventB) E
    such that (P.performed as Period) same day as E.period

/**
 * BetweenAnchors(X, start, end) — narrative: `<X> between <start> and
 * <end>`. X happens between two ConceptRef anchors. Distinct from
 * Between(value, lo, hi) which compares Quantities.
 */
define function "BetweenAnchors"(X List<Observation>, firstAnchor DateTime, lastAnchor DateTime):
  exists (X) E where (E.effective as Period) during Interval[firstAnchor, lastAnchor]
define function "BetweenAnchors"(X List<Encounter>, firstAnchor DateTime, lastAnchor DateTime):
  exists (X) E where E.period during Interval[firstAnchor, lastAnchor]

/**
 * AtLeastApart(eventA, eventB, duration) — narrative: `<eventA> and
 * <eventB> at least <duration> apart`. Temporal separation lower bound.
 */
define function "AtLeastApart"(eventA List<Observation>, eventB List<Observation>, len Quantity):
  exists (eventA) A with (eventB) B
    such that difference in days between
      (start of (A.effective as Period)) and (start of (B.effective as Period))
      >= ToDays(len)

/**
 * AtMostApart(eventA, eventB, duration) — narrative: `<eventA> and
 * <eventB> at most <duration> apart`. Temporal separation upper bound.
 */
define function "AtMostApart"(eventA List<Observation>, eventB List<Observation>, len Quantity):
  exists (eventA) A with (eventB) B
    such that difference in days between
      (start of (A.effective as Period)) and (start of (B.effective as Period))
      <= ToDays(len)

/**
 * Helper: convert a UCUM time quantity to a day count. Lets the temporal
 * separation patterns accept weeks/months without changing every call site.
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
 * MostRecent(X[, scope]) — narrative: `most recent <X>`. The latest X by
 * effective/performed/authoredOn date, optionally restricted to a scope.
 */
define function "MostRecent"(X List<Observation>):
  Last(X)
define function "MostRecent"(X List<Observation>, scope Interval<DateTime>):
  Last((X) O where (O.effective as Period) during scope)

/**
 * Last(X[, scope]) — narrative: `last <X>`. Same as MostRecent — separate
 * pattern in the catalog to match natural narrative phrasing. User-defined
 * with `Of` suffix to avoid shadowing the CQL built-in `Last(list)`.
 */
define function "LastOf"(X List<Observation>):
  Last(X)
define function "LastOf"(X List<Observation>, scope Interval<DateTime>):
  Last((X) O where (O.effective as Period) during scope)

/**
 * Earliest(X[, scope]) — narrative: `earliest <X>`. The earliest X by
 * effective date, optionally restricted to a scope.
 */
define function "Earliest"(X List<Observation>):
  First(X)
define function "Earliest"(X List<Observation>, scope Interval<DateTime>):
  First((X) O where (O.effective as Period) during scope)

/**
 * First(X[, scope]) — narrative: `first <X>`. Same as Earliest — `Of`
 * suffix avoids shadowing the CQL built-in.
 */
define function "FirstOf"(X List<Observation>):
  First(X)
define function "FirstOf"(X List<Observation>, scope Interval<DateTime>):
  First((X) O where (O.effective as Period) during scope)

// ====================================================================
// Window-from-anchor sub-grammar
// ====================================================================

/**
 * BeforeStartOf(duration, anchor) — narrative: `<duration> before start of
 * <anchor>`. The window of length `duration` ending at the start of anchor.
 */
define function "BeforeStartOf"(len Quantity, anchor List<Encounter>):
  Interval[
    (start of (First(anchor)).period) - len,
    (start of (First(anchor)).period)
  ]

/**
 * AfterStartOf(duration, anchor) — narrative: `<duration> after start of
 * <anchor>`. The window of length `duration` starting at the start of anchor.
 */
define function "AfterStartOf"(len Quantity, anchor List<Encounter>):
  Interval[
    (start of (First(anchor)).period),
    (start of (First(anchor)).period) + len
  ]

/**
 * BeforeEndOf(duration, anchor) — narrative: `<duration> before end of
 * <anchor>`. The window of length `duration` ending at the end of anchor.
 */
define function "BeforeEndOf"(len Quantity, anchor List<Encounter>):
  Interval[
    (end of (First(anchor)).period) - len,
    (end of (First(anchor)).period)
  ]

/**
 * AfterEndOf(duration, anchor) — narrative: `<duration> after end of
 * <anchor>`. The window of length `duration` starting at the end of anchor.
 */
define function "AfterEndOf"(len Quantity, anchor List<Encounter>):
  Interval[
    (end of (First(anchor)).period),
    (end of (First(anchor)).period) + len
  ]

/**
 * OnDayOf(anchor) — narrative: `on day of <anchor>`. The calendar-day
 * interval of anchor's start. Duration-free variant of the window family.
 */
define function "OnDayOf"(anchor List<Encounter>):
  Interval[
    date from (start of (First(anchor)).period),
    date from (start of (First(anchor)).period) + 1 day
  )

// ====================================================================
// Calculation
// ====================================================================

/**
 * AgeAt(anchor) — narrative: `age at <anchor>`. The patient's age in years
 * at the given anchor. Anchors may be encounter starts, dates, periods, etc.
 */
define function "AgeAt"(anchor DateTime):
  AgeInYearsAt(anchor)
define function "AgeAt"(anchor List<Encounter>):
  AgeInYearsAt(start of (First(anchor)).period)

/**
 * Calculate(X) — narrative: `calculated <X>`. Pass-through that surfaces
 * a derived Quantity; the actual derivation is in X's CRL declaration
 * (typically an inferred-from chain).
 */
define function "Calculate"(X Quantity):
  X

/**
 * Lowest(X[, scope]) — narrative: `lowest <X>`. The minimum value in X,
 * optionally within a scope.
 */
define function "Lowest"(X List<Observation>):
  Min((X) O return FHIRHelpers.ToQuantity(O.value as Quantity))
define function "Lowest"(X List<Observation>, scope Interval<DateTime>):
  Min((X) O
    where (O.effective as Period) during scope
    return FHIRHelpers.ToQuantity(O.value as Quantity))

/**
 * Highest(X[, scope]) — narrative: `highest <X>`. The maximum value in X,
 * optionally within a scope.
 */
define function "Highest"(X List<Observation>):
  Max((X) O return FHIRHelpers.ToQuantity(O.value as Quantity))
define function "Highest"(X List<Observation>, scope Interval<DateTime>):
  Max((X) O
    where (O.effective as Period) during scope
    return FHIRHelpers.ToQuantity(O.value as Quantity))

/**
 * AtLeastN(events, n) — narrative: `at least <n> <events>`. The count of
 * events meets or exceeds n.
 */
define function "AtLeastN"(events List<Observation>, n Integer):
  Count(events) >= n

/**
 * Consecutive(events, n) — narrative: `<n> consecutive <events>`. There
 * exist n events ordered in time with no qualifying event between them.
 * v0.1 is a minimum-count placeholder; refining the "consecutive" semantic
 * requires a per-measure definition.
 */
define function "Consecutive"(events List<Observation>, n Integer):
  Count(events) >= n
  // FIXME: refine to require temporal contiguity per measure semantics.

/**
 * High(X) — narrative: `<X> is high`. Quantity-comparator classification.
 * The high threshold is measure-specific; v0.1 expects the threshold to be
 * carried in the input via a discriminator concept.
 */
define function "High"(X Quantity, threshold Quantity):
  X > threshold

/**
 * Low(X) — narrative: `<X> is low`. Quantity-comparator classification.
 */
define function "Low"(X Quantity, threshold Quantity):
  X < threshold

/**
 * Normal(X) — narrative: `<X> is normal`. Within a normal range.
 */
define function "Normal"(X Quantity, lo Quantity, hi Quantity):
  X >= lo and X < hi

/**
 * Abnormal(X) — narrative: `<X> is abnormal`. Outside a normal range.
 */
define function "Abnormal"(X Quantity, lo Quantity, hi Quantity):
  X < lo or X >= hi

/**
 * AtLeast(value, target) — narrative: `<value> at least <target>`.
 */
define function "AtLeast"(value Quantity, target Quantity):
  value >= target
define function "AtLeast"(value Integer, target Integer):
  value >= target

/**
 * AtMost(value, target) — narrative: `<value> at most <target>`.
 */
define function "AtMost"(value Quantity, target Quantity):
  value <= target
define function "AtMost"(value Integer, target Integer):
  value <= target

/**
 * Between(value, lo, hi) — narrative: `<value> between <lo> and <hi>`.
 * Quantity comparator; closed-on-low, half-open-on-high per the catalog's
 * round-3 clarification.
 */
define function "Between"(value Quantity, lo Quantity, hi Quantity):
  value >= lo and value < hi
define function "Between"(value Integer, lo Integer, hi Integer):
  value >= lo and value < hi

/**
 * Exceeds(value, target) — narrative: `<value> exceeds <target>`.
 */
define function "Exceeds"(value Quantity, target Quantity):
  value > target
define function "Exceeds"(value Integer, target Integer):
  value > target

/**
 * Below(value, target) — narrative: `<value> below <target>`.
 */
define function "Below"(value Quantity, target Quantity):
  value < target
define function "Below"(value Integer, target Integer):
  value < target

// ====================================================================
// State / Process Inference
// ====================================================================

/**
 * WasPerformed(X) — narrative: `<X> performed`. The action was completed.
 * Resource-specific status discriminator.
 */
define function "WasPerformed"(X List<Procedure>):
  exists (X) P where P.status = 'completed'
define function "WasPerformed"(X List<ServiceRequest>):
  exists (X) S where S.status = 'completed'
define function "WasPerformed"(X List<Observation>):
  exists (X) O where O.status in { 'final', 'amended', 'corrected' }
define function "WasPerformed"(X List<Encounter>):
  exists (X) E where E.status = 'finished'
define function "WasPerformed"(X List<MedicationRequest>):
  exists (X) M where M.status = 'completed'
