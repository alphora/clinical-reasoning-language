library CrlTestFixtureInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CrlTestFixtureLocalSource

context Patient

define "Active Crohns Disease":
  CrlTestFixtureLocalSource."Active Crohns Disease".asTruths().satisfied()
