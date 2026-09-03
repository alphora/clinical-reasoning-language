library CodedQuestionLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Coded Question Local Codes": 'http://example.org/crl/coded-question/CodeSystem/coded-question-local'
code "Service Requested": 'service-requested' from "Coded Question Local Codes"
code "Documented Symptom": 'documented-symptom' from "Coded Question Local Codes"

context Patient
