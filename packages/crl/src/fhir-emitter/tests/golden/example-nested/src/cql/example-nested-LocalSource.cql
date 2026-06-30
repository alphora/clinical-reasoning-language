library "example-nested-LocalSource"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "example-nested-LocalConcepts"

context Patient

define "Diagnosis A":
  [Observation: "example-nested-LocalConcepts"."Diagnosis A"]

define "Diagnosis B":
  [Observation: "example-nested-LocalConcepts"."Diagnosis B"]

define "Diagnosis C":
  [Observation: "example-nested-LocalConcepts"."Diagnosis C"]
