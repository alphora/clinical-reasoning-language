library "example-bothrep-Interface"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureHelpers called CFH
include "example-bothrep-Inferred"

context Patient

define "Implanted Estrogen Or Estradiol Pellets":
  "example-bothrep-Inferred"."Implanted Estrogen Or Estradiol Pellets".satisfied()
