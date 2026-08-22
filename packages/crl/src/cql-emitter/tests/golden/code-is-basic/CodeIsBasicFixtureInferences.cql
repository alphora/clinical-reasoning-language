library CodeIsBasicFixtureInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CodeIsBasicFixtureLocalPrimitives

context Patient

define "Adult With Crohns":
  CodeIsBasicFixtureLocalPrimitives."Adult Patient".asTruths()
    intersect CodeIsBasicFixtureLocalPrimitives."Active Crohns Disease".asTruths()
