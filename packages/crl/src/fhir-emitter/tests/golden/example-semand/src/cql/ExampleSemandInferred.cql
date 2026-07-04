library ExampleSemandInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include ExampleSemandLocalSource

context Patient

define "A And B":
  ExampleSemandLocalSource."Diagnosis A".asTruths()
    intersect ExampleSemandLocalSource."Diagnosis B".asTruths()
