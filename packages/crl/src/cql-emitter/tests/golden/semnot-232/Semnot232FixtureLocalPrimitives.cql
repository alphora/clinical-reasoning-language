library Semnot232FixtureLocalPrimitives

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Semnot232FixtureLocalConcepts

context Patient

define "Alpha Records":
  [Observation: Semnot232FixtureLocalConcepts."Alpha"]

define "Beta Records":
  [Observation: Semnot232FixtureLocalConcepts."Beta"]
