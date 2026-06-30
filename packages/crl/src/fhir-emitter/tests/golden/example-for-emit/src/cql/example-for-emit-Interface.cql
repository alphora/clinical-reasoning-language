library "example-for-emit-Interface"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureHelpers called CFH
include "example-for-emit-Inferred"

context Patient

define "Implanted Estrogen Or Estradiol Pellets":
  "example-for-emit-Inferred"."Implanted Estrogen Or Estradiol Pellets".satisfied()
