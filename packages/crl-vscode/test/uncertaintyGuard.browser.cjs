// REFACTOR:grounded: actual parsed kit source, production webview/controller and source-built renderer in disposable Edge.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),esbuild=require('esbuild');
const work=path.resolve(__dirname,'../../..'),out=process.env.CRL_UNCERTAINTY_BROWSER_OUT;assert(out,'Set CRL_UNCERTAINTY_BROWSER_OUT');fs.mkdirSync(out,{recursive:true});
const alias={vscode:path.join(work,'packages/crl-vscode/test/oracle/vscode-stub.ts'),'@smile-digital-health/crl/session':path.join(work,'packages/crl/dist/results/session.js'),'@smile-digital-health/crl/provenance':path.join(work,'packages/crl/dist/provenance/index.js'),'@smile-digital-health/crl/language-services':path.join(work,'packages/crl/dist/language-services/index.js'),'@smile-digital-health/crl':path.join(work,'packages/crl/dist/index.js')};
esbuild.buildSync({entryPoints:[path.join(__dirname,'uncertaintyGuard.fixture.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'fixture.cjs'),alias,logLevel:'error'});
const api=require(path.join(out,'fixture.cjs')),fixture=api.fixture(path.join(out,'policy'));
const encoded=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const harness=`
window.harness={state:{gen:0,modelVersion:0,expanded:[],collapsed:[]},sent:[],last:null,snapshot:null,checks:0};
window.acquireVsCodeApi=()=>({postMessage(m){
 harness.sent.push(m);
 if(m.type==='toggleUncertaintyGuard'&&m.gen===harness.state.gen){
  const expanded=new Set(harness.state.expanded),collapsed=new Set(harness.state.collapsed);
  const control=[...document.querySelectorAll('[data-flow-uncertainty-toggle]')].find(n=>n.dataset.flowUncertaintyToggle===m.key);
  if(control.getAttribute('aria-expanded')==='true'){expanded.delete(m.key);collapsed.add(m.key);}
  else{collapsed.delete(m.key);expanded.add(m.key);}
  harness.pending=harness.load({expanded:[...expanded],collapsed:[...collapsed]},true,m.key);
 }
 if(m.type==='snapshotDom')harness.snapshot=m;
}});
window.addEventListener('error',e=>{harness.error=String(e.error||e.message)});
harness.load=async(update={},keep=false,focus)=>{if(!keep)harness.state={gen:harness.state.gen,modelVersion:harness.state.modelVersion+1,expanded:[],collapsed:[]};Object.assign(harness.state,update);harness.state.gen++;const q=new URLSearchParams({state:JSON.stringify({...harness.state,focus})});const r=await(await fetch('/render?'+q)).json();if(r.error)throw Error(r.error);harness.last=r;window.dispatchEvent(new MessageEvent('message',{data:r.render}));if(r.pinned){
 const nodes=[...document.querySelectorAll('[data-flow-key]')],byKey=new Map(nodes.map(node=>[node.dataset.flowKey,node]));
 const question=nodes.find(node=>node.dataset.flowQuestion&&r.pinned.routeKeys.includes(node.dataset.flowWhen));
 if(question&&harness.state.questionCard){
  const [library,concept]=JSON.parse(question.dataset.flowQuestion),criteria=[];
  for(let node=question;node;node=byKey.get(node.dataset.flowParent)){
   if(node.dataset.flowCriterion){const [lib,name]=JSON.parse(node.dataset.flowCriterion);criteria.unshift({lib,name});}
   if(node.dataset.flowKey===question.dataset.flowWhen)break;
  }
  r.pinned.cards=[{id:'layout-question',library,concept,ownerKey:question.dataset.flowWhen,criterionPaths:[criteria],text:'Synthetic layout question',value:'Layout test answer'}];
 }
 window.dispatchEvent(new MessageEvent('message',{data:r.pinned}));
}window.dispatchEvent(new MessageEvent('message',{data:r.marks}));await new Promise(r=>setTimeout(r,30));if(harness.error)throw Error(harness.error);return r;};
`;
const checks=`
const check=(ok,label)=>{harness.checks++;if(!ok)throw Error(label);};
const root=document.getElementById('root');
const row=key=>[...root.querySelectorAll('[data-flow-key]')].find(n=>n.dataset.flowKey===key);
const control=key=>[...root.querySelectorAll('[data-flow-uncertainty-toggle]')].find(n=>n.dataset.flowUncertaintyToggle===key);
const visible=node=>!!node&&node.getClientRects().length>0&&getComputedStyle(node).display!=='none';
const checkPlacement=async(key,label)=>{
 const button=control(key),terminal=button.closest('[data-flow-terminal]');
 check(!!terminal,label+' U belongs to a terminal');
 const body=terminal.querySelector(':scope > rect'),rect=button.querySelector('rect');
 const expanded=button.getAttribute('aria-expanded')==='true',border=getComputedStyle(rect);
 check(border.stroke===(expanded?'rgb(0, 127, 212)':'rgb(140, 140, 140)')&&(!expanded||parseFloat(border.strokeWidth)===2),label+' U border reflects show/hide state ('+border.stroke+', '+border.strokeWidth+')');
 const box=body.getBoundingClientRect(),hit=rect.getBoundingClientRect(),scale=box.width/Number(body.getAttribute('width'));
 check(Math.abs((hit.left+hit.width/2-box.left)/scale-22)<0.1,label+' U mirrors the right badge inset');
 check(Math.abs(hit.top+hit.height/2-box.top-box.height/2)<0.1,label+' U is vertically centered');
 check(hit.left>box.left&&hit.right<box.right&&hit.top>box.top&&hit.bottom<box.bottom,label+' U stays inside the terminal');
 const intersects=other=>hit.left<other.right&&hit.right>other.left&&hit.top<other.bottom&&hit.bottom>other.top;
 const others=[...terminal.querySelectorAll(':scope > text[data-flow-label],.flow-flag-badge>circle,.flow-allpass-badge>circle,.flow-pin>rect'),...root.querySelectorAll('.route-layout-toggle>rect,.route-verdict-badge>circle,.route-branch-nav>rect')];
 check(others.filter(visible).every(node=>!intersects(node.getBoundingClientRect())),label+' U clears text and other controls');
 button.scrollIntoView({block:'center',inline:'center'});await new Promise(resolve=>requestAnimationFrame(resolve));
 const target=rect.getBoundingClientRect(),top=document.elementFromPoint(target.left+target.width/2,target.top+target.height/2);
 check(top?.closest('[data-flow-uncertainty-toggle]')===button,label+' U is the actual hit target');
};
const toggle=async(key,keyboard=false)=>{const button=control(key);check(visible(button),'live U control visible');if(keyboard){button.focus({preventScroll:true});button.dispatchEvent(new KeyboardEvent('keydown',{key:keyboard===true?'Enter':keyboard,bubbles:true,cancelable:true}));}else button.dispatchEvent(new MouseEvent('click',{bubbles:true}));await harness.pending;};
const snapshot=()=>{harness.snapshot=null;window.dispatchEvent(new MessageEvent('message',{data:{type:'requestSnapshot',token:'proof'}}));check(!!harness.snapshot,'production snapshot handler replied');return harness.snapshot.html;};
window.runChecks=async()=>{
 await harness.load();const guardKeys=harness.last.candidateKeys;check(guardKeys.length===2,'two real guard occurrences');
 check(root.querySelectorAll('[data-flow-uncertainty-collapsed]').length===2,'default both guards collapsed');
 check(guardKeys.every(key=>!row(key)),'no full uncertainty guard by default');
 await checkPlacement(guardKeys[0],'ordinary collapsed');
 const collapsed=snapshot();check((collapsed.match(/data-flow-uncertainty-collapsed/g)||[]).length===2,'captured both omitted guards');
 const container=document.createElement('div');container.innerHTML=collapsed;check([...container.querySelectorAll('[data-flow-uncertainty-toggle]')].every(c=>!c.hasAttribute('tabindex')&&!c.hasAttribute('role')),'snapshot U controls inert');
 const position=()=>[document.scrollingElement.scrollLeft,document.scrollingElement.scrollTop];const before=position();
 await toggle(guardKeys[0],true);check(control(guardKeys[0]).getAttribute('aria-expanded')==='true','Enter reveals original guard');check(!!row(guardKeys[0]),'actual guard identity restored');check(control(guardKeys[1]).getAttribute('aria-expanded')==='false','other occurrence stays collapsed');check(JSON.stringify(position())===JSON.stringify(before),'U disclosure does not pan');
 const mixed=snapshot();await toggle(guardKeys[1]);check(root.querySelectorAll('[data-flow-uncertainty-collapsed]').length===0,'two independent guards expanded');const expanded=snapshot();
 await checkPlacement(guardKeys[0],'ordinary expanded');
 await toggle(guardKeys[0]);check(!row(guardKeys[0]),'collapse restores compact view');
 await harness.load({pin:'A qualifies B absent',selected:'A qualifies B absent'});const pinned=harness.last.pinKey,active=harness.last.candidateKeys.find(key=>harness.last.pinned.routeKeys.includes(key));check(!!active,'pin uses actual CRE route through guard');check(visible(row(pinned)),'actual Met endpoint visible while folded');
 await toggle(active,true);check(visible(row(active)),'expanded guard visible while pinned');check(harness.last.alternate.some(key=>visible(row(key))),'alternate Unmet and wrapper survive pin visibility filter');
 await harness.load({questionCard:true},true);await checkPlacement(active,'pinned pass expanded');check(!!root.querySelector('.route-card'),'attached question card rendered');
 check(root.querySelector('.route-leaf-nav-count').textContent==='2 of 6','pinned traversal navigation matches reported view');
 root.querySelector('.route-questions-toggle').click();check(!root.querySelector('.route-card'),'Questions hides the attached card');await checkPlacement(active,'pinned questions hidden');
 root.querySelector('.route-questions-toggle').click();check(!!root.querySelector('.route-card'),'Questions restores the attached card');
 window.dispatchEvent(new MessageEvent('message',{data:{type:'branchQuestionnaireState',open:true,gen:harness.state.gen}}));
 check(root.querySelector('.route-layout-toggle').getAttribute('aria-pressed')==='true','detached questionnaire state applied');await checkPlacement(active,'pinned detached questionnaire');
 window.dispatchEvent(new MessageEvent('message',{data:{type:'branchQuestionnaireState',open:false,gen:harness.state.gen}}));
 check(root.querySelector('.route-layout-toggle').getAttribute('aria-pressed')==='false','attached questionnaire state restored');await checkPlacement(active,'pinned questionnaire restored');check(!!root.querySelector('.route-card'),'closing detached questionnaire restores the attached card');await harness.load({questionCard:false},true);
 const alternate=harness.last.alternate.map(row).filter(Boolean);check(alternate.every(n=>!n.classList.contains('pinned-traversal-node')&&!n.classList.contains('flow-pinned')),'alternate is visible without becoming executed pin');
 const pinnedExport=snapshot();check(pinnedExport.includes('data-flow-key="'+active.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"'),'expanded pinned export retains guard');
 await toggle(active);check(visible(row(pinned))&&!row(active),'collapse retains original pin');
 await harness.load({selected:'A uncertain yes'},true);check(harness.last.forced.length===0,'pinned pass overrides later selected nonpass');check(visible(row(pinned)),'pin retained after selection disagreement');
 await harness.load({pin:'A uncertain yes',selected:'A qualifies B absent'});
 const failed=harness.last.forced.find(([key])=>harness.last.pinned.routeKeys.includes(key));
 check(!!failed,'actual pinned uncertainty nonpass initially discloses its check');
 const failedPin=harness.last.pinKey;
 check(visible(row(failedPin)),'actual Unmet remains visible');
 check(control(failed[0]).getAttribute('aria-disabled')==='false','known nonpass U is enabled');
 await checkPlacement(failed[0],'pinned nonpass expanded');
 await toggle(failed[0]);
 check(!row(failed[0])&&visible(row(failedPin)),'collapse retains actual Unmet terminal');
 check(control(failed[0]).getAttribute('aria-expanded')==='false','nonpass U now collapsed');
 check(harness.last.pinKey===failedPin&&row(failedPin).classList.contains('flow-pinned'),'nonpass pin identity retained');
 await checkPlacement(failed[0],'pinned nonpass collapsed');
 const failedExport=snapshot();
 await toggle(failed[0],true);
 check(!!row(failed[0])&&visible(row(failedPin)),'keyboard reopens nonpass guard');
 check(harness.last.alternate.map(row).filter(Boolean).every(n=>!n.classList.contains('pinned-traversal-node')),'reopened alternatives are not executed');
 await toggle(failed[0]);await toggle(failed[0]);
 check(control(failed[0]).getAttribute('aria-expanded')==='true','repeated nonpass toggles keep working');
 await toggle(failed[0],' ');check(!row(failed[0])&&visible(row(failedPin)),'Space collapses nonpass while retaining Unmet');
 await toggle(failed[0],' ');check(!!row(failed[0])&&visible(row(failedPin)),'Space reopens nonpass while retaining Unmet');
 await harness.load({longTerminal:true});check(control(guardKeys[0]).closest('[data-flow-terminal]').querySelector(':scope > text[data-flow-label]').dataset.flowLabel==='Extended coverage determination','long terminal label was rendered');await checkPlacement(guardKeys[0],'long terminal label');
 await harness.load({flag:guardKeys[0]});check(control(guardKeys[0]).getAttribute('aria-disabled')==='true'&&!!row(guardKeys[0]),'flagged omission stays full');
 await harness.load();check(!row(guardKeys[0]),'new model clears disclosure state');
 return {checks:harness.checks,collapsed,mixed,expanded,pinnedExport,failedExport};
};window.ready=true;`;
// Keep the fixture helpers in a separate scope from the production controller's lexical root/gen variables.
const html='<!doctype html><html><head><meta charset="utf-8"><style>html{--vscode-editor-font-family:Consolas,monospace;overflow-anchor:none}body{margin:0;background:#202020;color:#ddd;font-family:Segoe UI,sans-serif}#root{padding:12px;min-height:950px}'+api.FLOW_STYLE+'</style></head><body data-mode="medical-validation"><div id="fcChrome"></div><div id="root"></div><div id="flagDrawer"></div><script>'+harness+'</script><script>'+api.COCKPIT_WEBVIEW_SCRIPT+'</script><script>(function(){'+checks+'})()</script></body></html>';
fs.writeFileSync(path.join(out,'browser-fixture.html'),html);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),clients=new Map();
async function rpc(target,method,params={}){let client=clients.get(target.webSocketDebuggerUrl);if(!client){const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();client={ws,pending,id:0,ready:new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})};ws.onmessage=e=>{const value=JSON.parse(e.data),request=pending.get(value.id);if(!request)return;pending.delete(value.id);clearTimeout(request.timer);value.error?request.reject(Error(JSON.stringify(value.error))):request.resolve(value.result);};clients.set(target.webSocketDebuggerUrl,client);}await client.ready;return await new Promise((resolve,reject)=>{const id=++client.id,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),30000);client.pending.set(id,{resolve,reject,timer});client.ws.send(JSON.stringify({id,method,params}));});}
(async()=>{const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(profile);const log=fs.openSync(path.join(profile,'browser.log'),'w');const browser=spawn(process.env.CRL_TEST_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-gpu','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+profile,'--disk-cache-dir='+path.join(profile,'cache'),'--no-first-run','about:blank'],{stdio:['ignore',log,log],windowsHide:true});
const server=http.createServer((q,r)=>{if(q.url.startsWith('/render?')){r.setHeader('Content-Type','application/json');try{r.end(JSON.stringify(fixture.render(JSON.parse(new URL(q.url,'http://localhost').searchParams.get('state')))));}catch(e){r.end(JSON.stringify({error:String(e)}));}return;}r.setHeader('Content-Type','text/html');r.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let target;
try{const port=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(port);i++)await sleep(100);const endpoint='http://127.0.0.1:'+fs.readFileSync(port,'utf8').split(/\r?\n/)[0];target=await(await fetch(endpoint+'/json/new?'+encodeURIComponent('http://127.0.0.1:'+server.address().port),{method:'PUT'})).json();const evaluate=async expression=>{const result=await rpc(target,'Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};for(let i=0;i<100&&!await evaluate('window.ready===true');i++)await sleep(50);assert(await evaluate('window.ready===true'),'Browser fixture did not load');
const cases=[];for(const width of [1200,800,420]){await rpc(target,'Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('innerWidth'),width);const result=await evaluate('runChecks()');cases.push({width,checks:result.checks});for(const name of ['collapsed','mixed','expanded','pinnedExport','failedExport']){const screened=api.screenCapturedDom(result[name]);assert(screened.ok,JSON.stringify(screened));fs.writeFileSync(path.join(out,name+'-snapshot.html'),api.renderFlowSnapshotDocument({flowHtml:screened.html,styleCss:api.FLOW_STYLE,title:'Synthetic uncertainty guard — '+name}));}}
await rpc(target,'Emulation.setDeviceMetricsOverride',{width:1200,height:950,deviceScaleFactor:1,mobile:false});for(const [name,expanded]of [['collapsed',[]],['expanded',fixture.guardKeys]]){await evaluate('harness.load('+encoded({expanded})+')');fs.writeFileSync(path.join(out,name+'.png'),Buffer.from((await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));}
const fontFamily=await evaluate("getComputedStyle(document.querySelector('.flow-svg')).fontFamily");assert.match(fontFamily,/Consolas/);
const receipt={passed:true,cases,fontFamily,scope:'Real parsed kit CRL/18 CRE expectations, production full webview controller and renderer, synthetic host bridge, keyboard/pin/snapshot checks; not installed extension or native qualification'};fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}catch(e){if(target){const diagnostic=await rpc(target,'Runtime.evaluate',{expression:"JSON.stringify({state:harness.state,cards:harness.last?.pinned?.cards,questions:[...document.querySelectorAll('[data-flow-question]')].map(n=>({key:n.dataset.flowKey,owner:n.dataset.flowWhen,question:n.dataset.flowQuestion,hidden:getComputedStyle(n).display})),sent:harness.sent.slice(-12).map(({html,...m})=>m),controls:[...document.querySelectorAll('[data-flow-uncertainty-toggle]')].map(n=>({key:n.dataset.flowUncertaintyToggle,expanded:n.getAttribute('aria-expanded'),disabled:n.getAttribute('aria-disabled')})),error:harness.error})",returnByValue:true}).catch(()=>null);fs.writeFileSync(path.join(out,'failure-state.json'),JSON.stringify(diagnostic,null,2));}fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({passed:false,error:String(e)},null,2));throw e;}finally{if(target)await rpc(target,'Browser.close').catch(()=>{});for(const client of clients.values())client.ws.close();clients.clear();if(browser.exitCode===null)browser.kill();fs.closeSync(log);server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
