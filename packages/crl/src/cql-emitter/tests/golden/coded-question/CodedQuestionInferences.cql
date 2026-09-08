library CodedQuestionInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CodedQuestionLocalPrimitives

context Patient

define "Service Requested":
  CodedQuestionLocalPrimitives."Service Requested Records".answeredValue()

define "Documented Symptom":
  Last(
      (CodedQuestionLocalPrimitives."Documented Symptom Records") O
        sort by (effective as FHIR.dateTime).value, id
    )

define "Qualifying Symptom Documented":
  if ("Documented Symptom".value as FHIR.CodeableConcept) is null then null as System.Boolean
    else if not exists (from ((("Documented Symptom".value as FHIR.CodeableConcept)).coding) C where exists (({ Tuple { system: 'https://example.org/answer-codes', code: 'functional-limitation' }, Tuple { system: 'https://example.org/answer-codes', code: 'persistent-pain' }, Tuple { system: 'https://example.org/answer-codes', code: 'none-of-listed' } }) D where D.system = C.system.value and D.code = C.code.value)) then
      Message(null as System.Boolean, true, 'publication-uninterpretable-value', 'Error', 'Documented Symptom' + ': No recognized domain coding')
    else if exists (from ((("Documented Symptom".value as FHIR.CodeableConcept)).coding) C where exists (({ Tuple { system: 'https://example.org/answer-codes', code: 'functional-limitation' }, Tuple { system: 'https://example.org/answer-codes', code: 'persistent-pain' }, Tuple { system: 'https://example.org/answer-codes', code: 'none-of-listed' } }) D where D.system = C.system.value and D.code = C.code.value) and exists (({ Tuple { system: 'https://example.org/answer-codes', code: 'functional-limitation' }, Tuple { system: 'https://example.org/answer-codes', code: 'persistent-pain' } }) Q where Q.system = C.system.value and Q.code = C.code.value)) and exists (from ((("Documented Symptom".value as FHIR.CodeableConcept)).coding) C where exists (({ Tuple { system: 'https://example.org/answer-codes', code: 'functional-limitation' }, Tuple { system: 'https://example.org/answer-codes', code: 'persistent-pain' }, Tuple { system: 'https://example.org/answer-codes', code: 'none-of-listed' } }) D where D.system = C.system.value and D.code = C.code.value) and not exists (({ Tuple { system: 'https://example.org/answer-codes', code: 'functional-limitation' }, Tuple { system: 'https://example.org/answer-codes', code: 'persistent-pain' } }) Q where Q.system = C.system.value and Q.code = C.code.value)) then
      Message(null as System.Boolean, true, 'publication-ambiguous-coded-value', 'Error', 'Documented Symptom' + ': Recognized codings disagree')
    else exists (from ((("Documented Symptom".value as FHIR.CodeableConcept)).coding) C where exists (({ Tuple { system: 'https://example.org/answer-codes', code: 'functional-limitation' }, Tuple { system: 'https://example.org/answer-codes', code: 'persistent-pain' }, Tuple { system: 'https://example.org/answer-codes', code: 'none-of-listed' } }) D where D.system = C.system.value and D.code = C.code.value) and exists (({ Tuple { system: 'https://example.org/answer-codes', code: 'functional-limitation' }, Tuple { system: 'https://example.org/answer-codes', code: 'persistent-pain' } }) Q where Q.system = C.system.value and Q.code = C.code.value))
