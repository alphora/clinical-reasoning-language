import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { coordinateDirectEdit, readScopeOperation, writeScopeOperation, inspectScopeOperations, kelpScopeMapping, DirectEditAppliedError } from './mvScopeCoordinator.ts';
import { reconcileScopeOperation } from './mvEditRecovery.ts';
import { KelpEditScopes, KelpEditError } from './kelpEditScopes.ts';
import { editTreeIdentity, readEditTree, MvEditTransaction, EditInterrupted } from './mvEditTransaction.ts';

function fixture(){
 const root=mkdtempSync(join(tmpdir(),'mv-scopes-')),artifact=join(root,'artifact'),storage=join(root,'storage');mkdirSync(artifact);
 const files=['src/crl/policy.crl','src/fhir/policy.json','src/medical-validation/policy.json'].map(p=>join(artifact,p));
 files.forEach((p,i)=>{mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,['old source','old definition','old passes'][i]);});
 const git=(args)=>execFileSync('git',args,{cwd:artifact,encoding:'utf8',windowsHide:true,shell:false});
 git(['init','-q']);git(['config','user.email','test@example.org']);git(['config','user.name','Synthetic test']);git(['add','.']);git(['commit','-qm','Initial synthetic artifact']);
 const head=git(['rev-parse','HEAD']).trim(),calls=[],id=randomUUID();
 const rows=[{key:'crl',folder:'src/crl',locked:true,heldByMe:true,owner:'me'},{key:'fhir',folder:'src/fhir',locked:false,heldByMe:false,owner:null},{key:'mv',folder:'src/medical-validation',locked:false,heldByMe:false,owner:null}]
  .map(r=>({...r,humanEditable:true,reserved:false,worktreeDirty:false}));
 const controls={pull:undefined,saveFail:false,onApplied:undefined,onSave:undefined,afterSave:undefined,onStatus:undefined,foreign:false};
 const run=async(verb,keys)=>{
  calls.push([verb,[...keys]]);
  if(verb==='lock'){
   if(controls.foreign)return {ok:false,protocolVersion:1,command:verb,error:{code:'lock-conflict',message:'peer holds fhir'}};
   keys.forEach(key=>{const r=rows.find(r=>r.key===key);r.locked=true;r.heldByMe=true;r.owner='me';});controls.pull?.();
  }
  if(verb==='status')controls.onStatus?.();
  if(verb==='save'){
   controls.onSave?.();
   if(controls.saveFail)return {ok:false,protocolVersion:1,command:verb,error:{code:'push-failed',message:'synthetic push refusal'}};
   git(['add','--',...keys.map(k=>rows.find(r=>r.key===k).folder)]);git(['commit','-qm','Synthetic MV scope save']);controls.afterSave?.();
  }
  return {ok:true,protocolVersion:1,command:verb,outcome:verb==='save'?'saved':verb,data:{entities:structuredClone(rows),frozen:false,published:null,identityResolved:true,mutationGateClear:true}};
 };
 const plan=()=>{
  const units=files.map((p,i)=>({path:p,after:{kind:'file',bytes:Buffer.from(['new source','new definition','new pending'][i])}}));
  return {id,projectRoot:artifact,publication:{date:'2026-10-08',capability:'publishable'},projectFingerprint:createHash('sha256').update(readFileSync(files[0])).digest('hex'),
   units,before:units.map(u=>editTreeIdentity(readEditTree(u.path))),changedPaths:files,contentDrift:[],sidecar:{schemaVersion:2,byCaseId:{a:'pending'}},receiptPath:files[2],definitionClosureSha256:'a'.repeat(64),baselineDefinitionClosureSha256:'b'.repeat(64),noop:false};
 };
 const options={artifactRoot:artifact,storageRoot:storage,id,scopes:new KelpEditScopes(artifact,run),plan,
  checkInputs:p=>p.units.forEach((u,i)=>assert.deepEqual(editTreeIdentity(readEditTree(u.path)),p.before[i])),onLocalApplied:()=>controls.onApplied?.()};
 const result={root,artifact,storage,files,id,rows,calls,controls,git,head,options,close:()=>rmSync(root,{recursive:true,force:true})};
 return result;
}
test('injected KELP CLI commits all changed scopes once, retaining pre-existing ownership',async()=>{
 const f=fixture();try{
  const result=await coordinateDirectEdit(f.options);assert.equal(result.state,'saved');
  assert.deepEqual(f.calls.filter(c=>c[0]==='lock'),[['lock',['fhir','mv']]]);assert.deepEqual(f.calls.filter(c=>c[0]==='save'),[['save',['crl','fhir','mv']]]);
  assert.equal(f.git(['rev-list','--count',`${f.head}..HEAD`]).trim(),'1');
  const state=readScopeOperation(result.operationFile,f.artifact);assert.deepEqual(state.acquired,['fhir','mv']);assert.deepEqual(state.preExisting,['crl']);
  assert.equal(state.phase,'saved');assert.equal(f.rows[0].heldByMe,true);assert.deepEqual(f.calls.filter(c=>c[0]==='release'),[['release',['fhir','mv']]]);
 }finally{f.close();}
});
test('pull changing source refuses candidate publication and preserves its durable acquired partition',async()=>{
 const f=fixture();try{
  f.controls.pull=()=>{writeFileSync(f.files[0],'pulled source');f.git(['add','.']);f.git(['commit','-qm','Synthetic pull']);};
  await assert.rejects(coordinateDirectEdit(f.options),/Policy inputs changed when KELP pulled/);
  assert.equal(readFileSync(f.files[0],'utf8'),'pulled source');assert.equal(readFileSync(f.files[1],'utf8'),'old definition');
  const state=readScopeOperation(join(f.storage,'operations',f.id,'scope.json'),f.artifact);assert.equal(state.phase,'no-live-change');assert.deepEqual(state.acquired,['fhir','mv']);
  assert.ok(!f.calls.some(c=>c[0]==='save'));
 }finally{f.close();}
});
test('foreign lock refusal still publishes locally without unlocking the peer',async()=>{
 const f=fixture();try{f.controls.foreign=true;f.rows[1].locked=true;f.rows[1].owner='peer';
  const result=await coordinateDirectEdit(f.options);
  assert.equal(readFileSync(f.files[0],'utf8'),'new source');assert.equal(readFileSync(f.files[1],'utf8'),'new definition');
  assert.deepEqual(readScopeOperation(result.operationFile,f.artifact).acquired,[]);assert.ok(!f.calls.some(c=>c[0]==='release'));assert.equal(f.rows[1].owner,'peer');assert.ok(!f.calls.some(c=>c[0]==='save'));
 }finally{f.close();}
});

test('KELP Save retains existing user edits in the affected scope without a separate CRL concurrency gate',async()=>{
 const f=fixture();try{
  const note=join(f.artifact,'src/medical-validation/notes.json');writeFileSync(note,'Existing user note');
  const result=await coordinateDirectEdit(f.options);assert.equal(result.state,'saved');
  assert.equal(readFileSync(note,'utf8'),'Existing user note');assert.equal(f.git(['show','HEAD:src/medical-validation/notes.json']).trim(),'Existing user note');
  assert.equal(f.calls.filter(c=>c[0]==='save').length,1);
 }finally{f.close();}
});


test('known push refusal retains applied bytes and an unsaved journal for plain Save recovery',async()=>{
 const f=fixture();try{f.controls.saveFail=true;const result=await coordinateDirectEdit(f.options);
  assert.equal(result.state,'save-failed');assert.equal(result.transaction.state.phase,'save-failed');assert.equal(readFileSync(f.files[0],'utf8'),'new source');
  assert.equal(f.git(['rev-parse','HEAD']).trim(),f.head);assert.equal(readScopeOperation(result.operationFile,f.artifact).phase,'save-failed');
 }finally{f.close();}
});
test('host refresh failure reports already applied, preserving recovery evidence and avoiding Save',async()=>{
 const f=fixture();try{f.controls.onApplied=()=>{throw Error('UI refresh fault');};
  await assert.rejects(coordinateDirectEdit(f.options),e=>e instanceof DirectEditAppliedError&&e.transaction.state.phase==='local-applied');
  assert.equal(readFileSync(f.files[0],'utf8'),'new source');assert.ok(!f.calls.some(c=>c[0]==='save'));
 }finally{f.close();}
});





for(const point of ['onSave','afterSave'])test(`interrupted KELP ${point} retains the local edit for ordinary KELP recovery`,async()=>{
 const f=fixture();try{
  f.controls[point]=()=>{throw new EditInterrupted('simulated process termination');};
  await assert.rejects(coordinateDirectEdit(f.options),EditInterrupted);
  const operation=readScopeOperation(join(f.storage,'operations',f.id,'scope.json'),f.artifact);
  assert.equal(operation.phase,'local-applied');
  const tx=MvEditTransaction.load(operation.transactionDirectory,f.artifact);assert.equal(tx.recover(),'local-applied');
  assert.equal(readFileSync(f.files[0],'utf8'),'new source');
  assert.equal(f.git(['rev-list','--count',`${f.head}..HEAD`]).trim(),point==='afterSave'?'1':'0');
 }finally{f.close();}
});




test('directory-only generated changes still require the owning FHIR lock',async()=>{
 const f=fixture();try{
  const original=f.options.plan;f.options.plan=partition=>{
   const p=original(partition),folder=join(f.artifact,'src/fhir'),tree=readEditTree(folder);
   const units=p.units.map(u=>u.path===f.files[1]?{path:folder,after:{...tree,directories:['empty-new']}}:u);
   return {...p,units,before:units.map(u=>editTreeIdentity(readEditTree(u.path))),changedPaths:p.changedPaths.filter(path=>path!==f.files[1])};
  };
  const result=await coordinateDirectEdit(f.options);assert.equal(result.state,'saved');
  assert.deepEqual(f.calls.filter(c=>c[0]==='lock'),[['lock',['fhir','mv']]]);
 }finally{f.close();}
});
















test('interrupted local publication recovers by journal byte checks despite unavailable KELP',async()=>{
 const f=fixture();try{
  f.rows.forEach(r=>{r.locked=true;r.heldByMe=true;r.owner='me';});
  const plan=f.options.plan(),tx=MvEditTransaction.prepare({artifactRoot:f.artifact,storageRoot:join(f.storage,'transactions'),units:plan.units,expectedBefore:plan.before,acquired:['fhir','mv'],preExisting:['crl'],scopes:['crl','fhir','mv'],boundary:(boundary)=>{if(boundary==='after-publish')throw new EditInterrupted('crash during publication');}});
  assert.throws(()=>tx.publish(),EditInterrupted);
  const before=f.files.map(p=>readEditTree(p)),file=join(f.storage,'operations',f.id,'scope.json');
  writeScopeOperation(file,{schemaVersion:1,id:f.id,artifactRoot:f.artifact,phase:'publishing',scopes:['crl','fhir','mv'],acquired:['fhir','mv'],preExisting:['crl'],changedPaths:f.files,transactionDirectory:tx.directory,scopeMapping:kelpScopeMapping(await f.options.scopes.status())});
  f.rows[1].heldByMe=false;f.rows[1].owner='another reviewer';
  await reconcileScopeOperation(file,f.artifact);
  assert.equal(readScopeOperation(file,f.artifact).phase,'no-live-change');assert.equal(readFileSync(f.files[0],'utf8'),'old source');assert.equal(f.rows[1].owner,'another reviewer');
 }finally{f.close();}
});
test('a corrupt scope operation does not hide another operation or its acquired-lock record',async()=>{
 const f=fixture();try{
  f.controls.saveFail=true;const result=await coordinateDirectEdit(f.options),bad=join(f.storage,'operations',randomUUID());mkdirSync(bad);
  writeFileSync(join(bad,'scope.json'),'invalid JSON');
  const inspected=inspectScopeOperations(join(f.storage,'operations'),f.artifact);
  assert.equal(inspected.operations.length,1);assert.equal(inspected.errors.length,1);assert.equal(inspected.operations[0].file,result.operationFile);
  assert.match(inspected.errors[0].file,/scope\.json$/);
 }finally{f.close();}
});
test('locked interruption becomes no-live-change while retaining exact acquired and prior partitions',async()=>{
 const f=fixture();try{
  f.rows.forEach(r=>{r.locked=true;r.heldByMe=true;r.owner='me';});
  const file=join(f.storage,'operations',f.id,'scope.json');writeScopeOperation(file,{schemaVersion:1,id:f.id,artifactRoot:f.artifact,phase:'locked',scopes:['crl','fhir','mv'],acquired:['fhir','mv'],preExisting:['crl'],changedPaths:f.files,scopeMapping:kelpScopeMapping(await f.options.scopes.status())});
  const before=f.files.map(p=>readFileSync(p,'utf8'));
  assert.match(await reconcileScopeOperation(file,f.artifact),/No policy files were published/);
  const state=readScopeOperation(file,f.artifact);assert.equal(state.phase,'no-live-change');assert.deepEqual(state.acquired,['fhir','mv']);assert.deepEqual(state.preExisting,['crl']);
  assert.deepEqual(f.files.map(p=>readFileSync(p,'utf8')),before);assert.ok(!f.calls.some(c=>c[0]==='save'||c[0]==='release'));
 }finally{f.close();}
});

for(const failure of ['no-cli','status','lock','save','release','mapping'])test(`local filesystem Save succeeds with KELP ${failure}`,async()=>{
 const f=fixture();try{
  const original=f.options.scopes.run;
  if(failure==='no-cli')f.options.scopes=undefined;
  else f.options.scopes=new KelpEditScopes(f.artifact,async(verb,keys)=>{
   if(verb===failure)return {ok:false,protocolVersion:1,command:verb,error:{code:'unavailable',message:'Synthetic KELP failure'}};
   const reply=await original(verb,keys);
   if(failure==='mapping' && verb==='status' && f.calls.some(c=>c[0]==='lock'))reply.data.entities[1].folder='src/other';
   return reply;
  });
  const result=await coordinateDirectEdit(f.options);assert.equal(readFileSync(f.files[0],'utf8'),'new source');assert.equal(readFileSync(f.files[1],'utf8'),'new definition');assert.equal(readFileSync(f.files[2],'utf8'),'new pending');
  const operation=readScopeOperation(result.operationFile,f.artifact);assert.equal(operation.localComplete,true);if(failure==='release'){assert.deepEqual(operation.acquired,['fhir','mv']);assert.equal(operation.released,undefined);}
  if(['no-cli','status','lock','mapping'].includes(failure))assert.ok(!f.calls.some(c=>c[0]==='save'||c[0]==='release'));
 }finally{f.close();}
});
test('a no-KELP interrupted local publication recovers without a CLI',async()=>{
 const f=fixture();try{
  const plan=f.options.plan(),tx=MvEditTransaction.prepare({artifactRoot:f.artifact,storageRoot:join(f.storage,'transactions'),units:plan.units,expectedBefore:plan.before,acquired:[],preExisting:[],scopes:[],boundary:b=>{if(b==='after-publish')throw new EditInterrupted('crash');}});
  assert.throws(()=>tx.publish(),EditInterrupted);
  const file=join(f.storage,'operations',f.id,'scope.json');writeScopeOperation(file,{schemaVersion:1,id:f.id,artifactRoot:f.artifact,phase:'publishing',scopes:[],acquired:[],preExisting:[],changedPaths:f.files,transactionDirectory:tx.directory});
  await reconcileScopeOperation(file,f.artifact);assert.equal(readFileSync(f.files[0],'utf8'),'old source');assert.equal(readScopeOperation(file,f.artifact).phase,'no-live-change');
 }finally{f.close();}
});

test('KELP outcome journal failure cannot negate completed local publication',async()=>{
 const f=fixture(),original=MvEditTransaction.prototype.recordSave;try{
  MvEditTransaction.prototype.recordSave=()=>{throw Error('Synthetic outcome record failure');};
  const result=await coordinateDirectEdit(f.options);assert.equal(result.state,'saved');assert.equal(readFileSync(f.files[0],'utf8'),'new source');assert.equal(readScopeOperation(result.operationFile,f.artifact).localComplete,true);assert.match(result.detail,/outcome record failure/);
 }finally{MvEditTransaction.prototype.recordSave=original;f.close();}
});

test('unmapped refreshed output saves locally without committing a stale KELP subset',async()=>{
 const f=fixture();try{
  const original=f.options.plan,extra=join(f.artifact,'unmapped/extra.json');let plans=0;f.options.plan=partition=>{const p=original(partition);if(++plans>1){p.units.push({path:extra,after:{kind:'file',bytes:Buffer.from('new extra')}});p.before.push(editTreeIdentity(readEditTree(extra)));p.changedPaths.push(extra);}return p;};
  const result=await coordinateDirectEdit(f.options);assert.equal(result.state,'local-applied');assert.equal(readFileSync(extra,'utf8'),'new extra');assert.ok(!f.calls.some(c=>c[0]==='save'||c[0]==='release'));assert.equal(readScopeOperation(result.operationFile,f.artifact).localComplete,true);
 }finally{f.close();}
});
test('final optional KELP ledger write failure preserves successful local Save',async()=>{
 const f=fixture();try{
  const run=f.options.scopes.run;f.options.scopes=new KelpEditScopes(f.artifact,async(verb,keys)=>{const reply=await run(verb,keys);if(verb==='release')mkdirSync(join(f.storage,'operations',f.id,'scope.json.tmp'));return reply;});
  const result=await coordinateDirectEdit(f.options);assert.equal(result.state,'saved');assert.equal(readFileSync(f.files[0],'utf8'),'new source');assert.equal(readScopeOperation(result.operationFile,f.artifact).localComplete,true);assert.match(result.detail,/KELP outcome record/);
 }finally{f.close();}
});

test('ambiguous lock success persists attempted scopes and unlocks them best effort',async()=>{
 const f=fixture();try{const run=f.options.scopes.run;f.options.scopes=new KelpEditScopes(f.artifact,async(verb,keys)=>{const reply=await run(verb,keys);if(verb==='lock'){const recorded=readScopeOperation(join(f.storage,'operations',f.id,'scope.json'),f.artifact);assert.deepEqual(recorded.attempted,['fhir','mv']);throw new KelpEditError('cli-outcome-unknown','Synthetic ambiguous lock',undefined,true);}return reply;});
  const result=await coordinateDirectEdit(f.options),operation=readScopeOperation(result.operationFile,f.artifact);assert.equal(readFileSync(f.files[0],'utf8'),'new source');assert.equal(operation.localComplete,true);assert.deepEqual(operation.attempted,['fhir','mv']);assert.deepEqual(operation.released,['fhir','mv']);assert.ok(f.calls.some(c=>c[0]==='release'));
 }finally{f.close();}
});
test('expanded mapped output remains local when its extra KELP scope is not owned',async()=>{
 const f=fixture();try{f.rows.push({...f.rows[1],key:'extra',folder:'additional'});const original=f.options.plan,extra=join(f.artifact,'additional/extra.json');let plans=0;f.options.plan=partition=>{const p=original(partition);if(++plans>1){p.units.push({path:extra,after:{kind:'file',bytes:Buffer.from('extra')}});p.before.push(editTreeIdentity(readEditTree(extra)));p.changedPaths.push(extra);}return p;};const result=await coordinateDirectEdit(f.options);assert.equal(readFileSync(extra,'utf8'),'extra');assert.equal(result.state,'save-failed');assert.ok(!f.calls.some(c=>c[0]==='save'));assert.match(result.detail,/extra/);assert.equal(readScopeOperation(result.operationFile,f.artifact).localComplete,true);
 }finally{f.close();}
});
test('older completed local records become terminal on recovery without KELP',async()=>{
 const f=fixture();try{const file=join(f.storage,'operations',f.id,'scope.json');writeScopeOperation(file,{schemaVersion:1,id:f.id,artifactRoot:f.artifact,phase:'local-applied',scopes:[],acquired:[],preExisting:[],changedPaths:f.files});await reconcileScopeOperation(file,f.artifact);assert.equal(readScopeOperation(file,f.artifact).localComplete,true);}finally{f.close();}
});

test('completion metadata failure after host refresh does not negate local Save',async()=>{
 const f=fixture();try{
  f.options.scopes=undefined;f.controls.onApplied=()=>mkdirSync(join(f.storage,'operations',f.id,'scope.json.tmp'));
  const result=await coordinateDirectEdit(f.options);assert.equal(result.state,'local-applied');assert.equal(readFileSync(f.files[0],'utf8'),'new source');assert.equal(readFileSync(f.files[1],'utf8'),'new definition');assert.match(result.detail,/Local outcome record/);
 }finally{f.close();}
});

test('partial ambiguous lock cleanup releases only scopes currently held by this edit',async()=>{
 const f=fixture();try{
  const run=f.options.scopes.run;f.options.scopes=new KelpEditScopes(f.artifact,async(verb,keys)=>{const reply=await run(verb,keys);if(verb==='lock'){f.rows[2].heldByMe=false;f.rows[2].owner='peer';throw new KelpEditError('cli-outcome-unknown','Partial ambiguous lock',undefined,true);}return reply;});
  const result=await coordinateDirectEdit(f.options),operation=readScopeOperation(result.operationFile,f.artifact);assert.equal(readFileSync(f.files[0],'utf8'),'new source');assert.deepEqual(operation.released,['fhir']);assert.deepEqual(f.calls.filter(c=>c[0]==='release'),[['release',['fhir']]]);assert.equal(f.rows[2].owner,'peer');assert.ok(!f.calls.some(c=>c[0]==='save'));
 }finally{f.close();}
});

test('successful KELP Save receipt excludes earlier recoverable lock diagnostics',async()=>{
 const f=fixture();try{
  const run=f.options.scopes.run;f.options.scopes=new KelpEditScopes(f.artifact,async(verb,keys)=>{const reply=await run(verb,keys);if(verb==='lock')throw new KelpEditError('cli-outcome-unknown','Recovered transport failure',undefined,true);return reply;});
  const result=await coordinateDirectEdit(f.options);assert.equal(result.state,'saved');assert.match(result.detail,/Recovered transport failure/);assert.equal(result.transaction.state.detail,undefined);
 }finally{f.close();}
});

test('rolled-back operation recovery does not claim the edit was saved',async()=>{
 const f=fixture();try{const file=join(f.storage,'operations',f.id,'scope.json');writeScopeOperation(file,{schemaVersion:1,id:f.id,artifactRoot:f.artifact,phase:'no-live-change',scopes:[],acquired:[],preExisting:[],changedPaths:f.files});assert.match(await reconcileScopeOperation(file,f.artifact),/No local publication/);assert.equal(readScopeOperation(file,f.artifact).localComplete,undefined);}finally{f.close();}
});
