library ExampleSemandInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include ExampleSemandInferred

context Patient

define "A And B":
  ExampleSemandInferred."A And B".satisfied()
