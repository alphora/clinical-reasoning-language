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
      m._compile(source+'\nmodule.exports.__iq={interactiveQuestionnaireHtml,InteractiveSession,nativeInteractiveRunner,prepareInteractivePolicy,unrenderableQuestionnaireFeatures};',file);
      installedRuntime=m.exports.__iq;
      for(const [name,value] of Object.entries(installedRuntime)) assert.equal(typeof value,"function",`Installed binding ${name} must be callable`);
    }
    return installedRuntime;
  }
  const js = esbuild.buildSync({entryPoints:[entry],bundle:true,alias:{vscode:path.resolve('packages/crl-vscode/test/oracle/vscode-stub.ts')},platform:'node',format:'cjs',write:false}).outputFiles[0].text;
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
  const questionnaire={resourceType:'Questionnaire',id:'q',url:'urn:test:interactive',version:'1',status:'active',item:['a','b','c'].map((id,i)=>({linkId:id,type:'string',text:'Question '+id,initial:[{valueString:['A','B','C'][i]}]}))};
  const response={resourceType:'QuestionnaireResponse',questionnaire:'urn:test:interactive|1',status:'in-progress',subject:{reference:'Patient/p'},item:['a','b','c'].map((id,i)=>({linkId:id,answer:[{valueString:['A','B','C'][i]}]}))};
  await post({type:'initial',token:1,states:[{id:'1',label:'Codeset 1'},{id:'2',label:'Codeset 2'}],subject:'Patient/p',warnings:['Definition warning']});
  const five={...questionnaire,item:['one','two','three','four','five'].map(linkId=>({linkId,type:'string',text:'Question '+linkId}))};
  await post({type:'result',token:1,questionnaire:five,response:{...response,item:[]},activities:[],subject:'Patient/p'});await mounted();
  const beforeEditMessages=await evaluate(`window.sent.filter(m=>m.type==='continue').length`);
  await input(1,'Yes');
  assert.deepEqual(await values(),['','Yes','','',''],'answering second question retains all five siblings');
  assert.equal(await evaluate(`window.sent.filter(m=>m.type==='continue').length`),beforeEditMessages,'editing never invokes Continue');
  fs.writeFileSync(path.join(root,'five-siblings.png'),Buffer.from((await rpc('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const nestedQ={...questionnaire,item:[{linkId:'parent',type:'string',text:'Parent',item:[{linkId:'child',type:'string',text:'Follow-up',initial:[{valueString:'default'}]}]},questionnaire.item[1]]};
  const nestedR={...response,item:[{linkId:'parent',answer:[{valueString:'parent',item:[{linkId:'child',answer:[{valueString:'child'}]}]}]},response.item[1]]};
  await post({type:'result',token:1,questionnaire:nestedQ,response:nestedR,activities:[],subject:'Patient/p'});await mounted();
  assert.deepEqual(await values(),['parent','child','B']);
  const parentFocus=await evaluate(`(()=>{const e=document.querySelector('#form input[type=text]');e.focus();e.setSelectionRange(1,1);return e.id;})()`);
  await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'x',text:'x'});await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'x'});await mounted();
  assert.deepEqual(await values(),['pxarent','B'],'changed parent prunes only its nested follow-up');
  assert.equal(await evaluate(`document.activeElement.id`),parentFocus,'focus survives pruning remount');
  assert.equal(await evaluate(`document.activeElement.selectionStart`),2);
  await input(0,'parent');
  assert.deepEqual(await values(),['parent','B'],'change-back cannot restore removed child/default');
  await evaluate(`document.getElementById('continue').click()`);
  const nestedPair=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
  assert.deepEqual(nestedPair.questionnaire.item.map(i=>i.linkId),['parent','b']);
  assert.equal(nestedPair.questionnaire.item[0].item,undefined);
  assert.equal(nestedPair.response.item[0].answer[0].item,undefined);
  const repeatQ={...questionnaire,item:[{linkId:'repeat',type:'group',text:'Occurrence',repeats:true,item:nestedQ.item}]};
  const occurrence=value=>({linkId:'repeat',item:[{linkId:'parent',answer:[{valueString:value,item:[{linkId:'child',answer:[{valueString:value+' child'}]}]}]},response.item[1]]});
  const repeatR={...response,item:['first','middle','last'].map(occurrence)};
  const removeOccurrence=async index=>{
    await evaluate(`document.querySelectorAll('#form button[title^="Remove this"]')[${index}].click()`);
    await delay(400); // Vendor structural events use onFormChange's debounce.
  };
  for(const index of [0,1]){
    await post({type:'result',token:1,questionnaire:repeatQ,response:repeatR,activities:[],subject:'Patient/p'});await mounted();
    assert.deepEqual(await values(),['first','first child','B','middle','middle child','B','last','last child','B']);
    await removeOccurrence(index);
    const names=index===0?['middle','last']:['first','last'];
    assert.deepEqual(await values(),names.flatMap(n=>[n,n+' child','B']));
    await evaluate(`document.getElementById('continue').click()`);
    const pair=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
    assert.equal(pair.response.item.length,2,'removal does not recreate an occurrence');
    assert.deepEqual(pair.response.item.map(i=>i.item[0].answer[0].item[0].answer[0].valueString),names.map(n=>n+' child'));
  }
  const emptyRepeatQ={...questionnaire,item:[{linkId:'repeat',type:'group',text:'Occurrence',repeats:true,item:[{linkId:'value',type:'string',text:'Value'}]}]};
  const emptyRepeatR={...response,item:[{linkId:'repeat',item:[{linkId:'value',answer:[{valueString:'kept'}]}]}]};
  await post({type:'result',token:1,questionnaire:emptyRepeatQ,response:emptyRepeatR,activities:[],subject:'Patient/p'});await mounted();
  await evaluate(`document.querySelector('#form button[id^="add-"]').click()`);await delay(400);
  assert.deepEqual(await values(),['kept','']);
  await evaluate(`document.getElementById('continue').click()`);
  const addedEmpty=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
  assert.equal(addedEmpty.response.item.length,1,'LForms omits wholly unanswered occurrences on export');
  assert.deepEqual(addedEmpty.questionnaire.item,emptyRepeatQ.item,'the repeated template remains available');
  await post({type:'error',token:1,message:'Keep edited form'});
  await input(1,'added');
  await evaluate(`document.getElementById('continue').click()`);
  const populatedRepeat=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
  assert.equal(populatedRepeat.response.item.length,2,'answered new occurrence is submitted');
  assert.equal(populatedRepeat.response.item[1].item[0].answer[0].valueString,'added');
  await post({type:'error',token:1,message:'Keep edited form'});
  await input(1,'');
  await removeOccurrence(1);
  await evaluate(`document.getElementById('continue').click()`);
  const removedEmpty=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
  assert.equal(removedEmpty.response.item.length,1,'cleared/removed occurrence cannot retain an old answer');
  await post({type:'result',token:1,questionnaire,response,activities:[],subject:'Patient/p'});await mounted();
  assert.equal(await evaluate(`document.getElementById('start').disabled`),true);
  assert.deepEqual(await values(),['A','B','C']);
  assert.equal(await evaluate(`document.getElementById('warnings').hidden`),false);
  assert.equal(await evaluate(`document.getElementById('warnings').open`),false);
  assert.equal(await evaluate(`document.getElementById('status').textContent.includes('Definition warning')`),false);
  await post({type:'result',token:1,questionnaire,response,activities:['Complete'],warnings:['Evaluation warning'],subject:'Patient/p'});await mounted();
  assert.equal(await evaluate(`document.getElementById('warning-list').children.length`),2);
  assert.equal(await evaluate(`document.getElementById('results').hidden`),false);
  assert.equal(await evaluate(`document.getElementById('results').getBoundingClientRect().top>=document.getElementById('form').getBoundingClientRect().bottom`),true);
  assert.equal(await evaluate(`document.querySelectorAll('#outcomes li').length`),0);
  assert.equal(await evaluate(`document.getElementById('outcomes').textContent`),'Complete');
  fs.writeFileSync(path.join(root,'layout.png'),Buffer.from((await rpc('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate(`document.getElementById('warning-summary').click()`);
  assert.equal(await evaluate(`document.getElementById('warnings').open`),true);
  fs.writeFileSync(path.join(root,'warnings.png'),Buffer.from((await rpc('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate(`document.getElementById('warning-summary').click()`);
  const started=Date.now();await input(0,'changed');await mounted();await input(0,'A');
  assert.deepEqual(await values(),['A','B','C']);
  await evaluate(`document.getElementById('continue').click()`);
  let submission=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
  assert.deepEqual(submission.response.item.map(i=>i.linkId),['a','b','c']);
  assert.deepEqual(submission.questionnaire.item.map(i=>i.linkId),['a','b','c']);
  assert.equal(submission.response.item[0].answer[0].valueString,'A');
  assert.equal(submission.response.subject.reference,'Patient/p');assert.equal(submission.response.questionnaire,'urn:test:interactive|1');
  const fastChangeMs=Date.now()-started;assert.ok(fastChangeMs<360,'change-back must exercise the vendor debounce window: '+fastChangeMs);
  await post({type:'error',token:1,message:'Synthetic evaluation failure'});assert.equal(await evaluate(`document.getElementById('status').textContent`),'Synthetic evaluation failure');assert.deepEqual(await values(),['A','B','C']);
  await input(0,'');await evaluate(`document.getElementById('continue').click()`);
  submission=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
  assert.equal(submission.response.item[0].linkId,'a');assert.ok(!submission.response.item[0].answer?.length, JSON.stringify(submission.response));
  await post({type:'reset',token:2,subject:'Patient/p'});
  await post({type:'result',token:1,questionnaire,response,activities:['STALE'],subject:'Patient/p'});
  assert.equal(await evaluate(`document.getElementById('form').childElementCount`),0);
  // Rapid selector edits before host acknowledgement: UI serializes and follows acknowledged identity.
  await evaluate(`(()=>{const s=document.getElementById('codeset');s.value='2';s.dispatchEvent(new Event('change'));s.value='1';s.dispatchEvent(new Event('change'));})()`);
  assert.equal(await evaluate(`window.sent.filter(m=>m.type==='select').length`),1);
  await post({type:'reset',token:3,id:'2',subject:'Patient/p2'});
  assert.equal(await evaluate(`document.getElementById('codeset').value`),'2');
  await post({type:'result',token:3,questionnaire,response,activities:['Previous result'],subject:'Patient/p2'});await mounted();
  // Real keyboard event path, with a caret in the middle of a populated earlier answer.
  const focusedId=await evaluate(`(()=>{const e=document.querySelector('#form input[type=text]');e.focus();e.setSelectionRange(1,1);return e.id;})()`);
  await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'x',text:'x'});await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'x'});await mounted();
  assert.equal(await evaluate(`document.activeElement.id`),focusedId);
  assert.equal(await evaluate(`document.activeElement.selectionStart`),2);
  await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'y',text:'y'});await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'y'});
  assert.deepEqual(await values(),['Axy','B','C']);
  assert.equal(await evaluate(`document.getElementById('outcomes').childElementCount`),0,'prior activity must not look current after editing');
  await evaluate(`document.getElementById('continue').click(); document.getElementById('cancel').click();`);
  assert.equal(await evaluate(`document.getElementById('codeset').disabled && document.getElementById('reset').disabled`),true);
  const selectionCount=await evaluate(`window.sent.filter(m=>m.type==='select').length`);
  await evaluate(`document.getElementById('codeset').value='1';document.getElementById('codeset').dispatchEvent(new Event('change'));document.getElementById('reset').click();`);
  assert.equal(await evaluate(`window.sent.filter(m=>m.type==='select').length`),selectionCount);
  await post({type:'cancelled',token:4,id:'2',message:'Cancelled'});
  assert.equal(await evaluate(`document.getElementById('codeset').value`),'2');
  assert.equal(await evaluate(`document.getElementById('codeset').disabled`),false);
  assert.deepEqual(await values(),['Axy','B','C']);
  // Export failures must block stale submission and recover after a successful edit.
  await post({type:'result',token:4,questionnaire,response,activities:[],subject:'Patient/p'});await mounted();
  const countBeforeFailure=await evaluate(`window.sent.filter(m=>m.type==='continue').length`);
  await evaluate(`window.savedExport=LForms.Util.getFormFHIRData;LForms.Util.getFormFHIRData=()=>{throw Error('forced export failure')}`);
  await input(0,'failed');
  assert.equal(await evaluate(`document.getElementById('continue').disabled`),true);
  await evaluate(`document.getElementById('continue').click()`);
  assert.equal(await evaluate(`window.sent.filter(m=>m.type==='continue').length`),countBeforeFailure);
  assert.match(await evaluate(`document.getElementById('status').textContent`),/forced export failure/);
  await evaluate(`LForms.Util.getFormFHIRData=window.savedExport`);
  await input(0,'recovered');await mounted();
  assert.deepEqual(await values(),['recovered','B','C']);
  // Forward sibling dependencies remain intact after an edit.
  const forwardQ=structuredClone(questionnaire);
  forwardQ.item[0].enableWhen=[{question:'c',operator:'exists',answerBoolean:true}];
  await post({type:'result',token:4,questionnaire:forwardQ,response,activities:[],subject:'Patient/p'});await mounted();
  await input(0,'changed');
  assert.equal(await evaluate(`document.getElementById('continue').disabled`),false);
  assert.deepEqual(await values(),['changed','B','C']);
  await input(0,'A');await mounted();
  assert.deepEqual(await values(),['A','B','C']);
  assert.equal(await evaluate(`document.getElementById('continue').disabled`),false,'forward dependency remains available');
  const unsupportedQ={...questionnaire,item:[questionnaire.item[0],{linkId:'unsupported',type:'url',text:'Unsupported later question'}]};
  const unsupportedResponse={...response,item:[response.item[0]]};
  await post({type:'result',token:4,questionnaire:unsupportedQ,response:unsupportedResponse,activities:[],subject:'Patient/p',unsupported:['url']});
  await until(()=>evaluate(`document.getElementById('form').getAttribute('aria-busy')==='false'`),'blocked form ready');
  assert.equal(await evaluate(`document.getElementById('continue').disabled`),true);
  await input(0,'changed');
  assert.equal(await evaluate(`document.getElementById('continue').disabled`),true,'unsupported sibling remains and must block Continue');
  assert.equal(await evaluate(`document.querySelectorAll('#form input').length`),2);
  const stillUnsupported={...questionnaire,extension:[{url:'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-preferredTerminologyServer',valueUrl:'https://example.invalid'}]};
  await post({type:'result',token:4,questionnaire:stillUnsupported,response,activities:[],subject:'Patient/p',unsupported:['preferredTerminologyServer']});
  await until(()=>evaluate(`document.getElementById('form').getAttribute('aria-busy')==='false'`),'unsupported root ready');
  await input(0,'changed');
  await until(()=>evaluate(`document.getElementById('form').getAttribute('aria-busy')==='false'`),'unsupported root remount');
  assert.deepEqual(await values(),['changed','B','C']);
  assert.equal(await evaluate(`document.getElementById('continue').disabled`),true,'retained unsupported features still block Continue');
  await evaluate(`window.savedExport=LForms.Util.getFormFHIRData;LForms.Util.getFormFHIRData=()=>{throw Error('blocked export failure')}`);
  await input(0,'changed');
  assert.match(await evaluate(`document.getElementById('status').textContent`),/blocked export failure/);
  await evaluate(`LForms.Util.getFormFHIRData=window.savedExport`);
  await input(0,'changed');
  assert.equal(await evaluate(`document.getElementById('continue').disabled`),true);
  assert.match(await evaluate(`document.getElementById('status').textContent`),/renderer does not support.*preferredTerminologyServer/);
  fs.writeFileSync(path.join(root,'panel.png'),Buffer.from((await rpc('Page.captureScreenshot',{format:'png'})).data,'base64'));
  console.log(JSON.stringify({browser:'passed',fastChangeMs,pruned:true,clear:true,errorRetention:true,staleReplyIgnored:true,selectorAck:true,keyboardFocus:true}));
  if(process.env.CRL_IQ_NATIVE){
    const native=load('packages/crl-vscode/src/interactiveQuestionnaire.ts');
    const {applySession}=require(installed?path.join(installed,'dist/apply-session.js'):path.resolve('packages/crl-vscode/dist/apply-session.js'));
    const prepared=native.prepareInteractivePolicy(path.resolve('packages/crl-vscode/src/testdata/interactive-questionnaire/src/cel/mv/cases.cel'));
    const initial=prepared.initialStates[0];
    const session=new native.InteractiveSession(prepared.definitions,prepared.planId,native.nativeInteractiveRunner(applySession,root));session.reset(initial);
    let result=await session.evaluate();
    await post({type:'reset',token:3,subject:initial.subject});
    await post({type:'result',token:3,...result,subject:initial.subject});await mounted();
    fs.writeFileSync(path.join(root,'native-start.json'),JSON.stringify(result,null,2));
    // Actual browser-produced answers, never manually injected Observations or extraction output.
    await input(0,'first');await mounted();await evaluate(`document.getElementById('continue').click()`);
    let pair=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`), sent=pair.response;fs.writeFileSync(path.join(root,'browser-qr-1.json'),JSON.stringify(sent,null,2));
    result=await session.evaluate(sent,pair.questionnaire);fs.writeFileSync(path.join(root,'native-answer-1.json'),JSON.stringify(result,null,2));
    await post({type:'result',token:3,...result,subject:initial.subject});await mounted();
    await input(1,'second');await mounted();await evaluate(`document.getElementById('continue').click()`);
    pair=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);sent=pair.response;
    result=await session.evaluate(sent,pair.questionnaire);fs.writeFileSync(path.join(root,'native-answer-2.json'),JSON.stringify(result,null,2));
    assert.deepEqual(result.activities,['Complete'],'show the terminal activity, not intermediate orchestration actions');
    await post({type:'result',token:3,...result,subject:initial.subject});await mounted();
    await input(0,'changed');await mounted();await input(0,'first');
    await evaluate(`document.getElementById('continue').click()`);
    pair=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);sent=pair.response;fs.writeFileSync(path.join(root,'browser-qr-pruned.json'),JSON.stringify(sent,null,2));
    result=await session.evaluate(sent,pair.questionnaire);fs.writeFileSync(path.join(root,'native-pruned.json'),JSON.stringify(result,null,2));
    assert.deepEqual(result.activities,['Complete'],'retained sibling answer still completes after change-back');
    assert.ok(flatten(result.response?.item).some(i=>(i.answer||[]).some(a=>a.valueString==='second')),'second sibling answer retained');
    await post({type:'result',token:3,...result,subject:initial.subject});await mounted();
    await input(0,'');await mounted();
    assert.equal((await values()).length,2,'sibling remains visible before Continue');
    await evaluate(`document.getElementById('continue').click()`);
    pair=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
    const answerable=q=>flatten(q.item).filter(i=>!['group','display'].includes(i.type));
    assert.equal(answerable(pair.questionnaire).length,2,'submitted Q keeps both sibling questions');
    result=await session.evaluate(pair.response,pair.questionnaire);
    fs.writeFileSync(path.join(root,'native-cleared.json'),JSON.stringify(result,null,2));
    assert.ok(!flatten(result.response?.item).some(i=>(i.answer||[]).some(a=>a.valueString==='first')),'cleared first answer stays empty');
    assert.equal(result.activities.length,0);
    console.log('Native browser-exported pair: completion, sibling-preserving change-back, and explicit clear: passed');
  }
})().catch(async e=>{console.error(e);if(ws)try{console.error(await evaluate(`({text:document.body.innerText,html:document.getElementById('form').innerHTML.slice(0,1200),sent:window.sent})`));}catch{}process.exitCode=1}).finally(async()=>{if(ws)try{await rpc('Browser.close')}catch{};ws?.close();child?.kill();server?.close();});
