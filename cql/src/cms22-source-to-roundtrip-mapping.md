# CMS22 source CQL → CRL → round-trip CQL — define mapping

**Source:** `features/cql-pattern-mining/data/cql/dqm-content-qicore-2025/CMS22FHIRPCSBPScreeningFollowUp.cql` (~410 lines, 30 named defines + 4 SDE + 1 fluent helper).
**Source CRL:** `features/cql-pattern-mining/results/models/cms22-monolith/cms22.crl` (hand-authored CRL of the same measure).
**Round-trip CQL:** `cql/src/CMS22Generated.cql` (505 lines, 135 defines — committed `59636ae`).

The round-trip decomposes each source define into a chain of named CRL concepts, then re-emits each as its own `define`. The expansion ratio (~1 : 4–5) is the cost of declarative authoring: every conceptual step gets a name, is individually inspectable, and can be reused.

Each row below maps a **source define** → the **set of round-trip defines** that together produce its semantics. Read top-to-bottom: population-level → encounter classification → refinement chains → followup bundles → decline bundles → helper retrieves → out-of-scope.

---

## Population-level (the measure logic)

| Source define | Round-trip defines (semantically equivalent set) |
|---|---|
| `Initial Population` (line 41) | `Age At Start Of MP At Least 18 Years` (481), `Aged 18+ at Measurement Period Start` (484), `Initial Population` (487) |
| `Denominator` (45) | `Denominator` (490) |
| `Denominator Exclusions` (48) | `Hypertension Diagnoses` (47), `Hypertension Diagnoses Verified` (355), `Verified Hypertension` (358), `Verified Hypertension As Of Qualifying Encounter Narrative` (361), `Verified Hypertension As Of Qualifying Encounter` (364), `Denominator Exclusions` (493) |
| `Numerator` (54) | `Numerator` (496) — composes `Normal BP Reading` + 4 followup chains (Elevated/First/Second-130s/Second-140+ "With Followup"). Each "With Followup" combines a BP-reading predicate with its respective Followup Bundle. |
| `Denominator Exceptions` (61) | `Denominator Exceptions` (503), `BP Measurement Not Done With Reason` (378), `HTN Followup Declined By Patient` (475). Each rolls up the Declined-bundle chains. |

---

## Qualifying Encounter — refinement composition

| Source define | Round-trip defines |
|---|---|
| `Qualifying Encounter during Measurement Period` (143) | `BP Screening Encounters` (41), `Virtual Encounters` (44), `BP Evaluation Encounter (not virtual)` (110) — `BP Screening Encounters except Virtual Encounters`, `BP Evaluation Encounter (not virtual) During MP` (114) — `CRLPatterns.During(...)`, `BP Evaluation Encounter (not virtual) Performed` (117) — `CRLPatterns.WasPerformed(...)`, `Qualifying Encounter` (120) — `intersect` of the above two |

Source emits one `[Encounter: vs] where ... during MP and status finished and class not virtual`. Round-trip splits the three predicates across three named refinements + one composition.

---

## BP reading classification (component extraction + value comparison)

Source folds `Last([USCoreBloodPressureProfile])` + `singleton from component where code ~ Systolic` + `.value in Interval[...]` into each ranged define. Round-trip names every step.

| Source define | Round-trip defines |
|---|---|
| `Encounter with Normal Blood Pressure Reading` (161) | `Blood Pressure Panels` (50), `Last BP Panels On Qualifying Encounter Day` (136), `Last BP Panel on Qualifying Encounter Day` (139), `Systolic Code Component of Last BP Panel On Encounter Day` (142), `Diastolic Code Component of Last BP Panel On Encounter Day` (145), `Last Systolic on Qualifying Encounter Day` (148), `Last Diastolic on Qualifying Encounter Day` (151), `Last Systolic Below 120` (154), `Last Diastolic Below 80` (157), `Normal BP Reading` (181) |
| `Encounter with Elevated Blood Pressure Reading SBP 120 to 129 AND DBP less than 80` (177) | reuses the Last-BP/Component chain above + `Last Systolic Between 120 and 129` (160), `Elevated BP Reading` (185) |
| `Encounter with First Hypertensive Reading SBP >= 130 OR DBP >= 80` (253) | + `Last Systolic At Least 130` (163), `Last Diastolic At Least 80` (166), `Hypertensive Reading` (189), `Without Record Of Prior-Year Hypertensive Reading` (221), `First Hypertensive Reading` (224) |
| `Encounter with Second Hypertensive Reading SBP 130 to 139 OR DBP 80 to 89` (223) | + `Last Systolic Between 130 and 139` (169), `Last Diastolic Between 80 and 89` (172), `Second Hypertensive Reading 130s Body` (228), `Second Hypertensive Reading 130s` (234) — gates on `Prior-Year Hypertensive Reading` |
| `Encounter with Second Hypertensive Reading SBP >= 140 OR DBP >= 90` (194) | + `Last Systolic At Least 140` (175), `Last Diastolic At Least 90` (178), `Second Hypertensive Reading 140+ Body` (238), `Second Hypertensive Reading 140+` (242) |
| `Encounter with Hypertensive Reading Within Year Prior` (282) | `Last BP Panels Within Year Prior To Qualifying Encounter` (193), `Last BP Panel Within Year Prior to Qualifying Encounter` (196), `Systolic Code Component of Prior-Year Last BP Panel` (199), `Diastolic Code Component of Prior-Year Last BP Panel` (202), `Prior-Year Last Systolic` (205), `Prior-Year Last Diastolic` (208), `Prior-Year Last Systolic At Least 130` (211), `Prior-Year Last Diastolic At Least 80` (214), `Prior-Year Hypertensive Reading` (217) |

---

## Followup bundles (positive path — orders same-day with Qualifying Encounter)

Source defines `Encounter with X and Interventions` as `Encounter with Y such that Y.authoredOn during day of Encounter.period` joins. Round-trip names each SameDay-with-QE concept + a bundle composition.

| Source define | Round-trip defines |
|---|---|
| `Encounter with Elevated Blood Pressure Reading ... and Interventions` (149) | `Six-Month Rescreen Order` (255), `Non-Pharmacological Recommendation Order` (268), `Referral for Hypertensive Reading` (294), `Six-Month Rescreen Order Same Day As Qualifying Encounter` (298), `Non-Pharm Recommendation Order Same Day As Qualifying Encounter` (301), `Referral for Hypertensive Reading Same Day As Qualifying Encounter` (304), `Elevated BP Followup Bundle` (316), `Elevated BP With Followup` (339) |
| `Encounter with First Hypertensive Reading ... and Interventions` (83) | + `Four-Week Rescreen Order` (252), `Four-Week Rescreen Order Same Day As Qualifying Encounter` (307), `First HTN Followup Bundle` (321), `First HTN With Followup` (343) |
| `Encounter with Second Hypertensive Reading 130-139 ... and Interventions` (88) | + `Hypertension Lab or ECG Order` (279), `Hypertension Lab or ECG Order Same Day As Qualifying Encounter` (310), `Second HTN 130s Followup Bundle` (326), `Second HTN 130s With Followup` (347) |
| `Encounter with Second Hypertensive Reading 140+ ... and Interventions` (98) | + `Antihypertensive Medication Order` (285), `Antihypertensive Medication Order Same Day As Qualifying Encounter` (313), `Second HTN 140+ Followup Bundle` (332), `Second HTN 140+ With Followup` (351) |
| `Referral to Alternate or Primary Healthcare Professional for Hypertensive Reading` (116) | `Hypertensive Reading Findings` (101), `Primary-Care Referrals` (86), `Primary-Care Referral Justified by Hypertensive Reading` (288), `Primary-Care Referrals Ordered` (291), `Referral for Hypertensive Reading` (294) — `intersect` of Justified + Ordered |
| `Follow up with Rescreen Within 6 Months` (65) | `Follow-up Within 6 Months` (68), `Follow-up Within 6 Months Ordered` (249), `Six-Month Rescreen Order` (255) |
| `Laboratory Test or ECG for Hypertension` (69) | `EKG 12-Lead Panel Requests` (92), `EKG Study Requests` (95), `Hypertension Lab Tests` (89), `Hypertension Lab or ECG Requests` (271), `Hypertension Lab or ECG Requests Ordered` (276), `Hypertension Lab or ECG Order` (279) |
| `NonPharmacological Interventions` (75) | `Lifestyle Recommendations` (71), `Weight Reduction Recommendations` (74), `Dietary Recommendations` (77), `Physical Activity Recommendations` (80), `Alcohol Counseling Referrals` (83), `Non-Pharmacological Recommendations` (258), `Non-Pharmacological Recommendations Ordered` (265), `Non-Pharmacological Recommendation Order` (268) |
| `First Hypertensive Reading Interventions or Referral to Alternate Professional` (107) | folded into the same SameDay+Bundle chain — round-trip doesn't surface this intermediate as a standalone define |
| `Second Hypertensive Reading SBP >= 140 OR DBP >= 90 Interventions` (121) | folded into `Second HTN 140+ Followup Bundle` (332) |
| `Second Hypertensive Reading SBP 130-139 OR DBP 80-89 and Interventions` (135) | folded into `Second HTN 130s Followup Bundle` (326) |

---

## Decline bundles (negative path — NotDoneWithReason "Patient Declined")

| Source define | Round-trip defines |
|---|---|
| `Encounter with Medical Reason for Not Obtaining or Patient Declined Blood Pressure Measurement` (318) | `BP Measurement Sources` (367), `Medical Reasons` (104), `Patient Declined Reasons` (107), `BP Measurement Sources Not Done With Reason` (372), `BP Measurement Sources Same Day As Qualifying Encounter` (375), `BP Measurement Not Done With Reason` (378) |
| `Encounter with Order for Hypertension Follow Up Declined by Patient` (328) | full Decline chain: `Follow-up Within 4 Weeks Declined by Patient` (382), `Follow-up Within 6 Months Declined by Patient` (385), `Primary-Care Referrals Declined by Patient` (388), `Non-Pharmacological Recommendations Declined by Patient` (391), `Hypertension Lab or ECG Requests Declined by Patient` (394), `Antihypertensive Medications Declined by Patient` (397), then `Four-Week Rescreen Declined` (400), `Six-Month Rescreen Declined` (403), `Primary-Care Referral Declined` (406), `Non-Pharm Recommendation Declined` (409), `Hypertension Lab or ECG Declined` (412), `Antihypertensive Medication Declined` (415), then SameDay versions (418, 421, 424, 427, 430, 433), then Bundles `Elevated BP Declined Bundle` (436), `First HTN Declined Bundle` (441), `Second HTN 130s Declined Bundle` (446), `Second HTN 140+ Declined Bundle` (452), then `With Declined Followup` rollups (459, 463, 467, 471), then `HTN Followup Declined By Patient` (475) |
| `NonPharmacological Intervention Not Ordered` (309) | covered by `Non-Pharmacological Recommendations Declined by Patient` (391) |
| `Laboratory Test or ECG for Hypertension Not Ordered` (383) | covered by `Hypertension Lab or ECG Requests Declined by Patient` (394) |
| `Second Hypertensive Reading SBP 130-139 OR DBP 80-89 Interventions Declined` (361) | folded into `Second HTN 130s Declined Bundle` (446) |
| `Second Hypertensive Reading SBP >= 140 OR DBP >= 90 Interventions Declined` (370) | folded into `Second HTN 140+ Declined Bundle` (452) |

---

## Asserted retrieves (no source equivalent — round-trip names each `[Resource: vs]` retrieve)

These are the foundation defines that round-trip introduces to give names to every base list. Source CQL writes the retrieves inline at each use site; round-trip uses them as building blocks.

| Round-trip define | What it retrieves |
|---|---|
| `BP Screening Encounters` (41) | `[Encounter: "Encounter to Screen for Blood Pressure"]` |
| `Virtual Encounters` (44) | `[Encounter: "Virtual Encounter Class"]` |
| `Hypertension Diagnoses` (47) | `[Condition: "Diagnosis of Hypertension"]` |
| `Blood Pressure Panels` (50) | `[Observation: "Blood pressure panel ..."]` |
| `Systolic Blood Pressure Code` (53), `Diastolic Blood Pressure Code` (56), `Standalone Systolic BP Observations` (59), `Standalone Diastolic BP Observations` (62) | LOINC code retrieves |
| `Follow-up Within 4 Weeks` (65), `Follow-up Within 6 Months` (68) | `[ServiceRequest: vs]` retrieves |
| `Lifestyle Recommendations` (71), `Weight Reduction Recommendations` (74), `Dietary Recommendations` (77), `Physical Activity Recommendations` (80), `Alcohol Counseling Referrals` (83), `Primary-Care Referrals` (86), `Hypertension Lab Tests` (89), `EKG 12-Lead Panel Requests` (92), `EKG Study Requests` (95), `Antihypertensive Medications` (98), `Hypertensive Reading Findings` (101), `Medical Reasons` (104), `Patient Declined Reasons` (107) | per-valueset retrieves |

---

## Out of scope (intentionally absent in round-trip)

| Source define | Why not in round-trip |
|---|---|
| `SDE Ethnicity` / `SDE Payer` / `SDE Race` / `SDE Sex` (390–399) | Supplemental Data Elements — the source CRL doesn't author these; they ride on the SDE include library. Out-of-scope for the measure's clinical logic. |
| `fluent function isVerified(...)` (407) | The CRL `IsVerified` pattern handles Condition verification status via the catalog (`CRLPatterns.IsVerified(Condition)`); the fluent helper isn't needed in the round-trip. |

---

## Architectural notes

1. **Shape propagation.** Source threads `List<Encounter>` through `with...such that` joins. Round-trip keeps the list shape at named-concept boundaries (e.g., `SameDay` returns `List<ServiceRequest>`) and only collapses to boolean at the bundle level via `exists()`. The author's declared `(type, valuetype)` per concept drives that decision; the principle delivers ([[defined-as-is-semantic-composition]], [[patterns-are-semantic]]).

2. **Component extraction.** Source uses `singleton from (component where ...)` then inline `.value` access. Round-trip names each step — `ComponentOf` returns typed `List<Quantity>` so the value-comparator overloads (`Below`, `AtLeast`, `Between`) dispatch cleanly. More writing, more rigor.

3. **Expansion ratio.** Source: 30 named defines + inline complexity. Round-trip: 135 named defines, each individually inspectable. Trade-off: round-trip is more verbose at the file level but each concept is reusable and the chain of reasoning is explicit.

4. **Library back-end.** Source uses `[USCoreBloodPressureProfile]`, `[ConditionProblemsHealthConcerns]`, `[ServiceNotRequested]`, `[MedicationNotRequested]`, `[ObservationCancelled]` — these are QICore profile retrieves. Round-trip targets plain FHIR R4 and reads the cancelled/not-done semantics via `CRLPatterns.NotDoneWithReason` per resource. See `cql/README.md` "Why FHIR R4 (and not QICore)" for the rationale.

5. **Validation.** Both libraries compile cleanly against `cqf-fhir-cr-cli` 4.7.0. Round-trip's `Qualifying Encounter` evaluates without errors. The full round-trip is committed at `59636ae`.
