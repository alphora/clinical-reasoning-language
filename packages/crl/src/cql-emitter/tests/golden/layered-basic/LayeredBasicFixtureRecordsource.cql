library LayeredBasicFixtureRecordsource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include LayeredBasicFixtureRecordconcepts

context Patient

define "Asserted Concept A":
  [Observation: LayeredBasicFixtureRecordconcepts."Example Valueset A"]

define "Asserted Concept B":
  [Observation: LayeredBasicFixtureRecordconcepts."Example Valueset B"]
