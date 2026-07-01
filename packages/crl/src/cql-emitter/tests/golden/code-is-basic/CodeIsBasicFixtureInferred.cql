library CodeIsBasicFixtureInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CodeIsBasicFixtureLocalSource

context Patient

define "Adult With Crohns":
  CodeIsBasicFixtureLocalSource."Adult Patient".asTruths()
    intersect CodeIsBasicFixtureLocalSource."Active Crohns Disease".asTruths()
