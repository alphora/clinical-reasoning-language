import { cqlStringLiteral } from "./cqlStrings";
import {
  PUBLICATION_CANDIDATE_CQL_TYPE,
  PUBLICATION_LOCAL_QUANTITY_CANDIDATE,
  PUBLICATION_LOCAL_CODEABLE_CANDIDATE,
  PUBLICATION_NATIVE_VALIDITY,
} from "./renderPublicationSelection";

// Source adaptation preserves the typed value; domain interpretation follows final selection.
export const PUBLICATION_OBSERVATION_CANDIDATE = {
  Quantity: "__CRL_PublicationSelection_v1_ObservationQuantityCandidate",
  CodeableConcept: "__CRL_PublicationSelection_v1_ObservationCodeableCandidate",
} as const;

export function renderPublicationObservationHelpers(
  valueType: "Quantity" | "CodeableConcept",
): string {
  const candidate =
    valueType === "Quantity"
      ? PUBLICATION_LOCAL_QUANTITY_CANDIDATE
      : PUBLICATION_LOCAL_CODEABLE_CANDIDATE;
  const fail = (code: string, message: string) =>
    `Message(null as ${PUBLICATION_CANDIDATE_CQL_TYPE}, true, '${code}', 'Error', '${message}')`;
  return `define function "${PUBLICATION_OBSERVATION_CANDIDATE[valueType]}"(S FHIR.Observation, contributorId System.String,
  conceptId System.String, code FHIR.CodeableConcept, profile System.String, subjectReference System.String):
  if exists(S.modifierExtension) then
    ${fail("publication-source-state-unsupported", "Observation modifier extensions require an explicit interpretation")}
  else if subjectReference is null or S.subject.reference.value is null
    or not Matches(S.subject.reference.value, ${cqlStringLiteral(String.raw`\A(https?://[^?#]+/)?Patient/[A-Za-z0-9.-]{1,64}(/_history/[A-Za-z0-9.-]{1,64})?\z`)})
    or ('Patient/' + Last(Split(
      if PositionOf('/_history/', S.subject.reference.value) >= 0
        then Substring(S.subject.reference.value, 0, PositionOf('/_history/', S.subject.reference.value))
        else S.subject.reference.value, '/'))) != subjectReference then
    ${fail("publication-source-subject-unsupported", "The source must resolve to the current evaluation Patient")}
  else if S.id.value is null or not Matches(S.id.value, ${cqlStringLiteral(String.raw`\A[A-Za-z0-9.-]{1,64}\z`)}) then
    ${fail("publication-missing-input-identity", "A retrieved Observation requires a valid FHIR id")}
  else if "${candidate}"(S, contributorId, conceptId).resource is null then
    null as ${PUBLICATION_CANDIDATE_CQL_TYPE}
  else Tuple {
    key: ToString(Length(contributorId)) + ':' + contributorId + ToString(Length('Observation/' + S.id.value)) + ':' + 'Observation/' + S.id.value,
    contributorId: contributorId, arm: 'source', retrievedInputIdentity: 'Observation/' + S.id.value,
    resource: FHIR.Observation {
      status: FHIR.ObservationStatus { value: 'final' },
      subject: FHIR.Reference { reference: FHIR.string { value: subjectReference } },
      meta: if profile is null then null as FHIR.Meta else FHIR.Meta { profile: { FHIR.canonical { value: profile } } },
      code: code, value: S.value as FHIR.${valueType}, effective: S.effective as FHIR.dateTime,
      derivedFrom: { FHIR.Reference { reference: FHIR.string { value: 'Observation/' + S.id.value } } }
    },
    validity: "${PUBLICATION_NATIVE_VALIDITY}"((S.effective as FHIR.dateTime).value)
  }`;
}
