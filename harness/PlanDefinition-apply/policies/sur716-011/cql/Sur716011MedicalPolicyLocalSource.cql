library Sur716011MedicalPolicyLocalSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Sur716011MedicalPolicyLocalConcepts

context Patient

define "Affected Breast Reconstruction Requested":
  [Observation: Sur716011MedicalPolicyLocalConcepts."Affected Breast Reconstruction Requested"]

define "Contralateral Breast Reconstruction Requested":
  [Observation: Sur716011MedicalPolicyLocalConcepts."Contralateral Breast Reconstruction Requested"]

define "Prior Medically Necessary Full Mastectomy":
  [Observation: Sur716011MedicalPolicyLocalConcepts."Prior Medically Necessary Full Mastectomy"]

define "Prior Medically Necessary Partial Mastectomy":
  [Observation: Sur716011MedicalPolicyLocalConcepts."Prior Medically Necessary Partial Mastectomy"]

define "Accidental Injury To Breast":
  [Observation: Sur716011MedicalPolicyLocalConcepts."Accidental Injury To Breast"]

define "Trauma To Breast":
  [Observation: Sur716011MedicalPolicyLocalConcepts."Trauma To Breast"]

define "To Achieve Symmetry":
  [Observation: Sur716011MedicalPolicyLocalConcepts."To Achieve Symmetry"]
