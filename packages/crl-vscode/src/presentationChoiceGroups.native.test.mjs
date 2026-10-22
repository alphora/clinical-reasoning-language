import {expect,it} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {emitCrlBundle,emitCrlTwoLane,writeTwoLane,produceResults} from '@smile-digital-health/crl';
import {applySession} from '@smile-digital-health/crl/session';
import {InteractiveSession,nativeInteractiveRunner} from './interactiveQuestionnaire';
import {singletonAnswerBindings} from './interactiveQuestionnaireAnswers';
import {qaFixture} from './qaFlagEditingFixture.mjs';
import {saveQuestionRequest} from './qaFlagEditing';
import {runKeUpdates,discoverKeUpdates} from './keQaApply';

const enabled=process.env.CRL_CHOICE_GROUP_NATIVE==='1';
const engine=()=>({path:process.env.CRL_CHOICE_GROUP_ENGINE_PATH,sha256:process.env.CRL_CHOICE_GROUP_ENGINE_SHA256});
const flat=items=>(items??[]).flatMap(i=>[i,...flat(i.item)]);
const marker='http://clinicalreasoninglanguage.org/fhir/StructureDefinition/presentation-choice-group';
function fixture(){
 const f=qaFixture();
 const boolean=f.source.replace('value type is CodeableConcept','value type is boolean').replace('- value domain is answer options.\n','').replace('- value from is "Terms"."Options":\n  - not qualifying is `no`.\n','');
 const source=boolean.replace('- question text is "Authored question?".','- question text is "Authored question?". - choice group is "Panel".')
  + boolean.replaceAll('"Q"','"Other"').replace('`q`','`other`').replace('- question text is "Authored question?".','- question text is "Other question?". - choice group is "Panel".').replace('library "L".','')
  + '\npresentation group "Panel": - question text is "Which findings apply?". - columns is 2. - control is checkbox.\nactivity "Met": - request CPGTaskRequest. - with `Met`.\ndecision "D": - when "Q" or "Other" then recommend activity "Met".\n';
 writeFileSync(f.policy,source);const pkg=JSON.parse(readFileSync(join(f.root,'package.json')));pkg.crl.date='2026-10-15';writeFileSync(join(f.root,'package.json'),JSON.stringify(pkg));
 return f;
}

// @kit concept-presentation:choice-group-native-session
it.skipIf(!enabled)('native grouped host session retains independent answers, no-op validity and clear',async()=>{
 const f=fixture();try{
  const emitted=emitCrlBundle(f.policy);expect(emitted.success).toBe(true);
  const plan=emitted.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='PlanDefinition'&&r.type?.coding?.some(c=>c.code==='workflow-definition'));
  const requests=[],results=[];const runner=nativeInteractiveRunner(async(request,options)=>{
   requests.push(JSON.parse(request.requestDataJson));const result=await applySession({...request,engine:engine()},{...options,limits:{maxHeapMb:512}});
   if(process.env.CRL_CHOICE_GROUP_EVIDENCE){const out=join(process.env.CRL_CHOICE_GROUP_EVIDENCE,'host-'+results.length);mkdirSync(out,{recursive:true});for(const [name,a] of Object.entries(result.artifacts))writeFileSync(join(out,name),readFileSync(a.path));}
   results.push(result);return result;
  },f.root);
  const session=new InteractiveSession(emitted.bundle,plan.id,runner);session.reset({id:'synthetic',label:'Synthetic',subject:'Patient/p',bundle:{resourceType:'Bundle',type:'collection',entry:[{resource:{resourceType:'Patient',id:'p'}}]}});
  const start=await session.evaluate();expect(flat(start.questionnaire.item).filter(i=>i.extension?.some(e=>e.url===marker))).toHaveLength(1);expect(singletonAnswerBindings(start.questionnaire).size).toBe(2);expect(flat(start.questionnaire.item).filter(i=>i.type==='boolean').map(i=>i.text)).toEqual(['Authored question?','Other question?']);
  const observations=r=>r.nativeData.entry.map(e=>e.resource).filter(r=>r.resourceType==='Observation');
  async function edit(code,value,minute){const qr=structuredClone(session.result.response);qr.authored=`2026-10-15T16:${String(minute).padStart(2,'0')}:00Z`;
   if(code){const item=flat(qr.item).find(i=>i.definition?.endsWith('-'+code+'#Observation.value[x]'));expect(item).toBeDefined();if(value===null)delete item.answer;else item.answer=[{valueBoolean:value}];}
   return session.evaluate(qr);}
  const a=await edit('q',true,0),saved=structuredClone(observations(a)[0]);expect(observations(a)).toHaveLength(1);
  const b=await edit('other',false,1);expect(observations(b)).toHaveLength(2);expect(observations(b).find(o=>o.code.coding[0].code==='q')).toEqual(saved);
  const unchanged=await edit(undefined,undefined,2);expect(observations(unchanged)).toEqual(observations(b));expect(requests.at(-1).entry.some(e=>e.resource.resourceType==='QuestionnaireResponse')).toBe(false);
  const no=await edit('q',false,3);expect(observations(no).find(o=>o.code.coding[0].code==='q').valueBoolean).toBe(false);
  const clear=await edit('q',null,4);expect(observations(clear).find(o=>o.code.coding[0].code==='q')).not.toHaveProperty('valueBoolean');expect(observations(clear).find(o=>o.code.coding[0].code==='other').valueBoolean).toBe(false);
  expect(results.every(r=>r.ok)).toBe(true);
 }finally{f.close();}
},600000);

// @kit concept-presentation:choice-group-ke-static
it.skipIf(!enabled)('KE question edit preserves group syntax and regenerates grouped native static forms',async()=>{
 const f=fixture(),storageRoot=mkdtempSync(join(tmpdir(),'crl-choice-ke-'));try{
  const celDir=join(f.root,'src/cel/mv');mkdirSync(celDir,{recursive:true});writeFileSync(join(celDir,'cases.cel'),'library "Cases". covers "L".\nfact "Patient": - name is "Synthetic". - birth date is "1970-01-01". - defined by "Patient".\nfact "Answer": - value is true. - date is "2026-10-15". - defined by "L"."Q".\ncase "Selected": - subject is "Patient". - fact is "Answer". - result is "D" is "Met".\n');
  const initial=emitCrlTwoLane(f.policy,{date:'2026-10-15',capability:'publishable'});expect(initial.success).toBe(true);writeTwoLane(initial,join(f.root,'src'));
  saveQuestionRequest(f.root,f.flags,f.wording(),'Updated grouped question?','Updated detail');const beforeFlags=Object.fromEntries(readdirSync(f.flags).map(n=>[n,readFileSync(join(f.flags,n),'utf8')]));
  const requests=discoverKeUpdates(f.root).requests.map(({id,revision})=>({id,revision}));
  const result=await runKeUpdates({schemaVersion:1,operation:'apply',artifactRoot:f.root,requests},{storageRoot,crlVersion:'6.4.41',produce:request=>produceResults({...request,jarPath:engine().path,jarSha256:engine().sha256,bounds:{maxHeapMb:512,batchTimeoutMs:180000,maxCapturedBytes:1048576}})});
  expect(result.ok,JSON.stringify(result)).toBe(true);expect(result.state).toBe('changed');expect(readFileSync(f.policy,'utf8')).toContain('choice group is "Panel"');
  const files=[];function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.json'))files.push(JSON.parse(readFileSync(p)));}}walk(join(f.root,'tests/results/fhir'));
  const q=files.find(r=>r.resourceType==='Questionnaire');expect(q).toBeDefined();expect(flat(q.item).filter(i=>i.extension?.some(e=>e.url===marker))).toHaveLength(1);expect(JSON.stringify(q)).toContain('Updated grouped question?');
  const updated=flat(q.item).find(i=>i.text==='Updated grouped question?');expect(updated).toBeDefined();expect(updated.item?.some(i=>i.type==='display'&&i.text==='Updated detail')).toBe(true);
  expect(Object.fromEntries(readdirSync(f.flags).map(n=>[n,readFileSync(join(f.flags,n),'utf8')]))).toEqual(beforeFlags);
 }finally{f.close();rmSync(storageRoot,{recursive:true,force:true});}
},600000);
