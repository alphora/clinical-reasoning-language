// REFACTOR:grounded: passive form population is not a newly authored clinical assertion.
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { buildSessionResponse, type SessionAnswerEdit } from '@smile-digital-health/crl/session';
import type { Fhir } from './interactiveQuestionnaire';

const extract = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-definitionExtract';
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const canonical = (v: string) => v.split('|')[0];
export interface AnswerBinding { profile: string; kind: string; question: Fhir }

/** Only independently extracted singleton slots have a demonstrated replacement identity. */
export function singletonAnswerBindings(q: Fhir): Map<string, AnswerBinding> | undefined {
  const slots = new Map<string, AnswerBinding>();
  let supported = !q.extension?.some((e: Fhir) => e.url === extract);
  const walk = (items: Fhir[]) => { for (const item of items ?? []) {
    if (item.repeats) supported = false;
    if (item.type === 'group' || item.type === 'display') {
      if (item.extension?.some((e: Fhir) => e.url === extract)) supported = false;
    } else {
      const match = typeof item.definition === 'string' && /^(.*)#([A-Za-z]+)\.value\[x\]$/.exec(item.definition);
      const profile = match && canonical(match[1]);
      if (!match || !profile || slots.has(profile) || item.item?.length ||
          !item.extension?.some((e: Fhir) => e.url === extract && canonical(e.valueCanonical ?? e.valueUri ?? '') === profile)) supported = false;
      else slots.set(profile, { profile, kind: match[2], question: item });
    }
    walk(item.item);
  } };
  walk(q.item);
  return supported && slots.size ? slots : undefined;
}

function responseItems(r: Fhir): Map<string, { item: Fhir; pointer: string }> {
  const items = new Map<string, { item: Fhir; pointer: string }>();
  const walk = (list: Fhir[], prefix: string) => { for (const [i, item] of (list ?? []).entries()) {
    if (items.has(item.linkId) || item.answer?.some((a: Fhir) => a.item?.length)) throw Error('Cannot reconcile repeated or nested answer occurrences. Reset to start again.');
    items.set(item.linkId, { item, pointer: `${prefix}/${i}` });
    walk(item.item, `${prefix}/${i}/item`);
  } };
  walk(r.item, '/item'); return items;
}

function answerValue(item?: Fhir): string {
  const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
  return JSON.stringify((item?.answer ?? []).map((answer: Fhir) => Object.fromEntries(
    Object.keys(answer).filter(k => k.startsWith('value')).sort().map(k => {
      const value = k === 'valueCoding' ? { ...answer[k], display: undefined } : answer[k];
      return [k, stable(value)];
    }))));
}

export interface PreparedAnswers {
  changed: Map<string, AnswerBinding>;
  retained: Map<string, Fhir>;
  response?: Fhir;
}
export function prepareSingletonAnswers(q: Fhir, previousQ: Fhir, previous: Fhir, incoming: Fhir,
  stored: ReadonlyMap<string, Fhir>): PreparedAnswers | undefined {
  const bindings = singletonAnswerBindings(q), oldBindings = singletonAnswerBindings(previousQ);
  if (!bindings || !oldBindings) return undefined;
  const raw = JSON.stringify(incoming);
  const hash = createHash('sha256').update(raw).digest('hex');
  // Validate the complete form even when there are no answer edits and no response will be submitted.
  buildSessionResponse(JSON.stringify(q), raw, { mode: 'full', authored: incoming.authored, expectedResponseSha256: hash, edits: [] });
  const before = responseItems(previous), after = responseItems(incoming);
  const edits: SessionAnswerEdit[] = [], changed = new Map<string, AnswerBinding>();
  const retained = new Map([...stored].map(([profile, resource]) => [profile, copy(resource)]));
  // A supplied retained-Q subset is explicit browser branch pruning. Native omission alone is not withdrawal.
  for (const profile of oldBindings.keys()) if (!bindings.has(profile)) retained.delete(profile);
  for (const [profile, binding] of bindings) {
    const current = after.get(binding.question.linkId);
    if (!current) continue; // omission is not a clear
    const old = oldBindings.get(profile);
    if (answerValue(current.item) === answerValue(old && before.get(old.question.linkId)?.item)) continue;
    changed.set(profile, binding); retained.delete(profile);
    edits.push(current.item.answer?.length
      ? { pointer: current.pointer, operation: 'set', answersJson: JSON.stringify(current.item.answer) }
      : { pointer: current.pointer, operation: 'clear' });
  }
  if (!edits.length) return { changed, retained };
  const response = JSON.parse(buildSessionResponse(JSON.stringify(q), raw, {
    mode: 'edits-only', authored: incoming.authored, expectedResponseSha256: hash, edits,
  }));
  // Native extraction derives answer identities from the response id. Each submission owns a fresh id.
  response.id = 'crl-session-' + randomUUID();
  return { changed, retained, response };
}

/** Adopt only engine-created resources for explicitly changed slots, after complete successful execution. */
export function adoptSingletonAnswers(prepared: PreparedAnswers, nativeData: Fhir, subject: string): Map<string, Fhir> {
  const next = new Map(prepared.retained);
  const resources: Fhir[] = nativeData.entry?.map((e: Fhir) => e.resource) ?? [];
  for (const [profile, binding] of prepared.changed) {
    const matches = resources.filter(r => r.resourceType === binding.kind &&
      r.meta?.profile?.some((p: string) => canonical(p) === profile));
    if (matches.length !== 1 || !matches[0].id || matches[0].subject?.reference !== subject)
      throw Error('Native extraction did not return one unambiguous answer for the edited question. Previous answers were retained.');
    const resource = matches[0];
    if ([...next.values()].some(r => r.resourceType === resource.resourceType && r.id === resource.id))
      throw Error('Native extraction reused a retained answer identity. Previous answers were retained.');
    next.set(profile, copy(resource));
  }
  return next;
}
