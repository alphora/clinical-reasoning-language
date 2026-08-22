library LayeredBasicFixtureInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include LayeredBasicFixtureExternalPrimitives

context Patient

define "Asserted Concept A Exists":
  exists (LayeredBasicFixtureExternalPrimitives."Asserted Concept A")

define "Asserted Concept B Exists":
  exists (LayeredBasicFixtureExternalPrimitives."Asserted Concept B")

define "Inferred Concept":
  "Asserted Concept A Exists" or "Asserted Concept B Exists"
