// REFACTOR:grounded: production SVG renderer, disclosure controller and pinned layout in a disposable browser.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),esbuild=require('esbuild');
const work=path.resolve(__dirname,'../../..'),out=process.env.CRL_CONNECTOR_BROWSER_OUT;
assert(out,'Set CRL_CONNECTOR_BROWSER_OUT on scratch storage'); fs.mkdirSync(out,{recursive:true});
const alias={'@smile-digital-health/crl':path.join(work,'packages/crl/dist/index.js')};
esbuild.buildSync({stdin:{contents:`export {renderFlowPane,FLOW_STYLE,toggleCriterionExpansion} from './packages/crl-vscode/src/flowPaneHtml';export {installFlowConnectorAnswers} from './packages/crl-vscode/src/flowConnectorAnswers';export {installRouteCards,ROUTE_CARD_STYLE} from './packages/crl-vscode/src/routeCardsWebview';export {alignFlowConnectorBorders} from './packages/crl-vscode/src/flowConnectorBorders';export {screenCapturedDom,SnapshotCapture} from './packages/crl-vscode/src/snapshotCapture';export {renderFlowSnapshotDocument} from './packages/crl-vscode/src/flowSnapshotHtml';`,resolveDir:work,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'fixture.cjs'),alias,logLevel:'error'});
const {renderFlowPane,FLOW_STYLE,toggleCriterionExpansion,installFlowConnectorAnswers,installRouteCards,ROUTE_CARD_STYLE,alignFlowConnectorBorders,screenCapturedDom,SnapshotCapture,renderFlowSnapshotDocument}=require(path.join(out,'fixture.cjs'));
const core=require(path.join(work,'packages/crl/dist/index.js'));
const demo=path.join(out,'policy'); fs.mkdirSync(path.join(demo,'src/crl'),{recursive:true}); fs.mkdirSync(path.join(demo,'src/cel/mv'),{recursive:true});
const testSource=fs.readFileSync(path.join(work,'packages/crl/src/provenance/tests/conditionAnswers.test.ts'),'utf8');
const crl=testSource.match(/const source = `([\s\S]*?)`;\nfunction fixture/)[1].replace(/\\`/g,'`')+`
activity "certify.Met": - request CPGTaskRequest. - with \`Met\`.
activity "not-certify.Unmet": - request CPGTaskRequest. - with \`Unmet\`.
decision "Treatment routing":
first:
- when "First check" then recommend activity "certify.Met".
- otherwise then:
  first:
  - when "Second check" then recommend activity "certify.Met".
  - otherwise then recommend activity "not-certify.Unmet".
  end.
`;
fs.writeFileSync(path.join(demo,'package.json'),JSON.stringify({name:'connector-demo',version:'1.0.0',crl:{canonicalBase:'https://example.org/connector-demo',date:'2026-11-02'}}));
fs.writeFileSync(path.join(demo,'src/crl/main.crl'),crl);
let cel='library "Cases".\ncovers "Answers".\nfact "Patient": - name is "Synthetic". - birth date is "1970-01-01". - defined by "Patient".\n';
for(const code of ['a','b','c','d'])cel+=`fact "${code}": - value is "${code}". - date is "2026-01-01T00:00:00Z". - defined by "Answers"."Treatment".\ncase "${code}": - subject is "Patient". - fact is "${code}". - result is "Treatment routing" is "${code==='d'?'not-certify.Unmet':'certify.Met'}".\n`;
fs.writeFileSync(path.join(demo,'src/cel/mv/cases.cel'),cel);
const suite=core.resolveCelSuite(demo); assert(suite.ok,JSON.stringify(suite)); const model=core.buildSuiteExecutionModel(suite.suite); assert.equal(model.scenarios.passCount,4); assert.equal(model.scenarios.errorCount,0);
const options={concepts:model.conceptLayer,defExpr:(lib,name)=>model.defExpr.get(core.nodeKey(core.conceptDeclRef(lib,name))),guardOutlines:model.guardOutlines,answerOptionsByConcept:new Map(model.conceptLayer.map(c=>[c.nodeKey,c.answerOptions||[]]))};
let actual=renderFlowPane(model.crlStructure,options);const inputs=new Set(Object.values(actual.reveals).filter(h=>h.criterionToggle?.endsWith('\"inputs\"]')).map(h=>h.criterionToggle));actual=renderFlowPane(model.crlStructure,{...options,expandedGuardWhens:inputs});
const check=model.conceptLayer.find(c=>c.name==='First check'); assert.equal(check.conditionAnswers.status,'simple');
const node=(key,kind,children=[])=>({nodeKey:key,nodeId:key,lib:'Answers',decision:'Fan-out',kind,label:kind==='when'?'First check':'Met',refKeys:kind==='when'?[check.nodeKey]:[],location:{},children,...(kind==='action'?{actionKind:'recommend-activity'}:{})});
const fanout=[{nodeKey:'root',lib:'Answers',decision:'Fan-out',location:{},children:[node('condition','when',[node('t0','action'),node('t1','action')]),node('otherwise','otherwise',[node('t2','action')])]}];
const longCheck={...check,conditionAnswers:{...check.conditionAnswers,subjects:check.conditionAnswers.subjects.map(s=>({...s,matches:Array.from({length:24},(_,i)=>({...s.matches[0],code:'long'+i,display:'A long answer description that wraps onto several readable lines '+i}))}))}};
let nested={kind:'leaf',nodeKey:check.nodeKey,lib:'Answers',name:'First check',isSource:false};for(let i=0;i<8;i++)nested={kind:'criterion',name:'Group '+i,lib:'Answers',bodyHash:'g'+i,operand:nested};
const deepOptions={concepts:[longCheck],guardOutlines:new Map([['condition',{expr:nested}]])};
const opened=toggleCriterionExpansion(new Set(),'condition',fanout,deepOptions);
const wide=renderFlowPane(fanout,{...deepOptions,expandedGuardWhens:opened});

// Actual parsed criterion: two different predicates over one question, plus a second question.
const groupedSource=crl.slice(0,crl.indexOf('activity "certify.Met"'))+`
terminology "Locations": - system is \`urn:locations\`. - code is \`axillary\` display is \`Axillary\`. - code is \`craniofacial\` display is \`Craniofacial\`.
terminology "Selected locations": - system is \`urn:locations\`. - code is \`axillary\`.
concept "Location": - shape is Record. - type is Observation. - value type is CodeableConcept. - code is \`location\`. - value domain is answer options. - value from is "Locations". - shape reduction is most recent.
presentation for "Location": - question text is "Which location?".
concept "Location check": - shape is Record. - type is Observation. - value type is boolean. - definition is "Location" in "Selected locations". - shape reduction is most recent.
criterion "Treatment alternatives": - when ("First check" or "Second check").
criterion "Combined criterion": - when ("Treatment alternatives" and "Location check").
activity "certify.Met": - request CPGTaskRequest. - with \`Met\`.
activity "not-certify.Unmet": - request CPGTaskRequest. - with \`Unmet\`.
decision "Treatment routing": first: - when "Combined criterion" then recommend activity "certify.Met". - otherwise then recommend activity "not-certify.Unmet".
`;
const groupedDir=path.join(out,'group-policy');fs.mkdirSync(path.join(groupedDir,'src/crl'),{recursive:true});fs.mkdirSync(path.join(groupedDir,'src/cel/mv'),{recursive:true});fs.writeFileSync(path.join(groupedDir,'package.json'),JSON.stringify({name:'group-demo',version:'1.0.0',crl:{canonicalBase:'https://example.org/group-demo',date:'2026-11-02'}}));fs.writeFileSync(path.join(groupedDir,'src/crl/main.crl'),groupedSource);
const groupedCel=cel.replace('fact "Patient":','fact "Location": - value is "axillary". - date is "2026-01-01T00:00:00Z". - defined by "Answers"."Location".\nfact "Patient":').replaceAll('- subject is "Patient". - fact is','- subject is "Patient". - fact is "Location". - fact is');fs.writeFileSync(path.join(groupedDir,'src/cel/mv/cases.cel'),groupedCel);
const groupedSuite=core.resolveCelSuite(groupedDir);assert(groupedSuite.ok,JSON.stringify(groupedSuite));const groupedModel=core.buildSuiteExecutionModel(groupedSuite.suite);assert.equal(groupedModel.scenarios.passCount,4);assert.equal(groupedModel.scenarios.errorCount,0);
const groupedOptions={concepts:groupedModel.conceptLayer,defExpr:(lib,name)=>groupedModel.defExpr.get(core.nodeKey(core.conceptDeclRef(lib,name))),guardOutlines:groupedModel.guardOutlines};
const groupedOpened=toggleCriterionExpansion(new Set(),groupedModel.crlStructure[0].children[0].nodeKey,groupedModel.crlStructure,groupedOptions);
const grouped=renderFlowPane(groupedModel.crlStructure,{...groupedOptions,expandedGuardWhens:groupedOpened});
const pinSource=fs.readFileSync(path.join(work,'packages/crl-vscode/src/correspondenceCockpit.ts'),'utf8').match(/`(const applyFlowPin=[^`]+)` \+/)[1];
const css='body{margin:0;background:#202020;color:#ddd;font:13px sans-serif}h1{font-size:16px;padding:12px}.flow-wrap{overflow:visible}'+FLOW_STYLE+ROUTE_CARD_STYLE;
const js=`const root=document.getElementById('root');let current=${JSON.stringify(actual.html)};root.innerHTML=current;
const controller=(${installFlowConnectorAnswers.toString()})(root),align=()=>{(${alignFlowConnectorBorders.toString()})(root);controller.update();};
const pinVisibility={update(){}},pinnedTraversalPaint=()=>{},logicUi={pinnedRoute(){}},criterionDescriptionUi={refresh(){}};let pinnedFlowKey='',pinnedPathKeys=[],pinnedRouteKeys=[],pinnedRouteLabel='',currentRouteLabel='',pinnedGroupKeys=[],pinnedGroupOutcomes=[];${pinSource}
const routes=(${installRouteCards.toString()})(root,{postMessage(){}},()=>1,align);align();let checks=0;
const check=(v,m)=>{checks++;if(!v)throw Error(m)},pause=()=>new Promise(r=>setTimeout(r,20));
const rects=()=>[...root.querySelectorAll('.flow-connector-answers')].filter(g=>getComputedStyle(g).display!=='none').map(g=>g.querySelector('foreignObject').getBoundingClientRect());
const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
window.testLayout=async(pinned,zoom)=>{routes.reset();root.innerHTML=${JSON.stringify(wide.html)};controller.reset();
if(pinned)root.querySelector('[data-flow-key=condition]').dataset.flowQuestion=JSON.stringify(['Answers','Treatment']);if(pinned)routes.show({token:'test',showQuestions:true,cards:[{id:'q',ownerKey:'condition',occurrences:[{ownerKey:'condition',criterionPaths:[[{lib:'Answers',name:'Group 7'}]]}],library:'Answers',concept:'Treatment',text:'Which treatment?',description:'',value:'Treatment A',determination:'True',criteria:[],criterionPaths:[[]],answerChoices:[{system:'urn:choices',code:'a',display:'Treatment A',selected:true}],editable:false}],pathKeys:['root','condition','t0','t1','t2'],pathGroupKeys:[],pinKey:'t0'});align();if(pinned)check(root.querySelector('[data-flow-key=condition]').hasAttribute('transform'),'actual pinned layout applied');
const svg=root.querySelector('svg'),vb=svg.viewBox.baseVal;svg.style.width=vb.width*zoom+'px';svg.style.height=vb.height*zoom+'px';align();await pause();
const ds=[...root.querySelectorAll('details[data-connector-disclosure]')];check(ds.length===3,'three outgoing annotations');check(ds.every(d=>!d.open),'initially collapsed');
const before=[scrollX,scrollY],geometry=rects().map(r=>[r.x,r.y,r.width,r.height]);
ds[0].querySelector('summary').click();await pause();check(ds[0].open&&!ds[1].open&&!ds[2].open,'independent first disclosure');ds[1].querySelector('summary').click();ds[2].querySelector('summary').click();await pause();
check(ds.every(d=>d.open),'all expanded');check(JSON.stringify(before)===JSON.stringify([scrollX,scrollY]),'toggle never scrolls');check(JSON.stringify(geometry)===JSON.stringify(rects().map(r=>[r.x,r.y,r.width,r.height])),'toggle keeps geometry');
const panels=rects();check(panels.length===3,'visible panels');for(let i=0;i<panels.length;i++){for(let j=i+1;j<panels.length;j++)check(!overlap(panels[i],panels[j]),'answer panels do not overlap');for(const n of root.querySelectorAll('[data-flow-key] > rect'))check(!overlap(panels[i],n.getBoundingClientRect()),'answer does not cover a node');}
const first=ds[0].closest('.connector-answer-panel');check(first.scrollHeight>first.clientHeight,'long list scrolls instead of truncating');

if(pinned){for(const external of [false,true]){routes.questionnaireState(external);align();await pause();check(rects().length===3,'connector disclosures survive detached questionnaire state');}routes.questionnaireState(false);check(root.querySelector('.route-cards foreignObject'),'actual attached question card rendered');for(const panel of rects())for(const form of root.querySelectorAll('.route-cards foreignObject'))check(!overlap(panel,form.getBoundingClientRect()),'connector never covers an attached question '+JSON.stringify({panel:panel.toJSON(),form:form.getBoundingClientRect().toJSON()}));root.querySelector('.route-questions-toggle').click();align();await pause();check(!root.querySelector('.route-cards foreignObject'),'Questions off retains connectors');check(rects().length===3,'Questions off connector count');}
if(pinned){pinnedFlowKey='t0';pinnedRouteKeys=['root','condition','t0'];applyFlowPin();align();check(rects().length===1,'actual selected route hides other annotations');pinnedFlowKey='t2';pinnedRouteKeys=['root','condition','t2'];applyFlowPin();align();check(rects().length===1,'switching route restores only its annotation');pinnedFlowKey='';pinnedRouteKeys=[];applyFlowPin();routes.reset();align();check(rects().length===3,'unpin restores all annotations');}
controller.beforeRender();root.innerHTML=root.innerHTML;controller.restore();align();check([...root.querySelectorAll('details[data-connector-disclosure]')].every(d=>d.open),'open state restored by edge identity');
return {pinned,zoom,checks};};
window.grouped=()=>{routes.reset();root.innerHTML=${JSON.stringify(grouped.html)};controller.reset();align();const ds=[...root.querySelectorAll('details[data-connector-disclosure]')];ds[0].open=true;return {count:ds.length,content:ds[0].textContent};};window.actual=()=>{routes.reset();root.innerHTML=${JSON.stringify(actual.html)};controller.reset();align();const ds=[...root.querySelectorAll('details[data-connector-disclosure]')];ds[0].open=true;ds[1].open=true;};window.ready=true;`;
const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body><h1>Synthetic example — branch-specific answers</h1><div id="root"></div><script>'+js.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
fs.writeFileSync(path.join(out,'interactive-preview.html'),html);
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
const browser=spawn(process.env.CRL_TEST_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-gpu','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+profile,'--disk-cache-dir='+path.join(profile,'cache'),'--no-first-run','about:blank'],{stdio:['ignore',log,log],windowsHide:true});
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let target;
try{const port=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(port);i++)await sleep(100);const endpoint='http://127.0.0.1:'+fs.readFileSync(port,'utf8').split(/\r?\n/)[0];target=await(await fetch(endpoint+'/json/new?'+encodeURIComponent('http://127.0.0.1:'+server.address().port),{method:'PUT'})).json();await rpc(target,'Page.bringToFront');
const evaluate=async expression=>{const x=await rpc(target,'Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(x.exceptionDetails)throw Error(JSON.stringify(x.exceptionDetails));return x.result.value;};
for(let i=0;i<100&&!await evaluate('window.ready===true');i++)await sleep(50);assert(await evaluate('window.ready===true'));
const cases=[];for(const width of [1200,800,420]){await rpc(target,'Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('innerWidth'),width);for(const pinned of [false,true])for(const zoom of [.25,1,3]){console.log('Checking',width,pinned,zoom);cases.push({width,...await evaluate(`testLayout(${pinned},${zoom})`)});}}
await rpc(target,'Emulation.setDeviceMetricsOverride',{width:1500,height:850,deviceScaleFactor:1,mobile:false});await evaluate('actual()');await evaluate("(()=>{const d=document.querySelector('details[data-connector-disclosure]');d.open=false;d.querySelector('summary').focus();})()");await rpc(target,'Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await rpc(target,'Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});assert.equal(await evaluate("document.querySelector('details[data-connector-disclosure]').open"),true,'keyboard Space opens native summary');const captured=await evaluate('document.getElementById("root").innerHTML');const cap=new SnapshotCapture(),promise=cap.begin('capture');cap.resolve('capture',captured);const screened=screenCapturedDom(await promise);assert(screened.ok,JSON.stringify(screened));const snapshot=renderFlowSnapshotDocument({flowHtml:screened.html,styleCss:FLOW_STYLE,title:'Branch-specific answers — synthetic example'});fs.writeFileSync(path.join(out,'tree-preview.html'),snapshot);
const shot=await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,'branch-answers.png'),Buffer.from(shot.data,'base64'));const grouping=await evaluate('grouped()');assert.equal(grouping.count,2);for(const label of ['First check','Second check','Location check','Treatment alternatives','Combined criterion'])assert(grouping.content.includes(label),label);assert(grouping.content.includes('All of these conditions match'));assert(grouping.content.includes('At least one of these conditions matches'));const groupCapture=screenCapturedDom(await evaluate('document.getElementById("root").innerHTML'));assert(groupCapture.ok);fs.writeFileSync(path.join(out,'grouped-tree-preview.html'),renderFlowSnapshotDocument({flowHtml:groupCapture.html,styleCss:FLOW_STYLE,title:'Multiple checks in one criterion — synthetic example'}));fs.writeFileSync(path.join(out,'grouped-answers.png'),Buffer.from((await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));await rpc(target,'Page.navigate',{url:require('node:url').pathToFileURL(path.join(out,'grouped-tree-preview.html')).href});for(let i=0;i<100&&!await evaluate('!!document.querySelector("#flowroot details[data-connector-disclosure]")');i++)await sleep(50);assert.equal(await evaluate('document.querySelectorAll("#flowroot details[data-connector-disclosure]").length'),2);assert.equal(await evaluate('document.querySelector("#flowroot details[data-connector-disclosure]").open'),true,'export preserves open state');await evaluate('document.querySelector("#flowroot details[data-connector-disclosure] summary").click()');assert.equal(await evaluate('document.querySelector("#flowroot details[data-connector-disclosure]").open'),false,'exported native disclosure closes locally');fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({passed:true,cases,creCases:8,snapshotAccepted:true,snapshotInteractive:true,groupedChecks:3,scope:'Actual parsed synthetic CRL + production renderer/controllers in Edge; not deployed'},null,2));console.log('PASS',cases.at(-1));
}finally{if(target)await rpc(target,'Browser.close').catch(()=>{});for(const c of clients.values())c.ws.close();clients.clear();if(browser.exitCode===null)browser.kill();fs.closeSync(log);server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
