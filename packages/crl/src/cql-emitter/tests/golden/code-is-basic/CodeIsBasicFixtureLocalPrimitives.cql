library CodeIsBasicFixtureLocalPrimitives

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CodeIsBasicFixtureLocalConcepts

context Patient

define "Adult Patient":
  [Observation: CodeIsBasicFixtureLocalConcepts."Adult Patient"]

define "Active Crohns Disease":
  [Observation: CodeIsBasicFixtureLocalConcepts."Active Crohns Disease"]
