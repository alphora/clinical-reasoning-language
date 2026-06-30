library "example-semand-LocalSource"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "example-semand-LocalConcepts"

context Patient

define "Diagnosis A":
  [Observation: "example-semand-LocalConcepts"."Diagnosis A"]

define "Diagnosis B":
  [Observation: "example-semand-LocalConcepts"."Diagnosis B"]
