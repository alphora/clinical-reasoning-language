library LayeredBasicFixtureInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include LayeredBasicFixtureRecordSource

context Patient

define "Inferred Concept":
  exists (LayeredBasicFixtureRecordSource."Asserted Concept A")
    or exists (LayeredBasicFixtureRecordSource."Asserted Concept B")
