library "Layered Basic Inferred"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "Layered Basic Asserted"

context Patient

define "Inferred Concept":
  exists ("Layered Basic Asserted"."Asserted Concept A")
    or exists ("Layered Basic Asserted"."Asserted Concept B")
