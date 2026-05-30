# Layer 2 / 3 mining on the 12-measure sample

Sample libraries: **12**. Statements seen in sample: **326**. Clinical (boilerplate excluded): **224**.

Method:
- **Layer 2** — walk each statement's ELM body, extract feature flags (root expression type, retrieved FHIR resources, function refs called, presence of selection/aggregation/comparison/temporal-relation operators, sort, exists, not, and threshold literals). From features + name, derive coarse *clinical-intent tags*. Cluster on tags.
- **Layer 3** — record outgoing intra-library `ExpressionRef`s per statement → per-library dependency graph. Inspect for recurring compositional shapes.

## Layer 2 — clinical-intent tag clusters

Each statement may carry multiple tags (e.g. `most-recent` + `threshold-comparison` + `has-predicate`). Counts are per-statement occurrences of each tag in the clinical-sample population.

| Tag | # stmts | example statements |
|---|---:|---|
| `threshold-comparison` | 63 | `Delivery Encounter With Calculated Gestational Age Greater Than Or Equal To 37 Weeks` (CMS0334FHIRPCCesareanBirth) / `Delivery Encounter With Estimated Gestational Age Greater Than Or Equal To 37 Weeks` (CMS0334FHIRPCCesareanBirth) / `Singleton Delivery Encounters At 37 Plus Weeks Gravida 1 Parity 0, No Previous Births` (CMS0334FHIRPCCesareanBirth) |
| `selection` | 56 | `Patient` (CMS0334FHIRPCCesareanBirth) / `lastGravida` (CMS0334FHIRPCCesareanBirth) / `lastParity` (CMS0334FHIRPCCesareanBirth) |
| `temporal-rel` | 50 | `Encounter With Abnormal Presentation` (CMS0334FHIRPCCesareanBirth) / `Delivery Encounter With Cesarean Birth` (CMS0334FHIRPCCesareanBirth) / `Risk Variable Encounter with Anticoagulant Active at Admission` (CMS1017FHIRHHFI) |
| `encounter-qualification` | 44 | `Delivery Encounter With Calculated Gestational Age Greater Than Or Equal To 37 Weeks` (CMS0334FHIRPCCesareanBirth) / `Delivery Encounter With Estimated Gestational Age Greater Than Or Equal To 37 Weeks` (CMS0334FHIRPCCesareanBirth) / `Delivery Encounter With Gestational Age Greater Than Or Equal To 37 Weeks Based On Coding` (CMS0334FHIRPCCesareanBirth) |
| `case-feature-relationship` | 41 | `Delivery Encounter With Cesarean Birth` (CMS0334FHIRPCCesareanBirth) / `Encounter With A Fall Event` (CMS1017FHIRHHFI) / `Risk Variable Body Mass Index (BMI)` (CMS1017FHIRHHFI) |
| `exists-with-criterion` | 25 | `hasDiagnosisNotPresentOnAdmissionOrNull` (CMS1017FHIRHHFI) / `Encounter Where A Fall And Major Injury Occurred Not POA` (CMS1017FHIRHHFI) / `Encounter Where A Fall And Moderate Injury Occurred Not POA` (CMS1017FHIRHHFI) |
| `state-at-anchor` | 21 | `Encounter With A Fall Not Present On Admission` (CMS1017FHIRHHFI) / `Encounter With A Fall Present On Admission` (CMS1017FHIRHHFI) / `Risk Variable Encounter with Abnormal Weight Loss or Malnutrition Present on Admission` (CMS1017FHIRHHFI) |
| `has-predicate` | 20 | `Has Severe Combined Immunodeficiency` (CMS117FHIRChildImmunStatus) / `Has Immunodeficiency` (CMS117FHIRChildImmunStatus) / `Has HIV` (CMS117FHIRChildImmunStatus) |
| `threshold-named` | 18 | `Delivery Encounter With Calculated Gestational Age Greater Than Or Equal To 37 Weeks` (CMS0334FHIRPCCesareanBirth) / `Delivery Encounter With Estimated Gestational Age Greater Than Or Equal To 37 Weeks` (CMS0334FHIRPCCesareanBirth) / `Delivery Encounter With Gestational Age Greater Than Or Equal To 37 Weeks Based On Coding` (CMS0334FHIRPCCesareanBirth) |
| `temporal-offset-from-anchor` | 12 | `Encounter With Intervention Comfort Measures From Day Of Start Of Hospitalization To Day After Admission` (CMS108FHIRVTEProphylaxis) / `Encounter With Intervention Comfort Measures On Day Of Or Day After Procedure` (CMS108FHIRVTEProphylaxis) / `Encounter With VTE Prophylaxis Received From Day Of Start Of Hospitalization To Day After Admission Or Procedure` (CMS108FHIRVTEProphylaxis) |
| `absence-of` | 7 | `Risk Variable All Encounter Diagnoses with Rank and POA Indication` (CMS1017FHIRHHFI) / `Has No Record Of Glycemic Status Assessment` (CMS122FHIRDiabetesAssessGT9Pct) / `Has IPSD and Major Depression Diagnosis` (CMS128FHIRAntidepressantMgmt) |
| `most-recent` | 7 | `Most Recent Glycemic Status Date` (CMS122FHIRDiabetesAssessGT9Pct) / `Lowest Glycemic Status Assessment Reading on Most Recent Day` (CMS122FHIRDiabetesAssessGT9Pct) / `Has Most Recent Glycemic Status Assessment Without Result` (CMS122FHIRDiabetesAssessGT9Pct) |
| `during-measurement-period` | 5 | `Qualifying Encounter during Measurement Period` (CMS22FHIRPCSBPScreeningFollowUp) / `Is Pregnant During Measurement Period` (CMS69FHIRPCSBMIScreenAndFollowUp) / `BMI During Measurement Period` (CMS69FHIRPCSBMIScreenAndFollowUp) |
| `not-done-with-reason` | 4 | `Has Medical or Patient Reason for Not Ordering ACEI or ARB or ARNI` (CMS135FHIRACEIorARBorARNIforHF) / `Encounter with Medical Reason for Not Obtaining or Patient Declined Blood Pressure Measurement` (CMS22FHIRPCSBPScreeningFollowUp) / `Medical Reason For Not Documenting A Follow Up Plan For Low Or High BMI` (CMS69FHIRPCSBMIScreenAndFollowUp) |
| `first` | 2 | `First Two Years` (CMS117FHIRChildImmunStatus) / `First Hypertensive Reading Interventions or Referral to Alternate Professional` (CMS22FHIRPCSBPScreeningFollowUp) |
| `exists` | 1 | `Two Influenza Vaccinations Including One LAIV Vaccination` (CMS117FHIRChildImmunStatus) |
| `currently-taking` | 1 | `Is Currently Taking ACEI or ARB or ARNI` (CMS135FHIRACEIorARBorARNIforHF) |
| `within-window` | 1 | `Follow up with Rescreen Within 6 Months` (CMS22FHIRPCSBPScreeningFollowUp) |

## Layer 2 — combined-tag pivots (suggested candidate intents)

Cross-tag combinations are the bridge from feature flags to a candidate pattern name. Each row below: a combined-tag signature → the underlying intent it points to + a few example statements.

### `most-recent` + selection sort

**0** statements. Candidate intent: **`MostRecent(X)` — sort-and-take-most-recent of qualifying X**.


### `most-recent` + `threshold-comparison`

**1** statements. Candidate intent: **`ThresholdOn(MostRecent(X))` — most-recent value crosses a threshold**.

- `Has Most Recent Elevated Glycemic Status Assessment` (CMS122FHIRDiabetesAssessGT9Pct) — root: `Greater`, retrieves: [], tags: `threshold-comparison + has-predicate + most-recent`

### `first` + temporal anchor

**2** statements. Candidate intent: **`First(X[, period])` — earliest qualifying X in window**.

- `First Two Years` (CMS117FHIRChildImmunStatus) — root: `Interval`, retrieves: [], tags: `first`
- `First Hypertensive Reading Interventions or Referral to Alternate Professional` (CMS22FHIRPCSBPScreeningFollowUp) — root: `Union`, retrieves: [ServiceRequest], tags: `case-feature-relationship + first`

### `has-predicate` + `exists-with-criterion`

**12** statements. Candidate intent: **`Has(X)` — exists qualifying evidence of X**.

- `Has Severe Combined Immunodeficiency` (CMS117FHIRChildImmunStatus) — root: `Exists`, retrieves: [Condition], tags: `exists-with-criterion + has-predicate`
- `Has Immunodeficiency` (CMS117FHIRChildImmunStatus) — root: `Exists`, retrieves: [Condition], tags: `exists-with-criterion + has-predicate`
- `Has HIV` (CMS117FHIRChildImmunStatus) — root: `Exists`, retrieves: [Condition], tags: `exists-with-criterion + has-predicate`
- `Has Lymphoreticular Cancer, Multiple Myeloma or Leukemia` (CMS117FHIRChildImmunStatus) — root: `Exists`, retrieves: [Condition], tags: `exists-with-criterion + has-predicate`
- `Has Intussusception` (CMS117FHIRChildImmunStatus) — root: `Exists`, retrieves: [Condition], tags: `exists-with-criterion + has-predicate`
- `Has Appropriate Number of Hib Immunizations` (CMS117FHIRChildImmunStatus) — root: `Exists`, retrieves: [], tags: `exists-with-criterion + threshold-comparison + has-predicate`
- … and 6 more

### `has-predicate` + `during-measurement-period`

**0** statements. Candidate intent: **`HasDuring(X, period)` — Has(X) qualified to a period**.


### `absence-of`

**7** statements. Candidate intent: **`Without(X)` — absence of qualifying evidence of X**.

- `Risk Variable All Encounter Diagnoses with Rank and POA Indication` (CMS1017FHIRHHFI) — root: `Query`, retrieves: [Claim], tags: `absence-of + threshold-comparison`
- `Has No Record Of Glycemic Status Assessment` (CMS122FHIRDiabetesAssessGT9Pct) — root: `Not`, retrieves: [], tags: `absence-of + has-predicate`
- `Has IPSD and Major Depression Diagnosis` (CMS128FHIRAntidepressantMgmt) — root: `Exists`, retrieves: [Condition], tags: `absence-of + has-predicate`
- `Has Diagnosis of Pregnancy` (CMS135FHIRACEIorARBorARNIforHF) — root: `Or`, retrieves: [Condition, Observation], tags: `absence-of + case-feature-relationship + has-predicate`
- `High BMI Interventions Performed` (CMS69FHIRPCSBMIScreenAndFollowUp) — root: `Query`, retrieves: [Condition, Procedure], tags: `absence-of + temporal-rel`
- `Low BMI Interventions Performed` (CMS69FHIRPCSBMIScreenAndFollowUp) — root: `Query`, retrieves: [Condition, Procedure], tags: `absence-of + threshold-comparison + temporal-rel`
- … and 1 more

### `not-done-with-reason`

**4** statements. Candidate intent: **`NotDoneWithReason(action, reason)` — expected action not done, with accepted reason**.

- `Has Medical or Patient Reason for Not Ordering ACEI or ARB or ARNI` (CMS135FHIRACEIorARBorARNIforHF) — root: `Exists`, retrieves: [MedicationRequest], tags: `exists-with-criterion + not-done-with-reason + has-predicate`
- `Encounter with Medical Reason for Not Obtaining or Patient Declined Blood Pressure Measurement` (CMS22FHIRPCSBPScreeningFollowUp) — root: `Query`, retrieves: [Observation], tags: `selection + threshold-comparison + case-feature-relationship + not-done-with-reason + encounter-qualification`
- `Medical Reason For Not Documenting A Follow Up Plan For Low Or High BMI` (CMS69FHIRPCSBMIScreenAndFollowUp) — root: `Union`, retrieves: [MedicationRequest, ServiceRequest], tags: `selection + threshold-comparison + temporal-rel + case-feature-relationship + not-done-with-reason`
- `Medical Reason Or Patient Reason For Not Performing BMI Exam` (CMS69FHIRPCSBMIScreenAndFollowUp) — root: `Query`, retrieves: [Observation], tags: `selection + threshold-comparison + temporal-rel + case-feature-relationship + not-done-with-reason`

### `state-at-anchor`

**21** statements. Candidate intent: **`StateAtAnchor(X, anchor)` — clinical state as of an anchor point (admission/discharge/etc.)**.

- `Encounter With A Fall Not Present On Admission` (CMS1017FHIRHHFI) — root: `Query`, retrieves: [], tags: `state-at-anchor + encounter-qualification`
- `Encounter With A Fall Present On Admission` (CMS1017FHIRHHFI) — root: `Query`, retrieves: [], tags: `state-at-anchor + encounter-qualification`
- `Risk Variable Encounter with Abnormal Weight Loss or Malnutrition Present on Admission` (CMS1017FHIRHHFI) — root: `Query`, retrieves: [], tags: `state-at-anchor`
- `Risk Variable Encounter with Anticoagulant Active at Admission` (CMS1017FHIRHHFI) — root: `Query`, retrieves: [Medication, MedicationRequest], tags: `selection + threshold-comparison + temporal-rel + case-feature-relationship + state-at-anchor`
- `Risk Variable Encounter with Antidepressant Active at Admission` (CMS1017FHIRHHFI) — root: `Query`, retrieves: [Medication, MedicationRequest], tags: `selection + threshold-comparison + temporal-rel + case-feature-relationship + state-at-anchor`
- `Risk Variable Encounter with Antihypertensive Active at Admission` (CMS1017FHIRHHFI) — root: `Query`, retrieves: [Medication, MedicationRequest], tags: `selection + threshold-comparison + temporal-rel + case-feature-relationship + state-at-anchor`
- … and 15 more

### `encounter-qualification`

**44** statements. Candidate intent: **`EncounterWith(criterion)` / `QualifyingEncounter(criterion)` — encounter qualified by clinical criterion**.

- `Delivery Encounter With Calculated Gestational Age Greater Than Or Equal To 37 Weeks` (CMS0334FHIRPCCesareanBirth) — root: `Query`, retrieves: [], tags: `threshold-comparison + encounter-qualification + threshold-named`
- `Delivery Encounter With Estimated Gestational Age Greater Than Or Equal To 37 Weeks` (CMS0334FHIRPCCesareanBirth) — root: `Query`, retrieves: [], tags: `threshold-comparison + encounter-qualification + threshold-named`
- `Delivery Encounter With Gestational Age Greater Than Or Equal To 37 Weeks Based On Coding` (CMS0334FHIRPCCesareanBirth) — root: `Query`, retrieves: [], tags: `encounter-qualification + threshold-named`
- `Delivery Encounter With Gestational Age Greater Than Or Equal To 37 Weeks` (CMS0334FHIRPCCesareanBirth) — root: `Union`, retrieves: [], tags: `encounter-qualification + threshold-named`
- `Encounter With Singleton Delivery` (CMS0334FHIRPCCesareanBirth) — root: `Query`, retrieves: [], tags: `encounter-qualification`
- `Encounter With Abnormal Presentation` (CMS0334FHIRPCCesareanBirth) — root: `Query`, retrieves: [Observation], tags: `selection + temporal-rel + encounter-qualification`
- … and 38 more

### `history-of`

**0** statements. Candidate intent: **`HasHistoryOf(X)` — patient had X in the past**.


### `currently-taking`

**1** statements. Candidate intent: **`CurrentlyTaking(med)` — patient currently on medication**.

- `Is Currently Taking ACEI or ARB or ARNI` (CMS135FHIRACEIorARBorARNIforHF) — root: `Exists`, retrieves: [MedicationRequest], tags: `exists-with-criterion + currently-taking`

### `initial-followup-pair`

**0** statements. Candidate intent: **`AssessmentPair(initial, followup)` — initial + follow-up assessment paired**.


### `threshold-comparison` (broader)

**63** statements. Candidate intent: **`Threshold(value, op, target)` — generic threshold predicate**.

- `Delivery Encounter With Calculated Gestational Age Greater Than Or Equal To 37 Weeks` (CMS0334FHIRPCCesareanBirth) — root: `Query`, retrieves: [], tags: `threshold-comparison + encounter-qualification + threshold-named`
- `Delivery Encounter With Estimated Gestational Age Greater Than Or Equal To 37 Weeks` (CMS0334FHIRPCCesareanBirth) — root: `Query`, retrieves: [], tags: `threshold-comparison + encounter-qualification + threshold-named`
- `Singleton Delivery Encounters At 37 Plus Weeks Gravida 1 Parity 0, No Previous Births` (CMS0334FHIRPCCesareanBirth) — root: `Query`, retrieves: [], tags: `threshold-comparison`
- `Delivery Encounter With Cesarean Birth` (CMS0334FHIRPCCesareanBirth) — root: `Query`, retrieves: [Procedure], tags: `threshold-comparison + temporal-rel + case-feature-relationship + encounter-qualification`
- `Qualifying Encounter` (CMS1017FHIRHHFI) — root: `Query`, retrieves: [], tags: `threshold-comparison + encounter-qualification`
- `hasDiagnosisNotPresentOnAdmissionOrNull` (CMS1017FHIRHHFI) — root: `Exists`, retrieves: [Claim], tags: `exists-with-criterion + threshold-comparison`
- … and 57 more

### `temporal-offset-from-anchor`

**12** statements. Candidate intent: **`OffsetFromAnchor(X, anchor, offset)` — "Day After Procedure", "From Day Of Start Of Hospitalization To Day After Admission"**.

- `Encounter With Intervention Comfort Measures From Day Of Start Of Hospitalization To Day After Admission` (CMS108FHIRVTEProphylaxis) — root: `Query`, retrieves: [], tags: `case-feature-relationship + encounter-qualification + temporal-offset-from-anchor`
- `Encounter With Intervention Comfort Measures On Day Of Or Day After Procedure` (CMS108FHIRVTEProphylaxis) — root: `Query`, retrieves: [Procedure], tags: `threshold-comparison + temporal-rel + encounter-qualification + temporal-offset-from-anchor`
- `Encounter With VTE Prophylaxis Received From Day Of Start Of Hospitalization To Day After Admission Or Procedure` (CMS108FHIRVTEProphylaxis) — root: `Union`, retrieves: [Procedure], tags: `threshold-comparison + temporal-rel + encounter-qualification + temporal-offset-from-anchor`
- `Encounter With Medication Oral Factor Xa Inhibitor Administered On Day Of Or Day After Admission Or Procedure` (CMS108FHIRVTEProphylaxis) — root: `Union`, retrieves: [Medication, MedicationAdministration, Procedure], tags: `selection + threshold-comparison + temporal-rel + case-feature-relationship + encounter-qualification + temporal-offset-from-anchor`
- `Low Risk For VTE Or Anticoagulant Administered From Day Of Start Of Hospitalization To Day After Admission` (CMS108FHIRVTEProphylaxis) — root: `Query`, retrieves: [], tags: `case-feature-relationship + temporal-offset-from-anchor`
- `Low Risk For VTE Or Anticoagulant Administered On Day Of Or Day After Procedure` (CMS108FHIRVTEProphylaxis) — root: `Query`, retrieves: [Procedure], tags: `threshold-comparison + temporal-rel + temporal-offset-from-anchor`
- … and 6 more

### `aggregation` + counting

**0** statements. Candidate intent: **`Count(events)` / `CountAtLeast(events, n)` — counting predicate**.


### `within-window`

**1** statements. Candidate intent: **`Within(X, window)` — bounded lookback / look-forward window**.

- `Follow up with Rescreen Within 6 Months` (CMS22FHIRPCSBPScreeningFollowUp) — root: `Query`, retrieves: [ServiceRequest], tags: `threshold-comparison + within-window`

### `during-measurement-period` (without `has-predicate`)

**5** statements. Candidate intent: **`During(event, period)` — event lives in a period (not embedded inside a Has)**.

- `Qualifying Encounter during Measurement Period` (CMS22FHIRPCSBPScreeningFollowUp) — root: `Query`, retrieves: [Encounter], tags: `threshold-comparison + encounter-qualification + during-measurement-period`
- `Is Pregnant During Measurement Period` (CMS69FHIRPCSBMIScreenAndFollowUp) — root: `Or`, retrieves: [Condition, Observation], tags: `exists-with-criterion + temporal-rel + during-measurement-period`
- `BMI During Measurement Period` (CMS69FHIRPCSBMIScreenAndFollowUp) — root: `Query`, retrieves: [Observation], tags: `threshold-comparison + temporal-rel + during-measurement-period`
- `Documented High BMI During Measurement Period` (CMS69FHIRPCSBMIScreenAndFollowUp) — root: `Query`, retrieves: [], tags: `threshold-comparison + during-measurement-period`
- `Documented Low BMI During Measurement Period` (CMS69FHIRPCSBMIScreenAndFollowUp) — root: `Query`, retrieves: [], tags: `threshold-comparison + during-measurement-period`

## Layer 2 — root expression types in the sample

| Root | # |
|---|---:|
| `Query` | 117 |
| `Union` | 39 |
| `Exists` | 15 |
| `SingletonFrom` | 13 |
| `Interval` | 6 |
| `As` | 4 |
| `And` | 3 |
| `DateTime` | 3 |
| `Add` | 2 |
| `Last` | 2 |
| `Property` | 2 |
| `GreaterOrEqual` | 2 |
| `ExpressionRef` | 2 |
| `Or` | 2 |
| `First` | 2 |
| `Less` | 2 |
| `Intersect` | 2 |
| `DurationBetween` | 1 |
| `Count` | 1 |
| `Greater` | 1 |
| `Not` | 1 |
| `Implies` | 1 |
| `Except` | 1 |

## Layer 2 — helper functions called by sample statements (intent evidence)

Function calls in the sample statements indicate which clinical intents already have named helpers in the corpus. We keep these as *evidence* for what intents to catalog — not as catalog entries.

| Function | # callers in sample |
|---|---:|
| `FHIRHelpers.ToValue` | 61 |
| `FHIRHelpers.ToConcept` | 57 |
| `FHIRHelpers.ToInterval` | 43 |
| `QICoreCommon.toInterval` | 32 |
| `QICoreCommon.prevalenceInterval` | 30 |
| `QICoreCommon.earliest` | 28 |
| `Status.verified` | 24 |
| `Status.isProcedurePerformed` | 18 |
| `CQMCommon.isDiagnosisPresentOnAdmission` | 14 |
| `Status.isImmunizationAdministered` | 13 |
| `FHIRHelpers.ToString` | 10 |
| `TJC.calendarDayOfOrDayAfter` | 8 |
| `CQMCommon.hospitalizationWithObservation` | 7 |
| `QICoreCommon.getId` | 7 |
| `QICoreCommon.latest` | 7 |
| `CMD.medicationRequestPeriod` | 6 |
| `QICoreCommon.isCommunity` | 6 |
| `<>.fromDayOfStartOfHospitalizationToDayAfterAdmission` | 6 |
| `Status.isEncounterPerformed` | 6 |
| `PCMaternal.lastTimeOfDelivery` | 5 |
| `QICoreCommon.references` | 5 |
| `FHIRHelpers.ToQuantity` | 5 |
| `CQMCommon.encounterDiagnosis` | 4 |
| `PCMaternal.calculatedGestationalAge` | 3 |
| `CQMCommon.lengthInDays` | 3 |
| `CMD.medicationDispensePeriod` | 3 |
| `Status.isMedicationDispensed` | 3 |
| `AHA.overlapsAfterHeartFailureOutpatientEncounter` | 3 |
| `FHIRHelpers.ToCode` | 3 |
| `PCMaternal.lastEstimatedGestationalAge` | 2 |

## Layer 3 — per-library dependency-graph snapshot

For each sample library, summary of the intra-library dependency graph (which clinical defines reference which others). Roots = top-level statements no one references; leaves = defines that reference no others. Mid-tier nodes are compositional patterns — that's where Layer-3 patterns live.

| Library | Defines | Edges | Roots (no in-edges) | Leaves (no out-edges) |
|---|---:|---:|---:|---:|
| `CMS0334FHIRPCCesareanBirth` | 15 | 10 | 7 | 9 |
| `CMS1017FHIRHHFI` | 36 | 39 | 30 | 4 |
| `CMS108FHIRVTEProphylaxis` | 29 | 21 | 15 | 14 |
| `CMS117FHIRChildImmunStatus` | 51 | 59 | 31 | 2 |
| `CMS122FHIRDiabetesAssessGT9Pct` | 8 | 6 | 5 | 3 |
| `CMS125FHIRBreastCancerScreen` | 8 | 0 | 8 | 8 |
| `CMS128FHIRAntidepressantMgmt` | 13 | 11 | 5 | 3 |
| `CMS135FHIRACEIorARBorARNIforHF` | 8 | 0 | 8 | 8 |
| `CMS139FHIRFallRiskScreening` | 2 | 0 | 2 | 2 |
| `CMS165FHIRControllingHighBP` | 13 | 8 | 8 | 7 |
| `CMS22FHIRPCSBPScreeningFollowUp` | 26 | 40 | 9 | 9 |
| `CMS69FHIRPCSBMIScreenAndFollowUp` | 15 | 13 | 7 | 8 |

Note: framework-boilerplate names (IP/Num/Den) are still counted in this graph view because the dependency relation is itself the QM API skeleton. The clinical-reasoning compositions are the mid-tier subgraphs that *flow into* IP/Num/Den — those are the legitimate Layer-3 patterns (see north star).
