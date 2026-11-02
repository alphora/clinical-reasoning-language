import type { Concept, NarrativeElement, ReferenceName } from '../ast/types';
import { getRefLibrary, getRefName } from '../ast/types';
import { describeBranchCondition } from '../ast/branchCondition';
import type { ResolvedCelGraph } from '../cel/imports/types';
import { prepareCelPublicationOutcome } from '../cel/emitter/emitFhir';
import { classifyPublicationMembership, publicationCodeKey } from '../emit/publicationDomain';
import type { PublicationCode, PublicationProgram } from '../emit/publicationProgram';
import type { QualifiedConceptIdentity } from '../emit/publicationContext';
import type { CrlConceptNode } from './crlConceptLayer';

// REFACTOR:grounded: display reads the same prepared domain/classifier as execution;
// a producer's inputs are not automatically the final selected guard's meaning.
export interface ConditionAnswerMember { system: string; code: string; display: string; description?: string }
export interface ConditionAnswerSubject {
  key: string; label: string; matches: ConditionAnswerMember[]; nonmatches: ConditionAnswerMember[];
}
export interface ConditionAnswerCheck {
  id: string;
  label: string;
  expression: string;
  status: 'simple' | 'aggregate' | 'calculation' | 'opaque' | 'unsupported';
  subjects: ConditionAnswerSubject[];
  availableValuesOnly?: boolean;
  validityLabel?: string;
  note?: string;
}

const quoted = (ref: ReferenceName) => getRefLibrary(ref)
  ? `"${getRefLibrary(ref)}"."${getRefName(ref)}"` : `"${getRefName(ref)}"`;
function narrative(e: NarrativeElement): string {
  switch (e.type) {
    case 'NWord': return e.value;
    case 'NConceptRef': return quoted(e.value);
    case 'Quantity': return `${e.value} '${e.unit}'`;
    case 'NDisjunction': return `(${e.disjuncts.map(narrative).join(' or ')})`;
    case 'NConjunction': return `(${e.conjuncts.map(narrative).join(' and ')})`;
  }
}
function expression(c: Readonly<Concept>): string {
  if (c.definition?.type === 'DefinedAsDefinition') {
    const b=c.definition.body;
    if (b.type === 'DefinedAsBooleanComposition') return describeBranchCondition(b.expression,quoted);
    if (b.type === 'DefinedAsBareRef') return quoted(b.ref);
  }
  return c.definition?.type === 'DefinitionIsDefinition'
    ? c.definition.body.elements.map(narrative).join(' ') : c.name;
}
const sameDomain = (members: readonly ConditionAnswerMember[], domain: readonly PublicationCode[]) => {
  const keys = new Set(members.map(publicationCodeKey));
  return keys.size === members.length && keys.size === domain.length && domain.every(c => keys.has(publicationCodeKey(c)));
};

function codedDependencies(nodes: readonly CrlConceptNode[]): Set<string> {
  // Reverse reachability visits each node/edge once, including shared diamonds and cycles.
  const coded = new Set<string>(), dependents = new Map<string,string[]>();
  for (const n of nodes) {
    if (n.answerOptions?.length || n.answersFromTerminology || n.valueTypes?.includes('CodeableConcept')) coded.add(n.nodeKey);
    for (const ref of n.definitionRefs) {
      const parents=dependents.get(ref)??[];parents.push(n.nodeKey);dependents.set(ref,parents);
    }
  }
  const pending = [...coded];
  for (let i=0;i<pending.length;i++) for (const parent of dependents.get(pending[i])??[]) {
    if (coded.has(parent)) continue;
    coded.add(parent);pending.push(parent);
  }
  return coded;
}

/** Also accepts an already prepared program for callers that own its exact source snapshot. */
export function conditionAnswersFromProgram(program: PublicationProgram, nodes: readonly CrlConceptNode[]): Map<string, ConditionAnswerCheck> {
  const result = new Map<string, ConditionAnswerCheck>();
  const byOwner = new Map(nodes.map(n => [JSON.stringify([n.location.filePath, n.name]), n]));
  const libraries = program.declarations.getLibraries();
  const ambiguous = new Set(libraries.filter(a=>libraries.some(b=>a.libraryName===b.libraryName && a.sourceIdentity!==b.sourceIdentity)).map(a=>a.libraryName));
  const coded = codedDependencies(nodes);
  const readsCodes = (n: CrlConceptNode): boolean => coded.has(n.nodeKey);
  const subject = (identity: QualifiedConceptIdentity, domain: readonly PublicationCode[], qualifying: readonly PublicationCode[]): ConditionAnswerSubject | undefined => {
    const n = byOwner.get(JSON.stringify([identity.sourceIdentity, identity.conceptName]));
    const members = n?.answerOptions;
    if (!n || ambiguous.has(n.lib) || !members?.length || members.some(m => !m.system) || !sameDomain(members as ConditionAnswerMember[], domain)) return undefined;
    const matches: ConditionAnswerMember[] = [], nonmatches: ConditionAnswerMember[] = [];
    for (const member of members) {
      const value = classifyPublicationMembership({ domain, qualifying }, { valueCodeableConcept: { coding: [{ system: member.system, code: member.code }] } });
      if (value.kind !== 'known') return undefined;
      (value.value ? matches : nonmatches).push({ ...member, system: member.system! });
    }
    return { key: n.nodeKey, label: n.presentation?.questionText ?? n.name, matches, nonmatches };
  };
  for (const n of nodes) {
    const hit = program.declarations.lookupConcept(n.location.filePath, n.name);
    // The legacy diagram inventory deduplicates library names. A retained node must
    // never stand in for a different source selected by an explicit package include.
    if (hit.kind !== 'hit' || ambiguous.has(n.lib)) {
      if (readsCodes(n)) result.set(n.nodeKey, {id:n.nodeKey,label:n.name,expression:n.name,status:'unsupported',subjects:[],
        note:'This display identity does not identify one resolved source owner. Its answer interpretation is unavailable here.'});
      continue;
    }
    const c = hit.node;
    const lookup = program.lookup(hit.identity.sourceIdentity, c.name, c.location);
    const descriptor = lookup.kind === 'publication' ? lookup.descriptor : undefined;
    const producer = descriptor?.producer;
    const candidate = c.valueFrom !== undefined || producer?.kind === 'membership' || producer?.kind === 'anyMembership' ||
      ((c.definition?.type === 'DefinitionIsDefinition' || c.definition?.type === 'DefinedAsDefinition') && readsCodes(n));
    if (!candidate) continue;
    const base = { id: descriptor?.producer?.producerId ?? hit.identity.key, label: n.name, expression: expression(c), subjects: [] as ConditionAnswerSubject[] };
    let check: ConditionAnswerCheck;
    if (!descriptor) {
      check = { ...base, status: n.answersFromTerminology && !c.definition ? 'opaque' : 'unsupported',
        note: lookup.kind === 'error' ? lookup.diagnostic.message : 'This condition has no prepared answer interpretation.' };
    } else if (descriptor.guardQualification) {
      const s = subject(descriptor.identity, descriptor.guardQualification.domain, descriptor.guardQualification.qualifying);
      check = s ? { ...base, status: 'simple', subjects: [s] }
        : { ...base, status: 'unsupported', note: 'The interpreted values differ from the complete offered answers.' };
    } else if (producer?.kind === 'membership' || producer?.kind === 'anyMembership') {
      const operands = producer.kind === 'membership' ? [producer.operand] : producer.operands;
      const subjects = operands.map((o, i) => subject(o, producer.kind === 'membership' ? producer.domain : producer.domains[i], producer.qualifying));
      if (subjects.some(s => !s)) check = { ...base, status: 'unsupported', note: 'A complete answer list for this calculation is unavailable here.' };
      else {
        const competing = descriptor.localCode !== undefined || !!descriptor.sources?.length;
        check = { ...base, subjects: subjects as ConditionAnswerSubject[], status: competing ? 'calculation' : producer.kind === 'membership' ? 'simple' : 'aggregate',
          ...(producer.kind === 'anyMembership' ? { availableValuesOnly: producer.availableValuesOnly, validityLabel: operands[producer.validityOperand].conceptName } : {}),
          ...(competing ? { note: 'This calculation contributes to the condition; another recorded value can determine the result.' } : {}) };
      }
    } else check = { ...base, status: 'unsupported', note: 'This condition cannot be represented by separate answer lists.' };
    // The diagram key is not an authority for selecting among duplicate source owners.
    if (result.has(n.nodeKey)) result.set(n.nodeKey, { ...base, status: 'unsupported', note: 'Multiple source owners share this display identity.' });
    else result.set(n.nodeKey, check);
  }
  return result;
}

export function buildConditionAnswerChecks(graph: ResolvedCelGraph, nodes: readonly CrlConceptNode[]): Map<string, ConditionAnswerCheck> {
  const prepared = prepareCelPublicationOutcome(graph);
  if (prepared.kind === 'prepared' && prepared.program) return conditionAnswersFromProgram(prepared.program, nodes);
  // In-progress/opaque source must not make the whole tree disappear or invent a partition.
  const coded=codedDependencies(nodes);
  return new Map(nodes.filter(n => coded.has(n.nodeKey)).map(n => [n.nodeKey, {
    id: n.nodeKey, label: n.name, expression: n.name, status: n.answersFromTerminology ? 'opaque' as const : 'unsupported' as const,
    subjects: [], note: prepared.kind === 'failed' ? prepared.diagnostic.message : 'Answer interpretation is unavailable until the source definitions are resolved.',
  }]));
}
