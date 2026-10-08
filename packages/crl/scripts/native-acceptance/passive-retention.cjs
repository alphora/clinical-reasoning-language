// Returned-wire-only acceptance: no client merging, pruning or extracted-answer cache.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const fixtures=path.resolve(__dirname,'../..'),pkg=path.resolve(process.env.CRL_RETENTION_CORE_ROOT||fixtures),core=require(path.join(pkg,'dist/index.js'));
const {applySession}=require(path.join(pkg,'dist/results/session.js'));
const out=path.resolve(process.argv[2]||'tmp/passive-retention-native');fs.mkdirSync(out,{recursive:true});
const flat=x=>(x||[]).flatMap(i=>[i,...flat(i.item),...(i.answer||[]).flatMap(a=>flat(a.item))]);
const resources=x=>{const list=[];function walk(x){if(!x||typeof x!=='object')return;if(x.resourceType)list.push(x);for(const v of Object.values(x))if(v&&typeof v==='object')walk(v);}walk(x);return [...new Map(list.map(r=>[JSON.stringify(r),r])).values()];};
const base=[{resourceType:'Patient',id:'p'},{resourceType:'ServiceRequest',id:'request',status:'active',intent:'order',subject:{reference:'Patient/p'},code:{coding:[{system:'urn:synthetic:request',code:'included'}]}}];
let seq=0;const rows=[];
async function fixture(kind){const emitted=core.emitCrlBundle(path.join(fixtures,'test/acceptance/passive-retention',kind,'src/crl/synthetic-interview.crl'));assert.ok(emitted.success,JSON.stringify(emitted.diagnostics));return {kind,definitions:emitted.bundle};}
async function run(f,label,qr,q,extra=[]){const request={schemaVersion:1,requestId:label,stepId:label,caseId:f.kind,planDefinitionId:'synthetic-interview',subjectReference:'Patient/p',repositoryJson:JSON.stringify({...f.definitions,entry:[...f.definitions.entry,...q?[{resource:q}]:[]]}),requestDataJson:JSON.stringify({resourceType:'Bundle',type:'collection',entry:[...base,...extra,...qr?[qr]:[]].map(resource=>({resource}))})};
 const result=await applySession(request,{outDir:path.join(out,`${++seq}-${f.kind}-${label}`)});assert.ok(result.ok,JSON.stringify(result.error));assert.ok(result.cleanupConfirmed);
 const all=resources(JSON.parse(fs.readFileSync(result.artifacts['native-result.json'].path))),qs=all.filter(r=>r.resourceType==='Questionnaire'),qrs=all.filter(r=>r.resourceType==='QuestionnaireResponse');assert.ok(qs.length<=1&&qrs.length<=1);
 const ids=new Set(all.filter(r=>r.resourceType==='RequestGroup').map(r=>r.id)),activities=[];const acts=items=>{for(const a of items||[]){if(a.resource?.reference&&!ids.has(a.resource.reference.replace(/^#/,'').split('/').pop()))activities.push(a.title);acts(a.action);}};all.filter(r=>r.resourceType==='RequestGroup').forEach(r=>acts(r.action));
 const state={q:qs[0],qr:qrs[0],activities};rows.push({kind:f.kind,label,activities,questions:flat(state.q?.item).map(i=>i.text),runtime:result.runtime});console.log(JSON.stringify(rows.at(-1)));return state;}
function edit(s,name,code){const qr=structuredClone(s.qr);qr.authored=new Date().toISOString();const q=flat(s.q.item).find(i=>i.text===`Synthetic ${name}?`);assert.ok(q,'Missing editable '+name);const item=flat(qr.item).find(i=>i.linkId===q.linkId);assert.ok(item);if(code===null)delete item.answer;else item.answer=[q.answerOption.find(a=>a.valueCoding?.code===code)];return qr;}
const names=s=>flat(s.q?.item).map(i=>i.text);
const answer=(name,code)=>({resourceType:'Observation',id:'supplied-'+name,status:'final',subject:{reference:'Patient/p'},code:{coding:[{system:'https://example.org/interview/CodeSystem/synthetic-interview-local',code:name.toLowerCase()}]},valueCodeableConcept:{coding:[{system:'urn:synthetic:four-answers',code}]}});
(async()=>{
 const f=await fixture('progressive');let s=await run(f,'start');assert.deepEqual(names(s),['Synthetic G?']);
 s=await run(f,'g-yes',edit(s,'G','true'),s.q);assert.deepEqual(names(s),['Synthetic G?','Synthetic A?']);
 s=await run(f,'a-uncertain',edit(s,'A','unknown-true'),s.q);assert.deepEqual(s.activities,['Unmet']);assert.deepEqual(names(s),['Synthetic G?','Synthetic A?']);
 s=await run(f,'repeat-uncertain',s.qr,s.q);assert.deepEqual(s.activities,['Unmet']);
 s=await run(f,'a-no',edit(s,'A','false'),s.q);assert.ok(names(s).includes('Synthetic B?'));
 s=await run(f,'b-uncertain-no',edit(s,'B','unknown-false'),s.q);assert.deepEqual(s.activities,['Unmet']);
 s=await run(f,'a-yes-retained-b',edit(s,'A','true'),s.q);assert.deepEqual(s.activities,['Unmet']);assert.ok(names(s).includes('Synthetic B?'));
 s=await run(f,'repeat-retained-b',s.qr,s.q);assert.deepEqual(s.activities,['Unmet']);
 s=await run(f,'clear-b',edit(s,'B',null),s.q);assert.deepEqual(s.activities,['Met']);assert.ok(names(s).includes('Synthetic B?'));
 s=await run(f,'repeat-clear',s.qr,s.q);assert.deepEqual(s.activities,['Met']);
 s=await run(f,'exclude-g',edit(s,'G','false'),s.q);assert.deepEqual(s.activities,['Unmet']);assert.deepEqual(names(s),['Synthetic G?']);
 s=await run(f,'reopen-g',edit(s,'G','true'),s.q);assert.deepEqual(s.activities,[]);assert.deepEqual(names(s),['Synthetic G?','Synthetic A?']);assert.ok(!flat(s.qr.item).find(i=>i.linkId===s.q.item[1].linkId).answer);
 // Supplied-later qualification must keep B, without gathering unanswered A.
 s=await run(f,'supplied-later',undefined,undefined,[answer('G','true'),answer('B','true')]);assert.deepEqual(s.activities,['Met']);assert.ok(!names(s).includes('Synthetic A?'));assert.ok(names(s).includes('Synthetic B?'));
 s=await run(f,'repeat-supplied-later',s.qr,s.q);assert.deepEqual(s.activities,['Met']);
 const n=await fixture('nested');let t=await run(n,'unused-uncertainty',undefined,undefined,[answer('G','true'),answer('A','true'),answer('B','unknown-false')]);assert.deepEqual(t.activities,['Unmet']);assert.ok(names(t).includes('Synthetic B?'));
 t=await run(n,'repeat-unused-uncertainty',t.qr,t.q);assert.deepEqual(t.activities,['Unmet']);
 // Definitively excluded passive inputs must not select conflicting later data.
 const duplicate={...answer('A','false'),id:'supplied-a-conflicting'};
 t=await run(n,'excluded-conflict',undefined,undefined,[answer('G','false'),answer('A','true'),duplicate]);assert.deepEqual(t.activities,['Unmet']);assert.deepEqual(names(t),['Synthetic G?']);
 t=await run(n,'unresolved-conflict',undefined,undefined,[answer('A','true'),duplicate]);assert.deepEqual(t.activities,[]);assert.deepEqual(names(t),['Synthetic G?']);
 // A clear must continue to override an older supplied uncertainty record on resubmit.
 t=await run(n,'older-source',undefined,undefined,[answer('G','true'),answer('A','true'),answer('B','unknown-false')]);
 t=await run(n,'clear-over-source',edit(t,'B',null),t.q,[answer('B','unknown-false')]);assert.deepEqual(t.activities,['Met']);
 t=await run(n,'repeat-clear-over-source',t.qr,t.q,[answer('B','unknown-false')]);assert.deepEqual(t.activities,['Met']);
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({passed:true,scope:'current QR only; no client restoration or pruning',rows},null,2));
})().catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),e.stack);console.error(e);process.exitCode=1});
