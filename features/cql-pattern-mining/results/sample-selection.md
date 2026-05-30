# Sample selection for Layer 2 / 3 mining

**Selected: 12 measures, ~190 clinical statements.** Spans screening, hospital flow, chronic disease management, medication, obstetric, pediatric. Stays inside the README target (8–20 measures, 400–600 statements is the upper bound; 190 keeps things readable for a first pass before scaling).

Rationale by inclusion:

| # | Measure (library id) | Clinical defs | Why included |
|---|---|---:|---|
| 1 | `CMS69FHIRPCSBMIScreenAndFollowUp` | 15 | Canonical "abnormal screening result → follow-up performed" pattern family; thresholds + classification + follow-up timing |
| 2 | `CMS22FHIRPCSBPScreeningFollowUp` | 26 | Same shape as CMS69 (BP not BMI) — cross-check that the patterns generalize across the screening domain |
| 3 | `CMS122FHIRDiabetesAssessGT9Pct` | 8 | Strong `MostRecent` exemplar (HbA1c) + threshold + state ("Has Most Recent Elevated Glycemic Status Assessment") |
| 4 | `CMS165FHIRControllingHighBP` | 13 | `Most Recent Blood Pressure Day` + `Lowest Systolic Reading on Most Recent BP Day` — composition of MostRecent + Lowest, plus the day-level temporal abstraction |
| 5 | `CMS125FHIRBreastCancerScreen` | 8 | Screening-with-lookback pattern; rich in temporal qualification ("October 1 Two Years Prior to the Measurement Period") |
| 6 | `CMS108FHIRVTEProphylaxis` | 29 | Hospital flow + "Day of Start of Hospitalization to Day After …" temporal anchors + `No X Due To Medical Reason` exception patterns |
| 7 | `CMS135FHIRACEIorARBorARNIforHF` | 8 | Medication-management + condition-coexistence (HF + ACE/ARB/ARNI) + contraindication-with-reason (`Has Allergy or Intolerance to`) |
| 8 | `CMS128FHIRAntidepressantMgmt` | 13 | Medication persistence across an `Intake Period` — distinct temporal-window pattern |
| 9 | `CMS0334FHIRPCCesareanBirth` | 15 | Obstetric — gestational-age threshold (`Calculated`/`Estimated`/`Based On Coding`), Delivery Encounter qualification |
| 10 | `CMS117FHIRChildImmunStatus` | 51 | Pediatric, immunization — heavy use of `Has X` predicate + age-at-anchor patterns; largest clinical-def count in the sample (gives the long-tail visibility) |
| 11 | `CMS139FHIRFallRiskScreening` | 2 | Tightest measure in the corpus — confirms our patterns generalize to small measures |
| 12 | `CMS1017FHIRHHFI` | 36 | "Encounter Where A Fall Occurred", "Risk Variable Encounter with X Active at Admission" — strong domain-semantic-normalization and state-at-anchor patterns |

**Total: 224 clinical statements.** (Slightly above the 190 estimate — pediatric immunization is bigger than I'd remembered.)

**Domain coverage:**

| Domain | Measures |
|---|---|
| Outpatient screening + follow-up | CMS22, CMS69, CMS122, CMS125, CMS165 |
| Hospital-flow / inpatient | CMS108, CMS1017 |
| Chronic disease management | CMS135, CMS128, CMS122 |
| Obstetric | CMS0334 |
| Pediatric | CMS117 |
| Tight-measure sanity check | CMS139 |

**Deliberate exclusions for this pass:**
- HIV / STI measures (CMS1157, CMS1188, CMS314, CMS349) — they cluster heavily on `Has Qualifying Encounter During First 240 Days of Measurement Period`, which is repetitive name-evidence already captured at Layer 1. Will reintroduce at the full-corpus expansion if any unique patterns emerge.
- NHSN libraries (uncategorized at Phase A) — defer until they're properly classified.
- Cardiac surgery / advanced cardiac (CMS144, CMS145, CMS347) — significant overlap in `Has Beta Blocker` / `Has Allergy to` / `Has Atrioventricular Block` patterns; CMS135 will reveal the shape, others would just confirm. Re-include if Layer 2 surfaces something distinct.

## Next: Layer 2/3 mining on these 12

For each statement in the sample, the work is:
- **Layer 2**: extract the body's clinical reasoning arc — what data is examined, what criterion is applied, what conclusion is asserted. Cluster by *clinical assertion*, ignoring implementation plumbing. Use the function-call inventory + subtree shapes from `data/patterns/` as triangulation evidence, not as cluster keys.
- **Layer 3**: build the dependency graph between defines within each library; identify recurring compositional shapes (e.g., "Most Recent X → exceeds threshold → counts as numerator"). Filter framework-boilerplate compositions (IP/Num/Den graphs are framework, not patterns).

Both feed into pattern cards: name, declarative description, parameter sketch in clinical language, category, example callers, supporting Layer-1/2/3 evidence, anti-examples.

That's the next turn's work.
