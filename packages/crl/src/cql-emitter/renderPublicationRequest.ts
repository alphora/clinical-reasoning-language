import { cqlStringLiteral } from "./cqlStrings";
import { PUBLICATION_CANDIDATE_CQL_TYPE, PUBLICATION_NATIVE_VALIDITY, PUBLICATION_SELECTION_CQL_FUNCTIONS } from "./renderPublicationSelection";
import { PUBLICATION_CODE_TABLE_TYPE } from "./renderPublicationProducer";
import { resourceEmitRow } from "../emit/resourceEmitRegistry";

export const requestCodeHelper = (type: "ServiceRequest" | "MedicationRequest") => `__CRL_PublicationSelection_v1_${type}CodeCandidate`;

// REFACTOR:grounded (859): request identity and datum are preserved without inventing an answer slot.
export function renderPublicationRequestHelpers(type: "ServiceRequest" | "MedicationRequest"): string {
  const coding = resourceEmitRow(type)!.coding;
  const value = coding.kind === "choice-codeable-concept" ? `(S.${coding.field} as FHIR.CodeableConcept)` : `S.${coding.field}`;
  const fail = (code: string, message: string) => `Message(null as ${PUBLICATION_CANDIDATE_CQL_TYPE}, true, '${code}', 'Error', '${message}')`;
  return `define function "${requestCodeHelper(type)}"(S FHIR.${type}, contributorId System.String,
  conceptId System.String, code FHIR.CodeableConcept, profile System.String, subjectReference System.String,
  sourceCodes ${PUBLICATION_CODE_TABLE_TYPE}):
  if S.status.value is null or S.status.value != 'active' or S.intent.value is null or S.intent.value != 'order'
    or S.doNotPerform.value = true or (S.doNotPerform is not null and S.doNotPerform.value is null)
    or exists(S.modifierExtension) then
    ${fail("publication-source-state-unsupported", "Request code projection supports active orders without prohibition or modifier extensions")}
  else if subjectReference is null or S.subject.reference.value is null
    or not Matches(S.subject.reference.value, ${cqlStringLiteral(String.raw`\A(https?://[^?#]+/)?Patient/[A-Za-z0-9.-]{1,64}(/_history/[A-Za-z0-9.-]{1,64})?\z`)})
    or ('Patient/' + Last(Split(
      if PositionOf('/_history/', S.subject.reference.value) >= 0
        then Substring(S.subject.reference.value, 0, PositionOf('/_history/', S.subject.reference.value))
        else S.subject.reference.value, '/'))) != subjectReference then
    ${fail("publication-source-subject-unsupported", "The source must resolve to the current evaluation Patient")}
  else if S.id.value is null or not Matches(S.id.value, ${cqlStringLiteral(String.raw`\A[A-Za-z0-9.-]{1,64}\z`)}) then
    ${fail("publication-missing-input-identity", "A retrieved request requires a valid FHIR id")}
  else if ${type === "MedicationRequest" ? "S.medication is FHIR.Reference or " : ""}${value} is null or not exists(${value}.coding)
    or exists (from (${value}.coding) C where C.system.value is null or Matches(C.system.value, ${cqlStringLiteral(String.raw`\A\s*\z`)}) or C.code.value is null or Matches(C.code.value, ${cqlStringLiteral(String.raw`\A\s*\z`)})) then
    ${fail("publication-source-code-unsupported", "Request code projection requires inline nonempty system/code codings; reference resolution is not implemented")}
  else if S.authoredOn is not null and S.authoredOn.value is null then
    ${fail("publication-invalid-validity", "Extension-only request authoredOn requires an explicit interpretation")}
  else if S.authoredOn.value is not null and "${PUBLICATION_SELECTION_CQL_FUNCTIONS.validityState}"("${PUBLICATION_NATIVE_VALIDITY}"(S.authoredOn.value)) != 'supported' then
    ${fail("publication-incomparable-validity", "Request authoredOn precision is unsupported")}
  else if not exists (from (${value}.coding) C where exists (sourceCodes K where K.system = C.system.value and K.code = C.code.value)) then
    null as ${PUBLICATION_CANDIDATE_CQL_TYPE}
  else Tuple {
    key: ToString(Length(contributorId)) + ':' + contributorId + ToString(Length('${type}/' + S.id.value)) + ':' + '${type}/' + S.id.value,
    contributorId: contributorId, arm: 'source', retrievedInputIdentity: '${type}/' + S.id.value,
    resource: FHIR.Observation {
      status: FHIR.ObservationStatus { value: 'final' },
      subject: FHIR.Reference { reference: FHIR.string { value: subjectReference } },
      meta: if profile is null then null as FHIR.Meta else FHIR.Meta { profile: { FHIR.canonical { value: profile } } },
      code: code, value: ${value}, effective: S.authoredOn
    },
    validity: "${PUBLICATION_NATIVE_VALIDITY}"(S.authoredOn.value)
  }`;
}
