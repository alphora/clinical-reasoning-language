library CodedQuestionExternalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

valueset "Coded Question Reference Documented Symptom Answer Options": 'http://example.org/crl/coded-question/ValueSet/coded-question-coded-question-reference-documented-0aa58b9d7a6e'

context Patient
