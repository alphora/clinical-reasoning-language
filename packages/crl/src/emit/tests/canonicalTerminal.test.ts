// REFACTOR:grounded: an authored canonical leaf ends local MV, without importing or executing its target.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCRL, validateCRL } from '../../index';
import { emitCrlTwoLane } from '../../emit-two-lane';
import { localCanonicalReview } from '../../results/localCanonicalReview';
import { cqlIndex } from '../../results/repoBundle';
import { emitResultDefinitionClosure, definitionClosureDigest } from '../../results/definitionClosure';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const target = 'https://example.org/rx-smoke/PlanDefinition/rx-smoke';
function fixture(body = '- otherwise then use decision canonical `' + target + '`.') {
  const root = mkdtempSync(join(tmpdir(), 'crl-terminal-')); roots.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'supplement', version: '1.0.0', description: 'Synthetic terminal', crl: { canonicalBase: 'https://example.org/rx-smoke' } }));
  const source = 'library "Supplement".\nconcept "Ready": - shape is Record. - type is Observation. - value type is boolean. - code is `ready`. - shape reduction is most recent.\ndecision "Root":\n' + body.replace('- otherwise', '- when "Ready"') + '\n';
  const file = join(root, 'root.crl'); writeFileSync(file, source);
  return { file, source };
}
describe('local canonical terminal', () => {
  // @kit canonical-decision-terminal:owning-1
  it.each([target, target + '|1.0.0', 'urn:example:parent'])('accepts an absolute canonical without requiring a resource version: %s', canonical => {
    const f = fixture('- otherwise then use decision canonical `' + canonical + '`.');
    expect(buildCRL(f.source).success).toBe(true);
    const validation = validateCRL(f.source); expect(validation.success, JSON.stringify(validation.errors)).toBe(true);
    const emitted = emitCrlTwoLane(f.file, { date: '2026-11-22' });
    expect(emitted.success, JSON.stringify(emitted.hardErrors)).toBe(true);
    const own = emitted.fhir.resources.find(r => r.sourceKind === 'Decision')!;
    expect(JSON.stringify(own.resource)).toContain(canonical);
    expect(emitted.fhir.resources.some(r => r.resource.url === target)).toBe(false);
    expect((own as any).sourceActions).toEqual([expect.objectContaining({ nodeId: 'when[0]/action[0]', kind: 'canonical-terminal', target: canonical, actionId: expect.stringMatching(/^crl-ref-/) })]);
  });
  // @kit canonical-decision-terminal:owning-2
  it.each(['relative', target + '|', target + '|1|2', 'https://example.org/has space', target + '#fragment'])('rejects malformed canonicals: %s', canonical => {
    expect(validateCRL(fixture('- otherwise then use decision canonical `' + canonical + '`.').source).success).toBe(false);
  });
  // @kit canonical-decision-terminal:owning-3
  it('keeps separate occurrences of the same target distinct and stable', () => {
    const f = fixture('- otherwise then: all:\n- use decision canonical `' + target + '`.\n- use decision canonical `' + target + '`.\nend.');
    const one = emitCrlTwoLane(f.file, { date: '2026-11-22' }), two = emitCrlTwoLane(f.file, { date: '2026-11-22' });
    expect(one.success, JSON.stringify(one.hardErrors)).toBe(true);
    const actions = (one.fhir.resources.find(r => r.sourceKind === 'Decision') as any).sourceActions;
    expect(actions).toHaveLength(2); expect(new Set(actions.map((a: any) => a.actionId)).size).toBe(2);
    expect(two.fhir.resources).toEqual(one.fhir.resources);
  });
  // @kit canonical-decision-terminal:owning-4
  it('preserves ordinary unresolved local decision errors', () => {
    const result = emitCrlTwoLane(fixture('- otherwise then use decision "Missing".').file, { date: '2026-11-22' });
    expect(result.success).toBe(false);
  });
  // @kit canonical-decision-terminal:owning-5
  it('keeps original delivery definitions separate from explicit MV execution and its hashes', () => {
    const f=fixture(),options={date:'2026-11-22'},original=emitCrlTwoLane(f.file,options),before=JSON.stringify(original.fhir.resources);
    const review=localCanonicalReview(original.fhir.resources,cqlIndex(original.cqlLibraries));
    expect(JSON.stringify(original.fhir.resources)).toBe(before);
    expect(before).toContain(target);expect(JSON.stringify(review.definitions)).not.toContain(target);
    expect(review.projection?.sourceDefinitionClosureSha256).toBe(definitionClosureDigest(original));
    expect(review.projection?.executionDefinitionClosureSha256).toBe(review.definitionClosureSha256);
    expect(review.definitionClosureSha256).not.toBe(definitionClosureDigest(original));
    expect(emitResultDefinitionClosure(f.file,options,'mv').projection).toEqual(review.projection);
    for(const purpose of [undefined,'regression'] as const){const ordinary=emitResultDefinitionClosure(f.file,options,purpose);expect(ordinary.projection).toBeUndefined();expect(JSON.stringify(ordinary.definitions)).toContain(target);}
  });
  // @kit canonical-decision-terminal:owning-6
  it('refuses an action whose bound canonical was changed without source metadata',()=>{
    const original=emitCrlTwoLane(fixture().file,{date:'2026-11-22'}),plan=original.fhir.resources.find(r=>r.sourceKind==='Decision')!;
    const visit=(items:any[])=>{for(const a of items??[]){if(a.definitionCanonical===target)a.definitionCanonical='urn:wrong';visit(a.action);}};
    visit(plan.resource.action as any[]);
    expect(()=>localCanonicalReview(original.fhir.resources,cqlIndex(original.cqlLibraries))).toThrow('exact source binding');
  });
  // @kit canonical-decision-terminal:owning-7
  it('preserves the no-canonical MV digest and leaves ordinary delegation IDs absent',()=>{
    const f=fixture('- when "Ready" then use decision "Sub".\ndecision "Sub":\n- when "Ready" then recommend activity "Met".\nactivity "Met": - request CPGTaskRequest.');
    const original=emitCrlTwoLane(f.file,{date:'2026-11-22'});expect(original.success,JSON.stringify(original.hardErrors)).toBe(true);
    const review=localCanonicalReview(original.fhir.resources,cqlIndex(original.cqlLibraries));
    expect(review.projection).toBeUndefined();expect(review.definitionClosureSha256).toBe(definitionClosureDigest(original));
    expect(original.fhir.resources.every(r=>r.sourceActions===undefined)).toBe(true);
    expect(JSON.stringify(original.fhir.resources)).not.toContain('crl-ref-');
  });
});
