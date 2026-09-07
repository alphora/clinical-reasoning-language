// REFACTOR:grounded (#320, reviewed 557): one versioned CQL selector over opaque Observation candidates.
// The source adapter must supply faithful validity strings; FHIR dateTime conversion is a separate seam.
import { cqlStringLiteral } from "./cqlStrings";
import { PUBLICATION_OBSERVATION_STATUSES } from "../emit/publicationProgram";

// v1 is the compiler-internal Observation-candidate ABI. A future resource type needs a
// distinct typed ABI/version; these reserved names never imply polymorphic FHIR resources.
export const PUBLICATION_SELECTION_CQL_PREFIX = "__CRL_PublicationSelection_v1_";
export const PUBLICATION_NATIVE_VALIDITY = `${PUBLICATION_SELECTION_CQL_PREFIX}NativeValidity`;
export const PUBLICATION_LOCAL_BOOLEAN_CANDIDATE = `${PUBLICATION_SELECTION_CQL_PREFIX}LocalBooleanCandidate`;
export const PUBLICATION_LOCAL_CODEABLE_CANDIDATE = `${PUBLICATION_SELECTION_CQL_PREFIX}LocalCodeableCandidate`;
export const PUBLICATION_LOCAL_QUANTITY_CANDIDATE = `${PUBLICATION_SELECTION_CQL_PREFIX}LocalQuantityCandidate`;
export const PUBLICATION_SERVICE_REQUEST_CANDIDATE = `${PUBLICATION_SELECTION_CQL_PREFIX}ServiceRequestCandidate`;

/** Reserved compiler function names: register once and reject authored/constructor name collisions. */
export const PUBLICATION_SELECTION_CQL_FUNCTIONS = Object.freeze({
  validityState: `${PUBLICATION_SELECTION_CQL_PREFIX}ValidityState`,
  comparisonValue: `${PUBLICATION_SELECTION_CQL_PREFIX}ComparisonValue`,
  calendarStart: `${PUBLICATION_SELECTION_CQL_PREFIX}CalendarStart`,
  calendarLower: `${PUBLICATION_SELECTION_CQL_PREFIX}CalendarLower`,
  calendarNextStart: `${PUBLICATION_SELECTION_CQL_PREFIX}CalendarNextStart`,
  calendarUpper: `${PUBLICATION_SELECTION_CQL_PREFIX}CalendarUpper`,
  mixedCompare: `${PUBLICATION_SELECTION_CQL_PREFIX}MixedCompare`,
  compare: `${PUBLICATION_SELECTION_CQL_PREFIX}Compare`,
  result: `${PUBLICATION_SELECTION_CQL_PREFIX}Result`,
  fail: `${PUBLICATION_SELECTION_CQL_PREFIX}Fail`,
  choose: `${PUBLICATION_SELECTION_CQL_PREFIX}Choose`,
  latest: `${PUBLICATION_SELECTION_CQL_PREFIX}Latest`,
  select: `${PUBLICATION_SELECTION_CQL_PREFIX}Select`,
  record: `${PUBLICATION_SELECTION_CQL_PREFIX}Record`,
});

export const PUBLICATION_CANDIDATE_CQL_TYPE =
  "Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }";

export const PUBLICATION_SELECTION_RESULT_CQL_TYPE = `Tuple { state System.String, failureCode System.String, failureMessage System.String, conceptId System.String, selected ${PUBLICATION_CANDIDATE_CQL_TYPE}, affected List<${PUBLICATION_CANDIDATE_CQL_TYPE}> }`;

/** Native-model adapter, not a raw-FHIR accessor. CQFramework discards sub-ms/leap detail upstream. */
export function renderPublicationCandidateHelpers(includeQuantity = false): string {
  const fail = (code: string, text: string): string =>
    `Message(null as ${PUBLICATION_CANDIDATE_CQL_TYPE}, true, '${code}', 'Error', conceptId + ': ${text}')`;
  const localCandidate = (candidateName: string, fhirValueType: "boolean" | "CodeableConcept" | "Quantity"): string => `define function "${candidateName}"(O FHIR.Observation, contributorId System.String, conceptId System.String):
  if O.status.value is null or not (O.status.value in { ${PUBLICATION_OBSERVATION_STATUSES.map(cqlStringLiteral).join(", ")} }) then
    ${fail("publication-invalid-status", "Expected a present, valid FHIR Observation status")}
  else if O.status.value in { 'entered-in-error', 'cancelled' } then
    ${fail("publication-invalidated-record", "Explicitly invalidated or cancelled candidates need an authored eligibility policy")}
  else if O.value is not null and not (O.value is FHIR.${fhirValueType}) then
    ${fail("publication-invalid-value", `A present answer must be a FHIR ${fhirValueType}; absence remains unknown`)}
${fhirValueType === "Quantity" ? `  else if (O.value as FHIR.Quantity).comparator.value is not null
    or ((O.value as FHIR.Quantity).value.value is not null and (
      ((O.value as FHIR.Quantity).system.value is not null and (O.value as FHIR.Quantity).system.value != 'http://unitsofmeasure.org')
      or ((O.value as FHIR.Quantity).system.value = 'http://unitsofmeasure.org' and Coalesce((O.value as FHIR.Quantity).code.value, '') = '')
      or Coalesce((O.value as FHIR.Quantity).code.value, (O.value as FHIR.Quantity).unit.value, '') = '')) then
    ${fail("publication-invalid-quantity", "An exact Quantity requires a supported unit identity and no comparator")}
` : ""}\
  else if O.effective is not null and not (O.effective is FHIR.dateTime) then
    ${fail("publication-invalid-validity-choice", "This publication accepts effectiveDateTime or absent validity")}
  else Tuple {
    key: if O.id.value is null or O.id.value = '' then 'Observation/<missing-id>' else 'Observation/' + O.id.value,
    contributorId: contributorId,
    arm: 'local',
    retrievedInputIdentity: if O.id.value is null or O.id.value = '' then null as System.String else 'Observation/' + O.id.value,
    resource: O,
    validity: "${PUBLICATION_NATIVE_VALIDITY}"((O.effective as FHIR.dateTime).value)
  }`;
  return `/* REFACTOR:grounded (#320, review 560): observable invalid choices fail before casting. */
define function "${PUBLICATION_NATIVE_VALIDITY}"(D System.DateTime):
  if D is null then null as System.String
  else if (hour from D) is null then ToString(D)
  else if (second from D) is null then
    Message(null as System.String, true, 'publication-incomparable-validity', 'Error', 'A time component requires complete seconds')
  else ToString(DateTime(year from D, month from D, day from D,
    hour from D, minute from D, second from D,
    Coalesce(millisecond from D, 0), timezoneoffset from D))

${localCandidate(PUBLICATION_LOCAL_BOOLEAN_CANDIDATE, "boolean")}

${localCandidate(PUBLICATION_LOCAL_CODEABLE_CANDIDATE, "CodeableConcept")}
${includeQuantity ? "\n" + localCandidate(PUBLICATION_LOCAL_QUANTITY_CANDIDATE, "Quantity") + "\n" : ""}\

/* REFACTOR:grounded (#320, review 564): explicit supported source state; no exclusion or false fallback. */
define function "${PUBLICATION_SERVICE_REQUEST_CANDIDATE}"(S FHIR.ServiceRequest, contributorId System.String,
  conceptId System.String, code FHIR.CodeableConcept, profile System.String, subjectReference System.String):
  if S.status.value is null or S.status.value != 'active' or S.intent.value is null or S.intent.value != 'order'
    or S.doNotPerform.value = true or (S.doNotPerform is not null and S.doNotPerform.value is null)
    or exists(S.modifierExtension) then
    ${fail("publication-source-state-unsupported", "This source projection supports active order requests without prohibition or modifier extensions; other states need an authored eligibility policy")}
  else if subjectReference is null or S.subject.reference.value is null
    or not Matches(S.subject.reference.value, ${cqlStringLiteral(String.raw`\A(https?://[^?#]+/)?Patient/[A-Za-z0-9.-]{1,64}(/_history/[A-Za-z0-9.-]{1,64})?\z`)})
    or ('Patient/' + Last(Split(
      if PositionOf('/_history/', S.subject.reference.value) >= 0
        then Substring(S.subject.reference.value, 0, PositionOf('/_history/', S.subject.reference.value))
        else S.subject.reference.value, '/'))) != subjectReference then
    ${fail("publication-source-subject-unsupported", "The source must resolve to the current evaluation Patient")}
  else if S.id.value is null or not Matches(S.id.value, ${cqlStringLiteral(String.raw`\A[A-Za-z0-9.-]{1,64}\z`)}) then
    ${fail("publication-missing-input-identity", "A retrieved ServiceRequest requires a valid FHIR id in this dataset")}
  else if profile is null then
    ${fail("publication-source-profile-required", "A source-produced Case Feature requires its profile")}
  else Tuple {
    key: ToString(Length(contributorId)) + ':' + contributorId + ToString(Length('ServiceRequest/' + S.id.value)) + ':' + 'ServiceRequest/' + S.id.value,
    contributorId: contributorId, arm: 'source', retrievedInputIdentity: 'ServiceRequest/' + S.id.value,
    resource: FHIR.Observation {
      status: FHIR.ObservationStatus { value: 'final' },
      subject: FHIR.Reference { reference: FHIR.string { value: subjectReference } },
      meta: FHIR.Meta { profile: { FHIR.canonical { value: profile } } },
      code: code, value: FHIR.boolean { value: true }, effective: S.authoredOn
    },
    validity: "${PUBLICATION_NATIVE_VALIDITY}"(S.authoredOn.value)
  }`;
}

/**
 * Render identical helper bodies for every caller. Select returns data; only Record raises Error.
 * Requires FHIR 4.0.1 in the containing library. No concept-specific code/profile/value logic occurs.
 */
export function renderPublicationSelectionHelpers(): string {
  const n = PUBLICATION_SELECTION_CQL_FUNCTIONS;
  const name = (key: keyof typeof n): string => `"${n[key]}"`;
  const candidate = PUBLICATION_CANDIDATE_CQL_TYPE;
  const candidates = `List<${candidate}>`;
  const empty = `{} as ${candidates}`;
  const noCandidate = `null as ${candidate}`;
  const timezone = "(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00))";
  const grammar = String.raw`\A[0-9]{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01])(T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)([.][0-9]+)?${timezone})?)?)?\z`;
  const subMillisecond = String.raw`\A.*[.][0-9]{3}[0-9]*[1-9][0-9]*${timezone}\z`;
  return `/* REFACTOR:grounded (#320, reviewed 557): reserved v1 publication selection helpers. */
define function ${name("validityState")}(raw System.String):
  if raw is null then 'missing'
  else if not Matches(raw, ${cqlStringLiteral(grammar)})
    or Substring(raw, 0, 4) = '0000'
    or ToDateTime(Substring(raw, 0, 10)) is null then 'invalid'
  else if Substring(raw, 17, 2) = '60'
    or Matches(raw, ${cqlStringLiteral(subMillisecond)}) then 'unsupported'
  else 'supported'

/* Full zoned seconds are exact instants in the shared TS comparator. Normalize only comparison
 * precision to milliseconds; never rewrite the candidate's authored validity or resource. */
define function ${name("comparisonValue")}(raw System.String):
  if Length(raw) > 10 and Substring(raw, 19, 1) != '.' then
    ToDateTime(Substring(raw, 0, 19) + '.000' + Substring(raw, 19))
  else ToDateTime(raw)

/* Bounds cover every possible instant at the calendar's precision and FHIR's +/-14h zone range.
 * UTC is explicit. At year-domain edges null means unbounded for comparison, never missing validity.
 * FHIR rejects years outside 1..9999: no valid instant can precede the first calendar's earliest
 * bound or reach the final calendar's exclusive upper bound. These null edges therefore agree
 * with the finite TS bounds, which can be represented in JS comparison years 0/10000.
 * These computational bounds are never written to a candidate or exposed as its clinical time. */
define function ${name("calendarStart")}(raw System.String):
  DateTime(ToInteger(Substring(raw, 0, 4)),
    if Length(raw) >= 7 then ToInteger(Substring(raw, 5, 2)) else 1,
    if Length(raw) = 10 then ToInteger(Substring(raw, 8, 2)) else 1,
    0, 0, 0, 0, 0)

define function ${name("calendarLower")}(raw System.String):
  if ${name("calendarStart")}(raw) = DateTime(1, 1, 1, 0, 0, 0, 0, 0) then null as System.DateTime
  else ${name("calendarStart")}(raw) - 14 hours

define function ${name("calendarNextStart")}(raw System.String):
  if raw in { '9999', '9999-12', '9999-12-31' } then null as System.DateTime
  else if Length(raw) = 4 then ${name("calendarStart")}(raw) + 1 year
  else if Length(raw) = 7 then ${name("calendarStart")}(raw) + 1 month
  else ${name("calendarStart")}(raw) + 1 day

define function ${name("calendarUpper")}(raw System.String):
  if ${name("calendarNextStart")}(raw) is null then null as System.DateTime
  else ${name("calendarNextStart")}(raw) + 14 hours

define function ${name("mixedCompare")}(calendar System.String, instant System.DateTime):
  if ${name("calendarLower")}(calendar) is not null and instant < ${name("calendarLower")}(calendar) then 'after'
  else if ${name("calendarUpper")}(calendar) is not null and instant >= ${name("calendarUpper")}(calendar) then 'before'
  else 'indeterminate'

define function ${name("compare")}(left System.String, right System.String):
  if ${name("validityState")}(left) = 'invalid' or ${name("validityState")}(right) = 'invalid' then 'invalid'
  else if left is null or right is null then 'indeterminate'
  else if ${name("validityState")}(left) = 'unsupported' or ${name("validityState")}(right) = 'unsupported' then 'unsupported'
  else if Length(left) <= 10 and Length(right) > 10 then ${name("mixedCompare")}(left, ${name("comparisonValue")}(right))
  else if Length(right) <= 10 and Length(left) > 10 then
    case ${name("mixedCompare")}(right, ${name("comparisonValue")}(left))
      when 'before' then 'after'
      when 'after' then 'before'
      else 'indeterminate'
    end
  else if ${name("comparisonValue")}(left) > ${name("comparisonValue")}(right) then 'after'
  else if ${name("comparisonValue")}(left) < ${name("comparisonValue")}(right) then 'before'
  else if ${name("comparisonValue")}(left) = ${name("comparisonValue")}(right) then 'equal'
  else 'indeterminate'

define function ${name("result")}(state System.String, failureCode System.String, conceptId System.String, selected ${candidate}, affected ${candidates}):
  Tuple {
    state: state,
    failureCode: failureCode,
    failureMessage: if failureCode is null then null as System.String
      else failureCode + ' in ' + conceptId + ': ' + Combine((affected C return all C.key), ', ')
        + (if failureCode != 'publication-incomparable-validity' then ''
          else if exists (affected C where exists (affected D
            where ${name("compare")}(C.validity, D.validity) = 'unsupported' return all D) return all C)
            then ': unsupported comparison of validity; correct or exclude the unsupported input'
          else ': overlapping precision of validity; equal-time preference does not resolve overlap'),
    conceptId: conceptId,
    selected: selected,
    affected: affected
  }

define function ${name("fail")}(failureCode System.String, conceptId System.String, affected ${candidates}):
  ${name("result")}('failed', failureCode, conceptId, ${noCandidate},
    (affected C return all C sort by key, contributorId, arm, retrievedInputIdentity, validity))

define function ${name("choose")}(latest ${candidates}, conceptId System.String, equalTime System.String):
  if Count(latest) = 1 then ${name("result")}('selected', null, conceptId, singleton from latest, ${empty})
  else if equalTime = 'preferLocal' and Count(latest C where C.arm = 'local' return all C) = 1 then
    ${name("result")}('selected', null, conceptId, singleton from (latest C where C.arm = 'local' return all C), ${empty})
  else ${name("fail")}('publication-ambiguous-selection', conceptId, latest)

define function ${name("latest")}(candidates ${candidates}, conceptId System.String, equalTime System.String):
  if not exists (candidates C
    where not exists (candidates D where not (${name("compare")}(C.validity, D.validity) in { 'after', 'equal' }) return all D)
    return all C) then ${name("fail")}('publication-incomparable-validity', conceptId, candidates)
  else ${name("choose")}(
    (candidates C where not exists (candidates D where not (${name("compare")}(C.validity, D.validity) in { 'after', 'equal' }) return all D) return all C),
    conceptId, equalTime)

define function ${name("select")}(candidates ${candidates}, conceptId System.String, equalTime System.String):
  if exists (candidates C where C.validity is not null and ${name("validityState")}(C.validity) = 'invalid' return all C) then
    ${name("fail")}('publication-invalid-validity', conceptId,
      (candidates C where C.validity is not null and ${name("validityState")}(C.validity) = 'invalid' return all C))
  else if exists (candidates C where C.arm != 'inferred' and (C.retrievedInputIdentity is null or C.retrievedInputIdentity = '') return all C) then
    ${name("fail")}('publication-missing-input-identity', conceptId,
      (candidates C where C.arm != 'inferred' and (C.retrievedInputIdentity is null or C.retrievedInputIdentity = '') return all C))
  else if exists (candidates C where
    Count(candidates D where D.key = C.key return all D) > 1
    or (C.retrievedInputIdentity is not null and Count(candidates D where D.contributorId = C.contributorId and D.retrievedInputIdentity = C.retrievedInputIdentity return all D) > 1)
    return all C) then
    ${name("fail")}('publication-duplicate-input', conceptId,
      (candidates C where Count(candidates D where D.key = C.key return all D) > 1
        or (C.retrievedInputIdentity is not null and Count(candidates D where D.contributorId = C.contributorId and D.retrievedInputIdentity = C.retrievedInputIdentity return all D) > 1) return all C))
  else if Count(candidates) = 0 then ${name("result")}('missing', null, conceptId, ${noCandidate}, ${empty})
  else if Count(candidates) = 1 then ${name("result")}('selected', null, conceptId, singleton from candidates, ${empty})
  else if exists (candidates C where C.validity is null return all C) then
    ${name("fail")}('publication-undated-input', conceptId, (candidates C where C.validity is null return all C))
  else ${name("latest")}(candidates, conceptId, equalTime)

define function ${name("record")}(result ${PUBLICATION_SELECTION_RESULT_CQL_TYPE}):
  if result.state = 'failed' then
    Message(null as FHIR.Observation, true, result.failureCode, 'Error', result.failureMessage)
  else if result.state = 'selected' then result.selected.resource
  else null as FHIR.Observation
`;
}
