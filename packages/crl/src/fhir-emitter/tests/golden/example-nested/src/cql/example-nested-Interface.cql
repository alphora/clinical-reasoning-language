library "example-nested-Interface"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureHelpers called CFH
include "example-nested-Inferred"

context Patient

define "Top":
  "example-nested-Inferred"."Top".satisfied()
