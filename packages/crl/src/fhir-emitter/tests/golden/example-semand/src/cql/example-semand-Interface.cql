library "example-semand-Interface"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include "example-semand-Inferred"

context Patient

define "A And B":
  "example-semand-Inferred"."A And B".satisfied()
