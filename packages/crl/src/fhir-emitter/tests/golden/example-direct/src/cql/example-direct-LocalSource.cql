library "example-direct-LocalSource"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "example-direct-LocalConcepts"

context Patient

define "Qualifying Diagnosis":
  [Observation: "example-direct-LocalConcepts"."Qualifying Diagnosis"]
