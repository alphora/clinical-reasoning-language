// Actual renderer, zoom/pan handlers, flag highlight handler and drawer CSS in disposable Edge.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),esbuild=require('esbuild'),ts=require('typescript');
const work=path.resolve(__dirname,'../../..'),out=path.resolve(process.env.CRL_DRAWER_BROWSER_OUT||path.join(work,'tmp/flag-drawer-pan'));
fs.mkdirSync(out,{recursive:true});
const alias={vscode:path.join(work,'packages/crl-vscode/test/oracle/vscode-stub.ts'),'@smile-digital-health/crl/session':path.join(work,'packages/crl/dist/results/session.js'),'@smile-digital-health/crl/provenance':path.join(work,'packages/crl/dist/provenance/index.js'),'@smile-digital-health/crl/language-services':path.join(work,'packages/crl/dist/language-services/index.js'),'@smile-digital-health/crl':path.join(work,'packages/crl/dist/index.js')};
esbuild.buildSync({stdin:{contents:`export {renderFlowPane,FLOW_STYLE} from './packages/crl-vscode/src/flowPaneHtml';export {COCKPIT_WEBVIEW_SCRIPT} from './packages/crl-vscode/src/correspondenceCockpit';export {installRouteCards,ROUTE_CARD_STYLE} from './packages/crl-vscode/src/routeCardsWebview';export {installFlowComponentContainers} from './packages/crl-vscode/src/flowComponentContainers';export {installFlowPinVisibility} from './packages/crl-vscode/src/flowPinVisibility';`,resolveDir:work,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'fixture.cjs'),alias,logLevel:'error'});
const {renderFlowPane,FLOW_STYLE,ROUTE_CARD_STYLE,installRouteCards,installFlowComponentContainers,installFlowPinVisibility,COCKPIT_WEBVIEW_SCRIPT:script}=require(path.join(out,'fixture.cjs'));
const source=fs.readFileSync(path.join(work,'packages/crl-vscode/src/correspondenceCockpit.ts'),'utf8');
const css=':root{--vscode-foreground:#ddd;--vscode-editor-background:#202020;--vscode-editorWidget-background:#252526;--vscode-panel-border:#454545}body{background:#202020}'+source.match(/body\{[^}]+\}/)[0]+FLOW_STYLE+ROUTE_CARD_STYLE+source.match(/\.flag-drawer\{[^}]+\}/)[0]+source.match(/body:has\(\.flag-drawer\) \.flow-zoom\{[^}]+\}/)[0]+(source.match(/body\[data-mode="medical-validation"\] \.flow-svg\{[^}]+\}/)?.[0]||(()=>{throw Error('Missing MV manual pan CSS');})());
const row=(key,kind,children=[])=>({nodeKey:key,nodeId:key,decision:'Synthetic policy',lib:'Demo',kind,label:kind==='when'?'Review condition '+key:'Met',refKeys:[],location:{},children,...(kind==='action'?{actionKind:'recommend-activity'}:{})});
let tree=row('terminal','action');for(let i=10;i>=0;i--)tree=row('condition'+i,'when',[tree]);
const rendered=renderFlowPane([{decision:'Synthetic policy',lib:'Demo',nodeKey:'demo',location:{},children:[tree]}],{concepts:[],revealPrefix:'pan_'});
const parsed=ts.createSourceFile('webview.js',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
function handler(type){let block;const visit=node=>{if(ts.isIfStatement(node)&&node.expression.getText(parsed)===`m.type==='${type}'`)block=node.thenStatement;ts.forEachChild(node,visit);};visit(parsed);assert(block&&ts.isBlock(block),'actual '+type+' handler');return block.getText(parsed).slice(1,-1);}

const zoom=script.slice(script.indexOf('let treeZoom=1;'),script.indexOf('const clrFC='));
const pan=script.slice(script.indexOf('let fpPan=false'),script.indexOf("root.addEventListener('click'",script.indexOf('let fpPan=false')));
const js=`const root=document.getElementById('root'),fld=document.getElementById('flagDrawer'),gen=1,aff=()=>{};root.innerHTML=${JSON.stringify(rendered.html)};${zoom}${pan}
const target=root.querySelector('[data-flow-key="terminal"]'),svg=root.querySelector('.flow-svg');let scrollRequests=0;const nativeScroll=target.scrollIntoView.bind(target);target.scrollIntoView=options=>{scrollRequests++;nativeScroll(options);};
const componentUi=(${installFlowComponentContainers.toString()})(root),pinVisibility=(${installFlowPinVisibility.toString()})(root),routeUi=(${installRouteCards.toString()})(root,{postMessage(){}},()=>gen,()=>{applyZoom();componentUi();});
const question=root.querySelector('[data-flow-key=condition0]');question.dataset.flowQuestion=JSON.stringify(['Demo','Synthetic question']);question.dataset.flowWhen='condition0';
const receiveFlag=m=>{${handler('flagHl')}};
const receiveDrawer=html=>{const m={html};${handler('flagDrawer')}};
// Computed geometry below forces layout; do not depend on headless tab animation-frame scheduling.
const frames=()=>new Promise(r=>setTimeout(r,50));
const box=()=>{const r=target.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
const position=()=>[document.scrollingElement.scrollLeft,document.scrollingElement.scrollTop];
const drawer=mode=>'<aside class="flag-drawer"><strong>Flag — Synthetic review</strong><div>'+mode+'</div>'+(mode==='create'||mode==='edit'?'<input aria-label="Description">':mode==='bulk'?'<div data-review-grid><input type="radio"></div>':'')+'</aside>';
let count=0;const check=(v,label)=>{count++;if(!v)throw Error(label);},equal=(a,b,label)=>check(JSON.stringify(a)===JSON.stringify(b),label);
window.checkCase=async (zoomValue,pinned=false)=>{
 routeUi.reset();root.classList.toggle('flow-has-pin',pinned);target.classList.toggle('flow-pinned',pinned);pinVisibility.update();
 setZoom(zoomValue);
 if(pinned){routeUi.show({token:'pinned-check',pinKey:'terminal',label:'Synthetic pinned route',cards:[{id:'question',library:'Demo',concept:'Synthetic question',ownerKey:'condition0',criterionPaths:[[]],text:'Synthetic question?',value:'Yes'}],verdict:{state:'unreviewed',label:'To do',count:1}});check(!!root.querySelector('.route-card'),'production pinned route card rendered');}
window.scrollTo(0,0);svg.style.paddingRight='0px';await frames();const unpadded=box();svg.style.paddingRight='';await frames();equal(box(),unpadded,'pan allowance does not change node geometry or SVG scale');
 window.scrollTo(40,60);await frames();
 for(const mode of ['view','create','edit','bulk']){
  const before=position(),geometry=box();receiveDrawer(drawer(mode));await frames();equal(position(),before,'drawer '+mode+' does not pan');equal(box(),geometry,'drawer '+mode+' does not move tree');
  receiveFlag({gen:1,gids:[target.id],scroll:true});await frames();equal(position(),before,'flag '+mode+' ignores automatic scroll request');check(target.classList.contains('flag-current'),'flag highlighting retained');
  const panel=fld.querySelector('.flag-drawer').getBoundingClientRect(),space=parseFloat(getComputedStyle(svg).paddingRight);check(space>=panel.width+23,'manual pan room exceeds actual panel width');
  receiveDrawer('');await frames();equal(position(),before,'closing '+mode+' leaves viewport');equal(box(),geometry,'closing '+mode+' leaves node geometry');
 }
 receiveDrawer(drawer('view'));await frames();
 svg.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:160,clientY:140,bubbles:true}));window.dispatchEvent(new PointerEvent('pointermove',{clientX:-20000,clientY:140,cancelable:true}));window.dispatchEvent(new PointerEvent('pointerup'));await frames();
 const panel=fld.querySelector('.flag-drawer').getBoundingClientRect();check(target.getBoundingClientRect().right<=panel.left-20,'rightmost node can be manually panned clear of drawer');check(scrollRequests===0,'no flag navigation call');
 const panned=position(),geometry=box();receiveDrawer('');await frames();equal(position(),panned,'closing at far-right pan does not clamp viewport');equal(box(),geometry,'closing after manual pan leaves tree alone');
 return {zoom:zoomValue,pinned,checks:count,manualScrollLeft:panned[0],padding:parseFloat(getComputedStyle(svg).paddingRight)};
};window.checkExplicitReveal=async()=>{receiveDrawer(drawer('view'));window.scrollTo(0,0);await frames();const before=scrollRequests;receiveFlag({gen:1,gids:[target.id],reveal:true});await frames();check(scrollRequests===before+1,'explicit list selection navigates');const panel=fld.querySelector('.flag-drawer').getBoundingClientRect(),rect=target.getBoundingClientRect();check(rect.left>=10&&rect.right<=panel.left-10,'explicit reveal leaves target clear of drawer');const pos=position();receiveFlag({gen:1,gids:[target.id]});await frames();equal(position(),pos,'later highlight refresh does not repeat navigation');const visiblePos=position(),visibleCalls=scrollRequests;receiveFlag({gen:1,gids:[target.id],reveal:true});await frames();equal(position(),visiblePos,'already visible list target does not move');check(scrollRequests===visibleCalls,'already visible target is not re-centered');question.style.display='none';window.scrollTo(0,0);await frames();receiveFlag({gen:1,gids:[question.id,target.id],reveal:true});await frames();check(scrollRequests===before+2,'skip hidden first occurrence and reveal visible later occurrence');target.style.display='none';await frames();const hiddenPos=position();receiveFlag({gen:1,gids:[target.id],reveal:true});await frames();equal(position(),hiddenPos,'all-hidden pinned target does not pan away');check(scrollRequests===before+2,'all-hidden target never invokes scrolling');check(fld.querySelector('.flag-target-note')?.textContent.includes('Unpin the current result'),'explain hidden target without silently changing pin');target.style.display='';question.style.display='';};window.checkWideReveal=async()=>{setZoom(3);window.scrollTo(0,0);await frames();const panel=fld.querySelector('.flag-drawer').getBoundingClientRect();check(target.getBoundingClientRect().width>panel.left,'actual target is wider than available strip');receiveFlag({gen:1,gids:[target.id],reveal:true});await frames();check(target.getBoundingClientRect().left>=10&&target.getBoundingClientRect().left<=24,'oversized target reveals its left edge without changing zoom');check(treeZoom===3,'explicit reveal preserves zoom');};window.screenshotSetup=()=>{receiveDrawer(drawer('view'));receiveFlag({gen:1,gids:[target.id],scroll:true});};window.ready=true;`;
const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body data-mode="medical-validation"><div id="root"></div><div id="flagDrawer"></div><script>'+js.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
fs.writeFileSync(path.join(out,'fixture.html'),html);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Emulation overrides belong to the debugger session; keep that session alive
// so every labelled viewport is an actual browser viewport, not a reset default.
const clients=new Map();
async function rpc(target,method,params={}){
 let client=clients.get(target.webSocketDebuggerUrl);
 if(!client){
  const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();
  client={ws,pending,id:0,ready:new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;})};
  ws.onmessage=e=>{const x=JSON.parse(e.data),request=pending.get(x.id);if(!request)return;pending.delete(x.id);clearTimeout(request.timer);x.error?request.reject(Error(JSON.stringify(x.error))):request.resolve(x.result);};
  ws.onclose=()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Debugger disconnected'));}pending.clear();};
  clients.set(target.webSocketDebuggerUrl,client);
 }
 await client.ready;return await new Promise((resolve,reject)=>{const id=++client.id,timer=setTimeout(()=>{client.pending.delete(id);reject(Error('CDP timeout '+method));},30000);client.pending.set(id,{resolve,reject,timer});client.ws.send(JSON.stringify({id,method,params}));});
}
(async()=>{
 const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(profile);const log=fs.openSync(path.join(profile,'browser.log'),'w');
 const browser=spawn(process.env.CRL_TEST_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-gpu','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+profile,'--disk-cache-dir='+path.join(profile,'cache'),'--no-first-run','about:blank'],{stdio:['ignore',log,log],windowsHide:true});let browserError;browser.on('error',e=>browserError=e);
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let target;
 try{
  const port=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(port);i++){if(browserError)throw browserError;if(browser.exitCode!==null)throw Error('Browser exited');await sleep(100);}
  const endpoint='http://127.0.0.1:'+fs.readFileSync(port,'utf8').split(/\r?\n/)[0];target=await(await fetch(endpoint+'/json/new?'+encodeURIComponent('http://127.0.0.1:'+server.address().port),{method:'PUT'})).json();
  await rpc(target,'Page.bringToFront');
  const evaluate=async expression=>{const x=await rpc(target,'Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(x.exceptionDetails)throw Error(JSON.stringify(x.exceptionDetails));return x.result.value;};
  let ready=false;for(let i=0;i<100&&!ready;i++){ready=await evaluate('window.ready===true');if(!ready)await sleep(50);}assert(ready);
  const cases=[];for(const width of [1200,800,420]){await rpc(target,'Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('window.innerWidth'),width,'actual emulated viewport');for(const pinned of [false,true])for(const zoom of [.25,1,3]){console.log('Checking',width,pinned,zoom);cases.push({width,...await evaluate('checkCase('+zoom+','+pinned+')')});}}
  await rpc(target,'Emulation.setDeviceMetricsOverride',{width:900,height:700,deviceScaleFactor:1,mobile:false});await evaluate('checkCase(1,true)');await evaluate('checkExplicitReveal()');await rpc(target,'Emulation.setDeviceMetricsOverride',{width:420,height:700,deviceScaleFactor:1,mobile:false});await evaluate('checkWideReveal()');await evaluate('screenshotSetup()');
  const shot=await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,'manual-pan-clear-of-drawer.png'),Buffer.from(shot.data,'base64'));
  const receipt={passed:true,checks:cases.at(-1).checks,explicitRevealChecks:12,cases,scope:'Production renderer, route-card/component/pin controllers, CSS and extracted zoom/pan/flag handlers in disposable Edge; pinned and unpinned trees; not installed VSCode or production deployment'};fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 }finally{if(target)await rpc(target,'Browser.close').catch(()=>{});for(const client of clients.values())client.ws.close();clients.clear();if(browser.pid&&browser.exitCode===null)browser.kill();fs.closeSync(log);server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
