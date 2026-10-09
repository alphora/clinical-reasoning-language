import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MvEditTransaction, discoverMvEdits, EditInterrupted, readEditTree, editTreeIdentity, inspectMvEdits } from './mvEditTransaction.ts';

function fixture(boundary) {
 const root=mkdtempSync(join(tmpdir(),'mv-edit-tx-')),artifact=join(root,'artifact'),storage=join(root,'recovery');
 mkdirSync(join(artifact,'src/fhir'),{recursive:true});mkdirSync(join(artifact,'src/medical-validation'),{recursive:true});
 writeFileSync(join(artifact,'src/policy.crl'),'old question');writeFileSync(join(artifact,'src/fhir/old.json'),'old definition');
 mkdirSync(join(artifact,'src/fhir/empty'));writeFileSync(join(artifact,'src/medical-validation/policy.json'),'old passes');
 const bytes=s=>Buffer.from(s),units=[
  {path:join(artifact,'src/policy.crl'),after:{kind:'file',bytes:bytes('new question')}},
  {path:join(artifact,'src/fhir'),after:{kind:'directory',files:new Map([['new.json',bytes('new definition')]])}},
  {path:join(artifact,'src/medical-validation/policy.json'),after:{kind:'file',bytes:bytes('passes pending; failures retained')}},
  {path:join(artifact,'src/medical-validation/direct-edits/receipt.json'),after:{kind:'file',bytes:bytes('old judgments')}}
 ];
 const prepare=()=>MvEditTransaction.prepare({artifactRoot:artifact,storageRoot:storage,units,acquired:['fhir','mv'],preExisting:['crl'],scopes:['crl','fhir','mv'],boundary});
 return {root,artifact,storage,units,prepare,close:()=>rmSync(root,{recursive:true,force:true})};
}
function original(f) {
 assert.equal(readFileSync(f.units[0].path,'utf8'),'old question');
 assert.deepEqual(readdirSync(f.units[1].path).sort(),['empty','old.json']);
 assert.equal(readFileSync(f.units[2].path,'utf8'),'old passes');assert.equal(existsSync(f.units[3].path),false);
}
function updated(f) {
 assert.equal(readFileSync(f.units[0].path,'utf8'),'new question');assert.deepEqual(readdirSync(f.units[1].path),['new.json']);
 assert.equal(readFileSync(f.units[2].path,'utf8'),'passes pending; failures retained');
 assert.equal(readFileSync(f.units[3].path,'utf8'),'old judgments');
}
test('publishes complete source/definitions/sidecar/receipt and persists distinct acquired scopes',()=>{
 const f=fixture();try{
  const tx=f.prepare();original(f);assert.equal(tx.state.phase,'prepared');tx.publish();updated(f);
  assert.equal(tx.state.phase,'local-applied');assert.deepEqual(tx.state.acquired,['fhir','mv']);assert.deepEqual(tx.state.preExisting,['crl']);
  assert.ok(!readdirSync(join(f.artifact,'src')).some(n=>n.includes('.mv-edit-')));
  tx.recordSave('save-failed','push rejected');const loaded=discoverMvEdits(f.storage,f.artifact)[0];
  assert.equal(loaded.recover(),'save-failed');updated(f);loaded.recordSave('saved');
  writeFileSync(f.units[0].path,'a later ordinary edit');assert.equal(loaded.recover(),'saved');
 }finally{f.close();}
});
for(const point of ['before-move','after-backup','after-publish'])for(let ordinal=0;ordinal<4;ordinal++){
 test(`restart after ${point} at unit ${ordinal} restores all prior bytes and empty directories`,()=>{
  const f=fixture((p,i)=>{if(p===point&&i===ordinal)throw new EditInterrupted('process exited');});
  try{const tx=f.prepare();assert.throws(()=>tx.publish(),EditInterrupted);
   const restored=MvEditTransaction.load(tx.directory,f.artifact);assert.equal(restored.recover(),'rolled-back');original(f);
   assert.deepEqual(restored.state.preExisting,['crl']);assert.deepEqual(restored.state.acquired,['fhir','mv']);
  }finally{f.close();}
 });
}
test('restart after completed local publication retains unsaved changes, never repeats semantic edit',()=>{
 const f=fixture(p=>{if(p==='local-applied')throw new EditInterrupted('window closed');});
 try{const tx=f.prepare();assert.throws(()=>tx.publish(),EditInterrupted);const reload=MvEditTransaction.load(tx.directory,f.artifact);
  assert.equal(reload.recover(),'local-applied');updated(f);assert.throws(()=>reload.publish(),/already published/);
 }finally{f.close();}
});
test('caught filesystem failure rolls all units back before offering save',()=>{
 const f=fixture((p,i)=>{if(p==='after-backup'&&i===2)throw Error('disk fault');});
 try{const tx=f.prepare();assert.throws(()=>tx.publish(),/disk fault/);assert.equal(tx.state.phase,'rolled-back');original(f);
  assert.throws(()=>tx.recordSave('saved'),/no locally applied/);
 }finally{f.close();}
});
test('recovery preserves external edits and backups, leaving an explicit blocked journal',()=>{
 const f=fixture((p,i)=>{if(p==='after-publish'&&i===1)throw new EditInterrupted('window closed');});
 try{const tx=f.prepare();assert.throws(()=>tx.publish(),EditInterrupted);writeFileSync(join(f.units[1].path,'external.json'),'another writer');
  const reload=MvEditTransaction.load(tx.directory,f.artifact);assert.throws(()=>reload.recover(),/preserving external bytes/);
  assert.equal(reload.state.phase,'recovery-required');assert.equal(readFileSync(join(f.units[1].path,'external.json'),'utf8'),'another writer');
  assert.ok(existsSync(join(tx.directory,'1/before/old.json')));
 }finally{f.close();}
});
test('preflight source drift and changed backups refuse before publishing',()=>{
 const f=fixture();try{const tx=f.prepare();writeFileSync(f.units[0].path,'external source');assert.throws(()=>tx.publish(),/baseline changed/);
  assert.equal(readFileSync(f.units[2].path,'utf8'),'old passes');
  writeFileSync(join(tx.directory,'0/before'),'tampered');assert.throws(()=>MvEditTransaction.load(tx.directory,f.artifact),/backup or staged output changed/);
 }finally{f.close();}
});
test('refuses artifact escapes, linked trees, overlapping ownership, malformed journal partitions',()=>{
 const f=fixture();try{
  const opts={artifactRoot:f.artifact,storageRoot:f.storage};
  assert.throws(()=>MvEditTransaction.prepare({...opts,units:[{path:join(f.root,'escape'),after:{kind:'missing'}}]}),/outside the artifact/);
  assert.throws(()=>MvEditTransaction.prepare({...opts,units:[f.units[1],{path:join(f.units[1].path,'old.json'),after:{kind:'missing'}}]}),/nonoverlapping/);
  symlinkSync(f.units[1].path,join(f.artifact,'linked'),'junction');assert.throws(()=>MvEditTransaction.prepare({...opts,units:[{path:join(f.artifact,'linked'),after:{kind:'missing'}}]}),/Linked/);
  assert.throws(()=>MvEditTransaction.prepare({...opts,units:[f.units[0]],acquired:['crl'],preExisting:['crl'],scopes:['crl']}),/overlaps/);
  const tx=f.prepare(),file=join(tx.directory,'journal.json'),raw=JSON.parse(readFileSync(file,'utf8'));raw.units[0].path=join(f.root,'escape');writeFileSync(file,JSON.stringify(raw));
  assert.throws(()=>MvEditTransaction.load(tx.directory,f.artifact),/outside the artifact/);
 }finally{f.close();}
});
test('complete tree replacement supports deletes and an originally absent generated directory',()=>{
 const f=fixture();try{rmSync(f.units[1].path,{recursive:true});f.units[2].after={kind:'missing'};
  const tx=f.prepare();tx.publish();assert.deepEqual(readdirSync(f.units[1].path),['new.json']);assert.equal(existsSync(f.units[2].path),false);
 }finally{f.close();}
});


test('preparation refuses an external write after the caller validated the old baseline',()=>{
 const f=fixture();try{
  const expectedBefore=f.units.map(u=>editTreeIdentity(readEditTree(u.path)));
  assert.throws(()=>MvEditTransaction.prepare({artifactRoot:f.artifact,storageRoot:f.storage,units:f.units,expectedBefore,
   boundary:(point,i)=>{if(point==='before-capture'&&i===0)writeFileSync(f.units[0].path,'newer external edit');}}),/baseline changed during preparation/);
  assert.equal(readFileSync(f.units[0].path,'utf8'),'newer external edit');assert.equal(discoverMvEdits(f.storage,f.artifact).length,0);
 }finally{f.close();}
});

test('known completed publication permits subsequent notes across restart, disabling strict retry only',()=>{
 const f=fixture();try{
  const tx=f.prepare();tx.publish();tx.recordSave('save-failed','push refused');
  writeFileSync(f.units[2].path,'subsequent reviewer note');
  const loaded=MvEditTransaction.load(tx.directory,f.artifact);assert.equal(loaded.recover(),'save-failed');assert.equal(loaded.retryEligible(),false);
  assert.equal(readFileSync(f.units[2].path,'utf8'),'subsequent reviewer note');
 }finally{f.close();}
});


test('a malformed journal does not hide another recoverable interrupted edit',()=>{
 const f=fixture();try{
  const tx=f.prepare(),bad=join(f.storage,randomUUID());mkdirSync(bad);writeFileSync(join(bad,'journal.json'),'corrupt JSON');
  const inspected=inspectMvEdits(f.storage,f.artifact);assert.equal(inspected.transactions.length,1);assert.equal(inspected.errors.length,1);
  assert.equal(inspected.transactions[0].directory,tx.directory);assert.equal(inspected.transactions[0].recover(),'rolled-back');
  assert.match(inspected.errors[0].message,/JSON/);
 }finally{f.close();}
});
test('terminal metadata inspection skips historical backup hashing; explicit loading still verifies backups',()=>{
 const f=fixture();try{
  const tx=f.prepare();tx.publish();tx.recordSave('saved');
  rmSync(join(tx.directory,'0','before'),{recursive:true,force:true});
  const cheap=inspectMvEdits(f.storage,f.artifact,true);assert.equal(cheap.errors.length,0);assert.equal(cheap.transactions[0].state.phase,'saved');
  assert.equal(inspectMvEdits(f.storage,f.artifact).errors.length,1);
  const file=join(tx.directory,'journal.json'),journal=JSON.parse(readFileSync(file,'utf8'));journal.phase='save-in-flight';writeFileSync(file,JSON.stringify(journal));
  assert.equal(inspectMvEdits(f.storage,f.artifact,true).errors.length,1);
 }finally{f.close();}
});
