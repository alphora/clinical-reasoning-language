library Sur716011MedicalPolicyLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Sur716 011 Medical Policy Local Codes": 'http://example.org/hcsc/sur716-011/CodeSystem/sur716-011-medical-policy-local'
code "Affected Breast Reconstruction Requested": 'affected-breast-reconstruction-requested' from "Sur716 011 Medical Policy Local Codes"
code "Contralateral Breast Reconstruction Requested": 'contralateral-breast-reconstruction-requested' from "Sur716 011 Medical Policy Local Codes"
code "Prior Medically Necessary Full Mastectomy": 'prior-medically-necessary-full-mastectomy' from "Sur716 011 Medical Policy Local Codes"
code "Prior Medically Necessary Partial Mastectomy": 'prior-medically-necessary-partial-mastectomy' from "Sur716 011 Medical Policy Local Codes"
code "Accidental Injury To Breast": 'accidental-injury-to-breast' from "Sur716 011 Medical Policy Local Codes"
code "Trauma To Breast": 'trauma-to-breast' from "Sur716 011 Medical Policy Local Codes"
code "To Achieve Symmetry": 'to-achieve-symmetry' from "Sur716 011 Medical Policy Local Codes"

context Patient
