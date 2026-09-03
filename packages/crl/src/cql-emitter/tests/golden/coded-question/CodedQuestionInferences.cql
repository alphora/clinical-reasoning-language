library CodedQuestionInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CodedQuestionLocalPrimitives

valueset "coded-question-documented-symptom-answer-options-qualifying": 'http://example.org/crl/coded-question/ValueSet/coded-question-documented-symptom-answer-options-qualifying'

context Patient

define "Service Requested":
  CodedQuestionLocalPrimitives."Service Requested Records".answeredValue()

define "Documented Symptom":
  Last(
      (CodedQuestionLocalPrimitives."Documented Symptom Records") O
        sort by (effective as FHIR.dateTime).value, id
    )

define "Qualifying Symptom Documented":
  if ("Documented Symptom".value as FHIR.CodeableConcept) is null or not exists (("Documented Symptom".value as FHIR.CodeableConcept).coding) then null
      else FHIRHelpers.ToConcept(("Documented Symptom".value as FHIR.CodeableConcept)) in "coded-question-documented-symptom-answer-options-qualifying"
