library CodedQuestionLocalPrimitives

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CodedQuestionLocalConcepts

context Patient

define "Service Requested Records":
  [Observation: CodedQuestionLocalConcepts."Service Requested"]

define "Documented Symptom Records":
  [Observation: CodedQuestionLocalConcepts."Documented Symptom"]
