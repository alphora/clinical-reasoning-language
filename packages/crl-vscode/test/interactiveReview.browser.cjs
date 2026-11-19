// Actual vendored LForms in Chromium; no native evaluations or network/package downloads.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),esbuild=require('esbuild');
const base=path.resolve('tmp/interactive-review-controls-20261119/browser');fs.mkdirSync(base,{recursive:true});
const profile=fs.mkdtempSync(path.join(base,'edge-')),assets=path.resolve('packages/crl-vscode/media/lforms');
const code=esbuild.buildSync({entryPoints:['packages/crl-vscode/src/interactiveQuestionnaireHtml.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
const moduleObject={exports:{}};new Function('require','module','exports',code)(require,moduleObject,moduleObject.exports);
const {interactiveQuestionnaireHtml}=moduleObject.exports;
let browser,server,ws,seq=0,pending=new Map();const delay=ms=>new Promise(r=>setTimeout(r,ms));
const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>reject(Error('CDP '+method+' '+JSON.stringify(params).slice(0,300))),15000);pending.set(id,m=>{clearTimeout(t);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
async function until(test,label){for(let i=0;i<150;i++){const result=await test();if(result)return result;await delay(100);}throw Error('Timeout '+label);}
const post=m=>evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(m)}}))`);
const q={resourceType:'Questionnaire',url:'urn:interactive-review-test',status:'active',item:[{linkId:'a',type:'boolean',text:'A question',definition:'urn:a#Observation.value[x]'},{linkId:'b',type:'quantity',text:'A measurement',definition:'urn:b#Observation.value[x]',extension:[{url:'http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption',valueCoding:{system:'http://unitsofmeasure.org',code:'ms',display:'ms'}}]}]};
const review={questions:[{linkId:'a'},{linkId:'b'}],outcomes:[{label:'To do'}]};
const result={type:'result',token:1,evaluationId:'evaluation-1',questionnaire:q,response:{resourceType:'QuestionnaireResponse',questionnaire:q.url,status:'in-progress',subject:{reference:'Patient/p'},item:[]},subject:'Patient/p',activities:['Met'],review};
(async()=>{
 server=http.createServer((req,res)=>{
  if(req.url==='/'){
   let html=interactiveQuestionnaireHtml('test','http://127.0.0.1:*',name=>'/'+name);
   html=html.replace('<script nonce="test" src=',`<script nonce="test">window.sent=[];window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});</script><script nonce="test" src=`);
   res.setHeader('Content-Type','text/html');res.end(html);
  }else{const file=path.join(assets,path.basename(req.url));if(!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 browser=spawn(process.env.BROWSER_EXE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,url],{windowsHide:true,stdio:['ignore','ignore',fs.openSync(path.join(profile,'browser.log'),'w')]});
 await until(()=>fs.existsSync(path.join(profile,'DevToolsActivePort')),'Edge');const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
 const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page'&&t.url.startsWith(url)),'page');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}};
 await rpc('Emulation.setDeviceMetricsOverride',{width:750,height:950,deviceScaleFactor:1,mobile:false});
 await until(()=>evaluate('window.sent?.some(m=>m.type==="ready")'),'ready');
 await post({type:'initial',token:1,states:[{id:'one',label:'One'}],subject:'Patient/p'});await post(result);
 await until(()=>evaluate('document.querySelectorAll("[data-question-review]").length===6 && !document.querySelector("[data-question-review]").disabled'),'review controls');
 const before=await evaluate(`JSON.stringify(LForms.Util.getFormFHIRData('QuestionnaireResponse','R4',document.getElementById('form')).item)`);
 const geometry=await evaluate(`[...document.querySelectorAll('.crl-question-review-tools')].map(n=>{const a=n.getBoundingClientRect(),b=n.parentElement.getBoundingClientRect();return{right:a.right,parentRight:b.right,left:a.left,parentLeft:b.left,icons:n.querySelectorAll('svg').length}})`);
 assert(geometry.every(g=>g.icons===3&&g.right<=g.parentRight+1&&g.left>g.parentLeft+50),JSON.stringify(geometry));
 for(const kind of ['focus','edit','flag'])await evaluate(`document.querySelector('[data-question-review="${kind}"]').click()`);
 assert.deepEqual(await evaluate(`sent.filter(m=>m.type==='questionReviewAction').map(m=>[m.action,m.linkId,m.evaluationId])`),[['focus','a','evaluation-1'],['edit','a','evaluation-1'],['flag','a','evaluation-1']]);
 await evaluate(`document.querySelector('[data-question-review="flag"]').focus()`);await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 assert.equal(await evaluate(`sent.filter(m=>m.type==='questionReviewAction'&&m.action==='flag').length`),2);
 assert.equal(await evaluate(`JSON.stringify(LForms.Util.getFormFHIRData('QuestionnaireResponse','R4',document.getElementById('form')).item)`),before);
 await evaluate(`document.querySelector('#outcomes button').click()`);assert.equal(await evaluate(`sent.filter(m=>m.type==='outcomeVerdict').length`),1);
 await evaluate(`document.querySelector('label[id$="|true"]').click()`);
 await until(()=>evaluate(`sent.some(m=>m.type==='answersChanged') && document.getElementById('results').hidden`),'dirty invalidation');
 await post({...result,evaluationId:'evaluation-2'});await until(()=>evaluate(`document.querySelectorAll('[data-question-review]').length===6&&!document.querySelector('[data-question-review]').disabled`),'rerender');
 // Replacing the form leaves one toolbar per question, and current evaluation identity only.
 await evaluate(`document.querySelector('[data-question-review="edit"]').click()`);assert.equal(await evaluate(`sent.filter(m=>m.type==='questionReviewAction').at(-1).evaluationId`),'evaluation-2');
 await post({...result,evaluationId:'review-recovery',review:undefined});await until(()=>evaluate(`!document.querySelector('#outcomes button')`),'missing review');
 await post({type:'review',token:1,evaluationId:'review-recovery',review});await until(()=>evaluate(`!!document.querySelector('#outcomes button')&&document.querySelectorAll('[data-question-review]').length===6&&!document.querySelector('#outcomes button').disabled`),'review recovery');
 await evaluate(`window.originalAddForm=LForms.Util.addFormToPage;LForms.Util.addFormToPage=(...args)=>new Promise(resolve=>{window.releaseMount=async()=>resolve(await originalAddForm.apply(LForms.Util,args));});`);
 await post({...result,evaluationId:'mount-race'});await post({type:'review',token:1,evaluationId:'mount-race',review});await post({type:'review',token:1,evaluationId:'mount-race',review});
 assert.equal(await evaluate(`document.querySelectorAll('[data-question-review]').length`),0);
 await evaluate(`releaseMount()`);await until(()=>evaluate(`!!document.querySelector('[data-question-review]:not(:disabled)')`),'delayed mount');
 await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);assert.equal(await evaluate(`document.querySelectorAll('[data-question-review]').length`),6);
 await evaluate(`LForms.Util.addFormToPage=originalAddForm;`);
 const choiceUrl='http://clinicalreasoninglanguage.org/fhir/StructureDefinition/presentation-choice-group';
 const grouped={...q,item:[{linkId:'g',type:'group',extension:[{url:choiceUrl,extension:[{url:'protocol',valueInteger:1},{url:'columns',valueInteger:2},{url:'control',valueCode:'checkbox'}]}],item:['c','d'].map(linkId=>({linkId:'member-'+linkId,type:'group',item:[{linkId,type:'boolean',text:'Choice '+linkId,definition:'urn:'+linkId+'#Observation.value[x]'}]}))}]};
 await post({...result,evaluationId:'grouped',questionnaire:grouped,review:{...review,questions:[{linkId:'c'},{linkId:'d'}]}});
 await until(()=>evaluate(`document.querySelectorAll('[data-crl-choice-proxy] input[type=checkbox]').length===2&&document.querySelectorAll('[data-question-review]').length===6&&!document.querySelector('[data-question-review]').disabled`),'grouped controls');
 const proxyBefore=await evaluate(`JSON.stringify(LForms.Util.getFormFHIRData('QuestionnaireResponse','R4',document.getElementById('form')).item)`);
 await evaluate(`document.querySelector('[data-question-review="flag"]').click()`);
 assert.equal(await evaluate(`sent.filter(m=>m.type==='questionReviewAction').at(-1).linkId`),'c');
 assert.equal(await evaluate(`JSON.stringify(LForms.Util.getFormFHIRData('QuestionnaireResponse','R4',document.getElementById('form')).item)`),proxyBefore);
 const groupedGeometry=await evaluate(`[...document.querySelectorAll('.crl-question-review-tools')].map(n=>{const a=n.getBoundingClientRect(),b=n.parentElement.getBoundingClientRect();return{right:a.right,parentRight:b.right,width:a.width,height:a.height}})`);
 assert(groupedGeometry.every(g=>g.width>0&&g.height>0&&g.right<=g.parentRight+1),JSON.stringify(groupedGeometry));
 await post({type:'definitionStale',token:2,message:'Definitions changed'});assert.equal(await evaluate(`document.querySelectorAll('[data-question-review]:not(:disabled)').length`),0);assert.equal(await evaluate(`document.querySelector('#outcomes button').disabled`),true);
 const screenshot=await rpc('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(base,'controls.png'),Buffer.from(screenshot.data,'base64'));
 fs.writeFileSync(path.join(base,'receipt.json'),JSON.stringify({passed:true,geometry,groupedGeometry,questionActions:await evaluate(`sent.filter(m=>m.type==='questionReviewAction')`)},null,2));
 console.log('PASS: real LForms right-side geometry, pencil/flag/focus icons, mouse/keyboard messages, unchanged answers, outcome invalidation, replacement and stale guards.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{try{if(ws)await rpc('Browser.close');}catch{}ws?.close();browser?.kill();server?.close();});
