library Sur716011MedicalPolicyInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Sur716011MedicalPolicyLocalSource
include Sur716011MedicalPolicyInferred

context Patient

define "Affected Breast Reconstruction Requested":
  Sur716011MedicalPolicyLocalSource."Affected Breast Reconstruction Requested".asTruths().satisfied()

define "Qualifying Antecedent For Affected Breast":
  Sur716011MedicalPolicyInferred."Qualifying Antecedent For Affected Breast".satisfied()

define "Contralateral Breast Reconstruction Requested":
  Sur716011MedicalPolicyLocalSource."Contralateral Breast Reconstruction Requested".asTruths().satisfied()

define "To Achieve Symmetry":
  Sur716011MedicalPolicyLocalSource."To Achieve Symmetry".asTruths().satisfied()

define "Prior Medically Necessary Mastectomy":
  Sur716011MedicalPolicyInferred."Prior Medically Necessary Mastectomy".satisfied()
