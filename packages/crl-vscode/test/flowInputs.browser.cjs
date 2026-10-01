// Exact tree + pinned-route controllers, with a small host bridge. No policy writes.
// Start a disposable browser with CDP, then set CRL_TEST_CDP_URL before running.
// Fixture bridge stubs concept resolution; flag placement and browser controllers are production code.
// Nonce-only style/script CSP matches the tree pane; connect-src self is added only for the test host bridge.
// The production badge handler is extracted below; this is not an extension-host integration test.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),esbuild=require('esbuild');
const out=path.resolve('tmp/tree-input-browser');fs.mkdirSync(out,{recursive:true});
esbuild.buildSync({entryPoints:['packages/crl-vscode/src/flowPaneHtml.ts'],bundle:true,platform:'node',format:'cjs',external:['@smile-digital-health/crl'],outfile:path.join(out,'renderer.cjs')});
const {renderFlowPane,toggleCriterionExpansion,FLOW_STYLE}=require(path.join(out,'renderer.cjs'));
esbuild.buildSync({entryPoints:['packages/crl-vscode/src/flagPlacement.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'flags.cjs')});
const {computeFlagPlacement}=require(path.join(out,'flags.cjs'));
const badgeHandler=fs.readFileSync('packages/crl-vscode/src/correspondenceCockpit.ts','utf8').match(/`(if\(fb\)\{[^\n]+)` \+/)[1];
const node=(nodeKey,kind,label,refKeys,children=[])=>({nodeKey,nodeId:nodeKey,lib:'L',decision:'D',kind,label,refKeys,children,location:{},...(kind==='action'?{actionKind:'recommend-activity'}:{})});
const concept=(nodeKey,name,extra={})=>({nodeKey,lib:'L',name,label:name,location:{},hasLocalCode:false,hasRepresentations:false,definitionRefs:[],...extra});
const tree=[{decision:'D',lib:'L',nodeKey:'d',location:{},children:[node('w','when','Aggregate',['h'],[node('end','action','Met',['act'])]),node('direct','when','Question',['q'])]}];
const opts={concepts:[concept('h','Aggregate',{definitionKind:'definition-is',definitionRefs:['nested','q']}),concept('nested','Nested',{definitionKind:'definition-is',definitionRefs:['q']}),concept('q','Question',{hasLocalCode:true})],answerOptionsByConcept:new Map([['q',[{code:'yes',display:'Yes'},{code:'no',display:'No'}]]]),guardOutlines:new Map([['w',{expr:{kind:'criterion',lib:'L',name:'Boundary',bodyHash:'hash',operand:{kind:'leaf',lib:'L',name:'Aggregate',nodeKey:'h',isSource:false,isInferred:true}}}]])};
opts.concepts.find(c=>c.nodeKey==='nested').definitionRefs.push('q2');
opts.concepts.push(concept('q2','Second question',{hasLocalCode:true}));
const criterionOutlines=new Map(opts.guardOutlines);
let expanded=new Set(['w']);
const flags=[{id:'dependency',anchor:{scope:'concept',library:'L',name:'Question'}},{id:'unrelated',anchor:{scope:'concept',library:'L',name:'Unrelated'}}];
const render=()=>{const r=renderFlowPane(tree,{...opts,expandedGuardWhens:expanded});const placed=computeFlagPlacement(flags,r,()=>[],()=>undefined,a=>({lib:a.library,name:a.name}));return {html:r.html,reveals:r.reveals,flagGids:[...placed.gids],flagsByGid:Object.fromEntries([...placed.byGid].map(([gid,fs])=>[gid,fs.map(f=>f.id)]))};};
const js=esbuild.buildSync({stdin:{contents:"export {alignFlowConnectorBorders} from './packages/crl-vscode/src/flowConnectorBorders'; export {paintFlagBadges} from './packages/crl-vscode/src/flagBadgesWebview'; export {installRouteCards,ROUTE_CARD_STYLE} from './packages/crl-vscode/src/routeCardsWebview'; export {installFlowDisclosureFocus} from './packages/crl-vscode/src/flowDisclosureFocus'; export {installFlowKeyboardActions} from './packages/crl-vscode/src/flowKeyboardActions'; export {installFlowComponentContainers} from './packages/crl-vscode/src/flowComponentContainers';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'UI'}).outputFiles[0].text;
const html=`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-test'; script-src 'nonce-test'; connect-src 'self'"><style nonce="test">body{background:#202020;color:#ddd;margin:0}${FLOW_STYLE}</style><div id="root"></div><script nonce="test">${js}
window.cspViolations=[];window.addEventListener('securitypolicyviolation',e=>{if(/style|script/.test(e.violatedDirective))cspViolations.push(e.violatedDirective)});
const root=document.getElementById('root'),focusUI=UI.installFlowDisclosureFocus(root),keyboard=UI.installFlowKeyboardActions(root);
const style=document.createElement('style');style.setAttribute('nonce','test');style.textContent=UI.ROUTE_CARD_STYLE;document.head.append(style);
const layoutFrames=UI.installFlowComponentContainers(root),frames=()=>{UI.alignFlowConnectorBorders(root);layoutFrames()},cards=UI.installRouteCards(root,{postMessage(){}},()=>1,frames);let current;
window.badgeMessages=[];const v={postMessage(m){badgeMessages.push(m)}},gen=1;
root.addEventListener('click',e=>{const fb=e.target.closest('[data-mv-flag-badge]');${badgeHandler}});
const payload={token:'pin',pinKey:'end',label:'Met',cards:[{id:'q',library:'L',concept:'Question',ownerKey:'direct',text:'Question?',value:'Yes',answerChoices:[{code:'yes',display:'Yes',selected:true},{code:'no',display:'No'}]},{id:'input-q',library:'L',concept:'Question',ownerKey:'w',criteria:[{lib:'L',name:'Boundary'}],text:'Input question?',value:'Yes'}]};
window.bounds=(layout=true)=>{if(layout)frames();const element=root.querySelector('[data-component-frame="w"]');if(!element)return null;const frame=element.getBoundingClientRect();return [...root.querySelectorAll('.flow-input-row > [data-flow-input-toggle],.flow-input-row > .flow-flag-badge,.route-question-badge')].filter(n=>!n.classList.contains('route-question-badge')||[...root.querySelectorAll('[data-flow-input]')].some(i=>i.dataset.flowKey===n.dataset.ownerKey)).every(n=>{const b=n.getBoundingClientRect();return b.left>=frame.left&&b.right<=frame.right&&b.top>=frame.top&&b.bottom<=frame.bottom;});};
window.swap=async (key,mode)=>{const r=await fetch('/render',{method:'POST',body:JSON.stringify({key,mode})}).then(r=>r.json());focusUI.beforeRender();root.innerHTML=r.html;current=r;root.querySelector('[data-flow-key="end"]').classList.add('flow-pinned');r.flagGids.forEach(gid=>document.getElementById(gid)?.classList.add('has-flag'));window.beforePinBounds=bounds();cards.rebind();cards.show(structuredClone(payload));frames();};
root.addEventListener('click',e=>{const c=e.target.closest('[data-toggle-crit]');if(!c)return;e.preventDefault();e.stopPropagation();const token=focusUI.capture(c);window.pending=swap(current.reveals[c.dataset.toggleCrit].criterionToggle).then(()=>focusUI.restore(token));});
window.pending=swap();</script>`;
async function rpc(target,method,params={}) {const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout')),30000);ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id===1){clearTimeout(timer);r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result);}};ws.send(JSON.stringify({id:1,method,params}));});}finally{ws.close();}}
(async()=>{
 const server=http.createServer(async(req,res)=>{if(req.url==='/render'){let body='';for await(const b of req)body+=b;const {key,mode}=JSON.parse(body||'{}');if(mode){opts.guardOutlines=mode==='criterion'?new Map(criterionOutlines):mode==='compound'?new Map([['w',{expr:{kind:'and',operands:[{kind:'leaf',lib:'L',name:'Aggregate',nodeKey:'h',isSource:false,isInferred:true},{kind:'leaf',lib:'L',name:'Question',nodeKey:'q',isSource:true,isInferred:false}]}}]]):new Map();expanded=new Set(mode==='criterion'?['w']:[]);}if(key)expanded=toggleCriterionExpansion(expanded,key,tree,opts);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(render()));}else{res.setHeader('Content-Type','text/html');res.end(html);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let target;
 try {
  const endpoint=process.env.CRL_TEST_CDP_URL||'http://127.0.0.1:9258';
  target=await(await fetch(endpoint+'/json/new?'+encodeURIComponent('http://127.0.0.1:'+server.address().port),{method:'PUT'})).json();
  const expression=`(async()=>{while(!window.pending)await new Promise(r=>setTimeout(r,10));await pending;
const result={},visible=n=>!!n&&getComputedStyle(n).display!=='none'&&n.getClientRects().length>0;
const input=()=>root.querySelector('[data-flow-input]'),toggle=()=>input().querySelector('[data-flow-input-toggle]');
result.defaultCollapsed=input().dataset.flowInput==='collapsed';result.inputCspSafe=getComputedStyle(input().querySelector(':scope > rect')).fill==='rgba(0, 0, 0, 0)'&&getComputedStyle(input().querySelector(':scope > rect')).pointerEvents==='none'&&!input().querySelector('[style]');result.pinnedVisible=visible(input());result.flagVisible=visible(input().querySelector('.flow-flag-badge'));result.beforePinBounds=beforePinBounds;result.pinnedBounds=bounds();
const hiddenBadge=()=>[...root.querySelectorAll('.route-question-badge[aria-label^="Hidden questions"]')].find(n=>n.getAttribute('aria-label').includes('Q2'));
result.collapsedQuestionBadge=visible(hiddenBadge())&&hiddenBadge().textContent.includes('Expand these inputs');
const separated=(a,b)=>{a=a.getBoundingClientRect();b=b.getBoundingClientRect();return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;};
result.questionAndFlagBadgesSeparate=separated(hiddenBadge(),input().querySelector('.flow-flag-badge'));
result.hiddenBadgeInsideFrame=bounds();
const flagMessage=(ke=false)=>({flaggableGids:current.flagGids,summaries:current.flagGids.map(gid=>({gid,open:1,resolved:0,authoringOpen:ke?1:0,authoringResolved:0}))});
UI.paintFlagBadges(document,{flaggableGids:current.flagGids,summaries:[]});cards.show(structuredClone(payload));frames();
const beforeLate=JSON.stringify(input().querySelector(':scope > rect').getBoundingClientRect().toJSON());
UI.paintFlagBadges(document,flagMessage());
result.lateFlagStableGeometry=beforeLate===JSON.stringify(input().querySelector(':scope > rect').getBoundingClientRect().toJSON())&&bounds(false);
result.lateFlagSeparated=separated(hiddenBadge(),input().querySelector('.flow-flag-badge'));
UI.paintFlagBadges(document,flagMessage(true));
result.keOnlyNoCreate=!input().querySelector('.flow-flag-create')&&!visible(input().querySelector('.flow-flag-control'))&&visible(input().querySelector('.flow-flag-authoring'));
result.keBadgeSeparated=separated(hiddenBadge(),input().querySelector('.flow-flag-authoring'));
UI.paintFlagBadges(document,flagMessage());

toggle().focus();toggle().dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true}));result.keyboardScopedFlag=badgeMessages.at(-1)?.gid===input().id&&badgeMessages.at(-1)?.type==='nodeFlagAction';
input().querySelector('[data-node-flag-gid]').dispatchEvent(new MouseEvent('click',{bubbles:true}));const message=badgeMessages.at(-1);result.scopedFlagRoute=message.type==='nodeFlagAction'&&!!current.reveals[message.key]&&current.flagsByGid[message.gid].join(',')==='dependency';
result.directSingle=root.querySelectorAll('[data-flow-key="direct"][data-flow-question]').length===1;
root.querySelector('.route-questions-toggle').click();result.offVisible=visible(input())&&visible(toggle());result.offFlagVisible=visible(input().querySelector('.flow-flag-badge'));
toggle().dispatchEvent(new MouseEvent('click',{bubbles:true}));await pending;
result.expanded=input().dataset.flowInput==='expanded'&&root.querySelectorAll('[data-flow-question]').length===2;
result.focusRestored=document.activeElement===toggle();result.nestedCollapsed=root.querySelectorAll('[data-flow-input="collapsed"]').length===1;
const choices=root.querySelector('[data-flow-outline][data-flow-question] [data-flow-choices-toggle]');choices.dispatchEvent(new MouseEvent('click',{bubbles:true}));await pending;
result.choicesExpanded=root.querySelectorAll('[data-flow-choice]').length===2;
toggle().focus();toggle().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await pending;
result.keyboardCollapse=input().dataset.flowInput==='collapsed'&&!root.querySelector('[data-flow-choice]');
toggle().focus();toggle().dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));await pending;
result.reopenedChoices=root.querySelectorAll('[data-flow-choice]').length===2;result.questionsStayedOff=root.querySelector('.route-questions-toggle').getAttribute('aria-pressed')==='false';
root.querySelector('.route-questions-toggle').click();result.onVisible=visible(input())&&visible(toggle());
toggle().dispatchEvent(new MouseEvent('click',{bubbles:true}));await pending;result.onCollapsedVisible=visible(input())&&input().dataset.flowInput==='collapsed';result.onFlagVisible=visible(input().querySelector('.flow-flag-badge'));
result.recollapsedQuestionBadge=visible(hiddenBadge());
cards.questionnaireState(true);result.detachedHiddenBadge=visible(hiddenBadge());cards.questionnaireState(false);
payload.cards[1].criteria=[];await swap(undefined,'plain');
result.plainCollapsedQuestionBadge=visible(hiddenBadge());result.plainHasNoFrame=bounds()===null;
toggle().dispatchEvent(new MouseEvent('click',{bubbles:true}));await pending;
result.expandedInputCard=[...root.querySelectorAll('foreignObject')].some(n=>n.textContent.includes('Input question?'));
toggle().dispatchEvent(new MouseEvent('click',{bubbles:true}));await pending;
result.plainRecollapsedBadge=visible(hiddenBadge())&&![...root.querySelectorAll('foreignObject')].some(n=>n.textContent.includes('Input question?'));
await swap(undefined,'compound');
result.visibleSameScopeNotHidden=!root.querySelector('.route-question-badge[aria-label^="Hidden questions"]')&&!!root.querySelector('.route-card[data-card-id="input-q"]');
payload.cards[1].criteria=[{lib:'L',name:'Boundary'}];await swap(undefined,'criterion');
result.fixtureModeReversible=visible(hiddenBadge())&&bounds()===true;
toggle().dispatchEvent(new MouseEvent('click',{bubbles:true}));await pending;
result.expandedInputCompact=Number(input().querySelector(':scope > rect').getAttribute('width'))===150;
const outgoing=()=>[...root.querySelectorAll('path.flow-def-edge')].filter(n=>n.dataset.flowFrom===input().dataset.flowKey);
result.expandedConnectors=outgoing().length===2&&outgoing().every(n=>!n.getAttribute('d').includes('NaN')&&n.getTotalLength()>0);
cards.reset();root.querySelector('.flow-pinned')?.classList.remove('flow-pinned');frames();
const inputBody=input().querySelector(':scope > rect'),box=inputBody.getBBox(),stroke=parseFloat(getComputedStyle(inputBody).strokeWidth)/2||0;
const toSvg=root.querySelector('.flow-svg').getCTM().inverse().multiply(inputBody.getCTM());
const expectedStart=new DOMPoint(box.x+8,box.y+box.height+stroke).matrixTransform(toSvg);
result.unpinnedExpandedConnectors=outgoing().length===2&&outgoing().every(edge=>{const d=edge.getAttribute('d'),match=d.match(/^M([^ ]+) ([^ ]+) V/);return !!match&&!d.includes('NaN')&&edge.getTotalLength()>0&&Math.abs(Number(match[1])-expectedStart.x)<0.001&&Math.abs(Number(match[2])-expectedStart.y)<0.001;});
result.cspNoViolations=cspViolations.length===0;
// Negative control: verify the harness actually rejects the former inline-style defect.
const probe=input().querySelector(':scope > rect');probe.setAttribute('style','fill:red');await new Promise(r=>setTimeout(r,20));
result.cspRejectsInlineStyle=cspViolations.some(v=>v.startsWith('style-src'))&&getComputedStyle(probe).fill==='rgba(0, 0, 0, 0)';probe.removeAttribute('style');
return result;})()`;
  const r=await rpc(target,'Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(r.result.value,null,2));
  console.log(r.result.value);for(const [k,v] of Object.entries(r.result.value))assert.equal(v,true,k);
  const shot=await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'unpinned-inputs.png'),Buffer.from(shot.data,'base64'));
  await rpc(target,'Runtime.evaluate',{expression:`root.querySelector('[data-flow-key="end"]').classList.add('flow-pinned');cards.show(structuredClone(payload));frames();`});
  const pinnedShot=await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'pinned-inputs.png'),Buffer.from(pinnedShot.data,'base64'));
 } finally {if(target)await fetch((process.env.CRL_TEST_CDP_URL||'http://127.0.0.1:9258')+'/json/close/'+target.id).catch(()=>{});server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
