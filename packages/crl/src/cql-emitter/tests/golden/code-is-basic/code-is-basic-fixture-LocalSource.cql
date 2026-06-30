library "code-is-basic-fixture-LocalSource"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "code-is-basic-fixture-LocalConcepts"

context Patient

define "Adult Patient":
  [Observation: "code-is-basic-fixture-LocalConcepts"."Adult Patient"]

define "Active Crohns Disease":
  [Observation: "code-is-basic-fixture-LocalConcepts"."Active Crohns Disease"]
