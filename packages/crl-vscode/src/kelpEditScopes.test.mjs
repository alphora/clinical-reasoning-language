import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KelpEditScopes, changedKelpScopes, parseKelpStatus, findKelpProject, kelpArtifactRoot, resolveKelpEntry, createKelpRunner } from './kelpEditScopes.ts';

function fake() {
 const rows=[{key:'crl',folder:'src/crl',locked:true,heldByMe:true,owner:'me',worktreeDirty:false},
  {key:'fhir',folder:'src/fhir',locked:false,heldByMe:false,owner:null,worktreeDirty:false},
  {key:'mv',folder:'src/medical-validation',locked:false,heldByMe:false,owner:null,worktreeDirty:false}]
  .map(row=>({...row,humanEditable:true,reserved:false}));
 const calls=[],state={rows,fail:undefined};
 const run=async(verb,keys)=>{
  calls.push([verb,[...keys]]);
  if(state.fail===verb)return {ok:false,protocolVersion:1,command:verb,error:{code:'lock-conflict',message:'remote holder'}};
  if(verb==='lock')for(const r of rows)if(keys.includes(r.key)){r.locked=true;r.heldByMe=true;r.owner='me';}
  if(verb==='release')for(const r of rows)if(keys.includes(r.key)){r.locked=false;r.heldByMe=false;r.owner=null;}
  return {ok:true,protocolVersion:1,command:verb,data:{entities:structuredClone(rows),frozen:false,published:null,identityResolved:true,mutationGateClear:true},outcome:'saved'};
 };
 return {...state,state,calls,client:new KelpEditScopes(join(tmpdir(),'artifact'),run)};
}
test('actual folder mapping includes only changed scopes and refuses unmapped/escaping paths',async()=>{
 const f=fake(),status=await f.client.status(),root=f.client.artifact;
 assert.deepEqual(changedKelpScopes(root,status,[join(root,'src/crl/q.crl'),join(root,'src/medical-validation/direct-edits/id.json')]),['crl','mv']);
 assert.throws(()=>changedKelpScopes(root,status,[join(root,'misc/file')]),/unique editable/);
 assert.throws(()=>changedKelpScopes(root,status,[join(root,'../other/file')]),/outside/);
});
test('self-held scopes are subtracted and remaining scopes lock together; only acquired scopes release',async()=>{
 const f=fake(),partition=await f.client.acquire(['mv','crl','fhir']);
 assert.deepEqual(partition,{acquired:['fhir','mv'],preExisting:['crl']});
 assert.deepEqual(f.calls.filter(c=>c[0]==='lock'),[['lock',['fhir','mv']]]);
 await f.client.save(['crl','fhir','mv']);
 assert.deepEqual(f.calls.filter(c=>c[0]==='save'),[['save',['crl','fhir','mv']]]);
 await f.client.releaseAcquired(['crl','fhir','mv'],partition.preExisting);
 assert.deepEqual(f.calls.filter(c=>c[0]==='release'),[['release',['fhir','mv']]]);
 assert.equal(f.state.rows[0].heldByMe,true);
});
test('foreign, UNKNOWN and remote lock failure refuse without save or partial acquisition',async()=>{
 const f=fake();f.state.rows[1]={...f.state.rows[1],locked:true,owner:'peer'};
 await assert.rejects(f.client.acquire(['fhir']),/locked by peer/);assert.equal(f.calls.some(c=>c[0]==='lock'),false);
 f.state.rows[1].locked=false;f.state.rows[1].owner=null;f.state.fail='lock';
 await assert.rejects(f.client.acquire(['fhir','mv']),/remote holder/);
 assert.equal(f.state.rows[1].heldByMe,false);assert.equal(f.state.rows[2].heldByMe,false);
 const bad=new KelpEditScopes(f.client.artifact,async()=>({ok:false,protocolVersion:1,command:'status',error:{code:'unrecognized-record',message:'UNKNOWN'}}));
 await assert.rejects(bad.acquire(['fhir']),/UNKNOWN/);
 assert.equal(f.calls.some(c=>c[0]==='save'),false);
});
test('scope ownership is checked again after lock and before save',async()=>{
 const f=fake();await f.client.acquire(['fhir']);f.state.rows[1].heldByMe=false;
 await assert.rejects(f.client.save(['fhir']),/ownership.*fhir/);assert.equal(f.calls.some(c=>c[0]==='save'),false);
});

test('uncertain cleanup releases the currently owned subset and protects prior and foreign scopes',async()=>{
 const f=fake();await f.client.acquire(['fhir']);f.state.rows[2].locked=true;f.state.rows[2].owner='peer';
 assert.deepEqual(await f.client.releaseAcquired(['crl','fhir','mv'],['crl']),['fhir']);
 assert.deepEqual(f.calls.filter(c=>c[0]==='release'),[['release',['fhir']]]);assert.equal(f.state.rows[0].heldByMe,true);assert.equal(f.state.rows[2].owner,'peer');
});
test('status rejects malformed mappings, frozen/published state and duplicate identities',()=>{
 const f=fake(),data={entities:f.rows,frozen:false,published:null,identityResolved:true,mutationGateClear:true};
 for(const altered of [{...data,frozen:true},{...data,published:{name:'policy',version:'1',at:'opaque',owner:'me'}},
  {...data,published:false},{...data,identityResolved:false},{...data,mutationGateClear:false},{...data,entities:[...f.rows,f.rows[0]]},
  {...data,entities:[{...f.rows[0],folder:'../escape'}]}]) {
  assert.throws(()=>parseKelpStatus({ok:true,protocolVersion:1,command:'status',data:altered},f.client.artifact));
 }
});

test('peer status contract accepts null publication and same-shape builtin source while refusing endpoint scopes',()=>{
 const f=fake(),entity=(key,folder,editable)=>({key,folder,locked:false,heldByMe:false,owner:null,worktreeDirty:false,humanEditable:editable,reserved:true});
 const data={entities:[...f.rows,entity('source','src/source',true),entity('package','package',false),entity('publish','publish',false)],frozen:false,published:null,identityResolved:true,mutationGateClear:true};
 const status=parseKelpStatus({ok:true,protocolVersion:1,command:'status',data},f.client.artifact);
 assert.deepEqual(changedKelpScopes(f.client.artifact,status,[join(f.client.artifact,'src/source/policy.pdf')]),['source']);
 assert.throws(()=>changedKelpScopes(f.client.artifact,status,[join(f.client.artifact,'package/artifact.zip')]),/unique editable/);
 assert.throws(()=>changedKelpScopes(f.client.artifact,status,[join(f.client.artifact,'publish/record.json')]),/unique editable/);
});
test('nested managed discovery does not become standalone on malformed configuration',()=>{
 const root=mkdtempSync(join(tmpdir(),'kelp-discovery-'));
 try {
  const nested=join(root,'artifacts','policy');mkdirSync(nested,{recursive:true});
  const cfg=join(root,'kelp.project.json');writeFileSync(cfg,JSON.stringify({project:{schemaVersion:1,structure:{entities:[]}}}));
  assert.equal(findKelpProject(nested),cfg);
  writeFileSync(cfg,'invalid');assert.throws(()=>findKelpProject(nested),/managed KELP/);
  assert.equal(resolveKelpEntry({}),undefined);
  assert.throws(()=>resolveKelpEntry({setting:'kelp.cmd'}),/absolute JavaScript/);
 } finally {rmSync(root,{recursive:true,force:true});}
});
test('real Node launcher uses the artifact cwd, Electron Node mode and one JSON envelope without shell',async()=>{
 const root=mkdtempSync(join(tmpdir(),'kelp-launch-'));
 try {
  const entry=join(root,'fake.mjs');
  writeFileSync(entry,"console.log(JSON.stringify({ok:true,protocolVersion:1,command:process.argv[2],data:{cwd:process.cwd(),nodeMode:process.env.ELECTRON_RUN_AS_NODE,args:process.argv.slice(3)}}));");
  const run=createKelpRunner(entry,root);
  const reply=await run('lock',['crl','fhir']);
  assert.equal(reply.data.cwd,root);assert.equal(reply.data.nodeMode,'1');assert.deepEqual(reply.data.args,['crl','fhir']);
  writeFileSync(entry,"console.log('{}');console.log('{}');");
  await assert.rejects(run('save',['crl']),e=>e.code==='cli-outcome-unknown'&&e.ambiguous);
 } finally {rmSync(root,{recursive:true,force:true});}
});


test('managed output root uses the shallowest artifact package, ignoring nested emitted FHIR packages',()=>{
 const root=mkdtempSync(join(tmpdir(),'kelp-layout-'));try{
  const artifact=join(root,'artifacts','group','policy'),nested=join(artifact,'src/fhir');mkdirSync(nested,{recursive:true});
  writeFileSync(join(artifact,'package.json'),'{}');writeFileSync(join(nested,'package.json'),'{}');
  assert.equal(kelpArtifactRoot(nested,join(root,'kelp.project.json')),artifact);
  assert.throws(()=>kelpArtifactRoot(join(root,'other'),join(root,'kelp.project.json')),/outside the managed artifacts/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
