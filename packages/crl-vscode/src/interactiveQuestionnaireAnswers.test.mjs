// REFACTOR:grounded: native answer contributions preserve validity independently of displayed defaults.
import { describe, expect, it } from 'vitest';
import { singletonAnswerBindings, prepareSingletonAnswers, adoptSingletonAnswers } from './interactiveQuestionnaireAnswers';
import { InteractiveSession } from './interactiveQuestionnaire';

const base='https://example.org/StructureDefinition/';
const profile=k=>base+k;
const question=k=>({linkId:k,type:'boolean',definition:profile(k)+'#Observation.value[x]',extension:[{
 url:'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-definitionExtract',valueCanonical:profile(k)}]});
const q=(keys=['a','b'])=>({resourceType:'Questionnaire',url:'urn:q',item:keys.map(question)});
const item=(k,value)=>({linkId:k,...(value===undefined?{}:{answer:[{valueBoolean:value}]})});
const qr=(a=true,b)=>({resourceType:'QuestionnaireResponse',questionnaire:'urn:q',subject:{reference:'Patient/p'},authored:'2025-06-06T13:00:00Z',item:[item('a',a),item('b',b)]});
const resource=(k,value,id=k)=>({resourceType:'Observation',id,meta:{profile:[profile(k)+'|1']},subject:{reference:'Patient/p'},effectiveDateTime:'2025-06-06T13:00:00Z',...(value===undefined?{}:{valueBoolean:value})});
const data=resources=>({resourceType:'Bundle',type:'collection',entry:resources.map(resource=>({resource}))});
const pair=(a=true,b)=>({questionnaire:q(),response:qr(a,b),activities:[],nativeData:data([])});
const initial={id:'one',label:'one',subject:'Patient/p',bundle:data([{resourceType:'Patient',id:'p'}])};
const defs=data([{resourceType:'PlanDefinition',id:'plan'}]);

describe('singleton answer intent',()=>{
 it('leaves extraction-owning root/group containers to legacy handling',()=>{
  const extension={url:'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-definitionExtract',valueCanonical:'urn:aggregate'};
  expect(singletonAnswerBindings({...q(),extension:[extension]})).toBeUndefined();
  expect(singletonAnswerBindings({...q(),item:[{linkId:'group',type:'group',extension:[extension],item:q().item}]})).toBeUndefined();
 });
 // @kit interactive-questionnaire:answer-validity
 it('omits passive population and blanks, retains earlier false with unchanged validity, and keeps explicit clear',()=>{
  const saved=resource('a',false),stored=new Map([[profile('a'),saved]]),incoming=qr(false,true);
  const before=structuredClone({saved,incoming});
  const next=prepareSingletonAnswers(q(),q(),qr(false),incoming,stored);
  expect(next.response.item).toHaveLength(1);expect(next.response.item[0]).toMatchObject(item('b',true));
  expect(next.response.id).toMatch(/^crl-session-[0-9a-f-]{36}$/);
  expect(next.retained.get(profile('a'))).toEqual(saved);
  expect(next.changed.size).toBe(1);
  const cleared=prepareSingletonAnswers(q(),q(),qr(false,true),qr(false),new Map([[profile('a'),saved],[profile('b'),resource('b',true)]]));
  expect(cleared.response.item).toHaveLength(1);expect(cleared.response.item[0].linkId).toBe('b');expect(cleared.response.item[0].answer).toBeUndefined();expect(cleared.retained.has(profile('b'))).toBe(false);
  expect(prepareSingletonAnswers(q(),q(),qr(),qr(),new Map()).response).toBeUndefined();
  expect({saved,incoming}).toEqual(before);
 });
 it('withdraws browser-pruned slots but not contributions omitted by the native display',()=>{
  const stored=new Map([[profile('a'),resource('a',true)],[profile('b'),resource('b',false)]]);
  const incoming={...qr(),item:[item('a',false)]};
  const pruned=prepareSingletonAnswers(q(['a']),q(),qr(true,false),incoming,stored);
  expect(pruned.retained.size).toBe(0);
  const nativeOmitted=prepareSingletonAnswers(q(['b']),q(['b']),{...qr(),item:[item('b')]},{...qr(),item:[item('b',false)]},stored);
  expect(nativeOmitted.retained.get(profile('a'))).toEqual(stored.get(profile('a')));
 });
 it('rejects missing, duplicated, wrong-subject and colliding extraction without modifying prior state',()=>{
  const stored=new Map([[profile('a'),resource('a',true,'kept')]]);
  const prepared=prepareSingletonAnswers(q(),q(),qr(),qr(true,false),stored);
  for(const resources of [[],[resource('b',false),resource('b',false)], [{...resource('b',false),subject:{reference:'Patient/other'}}],[resource('b',false,'kept')]])
   expect(()=>adoptSingletonAnswers(prepared,data(resources),'Patient/p')).toThrow();
  const next=adoptSingletonAnswers(prepared,data([resource('a',true,'kept'),resource('b',false,'new')]),'Patient/p');
  expect(next.get(profile('b')).valueBoolean).toBe(false);expect(stored.size).toBe(1);
 });
});

describe('successful native state ownership',()=>{
 // @kit interactive-questionnaire:answer-state
 it('retains an earlier needed answer even when native gathers only the next question; failed edit and reset preserve isolation',async()=>{
  const requests=[];let calls=0,fail=false;
  const session=new InteractiveSession(defs,'plan',async request=>{
   requests.push(request);if(fail)throw Error('native failure');
   if(++calls===1)return pair();
   if(calls===2)return {questionnaire:q(['b']),response:{...qr(),item:[item('b')]},activities:[],nativeData:data([resource('a',false)])};
   return {questionnaire:q(['b']),response:{...qr(),item:[item('b',true)]},activities:['Met'],nativeData:data([resource('a',false),resource('b',true)])};
  });
  session.reset(initial);await session.evaluate();await session.evaluate(qr(false));
  const incoming={...qr(),item:[item('b',true)]};
  fail=true;await expect(session.evaluate(incoming)).rejects.toThrow('native failure');fail=false;
  await session.evaluate(incoming);
  const supplied=JSON.parse(requests.at(-1).requestDataJson).entry.map(e=>e.resource);
  expect(supplied.find(r=>r.resourceType==='Observation')).toEqual(resource('a',false));
  expect(session.result.response.item.map(i=>i.linkId)).toEqual(['b']);
  session.reset(initial);await session.evaluate();
  expect(JSON.parse(requests.at(-1).requestDataJson)).toEqual(initial.bundle);
 });
 it('refuses a transition to repeated extraction after tracking answers, keeping the successful state',async()=>{
  let calls=0;
  const repeated=q();repeated.item[1].repeats=true;
  const native={...pair(false),questionnaire:repeated,nativeData:data([resource('a',false)])};
  const session=new InteractiveSession(defs,'plan',async()=>++calls===1?pair():native);
  session.reset(initial);await session.evaluate();await session.evaluate(qr(false));
  await expect(session.evaluate(native.response)).rejects.toThrow(/Reset/);
  expect(session.result).toBe(native);expect(calls).toBe(2);
 });
 it('does not adopt extracted state from a cancelled evaluation',async()=>{
  let finish,calls=0;const requests=[];
  const session=new InteractiveSession(defs,'plan',async request=>{requests.push(request);return ++calls===1?pair():await new Promise(r=>finish=r);});
  session.reset(initial);await session.evaluate();const pending=session.evaluate(qr(false));
  await Promise.resolve();await Promise.resolve();session.cancel();finish({...pair(false),nativeData:data([resource('a',false)])});
  expect(await pending).toBeUndefined();expect(session.result.response).toEqual(qr());
 });
 it('keeps legacy full handling when an initially unsupported form becomes singleton-bound',async()=>{
  const old=pair();old.questionnaire.item[0].repeats=true;
  const requests=[];let calls=0;
  const session=new InteractiveSession(defs,'plan',async request=>{requests.push(request);return ++calls===1?old:pair(false,true);});
  session.reset(initial);await session.evaluate();await session.evaluate(qr(false));await session.evaluate(qr(false,false));
  const submitted=JSON.parse(requests.at(-1).requestDataJson).entry.at(-1).resource;
  expect(submitted.item).toHaveLength(2);expect(submitted.item[0].answer[0].valueBoolean).toBe(false);
  expect(submitted.id).toBeUndefined();
 });
});
