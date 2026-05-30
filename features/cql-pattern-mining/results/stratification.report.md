# stratification — corpus partitioning report

Total statements scanned: **2344**.

Roles: `measure` (primary mining target — clinical logic), `common` (close-to-named clinical shapes; secondary signal), `helper` (pure implementation aids; out of scope, used as negative control), `uncategorized` (flag for manual review).

## Totals by role

| Role | Libraries | Statements |
|---|---:|---:|
| `measure` | 70 | 1722 |
| `helper` | 4 | 333 |
| `common` | 12 | 175 |
| `uncategorized` | 5 | 114 |

## Measure-library content split (clinical vs boilerplate)

Within measure libraries, statements are tagged `boilerplate` if their name matches the quality-measure API skeleton (Initial Population / Numerator / Denominator / Exclusions / Exceptions / Measure Population / Stratification / SDE_*). Everything else is `clinical` and goes into mining.

| Tag | Count |
|---|---:|
| `clinical` | 1135 |
| `boilerplate` | 587 |

### Boilerplate patterns matched

| Pattern (regex) | Count |
|---|---:|
| `^SDE ` | 286 |
| `^Denominator (Exclusions?|Exceptions?)$` | 70 |
| `^Initial Population$` | 67 |
| `^Denominator$` | 64 |
| `^Numerator$` | 60 |
| `^Stratification` | 30 |
| `^Measure Observation` | 6 |
| `^Numerator (Exclusions?|Exceptions?)$` | 2 |
| `^Measure Population$` | 1 |
| `^Measure Population Exclusions?$` | 1 |

## Measure libraries (primary mining target)

| Library | Total | Clinical | Boilerplate |
|---|---:|---:|---:|
| `CMS1218FHIRHHRF` | 96 | 88 | 8 |
| `CMS1028FHIRPCSevereOBComps` | 69 | 58 | 11 |
| `CMS117FHIRChildImmunStatus` | 59 | 51 | 8 |
| `CMS145FHIRCADBBlockerTPMIorLVSD` | 51 | 46 | 5 |
| `CMS832FHIRHHAKI` | 53 | 45 | 8 |
| `CMS1017FHIRHHFI` | 45 | 36 | 9 |
| `CMS1244FHIRECATHOQR` | 45 | 34 | 11 |
| `CMS190FHIRVTEProphylaxisICU` | 39 | 30 | 9 |
| `CMS108FHIRVTEProphylaxis` | 37 | 29 | 8 |
| `CMS347FHIRStatinPreventionTxCVD` | 35 | 28 | 7 |
| `CMS136FHIRChildADHDMedFollowUp` | 31 | 26 | 5 |
| `CMS22FHIRPCSBPScreeningFollowUp` | 35 | 26 | 9 |
| `CMS996FHIRAptTxforSTEMI` | 35 | 26 | 9 |
| `CMS56FHIRFuncStatHipReplacement` | 33 | 25 | 8 |
| `CMS1264FHIRECATREHQR` | 34 | 23 | 11 |
| `CMS156FHIRHighRiskMedsElderly` | 30 | 23 | 7 |
| `CMS90FHIRFSAforHeartFailure` | 31 | 23 | 8 |
| `CMS871FHIRHHHyper` | 31 | 22 | 9 |
| `CMS986FHIRMalnutritionScore` | 35 | 22 | 13 |
| `CMS1154ScreeningPrediabetesFHIR` | 27 | 19 | 8 |
| `CMS2FHIRPCSDepScreenAndFollowUp` | 28 | 19 | 9 |
| `CMS771FHIRUrinarySymptomScoreBPH` | 26 | 18 | 8 |
| `CMS826FHIRHHPI` | 26 | 18 | 8 |
| `CMS646FHIRIntravesicalBCGTherapy` | 26 | 17 | 9 |
| `CMS144FHIRHFBetaBlockerForLVSD` | 25 | 16 | 9 |
| `CMS0334FHIRPCCesareanBirth` | 24 | 15 | 9 |
| `CMS1173FHIRDiagnosticDelayVTE` | 23 | 15 | 8 |
| `CMS69FHIRPCSBMIScreenAndFollowUp` | 24 | 15 | 9 |
| `CMS72FHIRSTKAntithromboticDay2` | 24 | 15 | 9 |
| `CMS138FHIRTobaccoScrnCessation` | 20 | 14 | 6 |
| `CMS128FHIRAntidepressantMgmt` | 20 | 13 | 7 |
| `CMS131FHIRDiabetesEyeExam` | 21 | 13 | 8 |
| `CMS165FHIRControllingHighBP` | 21 | 13 | 8 |
| `CMS137FHIRSUDTxInitEngagement` | 22 | 12 | 10 |
| `CMS142FHIRCommWithDrManagingDiab` | 20 | 12 | 8 |
| `CMS159FHIRDepRemissionat12Months` | 22 | 12 | 10 |
| `CMS129FHIRProstCaBoneScanUse` | 19 | 11 | 8 |
| `CMS153FHIRChlamydiaScreening` | 21 | 11 | 10 |
| `CMS157FHIRPainIntensityQuantified` | 15 | 11 | 4 |
| `CMS645FHIRBoneDensityPCADTherapy` | 19 | 11 | 8 |
| `CMS506FHIRSafeUseofOpioids` | 18 | 10 | 8 |
| `CMS951FHIRKidneyHealthEval` | 18 | 10 | 8 |
| `CMS155FHIRWgtAssessCounseling` | 18 | 9 | 9 |
| `CMS122FHIRDiabetesAssessGT9Pct` | 16 | 8 | 8 |
| `CMS125FHIRBreastCancerScreen` | 18 | 8 | 10 |
| `CMS130FHIRColorectalCancerScrn` | 18 | 8 | 10 |
| `CMS135FHIRACEIorARBorARNIforHF` | 17 | 8 | 9 |
| `CMS143FHIRPOAGOpticNerveEval` | 16 | 8 | 8 |
| `CMS816FHIRHHHypo` | 15 | 8 | 7 |
| `CMS1157FHIRHIVRetention` | 14 | 7 | 7 |
| `CMS1188FHIRHIVSTITesting` | 14 | 7 | 7 |
| `CMS146FHIRApproTestPharyngitis` | 18 | 7 | 11 |
| `CMS149FHIRDementiaCognitiveAssess` | 15 | 7 | 8 |
| `CMS177FHIRChildMDDSuicideAssmt` | 13 | 6 | 7 |
| `CMS819FHIRHHORAE` | 13 | 6 | 7 |
| `CMS104FHIRSTKDCAntithrombotic` | 14 | 5 | 9 |
| `CMS124FHIRCervicalCancerScreen` | 13 | 5 | 8 |
| `CMS314FHIRHIVViralSuppression` | 12 | 5 | 7 |
| `CMS349FHIRHIVScreening` | 14 | 5 | 9 |
| `CMS50FHIRReceiptofSpecialistReport` | 12 | 5 | 7 |
| `CMS71FHIRSTKAnticoagAFFlutter` | 14 | 5 | 9 |
| `CMS1074FHIRCTIQR` | 12 | 4 | 8 |
| `CMS1206FHIRCTOQR` | 12 | 4 | 8 |
| `CMS133FHIRCataracts2040BCVA90Days` | 12 | 4 | 8 |
| `CMS154FHIRAppropriateTxforURI` | 15 | 4 | 11 |
| `CMS1056FHIRCTClinical` | 11 | 3 | 8 |
| `CMS139FHIRFallRiskScreening` | 10 | 2 | 8 |
| `CMS68FHIRDocumentationCurrentMeds` | 10 | 2 | 8 |
| `CMS74FHIRDentalCariesPrevention` | 13 | 2 | 11 |
| `CMS75FHIRChildrenDentalDecay` | 10 | 2 | 8 |

## Domain commons (secondary signal)

| Library | Statements |
|---|---:|
| `CQMCommon` | 45 |
| `QICoreCommon` | 44 |
| `AHAOverall` | 24 |
| `Status` | 24 |
| `PCMaternal` | 9 |
| `AdvancedIllnessandFrailty` | 7 |
| `TJCOverall` | 7 |
| `SupplementalDataElements` | 5 |
| `Antibiotic` | 4 |
| `AdultOutpatientEncounters` | 2 |
| `Hospice` | 2 |
| `PalliativeCare` | 2 |

## Implementation helpers (negative control)

| Library | Statements |
|---|---:|
| `FHIRHelpers` | 297 |
| `CumulativeMedicationDuration` | 22 |
| `AlaraCommonFunctions` | 9 |
| `NHSNHelpers` | 5 |

## Uncategorized — review and add to the right bucket

| Library | Statements |
|---|---:|
| `NHSNAcuteCareHospitalMonthlyInitialPopulation1` | 40 |
| `NHSNGlycemicControlHypoglycemiaInitialPopulation` | 28 |
| `CMSFHIR529HybridHospitalWideReadmission` | 21 |
| `CMSFHIR844HybridHospitalWideMortality` | 18 |
| `VTE` | 7 |
