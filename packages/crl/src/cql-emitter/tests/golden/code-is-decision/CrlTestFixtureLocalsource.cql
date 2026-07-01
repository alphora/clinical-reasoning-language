library CrlTestFixtureLocalsource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CrlTestFixtureLocalconcepts

context Patient

define "Adult Patient":
  [Observation: CrlTestFixtureLocalconcepts."Adult Patient"]

define "Active Crohns Disease":
  [Observation: CrlTestFixtureLocalconcepts."Active Crohns Disease"]
