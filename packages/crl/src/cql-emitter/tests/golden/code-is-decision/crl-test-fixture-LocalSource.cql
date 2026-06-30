library "crl-test-fixture-LocalSource"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "crl-test-fixture-LocalConcepts"

context Patient

define "Adult Patient":
  [Observation: "crl-test-fixture-LocalConcepts"."Adult Patient"]

define "Active Crohns Disease":
  [Observation: "crl-test-fixture-LocalConcepts"."Active Crohns Disease"]
