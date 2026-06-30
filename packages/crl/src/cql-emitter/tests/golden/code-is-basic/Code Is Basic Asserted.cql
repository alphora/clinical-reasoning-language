library "Code Is Basic Asserted"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "Code Is Basic Concepts"

context Patient

define "Adult Patient":
  [Observation: "Code Is Basic Concepts"."Adult Patient"]

define "Active Crohns Disease":
  [Observation: "Code Is Basic Concepts"."Active Crohns Disease"]
