library "code-is-basic-fixture-Inferred"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "code-is-basic-fixture-LocalSource"

context Patient

define "Adult With Crohns":
  exists ("code-is-basic-fixture-LocalSource"."Adult Patient")
    and exists ("code-is-basic-fixture-LocalSource"."Active Crohns Disease")
