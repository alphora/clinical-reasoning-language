'use strict';
// Installed-artifact qualification: reused six-step generic session assertions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {applySession,buildSessionResponse}=require(require('node:path').join(process.env.CRL_TEST_PACKAGE,'dist/results/session'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const objects=x=>!x||typeof x!=='object'?[]:[x,...Object.values(x).flatMap(v=>Array.isArray(v)?v.flatMap(objects):objects(v))];
const one=(x,type)=>{const xs=objects(x).filter(x=>x.resourceType===type);assert.equal(xs.length,1,type);return xs[0]};
const itemPaths=(items,prefix='/item')=>(items??[]).flatMap((item,i)=>[{item,pointer:prefix+'/'+i},...itemPaths(item.item,prefix+'/'+i+'/item')]);
const find=(qr,slug)=>itemPaths(qr.item).find(x=>x.item.definition?.includes('-'+slug+'#'));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]);
const {emitCrlBundle}=require(process.env.CRL_TEST_PACKAGE);
const {INTAKE_CRL}=require(path.join(process.env.CRL_TEST_PACKAGE,'dist/authoring-kit/intakeExample'));
const fixture=path.join(path.dirname(out),'intake-source');fs.mkdirSync(fixture,{recursive:true});
fs.writeFileSync(path.join(fixture,'package.json'),JSON.stringify({name:'intake-native',version:'1.0.0',crl:{canonicalBase:'https://example.org/intake',date:'2026-09-21'}}));
const source=INTAKE_CRL.replace('decision "Intake":','activity "Missing": - request CPGCommunicationRequest. - with `MISSING`.\ndecision "Intake":').replace('otherwise then recommend activity "Human Review".','otherwise then recommend activity "Missing".');
fs.writeFileSync(path.join(fixture,'policy.crl'),source);
const emitted=emitCrlBundle(path.join(fixture,'policy.crl'));assert(emitted.success,JSON.stringify(emitted));
const base=emitted.bundle;assert(!base.entry.some(e=>e.resource.resourceType==='Questionnaire'));base.entry.push({resource:{resourceType:'Patient',id:'p'}});
const baseText=JSON.stringify(base),subject='Patient/'+base.entry.find(e=>e.resource.resourceType==='Patient').resource.id;
const engine=JSON.parse(fs.readFileSync(process.env.CRL_TEST_ENGINE));
(async()=>{
 fs.mkdirSync(out);fs.writeFileSync(path.join(out,'base.json'),baseText);
 let q,qr; const state=new Map(), ids=new Map(),rows=[];
 for(const [step,slug,value] of [['empty'],['answer-a','primary-diagnosis','Alpha'],['answer-b','treatment-begun',false],['answer-c','additional-information','Details'],['change-a','primary-diagnosis','Beta'],['clear-a','primary-diagnosis',undefined]]){
  const authored='2030-01-0'+(rows.length+1)+'T12:00:00Z';
  let submitted;const priorB=state.get(ids.get('treatment-begun'));
  if(slug){const target=find(qr,slug);assert(target);submitted=JSON.parse(buildSessionResponse(JSON.stringify(q),JSON.stringify(qr),{expectedResponseSha256:hash(JSON.stringify(qr)),authored,mode:'edits-only',edits:[value===undefined?{pointer:target.pointer,operation:'clear'}:{pointer:target.pointer,operation:'set',answersJson:JSON.stringify([{[typeof value==='boolean'?'valueBoolean':'valueString']:value}])}]}));assert.equal(submitted.item.length,1);}
  const repo={...base,entry:[...base.entry,...(q?[{resource:q}]:[])]};
  const data={resourceType:'Bundle',type:'collection',entry:[...state.entries()].filter(([id])=>id!==ids.get(slug)).map(([,resource])=>({resource})).concat(submitted?[{resource:submitted}]:[])};
  const result=await applySession({schemaVersion:1,requestId:'cumulative-'+step,caseId:'synthetic-intake',stepId:step,planDefinitionId:'intake-native',subjectReference:subject,repositoryJson:JSON.stringify(repo),requestDataJson:JSON.stringify(data),engine},{outDir:path.join(out,step),limits:{timeoutMs:120000}});
  assert(result.ok,JSON.stringify(result.error));assert(result.cleanupConfirmed);
  const native=read(result.artifacts['native-result.json'].path);q=one(native,'Questionnaire');qr=one(native,'QuestionnaireResponse');
  const activity=one(native,'CommunicationRequest');assert.deepEqual(activity.payload,[{contentString:['answer-c','change-a'].includes(step)?'HUMAN_REVIEW':'MISSING'}]);
  if(slug){const dataAfter=read(result.artifacts['native-data.json'].path);const matches=dataAfter.entry.map(e=>e.resource).filter(r=>r.resourceType==='Observation'&&r.meta?.profile?.some(p=>p.split('|')[0].endsWith('-'+slug))&&r.effectiveDateTime===authored);assert.equal(matches.length,1,'one new extraction for '+slug);const extracted=matches[0];assert(extracted.id);if(ids.has(slug))assert.equal(extracted.id,ids.get(slug));else ids.set(slug,extracted.id);state.set(extracted.id,extracted);assert.equal(extracted[slug==='treatment-begun'?'valueBoolean':'valueString'],value);}
  if(priorB&&slug!=='treatment-begun'){assert.deepEqual(state.get(ids.get('treatment-begun')),priorB);const b=find(qr,'treatment-begun').item;assert.deepEqual(b.answer,[{valueBoolean:false}]);}
  if(step==='answer-b')assert.equal(find(qr,'primary-diagnosis').item.answer[0].valueString,'Alpha');
  if(step==='clear-a')assert(!find(qr,'primary-diagnosis').item.answer);
  assert.equal(fs.readFileSync(path.join(out,'base.json'),'utf8'),baseText);
  rows.push({step,ok:true,nativeMs:result.nativeMs,state:[...state.values()]});fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(rows,null,2));console.log(step,'passed');
 }
 const before=JSON.stringify([...state]);assert.throws(()=>buildSessionResponse(JSON.stringify(q),JSON.stringify(qr),{expectedResponseSha256:hash(JSON.stringify(qr)),authored:'2030-01-07T12:00:00Z',mode:'edits-only',edits:[{pointer:find(qr,'primary-diagnosis').pointer,operation:'set',answersJson:'[{"valueBoolean":true}]'}]}),/Expected valueString/);assert.equal(JSON.stringify([...state]),before);
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,scope:'Installed API, upstream dcac972 engine. Explicit singleton resource identities retained by this synthetic caller.',baseSha256:hash(baseText),engine,rows,invalidEditPreservedState:true},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
