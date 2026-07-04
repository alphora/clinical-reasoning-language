library ExampleBothrepLocalSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include ExampleBothrepLocalConcepts

context Patient

define "Implanted Estrogen Pellets":
  [Observation: ExampleBothrepLocalConcepts."Implanted Estrogen Pellets"]

define "Implanted Estradiol Pellets":
  [Observation: ExampleBothrepLocalConcepts."Implanted Estradiol Pellets"]

define "Implanted Estrogen Or Estradiol Pellets":
  [Observation: ExampleBothrepLocalConcepts."Implanted Estrogen Or Estradiol Pellets"]
