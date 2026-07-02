library TwostepLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Twostep Local Codes": 'http://example.org/crl/twostep/CodeSystem/twostep-local'
code "Q1": 'q1' from "Twostep Local Codes"
code "Q2": 'q2' from "Twostep Local Codes"

context Patient
