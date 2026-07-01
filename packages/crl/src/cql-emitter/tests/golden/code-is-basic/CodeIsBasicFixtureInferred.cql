library CodeIsBasicFixtureInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CodeIsBasicFixtureLocalsource

context Patient

define "Adult With Crohns":
  CodeIsBasicFixtureLocalsource."Adult Patient".asTruths()
    intersect CodeIsBasicFixtureLocalsource."Active Crohns Disease".asTruths()
