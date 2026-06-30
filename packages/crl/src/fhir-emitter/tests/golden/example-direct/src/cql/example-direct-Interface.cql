library "example-direct-Interface"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureHelpers called CFH
include "example-direct-LocalSource"

context Patient

define "Qualifying Diagnosis":
  "example-direct-LocalSource"."Qualifying Diagnosis".asTruths().satisfied()
