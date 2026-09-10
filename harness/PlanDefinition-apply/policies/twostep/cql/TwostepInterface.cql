library TwostepInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include TwostepLocalElements

context Patient

define "Q1":
  TwostepLocalElements."Q1".asTruths().satisfied()

define "Q2":
  TwostepLocalElements."Q2".asTruths().satisfied()
