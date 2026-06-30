library "example-semand-LocalConcepts"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Example Semand Local Codes": 'http://example.org/hcsc/rx501-007/CodeSystem/example-semand-local'
code "Diagnosis A": 'a' from "Example Semand Local Codes"
code "Diagnosis B": 'b' from "Example Semand Local Codes"

context Patient
