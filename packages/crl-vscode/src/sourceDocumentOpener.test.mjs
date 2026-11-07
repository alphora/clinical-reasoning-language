import assert from 'node:assert/strict';
import { createReadonlySourceOpener, readonlyDocumentPattern } from './sourceDocumentOpener.ts';

function fixture(){
  const calls=[],include={prior:true},uri=file=>({fsPath:file,toString:()=>file});
  let effective={},workspaceValues=include;
  const config={get:(key,fallback)=>key==='readonlyInclude'?{...effective,...workspaceValues}:fallback,inspect:()=>({workspaceFolderValue:workspaceValues}),update:async(key,value,target)=>{calls.push(['update',key,value,target]);workspaceValues=value;}};
  const api={Uri:{file:uri},ConfigurationTarget:{WorkspaceFolder:3,Workspace:2},ViewColumn:{Beside:-2},RelativePattern:class{constructor(base,pattern){Object.assign(this,{base,pattern});}},
    workspace:{workspaceFolders:[{uri:uri('/workspace')}],getWorkspaceFolder:()=>({uri:uri('/workspace')}),getConfiguration:()=>config,textDocuments:[]},
    window:{tabGroups:{all:[]}},languages:{match:()=>0},commands:{executeCommand:async(...args)=>{calls.push(args);}}};
  return {api,calls,config,open:createReadonlySourceOpener(api),effective:value=>effective=value};
}
test('sets only exact-file editor read-only before default open and preserves scoped settings without copying user settings',async()=>{
  const f=fixture();f.effective({user:true});await f.open('/workspace/source/policy.txt');
  assert.deepEqual(f.calls[0],['update','readonlyInclude',{prior:true,'/workspace/source/policy.txt':true},3]);
  assert.equal(f.calls[1][0],'vscode.open');assert.deepEqual(f.calls[1][2],{viewColumn:-2,preview:false});
  await f.open('/workspace/source/policy.txt');assert.equal(f.calls.filter(x=>x[0]==='update').length,1);
});
test('literal glob characters do not broaden read-only scope',()=>{
  assert.equal(readonlyDocumentPattern('E:\\policy\\a[1]*?.pdf'),'E:/policy/a[[]1[]][*][?].pdf');
});
test('dirty documents and custom tabs are refused without changing settings or opening',async()=>{
  const f=fixture(),file='/workspace/source/a.docx';f.api.window.tabGroups.all=[{tabs:[{isDirty:true,input:{uri:f.api.Uri.file(file)}}]}];
  await assert.rejects(f.open(file),/unsaved edits/);assert.deepEqual(f.calls,[]);
  f.api.window.tabGroups.all=[];f.api.workspace.textDocuments=[{uri:f.api.Uri.file(file),isDirty:true}];
  await assert.rejects(f.open(file),/unsaved edits/);assert.deepEqual(f.calls,[]);
});
test('config failure never opens writable and does not poison subsequent opens',async()=>{
  const f=fixture(),update=f.config.update;f.config.update=async()=>{throw Error('Configuration denied');};
  await assert.rejects(f.open('/workspace/a.pdf'),/Configuration denied/);assert.deepEqual(f.calls,[]);
  f.config.update=update;await f.open('/workspace/a.pdf');assert.equal(f.calls.at(-1)[0],'vscode.open');
});
test('serializes settings writes; validates policy and file identity again after asynchronous configuration',async()=>{
  const f=fixture();let complete;const update=f.config.update;
  f.config.update=async(...args)=>{if(!complete)await new Promise(resolve=>complete=resolve);await update(...args);};
  let current=true;
  const first=f.open('/workspace/a.txt',()=>{if(!current)throw Error('policy changed');});
  await vi.waitFor(()=>assert.ok(complete));const second=f.open('/workspace/b.txt');current=false;complete();
  await assert.rejects(first,/policy changed/);await second;
  assert.equal(f.calls.filter(x=>x[0]==='vscode.open').length,1);assert.equal(f.calls.at(-1)[1].fsPath,'/workspace/b.txt');
  assert.equal(f.calls.filter(x=>x[0]==='update').at(-1)[2]['/workspace/a.txt'],true);
});
test('explicit matching read-only exclusions and absent workspace context prevent silent writable opens',async()=>{
  const f=fixture(),get=f.config.get;f.config.get=(key,fallback)=>key==='readonlyExclude'?{'**/*.pdf':true}:get(key,fallback);f.api.languages.match=()=>10;
  await assert.rejects(f.open('/workspace/a.pdf'),/readonlyExclude/);assert.deepEqual(f.calls,[]);
  f.api.workspace.workspaceFolders=[];f.api.workspace.getWorkspaceFolder=()=>undefined;
  await assert.rejects(f.open('/outside/a.pdf'),/policy workspace/);
});
