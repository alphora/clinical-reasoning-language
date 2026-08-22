library SemnotAge232FixtureLocalPrimitives

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include SemnotAge232FixtureLocalConcepts

context Patient

define "Age 21 Or Older":
  [Observation: SemnotAge232FixtureLocalConcepts."Age 21 Or Older"]
