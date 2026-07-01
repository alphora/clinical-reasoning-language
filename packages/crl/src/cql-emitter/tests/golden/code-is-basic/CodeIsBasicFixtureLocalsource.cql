library CodeIsBasicFixtureLocalsource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CodeIsBasicFixtureLocalconcepts

context Patient

define "Adult Patient":
  [Observation: CodeIsBasicFixtureLocalconcepts."Adult Patient"]

define "Active Crohns Disease":
  [Observation: CodeIsBasicFixtureLocalconcepts."Active Crohns Disease"]
