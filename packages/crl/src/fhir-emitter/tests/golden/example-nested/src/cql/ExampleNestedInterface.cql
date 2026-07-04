library ExampleNestedInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include ExampleNestedInferred

context Patient

define "Top":
  ExampleNestedInferred."Top".satisfied()
