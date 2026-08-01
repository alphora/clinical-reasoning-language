library NegExclusionLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Neg Exclusion Local Codes": 'http://example.org/neg-exclusion/CodeSystem/neg-exclusion-local'
code "Indication Leaf": 'indication-leaf' from "Neg Exclusion Local Codes"
code "Contra Leaf": 'contra-leaf' from "Neg Exclusion Local Codes"

context Patient
