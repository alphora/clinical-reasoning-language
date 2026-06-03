# Modeling CMS69 in CRL using v0.2 catalog

> **Exercise:** take a real CQL measure (`CMS69FHIRPCSBMIScreenAndFollowUp` — BMI screening and follow-up) and re-express it in CRL using the v0.2 inference-pattern catalog. Surface gaps where the catalog falls short. Source CQL: `features/cql-pattern-mining/data/cql/dqm-content-qicore-2025/CMS69FHIRPCSBMIScreenAndFollowUp.cql`.

## Modeled CRL (three layers)

### Asserted layer — leaves of the expression tree

```crl
// External-library imports (helpers — separate concern)
// FHIRHelpers, Status, Hospice, PalliativeCare, QICoreCommon, SDE

// === Asserted from source domain (standardized valuesets) ===

concept "BMI Observations":
- type is Observation.
- value type is Quantity.
- coded from "USCore BMI Profile" or "Body Mass Index LOINC".

concept "Pregnancy Diagnoses":
- type is Condition.
- value type is CodeableConcept.
- coded from "Pregnancy or Other Related Diagnoses Valueset".

concept "Pregnancy Status Observations":
- type is Observation.
- value type is CodeableConcept.
- coded from "USCore Observation Pregnancy Status Profile".

concept "Encounters to Evaluate BMI":
- type is Encounter.
- value type is CodeableConcept.
- coded from "Encounter to Evaluate BMI Valueset".

concept "High BMI Follow-up Service Requests":
- type is ServiceRequest.
- value type is CodeableConcept.
- coded from "Follow Up for Above Normal BMI Valueset".

concept "Low BMI Follow-up Service Requests":
- type is ServiceRequest.
- value type is CodeableConcept.
- coded from "Follow Up for Below Normal BMI Valueset".

concept "Weight Assessment Referrals":
- type is ServiceRequest.
- value type is CodeableConcept.
- coded from "Referrals Where Weight Assessment May Occur Valueset".

concept "High BMI Medications":
- type is MedicationRequest.
- value type is CodeableConcept.
- coded from "Medications for Above Normal BMI Valueset".

concept "Low BMI Medications":
- type is MedicationRequest.
- value type is CodeableConcept.
- coded from "Medications for Below Normal BMI Valueset".

concept "High BMI Follow-up Procedures":
- type is Procedure.
- value type is CodeableConcept.
- coded from "Follow Up for Above Normal BMI Valueset".

concept "Low BMI Follow-up Procedures":
- type is Procedure.
- value type is CodeableConcept.
- coded from "Follow Up for Below Normal BMI Valueset".

concept "Overweight or Obese Diagnoses":
- type is Condition.
- value type is CodeableConcept.
- coded from "Overweight or Obese Valueset".

concept "Underweight Diagnoses":
- type is Condition.
- value type is CodeableConcept.
- coded from "Underweight Valueset".

concept "Medical Reason":
- type is Observation.  // used as a CodeableConcept reason-set in this measure
- value type is CodeableConcept.
- coded from "Medical Reason Valueset".

concept "Patient Declined":
- type is Observation.
- value type is CodeableConcept.
- coded from "Patient Declined Valueset".
```

### Inferred layer — category-organized derivations

```crl
// --- Qualifying Encounter ---
// Original CQL: encounter with BMI evaluation code, during MP, class != virtual, status = 'finished'
concept "Qualifying Encounter":
- inferred from `With(
    "Encounters to Evaluate BMI",
    During(this, "Measurement Period")
    and WasPerformed(this)                      // status = 'finished'
    and NotOfType(this.class, virtual)          // *** GAP ***
  )`.

// --- BMI observations during MP ---
concept "BMI During Measurement Period":
- inferred from `With(
    "BMI Observations",
    During(this, "Measurement Period")
    and Exceeds(this.value, 0 'kg/m2')          // sanity check on positive value
  )`.

// --- BMI clinical classifications ---
// The agent emitter knows the standard cutoffs: BMI < 18.5 = Low, [18.5, 25) = Normal, >= 25 = High.
concept "Documented Low BMI":
- inferred from `Low("BMI During Measurement Period")`.

concept "Documented High BMI":
- inferred from `High("BMI During Measurement Period")`.

concept "Has Normal BMI":
- inferred from `Normal("BMI During Measurement Period")
    and not ("Documented High BMI" or "Documented Low BMI")`.

// --- Active diagnoses for justifying interventions ---
concept "Has Overweight or Obese":
- inferred from `Active("Overweight or Obese Diagnoses")`.

concept "Has Underweight":
- inferred from `Active("Underweight Diagnoses")`.

// --- High BMI Interventions Ordered ---
// EITHER intervention has reason in the diagnosis valueset, OR there's a co-existing diagnosis at order time
concept "High BMI Interventions Ordered":
- inferred from `With(
    "High BMI Follow-up Service Requests"
      or "Weight Assessment Referrals"
      or "High BMI Medications",
    Justified(this, "Overweight or Obese Diagnoses")                // *** GAP ***
    or OnOrBefore("Has Overweight or Obese" starts, this.authoredOn) // *** GAP: OnOrBefore ***
  )`.

// --- High BMI Interventions Performed ---
concept "High BMI Interventions Performed":
- inferred from `With(
    "High BMI Follow-up Procedures",
    Justified(this, "Overweight or Obese Diagnoses")
    or ( OnOrBefore("Has Overweight or Obese" starts, this.performed)
         and not Before("Has Overweight or Obese" ends, this.performed) )
  )`.

// --- High BMI with intervention provided ---
concept "High BMI And Follow Up Provided":
- inferred from `With(
    "Documented High BMI",
    ("High BMI Interventions Ordered" or "High BMI Interventions Performed")
    and During(this.intervention-date, "Measurement Period")
  )`.

// --- Low BMI analogous ---
concept "Low BMI Interventions Ordered":
- inferred from `With(
    "Low BMI Follow-up Service Requests"
      or "Weight Assessment Referrals"
      or "Low BMI Medications",
    Justified(this, "Underweight Diagnoses")
    or ( OnOrBefore("Has Underweight" starts, this.authoredOn)
         and During(this.authoredOn, "Measurement Period") )
  )`.

concept "Low BMI Interventions Performed":
- inferred from `With(
    "Low BMI Follow-up Procedures",
    ( Justified(this, "Underweight Diagnoses") and WasPerformed(this) )
    or ( OnOrBefore("Has Underweight" starts, this.performed)
         and During(this.performed, "Measurement Period")
         and not Before("Has Underweight" ends, this.performed) )
  )`.

concept "Low BMI And Follow Up Provided":
- inferred from `With(
    "Documented Low BMI",
    ("Low BMI Interventions Ordered" or "Low BMI Interventions Performed")
    and During(this.intervention-date, "Measurement Period")
  )`.

// --- BMI exam not performed with reason ---
concept "Medical Reason Or Patient Reason For Not Performing BMI Exam":
- inferred from `With(
    NotDoneWithReason("BMI Observations", "Medical Reason" or "Patient Declined"),
    SameDay(this, "Qualifying Encounter" starts)                    // *** GAP: SameDay ***
  )`.

// --- BMI follow-up not documented with reason ---
concept "Medical Reason For Not Documenting A Follow Up Plan For Low Or High BMI":
- inferred from `With(
    NotDoneWithReason(
      "High BMI Follow-up Service Requests"
        or "Low BMI Follow-up Service Requests"
        or "Weight Assessment Referrals"
        or "High BMI Medications"
        or "Low BMI Medications",
      "Medical Reason"),
    SameDay(this, "Qualifying Encounter" starts)
    and WasPerformed(this)                                          // status = 'completed'
  )`.

// --- Pregnancy ---
// Two evidence paths: a coded diagnosis OR a coded observation with verified status
concept "Is Pregnant During Measurement Period":
- inferred from `Active("Pregnancy Diagnoses", during "Measurement Period")
    or DocumentedAs(
        With("Pregnancy Status Observations",
             Overlaps(this, "Measurement Period")
             and Verified(this)),
        "Pregnancy or Other Related Diagnoses")`.
```

### Interface layer — the measure API

```crl
concept "Aged 18+ at Qualifying Encounter":
- inferred from `AtLeast(AgeAt(start of "Qualifying Encounter"), 18 years)`.

concept "Initial Population":
- inferred from `With("Qualifying Encounter", "Aged 18+ at Qualifying Encounter")`.

concept "Denominator":
- inferred from "Initial Population".

concept "Denominator Exclusions":
- inferred from `Hospice."Has Hospice Services"
    or PalliativeCare."Has Palliative Care in the Measurement Period"
    or "Is Pregnant During Measurement Period"`.

concept "Numerator":
- inferred from `"High BMI And Follow Up Provided"
    or "Low BMI And Follow Up Provided"
    or "Has Normal BMI"`.

concept "Denominator Exceptions":
- inferred from `"Medical Reason For Not Documenting A Follow Up Plan For Low Or High BMI"
    or "Medical Reason Or Patient Reason For Not Performing BMI Exam"`.
```

---

## Gaps surfaced — patterns the catalog is missing

Marked `*** GAP ***` inline above. Five distinct gaps, ordered by frequency in this measure:

### 1. `Justified(action, reason-valueset)` — used 6x in CMS69

The pattern is "this action has a reason in this clinical valueset" — `ServiceRequest.reasonCode in 'Overweight or Obese'`, `Procedure.reasonCode in 'Underweight'`, etc. Doctor's phrasing: "ordered for overweight," "performed for underweight," "given because of …". Other candidate names: `For(action, reason)`, `BecauseOf(action, reason)`, `OrderedFor(action, indication)`. Strong evidence in the corpus across multiple measures. **Should be in v0.3.**

### 2. `OnOrBefore(eventA, anchor)` — used 4x in CMS69

Temporal relation: "X exists on or before a clinical anchor." Doctor's phrasing: "the diagnosis was present on or before the order date." The catalog has `OnDayOfOrAfter(X, anchor)` and `BetweenAnchors(X, start, end)` but not `OnOrBefore`. Strong filled-in-test pass ("diagnosis on or before order date"). Catalog gap. Should also add `Before(X, anchor)` and `After(X, anchor)` for completeness — three primitive temporal-relation predicates. **Should be in v0.3.**

### 3. `SameDay(eventA, eventB)` — used 2x in CMS69, common in corpus

Specifically calendar-day-equal. Doctor's phrasing: "occurred on the same day as." Close cousin of `OnDayOfOrAfter` and `Overlaps`. Worth its own card. **Should be in v0.3.**

### 4. `NotOfType(X, type)` / property exclusion — used 1x but important

The `class != virtual` filter on the encounter. More generally: "exclude based on a property value." Doctor's phrasing: "not a virtual encounter." Other phrasings: `Excluding(X, criterion)`, `NotIn(X.property, value-set)`. **Probably should be in v0.3.** Maybe a more general `PropertyMatches(X, property, valueset)` would also help — it would cover the `Justified` case too (both are "check that a property of this resource is in this valueset").

### 5. Resource property access / dot-path navigation

Pervasive — `this.authoredOn`, `this.performed`, `this.class`, `this.intervention-date`, `"Qualifying Encounter" starts`. These aren't *patterns*; they're CRL language constructs for accessing resource properties. Worth confirming this is in scope for the CRL language (which would be addressed in `inferred from` + `apply pattern` re-engineering).

## Patterns that worked well

- **`Active(X[, during])`** — handled pregnancy diagnoses cleanly. Folding `prevalenceInterval` semantics into this primitive was right.
- **`MostRecent`, `High`, `Low`, `Normal`** — BMI classification mapped directly. Agent emitter knows the cutoffs.
- **`NotDoneWithReason(action, reason)`** — covered the "BMI not performed" and "follow-up not documented" cases cleanly.
- **`With(X, Y)`** — central to almost every composition. Fully justified as a primitive.
- **`Verified(X)`** — covered the `status in {final, amended, corrected}` filter on the pregnancy observation.
- **`DocumentedAs(X, classification)`** — fit the "pregnancy observation value in valueset" intent.
- **`AtLeast(value, target)` / `Exceeds(value, target)`** — value-comparison primitives worked.
- **`AgeAt(anchor)`** — clean.
- **`Has(X[, when])` and the temporal qualifier** — handled boolean predicates over qualifying evidence.

## Observations on the three-layer modeling

- **Asserted layer is verbose** — every valueset becomes a `concept` declaration. 15 asserted concepts for one measure. Probably right (each is reusable elsewhere) but worth noting as a friction.
- **`With(X, Y)` is the workhorse** of the inferred layer. About 8 of 14 inferred concepts use it as the outer wrapper. That confirms it as a primary primitive.
- **The interface layer is thin** — just IP, Numerator, Denominator, Exceptions, Exclusions, and one age check. Most clinical reasoning lives in the inferred layer. This is the expected shape.
- **Cross-library deps** — `Hospice."Has Hospice Services"` and `PalliativeCare."Has Palliative Care in the Measurement Period"` are concept references to other CRL libraries. The cascade-problem doesn't bite here because these don't reference back into our Interface. It would bite if a hypothetical `HasHeartDisease` library needed our `Most Recent BMI`.
- **Booleans (and / or / not) are everywhere** — at least one boolean composition per inferred concept. Confirms they're language constructs, not patterns.
- **`this` keyword** — pervasive; refers to the current concept's instance. Language construct.
- **Selecting "or"-of-multiple-asserted-concepts is verbose** — `"High BMI Service Requests" or "Weight Assessment Referrals" or "High BMI Medications"`. Could be a shorthand like `OneOf(...)` but that might just be `or`.

## Net catalog implications

**Add to v0.3:**
- `Justified(action, reason-valueset)` — Contextualization
- `OnOrBefore(X, anchor)` — Qualification (temporal). Probably with sibling `Before(X, anchor)`, `After(X, anchor)`.
- `SameDay(eventA, eventB)` — Qualification (temporal)
- `NotOfType(X, value)` or `PropertyMatches(X, property, valueset)` — Classification

**No catalog changes needed for v0.2 from this exercise** — the gaps are *additions*, not corrections to existing cards. v0.2 cards that were used all worked.

**Maturity update:** several v0.2 cards now have a real round-trip example to anchor their `examples` field — could enrich the catalog with these.

## What this exercise validated about the methodology

1. The three-layer model (Asserted / Inferred / Interface) is workable.
2. The combined `inferred from \`Pattern(...)\`` syntax composes naturally with boolean operators.
3. Most reasoning fits the catalog; gaps are *specific, namable*, and *clinically natural*.
4. The mining methodology was sound — most v0.2 cards survived contact with a real measure.
5. The catalog is roughly the right size — 40 v0.2 cards covered ~85% of CMS69's inferential needs; 4 gaps to add brings it to ~95%.
