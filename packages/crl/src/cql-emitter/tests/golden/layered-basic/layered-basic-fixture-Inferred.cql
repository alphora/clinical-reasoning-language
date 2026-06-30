library "layered-basic-fixture-Inferred"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "layered-basic-fixture-RecordSource"

context Patient

define "Inferred Concept":
  exists ("layered-basic-fixture-RecordSource"."Asserted Concept A")
    or exists ("layered-basic-fixture-RecordSource"."Asserted Concept B")
