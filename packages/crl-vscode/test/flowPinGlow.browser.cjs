// Production renderer, pin controller and extracted webview handlers in disposable Edge.
// No installed extension or CDP-enabled user session is required.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process'),esbuild=require('esbuild');
const work=path.resolve(__dirname,'../../..'),out=path.resolve(process.env.CRL_PIN_BROWSER_OUT||path.join(work,'tmp/pin-yellow-glow/browser'));
fs.mkdirSync(out,{recursive:true});
const alias={vscode:path.join(work,'packages/crl-vscode/test/oracle/vscode-stub.ts'),'@smile-digital-health/crl':path.join(work,'packages/crl/dist/index.js'),'@smile-digital-health/crl/provenance':path.join(work,'packages/crl/dist/provenance/index.js'),'@smile-digital-health/crl/language-services':path.join(work,'packages/crl/dist/language-services/index.js')};
esbuild.buildSync({stdin:{contents:`export {renderFlowPane,FLOW_STYLE} from './packages/crl-vscode/src/flowPaneHtml';export {COCKPIT_WEBVIEW_SCRIPT} from './packages/crl-vscode/src/correspondenceCockpit';`,resolveDir:work,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'fixture.cjs'),alias});
const {renderFlowPane,FLOW_STYLE,COCKPIT_WEBVIEW_SCRIPT:source}=require(path.join(out,'fixture.cjs'));
const node=key=>({nodeKey:key,nodeId:key,decision:'Demo',lib:'Demo',kind:'action',label:key,refKeys:[],location:{},children:[],actionKind:'recommend-activity'});
const data=renderFlowPane([{decision:'Demo',lib:'Demo',nodeKey:'demo',location:{},children:[node('a'),node('b'),node('c')]}],{concepts:[],revealPrefix:'pin_'});
function handler(type){const marker=`if(m.type==='${type}'){`,at=source.indexOf(marker);assert(at>=0);const start=at+marker.length;let depth=1,end=start;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}assert.equal(depth,0);return source.slice(start,end-1);}
const pinApply=source.slice(source.indexOf('const applyFlowPin='),source.indexOf('let pendingPinFocus='));
const clearOverlay=source.slice(source.indexOf('const clrRO='),source.indexOf('const clrTN='));
const renderPrefix=handler('render').slice(0,handler('render').indexOf('root.innerHTML=m.html'));
const script=esbuild.buildSync({stdin:{contents:`
 import {installFlowPinVisibility} from './packages/crl-vscode/src/flowPinVisibility';
 import {paintPinnedTraversal} from './packages/crl-vscode/src/unpinnedTreeFocusWebview';
 import {installFlowLogicHighlight} from './packages/crl-vscode/src/flowLogicHighlight';
 const root=document.getElementById('root');root.innerHTML=${JSON.stringify(data.html)};
 const pinVisibility=installFlowPinVisibility(root),gen=1,criterionDescriptionUi={refresh(){},beforeRender(){}};
 const logicUi=installFlowLogicHighlight(root);
 let pinnedFlowKey='',pinnedRouteKeys=[],pinnedPathKeys=[],pinnedGroupKeys=[],pinnedGroupOutcomes=[],pinnedRouteLabel='',currentRouteLabel='';
 const pinnedTraversalPaint=paintPinnedTraversal;
 ${pinApply}
 ${clearOverlay}
 window.mark=m=>{${handler('markReviewOverlay')}};
 window.clearReview=()=>{${handler('clearReviewOverlay')}};
 window.pin=key=>{pinnedFlowKey=key;pinnedRouteKeys=key?['demo',key]:[];applyFlowPin()};
 window.rerender=()=>{let pendingPinFocus='',pinFocusVersion=0,gen=1,pinEpoch=1;const m={gen:1},disclosureUi={beforeRender(){}},treeFocusUi={beforeRender(){}};${renderPrefix};root.innerHTML=${JSON.stringify(data.html)};applyFlowPin()};
 root.classList.add('flow-route-review-loading');
 const row=key=>root.querySelector('[data-flow-key="'+key+'"]'),control=key=>row(key).querySelector(':scope > .flow-pin');
 const shown=()=>[...root.querySelectorAll('.flow-pin')].filter(p=>getComputedStyle(p).display!=='none'&&p.getClientRects().length).map(p=>p.parentElement.dataset.flowKey);
 const glowing=key=>getComputedStyle(control(key)).filter.includes('255, 213, 79');
 let count=0;const check=(value,label)=>{count++;if(!value)throw Error(label)},equal=(a,b,label)=>check(JSON.stringify(a)===JSON.stringify(b),label);
 window.runChecks=()=>{
  equal(shown(),['a'],'first pin offered');check(!glowing('a'),'wait for current verdict state');mark({gen:0,policyRoutesApproved:true});check(!glowing('a'),'stale acknowledgement keeps loading');mark({gen:1,policyRoutesApproved:false});check(glowing('a'),'first pin fuzzy yellow');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',shiftKey:true}));equal(shown(),['a','b','c'],'Shift shows all');check(glowing('a')&&!glowing('b')&&!glowing('c'),'only suggested pin glows');
  document.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift'}));equal(shown(),['a'],'release restores first');
  row('a').classList.add('leaf-allpass');pinVisibility.update();equal(shown(),['b'],'first without Pass offered');check(glowing('b')&&!glowing('a'),'cue follows default pin');
  row('b').classList.add('leaf-allpass');pinVisibility.update();equal(shown(),['c'],'next offered');row('c').classList.add('leaf-allpass');pinVisibility.update();equal(shown(),['a'],'all Pass offers first');
  row('a').classList.remove('leaf-allpass');pinVisibility.update();equal(shown(),['a'],'leaf without authored route still offered');
  root.dispatchEvent(new PointerEvent('pointermove',{shiftKey:true}));equal(shown(),['a','b','c'],'enter with Shift held');window.dispatchEvent(new Event('blur'));equal(shown(),['a'],'blur clears Shift');
  pin('b');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',shiftKey:true}));equal(shown(),['b'],'pinned only even with Shift');check(!glowing('b'),'enter unfinished pinned removes yellow');
  check(control('b').getAttribute('aria-pressed')==='true','pressed state retained');check(getComputedStyle(control('b').querySelector('rect')).strokeWidth==='2px','existing pinned border retained');
  mark({gen:1,policyRoutesApproved:true});check(glowing('b'),'whole policy approved glows on current pin');
  mark({gen:0,policyRoutesApproved:false});check(glowing('b'),'stale generation cannot clear approval');
  pin('c');check(glowing('c')&&!glowing('b'),'completion follows navigation to another pin');
  for(const theme of ['vscode-dark','vscode-light','vscode-high-contrast-light']){
   document.body.className=theme;document.body.style.background=theme==='vscode-dark'?'#202020':'#fff';
   check(glowing('c'),'exit cue visible '+theme);pin('');check(!glowing('a'),'approved tree no entry cue '+theme);rerender();check(!glowing('a'),'approved tree rerender awaiting acknowledgement no entry cue '+theme);mark({gen:1,policyRoutesApproved:true});check(!glowing('a'),'approved tree acknowledged no entry cue '+theme);pin('c');mark({gen:1,policyRoutesApproved:false});check(!glowing('c'),'unfinished no yellow '+theme);pin('');check(glowing('a'),'start cue '+theme);pin('c');check(!glowing('c'),'pinned no start cue '+theme);mark({gen:1,policyRoutesApproved:true});
  }
  control('c').focus();check(getComputedStyle(control('c')).outlineStyle==='solid','keyboard outline independent of yellow');
  clearReview();check(!glowing('c'),'teardown removes approval');pin('');check(!glowing('a'),'teardown does not invent entry cue');pin('c');
  mark({gen:1,policyRoutesApproved:'true'});check(!glowing('c'),'nonboolean approval rejected');
  document.body.dataset.mode='cockpit';mark({gen:1,policyRoutesApproved:true});check(!glowing('c'),'cue MV only');document.body.dataset.mode='medical-validation';
  pin('');mark({gen:1,policyRoutesApproved:true});check(!glowing('a'),'return to approved tree no yellow');mark({gen:1,policyRoutesApproved:false});check(glowing('a'),'reopened route review offers entry cue again');document.body.className='vscode-dark';document.body.style.background='#202020';
  pinVisibility.dispose();check(!root.classList.contains('flow-show-all-pins'),'dispose clears held Shift');
  return {checks:count,scope:'Production renderer/controller and extracted webview handlers; not installed extension'};
 };
 window.ready=true;
 `,resolveDir:work,loader:'ts'},bundle:true,platform:'browser',format:'iife',write:false}).outputFiles[0].text;
const html='<!doctype html><html><head><meta charset="utf-8"><style>:root{--vscode-foreground:#ddd;--vscode-editor-background:#202020;--vscode-panel-border:#777}body{background:#202020;color:#ddd}'+FLOW_STYLE+'</style></head><body class="vscode-dark" data-mode="medical-validation"><div id="root"></div><script>'+script.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
fs.writeFileSync(path.join(out,'rendered.html'),html);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rpc(target,method,params={}){const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout '+method)),30000);ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id===1){clearTimeout(timer);r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result)}};ws.send(JSON.stringify({id:1,method,params}))})}finally{ws.close()}}
(async()=>{
 const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(profile,{recursive:true});const log=fs.openSync(path.join(profile,'browser.log'),'w');
 const browser=spawn(process.env.CRL_TEST_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--renderer-process-limit=2','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+profile,'--disk-cache-dir='+path.join(profile,'cache'),'--no-first-run','--no-default-browser-check','about:blank'],{stdio:['ignore',log,log],windowsHide:true});
 let browserError;browser.on('error',e=>browserError=e);const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));let target;
 try{
  const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++){if(browserError)throw browserError;if(browser.exitCode!==null)throw Error('Browser exited '+browser.exitCode);await sleep(100)}
  const endpoint='http://127.0.0.1:'+fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0];target=await(await fetch(endpoint+'/json/new?'+encodeURIComponent('http://127.0.0.1:'+server.address().port),{method:'PUT'})).json();
  const evaluate=async expression=>{const r=await rpc(target,'Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
  let ready=false;for(let i=0;i<100&&!ready;i++){try{ready=await evaluate('window.ready===true')}catch(e){if(!/Execution context was destroyed|Cannot find context/.test(String(e)))throw e}if(!ready)await sleep(50)}assert(ready,'Browser fixture did not load');
  const receipt=await evaluate('runChecks()');
  for(const [name,setup] of [['start',"pin('');mark({gen:1,policyRoutesApproved:false})"],['in-progress',"pin('b');mark({gen:1,policyRoutesApproved:false})"],['done',"mark({gen:1,policyRoutesApproved:true})"],['returned-tree',"pin('')"]]){
   await evaluate(setup);const image=await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(image.data,'base64'));
  }
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 }finally{if(target)await rpc(target,'Browser.close').catch(()=>{});if(browser.pid&&browser.exitCode===null)browser.kill();fs.closeSync(log);server.closeAllConnections();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
