library "example-direct-LocalConcepts"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Example Direct Local Codes": 'http://example.org/hcsc/rx501-007/CodeSystem/example-direct-local'
code "Qualifying Diagnosis": 'qualifying-diagnosis' from "Example Direct Local Codes"

context Patient
