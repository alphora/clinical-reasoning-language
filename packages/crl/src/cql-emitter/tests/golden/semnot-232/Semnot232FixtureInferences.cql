library Semnot232FixtureInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Semnot232FixtureLocalPrimitives

context Patient

define "Alpha":
  Semnot232FixtureLocalPrimitives."Alpha Records".answeredValue()

define "Beta":
  Semnot232FixtureLocalPrimitives."Beta Records".answeredValue()

define "Not Alpha":
  not ("Alpha")

define "Beta Or Not Alpha":
  "Beta"
    or not ("Alpha")

define "Neither Alpha Nor Beta":
  not ("Alpha")
    and not ("Beta")

define "Beta And Not Alpha":
  "Beta"
    and not ("Alpha")

define "Beta And Grouped Not Alpha":
  "Beta"
    and (not ("Alpha"))
