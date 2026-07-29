library SemnotAge232FixtureInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include SemnotAge232FixtureInferred

context Patient

define "Under Age 21":
  SemnotAge232FixtureInferred."Under Age 21".satisfied()
