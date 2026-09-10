library SemnotAge232FixtureInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include SemnotAge232FixtureLocalElements
include SemnotAge232FixtureExternalElements

context Patient

/* REFACTOR:grounded (#320, reviewed 557): reserved v1 publication selection helpers. */
define function "__CRL_PublicationSelection_v1_ValidityState"(raw System.String):
  if raw is null then 'missing'
  else if not Matches(raw, '\\A[0-9]{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01])(T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)([.][0-9]+)?(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?)?)?\\z')
    or Substring(raw, 0, 4) = '0000'
    or ToDateTime(Substring(raw, 0, 10)) is null then 'invalid'
  else if Substring(raw, 17, 2) = '60'
    or Matches(raw, '\\A.*[.][0-9]{3}[0-9]*[1-9][0-9]*(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00))\\z') then 'unsupported'
  else 'supported'

/* Full zoned seconds are exact instants in the shared TS comparator. Normalize only comparison
 * precision to milliseconds; never rewrite the candidate's authored validity or resource. */
define function "__CRL_PublicationSelection_v1_ComparisonValue"(raw System.String):
  if Length(raw) > 10 and Substring(raw, 19, 1) != '.' then
    ToDateTime(Substring(raw, 0, 19) + '.000' + Substring(raw, 19))
  else ToDateTime(raw)

/* Bounds cover every possible instant at the calendar's precision and FHIR's +/-14h zone range.
 * UTC is explicit. At year-domain edges null means unbounded for comparison, never missing validity.
 * FHIR rejects years outside 1..9999: no valid instant can precede the first calendar's earliest
 * bound or reach the final calendar's exclusive upper bound. These null edges therefore agree
 * with the finite TS bounds, which can be represented in JS comparison years 0/10000.
 * These computational bounds are never written to a candidate or exposed as its clinical time. */
define function "__CRL_PublicationSelection_v1_CalendarStart"(raw System.String):
  DateTime(ToInteger(Substring(raw, 0, 4)),
    if Length(raw) >= 7 then ToInteger(Substring(raw, 5, 2)) else 1,
    if Length(raw) = 10 then ToInteger(Substring(raw, 8, 2)) else 1,
    0, 0, 0, 0, 0)

define function "__CRL_PublicationSelection_v1_CalendarLower"(raw System.String):
  if "__CRL_PublicationSelection_v1_CalendarStart"(raw) = DateTime(1, 1, 1, 0, 0, 0, 0, 0) then null as System.DateTime
  else "__CRL_PublicationSelection_v1_CalendarStart"(raw) - 14 hours

define function "__CRL_PublicationSelection_v1_CalendarNextStart"(raw System.String):
  if raw in { '9999', '9999-12', '9999-12-31' } then null as System.DateTime
  else if Length(raw) = 4 then "__CRL_PublicationSelection_v1_CalendarStart"(raw) + 1 year
  else if Length(raw) = 7 then "__CRL_PublicationSelection_v1_CalendarStart"(raw) + 1 month
  else "__CRL_PublicationSelection_v1_CalendarStart"(raw) + 1 day

define function "__CRL_PublicationSelection_v1_CalendarUpper"(raw System.String):
  if "__CRL_PublicationSelection_v1_CalendarNextStart"(raw) is null then null as System.DateTime
  else "__CRL_PublicationSelection_v1_CalendarNextStart"(raw) + 14 hours

define function "__CRL_PublicationSelection_v1_MixedCompare"(calendar System.String, instant System.DateTime):
  if "__CRL_PublicationSelection_v1_CalendarLower"(calendar) is not null and instant < "__CRL_PublicationSelection_v1_CalendarLower"(calendar) then 'after'
  else if "__CRL_PublicationSelection_v1_CalendarUpper"(calendar) is not null and instant >= "__CRL_PublicationSelection_v1_CalendarUpper"(calendar) then 'before'
  else 'indeterminate'

define function "__CRL_PublicationSelection_v1_Compare"(left System.String, right System.String):
  if "__CRL_PublicationSelection_v1_ValidityState"(left) = 'invalid' or "__CRL_PublicationSelection_v1_ValidityState"(right) = 'invalid' then 'invalid'
  else if left is null or right is null then 'indeterminate'
  else if "__CRL_PublicationSelection_v1_ValidityState"(left) = 'unsupported' or "__CRL_PublicationSelection_v1_ValidityState"(right) = 'unsupported' then 'unsupported'
  else if Length(left) <= 10 and Length(right) > 10 then "__CRL_PublicationSelection_v1_MixedCompare"(left, "__CRL_PublicationSelection_v1_ComparisonValue"(right))
  else if Length(right) <= 10 and Length(left) > 10 then
    case "__CRL_PublicationSelection_v1_MixedCompare"(right, "__CRL_PublicationSelection_v1_ComparisonValue"(left))
      when 'before' then 'after'
      when 'after' then 'before'
      else 'indeterminate'
    end
  else if "__CRL_PublicationSelection_v1_ComparisonValue"(left) > "__CRL_PublicationSelection_v1_ComparisonValue"(right) then 'after'
  else if "__CRL_PublicationSelection_v1_ComparisonValue"(left) < "__CRL_PublicationSelection_v1_ComparisonValue"(right) then 'before'
  else if "__CRL_PublicationSelection_v1_ComparisonValue"(left) = "__CRL_PublicationSelection_v1_ComparisonValue"(right) then 'equal'
  else 'indeterminate'

define function "__CRL_PublicationSelection_v1_Result"(state System.String, failureCode System.String, conceptId System.String, selected Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, affected List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>):
  Tuple {
    state: state,
    failureCode: failureCode,
    failureMessage: if failureCode is null then null as System.String
      else failureCode + ' in ' + conceptId + ': ' + Combine((affected C return all C.key), ', ')
        + (if failureCode != 'publication-incomparable-validity' then ''
          else if exists (affected C where exists (affected D
            where "__CRL_PublicationSelection_v1_Compare"(C.validity, D.validity) = 'unsupported' return all D) return all C)
            then ': unsupported comparison of validity; correct or exclude the unsupported input'
          else ': overlapping precision of validity; equal-time preference does not resolve overlap'),
    conceptId: conceptId,
    selected: selected,
    affected: affected
  }

define function "__CRL_PublicationSelection_v1_Fail"(failureCode System.String, conceptId System.String, affected List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>):
  "__CRL_PublicationSelection_v1_Result"('failed', failureCode, conceptId, null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String },
    (affected C return all C sort by key, contributorId, arm, retrievedInputIdentity, validity))

define function "__CRL_PublicationSelection_v1_Choose"(latest List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, conceptId System.String, equalTime System.String):
  if Count(latest) = 1 then "__CRL_PublicationSelection_v1_Result"('selected', null, conceptId, singleton from latest, {} as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>)
  else if equalTime = 'preferLocal' and Count(latest C where C.arm = 'local' return all C) = 1 then
    "__CRL_PublicationSelection_v1_Result"('selected', null, conceptId, singleton from (latest C where C.arm = 'local' return all C), {} as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>)
  else "__CRL_PublicationSelection_v1_Fail"('publication-ambiguous-selection', conceptId, latest)

define function "__CRL_PublicationSelection_v1_Latest"(candidates List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, conceptId System.String, equalTime System.String):
  if not exists (candidates C
    where not exists (candidates D where not ("__CRL_PublicationSelection_v1_Compare"(C.validity, D.validity) in { 'after', 'equal' }) return all D)
    return all C) then "__CRL_PublicationSelection_v1_Fail"('publication-incomparable-validity', conceptId, candidates)
  else "__CRL_PublicationSelection_v1_Choose"(
    (candidates C where not exists (candidates D where not ("__CRL_PublicationSelection_v1_Compare"(C.validity, D.validity) in { 'after', 'equal' }) return all D) return all C),
    conceptId, equalTime)

define function "__CRL_PublicationSelection_v1_Select"(candidates List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, conceptId System.String, equalTime System.String):
  if exists (candidates C where C.validity is not null and "__CRL_PublicationSelection_v1_ValidityState"(C.validity) = 'invalid' return all C) then
    "__CRL_PublicationSelection_v1_Fail"('publication-invalid-validity', conceptId,
      (candidates C where C.validity is not null and "__CRL_PublicationSelection_v1_ValidityState"(C.validity) = 'invalid' return all C))
  else if exists (candidates C where C.arm != 'inferred' and (C.retrievedInputIdentity is null or C.retrievedInputIdentity = '') return all C) then
    "__CRL_PublicationSelection_v1_Fail"('publication-missing-input-identity', conceptId,
      (candidates C where C.arm != 'inferred' and (C.retrievedInputIdentity is null or C.retrievedInputIdentity = '') return all C))
  else if exists (candidates C where
    Count(candidates D where D.key = C.key return all D) > 1
    or (C.retrievedInputIdentity is not null and Count(candidates D where D.contributorId = C.contributorId and D.retrievedInputIdentity = C.retrievedInputIdentity return all D) > 1)
    return all C) then
    "__CRL_PublicationSelection_v1_Fail"('publication-duplicate-input', conceptId,
      (candidates C where Count(candidates D where D.key = C.key return all D) > 1
        or (C.retrievedInputIdentity is not null and Count(candidates D where D.contributorId = C.contributorId and D.retrievedInputIdentity = C.retrievedInputIdentity return all D) > 1) return all C))
  else if Count(candidates) = 0 then "__CRL_PublicationSelection_v1_Result"('missing', null, conceptId, null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, {} as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>)
  else if Count(candidates) = 1 then "__CRL_PublicationSelection_v1_Result"('selected', null, conceptId, singleton from candidates, {} as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>)
  else if exists (candidates C where C.validity is null return all C) then
    "__CRL_PublicationSelection_v1_Fail"('publication-undated-input', conceptId, (candidates C where C.validity is null return all C))
  else "__CRL_PublicationSelection_v1_Latest"(candidates, conceptId, equalTime)

define function "__CRL_PublicationSelection_v1_Record"(result Tuple { state System.String, failureCode System.String, failureMessage System.String, conceptId System.String, selected Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, affected List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }> }):
  if result.state = 'failed' then
    Message(null as FHIR.Observation, true, result.failureCode, 'Error', result.failureMessage)
  else if result.state = 'selected' then result.selected.resource
  else null as FHIR.Observation


/* REFACTOR:grounded (#320, review 560): observable invalid choices fail before casting. */
define function "__CRL_PublicationSelection_v1_NativeValidity"(D System.DateTime):
  if D is null then null as System.String
  else if (hour from D) is null then ToString(D)
  else if (second from D) is null then
    Message(null as System.String, true, 'publication-incomparable-validity', 'Error', 'A time component requires complete seconds')
  else ToString(DateTime(year from D, month from D, day from D,
    hour from D, minute from D, second from D,
    Coalesce(millisecond from D, 0), timezoneoffset from D))

define function "__CRL_PublicationSelection_v1_LocalBooleanCandidate"(O FHIR.Observation, contributorId System.String, conceptId System.String):
  if O.status.value is null or not (O.status.value in { 'registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown' }) then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-invalid-status', 'Error', conceptId + ': Expected a present, valid FHIR Observation status')
  else if O.status.value in { 'entered-in-error', 'cancelled' } then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-invalidated-record', 'Error', conceptId + ': Explicitly invalidated or cancelled candidates need an authored eligibility policy')
  else if O.value is not null and not (O.value is FHIR.boolean) then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-invalid-value', 'Error', conceptId + ': A present answer must be a FHIR boolean; absence remains unknown')
  else if O.effective is not null and not (O.effective is FHIR.dateTime) then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-invalid-validity-choice', 'Error', conceptId + ': This publication accepts effectiveDateTime or absent validity')
  else Tuple {
    key: if O.id.value is null or O.id.value = '' then 'Observation/<missing-id>' else 'Observation/' + O.id.value,
    contributorId: contributorId,
    arm: 'local',
    retrievedInputIdentity: if O.id.value is null or O.id.value = '' then null as System.String else 'Observation/' + O.id.value,
    resource: O,
    validity: "__CRL_PublicationSelection_v1_NativeValidity"((O.effective as FHIR.dateTime).value)
  }

define function "__CRL_PublicationSelection_v1_LocalCodeableCandidate"(O FHIR.Observation, contributorId System.String, conceptId System.String):
  if O.status.value is null or not (O.status.value in { 'registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown' }) then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-invalid-status', 'Error', conceptId + ': Expected a present, valid FHIR Observation status')
  else if O.status.value in { 'entered-in-error', 'cancelled' } then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-invalidated-record', 'Error', conceptId + ': Explicitly invalidated or cancelled candidates need an authored eligibility policy')
  else if O.value is not null and not (O.value is FHIR.CodeableConcept) then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-invalid-value', 'Error', conceptId + ': A present answer must be a FHIR CodeableConcept; absence remains unknown')
  else if O.effective is not null and not (O.effective is FHIR.dateTime) then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-invalid-validity-choice', 'Error', conceptId + ': This publication accepts effectiveDateTime or absent validity')
  else Tuple {
    key: if O.id.value is null or O.id.value = '' then 'Observation/<missing-id>' else 'Observation/' + O.id.value,
    contributorId: contributorId,
    arm: 'local',
    retrievedInputIdentity: if O.id.value is null or O.id.value = '' then null as System.String else 'Observation/' + O.id.value,
    resource: O,
    validity: "__CRL_PublicationSelection_v1_NativeValidity"((O.effective as FHIR.dateTime).value)
  }

/* REFACTOR:grounded (#320, review 564): explicit supported source state; no exclusion or false fallback. */
define function "__CRL_PublicationSelection_v1_ServiceRequestCandidate"(S FHIR.ServiceRequest, contributorId System.String,
  conceptId System.String, code FHIR.CodeableConcept, profile System.String, subjectReference System.String):
  if S.status.value is null or S.status.value != 'active' or S.intent.value is null or S.intent.value != 'order'
    or S.doNotPerform.value = true or (S.doNotPerform is not null and S.doNotPerform.value is null)
    or exists(S.modifierExtension) then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-source-state-unsupported', 'Error', conceptId + ': This source projection supports active order requests without prohibition or modifier extensions; other states need an authored eligibility policy')
  else if subjectReference is null or S.subject.reference.value is null
    or not Matches(S.subject.reference.value, '\\A(https?://[^?#]+/)?Patient/[A-Za-z0-9.-]{1,64}(/_history/[A-Za-z0-9.-]{1,64})?\\z')
    or ('Patient/' + Last(Split(
      if PositionOf('/_history/', S.subject.reference.value) >= 0
        then Substring(S.subject.reference.value, 0, PositionOf('/_history/', S.subject.reference.value))
        else S.subject.reference.value, '/'))) != subjectReference then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-source-subject-unsupported', 'Error', conceptId + ': The source must resolve to the current evaluation Patient')
  else if S.id.value is null or not Matches(S.id.value, '\\A[A-Za-z0-9.-]{1,64}\\z') then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-missing-input-identity', 'Error', conceptId + ': A retrieved ServiceRequest requires a valid FHIR id in this dataset')
  else if profile is null then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-source-profile-required', 'Error', conceptId + ': A source-produced Case Feature requires its profile')
  else Tuple {
    key: ToString(Length(contributorId)) + ':' + contributorId + ToString(Length('ServiceRequest/' + S.id.value)) + ':' + 'ServiceRequest/' + S.id.value,
    contributorId: contributorId, arm: 'source', retrievedInputIdentity: 'ServiceRequest/' + S.id.value,
    resource: FHIR.Observation {
      status: FHIR.ObservationStatus { value: 'final' },
      subject: FHIR.Reference { reference: FHIR.string { value: subjectReference } },
      meta: FHIR.Meta { profile: { FHIR.canonical { value: profile } } },
      code: code, value: FHIR.boolean { value: true }, effective: S.authoredOn
    },
    validity: "__CRL_PublicationSelection_v1_NativeValidity"(S.authoredOn.value)
  }

define function "__CRL_AgeToday_v1_Value"(age System.Integer, op System.String, threshold System.Decimal):
  if op = 'AtLeast' then age >= threshold else if op = 'AtMost' then age <= threshold else age < threshold

define function "__CRL_AgeToday_v1_Method"(O FHIR.Observation):
  if Count(O.method.coding C where C.system.value = 'urn:crl:determination-method:v1') = 1 then
    singleton from (O.method.coding C where C.system.value = 'urn:crl:determination-method:v1' return all C.code.value)
  else null as System.String

define function "__CRL_AgeToday_v1_Day"(raw System.String, offsetHours System.Decimal):
  if raw is null or Length(raw) < 10 then null as System.Date
  else if Length(raw) = 10 then ToDate(raw)
  else date from (ToDateTime(raw) + System.Quantity { value: (offsetHours - (timezoneoffset from ToDateTime(raw))) * 60.0, unit: 'minutes' })

define function "__CRL_AgeToday_v1_DayRelation"(raw System.String, evaluationDay System.Date, offsetHours System.Decimal):
  if raw is null then 'unknown'
  else if Length(raw) < 10 then
    if raw < Substring(ToString(evaluationDay), 0, Length(raw)) then 'past'
    else if raw > Substring(ToString(evaluationDay), 0, Length(raw)) then 'future'
    else 'unknown'
  else if "__CRL_AgeToday_v1_Day"(raw, offsetHours) < evaluationDay then 'past'
  else if "__CRL_AgeToday_v1_Day"(raw, offsetHours) > evaluationDay then 'future'
  else 'same'

define function "__CRL_AgeToday_v1_Produce"(P FHIR.Patient, contributorId System.String, conceptId System.String,
  code FHIR.CodeableConcept, profile System.String, subjectReference System.String,
  op System.String, unit System.String, threshold System.Decimal, evaluationDay System.Date):
  if P.id.value is null or not Matches(P.id.value, '\\A[A-Za-z0-9.-]{1,64}\\z') then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-missing-input-identity', 'Error', conceptId + ': Age source requires a valid Patient id')
  else if 'Patient/' + P.id.value != subjectReference then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-source-subject-unsupported', 'Error', conceptId + ': Age must use the evaluation Patient')
  else if exists(P.modifierExtension) then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-source-state-unsupported', 'Error', conceptId + ': Qualified Patient data requires a supported interpretation')
  else if P.birthDate.value is null then null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }
  else if Date(year from P.birthDate.value, Coalesce(month from P.birthDate.value, 1), Coalesce(day from P.birthDate.value, 1)) > evaluationDay then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, 'publication-age-future-birthdate', 'Error', conceptId + ': Patient birthDate is after the evaluation date')
  else if (day from P.birthDate.value) is null then null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }
  else Tuple {
    key: ToString(Length(contributorId)) + ':' + contributorId + ToString(Length('Patient/' + P.id.value)) + ':' + 'Patient/' + P.id.value,
    contributorId: contributorId, arm: 'source', retrievedInputIdentity: 'Patient/' + P.id.value,
    validity: ToString(evaluationDay),
    resource: FHIR.Observation {
      status: FHIR.ObservationStatus { value: 'final' },
      subject: FHIR.Reference { reference: FHIR.string { value: subjectReference } },
      meta: if profile is null then null as FHIR.Meta else FHIR.Meta { profile: { FHIR.canonical { value: profile } } },
      code: code, effective: FHIR.dateTime { value: ToDateTime(evaluationDay) },
      method: FHIR.CodeableConcept { coding: { FHIR.Coding { system: FHIR.uri { value: 'urn:crl:determination-method:v1' }, code: FHIR.code { value: 'calculated' } } } },
      value: FHIR.boolean { value: "__CRL_AgeToday_v1_Value"(
        if unit = 'months' then duration in months between P.birthDate.value and evaluationDay else duration in years between P.birthDate.value and evaluationDay, op, threshold) }
    }
  }

define function "__CRL_AgeToday_v1_Choose"(assertions List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, calculations List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, evaluationDay System.Date, offsetHours System.Decimal, conceptId System.String):
  if not exists(calculations) then assertions
  else if exists(assertions C where "__CRL_AgeToday_v1_DayRelation"(C.validity, evaluationDay, offsetHours) = 'unknown') then
    Message(null as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, true, 'publication-age-day-unknown', 'Error', conceptId + ': Cannot determine same-day assertion eligibility')
  else if exists(assertions C where "__CRL_AgeToday_v1_Day"(C.validity, offsetHours) = evaluationDay) then
    (assertions C where "__CRL_AgeToday_v1_Day"(C.validity, offsetHours) = evaluationDay)
  else calculations

define function "__CRL_AgeToday_v1_Eligible"(candidates List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, evaluationDay System.Date, offsetHours System.Decimal, conceptId System.String):
  if exists(candidates C where "__CRL_PublicationSelection_v1_ValidityState"(C.validity) = 'invalid') then
    Message(null as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, true, 'publication-invalid-validity', 'Error', conceptId + ': Malformed age validity')
  else if exists(candidates C where C.retrievedInputIdentity is null or C.retrievedInputIdentity = '') then
    Message(null as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, true, 'publication-missing-input-identity', 'Error', conceptId + ': Age input requires an identity')
  else if exists(candidates C where exists(C.resource.modifierExtension)) then
    Message(null as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, true, 'publication-source-state-unsupported', 'Error', conceptId + ': Qualified age input requires a supported interpretation')
  else if exists(candidates C where Count(candidates D where D.key = C.key or (D.contributorId = C.contributorId and D.retrievedInputIdentity = C.retrievedInputIdentity)) > 1) then
    Message(null as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, true, 'publication-duplicate-input', 'Error', conceptId + ': Repeated age input identity')
  else if exists(candidates C where Count(C.resource.method.coding M where M.system.value = 'urn:crl:determination-method:v1') != 1
    or not Coalesce("__CRL_AgeToday_v1_Method"(C.resource) in { 'asserted', 'calculated' }, false)) then
    Message(null as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, true, 'publication-age-method-required', 'Error', conceptId + ': Age inputs require exactly one asserted or calculated determination method')
  else if exists(candidates C where "__CRL_AgeToday_v1_DayRelation"(C.validity, evaluationDay, offsetHours) = 'future') then
    Message(null as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, true, 'publication-age-future-input', 'Error', conceptId + ': Age input is dated after the evaluation day')
  else if exists(candidates C where "__CRL_AgeToday_v1_Method"(C.resource) = 'calculated' and "__CRL_AgeToday_v1_DayRelation"(C.validity, evaluationDay, offsetHours) = 'unknown') then
    Message(null as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, true, 'publication-age-day-unknown', 'Error', conceptId + ': Cannot determine whether a cached calculation is current')
  else "__CRL_AgeToday_v1_Choose"(
    (candidates C where "__CRL_AgeToday_v1_Method"(C.resource) = 'asserted'),
    if exists(candidates C where C.arm = 'source') then (candidates C where C.arm = 'source')
      else (candidates C where "__CRL_AgeToday_v1_Method"(C.resource) = 'calculated' and "__CRL_AgeToday_v1_Day"(C.validity, offsetHours) = evaluationDay),
    evaluationDay, offsetHours, conceptId)

define "__CRL_PublicationEnvelope_v1_Age 21 Or Older":
  "__CRL_PublicationSelection_v1_Select"("__CRL_AgeToday_v1_Eligible"(Flatten({ ((SemnotAge232FixtureLocalElements."Age 21 Or Older Records") O return all "__CRL_PublicationSelection_v1_LocalBooleanCandidate"(O, 'http://example.org/crl/semnot-age-232/CodeSystem/semnot-age-232-fixture-local#age-21-or-older/local', 'http://example.org/crl/semnot-age-232/CodeSystem/semnot-age-232-fixture-local#age-21-or-older')), (((SemnotAge232FixtureExternalElements."Age 21 Or Older Source 1") S return all "__CRL_AgeToday_v1_Produce"(S, 'crl:source:v1:%5B%22http%3A%2F%2Fexample.org%2Fcrl%2Fsemnot-age-232%22%2C%22semnot-age-232-fixture%22%2C%22Semnot%20Age%20232%22%2C%22semnot-age-232-fixture%22%2C%221.0.0%22%2C%22Age%2021%20Or%20Older%22%2C%5B%22source%22%2C0%5D%5D', 'http://example.org/crl/semnot-age-232/CodeSystem/semnot-age-232-fixture-local#age-21-or-older', FHIR.CodeableConcept { text: FHIR.string { value: 'Age 21 Or Older' }, coding: { FHIR.Coding { system: FHIR.uri { value: 'http://example.org/crl/semnot-age-232/CodeSystem/semnot-age-232-fixture-local' }, code: FHIR.code { value: 'age-21-or-older' } } } }, 'http://example.org/crl/semnot-age-232/StructureDefinition/semnot-age-232-fixture-age-21-or-older', 'Patient/' + Patient.id.value, 'AtLeast', 'years', 21.0, Today())) C where C is not null) }), Today(), timezoneoffset from Now(), 'http://example.org/crl/semnot-age-232/CodeSystem/semnot-age-232-fixture-local#age-21-or-older'), 'http://example.org/crl/semnot-age-232/CodeSystem/semnot-age-232-fixture-local#age-21-or-older', 'error')

define "Age 21 Or Older":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Age 21 Or Older")
