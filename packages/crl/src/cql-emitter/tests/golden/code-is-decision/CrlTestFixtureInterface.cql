library CrlTestFixtureInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CrlTestFixtureLocalsource

context Patient

define "Active Crohns Disease":
  CrlTestFixtureLocalsource."Active Crohns Disease".asTruths().satisfied()
