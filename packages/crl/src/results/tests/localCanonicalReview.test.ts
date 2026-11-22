// REFACTOR:grounded: freshness/retry binds MV projection metadata to both real emitted closures; no JVM is simulated as evidence.
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { emitResultDefinitionClosure } from '../definitionClosure';
import { nativeResultsCurrent } from '../current';
import { readRetry } from '../retry';
import { resolveCelSuite } from '../../cel/suite';
import { emitCelSuite } from '../../cel/suiteEmit';
import { buildProducerInputs } from '../caseInput';
import { digest } from '../runtimeFingerprint';
import type { ProducerManifest } from '../manifest';
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'crl-local-review-'));roots.push(root);
  const put=(file:string,value:string)=>{const path=join(root,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,value);};
  put('package.json',JSON.stringify({name:'local-review',version:'1.0.0',description:'Synthetic freshness test',crl:{canonicalBase:'https://example.org/mv'}}));
  put('src/crl/policy.crl','library "Local".\nconcept "A": - shape is Record. - type is Observation. - value type is boolean. - code is `a`. - shape reduction is most recent.\ndecision "Root":\n- when "A" then use decision canonical `https://example.org/PlanDefinition/parent`.\n');
  put('src/cel/mv/cases.cel','library "Cases". covers "Local".\nfact "P": - defined by "Patient".\nfact "A": - defined by "Local"."A". - value is true.\ncase "one": - subject is "P". - fact is "A". - result is "Root" is "https://example.org/PlanDefinition/parent".\n');
  const closure=emitResultDefinitionClosure(join(root,'src/crl/policy.crl'),{date:'2026-11-22'},'mv');expect(closure.emitted.success).toBe(true);
  const selected=resolveCelSuite(root);if(!selected.ok)throw Error(JSON.stringify(selected.diagnostics));
  const clock='2026-11-22T12:00:00Z',emission=emitCelSuite(selected.suite,new Date(clock)),built=buildProducerInputs(emission.result);
  expect(built.diagnostics).toEqual([]);expect(built.inputs).toHaveLength(1);
  const manifest:ProducerManifest={schemaVersion:1,celLibrary:'mv',useCase:'prior-auth',generatedAt:clock,provenance:{crlVersion:'test',inputClock:clock,runtimeSha256:'test-runtime',definitionClosureSha256:closure.definitionClosureSha256,localReview:structuredClone(closure.projection)},cases:built.inputs.map(input=>({sourceFile:input.sourceFile,caseId:input.caseId,caseName:input.caseName,compartmentDir:'patient/'+input.compartmentId,state:'no-questionnaire',inputSha256:digest({input,planDefinitionId:'local-review'}),producedAt:clock}))};
  const save=()=>put('tests/results/questionnaire-manifest-mv.json',JSON.stringify(manifest));save();
  const current=()=>nativeResultsCurrent(root,closure.projection!.sourceDefinitionClosureSha256,'local-review','test',closure.projection);
  return {root,closure,manifest,save,current};
}
// @kit canonical-decision-terminal:owning-1
it('accepts exact local review identity and rejects interpreting it as ordinary execution',()=>{
  const f=fixture();expect(f.current()).toBe(true);
  expect(nativeResultsCurrent(f.root,f.closure.projection!.sourceDefinitionClosureSha256,'local-review','test')).toBe(false);
  expect(readRetry(f.root,'mv','prior-auth').provenance.localReview).toEqual(f.closure.projection);
});
// @kit canonical-decision-terminal:owning-2
it.each(['mapping','source','execution','missing','mode'])('rejects stale or malformed projection %s',what=>{
  const f=fixture(),p=f.manifest.provenance.localReview!;
  if(what==='mapping')p.actions[0].target='urn:wrong';
  if(what==='source')p.sourceDefinitionClosureSha256='0'.repeat(64);
  if(what==='execution')p.executionDefinitionClosureSha256='0'.repeat(64);
  if(what==='missing')delete f.manifest.provenance.localReview;
  if(what==='mode')(p as any).mode='production';
  f.save();expect(f.current()).toBe(false);
  if(what==='execution'||what==='mode')expect(()=>readRetry(f.root,'mv','prior-auth')).toThrow('invalid local review projection');
});
