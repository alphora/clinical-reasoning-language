// REFACTOR:grounded: real KE candidates preserve all MV bytes; optional native cases are explicitly executed for qualification.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {loadFlags,mvFlagRevision,emitCrlTwoLane,writeTwoLane,produceResults} from '@smile-digital-health/crl';
import {planPresentationEdit} from '@smile-digital-health/crl/language-services';
import {qaFixture} from './qaFlagEditingFixture.mjs';
import {saveQuestionRequest,saveAnswerRequest} from './qaFlagEditing.ts';
import {runKeUpdates,discoverKeUpdates} from './keQaApply.ts';
import {MvEditTransaction,EditInterrupted,readEditTree} from './mvEditTransaction.ts';
import {KeAppController} from './keAppController.ts';
function fixture(){
 const f=qaFixture(),pkg=JSON.parse(readFileSync(join(f.root,'package.json'),'utf8'));pkg.crl.date='2026-10-09';writeFileSync(join(f.root,'package.json'),JSON.stringify(pkg));
 writeFileSync(f.policy,f.source.replace('library "L".','library "L".\ninclude "Terms".')+'\nactivity "Met":\n- request CPGCommunicationRequest.\ndecision "D":\n- when "Q" then recommend activity "Met".\n');
 const dir=join(f.root,'src/cel/mv');mkdirSync(dir,{recursive:true});const cel=join(dir,'cases.cel');
 writeFileSync(cel,'library "Cases". covers "L".\nfact "Patient": - name is "Synthetic". - birth date is "1970-01-01". - defined by "Patient".\nfact "Answer": - value is "yes". - date is "2026-10-09". - defined by "L"."Q".\ncase "Selected": - subject is "Patient". - fact is "Answer". - result is "D" is "Met".\ncase "Unanswered": - subject is "Patient". - result is "D" is pause.\n');
 const emission=emitCrlTwoLane(f.policy,{date:'2026-10-09',capability:'publishable'});assert.equal(emission.success,true,JSON.stringify(emission));writeTwoLane(emission,join(f.root,'src'));
 const services={storageRoot:join(f.root,'..','ke-tests-'+f.root.split(/[\\/]/).at(-1)),crlVersion:'6.4.38'};
 if(process.platform==='win32')services.storageRoot=services.storageRoot.replace(/^[A-Za-z]/,c=>c===c.toUpperCase()?c.toLowerCase():c.toUpperCase());
 const beforeClose=f.close;f.close=()=>{beforeClose();rmSync(services.storageRoot,{recursive:true,force:true});};
 const selection=()=>loadFlags(f.flags).flags.filter(f=>f.editRequest).map(f=>({id:f.id,revision:mvFlagRevision(f)}));
 const call=(operation,extra={})=>runKeUpdates({schemaVersion:1,operation,artifactRoot:f.root,requests:selection()}, {...services,...extra});
 return {...f,cel,services,call,selection};
}
function snapshot(root){const out={};function walk(dir,rel=''){for(const e of readdirSync(dir,{withFileTypes:true})){const p=rel+e.name;if(e.isDirectory())walk(join(dir,e.name),p+'/');else out[p]=readFileSync(join(dir,e.name),'utf8');}}walk(root);return out;}
function mvBytes(f){const all=snapshot(f.root);return Object.fromEntries(Object.entries(all).filter(([p])=>p.startsWith('src/medical-validation/')||p.startsWith('src/provenance/')));}
function forms(f){return Object.entries(snapshot(f.root)).filter(([p])=>p.startsWith('tests/results/fhir/')&&p.endsWith('.json')).map(([,s])=>JSON.parse(s));}
function definitions(f){return Object.entries(snapshot(f.root)).filter(([p])=>p.startsWith('src/fhir/')&&p.endsWith('.json')).map(([path,s])=>({path,resource:JSON.parse(s),bytes:s}));}
function command(f){
 const code=readFileSync(new URL('./keUpdatesCommand.ts',import.meta.url),'utf8'),source=ts.createSourceFile('command.ts',code,ts.ScriptTarget.Latest,true),decl=source.statements.find(n=>ts.isFunctionDeclaration(n));let handler;
 const c=vm.createContext({Error,Promise,join,resolve,relative,isAbsolute,runKeUpdates,vscode:{workspace:{isTrusted:true,textDocuments:[]},commands:{registerCommand:(_id,h)=>{handler=h;return{};},executeCommand:async()=>{throw Error('Cosmetic refresh unavailable');}}}});
 vm.runInContext(transformSync(decl.getText(source).replace('export function','function'),{loader:'ts',target:'es2022'}).code,c);c.registerKeUpdates({subscriptions:[],globalStorageUri:{fsPath:f.services.storageRoot},extension:{packageJSON:{version:'6.4.38'}}});return handler;
}
test('KE discovery and real preview expose current requests and never write the artifact',async()=>{
 const f=fixture();try{saveQuestionRequest(f.root,f.flags,f.wording(),'Requested?','Requested detail');saveAnswerRequest(f.root,f.flags,f.answer(),{operation:'update',system:f.system,code:'yes',display:'Requested Yes',description:'Answer detail'});
  const before=snapshot(f.root),d=discoverKeUpdates(f.root);assert.equal(d.requests.length,2);assert.equal(d.hasCrl,true);assert.equal(d.hasSource,undefined);assert.equal(d.hasFhir,true);assert.equal(d.hasCql,true);
  const p=await f.call('preview');assert.equal(p.state,'preview');assert.ok(p.changedPaths.includes('src/fhir'));assert.deepEqual(snapshot(f.root),before);
 }finally{f.close();}
});
test('KE refuses a changed selection and authored divergence without any live write',async()=>{
 const f=fixture();try{saveQuestionRequest(f.root,f.flags,f.wording(),'Requested?','');const selected=f.selection();
  await assert.rejects(()=>runKeUpdates({schemaVersion:1,operation:'preview',artifactRoot:f.root,requests:[{...selected[0],revision:'wrong'}]},f.services),/request changed/);
  writeFileSync(f.policy,readFileSync(f.policy,'utf8').replace('Authored question?','Different author?'));const before=snapshot(f.root);await assert.rejects(()=>f.call('apply'),/baseline and requested/);assert.deepEqual(snapshot(f.root),before);
 }finally{f.close();}
});
// @kit mv-wording-patches:ke-app-preview
test('KE app real preview combines final source edits, includes deleted CEL selections, and invalidates changed CEL inputs',async()=>{
 const f=fixture();try{
  saveQuestionRequest(f.root,f.flags,f.wording(),'Requested?','Detail');
  saveAnswerRequest(f.root,f.flags,f.answer(),{operation:'create',system:f.system,code:'replacement',display:'Replacement',description:'',qualifications:{'["L","Q"]':true}});
  saveAnswerRequest(f.root,f.flags,f.answer(),{operation:'delete',system:f.system,code:'yes'});
  const before=snapshot(f.root),mv=mvBytes(f),preview=await f.call('preview');assert.equal(preview.changes.length,new Set(preview.changes.map(c=>c.file)).size);
  const cel=preview.changes.find(c=>c.file==='src/cel/mv/cases.cel');assert.ok(cel);assert.match(cel.before,/- value is "yes"/);assert.doesNotMatch(cel.after,/- value is "yes"/);assert.deepEqual(preview.refreshedFolders,['tests/results','tests/data/fhir']);assert.deepEqual(snapshot(f.root),before);
  let applied=false;const c=new KeAppController(f.root,async input=>{if(input.operation==='apply'){applied=true;throw Error('Must refuse before apply');}return await runKeUpdates(input,f.services);});await c.act('refresh');c.select(c.state.requests.map(r=>r.id));await c.act('preview');writeFileSync(f.cel,readFileSync(f.cel,'utf8')+'\n// changed case input\n');await c.act('run');assert.equal(applied,false);assert.match(c.state.error,/Preview again/);assert.deepEqual(mvBytes(f),mv);
 }finally{f.close();}
});
test('ok producer outcome with failed cases blocks all live publication',async()=>{
 const f=fixture();try{saveQuestionRequest(f.root,f.flags,f.wording(),'Requested?','');const before=snapshot(f.root);let invoked=false;
  await assert.rejects(()=>f.call('apply',{produce:async()=>{invoked=true;return{ok:true,failed:1};}}),/failed or degraded/);assert.equal(invoked,true);assert.deepEqual(snapshot(f.root),before);
 }finally{f.close();}
});
test('actual KE command exposes interrupted recovery, blocks application, rolls back only its artifact',async()=>{
 const f=fixture(),other=fixture();try{
  const before=snapshot(f.root),mv=mvBytes(f),storage=join(f.services.storageRoot,'ke-updates','recovery',createHash('sha256').update(process.platform==='win32'?resolve(f.root).toLowerCase():resolve(f.root)).digest('hex'));
  const transaction=MvEditTransaction.prepare({artifactRoot:f.root,storageRoot:storage,units:[{path:f.policy,after:{kind:'file',bytes:Buffer.from('interrupted source')}},{path:join(f.root,'src/fhir'),after:readEditTree(join(other.root,'src/fhir'))}],boundary:(name,i)=>{if(name==='after-publish' && i===0)throw new EditInterrupted('Simulated termination');}});
  assert.throws(()=>transaction.publish(),EditInterrupted);const handler=command(f),discover=await handler({schemaVersion:1,operation:'discover',artifactRoot:f.root});assert.equal(discover.recoveryRequired,true);
  const blocked=await handler({schemaVersion:1,operation:'apply',artifactRoot:f.root,requests:[]});assert.equal(blocked.ok,false);assert.match(blocked.error,/interrupted KE update/);
  const otherBefore=snapshot(other.root),otherResult=await handler({schemaVersion:1,operation:'recover',artifactRoot:other.root});assert.deepEqual(otherResult.changedPaths,[]);assert.deepEqual(snapshot(other.root),otherBefore);
  const result=await handler({schemaVersion:1,operation:'recover',artifactRoot:f.root});assert.equal(result.ok,true);assert.equal(result.state,'recovered');assert.deepEqual(snapshot(f.root),before);assert.deepEqual(mvBytes(f),mv);
  assert.equal((await handler({schemaVersion:1,operation:'discover',artifactRoot:f.root})).recoveryRequired,false);
 }finally{f.close();other.close();}
});
test('KE recovery preserves conflicting external bytes and continues to block publication',async()=>{
 const f=fixture();try{
  const storage=join(f.services.storageRoot,'ke-updates','recovery',createHash('sha256').update(process.platform==='win32'?resolve(f.root).toLowerCase():resolve(f.root)).digest('hex'));
  const transaction=MvEditTransaction.prepare({artifactRoot:f.root,storageRoot:storage,units:[{path:f.policy,after:{kind:'file',bytes:Buffer.from('interrupted source')}}],boundary:name=>{if(name==='after-publish')throw new EditInterrupted('Simulated termination');}});
  assert.throws(()=>transaction.publish(),EditInterrupted);
  writeFileSync(f.policy,'external authored bytes');const handler=command(f),before=snapshot(f.root),result=await handler({schemaVersion:1,operation:'recover',artifactRoot:f.root});assert.equal(result.ok,false);assert.match(result.error,/preserving external bytes/);assert.deepEqual(snapshot(f.root),before);
  const blocked=await handler({schemaVersion:1,operation:'apply',artifactRoot:f.root,requests:[]});assert.equal(blocked.ok,false);assert.match(blocked.error,/interrupted KE update/);
 }finally{f.close();}
});
const native=process.env.CRL_KE_NATIVE_ACCEPTANCE==='1'?test:test.skip;
// @kit mv-wording-patches:ke-static-apply
native('native KE application updates definitions and static Q/QR, leaves pending MV flags untouched, repeats without writes',async()=>{
 const f=fixture();try{saveQuestionRequest(f.root,f.flags,f.wording(),'Requested question?','Requested detail');saveAnswerRequest(f.root,f.flags,f.answer(),{operation:'update',system:f.system,code:'yes',display:'Requested Yes',description:'Requested answer detail'});
  const mv=mvBytes(f),activities=definitions(f).filter(r=>r.resource.resourceType==='ActivityDefinition');assert.ok(activities.length);
  const app=new KeAppController(f.root,input=>runKeUpdates(input,f.services));await app.act('refresh');app.select(app.state.requests.map(r=>r.id));await app.act('preview');assert.equal(app.state.error,undefined);await app.act('run');assert.equal(app.state.error,undefined);const result=app.state.result;assert.equal(result.state,'changed');assert.deepEqual(mvBytes(f),mv);assert.deepEqual(definitions(f).filter(r=>r.resource.resourceType==='ActivityDefinition'),activities);
  const resources=forms(f);assert.ok(resources.some(r=>r.resourceType==='Questionnaire'));const rendered=JSON.stringify(resources);assert.match(rendered,/Requested question/);assert.match(rendered,/Requested detail/);assert.match(rendered,/Requested Yes/);
  writeFileSync('tmp/mv-ke-workflow/native-request-forms.json',JSON.stringify(resources,null,2));
  for(const type of ['ValueSet','CodeSystem'])assert.match(JSON.stringify(definitions(f).filter(r=>r.resource.resourceType===type)),/Requested answer detail/);assert.ok(loadFlags(f.flags).flags.every(f=>f.status==='open'));
  const before=snapshot(f.root),retry=await f.call('apply',{produce:async()=>{throw Error('Current repeated application must not invoke native');}});assert.equal(retry.state,'no-op');assert.deepEqual(snapshot(f.root),before);
 }finally{f.close();}
},120000);
native('matching desired source with old generated artifacts refreshes the static form',async()=>{
 const f=fixture();try{const t=f.wording();saveQuestionRequest(f.root,f.flags,t,'Already authored?','Already detail');writeFileSync(f.policy,planPresentationEdit(t.baseline,{library:t.library,concept:t.concept,questionText:'Already authored?',questionDescription:'Already detail'}).candidateSource);
  const mv=mvBytes(f),result=await f.call('apply');assert.equal(result.state,'changed');assert.match(JSON.stringify(forms(f)),/Already authored/);assert.deepEqual(mvBytes(f),mv);
 }finally{f.close();}
},120000);
native('current ordinary native forms receive missing authored help without native rerun, then repeat without writes',async()=>{
 const f=fixture();try{const t=f.wording();saveQuestionRequest(f.root,f.flags,t,'Already authored?','Already detail');writeFileSync(f.policy,planPresentationEdit(t.baseline,{library:t.library,concept:t.concept,questionText:'Already authored?',questionDescription:'Already detail'}).candidateSource);
  const emitted=emitCrlTwoLane(f.policy,{date:'2026-10-09',capability:'publishable'});assert.equal(emitted.success,true);writeTwoLane(emitted,join(f.root,'src'));
  const ordinary=await produceResults({celPath:f.root,crlPath:f.policy,definitionOptions:{date:'2026-10-09',capability:'publishable'},useCase:'prior-auth',outRoot:f.root,crlVersion:f.services.crlVersion});assert.equal(ordinary.ok,true);assert.equal(ordinary.failed,0);assert.doesNotMatch(JSON.stringify(forms(f)),/Already detail/);
  const mv=mvBytes(f),noNative={produce:async()=>{throw Error('Current native input must not run again');}},result=await f.call('apply',noNative);assert.equal(result.state,'changed');assert.deepEqual(result.changedPaths,['tests/results']);assert.match(JSON.stringify(forms(f)),/Already detail/);assert.deepEqual(mvBytes(f),mv);
  const before=snapshot(f.root),repeat=await f.call('apply',noNative);assert.equal(repeat.state,'no-op');assert.deepEqual(snapshot(f.root),before);
 }finally{f.close();}
},120000);
// @kit mv-wording-patches:deleted-selections
native('deleted selected answer is cleared in CEL, test data and static responses while expected outcome remains authored',async()=>{
 const f=fixture();try{const target=f.answer();saveAnswerRequest(f.root,f.flags,target,{operation:'create',system:f.system,code:'replacement',display:'Replacement',description:'',qualifications:{'["L","Q"]':false}});saveAnswerRequest(f.root,f.flags,target,{operation:'delete',system:f.system,code:'yes'});
  const mv=mvBytes(f),result=await f.call('apply');assert.equal(result.state,'changed');assert.deepEqual(result.clearedCases,[{file:'src/cel/mv/cases.cel',caseName:'Selected',factName:'Answer'}]);assert.match(result.message,/expected outcomes/);
  const cel=readFileSync(f.cel,'utf8');assert.doesNotMatch(cel,/- value is "yes"/);assert.match(cel,/- result is "D" is "Met"/);assert.deepEqual(mvBytes(f),mv);
  const resources=forms(f);assert.doesNotMatch(JSON.stringify(resources),/"code":"yes"/);assert.match(JSON.stringify(resources),/Replacement/);
  const data=Object.entries(snapshot(f.root)).filter(([p])=>p.startsWith('tests/data/fhir/'));assert.ok(data.length);assert.doesNotMatch(JSON.stringify(data),/\\"code\\": \\"yes\\"/);
 }finally{f.close();}
},120000);
native('actual registered KE command returns an explicit result and preserves the MV scope',async()=>{
 const f=fixture();try{saveQuestionRequest(f.root,f.flags,f.wording(),'Command question?','');const before=mvBytes(f),handler=command(f);
  const result=await handler({schemaVersion:1,operation:'apply',artifactRoot:f.root,requests:f.selection()});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.state,'changed');assert.match(JSON.stringify(forms(f)),/Command question/);assert.deepEqual(mvBytes(f),before);
 }finally{f.close();}
},120000);
