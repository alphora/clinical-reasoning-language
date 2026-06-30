library "layered-basic-fixture-RecordSource"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "layered-basic-fixture-RecordConcepts"

context Patient

define "Asserted Concept A":
  [Observation: "layered-basic-fixture-RecordConcepts"."Example Valueset A"]

define "Asserted Concept B":
  [Observation: "layered-basic-fixture-RecordConcepts"."Example Valueset B"]
