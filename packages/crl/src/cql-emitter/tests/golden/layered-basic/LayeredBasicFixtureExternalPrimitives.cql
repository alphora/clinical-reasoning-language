library LayeredBasicFixtureExternalPrimitives

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include LayeredBasicFixtureExternalConcepts

context Patient

define "Asserted Concept A":
  [Observation: LayeredBasicFixtureExternalConcepts."Example Valueset A"]

define "Asserted Concept B":
  [Observation: LayeredBasicFixtureExternalConcepts."Example Valueset B"]
