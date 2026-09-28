import { PUBLICATION_CANDIDATE_CQL_TYPE, PUBLICATION_SELECTION_RESULT_CQL_TYPE } from "./renderPublicationSelection";
import { PUBLICATION_CODE_TABLE_TYPE, PUBLICATION_PRODUCER_FUNCTIONS, PUBLICATION_PRODUCER_PREFIX } from "./renderPublicationProducer";

export const ANY_MEMBERSHIP_CQL = `${PUBLICATION_PRODUCER_PREFIX}AnyMembership`;
const inputType = `List<Tuple { publication ${PUBLICATION_SELECTION_RESULT_CQL_TYPE}, domain ${PUBLICATION_CODE_TABLE_TYPE} }>`;
export function renderPublicationAnyMembershipHelpers(): string {
  const classify = `${ANY_MEMBERSHIP_CQL}Classify`, reduce = `${ANY_MEMBERSHIP_CQL}Reduce`;
  return `/* Selected operands are classified in full before the aggregate is reduced. */
define function "${classify}"(inputs ${inputType}, qualifying ${PUBLICATION_CODE_TABLE_TYPE}):
  inputs I return all
    if I.publication.state = 'failed' then
      Message(null as System.Boolean, true, I.publication.failureCode, 'Error', I.publication.failureMessage)
    else if I.publication.state != 'selected' then null as System.Boolean
    else "${PUBLICATION_PRODUCER_FUNCTIONS.classify}"(I.publication.selected.resource.value as FHIR.CodeableConcept, I.domain, qualifying, I.publication.conceptId)

define function "${reduce}"(values List<System.Boolean>, expected System.Integer):
  if Count(values) = expected then exists (values V where V = true)
  else if exists (values V where V = true) then true
  else null as System.Boolean

define function "${ANY_MEMBERSHIP_CQL}"(inputs ${inputType}, qualifying ${PUBLICATION_CODE_TABLE_TYPE}, anchor System.Integer,
  producerId System.String, code FHIR.CodeableConcept, profile System.String, subjectReference System.String):
  if subjectReference is null or subjectReference = '' then
    Message(null as ${PUBLICATION_CANDIDATE_CQL_TYPE}, true, 'publication-missing-subject', 'Error', 'A produced Observation requires an evaluation subject')
  else Tuple {
    key: ToString(Length(producerId)) + ':' + producerId +
      ToString(Length(Combine(inputs I return all if I.publication.state != 'selected' then 'M' else 'S' + ToString(Length(I.publication.selected.key)) + ':' + I.publication.selected.key, ''))) + ':' +
      Combine(inputs I return all if I.publication.state != 'selected' then 'M' else 'S' + ToString(Length(I.publication.selected.key)) + ':' + I.publication.selected.key, ''),
    contributorId: producerId,
    arm: 'inferred',
    retrievedInputIdentity: null as System.String,
    resource: FHIR.Observation {
      status: FHIR.ObservationStatus { value: 'final' },
      code: code,
      value: FHIR.boolean { value: "${reduce}"("${classify}"(inputs, qualifying), Count(inputs)) },
      subject: FHIR.Reference { reference: FHIR.string { value: subjectReference } },
      meta: if profile is null then null as FHIR.Meta else FHIR.Meta { profile: { FHIR.canonical { value: profile } } },
      effective: inputs[anchor].publication.selected.resource.effective as FHIR.dateTime,
      derivedFrom: inputs I where I.publication.state = 'selected' and Matches(I.publication.selected.resource.id.value, '^[A-Za-z0-9.-]{1,64}$')
        return distinct FHIR.Reference { reference: FHIR.string { value: 'Observation/' + I.publication.selected.resource.id.value } }
    },
    validity: inputs[anchor].publication.selected.validity
  }`;
}
