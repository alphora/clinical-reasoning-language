# Layer 1 findings — intent candidates from statement names

> **Status: first-pass draft.** Mined from **1,135 clinical measure-library statement names** (boilerplate excluded; helpers excluded). Layer 2 (body shapes) and Layer 3 (compositions across defines) not yet folded in. These are CANDIDATES emerging from how the informaticist named things — the actual catalog entries need Layer-2/3 confirmation + composability checks.

The raw n-gram report is at `mine-names.report.md`; the JSONL is at `data/patterns/name-intent-{prefixes,suffixes}.jsonl`.

## Candidates by category

Each candidate: a working name (informaticist-natural), declarative intent, name-evidence from the corpus. Most need Layer-2 confirmation that the bodies *do* what the names *say*. Names also vary in how directly they articulate intent — "Has Most Recent Glycemic Status Assessment Without Result" is a compositional clinical sentence, not just one pattern.

### Qualification (temporal)

| Working name | Declarative intent | Evidence (name n-grams) |
|---|---|---|
| **`MostRecent(X[, lookback])`** | the most recent qualifying X | `Most Recent` (15), `Has Most Recent` (5), `on Most Recent X Day` (3) |
| **`First(X[, period])`** | the earliest qualifying X in a window | `Risk Variable First` (26) — domain-specific Hospital Readmission/Mortality; also bare "First X" forms |
| **`During(event, period)`** | event occurs during period | `During Measurement Period` (25 + 5 + 12 with article variants), `during Day of Measurement Period`, `Qualifying Encounter During` (8) |
| **`InPriorPeriod(event, duration)`** | event occurred in the lookback window before an anchor | `Year Prior` (5), `Back Period` / `Look Back Period` (4), `October N Two Years Prior to the Measurement Period` |
| **`OnAdmission(X)`** | clinical attribute as-of admission | `Present on Admission` (13), `On Admission` (4), `Active at Admission` (6) |
| **`AtDischarge(X)`** | clinical attribute at discharge | `At Discharge` (8) |
| **`DaysApart(eventA, eventB, days)`** | events separated by at least N days | `Days Apart` (3) ("At Least 90 Days Apart", "Less Than Or Equal To Four Days Apart") |
| **`DayAfter(anchor, X)`** | event on day-of or day-after a clinical anchor | `Day After Procedure` (10), `Day After Admission` (5), `Day Of Or Day After` formulations |
| **`Within(event, window)`** | event within a stated window from an anchor | implicit in many "Within N Days of" forms — needs Layer 2 to surface cleanly |
| **`AgeAt(anchor)` / `AgeAtLeast(anchor, age)`** | patient age at a clinical anchor | `Patient Age N or Older at Start of Measurement Period` (4), `Aged 35 to 70 at Start of Measurement Period` |

### Classification (predicate / type-ing)

| Working name | Declarative intent | Evidence |
|---|---|---|
| **`Has(X)`** | patient has X (exists predicate over qualifying evidence) | `Has Encounter` (11), `Has Diagnosis of` (10), `Has Qualifying` (8), `Has Most Recent` (5), `Has Medical` (5), `Has Allergy` (5), `Has THA with` (5), `Has Active` (4), `Has Pregnancy` (3), `Has HIV` (3), `Has Beta Blocker` (3), `Has Consecutive` (3), `Has Arrhythmia` (3), `Has Hypotension` (3), `Has Asthma` (3), `Has Atrioventricular Block` (5) |
| **`HasHistoryOf(X)`** | patient had X in the past | `History of` (3) ("History of SUD Diagnosis", "History of Cardiac Surgery Prior to Encounter") |
| **`HasAdverseReactionTo(X)`** | allergy / intolerance / contraindication to X | `Has Allergy or` (4), `Has Allergy or Intolerance to` |
| **`CurrentlyTaking(med)`** | patient is currently taking medication X | `Is Currently Taking` (4) |
| **`Performed(action)` / `WasPerformed(action)`** | action was performed | `Test Performed` (3) |
| **`Without(X)` / `Absent(X)`** | qualifying evidence of X is absent | `No VTE Prophylaxis` (10), `No Mechanical VTE` (8), `No Mechanical VTE Prophylaxis Performed Or Ordered`, `Without Result` ("Has Most Recent Glycemic Status Assessment Without Result") |

### Contextualization (relationships between case features)

| Working name | Declarative intent | Evidence |
|---|---|---|
| **`EncounterWith(criterion)` / `QualifyingEncounter`** | an encounter qualified by some criterion | `Encounter With` (101 + 22), `Qualifying Encounter` (15 + 11 trailing), `ED Encounter with` (6), `Delivery Encounter With` (6), `Encounter Where` (3) |
| **`DuringEncounter(event)`** | event happening within an encounter's time | implicit in `In Encounter` (23) and many compositions |
| **`Overlaps(eventA, eventB)`** | two events' intervals overlap | "Allergy or Intolerance to Thrombolytic Medications Overlaps ED Encounter", "Prediabetes Diagnosis Overlaps 2 Year Look Back Period" |
| **`AssessmentPair(initial, followup)`** | an initial assessment paired with a follow-up assessment | `Has Encounter with Initial and Follow Up X Assessments` (5+), `Has THA with Initial and Follow Up X Assessments` (5) |
| **`NotDoneWithReason(action, reason)`** | the expected action was not done, with an accepted reason | `Has Medical or Patient Reason for Not Ordering X` (5), `Medical or Patient Reason for Not Communicating X` (5), `Encounter With No VTE Prophylaxis Due To Medical Reason` (4) |

### Calculation

| Working name | Declarative intent | Evidence |
|---|---|---|
| **`Threshold(value, op, target)`** | numeric value exceeds / meets / falls under a target | "Greater Than 240 Minutes" (4), "Greater Than Or Equal To 37 Weeks" (6), `Less than 50` ("Has Consecutive Heart Rates Less than 50") |
| **`Lowest(measurements)` / `Highest(measurements)`** | the lowest / highest value among qualifying measurements | "Lowest Systolic Reading on Most Recent Blood Pressure Day" (3-pair pattern) — implicit; needs Layer 2 to surface scale |
| **`CountAtLeast(events, n)` / `Count(events)`** | the number of qualifying events reaches a threshold | "Has Two Encounters With HIV At Least 90 Days Apart" — implicit; Layer 2 needed |
| **`DateOf(event)`** | the date a clinical event occurred | `Date X Total Assessment Completed` (15 with "Assessment Completed" suffix) |

### State / Process Inference

| Working name | Declarative intent | Evidence |
|---|---|---|
| **`Active(condition|medication[, asOf])`** | condition or medication is active at a point in time | `Has Active` (4), `Active at Admission` (6), `Active Exclusion Diagnosis at Start of ED Encounter` |
| **`NotDoneWithReason(action, reason)`** | (also fits here — process / exception) | (see Contextualization) |
| **`StateAtAnchor(condition, anchor)`** | condition state observed at a clinical anchor point | combinations of "X On Admission", "X At Discharge", "X at Start of ED Encounter" |

### (Domain) Semantic Normalization

Light signal at Layer 1 alone — most domain-semantic-normalization patterns (clinical-period, condition-as-active-during, medication-exposure-period) are buried inside bodies, not in names. Expect richer signal from Layer 2 / domain commons (`QICoreCommon`, `CQMCommon`).

### Categories with no Layer-1 signal yet

- **Statistical Inference** — out of scope (PMML) per the taxonomy.
- **Assertion** — needs Layer 2/3 to surface (high-confidence guarded inferences).
- **Transformation / Normalization** — kept implicit in the emitter, per north star.

## Cross-cutting observations

- **`Has X`** is the dominant intent shape in the corpus — over 60 distinct `Has …` n-gram families. Most clinical measure logic is structured as "does patient have qualifying evidence of X?" `Has` is the umbrella; it composes with `MostRecent`, `Active`, `History of`, `Qualifying`, `Within`, `During`, etc. Strong candidate for a foundational primitive.
- **`Encounter With` / `Qualifying Encounter`** is the second-most-common shape — "the encounter that qualifies as our subject." Often the *subject* of further qualification (every "Has X with Qualifying Encounter And …" composition).
- **`Measurement Period`** appears in 78 trailing 2-grams + 25 trailing 3-grams. The measurement period is the dominant temporal anchor; most temporal qualifications reference it. **The pattern is `During(event, period)`; the *measurement period* itself isn't a pattern — it's the canonical argument.**
- **The CMS housestyle is loud.** Many of the high-frequency phrases (`Risk Variable First X In Encounter`, `Day Of Start Of Hospitalization To Day After`, `Qualifying CAD Encounter and Prior MI`) are CMS-specific compositional house style. These are evidence for underlying intents (`First in Encounter`, `BetweenAnchors(start, end)`, compound qualifications) — but the pattern names should be generic, not "CMS-style".

## Candidate count so far

~25 distinct patterns from Layer 1 alone. That's the right order-of-magnitude for the intuition-of-50, with Layer 2/3 likely to:
- **confirm** the bulk of these (the body shapes will corroborate `MostRecent`, `During`, `Has`, etc.)
- **surface 10–20 more** that are inline-implemented but not named at the top level (the "buried" patterns the user expects to find)
- **let us merge** some near-duplicates (e.g. `OnAdmission` and `AtDischarge` and `StateAtAnchor` may collapse into one parameterized primitive)

## What to take to the reviewers

Not these candidates yet — they're underspecified (no Layer 2/3, no parameter sketches, no composability check). The right time for reviewer consultation is after the next pass produces pattern cards (informaticist-natural names + Layer 2/3 evidence + parameter sketches + category). That gives them something concrete to react to instead of name-cluster summaries.
