// REFACTOR:grounded: production renderer in a real browser, including native keyboard disclosure.
// This tests a source-built renderer, not an installed extension host or native Questionnaire.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process'),esbuild=require('esbuild');
const work=path.resolve(__dirname,'../../..');
const out=path.resolve(process.env.CRL_DESCRIPTION_BROWSER_OUT||path.join(work,'tmp/criterion-description-browser'));
fs.mkdirSync(out,{recursive:true});
const core=path.join(work,'packages/crl/dist/index.js');
esbuild.buildSync({entryPoints:[path.join(work,'packages/crl-vscode/src/flowPaneHtml.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'renderer.cjs'),plugins:[] ,alias:{'@smile-digital-health/crl':core},external:[core]});
const {renderFlowPane,toggleCriterionExpansion,FLOW_STYLE}=require(path.join(out,'renderer.cjs'));
const leaf={kind:'leaf',name:'Answer',lib:'Synthetic',nodeKey:'answer',isSource:true,isInferred:false};
const crit=(name,operand,description)=>({kind:'criterion',name,lib:'Synthetic',bodyHash:'fixture',operand,...(description?{description}:{})});
const childText='Supporting detail <img src=x onerror=alert(1)> & literal punctuation.';
const outerText='Review the evidence together.\nThis explanation does not add a question.';
const nested=crit('Evidence detail',leaf,childText), outer=crit('Evidence group',{kind:'and',operands:[nested,nested]},outerText);
const node=(key,kind,label,children=[])=>({nodeKey:key,nodeId:key,lib:'Synthetic',decision:'Example',kind,label,refKeys:[],children,location:{},...(kind==='action'?{actionKind:'recommend-activity'}:{})});
const structure=[{decision:'Example',lib:'Synthetic',nodeKey:'d',location:{},children:[node('w','when','Evidence group',[node('a','action','Met')])]}];
const opts={concepts:[],revealPrefix:'description_',guardOutlines:new Map([['w',{expr:outer}]])};
const expanded=toggleCriterionExpansion(new Set(),'w',structure,opts);
const plain=JSON.parse(JSON.stringify(outer, (k,v)=>k==='description'?undefined:v));
const baseline=renderFlowPane(structure,{...opts,expandedGuardWhens:expanded,guardOutlines:new Map([['w',{expr:plain}]])});
const rich=renderFlowPane(structure,{...opts,expandedGuardWhens:expanded});
const collapsed=renderFlowPane(structure,opts);
assert.deepEqual(rich.criterionOccurrences,baseline.criterionOccurrences);
assert.equal(rich.html.match(/viewBox="[^"]+"/)[0],baseline.html.match(/viewBox="[^"]+"/)[0]);
const html=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-probe'; script-src 'nonce-probe'"><style nonce="probe">:root{--vscode-foreground:#ddd;--vscode-editor-background:#202020;--vscode-panel-border:#777}body{color:#ddd;background:#202020;font:14px sans-serif;margin:20px}${FLOW_STYLE}</style></head><body>${rich.html}<script nonce="probe">window.ready=true;window.violations=[];document.addEventListener('securitypolicyviolation',e=>violations.push(e.violatedDirective));</script></body></html>`;
fs.writeFileSync(path.join(out,'rendered.html'),html);
async function rpc(target,method,params={}){
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout '+method)),30000);ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id===1){clearTimeout(timer);r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result);}};ws.send(JSON.stringify({id:1,method,params}));});}finally{ws.close();}
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 const browserPath=process.env.CRL_TEST_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 const log=fs.openSync(path.join(profile,'browser.log'),'w');
 const browser=spawn(browserPath,['--headless=new','--disable-gpu','--renderer-process-limit=2','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+profile,'--disk-cache-dir='+path.join(profile,'cache'),'--no-first-run','--no-default-browser-check','about:blank'],{stdio:['ignore',log,log],windowsHide:true});
 let browserError;browser.on('error',e=>browserError=e);
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let target,endpoint;
 try{
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<100&&!fs.existsSync(portFile);i++){if(browserError)throw browserError;if(browser.exitCode!==null)throw Error('Browser exited '+browser.exitCode);await sleep(100);}
  endpoint='http://127.0.0.1:'+fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0];
  target=await(await fetch(endpoint+'/json/new?'+encodeURIComponent('http://127.0.0.1:'+server.address().port),{method:'PUT'})).json();
  const evaluate=async expression=>{const r=await rpc(target,'Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  let ready=false;
  for(let i=0;i<100&&!ready;i++){
    try{ready=await evaluate('window.ready === true');}
    catch(e){if(!/Execution context was destroyed|Cannot find context/.test(String(e)))throw e;}
    if(!ready)await sleep(50);
  }
  assert(ready,'Browser fixture did not load');
  await rpc(target,'Page.bringToFront');
  const checks=await evaluate(`(()=>{const d=document.querySelector('.flow-criterion-descriptions');const texts=[...d.querySelectorAll('dd')].map(x=>x.textContent);d.querySelector('summary').focus();return {closedInitially:!d.open,keyboardFocus:document.activeElement===d.querySelector('summary'),entries:d.querySelectorAll('dt').length,literalMarkup:!d.querySelector('img')&&texts.some(t=>t.includes('<img src=x onerror=alert(1)>')),multiline:texts.some(t=>t.includes('\\n')),noInlineStyle:!document.querySelector('[style]'),textWhiteSpace:getComputedStyle(d.querySelector('dd')).whiteSpace};})()`);
  assert.equal(checks.closedInitially,true);assert.equal(checks.keyboardFocus,true);assert.equal(checks.entries,2);assert.equal(checks.literalMarkup,true);assert.equal(checks.multiline,true);assert.equal(checks.noInlineStyle,true);assert.equal(checks.textWhiteSpace,'pre-wrap');
  await rpc(target,'Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});
  await rpc(target,'Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  checks.enterOpens=await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(document.querySelector('details').open))))`);
  fs.writeFileSync(path.join(out,'partial-checks.json'),JSON.stringify(checks,null,2));assert.equal(checks.enterOpens,true);
  checks.selectable=await evaluate(`(()=>{const text=document.querySelector('dd'),r=document.createRange();r.selectNodeContents(text);const s=getSelection();s.removeAllRanges();s.addRange(r);return s.toString()===text.textContent&&text.getBoundingClientRect().height>0})()`);assert.equal(checks.selectable,true);
  const screenshot=await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'descriptions.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('summary').focus()`);
  await rpc(target,'Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',text:' ',unmodifiedText:' ',windowsVirtualKeyCode:32});
  await rpc(target,'Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  checks.spaceCloses=await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(!document.querySelector('details').open))))`);assert.equal(checks.spaceCloses,true);
  checks.cspViolations=await evaluate('violations');assert.deepEqual(checks.cspViolations,[]);
  checks.collapsedOwnerPresent=collapsed.html.includes('<dd>'+outerText+'</dd>');assert.equal(checks.collapsedOwnerPresent,true);
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({scope:'Production source renderer, disposable headless browser',core,checks},null,2));console.log(JSON.stringify(checks));
 }finally{
  if(target)await rpc(target,'Browser.close').catch(()=>{});
  if(browser.pid&&browser.exitCode===null)browser.kill();
  fs.closeSync(log);
  server.closeAllConnections();server.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
