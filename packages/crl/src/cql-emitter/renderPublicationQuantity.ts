import { PUBLICATION_CANDIDATE_CQL_TYPE, PUBLICATION_SELECTION_RESULT_CQL_TYPE } from "./renderPublicationSelection";
import { PUBLICATION_PRODUCER_FUNCTIONS } from "./renderPublicationProducer";

export const QUANTITY_CQL = {
  unit: "__CRL_PublicationProducer_v1_QuantityUnit", factor: "__CRL_PublicationProducer_v1_QuantityFactor",
  group: "__CRL_PublicationProducer_v1_QuantityGroup", compare: "__CRL_PublicationProducer_v1_QuantityAtLeast",
  candidate: "__CRL_PublicationProducer_v1_QuantityThresholdCandidate",
};
export function renderPublicationThresholdHelpers(): string {
  const n = QUANTITY_CQL;
  return `define function "${n.unit}"(Q FHIR.Quantity): Coalesce(Q.code.value, Q.unit.value)
define function "${n.factor}"(unit System.String):
  case unit when 'kg' then 1000.0 when 'm' then 100.0 when 'g' then 1.0 when 'cm' then 1.0 when 'kg/m2' then 1.0 else null as System.Decimal end
define function "${n.group}"(unit System.String):
  case when unit in { 'kg', 'g' } then 'mass' when unit in { 'm', 'cm' } then 'length' when unit = 'kg/m2' then 'bmi' else null as System.String end
define function "${n.compare}"(Q FHIR.Quantity, threshold System.Decimal, unit System.String):
  if Q.value.value is null then null as System.Boolean
  else if Abs(Q.value.value) > 1000000.0 or Q.value.value != Round(Q.value.value, 8) then
    Message(null as System.Boolean, true, 'publication-quantity-precision-unsupported', 'Error', 'Quantity comparison supports magnitude at most 10^6 and at most eight decimal places')
  else if "${n.group}"("${n.unit}"(Q)) is null or "${n.group}"("${n.unit}"(Q)) != "${n.group}"(unit) then
    Message(null as System.Boolean, true, 'publication-quantity-unit-unsupported', 'Error', 'Quantity comparison requires compatible supported units')
  else Q.value.value * "${n.factor}"("${n.unit}"(Q)) >= threshold * "${n.factor}"(unit)
define function "${n.candidate}"(operand ${PUBLICATION_SELECTION_RESULT_CQL_TYPE}, producerId System.String, code FHIR.CodeableConcept,
  profile System.String, threshold System.Decimal, unit System.String, conceptId System.String, subjectReference System.String):
  if operand.state = 'failed' then
    Message(null as ${PUBLICATION_CANDIDATE_CQL_TYPE}, true, operand.failureCode, 'Error', operand.failureMessage)
  else if operand.state != 'selected' then null as ${PUBLICATION_CANDIDATE_CQL_TYPE}
  else Tuple {
    key: ToString(Length(producerId)) + ':' + producerId + ToString(Length(operand.selected.key)) + ':' + operand.selected.key,
    contributorId: producerId, arm: 'inferred', retrievedInputIdentity: null as System.String,
    resource: "${PUBLICATION_PRODUCER_FUNCTIONS.construct}"(code, "${n.compare}"(operand.selected.resource.value as FHIR.Quantity, threshold, unit), profile, operand.selected.resource, subjectReference),
    validity: operand.selected.validity
  }`;
}
