library TwostepInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include TwostepLocalSource

context Patient

define "Q1":
  TwostepLocalSource."Q1".asTruths().satisfied()

define "Q2":
  TwostepLocalSource."Q2".asTruths().satisfied()
