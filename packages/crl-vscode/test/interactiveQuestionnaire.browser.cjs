// Real shipped LForms, isolated headless browser, no package downloads.
// BROWSER_EXE=<Chromium executable> node packages/crl-vscode/test/interactiveQuestionnaire.browser.cjs
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {spawn} = require('node:child_process'), assert = require('node:assert/strict'), esbuild = require('esbuild');
const root = path.resolve('tmp/interactive-questionnaire'); fs.mkdirSync(root,{recursive:true});
const profile = fs.mkdtempSync(path.join(root,'browser-'));
const browser = process.env.BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const load = (entry) => {
  const js = esbuild.buildSync({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
  const m={exports:{}};new Function('require','module','exports','__dirname',js)(require,m,m.exports,path.resolve('packages/crl-vscode/dist'));return m.exports;
};
const {interactiveQuestionnaireHtml}=load('packages/crl-vscode/src/interactiveQuestionnaireHtml.ts');
const assets=path.resolve('packages/crl-vscode/media/lforms');
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
      let html=interactiveQuestionnaireHtml('test','http://127.0.0.1:*',name=>'/'+name);
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
  await post({type:'initial',token:1,states:[{id:'1',label:'Codeset 1'},{id:'2',label:'Codeset 2'}],subject:'Patient/p'});
  await post({type:'result',token:1,questionnaire,response,activities:[],subject:'Patient/p'});await mounted();
  assert.equal(await evaluate(`document.getElementById('start').disabled`),true);
  assert.deepEqual(await values(),['A','B','C']);
  const started=Date.now();await input(0,'changed');await mounted();await input(0,'A');
  assert.deepEqual(await values(),['A','','']);
  await evaluate(`document.getElementById('continue').click()`);
  let submission=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
  assert.deepEqual(submission.response.item.map(i=>i.linkId),['a']);
  assert.equal(submission.response.item[0].answer[0].valueString,'A');
  assert.equal(submission.response.subject.reference,'Patient/p');assert.equal(submission.response.questionnaire,'urn:test:interactive|1');
  const fastChangeMs=Date.now()-started;assert.ok(fastChangeMs<360,'change-back must exercise the vendor debounce window: '+fastChangeMs);
  await post({type:'error',token:1,message:'Synthetic evaluation failure'});assert.deepEqual(await values(),['A','','']);
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
  assert.deepEqual(await values(),['Axy','','']);
  assert.equal(await evaluate(`document.getElementById('outcomes').childElementCount`),0,'prior activity must not look current after editing');
  await evaluate(`document.getElementById('continue').click(); document.getElementById('cancel').click();`);
  assert.equal(await evaluate(`document.getElementById('codeset').disabled && document.getElementById('reset').disabled`),true);
  const selectionCount=await evaluate(`window.sent.filter(m=>m.type==='select').length`);
  await evaluate(`document.getElementById('codeset').value='1';document.getElementById('codeset').dispatchEvent(new Event('change'));document.getElementById('reset').click();`);
  assert.equal(await evaluate(`window.sent.filter(m=>m.type==='select').length`),selectionCount);
  await post({type:'cancelled',token:4,id:'2',message:'Cancelled'});
  assert.equal(await evaluate(`document.getElementById('codeset').value`),'2');
  assert.equal(await evaluate(`document.getElementById('codeset').disabled`),false);
  assert.deepEqual(await values(),['Axy','','']);
  fs.writeFileSync(path.join(root,'panel.png'),Buffer.from((await rpc('Page.captureScreenshot',{format:'png'})).data,'base64'));
  console.log(JSON.stringify({browser:'passed',fastChangeMs,pruned:true,clear:true,errorRetention:true,staleReplyIgnored:true,selectorAck:true,keyboardFocus:true}));
  if(process.env.CRL_IQ_NATIVE){
    const native=load('packages/crl-vscode/src/interactiveQuestionnaire.ts');
    const {applySession}=require(path.resolve('packages/crl-vscode/dist/apply-session.js'));
    const prepared=native.prepareInteractivePolicy(path.resolve('packages/crl-vscode/src/testdata/interactive-questionnaire/src/cel/mv/cases.cel'));
    const initial=prepared.initialStates[0];
    const session=new native.InteractiveSession(prepared.definitions,prepared.planId,native.nativeInteractiveRunner(applySession,root));session.reset(initial);
    let result=await session.evaluate();
    await post({type:'reset',token:3,subject:initial.subject});
    await post({type:'result',token:3,...result,subject:initial.subject});await mounted();
    fs.writeFileSync(path.join(root,'native-start.json'),JSON.stringify(result,null,2));
    // Actual browser-produced answers, never manually injected Observations or extraction output.
    await input(0,'first');await evaluate(`document.getElementById('continue').click()`);
    let sent=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1).response`);fs.writeFileSync(path.join(root,'browser-qr-1.json'),JSON.stringify(sent,null,2));
    result=await session.evaluate(sent);fs.writeFileSync(path.join(root,'native-answer-1.json'),JSON.stringify(result,null,2));
    await post({type:'result',token:3,...result,subject:initial.subject});await mounted();
    await input(1,'second');await evaluate(`document.getElementById('continue').click()`);
    sent=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1).response`);
    result=await session.evaluate(sent);fs.writeFileSync(path.join(root,'native-answer-2.json'),JSON.stringify(result,null,2));
    assert.deepEqual(result.activities,['Complete'],'show the terminal activity, not intermediate orchestration actions');
    await post({type:'result',token:3,...result,subject:initial.subject});await mounted();
    await input(0,'changed');await mounted();await input(0,'first');
    await evaluate(`document.getElementById('continue').click()`);
    sent=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1).response`);fs.writeFileSync(path.join(root,'browser-qr-pruned.json'),JSON.stringify(sent,null,2));
    result=await session.evaluate(sent);fs.writeFileSync(path.join(root,'native-pruned.json'),JSON.stringify(result,null,2));
    assert.equal(result.activities.length,0,'discarded second answer must pause again');
    assert.ok(!flatten(result.response?.item).some(i=>(i.answer||[]).some(a=>a.valueString==='second')),'no stale second answer');
    console.log('Native browser-exported Start -> first -> second -> earlier-change-back: passed');
  }
})().catch(async e=>{console.error(e);if(ws)try{console.error(await evaluate(`({text:document.body.innerText,html:document.getElementById('form').innerHTML.slice(0,1200),sent:window.sent})`));}catch{}process.exitCode=1}).finally(async()=>{if(ws)try{await rpc('Browser.close')}catch{};ws?.close();child?.kill();server?.close();});
