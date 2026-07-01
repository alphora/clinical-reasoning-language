library LayeredBasicFixtureRecordSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include LayeredBasicFixtureRecordConcepts

context Patient

define "Asserted Concept A":
  [Observation: LayeredBasicFixtureRecordConcepts."Example Valueset A"]

define "Asserted Concept B":
  [Observation: LayeredBasicFixtureRecordConcepts."Example Valueset B"]
