library ExampleNestedInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include ExampleNestedLocalSource

context Patient

define "A And B":
  ExampleNestedLocalSource."Diagnosis A".asTruths()
    intersect ExampleNestedLocalSource."Diagnosis B".asTruths()

define "Top":
  "A And B"
    union ExampleNestedLocalSource."Diagnosis C".asTruths()
