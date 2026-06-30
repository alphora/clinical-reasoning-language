library "Code Is Decision"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "Code Is Decision Concepts"

context Patient

define "Adult Patient":
  [Observation: "Code Is Decision Concepts"."Adult Patient"]

define "Active Crohns Disease":
  [Observation: "Code Is Decision Concepts"."Active Crohns Disease"]
