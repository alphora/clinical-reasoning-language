library CrlTestFixtureInterface

using FHIR version '4.0.1'

include hl7.fhir.uv.cql.FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CrlTestFixtureLocalElements

context Patient

define "Active Crohns Disease":
  CrlTestFixtureLocalElements."Active Crohns Disease".asTruths().satisfied()

define "CRL branch Ref L25C7":
  "Active Crohns Disease"

define "Not CRL branch Ref L25C7":
  not ("Active Crohns Disease")
