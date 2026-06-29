library "Code Is Basic Inferred"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "Code Is Basic Asserted"

context Patient

define "Adult With Crohns":
  exists ("Code Is Basic Asserted"."Adult Patient")
    and exists ("Code Is Basic Asserted"."Active Crohns Disease")
