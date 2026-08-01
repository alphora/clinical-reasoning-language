library Sur716011MedicalPolicyInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Sur716011MedicalPolicyLocalSource

context Patient

define "Prior Medically Necessary Mastectomy":
  Sur716011MedicalPolicyLocalSource."Prior Medically Necessary Full Mastectomy".asTruths()
    union Sur716011MedicalPolicyLocalSource."Prior Medically Necessary Partial Mastectomy".asTruths()

define "Qualifying Antecedent For Affected Breast":
  "Prior Medically Necessary Mastectomy"
    union Sur716011MedicalPolicyLocalSource."Accidental Injury To Breast".asTruths()
    union Sur716011MedicalPolicyLocalSource."Trauma To Breast".asTruths()
