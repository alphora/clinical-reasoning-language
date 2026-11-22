// REFACTOR:grounded: MV executes only the local route, preserving the separately delivered canonical target.
import type { EmittedResource, SourceActionBinding } from '../fhir-emitter/types';
import { digest } from './runtimeFingerprint';

export interface LocalCanonicalReviewProjection {
  mode: 'local-canonical-terminals';
  sourceDefinitionClosureSha256: string;
  executionDefinitionClosureSha256: string;
  actions: (SourceActionBinding & { definitionCanonical: string; version?: string; library: string; decision: string })[];
}
const hash = (definitions: readonly unknown[], cql: Record<string, string>) => digest({ defs: definitions, cql: Object.entries(cql).sort(([a], [b]) => a.localeCompare(b)) });

/** Host-only execution copy. Never pass these definitions to the production writer or packager. */
export function localCanonicalReview(resources: readonly EmittedResource[], cql: Record<string, string>) {
  const original = resources.map(r => r.resource);
  const actions: LocalCanonicalReviewProjection['actions'] = resources.flatMap(r => (r.sourceActions ?? []).map(a => {
    if (typeof r.resource.url !== 'string' || !r.sourceLibraryName || !r.sourceName) throw Error('Local review action has no unique source definition owner.');
    return { ...a, conditions: structuredClone(a.conditions), definitionCanonical: r.resource.url, ...(typeof r.resource.version === 'string' ? { version: r.resource.version } : {}), library: r.sourceLibraryName, decision: r.sourceName };
  }));
  const terminals = actions.filter(a => a.kind === 'canonical-terminal');
  const sourceDefinitionClosureSha256 = hash(original, cql);
  if (!terminals.length) return { definitions: original, definitionClosureSha256: sourceDefinitionClosureSha256 };
  const definitions = JSON.parse(JSON.stringify(original)) as Record<string, unknown>[];
  for (const binding of actions) {
    const owners = definitions.filter(r => r.resourceType === 'PlanDefinition' && r.url === binding.definitionCanonical && r.version === binding.version);
    if (owners.length !== 1) throw Error('Local review definition is missing or ambiguous.');
    const hits: Record<string, unknown>[] = [];
    const visit = (items: unknown) => { if (!Array.isArray(items)) return; for (const a of items) {
      if (!a || typeof a !== 'object') throw Error('Malformed local review action.');
      if (a.id === binding.actionId) hits.push(a);
      visit(a.action);
    } };
    visit(owners[0].action);
    if (hits.length !== 1 || hits[0].definitionCanonical !== binding.target) throw Error('Local review action does not match its exact source binding.');
    if (binding.kind === 'canonical-terminal') {
      if (Array.isArray(hits[0].action) && hits[0].action.length) throw Error('A canonical terminal cannot have child actions.');
      delete hits[0].definitionCanonical;
    }
  }
  const definitionClosureSha256 = hash(definitions, cql);
  return { definitions, definitionClosureSha256, projection: { mode: 'local-canonical-terminals' as const,
    sourceDefinitionClosureSha256, executionDefinitionClosureSha256: definitionClosureSha256, actions } };
}

/** Validate persisted projection identity before freshness/retry can use it. */
export function validLocalCanonicalProjection(value: unknown): value is LocalCanonicalReviewProjection {
  if (!value || typeof value !== 'object') return false;
  const p = value as LocalCanonicalReviewProjection, sha = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  if (p.mode !== 'local-canonical-terminals' || !sha(p.sourceDefinitionClosureSha256) || !sha(p.executionDefinitionClosureSha256) || p.sourceDefinitionClosureSha256 === p.executionDefinitionClosureSha256 || !Array.isArray(p.actions) || !p.actions.some(a => a?.kind === 'canonical-terminal')) return false;
  const keys = new Set<string>();
  return p.actions.every(a => {
    if (!a || !['canonical-terminal', 'local-decision'].includes(a.kind) || !['definitionCanonical', 'library', 'decision', 'actionId', 'nodeId', 'target'].every(k => typeof (a as any)[k] === 'string' && (a as any)[k].length) || !Array.isArray(a.conditions) || (a.version !== undefined && typeof a.version !== 'string')) return false;
    const key = JSON.stringify([a.definitionCanonical, a.version, a.actionId]);
    if (keys.has(key)) return false; keys.add(key); return true;
  });
}

export interface LocalCanonicalHandoff {
  ref: string;
  label: string;
  path: string[];
  actions: LocalCanonicalReviewProjection['actions'];
}
/** Native evidence is exact occurrence ancestry plus every emitted applicability result, never action presence. */
export function localCanonicalHandoffs(native: unknown, planId: string, projection: LocalCanonicalReviewProjection): LocalCanonicalHandoff[] {
  if (!validLocalCanonicalProjection(projection)) return [];
  const resources: any[] = [];
  const collect = (v: any) => { if (!v || typeof v !== 'object') return; if (typeof v.resourceType === 'string') resources.push(v); for (const x of Object.values(v)) if (x && typeof x === 'object') collect(x); };
  collect(native);
  if (resources.some(r => r.resourceType === 'OperationOutcome' && r.issue?.some((i: any) => ['error', 'fatal'].includes(i.severity)))) return [];
  const groups = resources.filter(r => ['RequestGroup', 'RequestOrchestration'].includes(r.resourceType));
  const owner = (group: any) => {
    const refs = typeof group.instantiatesCanonical === 'string' ? [group.instantiatesCanonical] : group.instantiatesCanonical;
    if (!Array.isArray(refs) || refs.length !== 1 || typeof refs[0] !== 'string') return undefined;
    const [canonical, version] = refs[0].split('|'); return { canonical, version };
  };
  const roots = groups.filter(g => g.id === planId);
  if (roots.length !== 1) return [];
  const output: LocalCanonicalHandoff[] = [], visits = new Set<string>();
  let ambiguous = false, count = 0;
  const trace = (group: any, chain: LocalCanonicalHandoff['actions'], path: string[], stack: Set<any>) => {
    if (stack.has(group) || stack.size > 100 || ++count > 10000) { ambiguous = true; return; }
    const own = owner(group); if (!own) { ambiguous = true; return; }
    const bindings = projection.actions.filter(b => b.definitionCanonical === own.canonical && (!own.version || own.version === b.version));
    const seen = new Set<string>();
    const walk = (items: any[], inherited: any[]) => { for (const a of items ?? []) {
      const conditions = [...inherited, ...(a.condition ?? [])];
      const matches = bindings.filter(b => b.actionId === a.id);
      if (matches.length > 1 || (matches.length && seen.has(a.id))) { ambiguous = true; continue; }
      if (matches.length) {
        seen.add(a.id); const b = matches[0];
        const expected = b.conditions.filter(c => c.kind === 'applicability');
        const actual = conditions.filter(c => c.kind === 'applicability');
        const signature = (c: any) => JSON.stringify([c.kind, c.expression]);
        const valid = expected.length === actual.length && expected.every((c, i) => signature(c) === signature(actual[i])) && actual.every(c => {
          const values = c.extension?.filter((e: any) => e.url === 'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-action-condition-result');
          return values?.length === 1 && values[0].valueBoolean === true;
        });
        if (valid) {
          const next = [...chain, b], nextPath = [...path, group.id, a.id];
          if (b.kind === 'canonical-terminal') {
            if (a.resource || a.action?.length) { ambiguous = true; continue; }
            const ref = 'local-handoff:' + JSON.stringify(nextPath);
            if (visits.has(ref)) { ambiguous = true; continue; } visits.add(ref);
            output.push({ ref, label: b.target, path: nextPath, actions: next });
          } else {
            const ref = a.resource?.reference;
            if (typeof ref !== 'string' || (ref.includes('/') && !/^(RequestGroup|RequestOrchestration)\/[A-Za-z0-9.-]+$/.test(ref))) { ambiguous = true; continue; }
            const id = typeof ref === 'string' ? ref.replace(/^#/, '').split('/').pop() : undefined;
            const targets = id ? groups.filter(g => g.id === id) : [];
            if (targets.length !== 1) { ambiguous = true; continue; }
            const targetOwner = owner(targets[0]), [url, version] = b.target.split('|');
            if (!targetOwner || targetOwner.canonical !== url || (version && targetOwner.version !== version)) { ambiguous = true; continue; }
            trace(targets[0], next, nextPath, new Set([...stack, group]));
          }
        }
      }
      walk(a.action, conditions);
    } };
    walk(group.action, []);
  };
  trace(roots[0], [], [], new Set());
  return ambiguous ? [] : output;
}
