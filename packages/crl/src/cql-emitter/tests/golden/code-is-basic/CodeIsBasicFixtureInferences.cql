library CodeIsBasicFixtureInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CodeIsBasicFixtureLocalPrimitives

context Patient

define "Adult Patient":
  CodeIsBasicFixtureLocalPrimitives."Adult Patient Records".answeredValue()

define "Active Crohns Disease":
  exists (CodeIsBasicFixtureLocalPrimitives."Active Crohns Disease Records")

define "Adult With Crohns":
  "Adult Patient" and "Active Crohns Disease"
