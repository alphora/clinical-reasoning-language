library ExampleForEmitLocalSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include ExampleForEmitLocalConcepts

context Patient

define "Implanted Estrogen Pellets":
  [Observation: ExampleForEmitLocalConcepts."Implanted Estrogen Pellets"]

define "Implanted Estradiol Pellets":
  [Observation: ExampleForEmitLocalConcepts."Implanted Estradiol Pellets"]
