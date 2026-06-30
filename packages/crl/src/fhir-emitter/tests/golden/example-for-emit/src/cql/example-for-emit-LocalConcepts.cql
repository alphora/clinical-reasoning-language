library "example-for-emit-LocalConcepts"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Example For Emit Local Codes": 'http://example.org/hcsc/rx501-007/CodeSystem/example-for-emit-local'
code "Implanted Estrogen Pellets": 'implanted-estrogen-pellets' from "Example For Emit Local Codes"
code "Implanted Estradiol Pellets": 'implanted-estradiol-pellets' from "Example For Emit Local Codes"

context Patient
