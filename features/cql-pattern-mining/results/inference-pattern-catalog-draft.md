# CRL clinical inference patterns — draft catalog v0.3.1

> **Status: draft v0.3.1** (v0.3 expanded after end-to-end modeling of CMS69 surfaced 4 gaps; v0.3.1 re-tiers two cards after operator review of `Justified`'s category). **43 patterns** across the inference taxonomy — corpus-true count, no padding to 50. Operator notes the catalog should land "around 50 if discrimination is right"; 43 is in the corridor.
>
> **v0.3 additions** (from CMS69 modeling): `Justified` (specialization for reason-code checks), `OnOrBefore`, `SameDay`. The CMS69 `class != virtual` case is handled via **concept-based negation** — define `Virtual Encounters` as its own concept and negate it (`not "Virtual Encounters"`), rather than via an ad-hoc property-check pattern. This is the idiomatic CRL approach for "where property = value" checks; see `project_crl-cql-composition-architecture` memory.
>
> **v0.3.1 re-tier** (operator review): `Justified` moved from Contextualization → Assertion. `Active` moved from State/Process Inference → Assertion. Rationale: both add clinical-assertion semantics (justificatory link; currently-relevant status) rather than constraining or selecting. See the Assertion section note. `WasPerformed` stays in State/Process Inference as the remaining state-of-resource predicate.

## Reading the catalog

Every entry:
- **name** — informaticist-natural; what a doctor would say (test: the pattern name + filled-in argument should read as a clinical phrase, not as an API call)
- **intent** — one-line declarative description; the WHAT
- **params** — clinical parameter sketch; no implementation typing
- **category** — primary; secondary in italics if relevant
- **maturity** — `strong` (multi-layer evidence across many measures) / `moderate` (clear signal but narrower) / `thin` (corpus-sparse; on the boundary of v0.3)
- **evidence** — Layer-1 (names) + Layer-2 (body shapes / helper calls) + Layer-3 (compositions across defines)
- **examples** — corpus callers (`library :: statement name`)
- **anti-example** — distinguishes from the nearest-neighbor pattern

Two patterns use the **parameterized-umbrella** technique (one name + a clinical discriminator enum, where each filled-in variant reads as the doctor's phrase): **`Without(kind, X)`** and **`AsOf(anchor, X)`**.

## Quick index

| Category | Patterns |
|---|---|
| Classification | `Has(X[, when])`, `HasHistoryOf(X[, anchor])`, `Without(kind, X)`, `CurrentlyTaking(med)`, `HasAdverseReactionTo(X)` |
| Contextualization | `With(X, Y)`, `AsOf(anchor, X)`, `NotDoneWithReason(action, reason)`, `BaselineAndFollowUp(initial, followup)`, `InpatientStay(encounter[, includePrelude])`, `WasOrdered(X)` |
| Assertion | `Justified(action, reason)`, `Active(X[, during])`, `Verified(X)`, `DocumentedAs(X, classification)` |
| Qualification (temporal) | `MostRecent(X[, anchor])`, `Last(X[, anchor])`, `Earliest(X[, anchor])`, `First(X[, anchor])`, `During(event, period)`, `Within(X, window)`, `Overlaps(eventA, eventB)`, `OnDayOfOrAfter(X, anchor)`, `OnOrBefore(X, anchor)`, `SameDay(eventA, eventB)`, `BetweenAnchors(X, start, end)`, `AtLeastDaysApart(eventA, eventB, n)`, `AtMostDaysApart(eventA, eventB, n)` |
| Calculation | `AgeAt(anchor)`, `Calculate(X)`, `Lowest(X)`, `Highest(X)`, `AtLeastN(events, n)`, `Consecutive(events, n)`, `High(X)`, `Low(X)`, `Normal(X)`, `Abnormal(X)`, `AtLeast(value, target)`, `AtMost(value, target)`, `Exceeds(value, target)`, `Below(value, target)` |
| State / Process Inference | `WasPerformed(X)` |

## Patterns dropped from v0.1 (and why)

- **`PrevalenceInterval(condition)`** — HOW. Helper-derived Period the emitter picks; informaticist says "condition active during X" → `Active(condition[, during])`. Helper-call evidence folded into `Active`.
- **`MedicationPeriod(record)`** — same shape; folded into `Active(medication[, during])`.
- **`OffsetFromAnchor(X, anchor, offset)`** — "offset" leaks calendar-arithmetic. Renamed `OnDayOfOrAfter(X, anchor)` + split out `BetweenAnchors(X, start, end)` for the From-To form.
- **`ScreeningWithFollowUp(screening, followup, window)`** — not a primitive; composite the informaticist writes as `With(my-screening, my-followup-action)` (screening is a Retrieve concept, follow-up is a type).
- **`RiskAdjusted(observation, adjusters)`** — framework, not pattern (like IP/Num/Den). Clinical reasoning lives *inside* risk-adjustment defines.
- **`EncounterWith(criterion)`** / **`QualifyingEncounter(criterion)`** — folded into `With(encounter, criterion)`.
- **`StateAtAnchor(X, anchor)`** — renamed `AsOf(anchor, X)` (passes the filled-in test: "as of admission, X").
- **`PresentOnAdmission(diagnosis)`** — specialization of `AsOf(admission, diagnosis-present)`; not a separate card.
- **`OnAdmission(X)` / `AtDischarge(X)` / `DuringEncounter(event)`** — covered by `AsOf` and `During(event, encounter)`.
- **`Threshold(value, op, target)`** — split into individual primitives that pass the filled-in test (see Calculation).
- **`Count(events)` / `CountAtLeast(events, n)`** — collapsed to `AtLeastN(events, n)` (counting-without-threshold is degenerate).
- **`LatestValue(field)`** anti-example mention removed (was a HOW slip).
- **`Hospitalization(encounter)`** — renamed `InpatientStay(encounter[, includePrelude])`.
- **`AssessmentPair(initial, followup)`** — renamed `BaselineAndFollowUp(initial, followup)`.
- ~~**`First(X) / Last(X)`** — merged into `Earliest(X[, anchor])` paired with `MostRecent(X[, anchor])`.~~ **Restored after operator pushback.** All four (`MostRecent`/`Last`/`Earliest`/`First`) pass the filled-in test independently as doctor's phrases ("last BMI", "first dose"). Each has subtly different clinical connotation in narrative: `MostRecent` emphasizes recency from now; `Last` emphasizes finality within a scope; `First` emphasizes initiation within a scope; `Earliest` is the analytical synonym of `First`. Rule-of-thumb fails the merge.
- **`ConditionActiveDuring(condition, period)`** — folded into `Active(X[, during])`.
- **`ClinicalRangeClassification`** — split into doctor-natural primitives `High`, `Low`, `Normal`, `Abnormal`.

---

## Classification

### `Has(X[, when])`
- **intent** — patient has qualifying evidence of X (optionally restricted to a temporal scope)
- **params** — `X` (clinical concept); `when` optional temporal qualifier (a `During(...)`, `Before(...)`, `After(...)` sub-expression)
- **category** — Classification *(foundational; composes with most others)*
- **maturity** — strong
- **evidence** — L1: `Has …` is the dominant naming shape (60+ distinct n-gram families). L2: body root often `Exists(Retrieve)` or `Exists(Query)`. L3: appears as input to almost every higher-order composition.
- **examples** — `CMS117 :: Has HIV`, `CMS117 :: Has Severe Combined Immunodeficiency`, `CMS135 :: Has Diagnosis of Pregnancy`, `CMS1154 :: Has Pregnancy Diagnosis During Measurement Period` (the `when` form)
- **anti-example** — not `Has(X)` if the assertion is specifically about state-at-an-anchor (use `AsOf(anchor, X)`), or about reasons / contraindications (use `HasAdverseReactionTo(X)` or `NotDoneWithReason(action, reason)`).

### `HasHistoryOf(X[, anchor])`
- **intent** — patient had X in the past (prior to a clinical anchor, often resolved or significant)
- **params** — `X`; `anchor` optional (defaults to current/now)
- **category** — Classification *, secondary Qualification*
- **maturity** — moderate
- **evidence** — L1: `History of` (3+), `Prior MI` family.
- **examples** — `CMS137 :: History of SUD Diagnosis or Treatment`, `CMS145 :: History of Cardiac Surgery Prior to Encounter`, `CMS2 :: History of Bipolar Diagnosis Before Qualifying Encounter`
- **anti-example** — `Has(X)` if the condition is current/relevant *now*. `HasHistoryOf` implies past/resolved.

### `Without(kind, X)` *(parameterized umbrella)*
- **intent** — qualifying evidence of X is absent (in a clinically specific way)
- **params** — `kind` ∈ {`record-of`, `documented`, `evidence-of`, `result-for`}; `X`
- **category** — Classification
- **maturity** — strong
- **filled-in reads:**
  - `Without(record-of, BMI)` → "without record of BMI in the patient's data"
  - `Without(documented, allergy)` → "without documented allergy" (clinical assertion of absence)
  - `Without(evidence-of, screening)` → "without evidence of screening performed"
  - `Without(result-for, A1c-test)` → "without result for A1c test"
- **evidence** — L1: `No VTE Prophylaxis` (10), `No Mechanical VTE` (8), `Has No Record Of`, `Without Result`. L2: 7 `absence-of`-tagged statements.
- **examples** — `CMS108 :: No VTE Prophylaxis Medication Administered Or Ordered` (`evidence-of`), `CMS122 :: Has No Record Of Glycemic Status Assessment` (`record-of`), `CMS122 :: Has Most Recent Glycemic Status Assessment Without Result` (`result-for`)
- **anti-example** — when the absence has a documented reason, use `NotDoneWithReason(action, reason)` — the reason parameter is clinically load-bearing and distinct.

### `CurrentlyTaking(med)`
- **intent** — patient is currently on medication X
- **params** — `med`
- **category** — Classification *, secondary State Inference*
- **maturity** — moderate
- **evidence** — L1: `Is Currently Taking` (4). L2: body is `Exists(MedicationRequest…where status=active)`.
- **examples** — `CMS135 :: Is Currently Taking ACEI or ARB or ARNI`, `CMS144 :: Is Currently Taking Beta Blocker Therapy for LVSD`
- **anti-example** — `Active(med, during(measurement-period))` if the question is *was on the medication at some point during a period*, not specifically *taking it now*.

### `HasAdverseReactionTo(X)`
- **intent** — patient has documented allergy / intolerance / adverse reaction / contraindication to X
- **params** — `X` (substance or intervention)
- **category** — Classification
- **maturity** — moderate
- **evidence** — L1: `Has Allergy or Intolerance to` (5), `Has Allergy or` (4). L2: typically `Exists(AllergyIntolerance where code in valueset)` plus condition-coded contraindications.
- **examples** — `CMS135 :: Has Allergy or Intolerance to ACEI or ARB or ARNI Ingredient`, `CMS144 :: Has Allergy or Intolerance to Beta Blocker Therapy Ingredient`
- **anti-example** — `NotDoneWithReason(action, reason)` when the reason is something other than allergy/intolerance (e.g. patient preference, clinical exclusion).

---

## Contextualization

### `With(X, Y)`
- **intent** — combining two case features: X qualified by, accompanied by, or paired with Y
- **params** — `X` (subject — typically an encounter, finding, or activity); `Y` (qualifier — a criterion, criterion-set, or paired finding)
- **category** — Contextualization *, secondary Classification*
- **maturity** — strong
- **evidence** — L1: `Encounter With` (101), `Qualifying Encounter` (15+11), `Delivery Encounter With` (6), `ED Encounter with` (6), `Encounter Where` (3), `Has THA with` (5), `Has Encounter with` (10). L2: 44 `encounter-qualification`-tagged statements; root often `Query` with `where`-clause or `with`-relationship.
- **examples** — `CMS0334 :: Delivery Encounter With Calculated Gestational Age Greater Than Or Equal To 37 Weeks` (= `With(delivery-encounter, gestational-age-at-least-37)`), `CMS22 :: Encounter with Elevated Blood Pressure Reading`, `CMS56 :: Has THA with Initial and Follow Up HOOS Assessments` (= `With(THA, baseline-and-followup-assessment(HOOS))`)
- **anti-example** — `BaselineAndFollowUp(initial, followup)` when the qualifier is *specifically* a paired assessment with comparison semantics (not just co-occurrence).

### `AsOf(anchor, X)` *(parameterized umbrella)*
- **intent** — the clinical state of X as of a specific anchor point
- **params** — `anchor` ∈ {`admission`, `discharge`, `encounter-start`, `encounter-end`, `procedure`, `delivery`, …}; `X`
- **category** — Contextualization *, secondary Classification*
- **maturity** — strong
- **filled-in reads:**
  - `AsOf(admission, diagnosis-present)` → "as of admission, the diagnosis was present"
  - `AsOf(admission, anticoagulant-active)` → "as of admission, anticoagulant was active"
  - `AsOf(discharge, antithrombotic-ordered)` → "as of discharge, antithrombotic was ordered"
  - `AsOf(encounter-start, exclusion-active)` → "as of encounter start, exclusion was active"
- **evidence** — L1: `Present on Admission` (13), `On Admission` (4), `Active at Admission` (6), `At Discharge` (8), `at Start of ED Encounter`. L2: 21 `state-at-anchor`-tagged statements; L2 helper: `CQMCommon.isDiagnosisPresentOnAdmission` (14 calls). L3: dominant compositional pattern in CMS1017 HHFI risk-adjustment.
- **examples** — `CMS1017 :: Risk Variable Encounter with Anticoagulant Active at Admission`, `CMS104 :: Reason For Not Giving Antithrombotic At Discharge`, `CMS996 :: Active Exclusion Diagnosis at Start of ED Encounter`, `CMS1017 :: Encounter With A Fall Present On Admission`
- **anti-example** — `During(event, period)` when the question is whether the event occurred *anywhere within a period*, not specifically *as of a point in time*.

### `NotDoneWithReason(action, reason)`
- **intent** — the expected action was not performed, with an accepted clinical or patient reason
- **params** — `action`, `reason` (clinically load-bearing — *why* it wasn't done)
- **category** — Contextualization *, secondary State Inference*
- **maturity** — strong
- **evidence** — L1: `Has Medical or Patient Reason for Not Ordering X` (5), `Encounter With No X Due To Medical Reason` (4). L2: 4 statements; body combines absence-of-action with presence-of-reason.
- **examples** — `CMS135 :: Has Medical or Patient Reason for Not Ordering ACEI or ARB or ARNI`, `CMS22 :: Encounter with Medical Reason for Not Obtaining or Patient Declined Blood Pressure Measurement`
- **anti-example** — `Without(kind, X)` when there's no documented reason — just absence.

### `BaselineAndFollowUp(initial, followup)`
- **intent** — initial/baseline assessment paired with a follow-up assessment (often supports comparison or change-from-baseline)
- **params** — `initial`, `followup`
- **category** — Contextualization *, secondary Qualification*
- **maturity** — thin (sample-specific to functional-status measures)
- **evidence** — L1: `Initial and Follow Up` (5+ pattern instances).
- **examples** — `CMS56 :: Has THA with Initial and Follow Up HOOS Assessments`, `CMS90 :: Has Encounter with Initial and Follow Up PROMIS10 Assessments`
- **anti-example** — `With(X, Y)` when there's no time/order relationship — just co-occurrence.

### `InpatientStay(encounter[, includePrelude])`
- **intent** — the full inpatient hospitalization episode anchored on the encounter, optionally including the ED/observation prelude
- **params** — `encounter`; `includePrelude` (whether to count the ED visit and observation prelude as part of the stay)
- **category** — Domain Semantic Normalization *, secondary Contextualization*
- **maturity** — strong (inpatient-flow measures rely on this)
- **evidence** — L2 helper: `CQMCommon.hospitalizationWithObservation` (7 sample calls).
- **examples** — used in CMS108 VTE Prophylaxis, CMS1017 HHFI for the canonical "during the hospitalization" anchor
- **anti-example** — `During(event, encounter)` for a *single encounter's period*; `InpatientStay` is the broader stay-episode.

### `WasOrdered(X)`
- **intent** — the action was ordered/requested (intent recorded; resource exists even if not performed)
- **params** — `X` (action — medication, service, procedure)
- **category** — Contextualization *, secondary State Inference*
- **maturity** — moderate
- **evidence** — L1: `Or Ordered` (4), `Statin Therapy Ordered`, `Beta Blocker Therapy Ordered`. L2: `Exists(MedicationRequest|ServiceRequest where intent=order)`.
- **examples** — `CMS347 :: Statin Therapy Ordered during Measurement Period`, `CMS144 :: Has Beta Blocker Therapy for LVSD Ordered`
- **anti-example** — `WasPerformed(X)` when the question is *was the action completed*, not *was it requested*.

---

## Assertion

**What "Assertion" means here.** Most patterns in this catalog either *constrain* (qualifiers like `During`, `Within`, `OnOrBefore`), *select* (`MostRecent`, `Earliest`, `Lowest`), *combine* (`With`), or *predicate over evidence* (`Has`, `Without`, `CurrentlyTaking`). Assertion patterns are different: they add a *clinical claim* about the subject — a relationship, a status, a confidence level, or a classification — that isn't a constraint or selection. Three sub-shapes:

- **Justificatory** — `Justified(action, reason)` asserts a clinical-appropriateness link between an action and a diagnosis.
- **Stateful** — `Active(X[, during])` asserts that a condition or medication is currently relevant (not just exists ever).
- **Attestational** — `Verified(X)` and `DocumentedAs(X, classification)` assert a clinician's attestation about the finding's status or classification.

Each of these "looks like a concept hiding inside a pattern" — it asserts a clinical relation rather than a structural one — but each is parameterized over its arguments, so the structural form is correct: write it once, apply across the corpus. The Assertion category names the gray zone explicitly so future entries land in the right bucket.

### `Justified(action, reason)`
- **intent** — the action was performed/ordered with a clinical reason that matches the specified valueset (the action's reason property is in the criterion)
- **params** — `action`; `reason` (a valueset of acceptable reason concepts)
- **category** — Assertion *(re-tiered from Contextualization in v0.3.1 — asserts a clinical-appropriateness link, not a contextual relation)*, secondary Classification
- **maturity** — strong (specialization of reason-property checks — common enough to warrant its own name)
- **evidence** — Pervasive — `reasonCode in valueset` is one of the most common qualifying clauses in DQM. CMS69 alone uses it 6× across the BMI intervention defines.
- **examples** — `CMS69 :: High BMI Interventions Ordered` (justified by "Overweight or Obese"), `CMS69 :: Low BMI Interventions Performed` (justified by "Underweight")
- **anti-example** — `NotDoneWithReason(action, reason)` — Justified is "performed *for* X reason"; NotDoneWithReason is "*not* performed *because of* Y reason." Different polarities.

### `Active(X[, during])`
- **intent** — X (condition or medication) is in an active state — currently clinically relevant — optionally during a clinically-named period
- **params** — `X`; `during` optional (a period)
- **category** — Assertion *(re-tiered from State/Process Inference in v0.3.1 — asserts currently-relevant status, which is a clinical claim about X, not a state-of-resource predicate)*, secondary Qualification
- **maturity** — strong (this is the merged Active + ConditionActiveDuring + MedicationPeriod consumption)
- **evidence** — L2 helper: `QICoreCommon.prevalenceInterval` (30 sample calls), `CMD.medicationRequestPeriod` (6), `CMD.medicationDispensePeriod` (3). L1: `Has Active` (4), `Active at Admission` (6).
- **examples** — `CMS1157 :: Has Active HIV Diagnosis Starts On or Before First 240 Days of Measurement Period` (= `Active(HIV-diagnosis, during(first-240-days))`), `CMS153 :: Has Active Contraceptive Medications`, `CMS1154 :: Has Pregnancy Diagnosis During Measurement Period` (= `Active(pregnancy-diagnosis, during(measurement-period))`)
- **anti-example** — `Has(X)` when "active" status doesn't matter (just exists ever); `AsOf(anchor, X-active)` when the question is specifically state at one anchor point.

### `Verified(X)`
- **intent** — the finding/diagnosis carries an acceptable verification status (asserted by a clinician, not provisional/refuted)
- **params** — `X` (a condition or finding)
- **category** — Assertion *(recategorized from Classification; this is about confidence/source, not classification)*
- **maturity** — strong
- **evidence** — L2 helper: `Status.verified` (24 sample calls).
- **examples** — `CMS117 :: Has HIV` (calls `Status.verified` on condition), `CMS117 :: Has Lymphoreticular Cancer, Multiple Myeloma or Leukemia`
- **anti-example** — `Has(X)` if you don't care about verification status (e.g. screening-for-presence).

### `DocumentedAs(X, classification)`
- **intent** — a measurement or finding is documented as falling in a specific clinical classification (high, low, abnormal, …)
- **params** — `X` (measurement); `classification` (clinical category)
- **category** — Assertion *, secondary Classification*
- **maturity** — moderate
- **evidence** — L1: `Documented High BMI`, `Documented Low BMI` family in CMS69; corpus also has "documented as" constructions.
- **examples** — `CMS69 :: Documented High BMI During Measurement Period`, `CMS69 :: Documented Low BMI During Measurement Period`
- **anti-example** — `High(X)` / `Low(X)` for a *computed* classification (we read a value and classified it). `DocumentedAs` is when the clinician asserted the classification directly.

---

## Qualification (temporal)

**A note on the four temporal-selection cards below.** `First`/`Last` and `Earliest`/`MostRecent` are *not* synonyms — they have distinct ordering semantics. `First` and `Last` are **positional** (first/last in any sequence — first-line treatment, last dose in a series, first positive screen). `Earliest` and `MostRecent` are **explicitly temporal** (chronologically first/last). In clinical practice they overlap because most "first" things in measure logic happen to be ordered by time — but `First-line treatment` is not the temporally-earliest treatment, and the catalog needs to support both framings.

### `MostRecent(X[, anchor])`
- **intent** — the chronologically most recent qualifying X (explicitly temporal — "look back from now and find the latest")
- **params** — `X`; `anchor` optional (a period, encounter, or window to scope the lookback)
- **category** — Qualification
- **maturity** — strong
- **evidence** — L1: `Most Recent` (15), `Has Most Recent` (5), `on Most Recent X Day` (3). L2 helper: `QICoreCommon.latest` (7).
- **examples** — `CMS122 :: Most Recent Glycemic Status Date`, `CMS122 :: Has Most Recent Elevated Glycemic Status Assessment`, `CMS165 :: Most Recent Blood Pressure Day`, `CMS1154 :: Most Recent BMI`
- **anti-example** — `Last(X)` when the ordering isn't necessarily time (e.g. "last-line treatment" is positional in a protocol, not the most-recent-treatment-in-time).

### `Last(X[, anchor])`
- **intent** — the last qualifying X in a sequence — positional, not necessarily temporal ("last-line treatment", "last dose in a series", or "the last reading before discharge")
- **params** — `X`; `anchor` optional (a sequence/period/encounter to bound the "last in")
- **category** — Qualification
- **maturity** — moderate
- **evidence** — L1: `Last Hemoglobin A1c Result`, `Last Anesthesia Within Hospitalization`, `latestGeneralAnesthesiaOrMAC`. L2 helper: `QICoreCommon.latest` (7).
- **examples** — `CMS56/CMS90 :: latestGeneralAnesthesiaOrMAC` (last anesthesia in a hospitalization sequence), `PCMaternal :: lastTimeOfDelivery`
- **anti-example** — `MostRecent(X)` when the ordering is strictly time-from-now (lookback from now to find latest in time).

### `Earliest(X[, anchor])`
- **intent** — the chronologically earliest qualifying X (explicitly temporal — first in time)
- **params** — `X`; `anchor` optional (a scope to bound the "earliest in")
- **category** — Qualification
- **maturity** — strong
- **evidence** — L2 helper: `QICoreCommon.earliest` (28 sample calls).
- **examples** — `CMS1218 :: Risk Variable First Albumin In Encounter` (calls `earliest` — temporal semantics behind the "first" name), `CMS0334 :: lastGravida` (also uses `earliest` helper despite the name)
- **anti-example** — `First(X)` when ordering isn't necessarily time (e.g. "first-line treatment" is first in a protocol sequence, not earliest in time).

### `First(X[, anchor])`
- **intent** — the first qualifying X in a sequence — positional, not necessarily temporal ("first-line treatment", "first dose in a series", "first encounter of an episode")
- **params** — `X`; `anchor` optional (a sequence/period/encounter to bound the "first in")
- **category** — Qualification
- **maturity** — strong
- **evidence** — L1: `Risk Variable First` (26 — Hospital Readmission/Mortality risk variables), `First Anesthesia During Hospitalization` (43), `First ADHD Medication Prescribed During Intake Period`, `First Hypertensive Reading`.
- **examples** — `CMS136 :: First ADHD Medication Prescribed During Intake Period`, `CMS22 :: First Hypertensive Reading Interventions or Referral to Alternate Professional`, "first-line treatment" (hypothetical non-DQM example — first in protocol sequence)
- **anti-example** — `Earliest(X)` when the ordering is explicitly chronological and the framing is analytical rather than positional.

### `During(event, period)`
- **intent** — event occurs during a clinically-named period
- **params** — `event`; `period`
- **category** — Qualification
- **maturity** — strong
- **evidence** — L1: `During Measurement Period` (25+ variants), `in Measurement Period` (6). L2: 50 temporal-rel-tagged statements.
- **examples** — `CMS69 :: BMI During Measurement Period`, `CMS22 :: Qualifying Encounter during Measurement Period`
- **anti-example** — `Within(X, window)` when the time-bound is a window-from-anchor (e.g. "6 months after"), not a pre-defined named period.

### `Within(X, window)`
- **intent** — X occurs within a bounded window (look-back or look-forward) relative to an anchor
- **params** — `X`; `window` (duration + anchor)
- **category** — Qualification
- **maturity** — moderate
- **evidence** — L1: `Year Prior` (5), `Look Back Period` (4), `Within 6 Months`.
- **examples** — `CMS22 :: Follow up with Rescreen Within 6 Months`, `CMS131 :: Retinal Exam in Measurement Period or Year Prior`
- **anti-example** — `During(event, period)` for containment in a named period; `OnDayOfOrAfter(X, anchor)` for calendar-day specificity.

### `Overlaps(eventA, eventB)`
- **intent** — two events' intervals overlap (share any time)
- **params** — `eventA`, `eventB`
- **category** — Qualification
- **maturity** — moderate
- **evidence** — L1: "Overlaps ED Encounter", "Overlaps 2 Year Look Back Period". L2 helper: `AHA.overlapsAfterHeartFailureOutpatientEncounter`.
- **examples** — `CMS996 :: Allergy or Intolerance to Thrombolytic Medications Overlaps ED Encounter`, `CMS1154 :: Prediabetes Diagnosis Overlaps 2 Year Look Back Period`
- **anti-example** — `During` is asymmetric containment; `Overlaps` is symmetric (any shared time).

### `OnDayOfOrAfter(X, anchor)`
- **intent** — X occurs on the same calendar day as or day after a clinical anchor
- **params** — `X`; `anchor`
- **category** — Qualification *, secondary Contextualization*
- **maturity** — moderate
- **evidence** — L1: `Day After Procedure` (10), `Day Of Or Day After` formulations. L2 helper: `TJC.calendarDayOfOrDayAfter` (8 calls).
- **examples** — `CMS108 :: Encounter With Intervention Comfort Measures On Day Of Or Day After Procedure`
- **anti-example** — `BetweenAnchors(X, start, end)` for the "from start-anchor to end-anchor" window; `Within(X, window)` for a rolling time window.

### `OnOrBefore(X, anchor)`
- **intent** — X occurs on or before a clinical anchor (or date)
- **params** — `X`; `anchor` (event or date)
- **category** — Qualification
- **maturity** — moderate
- **evidence** — L1: "on or before," "starts before or on day of." L2: 4× in CMS69 sample alone (across BMI intervention timing checks).
- **examples** — `CMS69 :: High BMI Interventions Ordered` (diagnosis "starts before or on day of" the intervention's authoredOn), `CMS69 :: High BMI Interventions Performed` (similar temporal anchor check)
- **anti-example** — `OnDayOfOrAfter(X, anchor)` for the directional flip; `Before(X, anchor)` if/when added as the strict-before primitive.

### `SameDay(eventA, eventB)`
- **intent** — two events occurred on the same calendar day
- **params** — `eventA`, `eventB`
- **category** — Qualification
- **maturity** — moderate
- **evidence** — L1: "same day as." L2: 2× in CMS69 (tying the BMI not-done observation and follow-up not-documented service request to the qualifying encounter).
- **examples** — `CMS69 :: Medical Reason Or Patient Reason For Not Performing BMI Exam` (BMI observation cancellation same day as qualifying encounter), `CMS69 :: Medical Reason For Not Documenting A Follow Up Plan For Low Or High BMI`
- **anti-example** — `Overlaps(eventA, eventB)` for any time-intersection; `SameDay` is specifically calendar-day equality.

### `BetweenAnchors(X, start, end)`
- **intent** — X occurs in the period bounded by two clinical anchors
- **params** — `X`; `start` (anchor); `end` (anchor)
- **category** — Qualification *, secondary Contextualization*
- **maturity** — moderate
- **evidence** — L1: "From Day Of Start Of Hospitalization To Day After Admission" (5+), "From Day Of Start Of Hospitalization To Day After First ICU Stay".
- **examples** — `CMS108 :: Encounter With VTE Prophylaxis Received From Day Of Start Of Hospitalization To Day After Admission Or Procedure`
- **anti-example** — `During(event, encounter)` for a single named period; `OnDayOfOrAfter` for a single anchor.

### `AtLeastDaysApart(eventA, eventB, n)`
- **intent** — two events are separated by at least N days
- **params** — `eventA`, `eventB`, `n`
- **category** — Qualification *, secondary Calculation*
- **maturity** — moderate
- **evidence** — L1: `Days Apart` (3) — "At Least 90 Days Apart".
- **examples** — `CMS1157 :: Has Two Encounters With HIV At Least 90 Days Apart`, `CMS1157 :: Has One Encounter With HIV and One Viral Load Test At Least 90 Days Apart`

### `AtMostDaysApart(eventA, eventB, n)`
- **intent** — two events are separated by at most N days
- **params** — `eventA`, `eventB`, `n`
- **category** — Qualification *, secondary Calculation*
- **maturity** — thin
- **evidence** — L1: "Less Than Or Equal To Four Days Apart".
- **examples** — `CMS951 :: Has Urine Albumin Test And Urine Creatine Test Less Than Or Equal To Four Days Apart`

---

## Calculation

### `AgeAt(anchor)`
- **intent** — the patient's age (in years) at a clinical anchor point
- **params** — `anchor`
- **category** — Calculation *, secondary Qualification*
- **maturity** — strong
- **evidence** — L1: `Patient Age N or Older at Start of Measurement Period` (4), `Aged 35 to 70 at Start of Measurement Period`.
- **examples** — `CMS2 :: Patient Age 12 Years or Older at Start of Measurement Period`, `CMS1154 :: Aged 35 to 70 at Start of Measurement Period`
- **anti-example** — `AtLeast(AgeAt(anchor), n)` for the predicate form.

### `Calculate(X)`
- **intent** — derive a named clinical feature value from raw data (gestational age from coded reading, length of boarded time, body mass index, score from components)
- **params** — `X` (the named clinical feature to derive)
- **category** — Calculation
- **maturity** — moderate
- **evidence** — L1: `Risk Variable Body Mass Index (BMI)`, `lastGravida`, `lastParity`, `Calculated Gestational Age`, `Boarded Time`. L2 helper: `PCMaternal.calculatedGestationalAge` (3).
- **examples** — `CMS0334 :: Delivery Encounter With Calculated Gestational Age Greater Than Or Equal To 37 Weeks`, `CMS1244 :: Boarded Time Greater Than 240 Minutes`
- **anti-example** — `MostRecent(X)` / `Lowest(X)` for selecting an existing value; `Compute` is for *deriving* a new feature.

### `Lowest(X)` / `Highest(X)`
- **intent** — the lowest or highest reading of X (within an implicit scope)
- **params** — `X` (the clinical kind of measurement)
- **category** — Calculation
- **maturity** — moderate
- **evidence** — L1: `Lowest Systolic Reading on Most Recent Blood Pressure Day` (3+), `Highest …` family.
- **examples** — `CMS165 :: Lowest Systolic Reading on Most Recent Blood Pressure Day`, `CMS165 :: Lowest Diastolic Reading on Most Recent Blood Pressure Day`
- **anti-example** — `MostRecent(X)` selects by *time*; `Lowest/Highest` select by *value*.

### `AtLeastN(events, n)`
- **intent** — at least N qualifying events occurred
- **params** — `events`; `n`
- **category** — Calculation
- **maturity** — moderate
- **evidence** — L1: `Two Encounters`, `Has Appropriate Number of …`, `Three Polio Vaccinations`, `Four DTaP Vaccinations`. L2: typically `Length(query) >= n`.
- **examples** — `CMS117 :: Has Appropriate Number of Hib Immunizations`, `CMS1157 :: Has Two Encounters With HIV At Least 90 Days Apart`
- **anti-example** — `Consecutive(events, n)` when sequence/order matters (N in a row, not just N total).

### `Consecutive(events, n)`
- **intent** — N consecutive qualifying events (sequence matters)
- **params** — `events`; `n`
- **category** — Calculation *, secondary State Inference*
- **maturity** — thin
- **evidence** — L1: `Has Consecutive Heart Rates Less than 50` (3+), `Consecutive` n-gram.
- **examples** — `CMS144 :: Has Consecutive Heart Rates Less than 50`
- **anti-example** — `AtLeastN(events, n)` when total count matters but order doesn't.

### `High(X)` / `Low(X)` / `Normal(X)` / `Abnormal(X)`
- **intent** — measurement X falls into the named clinical category
- **params** — `X` (a named measurement type — BMI, BP, A1c, etc.)
- **category** — Calculation *, secondary Classification*
- **maturity** — strong
- **evidence** — L1: `High BMI`, `Low BMI`, `Normal Blood Pressure`, `Elevated Blood Pressure`, `Abnormal Presentation`. L2: 18 `threshold-named`-tagged statements.
- **examples** — `CMS22 :: Encounter with Normal Blood Pressure Reading` (`Normal(BP)`), `CMS22 :: Encounter with Elevated Blood Pressure Reading SBP 120 to 129 AND DBP less than 80` (composed), `CMS69 :: Documented High BMI During Measurement Period`
- **anti-example** — `DocumentedAs(X, high)` if the classification is asserted by a clinician (not computed); the named-category primitives are for the *computed* classification against standard cutoffs.

### `AtLeast(value, target)` / `AtMost(value, target)` / `Exceeds(value, target)` / `Below(value, target)`
- **intent** — numeric value crosses a clinical target (binary predicate)
- **params** — `value`; `target` (typed Quantity)
- **category** — Calculation *, secondary Classification*
- **maturity** — strong
- **evidence** — L1: 18 `threshold-named`-tagged statements; "Greater Than 240 Minutes" (4), "Greater Than Or Equal To 37 Weeks" (6), "Less than 50".
- **examples** — `CMS0334 :: Delivery Encounter With Calculated Gestational Age Greater Than Or Equal To 37 Weeks` (`AtLeast(GA, 37 weeks)`), `CMS1244 :: Boarded Time Greater Than 240 Minutes` (`Exceeds(boarded-time, 240 minutes)`)
- **anti-example** — `High(X)` / `Low(X)` for *named clinical categories* (high BMI, low BP); these primitives are for *explicit numeric* thresholds.

---

## State / Process Inference

> `Active(X[, during])` was re-tiered to **Assertion** in v0.3.1 (it asserts currently-relevant status, a clinical claim about X — not a state-of-resource predicate). `WasPerformed(X)` remains here as a state-of-resource predicate on action resources (a status assertion about the resource itself, not a clinical claim).

### `WasPerformed(X)`
- **intent** — the clinical action was performed (procedure / encounter / immunization / medication-administration completed)
- **params** — `X` (action)
- **category** — State Inference *(recategorized from Classification)*
- **maturity** — strong
- **evidence** — L2 helpers: `Status.isProcedurePerformed` (18), `Status.isEncounterPerformed` (6), `Status.isImmunizationAdministered` (13), `Status.isMedicationDispensed` (3). L1: tail-suffix `Test Performed` (3).
- **examples** — `CMS117 :: Has Appropriate Number of Hib Immunizations` (calls `Status.isImmunizationAdministered`), `CMS349 :: Has HIV Test Performed`
- **anti-example** — `WasOrdered(X)` if the question is intent (request recorded), not completion.

---

## Cross-cutting notes

### What this is good for
A concrete artifact for round-2 reviewers + further operator refinement. **Specific questions for v0.2 reviewers:**
1. Do the parameterized umbrellas (`Without`, `AsOf`) pass the filled-in test for *all* their variant discriminator values, or are any awkward?
2. Is `With(X, Y)` general enough as a Contextualization primitive — or does it get too generic and become "and"-with-a-different-name?
3. The `Has(X[, when])` design — should `when` be an optional temporal sub-expression, or should we split out `HasDuring(X, period)` / `HasBefore(X, anchor)` as separate cards?
4. Categories — anything still mis-categorized after the v0.1 → v0.2 re-tier?
5. The numeric-threshold sub-family (`AtLeast`/`AtMost`/`Exceeds`/`Below`) — are these really 4 separate primitives, or 2 (with direction parameter implicit in name)?
6. Calc category has 12 cards (largest single category) — over-modeled, or accurately corpus-reflective?

### Known gaps deferred to v0.3
- `EligibleForMeasure` — QM-specific use-case pattern; revisit when non-DQM corpora arrive
- `AlternativeEvidenceSatisfies(requirement, evidenceSet)` — interesting Layer-3 pattern in CMS117 immunization logic (e.g. measles immunity satisfies MMR requirement); need broader corpus support
- Statistical Inference primitives — deferred (PMML)
- Other use-case-specific patterns (CDS-Connect, surveillance, registries) — collect with the broader corpus expansion
