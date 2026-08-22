library TwostepLocalPrimitives

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include TwostepLocalConcepts

context Patient

define "Q1":
  [Observation: TwostepLocalConcepts."Q1"]

define "Q2":
  [Observation: TwostepLocalConcepts."Q2"]
