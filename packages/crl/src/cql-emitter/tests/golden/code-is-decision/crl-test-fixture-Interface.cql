library "crl-test-fixture-Interface"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureHelpers called CFH
include "crl-test-fixture-LocalSource"

context Patient

define "Active Crohns Disease":
  "crl-test-fixture-LocalSource"."Active Crohns Disease".asTruths().satisfied()
