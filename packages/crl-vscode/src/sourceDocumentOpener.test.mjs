import assert from 'node:assert/strict';
import { createReadonlySourceOpener, readonlyDocumentPattern } from './sourceDocumentOpener.ts';

function fixture(){
  const calls=[],include={prior:true},uri=file=>({fsPath:file,toString:()=>file});
  let effective={},workspaceValues=include;
  const config={get:(key,fallback)=>key==='readonlyInclude'?{...effective,...workspaceValues}:fallback,inspect:()=>({workspaceFolderValue:workspaceValues}),update:async(key,value,target)=>{calls.push(['update',key,value,target]);workspaceValues=value;}};
  const api={Uri:{file:uri},ConfigurationTarget:{WorkspaceFolder:3,Workspace:2},ViewColumn:{Beside:-2},RelativePattern:class{constructor(base,pattern){Object.assign(this,{base,pattern});}},
    workspace:{workspaceFolders:[{uri:uri('/workspace')}],getWorkspaceFolder:()=>({uri:uri('/workspace')}),getConfiguration:()=>config,textDocuments:[]},
    extensions:{getExtension:()=>({activate:async()=>{}})},window:{tabGroups:{all:[]}},languages:{match:()=>0},commands:{getCommands:async()=>['markdown.showLockedPreviewToSide'],executeCommand:async(...args)=>{calls.push(args);}}};
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

test('Markdown reports use the same exact-file editor read-only safeguards and a locked preview without a text-editor open',async()=>{
  const f=fixture(),file='/workspace/tests/reprocess-log.md';await f.open(file,()=>{},'markdown-preview');
  assert.deepEqual(f.calls[0],['update','readonlyInclude',{prior:true,[file]:true},3]);
  assert.equal(f.calls.filter(x=>x[0]==='vscode.open').length,0);
  assert.equal(f.calls.at(-1)[0],'markdown.showLockedPreviewToSide');assert.equal(f.calls.at(-1)[1].fsPath,file);assert.equal(f.calls.at(-1).length,2);
  f.api.workspace.textDocuments=[{uri:f.api.Uri.file(file),isDirty:true}];
  const count=f.calls.length;await assert.rejects(f.open(file,()=>{},'markdown-preview'),/unsaved edits/);assert.equal(f.calls.length,count);
});

test('missing or failed Markdown activation/command is detected before any durable read-only setting',async()=>{
  for(const unavailable of ['extension','activation','command']){
    const f=fixture();
    f.api.commands.getCommands=async()=>[];
    if(unavailable==='extension')f.api.extensions.getExtension=()=>undefined;
    else if(unavailable==='activation')f.api.extensions.getExtension=()=>({activate:async()=>{throw Error('Disabled');}});
    else f.api.commands.getCommands=async()=>[];
    await assert.rejects(f.open('/workspace/tests/reprocess-log.md',()=>{},'markdown-preview'),/Markdown preview is unavailable/);
    assert.equal(f.calls.length,0);
  }
});

test('an available preview command can be owned by another extension host without a local extension object',async()=>{
  const f=fixture();f.api.extensions.getExtension=()=>undefined;
  await f.open('/workspace/tests/reprocess-log.md',()=>{},'markdown-preview');
  assert.equal(f.calls.at(-1)[0],'markdown.showLockedPreviewToSide');
});

test('stalled preview discovery times out without holding source opens or writing settings after late activation',async()=>{
  vi.useFakeTimers();
  try{
    const f=fixture();let finishActivation;
    f.api.commands.getCommands=async()=>[];
    f.api.extensions.getExtension=()=>({activate:()=>new Promise(resolve=>finishActivation=resolve)});
    const pending=f.open('/workspace/tests/reprocess-log.md',()=>{},'markdown-preview');
    const rejected=assert.rejects(pending,/Markdown preview startup timed out/);
    await Promise.resolve();await Promise.resolve();assert.ok(finishActivation);
    await f.open('/workspace/source/a.pdf');assert.equal(f.calls.at(-1)[0],'vscode.open');
    await vi.advanceTimersByTimeAsync(10_000);await rejected;
    const count=f.calls.length;f.api.commands.getCommands=async()=>['markdown.showLockedPreviewToSide'];finishActivation();
    await Promise.resolve();await Promise.resolve();assert.equal(f.calls.length,count);
    assert.ok(!f.calls.some(call=>call[0]==='markdown.showLockedPreviewToSide'));
  }finally{vi.useRealTimers();}
});

test('a stalled command registry lookup also times out without changing settings',async()=>{
  vi.useFakeTimers();
  try{
    const f=fixture();f.api.commands.getCommands=()=>new Promise(()=>{});
    const pending=assert.rejects(f.open('/workspace/tests/reprocess-log.md',()=>{},'markdown-preview'),/Markdown preview startup timed out/);
    await vi.advanceTimersByTimeAsync(10_000);await pending;assert.equal(f.calls.length,0);
  }finally{vi.useRealTimers();}
});

test('terminal preview commands retain existing serialized-open behavior and release queued source opens when settled',async()=>{
  const f=fixture(),execute=f.api.commands.executeCommand;let complete;
  f.api.commands.executeCommand=async(...args)=>{await execute(...args);if(args[0]==='markdown.showLockedPreviewToSide')await new Promise(resolve=>complete=resolve);};
  const first=f.open('/workspace/tests/reprocess-log.md',()=>{},'markdown-preview');
  await vi.waitFor(()=>assert.ok(complete));const second=f.open('/workspace/source/a.pdf');await Promise.resolve();
  assert.ok(!f.calls.some(call=>call[0]==='vscode.open'));
  complete();await first;await second;assert.equal(f.calls.at(-1)[0],'vscode.open');
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
