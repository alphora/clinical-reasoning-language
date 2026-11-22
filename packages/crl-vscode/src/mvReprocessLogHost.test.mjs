import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, unlinkSync, renameSync, symlinkSync, truncateSync } from 'node:fs';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import { transformSync } from 'esbuild';
import { vi } from 'vitest';
import { resolveMvReprocessLog, MV_REPROCESS_LOG_MAX_BYTES } from './mvReprocessLog.ts';
import { createReadonlySourceOpener, ReadonlyDocumentError } from './sourceDocumentOpener.ts';
import { findPolicySrc } from './provenanceFindings.ts';
import { COCKPIT_WEBVIEW_SCRIPT } from './correspondenceCockpit.ts';
import { captureNautilusLog, hasNautilusLog } from './nautilusLogState.ts';
import { renderMvTreeChrome } from './mvTreeChrome.ts';

const source=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'correspondenceCockpit.ts'),'utf8');
const parsed=ts.createSourceFile('cockpit.ts',source,ts.ScriptTarget.Latest,true);
let fn;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='openMvFixLog')fn=node;ts.forEachChild(node,visit);}visit(parsed);assert.ok(fn);

function fixture(layout='artifacts/policy'){
  const temp=realpathSync(tmpdir()),root=mkdtempSync(join(temp,'crl-mv-fix-host-')),artifact=join(root,layout),src=join(artifact,'src');
  mkdirSync(join(src,'crl'),{recursive:true});mkdirSync(join(src,'cel'));writeFileSync(join(artifact,'package.json'),'{}');
  const cel=join(src,'cel/policy.cel');writeFileSync(cel,'Synthetic; no evaluation');
  const config=folder=>writeFileSync(join(root,'kelp.project.json'),JSON.stringify({project:{schemaVersion:1,structure:{entities:folder?[{key:'medical-validation',folder,producer:'script'}]:[]}}}));config('src/medical-validation');
  const file=(path,text)=>{const p=join(artifact,path);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,text);return p;};
  const flag=file('src/medical-validation/flags/keep.json','{"status":"open"}');
  return {root,artifact,src,cel,config,file,flag,close(){const rel=relative(temp,realpathSync(root));assert.ok(rel&&!isAbsolute(rel)&&!rel.startsWith('..'));rmSync(root,{recursive:true,force:true});}};
}
function host(f){
  const calls=[],messages=[],uri=fsPath=>({fsPath,scheme:'file',toString:()=>fsPath});let readonly={};
  const config={get:(key,fallback)=>key==='readonlyInclude'?readonly:fallback,inspect:()=>({workspaceFolderValue:readonly}),update:async(key,value)=>{readonly=value;calls.push(['setting',key,value]);}};
  const api={Uri:{file:uri},ViewColumn:{Beside:-2},ConfigurationTarget:{WorkspaceFolder:3,Workspace:2},RelativePattern:class{},
    workspace:{textDocuments:[],workspaceFolders:[{uri:uri(f.root)}],getWorkspaceFolder:()=>({uri:uri(f.root)}),getConfiguration:()=>config},
    window:{tabGroups:{all:[]},showInformationMessage:text=>messages.push(['info',text]),showWarningMessage:text=>messages.push(['warning',text])},
    extensions:{getExtension:()=>({activate:async()=>{}})},languages:{match:()=>0},commands:{getCommands:async()=>['markdown.showLockedPreviewToSide'],executeCommand:async(...args)=>{calls.push(args);}}};
  const c=vm.createContext({sourceDocumentsSnapshot:{cel:f.cel,src:f.src,sourceIdentity:realpathSync(f.src),token:'owned',documents:[]},mvFixLogBusy:false,mode:'medical-validation',currentCel:f.cel,
    nautilusLogSnapshot:{cel:f.cel,src:f.src,sourceIdentity:realpathSync(f.src),token:'owned',report:resolveMvReprocessLog(f.src)},
    isDeepStrictEqual,renderTreeChrome:()=>calls.push(['chrome']),realpathSync,findPolicySrc,resolveMvReprocessLog,ReadonlyDocumentError,openReadonlySourceDocument:createReadonlySourceOpener(api),vscode:api});
  vm.runInContext(transformSync(fn.getText(parsed),{loader:'ts'}).code,c);
  return {c,api,config,calls,messages,opens:()=>calls.filter(x=>x[0]==='markdown.showLockedPreviewToSide')};
}

test('actual host opens first arriving log from the existing button and preserves report, flag and source bytes',async()=>{
  const f=fixture();try{
    const h=host(f);await h.c.openMvFixLog('owned');assert.equal(h.opens().length,0);assert.equal(h.messages[0][0],'info');
    const report=f.file('src/medical-validation/nautilus-log.md','# Before\nOriginal\n# After\nChanged\n');
    const before=[report,f.flag,f.cel].map(p=>readFileSync(p,'utf8'));
    await h.c.openMvFixLog('owned');assert.equal(h.opens().length,1);assert.equal(h.opens()[0][1].fsPath,realpathSync(report));assert.equal(h.opens()[0].length,2);
    assert.equal(h.calls.find(x=>x[0]==='setting')[2][realpathSync(report).replaceAll('\\','/')],true);
    assert.deepEqual([report,f.flag,f.cel].map(p=>readFileSync(p,'utf8')),before);
    unlinkSync(report);await h.c.openMvFixLog('owned');assert.equal(h.opens().length,1);assert.equal(h.messages.at(-1)[0],'info');
  }finally{f.close();}
});

test('forged/stale policy tokens and wrong mode do not open; repaired mapping works without a toolbar reload',async()=>{
  const f=fixture();try{
    const report=f.file('src/medical-validation/nautilus-log.md','Synthetic'),h=host(f);
    await h.c.openMvFixLog('forged');h.c.mode='cockpit';await h.c.openMvFixLog('owned');h.c.mode='medical-validation';
    h.c.currentCel='other';await h.c.openMvFixLog('owned');assert.equal(h.calls.length,0);h.c.currentCel=f.cel;
    f.config(null);await h.c.openMvFixLog('owned');assert.equal(h.messages.at(-1)[0],'info');
    f.config('src/medical-validation');await h.c.openMvFixLog('owned');assert.equal(h.opens()[0][1].fsPath,realpathSync(report));
  }finally{f.close();}
});

test('policy switch or config retarget during async readonly setup cancels the preview; rapid repeat clicks coalesce',async()=>{
  for(const change of ['policy','mapping']){
    const f=fixture();try{
      f.file('src/medical-validation/nautilus-log.md','First');f.file('src/qa/nautilus-log.md','Second');const h=host(f),update=h.config.update;let complete;
      h.config.update=async(...args)=>{await new Promise(resolve=>complete=resolve);await update(...args);};
      const pending=h.c.openMvFixLog('owned');await vi.waitFor(()=>assert.ok(complete));
      await h.c.openMvFixLog('owned');
      if(change==='policy')h.c.currentCel='different';else f.config('src/qa');
      complete();await pending;assert.equal(h.opens().length,0);assert.equal(h.c.mvFixLogBusy,false);assert.equal(h.messages.at(-1)[0],'warning');
    }finally{f.close();}
  }
});

test('report deletion or growth during readonly setup surfaces its current specific limitation',async()=>{
  for(const change of ['deleted','oversized']){
    const f=fixture();try{
      const report=f.file('src/medical-validation/nautilus-log.md','Synthetic'),h=host(f),update=h.config.update;let complete;
      h.config.update=async(...args)=>{await new Promise(resolve=>complete=resolve);await update(...args);};
      const pending=h.c.openMvFixLog('owned');await vi.waitFor(()=>assert.ok(complete));
      if(change==='deleted')unlinkSync(report);else truncateSync(report,MV_REPROCESS_LOG_MAX_BYTES+1);
      complete();await pending;assert.equal(h.opens().length,0);assert.equal(h.c.mvFixLogBusy,false);
      assert.equal(h.messages.at(-1)[0],'warning');
      assert.match(h.messages.at(-1)[1],change==='deleted'?/No Nautilus log has been delivered/:/2 MiB preview limit/);
    }finally{f.close();}
  }
});

test('a policy switch during preview activation is revalidated before setting writes',async()=>{
  const f=fixture();try{
    f.file('src/medical-validation/nautilus-log.md','Synthetic');const h=host(f);let complete;
    h.api.commands.getCommands=async()=>[];h.api.extensions.getExtension=()=>({activate:()=>new Promise(resolve=>complete=resolve)});
    const pending=h.c.openMvFixLog('owned');await vi.waitFor(()=>assert.ok(complete));
    h.c.currentCel='different';h.api.commands.getCommands=async()=>['markdown.showLockedPreviewToSide'];complete();await pending;
    assert.equal(h.calls.length,0);assert.equal(h.c.mvFixLogBusy,false);assert.match(h.messages.at(-1)[1],/selected policy changed/);
  }finally{f.close();}
});

test('a junction retarget above the artifact during readonly setup cannot open a different policy report',async()=>{
  const f=fixture();let linked=false;try{
    f.file('src/medical-validation/nautilus-log.md','Original');const other=join(f.root,'other'),old=join(f.root,'original');
    mkdirSync(join(other,'src/crl'),{recursive:true});mkdirSync(join(other,'src/cel'));mkdirSync(join(other,'src/medical-validation'));
    writeFileSync(join(other,'package.json'),'{}');writeFileSync(join(other,'src/medical-validation/nautilus-log.md'),'Other');
    const h=host(f),update=h.config.update;let complete;
    h.config.update=async(...args)=>{await new Promise(resolve=>complete=resolve);await update(...args);};
    const pending=h.c.openMvFixLog('owned');await vi.waitFor(()=>assert.ok(complete));
    renameSync(f.artifact,old);symlinkSync(other,f.artifact,process.platform==='win32'?'junction':'dir');linked=true;
    complete();await pending;assert.equal(h.opens().length,0);assert.equal(h.messages.at(-1)[0],'warning');
    unlinkSync(f.artifact);linked=false;renameSync(old,f.artifact);
  }finally{if(linked)unlinkSync(f.artifact);f.close();}
});

test('missing Markdown command errors are visible, do not open an editable fallback and do not poison the next open',async()=>{
  const f=fixture();try{
    f.file('src/medical-validation/nautilus-log.md','Synthetic');const h=host(f),execute=h.api.commands.executeCommand;
    h.api.commands.executeCommand=async()=>{throw Error('command not found');};
    await h.c.openMvFixLog('owned');assert.match(h.messages.at(-1)[1],/Markdown preview is enabled/);assert.equal(h.c.mvFixLogBusy,false);
    h.api.commands.executeCommand=execute;await h.c.openMvFixLog('owned');assert.equal(h.opens().length,1);assert.ok(!h.calls.some(x=>x[0]==='vscode.open'));
  }finally{f.close();}
});

test('a concurrent append keeps the same report identity and repeated clicks open only one preview',async()=>{
  const f=fixture();try{
    const report=f.file('src/medical-validation/nautilus-log.md','Prior entry\n'),h=host(f),update=h.config.update;let complete;
    h.config.update=async(...args)=>{await new Promise(resolve=>complete=resolve);await update(...args);};
    const pending=h.c.openMvFixLog('owned');await vi.waitFor(()=>assert.ok(complete));await h.c.openMvFixLog('owned');
    writeFileSync(report,'Prior entry\nNew entry\n');complete();await pending;
    assert.equal(h.opens().length,1);assert.equal(readFileSync(report,'utf8'),'Prior entry\nNew entry\n');assert.match(h.messages.at(-1)[1],/still opening/);
  }finally{f.close();}
});

test('standalone debug policies explain that the log mapping is unavailable without a configuration-error warning',async()=>{
  const f=fixture();try{
    unlinkSync(join(f.root,'kelp.project.json'));const h=host(f);await h.c.openMvFixLog('owned');
    assert.equal(h.messages.at(-1)[0],'info');assert.equal(h.calls.length,0);
  }finally{f.close();}
});
test('a debug policy under an ancestor project but outside its managed artifacts reports information without writes',async()=>{
  const f=fixture('examples/policy');try{
    const h=host(f);
    for(const folder of ['src/medical-validation','../unsafe',null]){f.config(folder);await h.c.openMvFixLog('owned');
      assert.equal(h.messages.at(-1)[0],'info');assert.match(h.messages.at(-1)[1],/No Nautilus log has been delivered/);assert.equal(h.calls.length,0);}

  }finally{f.close();}
});

test('incomplete managed artifact warns specifically without writes',async()=>{
  const f=fixture();try{const h=host(f);unlinkSync(join(f.artifact,'package.json'));await h.c.openMvFixLog('owned');
    assert.equal(h.messages.at(-1)[0],'warning');assert.match(h.messages.at(-1)[1],/incomplete; check artifact delivery/);assert.equal(h.calls.filter(call=>call[0]!=='chrome').length,0);
  }finally{f.close();}
});

test('same-policy toolbar refresh during readonly setup does not cancel an otherwise valid open',async()=>{
  const f=fixture();try{
    f.file('src/medical-validation/nautilus-log.md','Synthetic');const h=host(f),update=h.config.update;let complete;
    h.config.update=async(...args)=>{await new Promise(resolve=>complete=resolve);await update(...args);};
    const pending=h.c.openMvFixLog('owned');await vi.waitFor(()=>assert.ok(complete));
    h.c.sourceDocumentsSnapshot={...h.c.sourceDocumentsSnapshot,token:'new-render'};complete();await pending;
    assert.equal(h.opens().length,1);assert.equal(h.messages.length,0);
  }finally{f.close();}
});

test('a still-visible log button works when same-policy toolbar refresh precedes click dispatch',async()=>{
  const f=fixture();try{
    f.file('src/medical-validation/nautilus-log.md','Synthetic');const h=host(f);
    // The host has posted new chrome, but the old button is still visible until webview delivery.
    h.c.sourceDocumentsSnapshot={...h.c.sourceDocumentsSnapshot,token:'new-render'};
    await h.c.openMvFixLog('owned');
    assert.equal(h.opens().length,1);
  }finally{f.close();}
});

test('actual chrome snapshot and input wiring use resolved log presence, including malformed and F5 contexts',()=>{
  let capture,property;
  function wiring(node){
    if(ts.isBinaryExpression(node)&&node.left.getText(parsed)==='nautilusLogSnapshot'&&node.right.getText(parsed).includes('captureNautilusLog'))capture=node;
    if(ts.isCallExpression(node)&&node.expression.getText(parsed)==='renderMvTreeChrome')property=node.arguments[0].properties.find(p=>p.name?.getText(parsed)==='nautilusLog');
    ts.forEachChild(node,wiring);
  }
  wiring(parsed);assert.ok(capture);assert.ok(property);
  const f=fixture();try{
    for(const scenario of ['missing','present','malformed','standalone']){
      if(scenario==='present')f.file('src/medical-validation/nautilus-log.md','Synthetic');
      if(scenario==='malformed')writeFileSync(join(f.root,'kelp.project.json'),'invalid');
      if(scenario==='standalone')unlinkSync(join(f.root,'kelp.project.json'));
      const c=vm.createContext({src:f.src,currentCel:f.cel,sourceIdentity:realpathSync(f.src),nautilusLogSnapshot:undefined,captureNautilusLog,hasNautilusLog});
      vm.runInContext(transformSync(capture.getText(parsed),{loader:'ts'}).code,c);
      const data=vm.runInContext(`(${property.initializer.getText(parsed)})`,c);
      assert.equal(data.present,scenario==='present'||scenario==='standalone',scenario);
      const html=renderMvTreeChrome({status:'Status',highlighting:'',explanation:'',tools:'',questionnaires:'',legend:'',documents:{documents:[],complete:true,warnings:[]},documentToken:'separate',nautilusLog:data,history:false,recovery:false});
      assert.match(html,/>Nautilus log<\/button>/);assert.equal(html.includes('class="fc-toggle-btn mv-log-present"'),data.present);
    }
  }finally{f.close();}
});

test('a stale source-document button reports its context instead of silently disappearing',async()=>{
  let sourceOpen;function visitSource(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='openToolbarSourceDocument')sourceOpen=node;ts.forEachChild(node,visitSource);}visitSource(parsed);assert.ok(sourceOpen);
  const f=fixture();try{const h=host(f);vm.runInContext(transformSync(sourceOpen.getText(parsed),{loader:'ts'}).code,h.c);await h.c.openToolbarSourceDocument('old-visible-token',0);assert.match(h.messages.at(-1)[1],/source document from the current Medical Validation tree/);assert.equal(h.calls.length,0);}finally{f.close();}
});

test('watcher registration failure cannot break the policy retarget',()=>{
  let guarded;function watchTry(node){if(ts.isTryStatement(node)&&node.tryBlock.getText(parsed).includes('nautilusLogWatcher = watchNautilusLog'))guarded=node;ts.forEachChild(node,watchTry);}watchTry(parsed);assert.ok(guarded);
  const warnings=[],c=vm.createContext({src:'synthetic',watchedCel:'synthetic.cel',vscode:{},watchNautilusLog:()=>{throw Error('Unavailable watcher');},console:{warn:text=>warnings.push(text)}});
  vm.runInContext(transformSync(guarded.getText(parsed),{loader:'ts'}).code,c);assert.equal(warnings.length,1);assert.match(warnings[0],/Live Nautilus log status/);
});

test('preview preflight failures are specific and leave no settings or file writes',async()=>{
  const f=fixture();try{
    const report=f.file('src/medical-validation/nautilus-log.md','Synthetic'),h=host(f);h.api.commands.getCommands=async()=>[];
    await h.c.openMvFixLog('owned');assert.match(h.messages.at(-1)[1],/^Markdown preview is unavailable/);
    assert.equal(h.calls.length,0);assert.equal(readFileSync(report,'utf8'),'Synthetic');assert.equal(readFileSync(f.flag,'utf8'),'{"status":"open"}');
  }finally{f.close();}
});

test('actual toolbar delegate sends only the opaque token, and the actual host route accepts only the tree pane',()=>{
  const script=ts.createSourceFile('script.js',COCKPIT_WEBVIEW_SCRIPT,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let callback;
  function walk(node){if(ts.isCallExpression(node)&&node.expression.getText(script)==='listen'&&node.arguments[0]?.getText(script)==='fcc'&&node.arguments[1]?.text==='click')callback=node.arguments[2];ts.forEachChild(node,walk);}walk(script);assert.ok(callback);
  const sent=[],fcc={};let click;fcc.addEventListener=(_,fn)=>click=fn;
  new Function('fcc','v',`fcc.addEventListener('click',${callback.getText(script)});`)(fcc,{postMessage:x=>sent.push(x)});
  click({target:{closest:selector=>selector==='[data-open-mv-fix-log]'?{getAttribute:name=>name==='data-log-token'?'owned':undefined}:null},preventDefault(){}});
  assert.deepEqual(sent,[{type:'openMvFixLog',token:'owned'}]);
  let branch;function route(node){if(ts.isIfStatement(node)&&node.expression.getText(parsed).includes('msg.type === "openMvFixLog"'))branch=node;ts.forEachChild(node,route);}route(parsed);assert.ok(branch);
  const hits=[],c=vm.createContext({openMvFixLog:token=>hits.push(token)});
  const code=transformSync(`function dispatch(msg,pane){if(${branch.expression.getText(parsed)})${branch.thenStatement.getText(parsed)}}`,{loader:'ts'}).code;vm.runInContext(code,c);
  c.dispatch({type:'openMvFixLog',token:'owned'},'cel');c.dispatch({type:'openMvFixLog',token:'owned'},'tree');assert.deepEqual(hits,['owned']);
});
