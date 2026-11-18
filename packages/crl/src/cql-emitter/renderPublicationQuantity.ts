import { PUBLICATION_CANDIDATE_CQL_TYPE, PUBLICATION_SELECTION_RESULT_CQL_TYPE } from "./renderPublicationSelection";
import { PUBLICATION_PRODUCER_FUNCTIONS } from "./renderPublicationProducer";
import { PUBLICATION_QUANTITY_UNITS } from "../emit/publicationQuantity";

export const QUANTITY_CQL = {
  unit: "__CRL_PublicationProducer_v1_QuantityUnit", factor: "__CRL_PublicationProducer_v1_QuantityFactor",
  group: "__CRL_PublicationProducer_v1_QuantityGroup", compare: "__CRL_PublicationProducer_v1_QuantityAtLeast",
  candidate: "__CRL_PublicationProducer_v1_QuantityThresholdCandidate",
  compareAtMost: "__CRL_PublicationProducer_v1_QuantityAtMost",
  candidateAtMost: "__CRL_PublicationProducer_v1_QuantityAtMostCandidate",
};
export function renderPublicationThresholdHelpers(): string {
  const n = QUANTITY_CQL;
  // REFACTOR:grounded: one unit table governs the CRE/native comparison helpers; no fractional factors.
  // Declared-type cross-unit normalization remains separately bounded to m/cm and kg/g.
  const entries = Object.entries(PUBLICATION_QUANTITY_UNITS);
  const comparisons = [[n.compare, n.candidate, ">="], [n.compareAtMost, n.candidateAtMost, "<="]];
  return `define function "${n.unit}"(Q FHIR.Quantity): Coalesce(Q.code.value, Q.unit.value)
define function "${n.factor}"(unit System.String):
  case unit ${entries.map(([unit, spec]) => `when '${unit}' then ${spec.factor}.0`).join(" ")} else null as System.Decimal end
define function "${n.group}"(unit System.String):
  case unit ${entries.map(([unit, spec]) => `when '${unit}' then '${spec.group}'`).join(" ")} else null as System.String end
${comparisons.map(([compare, candidate, operator]) => `define function "${compare}"(Q FHIR.Quantity, threshold System.Decimal, unit System.String):
  if Q.value.value is null then null as System.Boolean
  else if Abs(Q.value.value) > 1000000.0 or Q.value.value != Round(Q.value.value, 8) then
    Message(null as System.Boolean, true, 'publication-quantity-precision-unsupported', 'Error', 'Quantity comparison supports magnitude at most 10^6 and at most eight decimal places')
  else if "${n.group}"("${n.unit}"(Q)) is null or "${n.group}"("${n.unit}"(Q)) != "${n.group}"(unit) then
    Message(null as System.Boolean, true, 'publication-quantity-unit-unsupported', 'Error', 'Quantity comparison requires compatible supported units')
  else Q.value.value * "${n.factor}"("${n.unit}"(Q)) ${operator} threshold * "${n.factor}"(unit)
define function "${candidate}"(operand ${PUBLICATION_SELECTION_RESULT_CQL_TYPE}, producerId System.String, code FHIR.CodeableConcept,
  profile System.String, threshold System.Decimal, unit System.String, conceptId System.String, subjectReference System.String):
  if operand.state = 'failed' then
    Message(null as ${PUBLICATION_CANDIDATE_CQL_TYPE}, true, operand.failureCode, 'Error', operand.failureMessage)
  else if operand.state != 'selected' then null as ${PUBLICATION_CANDIDATE_CQL_TYPE}
  else Tuple {
    key: ToString(Length(producerId)) + ':' + producerId + ToString(Length(operand.selected.key)) + ':' + operand.selected.key,
    contributorId: producerId, arm: 'inferred', retrievedInputIdentity: null as System.String,
    resource: "${PUBLICATION_PRODUCER_FUNCTIONS.construct}"(code, "${compare}"(operand.selected.resource.value as FHIR.Quantity, threshold, unit), profile, operand.selected.resource, subjectReference),
    validity: operand.selected.validity
  }`).join("\n")}`;
}
