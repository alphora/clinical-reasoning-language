library ExampleNestedInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include ExampleNestedInferences

context Patient

define "Top":
  ExampleNestedInferences."Top".satisfied()
