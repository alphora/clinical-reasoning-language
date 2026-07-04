library ExampleNestedLocalSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include ExampleNestedLocalConcepts

context Patient

define "Diagnosis A":
  [Observation: ExampleNestedLocalConcepts."Diagnosis A"]

define "Diagnosis B":
  [Observation: ExampleNestedLocalConcepts."Diagnosis B"]

define "Diagnosis C":
  [Observation: ExampleNestedLocalConcepts."Diagnosis C"]
