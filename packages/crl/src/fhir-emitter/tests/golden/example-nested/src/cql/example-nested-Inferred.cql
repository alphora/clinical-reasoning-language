library "example-nested-Inferred"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include "example-nested-LocalSource"

context Patient

define "A And B":
  "example-nested-LocalSource"."Diagnosis A".asTruths()
    intersect "example-nested-LocalSource"."Diagnosis B".asTruths()

define "Top":
  "A And B"
    union "example-nested-LocalSource"."Diagnosis C".asTruths()
