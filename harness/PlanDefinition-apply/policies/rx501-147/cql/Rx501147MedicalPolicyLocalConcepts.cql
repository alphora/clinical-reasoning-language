library Rx501147MedicalPolicyLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Rx501 147 Medical Policy Local Codes": 'http://example.org/hcsc/rx501-147/CodeSystem/rx501-147-medical-policy-local'
code "Adult Age 18 Or Older": 'adult-18-or-older' from "Rx501 147 Medical Policy Local Codes"
code "Moderate To Severely Active Crohn's Disease": 'moderate-to-severely-active-crohns-disease' from "Rx501 147 Medical Policy Local Codes"
code "Moderate To Severely Active Ulcerative Colitis": 'moderate-to-severely-active-ulcerative-colitis' from "Rx501 147 Medical Policy Local Codes"

context Patient
