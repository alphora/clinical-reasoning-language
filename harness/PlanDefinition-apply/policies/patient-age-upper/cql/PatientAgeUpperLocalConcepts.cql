library PatientAgeUpperLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Patient Age Upper Local Codes": 'http://example.org/crl/patient-age-upper/CodeSystem/patient-age-upper-local'
code "Under Twenty One": 'under-21' from "Patient Age Upper Local Codes"
code "At Most Twenty One": 'at-most-21' from "Patient Age Upper Local Codes"

context Patient
