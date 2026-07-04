library ExampleBothrepLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Example Bothrep Local Codes": 'http://example.org/hcsc/rx501-007/CodeSystem/example-bothrep-local'
code "Implanted Estrogen Pellets": 'a' from "Example Bothrep Local Codes"
code "Implanted Estradiol Pellets": 'b' from "Example Bothrep Local Codes"
code "Implanted Estrogen Or Estradiol Pellets": 'c' from "Example Bothrep Local Codes"

context Patient
