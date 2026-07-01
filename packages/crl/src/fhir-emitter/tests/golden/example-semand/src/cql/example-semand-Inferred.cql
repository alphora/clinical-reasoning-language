library "example-semand-Inferred"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include "example-semand-LocalSource"

context Patient

define "A And B":
  "example-semand-LocalSource"."Diagnosis A".asTruths()
    intersect "example-semand-LocalSource"."Diagnosis B".asTruths()
