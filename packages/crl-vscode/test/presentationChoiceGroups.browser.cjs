const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),esbuild=require('esbuild');
const base=path.resolve(process.argv[2]??'tmp/presentation-choice-research'),assets=path.resolve('packages/crl-vscode/media/lforms'),profile=fs.mkdtempSync(path.join(base,'edge-'));
const compile=(file,name)=>esbuild.buildSync({entryPoints:[file],bundle:true,write:false,format:'iife',globalName:name,target:'es2022'}).outputFiles[0].text;
const groupCode=compile('packages/crl-vscode/src/lformsPresentationGroups.ts','PG'),clearCode=compile('packages/crl-vscode/src/lformsBooleanControls.ts','BC');
const q=JSON.parse(fs.readFileSync(path.join(base,'native-questionnaire.json'))),qr=JSON.parse(fs.readFileSync(path.join(base,'native-response.json')));
const flatten=items=>(items||[]).flatMap(i=>[i,...flatten(i.item)]);
let browser,server,ws,seq=0,pending=new Map();const delay=ms=>new Promise(r=>setTimeout(r,ms));
const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>reject(Error('CDP '+method)),20000);pending.set(id,m=>{clearTimeout(t);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result)});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
async function until(test,label){for(let i=0;i<200;i++){const x=await test();if(x)return x;await delay(100);}throw Error('Timeout '+label);}
async function mount(questionnaire,response,order='clear-first'){
 await evaluate(`window.pgDispose?.();window.bcDispose?.();document.getElementById('form').replaceChildren();window.q=${JSON.stringify(questionnaire)};window.qr=${JSON.stringify(response)};window.edits=0;window.form=LForms.Util.convertFHIRQuestionnaireToLForms(q,'R4');if(qr)form=LForms.Util.mergeFHIRDataIntoLForms('QuestionnaireResponse',qr,form,'R4');LForms.Util.addFormToPage(form,'form',{prepopulate:false});`);
 await until(()=>evaluate(`document.querySelectorAll('lhc-item-boolean input[type=radio]').length===${flatten(questionnaire.item).filter(i=>i.type==='boolean').length*3}`),'native Boolean nodes');
 await evaluate(order==='clear-first'?`window.bcDispose=BC.installBooleanAnswerClearControls(document.getElementById('form'));window.pgDispose=PG.installPresentationChoiceGroups(document.getElementById('form'),q,()=>edits++);`:`window.pgDispose=PG.installPresentationChoiceGroups(document.getElementById('form'),q,()=>edits++);window.bcDispose=BC.installBooleanAnswerClearControls(document.getElementById('form'));`);
 await until(()=>evaluate(`document.querySelectorAll('[data-crl-choice-proxy] input[type=checkbox]').length===${flatten(questionnaire.item).filter(i=>i.type==='boolean').length}`),'proxies');await delay(150);
}
const exportQR=()=>evaluate(`LForms.Util.getFormFHIRData('QuestionnaireResponse','R4',document.getElementById('form'))`);
const boxes=`[...document.querySelectorAll('[data-crl-choice-proxy] input[type=checkbox]')]`;
(async()=>{
 server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"></head><body><div id="form"></div><script src="/zone.min.js"></script><script src="/lhc-forms.js"></script><script src="/lformsFHIR.min.js"></script></body></html>');}else{const file=path.join(assets,path.basename(req.url.split('?')[0]));if(!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(fs.readFileSync(file));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,url],{windowsHide:true,stdio:['ignore','ignore',fs.openSync(path.join(profile,'browser.log'),'w')]});
 await until(()=>fs.existsSync(path.join(profile,'DevToolsActivePort')),'Edge');const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
 const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page'),'page');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}};
 await rpc('Emulation.setDeviceMetricsOverride',{width:1100,height:1000,deviceScaleFactor:1,mobile:false});await until(()=>evaluate('document.readyState==="complete" && !!window.LForms?.Util'),'vendor');await evaluate(groupCode+'\n'+clearCode);
 const rows=[];
 for(const order of ['clear-first','group-first']){
  await mount(q,qr,order);assert.deepEqual(await evaluate(`${boxes}.map(b=>({checked:b.checked,mixed:b.indeterminate}))`),[{checked:false,mixed:true},{checked:false,mixed:true}]);
  const first=await exportQR();assert(flatten(first.item).every(i=>!i.answer?.length));
  await evaluate(`${boxes}[0].click()`);await delay(100);let exported=await exportQR();assert.deepEqual(flatten(exported.item).filter(i=>i.answer?.length).map(i=>i.answer),[[{valueBoolean:true}]]);
  await evaluate(`${boxes}[0].click()`);await delay(100);exported=await exportQR();assert.deepEqual(flatten(exported.item).filter(i=>i.answer?.length).map(i=>i.answer),[[{valueBoolean:false}]]);
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].filter(b=>b.textContent==='Clear answer'&&!b.hidden&&b.getBoundingClientRect().height).length`),1);
  await evaluate(`${boxes}[1].focus()`);await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await delay(150);exported=await exportQR();assert.deepEqual(flatten(exported.item).filter(i=>i.answer?.length).map(i=>i.answer),[[{valueBoolean:false}],[{valueBoolean:true}]]);
  await evaluate(`document.querySelectorAll('[data-crl-choice-proxy] button')[0].click()`);await delay(150);exported=await exportQR();assert.deepEqual(flatten(exported.item).filter(i=>i.answer?.length).map(i=>i.answer),[[{valueBoolean:true}]]);assert.equal(await evaluate(`document.activeElement.id`),'crl-choice-'+flatten(q.item).find(i=>i.type==='boolean').linkId);
  await evaluate(`document.getElementById('form').inert=true`);await delay(80);assert(await evaluate(`${boxes}.every(b=>b.disabled)`));await evaluate(`document.getElementById('form').inert=false`);await delay(80);assert(await evaluate(`${boxes}.every(b=>!b.disabled)`));
  await evaluate(`window.pgDispose()`);await delay(80);assert.equal(await evaluate(`document.querySelectorAll('input[type=checkbox]').length`),0);assert.equal(await evaluate(`document.querySelectorAll('[data-boolean-clear]').length`),2);
  await evaluate(`window.pgDispose=PG.installPresentationChoiceGroups(document.getElementById('form'),q,()=>edits++)`);await delay(100);assert.equal(await evaluate(`document.querySelectorAll('[data-boolean-clear]').length`),0);assert.equal(await evaluate(`${boxes}.length`),2);
  rows.push({order,triState:true,space:true,clear:true,focus:true,inert:true,handoff:true});
 }
 const prefilled=structuredClone(qr);const prefilledLeaves=flatten(prefilled.item).filter(i=>i.definition?.includes('#Observation.value'));prefilledLeaves[0].answer=[{valueBoolean:true}];prefilledLeaves[1].answer=[{valueBoolean:false}];await mount(q,prefilled);assert.deepEqual(await evaluate(`${boxes}.map(b=>({checked:b.checked,mixed:b.indeterminate}))`),[{checked:true,mixed:false},{checked:false,mixed:false}]);rows.push({prefilledResponseRendering:true});
 const readOnlyQ=structuredClone(q);readOnlyQ.item[0].readOnly=true;await mount(readOnlyQ,prefilled);assert(await evaluate(`${boxes}.every(b=>b.disabled)`));const readOnlyBefore=await exportQR();await evaluate(`${boxes}[0].click()`);assert.deepEqual((await exportQR()).item,readOnlyBefore.item);rows.push({readOnly:true});
 const gridQ=structuredClone(q),group=gridQ.item[0];const template=group.item.find(i=>i.type==='boolean');assert(template,'native root is expected to be Boolean');
 for(let n=2;n<6;n++){const item=structuredClone(template);item.linkId=String(n+1);item.text='Independent symptom '+(n+1);group.item.push(item);}
 group.extension.find(e=>e.url.endsWith('/presentation-choice-group')).extension.find(e=>e.url==='columns').valueInteger=3;
 await mount(gridQ,null);for(const [width,expected] of [[1100,3],[600,2],[360,1]]){
  await rpc('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await delay(200);
  const dimensions=await evaluate(`({items:[...document.querySelectorAll('[data-crl-choice-proxy]')].map(n=>{const r=n.closest('lhc-item').getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:r.width}}),overflow:document.documentElement.scrollWidth>innerWidth})`);
  fs.writeFileSync(path.join(base,'responsive-debug-'+width+'.json'),JSON.stringify(await evaluate("[...document.querySelectorAll('#form,#form *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).map(n=>({tag:n.tagName,cl:n.className,id:n.id,w:n.getBoundingClientRect().width,style:n.getAttribute('style')})).slice(0,25)"),null,2));assert.equal(new Set(dimensions.items.map(i=>i.x)).size,expected,JSON.stringify(dimensions));assert(!dimensions.overflow,JSON.stringify(dimensions));
  const shot=await rpc('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(base,`production-grid-${width}.png`),Buffer.from(shot.data,'base64'));rows.push({width,columns:expected,noOverflow:true});
 }
 fs.writeFileSync(path.join(base,'production-renderer-verification.json'),JSON.stringify({passed:true,vendor:'43.1.0',nativeQ:true,rows},null,2));console.log(JSON.stringify({passed:true,rows}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();browser?.kill();server?.close();});
