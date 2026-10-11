// REFACTOR:grounded: execute native extraction; a source test cannot certify answer validity or identity.
import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { emitCrlBundle } from '@smile-digital-health/crl';
import { applySession } from '@smile-digital-health/crl/session';
import { InteractiveSession, nativeInteractiveRunner } from './interactiveQuestionnaire';

// @kit interactive-questionnaire:native-answer-validity
it.skipIf(!process.env.CRL_IQ_NATIVE)('native same-day source default, cumulative answers, unchanged continue, change, failure and clear',async()=>{
 const out=mkdtempSync(join(tmpdir(),'crl-request-validity-'));
 const emitted=emitCrlBundle(resolve(import.meta.dirname,'testdata/request-validity/src/crl/request.crl'));
 expect(emitted.success).toBe(true);
 const plan=emitted.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='PlanDefinition'&&r.type?.coding?.some(c=>c.code==='workflow-definition')).id;
 const original={resourceType:'Bundle',type:'collection',entry:[{resource:{resourceType:'Patient',id:'p1'}},{resource:{resourceType:'ServiceRequest',id:'sr1',status:'active',intent:'order',subject:{reference:'Patient/p1'},authoredOn:'2025-06-06',code:{coding:[{system:'http://example.org/fhir/CodeSystem/synthetic-request',code:'synthetic-service'}]}}}]};
 const initial={id:'one',label:'one',bundle:original,subject:'Patient/p1'},requests=[],results=[];
 const runner=nativeInteractiveRunner(async(request,options)=>{
  requests.push(JSON.parse(request.requestDataJson));
  const result=await applySession(request,{...options,limits:{maxHeapMb:512}});
  // Retain actual native evidence before the normal UI runner removes its owned temporary files.
  const dir=join(out,String(results.length));mkdirSync(dir);
  for(const [name,a]of Object.entries(result.artifacts))writeFileSync(join(dir,name),readFileSync(a.path));
  results.push(result);return result;
 },out);
 const session=new InteractiveSession(emitted.bundle,plan,runner);
 const observations=r=>r.nativeData.entry.map(e=>e.resource).filter(r=>r.resourceType==='Observation');
 const slot=(r,k)=>r.response.item.find(i=>i.definition?.includes('-'+k+'#'));
 async function edit(k,code,minute,activity){
  const qr=structuredClone(session.result.response);qr.authored=`2025-06-06T13:${String(minute).padStart(2,'0')}:00Z`;
  if(k){const target=slot({response:qr},k);if(code===null)delete target.answer;else target.answer=[{valueCoding:{system:'http://example.org/fhir/CodeSystem/synthetic-answers',code}}];}
  const result=await session.evaluate(qr);expect(result.activities).toEqual(activity);return result;
 }
 session.reset(initial);const start=await session.evaluate();expect(slot(start,'requested-service').answer).toHaveLength(1);
 const a=await edit('condition-a','yes',0,[]),savedA=structuredClone(observations(a)[0]);
 expect(observations(a)).toHaveLength(1);expect(savedA.code.coding[0].code).toBe('condition-a');
 const b=await edit('condition-b','yes',1,['certify.Met']);expect(observations(b)).toHaveLength(2);
 expect(new Set(observations(b).map(r=>r.id)).size).toBe(2);
 expect(observations(b).find(r=>r.code.coding[0].code==='condition-a')).toEqual(savedA);
 const unchanged=await edit(undefined,undefined,2,['certify.Met']);expect(observations(unchanged)).toEqual(observations(b));
 expect(requests.at(-1).entry.some(e=>e.resource.resourceType==='QuestionnaireResponse')).toBe(false);
 const no=await edit('condition-b','no',3,['not-certify.Unmet']);
 await expect(edit('condition-b','invalid',4,[])).rejects.toThrow(/native-error/);
 expect(session.result).toBe(no);
 const rollback=await edit(undefined,undefined,5,['not-certify.Unmet']);expect(observations(rollback)).toEqual(observations(no));
 const clear=await edit('condition-b',null,6,[]);
 expect(observations(clear).find(r=>r.code.coding[0].code==='condition-b')).not.toHaveProperty('valueCodeableConcept');
 expect(slot(clear,'condition-b').answer??[]).toHaveLength(0);
 for(const request of requests){
  expect(request.entry.find(e=>e.resource.resourceType==='ServiceRequest').resource).toEqual(original.entry[1].resource);
  expect(request.entry.filter(e=>e.resource.resourceType==='Observation').every(e=>e.resource.code.coding[0].code!=='requested-service')).toBe(true);
 }
 expect(observations(clear).find(r=>r.code.coding[0].code==='condition-a')).toEqual(savedA);
 writeFileSync(join(out,'PASS.json'),JSON.stringify({passed:true,calls:results.length,sourceUnchanged:true,priorValidityUnchanged:true,clearUnknown:true},null,2));
},600000);
