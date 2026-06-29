library "Layered Basic Asserted"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "Layered Basic Concepts"

context Patient

define "Asserted Concept A":
  [Observation: "Layered Basic Concepts"."Example Valueset A"]

define "Asserted Concept B":
  [Observation: "Layered Basic Concepts"."Example Valueset B"]
