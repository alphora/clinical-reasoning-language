library CrlTestFixtureLocalSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CrlTestFixtureLocalConcepts

context Patient

define "Adult Patient":
  [Observation: CrlTestFixtureLocalConcepts."Adult Patient"]

define "Active Crohns Disease":
  [Observation: CrlTestFixtureLocalConcepts."Active Crohns Disease"]
