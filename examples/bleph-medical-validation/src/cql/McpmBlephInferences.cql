library McpmBlephInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include McpmBlephLocalElements
include McpmBlephExternalElements

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

/* REFACTOR:grounded (#320, review 562): unary membership consumes the selected operand envelope. */
define function "__CRL_PublicationProducer_v1_ConstructBoolean"(code FHIR.CodeableConcept, datum System.Boolean, profile System.String, operand FHIR.Observation, subjectReference System.String):
  if subjectReference is null or subjectReference = '' then
    Message(null as FHIR.Observation, true, 'publication-missing-subject', 'Error', 'A produced Observation requires an evaluation subject')
  else FHIR.Observation {
    status: FHIR.ObservationStatus { value: 'final' },
    code: code,
    value: if datum is null then null as FHIR.boolean else FHIR.boolean { value: datum },
    subject: FHIR.Reference { reference: FHIR.string { value: subjectReference } },
    meta: if profile is null then null as FHIR.Meta else FHIR.Meta { profile: { FHIR.canonical { value: profile } } },
    effective: operand.effective as FHIR.dateTime,
    derivedFrom: if operand.id.value is null or not Matches(operand.id.value, '^[A-Za-z0-9.-]{1,64}$') then {} as List<FHIR.Reference>
      else { FHIR.Reference { reference: FHIR.string { value: 'Observation/' + operand.id.value } } }
  }

define function "__CRL_PublicationProducer_v1_Recognized"(value FHIR.CodeableConcept, domain List<Tuple { system System.String, code System.String }>):
  value.coding C where exists (domain D where D.system = C.system.value and D.code = C.code.value)

define function "__CRL_PublicationProducer_v1_Interpret"(publication Tuple { state System.String, failureCode System.String, failureMessage System.String, conceptId System.String, selected Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, affected List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }> }, domain List<Tuple { system System.String, code System.String }>):
  if publication.state != 'selected' or publication.selected.resource.value is null then publication
  else if exists ("__CRL_PublicationProducer_v1_Recognized"(publication.selected.resource.value as FHIR.CodeableConcept, domain)) then publication
  else "__CRL_PublicationSelection_v1_Fail"('publication-uninterpretable-value', publication.conceptId, { publication.selected })

/* Interpret is the selected operand's domain authority. This repeated check protects the
   compiler helper invariant when Candidate/Classify receives a direct or foreign envelope. */
define function "__CRL_PublicationProducer_v1_Classify"(value FHIR.CodeableConcept, domain List<Tuple { system System.String, code System.String }>, qualifying List<Tuple { system System.String, code System.String }>, conceptId System.String):
  if value is null then null as System.Boolean
  else if not exists (from ((value).coding) C where exists ((domain) D where D.system = C.system.value and D.code = C.code.value)) then
    Message(null as System.Boolean, true, 'publication-uninterpretable-value', 'Error', conceptId + ': No recognized domain coding')
  else if exists (from ((value).coding) C where exists ((domain) D where D.system = C.system.value and D.code = C.code.value) and exists ((qualifying) Q where Q.system = C.system.value and Q.code = C.code.value)) and exists (from ((value).coding) C where exists ((domain) D where D.system = C.system.value and D.code = C.code.value) and not exists ((qualifying) Q where Q.system = C.system.value and Q.code = C.code.value)) then
    Message(null as System.Boolean, true, 'publication-ambiguous-coded-value', 'Error', conceptId + ': Recognized codings disagree')
  else exists (from ((value).coding) C where exists ((domain) D where D.system = C.system.value and D.code = C.code.value) and exists ((qualifying) Q where Q.system = C.system.value and Q.code = C.code.value))

define function "__CRL_PublicationProducer_v1_Candidate"(operand Tuple { state System.String, failureCode System.String, failureMessage System.String, conceptId System.String, selected Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, affected List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }> }, producerId System.String, code FHIR.CodeableConcept,
  profile System.String, domain List<Tuple { system System.String, code System.String }>, qualifying List<Tuple { system System.String, code System.String }>, conceptId System.String, subjectReference System.String):
  if operand.state = 'failed' then
    Message(null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }, true, operand.failureCode, 'Error', operand.failureMessage)
  else if operand.state != 'selected' then null as Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }
  else Tuple {
    key: ToString(Length(producerId)) + ':' + producerId + ToString(Length(operand.selected.key)) + ':' + operand.selected.key,
    contributorId: producerId,
    arm: 'inferred',
    retrievedInputIdentity: null as System.String,
    resource: "__CRL_PublicationProducer_v1_ConstructBoolean"(code, "__CRL_PublicationProducer_v1_Classify"(operand.selected.resource.value as FHIR.CodeableConcept, domain, qualifying, conceptId), profile, operand.selected.resource, subjectReference),
    validity: operand.selected.validity
  }

define "__CRL_PublicationEnvelope_v1_Blepharoplasty Requested":
  "__CRL_PublicationSelection_v1_Select"(Flatten({ ((McpmBlephLocalElements."Blepharoplasty Requested Records") O return all "__CRL_PublicationSelection_v1_LocalBooleanCandidate"(O, 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoplasty-requested/local', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoplasty-requested')), ((McpmBlephExternalElements."Blepharoplasty Requested Source 1") S return all "__CRL_PublicationSelection_v1_ServiceRequestCandidate"(S, 'crl:source:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Blepharoplasty%20Requested%22%2C%5B%22source%22%2C0%5D%5D', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoplasty-requested', FHIR.CodeableConcept { text: FHIR.string { value: 'Blepharoplasty Requested' }, coding: { FHIR.Coding { system: FHIR.uri { value: 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local' }, code: FHIR.code { value: 'blepharoplasty-requested' } } } }, 'http://iehp.org/crl/StructureDefinition/mcpm-bleph-blepharoplasty-requested', 'Patient/' + Patient.id.value)) }), 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoplasty-requested', 'preferLocal')

define "Blepharoplasty Requested":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Blepharoplasty Requested")

define "__CRL_PublicationEnvelope_v1_Blepharoptosis Repair Requested":
  "__CRL_PublicationSelection_v1_Select"(Flatten({ ((McpmBlephLocalElements."Blepharoptosis Repair Requested Records") O return all "__CRL_PublicationSelection_v1_LocalBooleanCandidate"(O, 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoptosis-repair-requested/local', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoptosis-repair-requested')), ((McpmBlephExternalElements."Blepharoptosis Repair Requested Source 1") S return all "__CRL_PublicationSelection_v1_ServiceRequestCandidate"(S, 'crl:source:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Blepharoptosis%20Repair%20Requested%22%2C%5B%22source%22%2C0%5D%5D', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoptosis-repair-requested', FHIR.CodeableConcept { text: FHIR.string { value: 'Blepharoptosis Repair Requested' }, coding: { FHIR.Coding { system: FHIR.uri { value: 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local' }, code: FHIR.code { value: 'blepharoptosis-repair-requested' } } } }, 'http://iehp.org/crl/StructureDefinition/mcpm-bleph-blepharoptosis-repair-requested', 'Patient/' + Patient.id.value)) }), 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoptosis-repair-requested', 'preferLocal')

define "Blepharoptosis Repair Requested":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Blepharoptosis Repair Requested")

define "__CRL_PublicationEnvelope_v1_Cosmetic Surgical Purpose":
  "__CRL_PublicationSelection_v1_Select"(((McpmBlephLocalElements."Cosmetic Surgical Purpose Records") O return all "__CRL_PublicationSelection_v1_LocalBooleanCandidate"(O, 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#performed-for-cosmetic-purposes/local', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#performed-for-cosmetic-purposes')), 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#performed-for-cosmetic-purposes', 'error')

define "Cosmetic Surgical Purpose":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Cosmetic Surgical Purpose")

define "__CRL_PublicationEnvelope_v1_Functional Or Reconstructive Surgical Indication":
  "__CRL_PublicationProducer_v1_Interpret"("__CRL_PublicationSelection_v1_Select"(((McpmBlephLocalElements."Functional Or Reconstructive Surgical Indication Records") O return all "__CRL_PublicationSelection_v1_LocalCodeableCandidate"(O, 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#functional-or-reconstructive-surgery-performed-to-correct-indication/local', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#functional-or-reconstructive-surgery-performed-to-correct-indication')), 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#functional-or-reconstructive-surgery-performed-to-correct-indication', 'error'), { Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'chronic-symptomatic-dermatitis-of-pretarsal-skin-caused-by-redundant-upper-lid-skin' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'near-or-far-vision-impairment-due-to-blepharochalasis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'near-or-far-vision-impairment-due-to-blepharoptosis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'near-or-far-vision-impairment-due-to-dermatochalasis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'none-of-the-listed-indications' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'prosthesis-difficulties-in-an-anophthalmic-socket' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'symptomatic-redundant-skin-weighing-down-upper-lashes' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'visual-field-defect-due-to-blepharochalasis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'visual-field-defect-due-to-blepharoptosis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'visual-field-defect-due-to-dermatochalasis' } })

define "Functional Or Reconstructive Surgical Indication":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Functional Or Reconstructive Surgical Indication")

define "__CRL_PublicationEnvelope_v1_Qualifying Functional Indication Selected":
  "__CRL_PublicationSelection_v1_Select"(Flatten({ {} as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, (({ "__CRL_PublicationProducer_v1_Candidate"("__CRL_PublicationEnvelope_v1_Functional Or Reconstructive Surgical Indication", 'crl:producer:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Qualifying%20Functional%20Indication%20Selected%22%2C%5B%22membership%22%2C0%5D%5D', FHIR.CodeableConcept { text: FHIR.string { value: 'Qualifying Functional Indication Selected' } }, null as System.String, { Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'chronic-symptomatic-dermatitis-of-pretarsal-skin-caused-by-redundant-upper-lid-skin' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'near-or-far-vision-impairment-due-to-blepharochalasis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'near-or-far-vision-impairment-due-to-blepharoptosis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'near-or-far-vision-impairment-due-to-dermatochalasis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'none-of-the-listed-indications' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'prosthesis-difficulties-in-an-anophthalmic-socket' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'symptomatic-redundant-skin-weighing-down-upper-lashes' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'visual-field-defect-due-to-blepharochalasis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'visual-field-defect-due-to-blepharoptosis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'visual-field-defect-due-to-dermatochalasis' } }, { Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'chronic-symptomatic-dermatitis-of-pretarsal-skin-caused-by-redundant-upper-lid-skin' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'near-or-far-vision-impairment-due-to-blepharochalasis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'near-or-far-vision-impairment-due-to-blepharoptosis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'near-or-far-vision-impairment-due-to-dermatochalasis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'prosthesis-difficulties-in-an-anophthalmic-socket' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'symptomatic-redundant-skin-weighing-down-upper-lashes' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'visual-field-defect-due-to-blepharochalasis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'visual-field-defect-due-to-blepharoptosis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-a54eec6c1900-answer-codes', code: 'visual-field-defect-due-to-dermatochalasis' } }, 'crl:concept:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Qualifying%20Functional%20Indication%20Selected%22%5D', 'Patient/' + Patient.id.value) }) C where C is not null) }), 'crl:concept:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Qualifying%20Functional%20Indication%20Selected%22%5D', 'error')

define "Qualifying Functional Indication Selected":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Qualifying Functional Indication Selected")

define "__CRL_PublicationEnvelope_v1_Documented Patient Complaint":
  "__CRL_PublicationProducer_v1_Interpret"("__CRL_PublicationSelection_v1_Select"(((McpmBlephLocalElements."Documented Patient Complaint Records") O return all "__CRL_PublicationSelection_v1_LocalCodeableCandidate"(O, 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#documented-patient-complaint/local', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#documented-patient-complaint')), 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#documented-patient-complaint', 'error'), { Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-chronic-blepharitis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-chronic-dermatitis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-difficulty-seeing-due-to-looking-through-the-eyelashes' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-difficulty-seeing-due-to-seeing-the-upper-eyelid-skin' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-difficulty-seeing-due-to-upper-eyelid-drooping' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-interference-with-near-or-distance-vision' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-interference-with-visual-field' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'none-of-the-listed-complaints' } })

define "Documented Patient Complaint":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Documented Patient Complaint")

define "__CRL_PublicationEnvelope_v1_Qualifying Patient Complaint Reported":
  "__CRL_PublicationSelection_v1_Select"(Flatten({ {} as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, (({ "__CRL_PublicationProducer_v1_Candidate"("__CRL_PublicationEnvelope_v1_Documented Patient Complaint", 'crl:producer:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Qualifying%20Patient%20Complaint%20Reported%22%2C%5B%22membership%22%2C0%5D%5D', FHIR.CodeableConcept { text: FHIR.string { value: 'Qualifying Patient Complaint Reported' } }, null as System.String, { Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-chronic-blepharitis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-chronic-dermatitis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-difficulty-seeing-due-to-looking-through-the-eyelashes' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-difficulty-seeing-due-to-seeing-the-upper-eyelid-skin' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-difficulty-seeing-due-to-upper-eyelid-drooping' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-interference-with-near-or-distance-vision' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-interference-with-visual-field' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'none-of-the-listed-complaints' } }, { Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-chronic-blepharitis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-chronic-dermatitis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-difficulty-seeing-due-to-looking-through-the-eyelashes' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-difficulty-seeing-due-to-seeing-the-upper-eyelid-skin' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-difficulty-seeing-due-to-upper-eyelid-drooping' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-interference-with-near-or-distance-vision' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-4ab684469e25-answer-codes', code: 'complaint-of-interference-with-visual-field' } }, 'crl:concept:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Qualifying%20Patient%20Complaint%20Reported%22%5D', 'Patient/' + Patient.id.value) }) C where C is not null) }), 'crl:concept:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Qualifying%20Patient%20Complaint%20Reported%22%5D', 'error')

define "Qualifying Patient Complaint Reported":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Qualifying Patient Complaint Reported")

define "__CRL_PublicationEnvelope_v1_Photographic Demonstration Submitted":
  "__CRL_PublicationProducer_v1_Interpret"("__CRL_PublicationSelection_v1_Select"(((McpmBlephLocalElements."Photographic Demonstration Submitted Records") O return all "__CRL_PublicationSelection_v1_LocalCodeableCandidate"(O, 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#photographic-demonstration-submitted/local', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#photographic-demonstration-submitted')), 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#photographic-demonstration-submitted', 'error'), { Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'none-of-the-listed-photographic-demonstrations' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'photograph-upper-eyelid-indicates-presence-of-dermatitis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'photograph-upper-eyelid-margin-within-2-5-mm-equivalent-to-quarter-iris-of-corneal-light-reflex' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'photograph-upper-eyelid-position-contributes-to-prosthesis-difficulty' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'photograph-upper-eyelid-skin-rests-on-the-eyelashes' } })

define "Photographic Demonstration Submitted":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Photographic Demonstration Submitted")

define "__CRL_PublicationEnvelope_v1_Qualifying Photographic Demonstration Shown":
  "__CRL_PublicationSelection_v1_Select"(Flatten({ {} as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, (({ "__CRL_PublicationProducer_v1_Candidate"("__CRL_PublicationEnvelope_v1_Photographic Demonstration Submitted", 'crl:producer:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Qualifying%20Photographic%20Demonstration%20Shown%22%2C%5B%22membership%22%2C0%5D%5D', FHIR.CodeableConcept { text: FHIR.string { value: 'Qualifying Photographic Demonstration Shown' } }, null as System.String, { Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'none-of-the-listed-photographic-demonstrations' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'photograph-upper-eyelid-indicates-presence-of-dermatitis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'photograph-upper-eyelid-margin-within-2-5-mm-equivalent-to-quarter-iris-of-corneal-light-reflex' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'photograph-upper-eyelid-position-contributes-to-prosthesis-difficulty' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'photograph-upper-eyelid-skin-rests-on-the-eyelashes' } }, { Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'photograph-upper-eyelid-indicates-presence-of-dermatitis' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'photograph-upper-eyelid-margin-within-2-5-mm-equivalent-to-quarter-iris-of-corneal-light-reflex' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'photograph-upper-eyelid-position-contributes-to-prosthesis-difficulty' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-1f64a73b6291-answer-codes', code: 'photograph-upper-eyelid-skin-rests-on-the-eyelashes' } }, 'crl:concept:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Qualifying%20Photographic%20Demonstration%20Shown%22%5D', 'Patient/' + Patient.id.value) }) C where C is not null) }), 'crl:concept:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Qualifying%20Photographic%20Demonstration%20Shown%22%5D', 'error')

define "Qualifying Photographic Demonstration Shown":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Qualifying Photographic Demonstration Shown")

define "__CRL_PublicationEnvelope_v1_Visual Field Demonstration Submitted":
  "__CRL_PublicationProducer_v1_Interpret"("__CRL_PublicationSelection_v1_Select"(((McpmBlephLocalElements."Visual Field Demonstration Submitted Records") O return all "__CRL_PublicationSelection_v1_LocalCodeableCandidate"(O, 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#visual-field-demonstration-submitted/local', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#visual-field-demonstration-submitted')), 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#visual-field-demonstration-submitted', 'error'), { Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-c19d8d02609d-answer-codes', code: 'none-of-the-listed-visual-field-demonstrations' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-c19d8d02609d-answer-codes', code: 'visual-field-at-least-12-degree-upper-field-loss-repose-and-elevated-demonstrating-potential-correction' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-c19d8d02609d-answer-codes', code: 'visual-field-at-least-30-percent-upper-field-loss-repose-and-elevated-demonstrating-potential-correction' } })

define "Visual Field Demonstration Submitted":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Visual Field Demonstration Submitted")

define "__CRL_PublicationEnvelope_v1_Qualifying Visual Field Demonstration Shown":
  "__CRL_PublicationSelection_v1_Select"(Flatten({ {} as List<Tuple { key System.String, contributorId System.String, arm System.String, retrievedInputIdentity System.String, resource FHIR.Observation, validity System.String }>, (({ "__CRL_PublicationProducer_v1_Candidate"("__CRL_PublicationEnvelope_v1_Visual Field Demonstration Submitted", 'crl:producer:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Qualifying%20Visual%20Field%20Demonstration%20Shown%22%2C%5B%22membership%22%2C0%5D%5D', FHIR.CodeableConcept { text: FHIR.string { value: 'Qualifying Visual Field Demonstration Shown' } }, null as System.String, { Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-c19d8d02609d-answer-codes', code: 'none-of-the-listed-visual-field-demonstrations' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-c19d8d02609d-answer-codes', code: 'visual-field-at-least-12-degree-upper-field-loss-repose-and-elevated-demonstrating-potential-correction' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-c19d8d02609d-answer-codes', code: 'visual-field-at-least-30-percent-upper-field-loss-repose-and-elevated-demonstrating-potential-correction' } }, { Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-c19d8d02609d-answer-codes', code: 'visual-field-at-least-12-degree-upper-field-loss-repose-and-elevated-demonstrating-potential-correction' }, Tuple { system: 'http://iehp.org/crl/CodeSystem/blepharoplasty-and-blepharoptosis-repa-c19d8d02609d-answer-codes', code: 'visual-field-at-least-30-percent-upper-field-loss-repose-and-elevated-demonstrating-potential-correction' } }, 'crl:concept:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Qualifying%20Visual%20Field%20Demonstration%20Shown%22%5D', 'Patient/' + Patient.id.value) }) C where C is not null) }), 'crl:concept:v1:%5B%22http%3A%2F%2Fiehp.org%2Fcrl%22%2C%22mcpm-bleph%22%2C%22Blepharoplasty%20And%20Blepharoptosis%20Repair%22%2C%22mcpm-bleph%22%2C%220.0.0%22%2C%22Qualifying%20Visual%20Field%20Demonstration%20Shown%22%5D', 'error')

define "Qualifying Visual Field Demonstration Shown":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Qualifying Visual Field Demonstration Shown")

define "__CRL_PublicationEnvelope_v1_Photograph Submission Standards Met":
  "__CRL_PublicationSelection_v1_Select"(((McpmBlephLocalElements."Photograph Submission Standards Met Records") O return all "__CRL_PublicationSelection_v1_LocalBooleanCandidate"(O, 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#submitted-photographs-conform-to-the-photograph-submission-standards/local', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#submitted-photographs-conform-to-the-photograph-submission-standards')), 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#submitted-photographs-conform-to-the-photograph-submission-standards', 'error')

define "Photograph Submission Standards Met":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Photograph Submission Standards Met")

define "__CRL_PublicationEnvelope_v1_Visual Field Examination Standards Met":
  "__CRL_PublicationSelection_v1_Select"(((McpmBlephLocalElements."Visual Field Examination Standards Met Records") O return all "__CRL_PublicationSelection_v1_LocalBooleanCandidate"(O, 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#submitted-visual-field-examination-conforms-to-the-examination-standards/local', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#submitted-visual-field-examination-conforms-to-the-examination-standards')), 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#submitted-visual-field-examination-conforms-to-the-examination-standards', 'error')

define "Visual Field Examination Standards Met":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Visual Field Examination Standards Met")

define "__CRL_PublicationEnvelope_v1_Individual Blepharoplasty Documentation":
  "__CRL_PublicationSelection_v1_Select"(((McpmBlephLocalElements."Individual Blepharoplasty Documentation Records") O return all "__CRL_PublicationSelection_v1_LocalBooleanCandidate"(O, 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoplasty-individually-documented/local', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoplasty-individually-documented')), 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoplasty-individually-documented', 'error')

define "Individual Blepharoplasty Documentation":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Individual Blepharoplasty Documentation")

define "__CRL_PublicationEnvelope_v1_Individual Blepharoptosis Repair Documentation":
  "__CRL_PublicationSelection_v1_Select"(((McpmBlephLocalElements."Individual Blepharoptosis Repair Documentation Records") O return all "__CRL_PublicationSelection_v1_LocalBooleanCandidate"(O, 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoptosis-repair-individually-documented/local', 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoptosis-repair-individually-documented')), 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local#blepharoptosis-repair-individually-documented', 'error')

define "Individual Blepharoptosis Repair Documentation":
  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Individual Blepharoptosis Repair Documentation")
