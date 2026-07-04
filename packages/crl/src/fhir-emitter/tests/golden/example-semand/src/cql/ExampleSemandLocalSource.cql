library ExampleSemandLocalSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include ExampleSemandLocalConcepts

context Patient

define "Diagnosis A":
  [Observation: ExampleSemandLocalConcepts."Diagnosis A"]

define "Diagnosis B":
  [Observation: ExampleSemandLocalConcepts."Diagnosis B"]
