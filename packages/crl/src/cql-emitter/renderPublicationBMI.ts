import {
  PUBLICATION_CANDIDATE_CQL_TYPE as C,
  PUBLICATION_SELECTION_RESULT_CQL_TYPE as S,
} from "./renderPublicationSelection";
import { QUANTITY_CQL } from "./renderPublicationQuantity";

// REFACTOR:grounded (#320, plan589): the produced BMI retains both dependencies and one authored validity anchor.
export const BMI_CQL = {
  validate: "__CRL_PublicationProducer_v1_BMIValidate",
  value: "__CRL_PublicationProducer_v1_BMIValue",
  candidate: "__CRL_PublicationProducer_v1_BMICandidate",
};
export function renderPublicationBMIHelpers(): string {
  const n = BMI_CQL,
    unit = QUANTITY_CQL.unit;
  const error = (type: string, code: string, message: string) =>
    `Message(null as ${type}, true, '${code}', 'Error', '${message}')`;
  return `define function "${n.validate}"(Q FHIR.Quantity, height System.Boolean):
  if Q.value.value is null then true
  else if Q.value.value <= 0.0 then ${error("System.Boolean", "publication-bmi-nonpositive", "BMI measurements must be positive")}
  else if Abs(Q.value.value) > 1000000.0 or Q.value.value != Round(Q.value.value, 8) then ${error("System.Boolean", "publication-bmi-precision-unsupported", "BMI inputs support magnitude at most 10^6 and eight decimal places")}
  else if not ("${unit}"(Q) in (if height then { 'm', 'cm' } else { 'kg', 'g' })) then ${error("System.Boolean", "publication-bmi-unit-unsupported", "BMI requires weight in kg or g and height in m or cm")}
  else if height and Q.value.value * (if "${unit}"(Q) = 'm' then 100.0 else 1.0) != Round(Q.value.value * (if "${unit}"(Q) = 'm' then 100.0 else 1.0), 4) then ${error("System.Boolean", "publication-bmi-precision-unsupported", "BMI height in centimetres supports at most four decimal places")}
  else true
define function "${n.value}"(W FHIR.Quantity, H FHIR.Quantity):
  if W.value.value is null or H.value.value is null then null as FHIR.Quantity
  else singleton from (({ Tuple {
    grams: W.value.value * (if "${unit}"(W) = 'kg' then 1000.0 else 1.0),
    cm: H.value.value * (if "${unit}"(H) = 'm' then 100.0 else 1.0)
  } }) M
    let bmi: (M.grams * 10.0) / (M.cm * M.cm)
    return if bmi > 1000000.0 then ${error("FHIR.Quantity", "publication-bmi-result-unsupported", "Published BMI exceeds magnitude 10^6")}
      else FHIR.Quantity { value: FHIR.decimal { value: bmi }, system: FHIR.uri { value: 'http://unitsofmeasure.org' }, code: FHIR.code { value: 'kg/m2' }, unit: FHIR.string { value: 'kg/m2' } })
define function "${n.candidate}"(W ${S}, H ${S}, validityOperand System.Integer, producerId System.String, code FHIR.CodeableConcept, profile System.String, subjectReference System.String):
  if W.state = 'failed' then Message(null as ${C}, true, W.failureCode, 'Error', W.failureMessage)
  else if H.state = 'failed' then Message(null as ${C}, true, H.failureCode, 'Error', H.failureMessage)
  else if "${n.validate}"(W.selected.resource.value as FHIR.Quantity, false) != true or "${n.validate}"(H.selected.resource.value as FHIR.Quantity, true) != true then null as ${C}
  else if W.state != 'selected' or H.state != 'selected' then null as ${C}
  else singleton from (({ Tuple {
    anchor: if validityOperand = 0 then W.selected else H.selected,
    pairKey: ToString(Length(W.selected.key)) + ':' + W.selected.key + ToString(Length(H.selected.key)) + ':' + H.selected.key
  } }) P return Tuple {
    key: ToString(Length(producerId)) + ':' + producerId + ToString(Length(P.pairKey)) + ':' + P.pairKey,
    contributorId: producerId, arm: 'inferred', retrievedInputIdentity: null as System.String, validity: P.anchor.validity,
    resource: FHIR.Observation {
      status: FHIR.ObservationStatus { value: 'final' }, subject: FHIR.Reference { reference: FHIR.string { value: subjectReference } },
      meta: if profile is null then null as FHIR.Meta else FHIR.Meta { profile: { FHIR.canonical { value: profile } } },
      code: code, value: "${n.value}"(W.selected.resource.value as FHIR.Quantity, H.selected.resource.value as FHIR.Quantity), effective: P.anchor.resource.effective as FHIR.dateTime,
      derivedFrom: ({ W.selected.resource.id.value, H.selected.resource.id.value }) I where I is not null return distinct FHIR.Reference { reference: FHIR.string { value: 'Observation/' + I } }
    }
  })`;
}
