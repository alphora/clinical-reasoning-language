library NegExclusionInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include NegExclusionLocalSource

context Patient

define "Indication Present":
  NegExclusionLocalSource."Indication Leaf".asTruths()

define "Has Contraindication":
  NegExclusionLocalSource."Contra Leaf".asTruths()
