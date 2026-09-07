// REFACTOR:grounded (#320, plan583): age-specific eligibility, separate from final selection.
import { AGE_METHOD_SYSTEM } from "../emit/publicationAge";
import { cqlStringLiteral } from "./cqlStrings";
import { PUBLICATION_CANDIDATE_CQL_TYPE as C, PUBLICATION_SELECTION_CQL_FUNCTIONS as S } from "./renderPublicationSelection";
export const AGE_CQL_PREFIX = "__CRL_AgeToday_v1_";
export const AGE_CQL = { produce: `${AGE_CQL_PREFIX}Produce`, eligible: `${AGE_CQL_PREFIX}Eligible`, method: `${AGE_CQL_PREFIX}Method`, day: `${AGE_CQL_PREFIX}Day`, relation: `${AGE_CQL_PREFIX}DayRelation`, choose: `${AGE_CQL_PREFIX}Choose` };
export function renderPublicationAgeHelpers(): string {
  const q = (s: string) => `"${s}"`, list = `List<${C}>`;
  const error = (type: string, code: string, message: string) => `Message(null as ${type}, true, '${code}', 'Error', conceptId + ': ${message}')`;
  const methodSystem = cqlStringLiteral(AGE_METHOD_SYSTEM);
  return `define function "${AGE_CQL_PREFIX}Value"(age System.Integer, op System.String, threshold System.Decimal):
  if op = 'AtLeast' then age >= threshold else if op = 'AtMost' then age <= threshold else age < threshold

define function ${q(AGE_CQL.method)}(O FHIR.Observation):
  if Count(O.method.coding C where C.system.value = ${methodSystem}) = 1 then
    singleton from (O.method.coding C where C.system.value = ${methodSystem} return all C.code.value)
  else null as System.String

define function ${q(AGE_CQL.day)}(raw System.String, offsetHours System.Decimal):
  if raw is null or Length(raw) < 10 then null as System.Date
  else if Length(raw) = 10 then ToDate(raw)
  else date from (ToDateTime(raw) + System.Quantity { value: (offsetHours - (timezoneoffset from ToDateTime(raw))) * 60.0, unit: 'minutes' })

define function ${q(AGE_CQL.relation)}(raw System.String, evaluationDay System.Date, offsetHours System.Decimal):
  if raw is null then 'unknown'
  else if Length(raw) < 10 then
    if raw < Substring(ToString(evaluationDay), 0, Length(raw)) then 'past'
    else if raw > Substring(ToString(evaluationDay), 0, Length(raw)) then 'future'
    else 'unknown'
  else if ${q(AGE_CQL.day)}(raw, offsetHours) < evaluationDay then 'past'
  else if ${q(AGE_CQL.day)}(raw, offsetHours) > evaluationDay then 'future'
  else 'same'

define function ${q(AGE_CQL.produce)}(P FHIR.Patient, contributorId System.String, conceptId System.String,
  code FHIR.CodeableConcept, profile System.String, subjectReference System.String,
  op System.String, unit System.String, threshold System.Decimal, evaluationDay System.Date):
  if P.id.value is null or not Matches(P.id.value, ${cqlStringLiteral(String.raw`\A[A-Za-z0-9.-]{1,64}\z`)}) then
    ${error(C, "publication-missing-input-identity", "Age source requires a valid Patient id")}
  else if 'Patient/' + P.id.value != subjectReference then
    ${error(C, "publication-source-subject-unsupported", "Age must use the evaluation Patient")}
  else if exists(P.modifierExtension) then
    ${error(C, "publication-source-state-unsupported", "Qualified Patient data requires a supported interpretation")}
  else if P.birthDate.value is null then null as ${C}
  else if Date(year from P.birthDate.value, Coalesce(month from P.birthDate.value, 1), Coalesce(day from P.birthDate.value, 1)) > evaluationDay then
    ${error(C, "publication-age-future-birthdate", "Patient birthDate is after the evaluation date")}
  else if (day from P.birthDate.value) is null then null as ${C}
  else Tuple {
    key: ToString(Length(contributorId)) + ':' + contributorId + ToString(Length('Patient/' + P.id.value)) + ':' + 'Patient/' + P.id.value,
    contributorId: contributorId, arm: 'source', retrievedInputIdentity: 'Patient/' + P.id.value,
    validity: ToString(evaluationDay),
    resource: FHIR.Observation {
      status: FHIR.ObservationStatus { value: 'final' },
      subject: FHIR.Reference { reference: FHIR.string { value: subjectReference } },
      meta: if profile is null then null as FHIR.Meta else FHIR.Meta { profile: { FHIR.canonical { value: profile } } },
      code: code, effective: FHIR.dateTime { value: ToDateTime(evaluationDay) },
      method: FHIR.CodeableConcept { coding: { FHIR.Coding { system: FHIR.uri { value: ${methodSystem} }, code: FHIR.code { value: 'calculated' } } } },
      value: FHIR.boolean { value: "${AGE_CQL_PREFIX}Value"(
        if unit = 'months' then duration in months between P.birthDate.value and evaluationDay else duration in years between P.birthDate.value and evaluationDay, op, threshold) }
    }
  }

define function ${q(AGE_CQL.choose)}(assertions ${list}, calculations ${list}, evaluationDay System.Date, offsetHours System.Decimal, conceptId System.String):
  if not exists(calculations) then assertions
  else if exists(assertions C where ${q(AGE_CQL.relation)}(C.validity, evaluationDay, offsetHours) = 'unknown') then
    ${error(list, "publication-age-day-unknown", "Cannot determine same-day assertion eligibility")}
  else if exists(assertions C where ${q(AGE_CQL.day)}(C.validity, offsetHours) = evaluationDay) then
    (assertions C where ${q(AGE_CQL.day)}(C.validity, offsetHours) = evaluationDay)
  else calculations

define function ${q(AGE_CQL.eligible)}(candidates ${list}, evaluationDay System.Date, offsetHours System.Decimal, conceptId System.String):
  if exists(candidates C where ${q(S.validityState)}(C.validity) = 'invalid') then
    ${error(list, "publication-invalid-validity", "Malformed age validity")}
  else if exists(candidates C where C.retrievedInputIdentity is null or C.retrievedInputIdentity = '') then
    ${error(list, "publication-missing-input-identity", "Age input requires an identity")}
  else if exists(candidates C where exists(C.resource.modifierExtension)) then
    ${error(list, "publication-source-state-unsupported", "Qualified age input requires a supported interpretation")}
  else if exists(candidates C where Count(candidates D where D.key = C.key or (D.contributorId = C.contributorId and D.retrievedInputIdentity = C.retrievedInputIdentity)) > 1) then
    ${error(list, "publication-duplicate-input", "Repeated age input identity")}
  else if exists(candidates C where Count(C.resource.method.coding M where M.system.value = ${methodSystem}) != 1
    or not Coalesce(${q(AGE_CQL.method)}(C.resource) in { 'asserted', 'calculated' }, false)) then
    ${error(list, "publication-age-method-required", "Age inputs require exactly one asserted or calculated determination method")}
  else if exists(candidates C where ${q(AGE_CQL.relation)}(C.validity, evaluationDay, offsetHours) = 'future') then
    ${error(list, "publication-age-future-input", "Age input is dated after the evaluation day")}
  else if exists(candidates C where ${q(AGE_CQL.method)}(C.resource) = 'calculated' and ${q(AGE_CQL.relation)}(C.validity, evaluationDay, offsetHours) = 'unknown') then
    ${error(list, "publication-age-day-unknown", "Cannot determine whether a cached calculation is current")}
  else ${q(AGE_CQL.choose)}(
    (candidates C where ${q(AGE_CQL.method)}(C.resource) = 'asserted'),
    if exists(candidates C where C.arm = 'source') then (candidates C where C.arm = 'source')
      else (candidates C where ${q(AGE_CQL.method)}(C.resource) = 'calculated' and ${q(AGE_CQL.day)}(C.validity, offsetHours) = evaluationDay),
    evaluationDay, offsetHours, conceptId)`;
}
