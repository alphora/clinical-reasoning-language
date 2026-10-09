// Source-built Bleph renderer/controllers in disposable Edge; not an installed extension host.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process'),esbuild=require('esbuild');
const work=path.resolve(__dirname,'../../..'),out=path.resolve(process.env.CRL_TREE_HIGHLIGHT_OUT||path.join(work,'tmp/tree-highlight-fix/browser'));
fs.mkdirSync(out,{recursive:true});
const alias={vscode:path.join(work,'packages/crl-vscode/test/oracle/vscode-stub.ts'),'@smile-digital-health/crl':path.join(work,'packages/crl/dist/index.js'),'@smile-digital-health/crl/provenance':path.join(work,'packages/crl/dist/provenance/index.js'),'@smile-digital-health/crl/language-services':path.join(work,'packages/crl/dist/language-services/index.js')};
esbuild.buildSync({entryPoints:[path.join(__dirname,'treeHighlight.fixture.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'fixture.cjs'),alias});
const fixture=require(path.join(out,'fixture.cjs')),source=fixture.COCKPIT_WEBVIEW_SCRIPT,data=fixture.fixture(path.join(work,'examples/bleph-medical-validation/src/cel/mv/medical-validation.cel'));
function handler(type){const marker=`if(m.type==='${type}'){`,at=source.indexOf(marker);assert(at>=0);const start=at+marker.length;let depth=1,end=start;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}assert.equal(depth,0);return source.slice(start,end-1);}
const pinApply=source.slice(source.indexOf('const applyFlowPin='),source.indexOf('let pendingPinFocus='));
const pinFocus=source.slice(source.indexOf('let pendingPinFocus='),source.indexOf("window.addEventListener('message'"));
const renderForPin=handler('render').slice(handler('render').indexOf('if(!pendingPinFocus'),handler('render').indexOf("for(const ta of root.querySelectorAll('textarea[data-note-draft]')){const k=ta.getAttribute",handler('render').indexOf('root.innerHTML=m.html')));
const clearLeaves=source.slice(source.indexOf('const clrLeaf='),source.indexOf('let pinnedFlowKey='));
const script=esbuild.buildSync({stdin:{contents:`
 import {installUnpinnedTreeFocus,paintPinnedTraversal,UNPINNED_TREE_FOCUS_STYLE,sanitizeUnpinnedTreeFocusSnapshot} from ${JSON.stringify(path.join(work,'packages/crl-vscode/src/unpinnedTreeFocusWebview.ts'))};
 import {installFlowKeyboardActions} from ${JSON.stringify(path.join(work,'packages/crl-vscode/src/flowKeyboardActions.ts'))};
 import {installRouteCards,ROUTE_CARD_STYLE} from ${JSON.stringify(path.join(work,'packages/crl-vscode/src/routeCardsWebview.ts'))};
 import {traversalRouteNeighbors} from ${JSON.stringify(path.join(work,'packages/crl-vscode/src/branchNavigation.ts'))};
 import {installFlowPinVisibility} from ${JSON.stringify(path.join(work,'packages/crl-vscode/src/flowPinVisibility.ts'))};
 import {installFlowLogicHighlight} from ${JSON.stringify(path.join(work,'packages/crl-vscode/src/flowLogicHighlight.ts'))};
 const data=${JSON.stringify(data)},root=document.getElementById('root'),style=document.createElement('style');style.textContent=data.style+UNPINNED_TREE_FOCUS_STYLE;document.head.append(style);root.innerHTML=data.html;
 const rows=()=>[...root.querySelectorAll('[data-flow-key]')],row=key=>rows().find(n=>n.dataset.flowKey===key),click=n=>n.dispatchEvent(new MouseEvent('click',{bubbles:true}));
 let key='',index=0,pinned=false;window.checks=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label)};
 const logicUi=installFlowLogicHighlight(root);
 const groupGlows=g=>[...root.querySelectorAll('path.flow-def-edge[data-flow-from]')].filter(e=>e.dataset.flowFrom===g.dataset.flowLogic).some(e=>e.previousElementSibling?.classList.contains('flow-group-halo'));
 const checkGroupColors=outcomes=>{
   for(const o of outcomes||[]){
     const edges=[...root.querySelectorAll('path.flow-def-edge[data-flow-from]')].filter(e=>e.dataset.flowFrom===o.key&&getComputedStyle(e).display!=='none'&&e.getClientRects().length);
     for(const edge of edges){
       const halo=edge.previousElementSibling,probe=document.createElementNS('http://www.w3.org/2000/svg','path');probe.setAttribute('class','flow-edge flow-condition-'+o.result);edge.parentNode.append(probe);
       check(halo?.classList.contains('flow-group-halo')&&getComputedStyle(halo).filter===getComputedStyle(probe).filter&&getComputedStyle(halo).stroke===getComputedStyle(probe).stroke,'group connector exactly matches native '+o.result+' branch glow');probe.remove();
     }
   }
 };
 const ui=installUnpinnedTreeFocus(root,{postMessage:m=>{
   if(m.type==='treeFocus'){key=m.key;index=0}else if(m.type==='cycleTreeFocus')index+=m.dir==='next'?1:-1;
   const options=data.choices[key],paint=options?.length?options[index]:data.prefixes[key];
   ui.show({...paint,gen:1,token:key,navigation:options?.length?{current:index+1,total:options.length}:undefined});
 }},()=>1,()=>pinned,(keys,outcomes)=>logicUi.treeRoute(keys,outcomes));installFlowKeyboardActions(root);
 const checkPaint=()=>{
   const options=data.choices[key],paint=options?.length?options[index]:data.prefixes[key];
   check(rows().filter(n=>n.classList.contains('tree-focus-selected')).length===1&&row(key).classList.contains('tree-focus-selected'),'one clicked occurrence has focus');
   check(getComputedStyle(row(key).querySelector(':scope > rect')).filter.includes('drop-shadow'),'clicked occurrence fuzzy neutral halo');
   check(rows().every(n=>n===row(key)||!n.querySelector(':scope > rect')||getComputedStyle(n.querySelector(':scope > rect')).filter==='none'),'all other node bodies have no halo');
   check(rows().every(n=>n.classList.contains('tree-focus-node')===paint.nodeKeys.includes(n.dataset.flowKey)),'blue path membership exactly matches current paint');
   check(getComputedStyle(row(key).querySelector(':scope > .flow-ring')).display!=='none','clicked occurrence also has blue ring');
   if(row(key).matches('.flow-input-row'))check(getComputedStyle(row(key).querySelector(':scope > .flow-ring > rect')).filter.includes('drop-shadow'),'selected transparent INPUT has visible ring halo');
   check(rows().filter(n=>n.classList.contains('tree-focus-node')&&n.matches('.flow-crit-row')).every(n=>getComputedStyle(n.querySelector(':scope > .flow-ring')).display!=='none'),'nested criterion path rings visible');
   check(rows().filter(n=>n.classList.contains('tree-focus-node')&&n.matches('.flow-input-row')).every(n=>getComputedStyle(n.querySelector(':scope > .flow-ring')).display!=='none'),'input path rings visible');
   check(rows().filter(n=>data.nodes[n.dataset.flowKey]?.logic).every(n=>!n.classList.contains('tree-focus-node')&&getComputedStyle(n.querySelector(':scope > text')).fill!=='rgb(55, 148, 255)'),'logic labels retain normal color, never blue path');
   check(rows().filter(n=>n.dataset.flowDecoration==='choices').every(n=>!n.classList.contains('tree-focus-node')),'answers excluded from blue path');
   check([...root.querySelectorAll('[data-flow-logic]')].every(n=>groupGlows(n)===(paint.groupKeys||[]).includes(n.dataset.flowLogic)),'only known on-route Boolean groups get automatic glow');checkGroupColors(paint.groupOutcomes);
   for(const edge of root.querySelectorAll('.flow-edge[data-flow-condition]')){
     const mark=paint.conditions.find(c=>c.key===edge.dataset.flowCondition),on=paint.nodeKeys.includes(edge.dataset.flowFrom)&&paint.nodeKeys.includes(edge.dataset.flowTo);
     const selected=on&&edge.dataset.flowOutcome===(mark?.result==='true'?'Yes':mark?.result==='false'?'No':undefined);
     const filter=getComputedStyle(edge).filter;
     check(selected?filter.includes(mark.result==='true'?'0, 230, 118':'241, 76, 76'):filter==='none','selected Yes/left green and No/right red use existing colors; other branches neutral');
   }
   if(data.nodes[key].criterion){
     const subtree=new Set([key]);let changed=true;while(changed){changed=false;for(const [k,n]of Object.entries(data.nodes))if(n.outline&&n.owner===data.nodes[key].owner&&!n.choice&&subtree.has(n.parent)&&!subtree.has(k)){subtree.add(k);changed=true}}
     check([...subtree].filter(k=>!data.nodes[k].logic).every(k=>row(k).classList.contains('tree-focus-node')),'clicked criterion nodes included without logic labels, answers or downstream branches');
   }
 };
 window.runChecks=()=>{
   const manual=document.createElement('div');manual.innerHTML=data.manualHtml;document.body.append(manual);
   check(manual.querySelectorAll('[data-flow-component="expanded"]').length>0,'manual Criterion expansion coverage');
   check(!manual.querySelector('[data-flow-decoration="choices"]'),'manual Criterion expansion leaves answer choices folded');
   check(!manual.querySelector('[data-flow-input="expanded"]'),'manual Criterion expansion leaves INPUT independent');manual.remove();
   check(root.querySelectorAll('.flow-crit-row').length>0,'nested criterion fixture coverage');
   check(rows().some(n=>n.dataset.flowDecoration==='choices'),'answer row fixture coverage');
   for(const terminal of Object.keys(data.choices)){
     click(row(terminal));const options=data.choices[terminal];
     for(let i=0;i<options.length;i++){if(i)click(root.querySelector('[data-tree-traversal-nav="next"]'));checkPaint();check(options.length>1?root.querySelector('.tree-traversal-nav text').textContent===(i+1)+' of '+options.length:!root.querySelector('.tree-traversal-nav'),'terminal navigator only visible for multiple routes');if(i)check(JSON.stringify([...options[i].nodeKeys].sort())!==JSON.stringify([...options[i-1].nodeKeys].sort()),'Bleph traversal arrows change highlighted body path')}
   }
   for(const k of Object.keys(data.prefixes).filter(k=>row(k)?.querySelector(':scope > rect')&&row(k)?.querySelector(':scope > .flow-ring'))){click(row(k));checkPaint();check(!root.querySelector('.tree-traversal-nav'),'nonterminal has no traversal selector')}
   for(const theme of ['', 'vscode-light','vscode-high-contrast-light']){
     document.body.className=theme;rows().forEach(n=>n.classList.add('node-focus','flag-current'));
     const terminal=Object.keys(data.choices)[0];click(row(terminal));checkPaint();
     check(!getComputedStyle(row(terminal).querySelector(':scope > rect')).filter.includes('204, 167, 0'),'selected halo neutral despite stale flag target');
     rows().forEach(n=>n.classList.remove('node-focus','flag-current'));
   }
   document.body.className='';
   const clone=root.cloneNode(true);sanitizeUnpinnedTreeFocusSnapshot(clone);check(!clone.querySelector('.tree-focus-selected,.tree-focus-node,.tree-traversal-nav'),'snapshot clears transient path/focus');
   check(!clone.querySelector('.flow-edge.flow-condition-true,.flow-edge.flow-condition-false'),'snapshot clears transient branch color');
   ui.reset();check(!root.querySelector('.tree-focus-selected,.tree-focus-node'),'reset clears transient path/focus');
   check(!root.querySelector('.flow-edge.flow-condition-true,.flow-edge.flow-condition-false'),'reset clears transient branch color');
   pinned=true;const terminal=Object.keys(data.choices)[0];ui.show({...data.choices[terminal][0],gen:1,token:'ignored'});check(!root.querySelector('.tree-focus-selected'),'unpinned paint ignored while pinned');
   return {checks:checks.length,terminals:Object.keys(data.choices).length,traversals:Object.values(data.choices).reduce((n,a)=>n+a.length,0)};
 };
 window.runReviewChecks=()=>{
   ui.reset();root.innerHTML=data.reviewFixture.html;
   const clrRO=()=>{for(const el of root.querySelectorAll('.review-pass,.review-fail,.review-pending,.error-node,.leaf-allpass'))el.classList.remove('review-pass','review-fail','review-pending','error-node','leaf-allpass')};
   const overlay=m=>{${handler('markReviewOverlay')}};
   const criteria=m=>{${handler('criterionVerdicts')}};
   let count=0;
   for(const step of data.reviewFixture.steps){
     const m={...step,type:'markReviewOverlay',gen,fail:[],pending:[],error:[],allPassLeaves:[],derivedGids:step.label==='all approved paths'?step.byState.pass:[]};
     overlay(m);criteria(m);
     const actual=[...root.querySelectorAll('.review-pass')].map(n=>n.id).sort();
     check(JSON.stringify(actual)===JSON.stringify([...new Set(step.pass)].sort()),step.label+' exact body paint');
     for(const [gid,state] of Object.entries(step.states)){
       const el=document.getElementById(gid);check(el.classList.contains('crit-'+state)===(state!=='unreviewed'),step.label+' occurrence check matches projection');
     }
     if(step.label==='all approved paths'){
       check(actual.length>10,'real Bleph body coverage');
       check(data.reviewFixture.inputs.some(k=>row(k)?.classList.contains('review-pass')),'real Bleph INPUT green');
       check(!root.querySelector('[data-flow-choice].review-pass'),'answer options remain unpainted');
       check(root.querySelector('[data-criterion-verdict]')?.getAttribute('aria-label').includes('encoding verdict not recorded'),'derived approval accessible provenance');
     }
     if(step.label==='explicit criterion Pass without cases')check(actual.length>10,'explicit criterion Pass paints full Bleph contents');
     if(step.label==='all To do'||step.label==='definitions checking'||step.label==='passing verdict on errored case')check(actual.length===0,'clear/demotion/freshness/error removes all body green');
     overlay({...m,gen:gen-1,pass:['bogus']});check(JSON.stringify([...root.querySelectorAll('.review-pass')].map(n=>n.id).sort())===JSON.stringify(actual),'stale generation cannot change approval');
     count++;
   }
   const last=data.reviewFixture.steps[0];overlay({...last,gen,fail:[],pending:[],error:[],allPassLeaves:[]});criteria({...last,gen,derivedGids:last.byState.pass});
   return {reviewSteps:count,reviewInputs:data.reviewFixture.inputs.length,reviewCriteria:last.allGids.length};
 };
 window.showTraversal=(terminal,i=0)=>{pinned=false;key=terminal;index=i;const options=data.choices[key];ui.show({...options[i],gen:1,token:key,navigation:{current:i+1,total:options.length}})};
 window.showInput=()=>{pinned=false;click(root.querySelector('.flow-input-row'))};
 let routeCards,pin,gen=1,pinEpoch=1,pinnedFlowKey='',pinnedRouteKeys=[],pinnedPathKeys=[],pinnedGroupKeys=[],pinnedGroupOutcomes=[],pinnedRouteLabel='',currentRouteKeys=[],currentRouteLabel='',currentRouteCase='',currentRouteId='',treeFocusUi=ui;
 const pinnedTraversalPaint=paintPinnedTraversal;
 const pinVisibility=installFlowPinVisibility(root),criterionDescriptionUi={refresh(){},beforeRender(){},restore(){},reset(){}},disclosureUi={beforeRender(){},restore(){},cancel(){}},fcc=document.createElement('div'),applyZoom=()=>{};
 const v={postMessage:m=>{window.lastPinRequest=m}},routeCardUi={show:m=>routeCards.show(m),rebind:()=>routeCards?.rebind(),reset:()=>routeCards?.reset()};
 ${clearLeaves}
 ${pinApply}
 ${pinFocus}
 root.addEventListener('click',e=>{const pin=e.target.closest?.('[data-flow-pin]');if(pin){e.preventDefault();e.stopPropagation();toggleFlowPin(pin.dataset.flowPin);}});
 const receiveCards=m=>{${handler('routeCards')}};
 const receiveMarks=m=>{${handler('markLeaves')}};
 const renderPinned=m=>{${renderForPin}};
 const showPinned=(current,focusRequest)=>{
   pin=data.pinnedRows.find(r=>r.caseId===current.caseId&&r.routeId===current.routeId&&r.traversalKey===current.traversalKey);ui.reset();pinned=true;
   renderPinned({gen:gen+1,indexVersion:1,mode:'medical-validation',preserveViewport:true,pinFocusRequest:focusRequest,html:pin.html});
   const nav=traversalRouteNeighbors(data.pinnedRows,pin,data.terminalOrder);
   receiveCards({gen,token:'pin',pinKey:pin.leafKey,label:pin.caseId,cards:pin.cards,showQuestions:true,routeKeys:pin.routeKeys,pathNodeKeys:pin.pathNodeKeys,pathGroupKeys:pin.pathGroupKeys,pathGroupOutcomes:pin.pathGroupOutcomes,focusRequest,navigation:{current:nav.index+1,total:nav.total,previous:!!nav.previous,next:!!nav.next}});
   receiveMarks({gen,routeKeys:pin.routeKeys,routeLabel:pin.caseId,pinnedMarks:{...pin.marks,pathNodeKeys:pin.pathNodeKeys,pathGroupKeys:pin.pathGroupKeys,pathGroupOutcomes:pin.pathGroupOutcomes}});
 };
 window.runPinnedChecks=()=>{
   const pinnedStyle=document.createElement('style');pinnedStyle.textContent=ROUTE_CARD_STYLE;document.head.append(pinnedStyle);
   routeCards=installRouteCards(root,{postMessage:m=>{if(m.type==='navigatePinnedBranch'){const nav=traversalRouteNeighbors(data.pinnedRows,pin,data.terminalOrder);const next=m.dir==='next'?nav.next:nav.previous;if(next)showPinned(next,'branch-navigation')}}},()=>gen);
   const first=data.pinnedRows.find(r=>r.leafKey===data.terminalOrder[0]);showPinned(first);const visited=[];
   for(let i=0;i<6;i++){
     check(root.querySelector('.route-leaf-nav-count').textContent===(i+1)+' of 6','pinned count uses tree traversal total');
     check(!root.querySelector('[data-flow-decoration="choices"]'),'pinned auto INPUT reveal does not open answer choices');
     check(root.querySelectorAll('.route-card').length===pin.cards.length,'all real pinned questions attached without manual INPUT expansion');
     check(rows().filter(n=>!n.classList.contains('flow-focus-hidden')&&!n.dataset.flowOutline).every(n=>pin.routeKeys.includes(n.dataset.flowKey)),'actual pin handler shows only current structural route');
     check(rows().every(n=>n.classList.contains('pinned-traversal-node')===pin.pathNodeKeys.includes(n.dataset.flowKey)),'pinned selected blue keys match tree paint');
     check(rows().filter(n=>n.querySelector(':scope > .flow-ring')).every(n=>(getComputedStyle(n.querySelector(':scope > .flow-ring')).display!=='none')===pin.pathNodeKeys.includes(n.dataset.flowKey)),'actual pinned blue rings match only the selected display route');
     check(rows().filter(n=>pin.nodes[n.dataset.flowKey]?.logic).every(n=>!n.classList.contains('pinned-traversal-node')),'pinned logic labels stay neutral');
     check([...root.querySelectorAll('[data-flow-logic]')].every(n=>groupGlows(n)===pin.pathGroupKeys.includes(n.dataset.flowLogic)),'pinned groups use current owner outcome glow');checkGroupColors(pin.pathGroupOutcomes);
     const beforeStale=[...root.querySelectorAll('.flow-group-halo')].map(h=>h.getAttribute('class')).join('|');
     receiveMarks({gen:gen-1,pinnedMarks:{pathGroupKeys:[],pathGroupOutcomes:[]}});
     check([...root.querySelectorAll('.flow-group-halo')].map(h=>h.getAttribute('class')).join('|')===beforeStale,'stale markLeaves cannot clear or recolor current pinned groups');
     for(const c of pin.conditions)check(rows().filter(n=>pin.nodes[n.dataset.flowKey]?.outline&&!pin.nodes[n.dataset.flowKey]?.logic&&!pin.nodes[n.dataset.flowKey]?.choice&&pin.nodes[n.dataset.flowKey]?.owner===c.key).every(n=>n.classList.contains('pinned-traversal-node')),'pinned criterion route nodes blue regardless of truth');
     visited.push(pin.traversalKey);if(i<5)click(root.querySelector('.route-branch-nav[aria-label="Next traversal"]'));
   }
   check(new Set(visited).size===6,'pinned arrows visit all six grouped Bleph traversals');
   check(root.querySelector('.route-branch-nav[aria-label="Next traversal"]').getAttribute('aria-disabled')==='true','last pinned traversal next disabled');
   for(let i=4;i>=0;i--){click(root.querySelector('.route-branch-nav[aria-label="Previous traversal"]'));check(root.querySelector('.route-leaf-nav-count').textContent===(i+1)+' of 6','pinned previous traverses every display route')}
   check(root.querySelector('.route-branch-nav[aria-label="Previous traversal"]').getAttribute('aria-disabled')==='true','first pinned traversal previous disabled');
   const duplicate=data.pinnedRows.find(r=>r.caseId!==first.caseId&&r.traversalKey===first.traversalKey);check(!!duplicate,'duplicate case fixture coverage');showPinned(duplicate);
   check(pin.caseId===duplicate.caseId&&root.querySelector('.route-leaf-nav-count').textContent==='1 of 6','duplicate case preserves pin data and maps to existing stop');
   return {checks:checks.length,pinnedTraversals:new Set(visited).size};
 };
 window.runPinFocusChecks=async()=>{
   const first=data.pinnedRows.find(r=>r.leafKey===data.terminalOrder[0]),pause=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   for(const kind of ['pin','right-click','Enter',' ']){
     routeCards.reset();pinnedFlowKey='';pinned=false;root.innerHTML=data.collapsedHtml;
     const control=row(first.leafKey).querySelector('[data-flow-pin]');control.focus();
     if(kind==='pin')click(control);else if(kind==='Enter'||kind===' ')control.dispatchEvent(new KeyboardEvent('keydown',{key:kind,bubbles:true}));
     else{pendingPinFocus=String(++pinFocusVersion);v.postMessage({type:'selectAndPinRoute',gen,key:first.leafKey,token:pendingPinFocus});}
     const request=lastPinRequest.token;showPinned(first,request);await pause();
     check(document.activeElement===row(first.leafKey),'initial '+kind+' request survives INPUT expansion render and focuses pin leaf');
     if(kind==='Enter'||kind===' '){const current=row(first.leafKey).querySelector('[data-flow-pin]');current.focus();current.dispatchEvent(new KeyboardEvent('keydown',{key:kind,bubbles:true}));await pause();check(!pinnedFlowKey&&document.activeElement===row(first.leafKey),'keyboard unpin preserves initiating focus callback');}
   }
   routeCards.reset();pinnedFlowKey='';pinned=false;root.innerHTML=data.collapsedHtml;toggleFlowPin(first.leafKey);const request=lastPinRequest.token;
   const outside=document.createElement('button');document.body.append(outside);outside.focus();showPinned(first,request);await pause();
   check(document.activeElement===outside,'new user focus cancels pin focus across INPUT render');outside.remove();
   return {pinFocusChecks:checks.length};
 };
 window.auditPinned=()=>{
   const expectedPairs=[
     ['upper-complaint-unmet','Qualifying Patient Complaint Reported','upper-necessity-unmet','Individual Procedure Necessity Documented'],
     ['upper-skin-unmet','Qualifying Skin Finding Documented','upper-photos-unmet','Upper Blepharoplasty Photographs Documented'],
     ['ptosis-mrd-unmet','Ptosis Margin Requirement Met','ptosis-photos-unmet','Ptosis Photographs Documented']];
   const capture=id=>{
     const current=data.pinnedRows.find(r=>r.caseId===id);check(!!current,'authored independent case '+id+' exists');showPinned(current);
     return {caseId:id,terminal:pin.leafKey,traversalKey:pin.traversalKey,actualFalse:pin.operands.filter(o=>o.result==='false').map(o=>o.concept[1]),
       visibleKeys:rows().filter(n=>getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden'&&n.getClientRects().length).map(n=>n.dataset.flowKey).sort(),
       markedKeys:rows().filter(n=>n.classList.contains('pinned-traversal-node')).map(n=>n.dataset.flowKey).sort(),questions:pin.cards.map(c=>({concept:c.concept,answer:c.value,determination:c.determination}))};
   };
   const pairs=expectedPairs.map(([a,failedA,b,failedB])=>{
     const left=capture(a),right=capture(b);check(left.actualFalse.includes(failedA)&&right.actualFalse.includes(failedB),'full execution traces retain authored alternative failures');
     check(left.terminal===right.terminal,'alternative failures reach same structural terminal');
     const visibleGraphsIdentical=JSON.stringify(left.visibleKeys)===JSON.stringify(right.visibleKeys),operandMarksIdentical=JSON.stringify(left.markedKeys)===JSON.stringify(right.markedKeys);
     capture(a);const backward= capture(b);check(JSON.stringify(backward.markedKeys)===JSON.stringify(right.markedKeys),'rerender does not leave stale pinned marks');
     check(left.traversalKey===right.traversalKey&&operandMarksIdentical,'alternative failed ALL answers intentionally share one highlight route');
     check(JSON.stringify(left.questions)!==JSON.stringify(right.questions),'grouped highlight routes retain different actual question answers');
     return {left,right,visibleGraphsIdentical,operandMarksIdentical,intentionallyGrouped:true};
   });
   return {authoredCases:data.pinnedRows.length,terminals:data.terminalOrder.length,traversals:6,pairs,scope:'Current authored Bleph execution traces and actual source-built pin/cards/marks handlers, not all feasible policy executions or installed/native acceptance.'};
 };
 window.showAuto=()=>{
   const terminal=Object.keys(data.auto)[1],snap=data.auto[terminal][0];pinnedFlowKey='';pinned=false;routeCards.reset();ui.reset();root.innerHTML=snap.html;
   applyFlowPin();ui.show({...snap.paint,gen:1,token:'preview',navigation:{current:1,total:data.auto[terminal].length}});window.scrollTo(0,0);
 };
 window.showPinnedCase=id=>{showPinned(data.pinnedRows.find(r=>r.caseId===id));window.scrollTo(0,0)};
 window.runGroupGlowChecks=()=>{
   ui.reset();routeCards.reset();logicUi.reset();pinned=false;pinnedFlowKey='';root.innerHTML=data.groupFixture.html;
   const [a,b]=data.groupFixture.routes,groups=()=>[...root.querySelectorAll('[data-flow-logic]')];
   check(groups().some(g=>g.dataset.flowLogicKind==='any')&&groups().some(g=>g.dataset.flowLogicKind==='all'),'mixed ALL/ANY rendered fixture coverage');
   const appearance=()=>[...root.querySelectorAll('.flow-group-halo')].map(h=>({d:h.getAttribute('d'),class:h.getAttribute('class'),filter:getComputedStyle(h).filter,stroke:getComputedStyle(h).stroke,dash:getComputedStyle(h).strokeDasharray}));
   for(const g of groups().filter(g=>a.paint.groupKeys.includes(g.dataset.flowLogic)))click(g);
   const manual=appearance();check(manual.length>0,'manual group glow baseline');logicUi.reset();
   ui.show({...a.paint,gen:1,token:'mixed'});
   check(JSON.stringify(appearance())!==JSON.stringify(manual),'automatic glow overrides group-type toggle color');checkGroupColors(a.paint.groupOutcomes);
   check(groups().filter(g=>a.paint.groupKeys.includes(g.dataset.flowLogic)).every(g=>g.getAttribute('aria-pressed')==='false'),'automatic channel does not mutate manual toggle');
   check(rows().every(n=>n.classList.contains('tree-focus-node')===a.paint.nodeKeys.includes(n.dataset.flowKey)),'all nested ALL/ANY nodes blue, Boolean labels neutral');
   const clone=root.cloneNode(true);sanitizeUnpinnedTreeFocusSnapshot(clone);
   check(!clone.querySelector('.flow-group-halo,.flow-group-solid[data-flow-auto-tree]'),'snapshot removes tree-only automatic glow');
   for(const route of [a,b])for(const paint of [route.negativePaint,route.unknownPaint]){
     ui.show({...paint,gen:1,token:'negative'});
     check(groups().every(g=>groupGlows(g)===paint.groupKeys.includes(g.dataset.flowLogic)),'No ALL and ANY red; unknown has no automatic color');checkGroupColors(paint.groupOutcomes);
     check(rows().every(n=>n.classList.contains('tree-focus-node')===paint.nodeKeys.includes(n.dataset.flowKey)),'No/unknown ALL and ANY route nodes stay blue, labels and off-route nodes neutral');
     check(row(paint.key).classList.contains('tree-focus-node')&&row(paint.key).classList.contains('tree-focus-selected'),'No/unknown clicked terminal retains blue and sole white focus');
   }
   ui.show({...a.paint,gen:1,token:'positive-again'});
   const manualA=groups().find(g=>g.dataset.flowLogicKind==='all');click(manualA);checkGroupColors(a.paint.groupOutcomes);
   check(manualA.getAttribute('aria-pressed')==='true','manual state independent while route overrides');
   const selectedClone=root.cloneNode(true);sanitizeUnpinnedTreeFocusSnapshot(selectedClone);
   check(!!selectedClone.querySelector('.flow-group-halo.flow-group-orange')&&!selectedClone.querySelector('.flow-group-halo.flow-condition-true,.flow-group-halo.flow-condition-false,[data-flow-manual-color],[data-flow-auto-tree]'),'snapshot restores manual fallback, removes transient route polarity');
   click(manualA);checkGroupColors(a.paint.groupOutcomes);check(manualA.getAttribute('aria-pressed')==='false','manual off does not remove path glow');
   click(manualA);ui.show({...a.negativePaint,gen:1,token:'manual-negative'});checkGroupColors(a.negativePaint.groupOutcomes);
   check(manualA.getAttribute('aria-pressed')==='true','manual on remains independent under red override');
   logicUi.update();checkGroupColors(a.negativePaint.groupOutcomes);
   ui.show({...a.unknownPaint,gen:1,token:'manual-unknown'});
   check(groupGlows(manualA)&&appearance().every(h=>h.class.includes('flow-group-orange')),'unknown route retains manual toggle without inventing polarity');
   ui.reset();
   check(groupGlows(manualA)&&manualA.getAttribute('aria-pressed')==='true','clearing route retains manual emphasis');
   const manualClone=root.cloneNode(true);sanitizeUnpinnedTreeFocusSnapshot(manualClone);check(!!manualClone.querySelector('.flow-group-halo.flow-group-orange'),'snapshot preserves original manual emphasis');
   check(appearance().every(h=>h.class.includes('flow-group-orange')),'route clear restores original manual toggle color');
   pinned=true;pinnedFlowKey=b.paint.key;pinnedRouteKeys=b.keys;pinnedPathKeys=b.paint.nodeKeys;pinnedGroupKeys=b.paint.groupKeys;pinnedGroupOutcomes=b.paint.groupOutcomes;applyFlowPin();
   check(manualA.getAttribute('aria-pressed')==='true'&&!groupGlows(manualA),'pin other route hides manual off-route halos without discarding state');
   check(groups().filter(g=>b.paint.groupKeys.includes(g.dataset.flowLogic)).every(groupGlows),'pin applies current route group glow');
   checkGroupColors(b.paint.groupOutcomes);
   pinnedGroupKeys=b.negativePaint.groupKeys;pinnedGroupOutcomes=b.negativePaint.groupOutcomes;applyFlowPin();checkGroupColors(b.negativePaint.groupOutcomes);
   const pinnedClone=root.cloneNode(true);sanitizeUnpinnedTreeFocusSnapshot(pinnedClone);check(!!pinnedClone.querySelector('.flow-group-halo.flow-condition-false'),'snapshot retains pinned route override');
   logicUi.update();check(!groupGlows(manualA),'layout refresh cannot restore hidden off-route halos');
   pinnedFlowKey='';pinned=false;applyFlowPin();check(groupGlows(manualA),'unpin restores visible manual glow');
   check(groups().filter(g=>b.paint.groupKeys.includes(g.dataset.flowLogic)).every(g=>!groupGlows(g)),'unpin clears automatic pinned channel');
   logicUi.reset();root.innerHTML=data.groupFixture.html;ui.show({...a.paint,gen:1,token:'mixed-preview'});window.scrollTo(0,0);
   return {groupGlowChecks:checks.length};
 };
 window.showPtosisUnmet=()=>{
   const pin=data.pinnedRows.find(r=>r.caseId==='ptosis-photos-unmet');logicUi.reset();routeCards.reset();pinnedFlowKey='';pinned=false;ui.reset();root.innerHTML=pin.html;applyFlowPin();
   ui.show({key:pin.leafKey,nodeKeys:pin.pathNodeKeys,groupKeys:pin.pathGroupKeys,groupOutcomes:pin.pathGroupOutcomes,operands:[],conditions:pin.conditions,gen:1,token:'ptosis-unmet',navigation:{current:1,total:1}});
   for(const c of pin.conditions.filter(c=>c.result==='false'))check(rows().filter(n=>pin.nodes[n.dataset.flowKey]?.outline&&!pin.nodes[n.dataset.flowKey]?.logic&&!pin.nodes[n.dataset.flowKey]?.choice&&pin.nodes[n.dataset.flowKey]?.owner===c.key).every(n=>n.classList.contains('tree-focus-node')),'Ptosis Unmet screenshot regression: failed criterion nodes retain blue route borders');checkGroupColors(pin.pathGroupOutcomes);
   check(root.querySelectorAll('.flow-edge.tree-focus-false').length>0,'Ptosis Unmet screenshot regression: selected No branches red');window.scrollTo(0,0);
   check(getComputedStyle(row(pin.leafKey).querySelector(':scope > .flow-ring')).display!=='none','Ptosis Unmet clicked node retains actual visible blue ring');
   check([...root.querySelectorAll('[data-flow-logic]')].filter(g=>pin.pathGroupKeys.includes(g.dataset.flowLogic)).every(groupGlows),'Ptosis Unmet retains group connector glow');
   check(!root.querySelector('.tree-traversal-nav'),'Ptosis Unmet single route has no navigator');
 };
 window.data=data;window.ready=true;
 window.runDisclosureChecks=()=>{
   const box=document.createElement('div'),outside=document.createElement('button');outside.textContent='Outside';document.body.append(box,outside);
   let gen=1,terminal='',at=0,defer=false,pending;
   const node=()=>[...box.querySelectorAll('[data-flow-key]')].find(n=>n.dataset.flowKey===terminal);
   const local=installUnpinnedTreeFocus(box,{postMessage:m=>{
     if(m.type==='treeFocus'){terminal=m.key;at=0}else if(m.type==='cycleTreeFocus')at+=m.dir==='next'?1:-1;else return;
     const snap=data.auto[terminal][at];gen++;local.beforeRender('auto');box.innerHTML=snap.html;
     pending={...snap.paint,gen,token:'auto',navigation:{current:at+1,total:data.auto[terminal].length}};
     if(!defer)local.show(pending);
   }},()=>gen,()=>false);
   installFlowKeyboardActions(box);
   for(const key of Object.keys(data.auto)){
     box.innerHTML=data.collapsedHtml;terminal=key;click(node());
     check(document.activeElement===node(),'auto opening preserves clicked terminal focus');
     for(let i=0;i<data.auto[key].length;i++){
       if(i){const next=box.querySelector('[data-tree-traversal-nav="next"]');next.focus();next.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
         check(document.activeElement===(i+1<data.auto[key].length?box.querySelector('[data-tree-traversal-nav="next"]'):node()),'full-render keyboard Next preserves arrow or falls back to terminal at boundary');}
       check(!box.querySelector('[data-flow-input="expanded"]'),'automatic criterion opening leaves INPUT folded');
       check(!box.querySelector('[data-flow-decoration="choices"]'),'automatic criterion opening leaves answer choices folded');
       check([...box.querySelectorAll('[data-flow-key]')].filter(n=>n.dataset.flowComponent&&n.classList.contains('tree-focus-node')).every(n=>n.dataset.flowComponent==='expanded'),'path criteria expanded when terminal selected');
     }
   }
   // Two-step redraw fixture tests focus cancellation independently of Bleph's six grouped choices.
   const key=Object.keys(data.auto)[0];data.auto[key].push(data.auto[key][0]);terminal=key;box.innerHTML=data.collapsedHtml;click(node());
   check(box.querySelector('.tree-traversal-nav text').textContent==='1 of 2','future multiple-route navigator still available');
   check(box.querySelector('[data-tree-traversal-nav="previous"] text').textContent==='←'&&box.querySelector('[data-tree-traversal-nav="next"] text').textContent==='→','future route navigator renders the original arrow glyphs');
   let arrow=box.querySelector('[data-tree-traversal-nav="next"]');arrow.focus();arrow.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   check(at===1&&box.querySelector('.tree-traversal-nav text').textContent==='2 of 2'&&document.activeElement===node(),'keyboard Next reaches last route and focuses terminal at boundary');
   arrow=box.querySelector('[data-tree-traversal-nav="previous"]');arrow.focus();arrow.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   check(at===0&&box.querySelector('.tree-traversal-nav text').textContent==='1 of 2','keyboard Previous reaches first route');
   box.querySelector('[data-tree-traversal-nav="next"]').focus();local.show({...data.auto[key][0].paint,gen,token:'auto',navigation:{current:1,total:1}});
   check(!box.querySelector('.tree-traversal-nav')&&document.activeElement===node(),'two-to-one route transition hides navigator and focuses its terminal');
   check(node().classList.contains('tree-focus-node')&&node().classList.contains('tree-focus-selected'),'one route still paints clicked blue path and white focus');
   local.show({...data.auto[key][0].paint,gen,token:'auto',navigation:{current:1,total:2}});
   check(box.querySelector('.tree-traversal-nav text').textContent==='1 of 2','one-to-two route transition restores navigator');
   defer=true;const next=box.querySelector('[data-tree-traversal-nav="next"]');next.focus();click(next);outside.focus();local.show(pending);
   check(document.activeElement===outside,'intervening user focus cancels restoration after render');
   node().focus();gen++;local.beforeRender('wanted');box.innerHTML=data.auto[key][at].html;
   local.show({...pending,gen,token:'other'});check(document.activeElement!==node(),'wrong token does not restore focus');
   data.auto[key].pop();box.remove();outside.remove();return {disclosureChecks:checks.length};
 };
 `,resolveDir:work,loader:'ts'},bundle:true,platform:'browser',format:'iife',write:false}).outputFiles[0].text;
const html=`<!doctype html><html><head><meta charset="utf-8"><style>:root{--vscode-foreground:#ddd;--vscode-editor-background:#202020;--vscode-panel-border:#777}body{background:#202020;color:#ddd;font:14px sans-serif}</style></head><body data-mode="medical-validation"><div id="root"></div><script>${script.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
fs.writeFileSync(path.join(out,'rendered.html'),html);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rpc(target,method,params={}){
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout '+method)),30000);ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id===1){clearTimeout(timer);r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result)}};ws.send(JSON.stringify({id:1,method,params}))})}finally{ws.close()}
}
(async()=>{
 const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(profile,{recursive:true});const log=fs.openSync(path.join(profile,'browser.log'),'w');
 const browser=spawn(process.env.CRL_TEST_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--renderer-process-limit=2','--remote-debugging-port=0','--remote-allow-origins=*','--user-data-dir='+profile,'--disk-cache-dir='+path.join(profile,'cache'),'--no-first-run','--no-default-browser-check','about:blank'],{stdio:['ignore',log,log],windowsHide:true});
 let browserError;browser.on('error',e=>browserError=e);const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));let target;
 try{
   const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++){if(browserError)throw browserError;if(browser.exitCode!==null)throw Error('Browser exited '+browser.exitCode);await sleep(100)}
   const endpoint='http://127.0.0.1:'+fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0];target=await(await fetch(endpoint+'/json/new?'+encodeURIComponent('http://127.0.0.1:'+server.address().port),{method:'PUT'})).json();
   const evaluate=async expression=>{const r=await rpc(target,'Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
   let ready=false;for(let i=0;i<100&&!ready;i++){try{ready=await evaluate('window.ready===true')}catch(e){if(!/Execution context was destroyed|Cannot find context/.test(String(e)))throw e}if(!ready)await sleep(50)}assert(ready,'Browser did not load');
   const receipt=await evaluate('runChecks()');assert.equal(receipt.terminals,6);assert.equal(receipt.traversals,6);
   await evaluate(`showTraversal(Object.keys(data.choices)[1])`);
   const screenshot=await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'highlight.png'),Buffer.from(screenshot.data,'base64'));
   await evaluate(`showTraversal(Object.keys(data.choices)[2])`);const otherScreenshot=await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'other-traversal.png'),Buffer.from(otherScreenshot.data,'base64'));
   await evaluate('showInput()');const inputScreenshot=await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'input-focus.png'),Buffer.from(inputScreenshot.data,'base64'));
   Object.assign(receipt,await evaluate('runPinnedChecks()'));const pinnedScreenshot=await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'pinned-six.png'),Buffer.from(pinnedScreenshot.data,'base64'));
   Object.assign(receipt,await evaluate('runPinFocusChecks()'));
   fs.writeFileSync(path.join(out,'route-audit.json'),JSON.stringify(await evaluate('auditPinned()'),null,2));
   Object.assign(receipt,await evaluate('runDisclosureChecks()'));
   const fullScreenshot=async name=>{const metrics=await rpc(target,'Page.getLayoutMetrics'),size=metrics.cssContentSize??metrics.contentSize;const shot=await rpc(target,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:size.width,height:size.height,scale:1}});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'))};
   await evaluate('showAuto()');await fullScreenshot('auto-criteria');
   await evaluate("showPinnedCase('upper-photos-unmet')");await fullScreenshot('pinned-inputs');
   await evaluate('showPtosisUnmet()');await fullScreenshot('ptosis-unmet');
   Object.assign(receipt,await evaluate('runGroupGlowChecks()'));await fullScreenshot('mixed-group-glow');
   Object.assign(receipt,await evaluate('runReviewChecks()'));await fullScreenshot('criterion-review-pass');
   fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 }finally{if(target)await rpc(target,'Browser.close').catch(()=>{});if(browser.pid&&browser.exitCode===null)browser.kill();fs.closeSync(log);server.closeAllConnections();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
