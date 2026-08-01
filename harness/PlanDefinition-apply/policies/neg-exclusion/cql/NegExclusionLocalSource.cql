library NegExclusionLocalSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include NegExclusionLocalConcepts

context Patient

define "Indication Leaf":
  [Observation: NegExclusionLocalConcepts."Indication Leaf"]

define "Contra Leaf":
  [Observation: NegExclusionLocalConcepts."Contra Leaf"]
