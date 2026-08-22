library ExampleSemandInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include ExampleSemandInferences

context Patient

define "A And B":
  ExampleSemandInferences."A And B".satisfied()
