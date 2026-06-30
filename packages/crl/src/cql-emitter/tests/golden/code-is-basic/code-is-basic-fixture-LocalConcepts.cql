library "code-is-basic-fixture-LocalConcepts"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Code Is Basic Local Codes": 'http://example.org/crl/code-is-basic/CodeSystem/code-is-basic-fixture-local'
code "Adult Patient": 'adult-18-or-older' from "Code Is Basic Local Codes"
code "Active Crohns Disease": 'active-crohns-disease' from "Code Is Basic Local Codes"

context Patient
