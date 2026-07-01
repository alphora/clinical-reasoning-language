library LayeredBasicFixtureInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include LayeredBasicFixtureRecordsource

context Patient

define "Inferred Concept":
  exists (LayeredBasicFixtureRecordsource."Asserted Concept A")
    or exists (LayeredBasicFixtureRecordsource."Asserted Concept B")
