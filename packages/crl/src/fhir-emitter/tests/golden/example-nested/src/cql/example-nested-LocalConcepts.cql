library "example-nested-LocalConcepts"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Example Nested Local Codes": 'http://example.org/hcsc/rx501-007/CodeSystem/example-nested-local'
code "Diagnosis A": 'a' from "Example Nested Local Codes"
code "Diagnosis B": 'b' from "Example Nested Local Codes"
code "Diagnosis C": 'c' from "Example Nested Local Codes"

context Patient
