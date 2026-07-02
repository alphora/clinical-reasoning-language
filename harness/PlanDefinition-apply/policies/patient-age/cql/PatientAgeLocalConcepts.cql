library PatientAgeLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Patient Age Local Codes": 'http://example.org/crl/patient-age/CodeSystem/patient-age-local'
code "Age 18 Or Older": 'age-18-or-older' from "Patient Age Local Codes"

context Patient
