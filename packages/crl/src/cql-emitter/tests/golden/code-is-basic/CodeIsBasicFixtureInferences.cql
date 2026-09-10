library CodeIsBasicFixtureInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CodeIsBasicFixtureLocalElements

context Patient

define "Adult Patient":
  CodeIsBasicFixtureLocalElements."Adult Patient Records".answeredValue()

define "Active Crohns Disease":
  exists (CodeIsBasicFixtureLocalElements."Active Crohns Disease Records")

define "Adult With Crohns":
  "Adult Patient" and "Active Crohns Disease"
