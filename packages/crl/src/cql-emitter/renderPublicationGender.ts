import { cqlStringLiteral } from "./cqlStrings";
import { PUBLICATION_CANDIDATE_CQL_TYPE as C, PUBLICATION_NATIVE_VALIDITY } from "./renderPublicationSelection";
export const GENDER_CQL_PREFIX = "__CRL_PatientGender_v1_";
export const GENDER_CQL_PRODUCE = `${GENDER_CQL_PREFIX}Produce`;
export function renderPublicationGenderHelpers(): string {
  const error = (code: string, message: string) => `Message(null as ${C}, true, '${code}', 'Error', conceptId + ': ${message}')`;
  return `define function "${GENDER_CQL_PRODUCE}"(P FHIR.Patient, contributorId System.String, conceptId System.String,
  code FHIR.CodeableConcept, profile System.String, subjectReference System.String,
  mappings List<Tuple { gender System.String, system System.String, code System.String }>):
  if P.id.value is null or not Matches(P.id.value, ${cqlStringLiteral(String.raw`\A[A-Za-z0-9.-]{1,64}\z`)}) then
    ${error("publication-missing-input-identity", "Gender source requires a valid Patient id")}
  else if 'Patient/' + P.id.value != subjectReference then
    ${error("publication-source-subject-unsupported", "Gender must use the evaluation Patient")}
  else if exists(P.modifierExtension) then
    ${error("publication-source-state-unsupported", "Qualified Patient data requires a supported interpretation")}
  else if P.gender.value is null then null as ${C}
  else if not (P.gender.value in { 'female', 'male', 'other', 'unknown' }) then
    ${error("publication-gender-invalid", "Patient gender must be a valid FHIR administrative gender")}
  else singleton from (mappings M where M.gender = P.gender.value return all Tuple {
    key: ToString(Length(contributorId)) + ':' + contributorId + ToString(Length('Patient/' + P.id.value)) + ':' + 'Patient/' + P.id.value,
    contributorId: contributorId, arm: 'source', retrievedInputIdentity: 'Patient/' + P.id.value,
    validity: "${PUBLICATION_NATIVE_VALIDITY}"(P.meta.lastUpdated.value),
    resource: FHIR.Observation {
      status: FHIR.ObservationStatus { value: 'final' },
      subject: FHIR.Reference { reference: FHIR.string { value: subjectReference } },
      meta: if profile is null then null as FHIR.Meta else FHIR.Meta { profile: { FHIR.canonical { value: profile } } },
      code: code,
      effective: if P.meta.lastUpdated.value is null then null as FHIR.dateTime else FHIR.dateTime { value: P.meta.lastUpdated.value },
      value: FHIR.CodeableConcept { coding: { FHIR.Coding { system: FHIR.uri { value: M.system }, code: FHIR.code { value: M.code } } } }
    }
  })`;
}
