import { cqlStringLiteral } from "./cqlStrings";
import { PUBLICATION_CANDIDATE_CQL_TYPE, PUBLICATION_SELECTION_CQL_FUNCTIONS, PUBLICATION_SELECTION_RESULT_CQL_TYPE } from "./renderPublicationSelection";

// Compiler ABI names, not author-facing declarations. The raw name remains injective inside a quoted identifier.
export const PUBLICATION_ENVELOPE_PREFIX = "__CRL_PublicationEnvelope_v1_";
export const PUBLICATION_PRODUCER_PREFIX = "__CRL_PublicationProducer_v1_";
export const publicationEnvelopeName = (name: string): string => `${PUBLICATION_ENVELOPE_PREFIX}${name}`;
export const PUBLICATION_CODE_TABLE_TYPE = "List<Tuple { system System.String, code System.String }>";
export const PUBLICATION_PRODUCER_FUNCTIONS = Object.freeze({
  construct: `${PUBLICATION_PRODUCER_PREFIX}ConstructBoolean`,
  recognized: `${PUBLICATION_PRODUCER_PREFIX}Recognized`,
  interpret: `${PUBLICATION_PRODUCER_PREFIX}Interpret`,
  classify: `${PUBLICATION_PRODUCER_PREFIX}Classify`,
  candidate: `${PUBLICATION_PRODUCER_PREFIX}Candidate`,
});

/** Prepared finite pairs only: no terminology-provider call, stub, name lookup or pattern scan. */
export function renderPublicationCodeTable(codes: readonly { readonly system: string; readonly code: string }[]): string {
  if (codes.length === 0) return `{} as ${PUBLICATION_CODE_TABLE_TYPE}`;
  return `{ ${codes.map((code) => `Tuple { system: ${cqlStringLiteral(code.system)}, code: ${cqlStringLiteral(code.code)} }`).join(", ")} }`;
}

/** Shared classification for publication and legacy consumers; only recognized domain codes can decide. */
export function renderAnswerClassification(value: string, domain: string, qualifying: string, conceptId: string): string {
  const coding = `((${value}).coding)`;
  const inDomain = `exists ((${domain}) D where D.system = C.system.value and D.code = C.code.value)`;
  const inQualifying = `exists ((${qualifying}) Q where Q.system = C.system.value and Q.code = C.code.value)`;
  const recognized = `(from ${coding} C where ${inDomain})`;
  const positive = `exists (from ${coding} C where ${inDomain} and ${inQualifying})`;
  const negative = `exists (from ${coding} C where ${inDomain} and not ${inQualifying})`;
  return `if ${value} is null then null as System.Boolean
  else if not exists ${recognized} then
    Message(null as System.Boolean, true, 'publication-uninterpretable-value', 'Error', ${conceptId} + ': No recognized domain coding')
  else if ${positive} and ${negative} then
    Message(null as System.Boolean, true, 'publication-ambiguous-coded-value', 'Error', ${conceptId} + ': Recognized codings disagree')
  else ${positive}`;
}

/** One identical parameterized constructor for coded/uncoded, unknown/known and dated/undated producers. */
export function renderPublicationProducerHelpers(): string {
  const n = PUBLICATION_PRODUCER_FUNCTIONS;
  const q = (name: string): string => `"${name}"`;
  const result = PUBLICATION_SELECTION_RESULT_CQL_TYPE;
  const candidate = PUBLICATION_CANDIDATE_CQL_TYPE;
  return `/* REFACTOR:grounded (#320, review 562): unary membership consumes the selected operand envelope. */
define function ${q(n.construct)}(code FHIR.CodeableConcept, datum System.Boolean, profile System.String, operand FHIR.Observation, subjectReference System.String):
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

define function ${q(n.recognized)}(value FHIR.CodeableConcept, domain ${PUBLICATION_CODE_TABLE_TYPE}):
  value.coding C where exists (domain D where D.system = C.system.value and D.code = C.code.value)

define function ${q(n.interpret)}(publication ${result}, domain ${PUBLICATION_CODE_TABLE_TYPE}):
  if publication.state != 'selected' or publication.selected.resource.value is null then publication
  else if exists (${q(n.recognized)}(publication.selected.resource.value as FHIR.CodeableConcept, domain)) then publication
  else ${q(PUBLICATION_SELECTION_CQL_FUNCTIONS.fail)}('publication-uninterpretable-value', publication.conceptId, { publication.selected })

/* Interpret is the selected operand's domain authority. This repeated check protects the
   compiler helper invariant when Candidate/Classify receives a direct or foreign envelope. */
define function ${q(n.classify)}(value FHIR.CodeableConcept, domain ${PUBLICATION_CODE_TABLE_TYPE}, qualifying ${PUBLICATION_CODE_TABLE_TYPE}, conceptId System.String):
  ${renderAnswerClassification("value", "domain", "qualifying", "conceptId")}

define function ${q(n.candidate)}(operand ${result}, producerId System.String, code FHIR.CodeableConcept,
  profile System.String, domain ${PUBLICATION_CODE_TABLE_TYPE}, qualifying ${PUBLICATION_CODE_TABLE_TYPE}, conceptId System.String, subjectReference System.String):
  if operand.state = 'failed' then
    Message(null as ${candidate}, true, operand.failureCode, 'Error', operand.failureMessage)
  else if operand.state != 'selected' then null as ${candidate}
  else Tuple {
    key: ToString(Length(producerId)) + ':' + producerId + ToString(Length(operand.selected.key)) + ':' + operand.selected.key,
    contributorId: producerId,
    arm: 'inferred',
    retrievedInputIdentity: null as System.String,
    resource: ${q(n.construct)}(code, ${q(n.classify)}(operand.selected.resource.value as FHIR.CodeableConcept, domain, qualifying, conceptId), profile, operand.selected.resource, subjectReference),
    validity: operand.selected.validity
  }`;
}
