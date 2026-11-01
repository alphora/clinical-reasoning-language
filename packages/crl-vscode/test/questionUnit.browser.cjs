// REFACTOR:grounded (#328): explicit candidate native engine + actual shipped LForms round trip.
// Real shipped LForms, isolated headless browser, no package downloads.
// BROWSER_EXE=<Chromium executable> node packages/crl-vscode/test/interactiveQuestionnaire.browser.cjs
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {spawn} = require('node:child_process'), assert = require('node:assert/strict'), esbuild = require('esbuild');
const root = path.resolve(process.env.CRL_IQ_OUTPUT || 'tmp/interactive-questionnaire'); fs.mkdirSync(root,{recursive:true});
const profile = fs.mkdtempSync(path.join(root,'browser-'));
const browser = process.env.BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const installed = process.env.CRL_IQ_EXTENSION_ROOT && path.resolve(process.env.CRL_IQ_EXTENSION_ROOT);
let installedRuntime;
const load = (entry) => {
  if(installed){
    if(!installedRuntime){
      // Expose unchanged installed functions for headless execution; only VS Code UI APIs are stubbed.
      const Module=require('node:module'),file=path.join(installed,'dist/extension.js'),source=fs.readFileSync(file,'utf8');
      const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
      const stub=new Proxy(function(){},{get:()=>stub,apply:()=>stub,construct:()=>stub}),req=m.require.bind(m);
      m.require=id=>id==='vscode'?Object.fromEntries([...source.matchAll(/vscode[0-9]*\.([A-Za-z0-9_]+)/g)].map(match=>[match[1],stub])):req(id);
      m._compile(source+'\nmodule.exports.__iq={interactiveQuestionnaireHtml,InteractiveSession,nativeInteractiveRunner,prepareInteractivePolicy,unrenderableQuestionnaireFeatures,interactiveQuestionnaireDependencies,interactiveRequest};',file);
      installedRuntime=m.exports.__iq;
      for(const [name,value] of Object.entries(installedRuntime)) assert.equal(typeof value,"function",`Installed binding ${name} must be callable`);
    }
    return installedRuntime;
  }
  const js = esbuild.buildSync({entryPoints:[entry],bundle:true,alias:{vscode:path.resolve('packages/crl-vscode/test/oracle/vscode-stub.ts'),'jsonc-parser':require.resolve('jsonc-parser/lib/esm/main.js')},platform:'node',format:'cjs',write:false}).outputFiles[0].text;
  const m={exports:{}};new Function('require','module','exports','__dirname',js)(require,m,m.exports,path.resolve('packages/crl-vscode/dist'));return m.exports;
};
const {interactiveQuestionnaireHtml}=load('packages/crl-vscode/src/interactiveQuestionnaireHtml.ts');
const {unrenderableQuestionnaireFeatures:inspect}=load('packages/crl-vscode/src/correspondenceCockpit.ts');
assert.equal(typeof inspect,'function','Use the production feature inspector in both source and installed tests');
const assets=installed?path.join(installed,'media/lforms'):path.resolve('packages/crl-vscode/media/lforms');
let child, ws, server, seq=0; const pending=new Map();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(test,detail){for(let i=0;i<160;i++){const v=await test();if(v)return v;await delay(50);}throw Error('Timeout: '+detail);}
async function rpc(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},15000);pending.set(id,{resolve:r=>{clearTimeout(timeout);resolve(r)},reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const post=m=>evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(m)}}))`);
const mounted=()=>until(()=>evaluate(`!document.getElementById('continue').disabled`),'LForms ready');
const input=async(index,value)=>evaluate(`(()=>{const e=document.querySelectorAll('#form input[type=text]')[${index}];if(!e)throw Error('Missing input ${index}');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
const values=()=>evaluate(`[...document.querySelectorAll('#form input[type=text]')].map(e=>e.value)`);
const flatten=items=>(items||[]).flatMap(i=>[i,...flatten(i.item),...(i.answer||[]).flatMap(a=>flatten(a.item))]);
(async()=>{
  server=http.createServer((req,res)=>{
    if(req.url==='/'){
      let html=interactiveQuestionnaireHtml('test','http://127.0.0.1:*',name=>'/'+name,inspect);
      html=html.replace('<script nonce="test" src=',`<script nonce="test">window.sent=[];window.acquireVsCodeApi=()=>({postMessage:m=>window.sent.push(m)});</script><script nonce="test" src=`);
      res.setHeader('Content-Type','text/html');res.end(html);
    }else{const name=path.basename(req.url);const file=path.join(assets,name);if(!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'image/png');res.end(fs.readFileSync(file));}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
  child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,url],{windowsHide:true,stdio:['ignore','ignore',fs.openSync(path.join(profile,'browser.log'),'w')]});
  const portFile=path.join(profile,'DevToolsActivePort');await until(()=>fs.existsSync(portFile),'browser startup');
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
  const target=await until(async()=> (await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page'&&t.url.startsWith(url)),'page');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  ws.onmessage=e=>{const r=JSON.parse(e.data);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result)}};
  await until(()=>evaluate('window.sent?.some(m=>m.type==="ready")'),'panel ready');


  const {emitCrlBundle}=require(path.resolve('packages/crl/dist'));
  const {applySession,shutdownNativeRuntime}=require(path.resolve('packages/crl/dist/results/session'));
  const {questionUnitSource}=require(path.resolve('packages/crl/dist/authoring-kit/questionUnitExample'));
  const {InteractiveSession,nativeInteractiveRunner}=load('packages/crl-vscode/src/interactiveQuestionnaire.ts');
  const policyRoot=path.join(root,'policy');fs.mkdirSync(policyRoot,{recursive:true});
  fs.writeFileSync(path.join(policyRoot,'package.json'),JSON.stringify({name:'quantity-browser',version:'0.0.0',private:true,crl:{canonicalBase:'https://example.org/question-unit-browser',date:'2026-11-01'}}));
  const source=questionUnitSource();fs.writeFileSync(path.join(policyRoot,'policy.crl'),source);
  const emitted=emitCrlBundle(path.join(policyRoot,'policy.crl'));assert.equal(emitted.success,true,JSON.stringify(emitted));
  const plan=emitted.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='PlanDefinition'&&r.type?.coding?.some(c=>c.code==='workflow-definition'));
  const engine={path:process.env.CRL_QUESTION_UNIT_ENGINE_PATH,sha256:process.env.CRL_QUESTION_UNIT_ENGINE_SHA256};
  assert.ok(engine.path&&engine.sha256,'Explicit candidate path/hash required');
  const rows=[];let nativeIndex=0;
  const runner=nativeInteractiveRunner(async(request,options)=>{
    const r=await applySession({...request,engine},{...options,limits:{maxHeapMb:512,timeoutMs:90000}});
    const dir=path.join(root,'native-'+nativeIndex++);fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(r,null,2));fs.writeFileSync(path.join(dir,'request.json'),request.requestDataJson);
    for(const [name,a]of Object.entries(r.artifacts))fs.copyFileSync(a.path,path.join(dir,name+'.json'));
    return r;
  },policyRoot);
  const session=new InteractiveSession(emitted.bundle,plan.id,runner);
  session.reset({id:'synthetic',label:'Synthetic',subject:'Patient/p',bundle:{resourceType:'Bundle',type:'collection',entry:[{resource:{resourceType:'Patient',id:'p'}}]}});
  const obs=r=>(r.nativeData?.entry||[]).map(e=>e.resource).filter(r=>r.resourceType==='Observation');
  try{
    let result=await session.evaluate();
    await post({type:'initial',token:1,states:[{id:'1',label:'Quantity unit native probe'}],subject:'Patient/p',warnings:[]});
    for(const [value,expected]of [[null,null],['40','Above'],['30','Below'],['',null]]){
      await post({type:'result',token:1,questionnaire:result.questionnaire,response:result.response,activities:result.activities,subject:'Patient/p'});await mounted();
      if(value!==null)await input(0,value);await delay(250);await evaluate(`document.getElementById('continue').click()`);
      const submitted=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
      const answer=flatten(submitted.response.item).find(i=>i.type!=='group'&&i.answer?.some(a=>a.valueQuantity))?.answer[0]?.valueQuantity;
      if(value){assert.equal(answer.value,Number(value));assert.equal(answer.code,'kg/m2');assert.equal(answer.system,'http://unitsofmeasure.org');}
      result=await session.evaluate(submitted.response);
      if(expected){assert.deepEqual(result.activities,[expected]);assert.equal(obs(result).at(-1).valueQuantity.value,Number(value));}
      else assert.equal(result.activities.length,0);
      if(value===null)assert.equal(obs(result).length,0,'Untouched rendered blank invents no Observation');
      if(value==='')assert.equal(obs(result).at(-1).valueQuantity,undefined,'Clear removes numeric Quantity');
      rows.push({entered:value,submission:submitted,result});
      if(value==='40')fs.writeFileSync(path.join(root,'quantity-unit-native-entry.png'),Buffer.from((await rpc('Page.captureScreenshot',{format:'png'})).data,'base64'));
    }
    // REFACTOR:grounded: explicit typed publication canonicalizes unit-only/styled values, without source renewal.
    const system=emitted.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='CodeSystem'&&r.concept?.some(c=>c.code==='bmi')).url;
    const original={resourceType:'Observation',id:'display-only-source',status:'final',subject:{reference:'Patient/p'},code:{coding:[{system,code:'bmi'}]},effectiveDateTime:'2026-10-01T00:00:00Z',valueQuantity:{value:40,unit:'kg/m2'}};
    const displayOnly=new InteractiveSession(emitted.bundle,plan.id,runner);
    displayOnly.reset({id:'display-only',label:'Display-only unit',subject:'Patient/p',bundle:{resourceType:'Bundle',type:'collection',entry:[{resource:{resourceType:'Patient',id:'p'}},{resource:original}]}});
    const populated=await displayOnly.evaluate();
    await post({type:'result',token:1,questionnaire:populated.questionnaire,response:populated.response,activities:populated.activities,subject:'Patient/p'});await mounted();
    await evaluate(`document.getElementById('continue').click()`);const untouched=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
    const exported=flatten(untouched.response.item).find(i=>i.answer?.some(a=>a.valueQuantity))?.answer[0]?.valueQuantity;
    assert.deepEqual(exported,{value:40,unit:'kg/m2',code:'kg/m2',system:'http://unitsofmeasure.org'});
    const retained=await displayOnly.evaluate(untouched.response);assert.deepEqual(retained.activities,['Above']);assert.deepEqual(obs(retained),[original]);
    rows.push({entered:'untouched display-only source',submission:untouched,result:retained});
    const styledSource={...original,id:'styled-source',valueQuantity:{value:40,system:'http://unitsofmeasure.org',code:'kg/m2',unit:'kg/m²'}};
    const styled=new InteractiveSession(emitted.bundle,plan.id,runner);
    styled.reset({id:'styled-unit',label:'Styled unit',subject:'Patient/p',bundle:{resourceType:'Bundle',type:'collection',entry:[{resource:{resourceType:'Patient',id:'p'}},{resource:styledSource}]}});
    const styledStart=await styled.evaluate();
    await post({type:'result',token:1,questionnaire:styledStart.questionnaire,response:styledStart.response,activities:styledStart.activities,subject:'Patient/p'});await mounted();
    await evaluate(`document.getElementById('continue').click()`);const styledExport=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
    assert.deepEqual(flatten(styledExport.response.item).find(i=>i.answer?.some(a=>a.valueQuantity))?.answer[0]?.valueQuantity,{value:40,unit:'kg/m2',code:'kg/m2',system:'http://unitsofmeasure.org'});
    const styledRetained=await styled.evaluate(styledExport.response);assert.deepEqual(styledRetained.activities,['Above']);assert.deepEqual(obs(styledRetained),[styledSource]);
    rows.push({entered:'untouched source display',submission:styledExport,result:styledRetained});
    fs.writeFileSync(path.join(root,'quantity-unit-browser-native.json'),JSON.stringify({passed:true,scope:'Shipped LForms and production InteractiveSession with actual candidate native Start/Continue/entry/change/clear',engine,rows},null,2));
    console.log(JSON.stringify({passed:true,cases:rows.map(r=>r.entered),output:root}));
  }finally{await shutdownNativeRuntime();}
})().catch(async e=>{console.error(e);if(ws)try{console.error(await evaluate(`({text:document.body.innerText,html:document.getElementById('form').innerHTML.slice(0,1200),sent:window.sent})`));}catch{}process.exitCode=1}).finally(async()=>{if(ws)try{await rpc('Browser.close')}catch{};ws?.close();child?.kill();server?.close();});
