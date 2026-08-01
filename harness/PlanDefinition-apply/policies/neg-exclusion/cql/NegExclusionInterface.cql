library NegExclusionInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include NegExclusionInferred

context Patient

define "Indication Present":
  NegExclusionInferred."Indication Present".satisfied()

define "Has Contraindication":
  NegExclusionInferred."Has Contraindication".satisfied()
