library CrlTestFixtureInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CrlTestFixtureLocalElements

context Patient

define "Adult Patient":
  CrlTestFixtureLocalElements."Adult Patient Records".answeredValue()
