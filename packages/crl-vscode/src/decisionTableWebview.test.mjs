// REFACTOR:grounded: execute the production runtime twice with disjoint roots and actual route cards.
import assert from 'node:assert/strict';
import { browserExecutable, browserFixture } from '../test/browserHarness.mjs';
import { COCKPIT_WEBVIEW_SCRIPT } from './correspondenceCockpit.ts';
import { renderFlowPane, FLOW_STYLE } from './flowPaneHtml.ts';
import { ROUTE_CARD_STYLE, installRouteCards } from './routeCardsWebview.ts';
import { installDecisionTableWebview, captureDecisionTable, DECISION_TABLE_STYLE } from './decisionTableWebview.ts';
import { screenCapturedDom } from './snapshotCapture.ts';
import { sanitizeUncertaintySnapshot } from './uncertaintyGuardDisplay.ts';
import { sanitizeCriterionDescriptionSnapshot } from './criterionDescriptionNavigation.ts';
import { sanitizeUnpinnedTreeFocusSnapshot } from './unpinnedTreeFocusWebview.ts';

const leaf={nodeKey:'end',nodeId:'end',kind:'action',actionKind:'recommend-activity',label:'Met',lib:'L',decision:'D',location:{},refKeys:['activity'],children:[]};
const structure=[{nodeKey:'D',lib:'L',decision:'D',location:{},children:[{nodeKey:'w',nodeId:'w',kind:'when',label:'Question',lib:'L',decision:'D',location:{},refKeys:[],children:[leaf]}]}];
const options={expandedGuardWhens:new Set(['w']),
 concepts:[{nodeKey:'q',lib:'L',name:'Q',location:{},definitionRefs:[],hasLocalCode:true,valueTypes:['CodeableConcept']}],
 answerOptionsByConcept:new Map([['q',[{code:'x',display:'Option X'},{code:'y',display:'Option Y'}]]]),
 guardOutlines:new Map([['w',{expr:{kind:'criterion',name:'C',lib:'L',bodyHash:'c',operand:{kind:'and',operands:[{kind:'leaf',name:'Q',lib:'L',nodeKey:'q',isSource:true},{kind:'leaf',name:'Q',lib:'L',nodeKey:'q',isSource:true}]}}}]])};
const a=renderFlowPane(structure,{...options,revealPrefix:'rowA_'}),b=renderFlowPane(structure,{...options,revealPrefix:'rowB_'});
const script=COCKPIT_WEBVIEW_SCRIPT+`globalThis.tableUi=(${installDecisionTableWebview.toString()})(document.getElementById('root'),crlCockpitBridge,globalThis.installCrlCockpitRuntime,(${captureDecisionTable.toString()}),[(${sanitizeUncertaintySnapshot.toString()}),(${sanitizeCriterionDescriptionSnapshot.toString()}),(${sanitizeUnpinnedTreeFocusSnapshot.toString()})]);`;
test.skipIf(!browserExecutable)('two browser runtimes isolate rendering, actions, drafts, drawer refresh, capture and disposal',async()=>{
 assert.match(a.html,/data-flow-question=/);
 const browser=await browserFixture(`<!doctype html><html><head><style>body{background:#1e1e1e;color:#ddd}${FLOW_STYLE}${ROUTE_CARD_STYLE}${DECISION_TABLE_STYLE}</style></head><body><div id="fcChrome"></div><div id="root"></div><div id="flagDrawer"></div><script>window.messages=[];window.acquireVsCodeApi=()=>({postMessage:m=>messages.push(m)});${script.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);
 try{
  const run=code=>browser.evaluate('{'+code+'}');
  await browser.until(()=>run(`!!document.getElementById('root')&&!!globalThis.tableUi`),'production table runtime installed');
  const message=data=>run(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(data)}}))`);
  const row=(id,message)=>({type:'decisionTableRow',epoch:4,rowId:id,message});
  const layout={type:'decisionTable',epoch:4,label:'D',total:'2',uncovered:'1',range:'1–2',rows:[{id:'a',label:'Met',caseLabel:'A',caseCount:2},{id:'b',label:'Met',caseLabel:'B',error:'Coverage error example',caseCount:1}]};
  await message(layout);
  assert.deepEqual(await run(`[document.querySelector('#root').contains(document.querySelector('.decision-table-row')),document.querySelectorAll('.decision-table-row').length]`),[false,2]);
  await message(row('b',{type:'render',gen:2,indexVersion:1,mode:'medical-validation',html:b.html}));
  await message(row('a',{type:'render',gen:1,indexVersion:1,mode:'medical-validation',html:a.html}));
  const aId=a.anchors.w.segmentIds[0],bId=b.anchors.w.segmentIds[0];
  await run(`messages.length=0;document.querySelector('.decision-table-row [data-flow-key="w"]').focus({preventScroll:true});document.querySelectorAll('.decision-table-row')[1].querySelector('[data-flow-key="w"]').focus({preventScroll:true});`);
  assert.deepEqual(await run(`messages.filter(m=>m.type==='decisionTableRow'&&m.message.type==='branchFocus').map(m=>[m.rowId,m.message.gen])`),[['a',1],['b',2]],'real focusin producers identify their own installed row generation');

  await message(row('a',{type:'markLeaves',gen:1,yesIds:[aId],noIds:[]}));
  await message(row('b',{type:'markLeaves',gen:2,noIds:[bId],yesIds:[]}));
  await message(row('a',{type:'markLeaves',gen:0,noIds:[aId],yesIds:[]}));
  const marks=()=>run(`[document.getElementById(${JSON.stringify(aId)}).classList.contains('flow-leaf-yes'),document.getElementById(${JSON.stringify(bId)}).classList.contains('flow-leaf-no')]`);
  assert.deepEqual(await marks(),[true,true]);
  await message(row('a',{type:'flagHl',gen:1,gids:[aId]}));
  await message(row('b',{type:'flagHl',gen:2,gids:[]}));
  assert.equal(await run(`document.getElementById(${JSON.stringify(aId)}).classList.contains('flag-current')`),true,'B clear cannot erase A highlight');
  await message(row('b',{type:'flagHl',gen:2,gids:[bId]}));
  assert.equal(await run(`document.querySelectorAll('.decision-table-row .flag-current').length`),2);
  // Ready order is verified on a fresh render after the semantic-action check.
  await run(`messages.length=0`);await message(row('b',{type:'render',gen:2,indexVersion:1,mode:'medical-validation',html:b.html}));await message(row('a',{type:'render',gen:1,indexVersion:1,mode:'medical-validation',html:a.html}));
  await message(row('a',{type:'markLeaves',gen:1,yesIds:[aId],noIds:[]}));await message(row('b',{type:'markLeaves',gen:2,noIds:[bId],yesIds:[]}));
  assert.deepEqual(await run(`messages.filter(m=>m.type==='decisionTableRow'&&m.message.type==='ready').map(m=>[m.rowId,m.message.gen])`),[['b',2],['a',1]]);
  await run(`messages.length=0;document.querySelector('.decision-table-row button').click()`);
  assert.deepEqual(await run(`messages`),[{type:'decisionTableAction',epoch:4,action:'case',rowId:'a'}]);
  for(const html of ['<p>Flag A</p>','<p>Flag B</p>',''])await message({type:'flagDrawer',html});
  assert.deepEqual(await marks(),[true,true]);
  const pin={type:'routeCards',gen:1,token:'pinA',pinKey:'end',routeKeys:['D','w','end'],pathNodeKeys:['D','w','end'],cards:[{id:'q',ownerKey:'w',library:'L',concept:'Q',criterionPaths:[[{lib:'L',name:'C'}]],text:'Actual visible question?',description:'Description',answer:'yes',editable:true,editing:true,draftText:'A draft',draftDescription:'A description'}],showQuestions:true,label:'Case A',navigation:{current:1,total:2,previous:false,next:true}};
  await message(row('a',pin));
  // Real production click/context-menu producers cross the strict generation boundary.
  await run(`messages.length=0;const owner=document.querySelector('.decision-table-row [data-flow-key="end"]');owner.dispatchEvent(new MouseEvent('click',{bubbles:true}));owner.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));`);
  const actions=await run(`messages.filter(m=>m.type==='decisionTableRow'&&['reveal','nodeVerdictMenu'].includes(m.message.type))`);
  assert(actions.some(m=>m.message.type==='reveal'));assert(actions.some(m=>m.message.type==='nodeVerdictMenu'));
  for(const action of actions)assert.equal(action.message.gen,1,'all real row producers carry their installed generation');

  assert(await run(`document.querySelector('.decision-table-row foreignObject .route-card')!==null`));
  assert.equal(await run(`document.querySelector('.decision-table-row textarea')?.value`),'A draft');
  await run(`globalThis.savedRow=document.querySelector('.decision-table-row');globalThis.savedField=savedRow.querySelector('textarea');savedField.focus()`);
  await message({...layout,label:'Updated D'});
  assert.deepEqual(await run(`[savedRow===document.querySelector('.decision-table-row'),savedField===document.activeElement,savedField.value]`),[true,true,'A draft']);
  await message({type:'requestSnapshot',token:'capture'});
  const html=await run(`messages.findLast(m=>m.type==='snapshotDom').html`);
  assert.equal(screenCapturedDom(html).ok,true);assert.match(html,/A draft/);assert.match(html,/Coverage error example/);assert.doesNotMatch(html,/<foreignObject|<textarea|<input/i);
  const terminalLabels=await run(`const captured=new DOMParser().parseFromString(${JSON.stringify(html)},'text/html');[...captured.querySelectorAll('.decision-table-row')].map(row=>[...row.querySelectorAll('[data-flow-terminal]')].filter(node=>!node.closest('[hidden],.flow-focus-hidden')).map(node=>node.textContent).join(' '));`);
  assert(terminalLabels.length===2 && terminalLabels.every(label=>label.includes('Met')),'each exported row retains its visible terminal outcome');
  assert.equal(await run(`savedRow.querySelectorAll('foreignObject .route-card').length`),2);
  assert.equal(html.split('A draft').length-1,1,'only the visible occurrence editor is exported');
  await message(row('a',{...pin,token:'closed',authoritativeDrafts:true,cards:[{...pin.cards[0],editing:false,draftText:'HIDDEN PRIVATE DRAFT'}]}));
  await message({type:'requestSnapshot',token:'closed editor'});
  const closed=await run(`messages.findLast(m=>m.type==='snapshotDom').html`);
  assert.doesNotMatch(closed,/HIDDEN PRIVATE DRAFT|A draft/);assert.match(closed,/Actual visible question/);
  await message(row('a',{...pin,authoritativeDrafts:true}));
  await run(`document.querySelector('.decision-table-row').insertAdjacentHTML('beforeend','<img onerror="alert(1)">')`);
  await message({type:'requestSnapshot',token:'injected'});
  assert.equal(screenCapturedDom(await run(`messages.findLast(m=>m.type==='snapshotDom').html`)).ok,false);
  // Any later interaction cancels A's delayed disclosure restoration, including shared document scrolling.
  await run(`const tail=document.createElement('div');tail.style.height='3000px';document.body.append(tail);document.documentElement.style.overflowAnchor='none';document.scrollingElement.scrollTop=400;const control=savedRow.querySelector('[data-toggle-crit]');if(!control?.getClientRects().length)throw Error('fixture needs a visible Criterion disclosure');const box=control.getBoundingClientRect();control.getBoundingClientRect=()=>({left:box.left+150,top:box.top+150});control.dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
  const disclosure=await run(`messages.findLast(m=>m.type==='decisionTableRow'&&m.rowId==='a'&&m.message.type==='toggleCriterion')?.message`);
  assert(disclosure?.token,'actual runtime owns the pending disclosure token');
  const later=await run(`globalThis.bOwner=document.querySelectorAll('.decision-table-row')[1].querySelector('[data-flow-key]');bOwner.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:20,clientY:20}));window.dispatchEvent(new PointerEvent('pointerup'));bOwner.focus({preventScroll:true});[document.scrollingElement.scrollLeft,document.scrollingElement.scrollTop]`);
  await message(row('a',{type:'render',gen:2,indexVersion:1,mode:'medical-validation',html:a.html,preserveViewport:true,disclosureToken:disclosure.token}));
  assert.deepEqual(await run(`[document.scrollingElement.scrollLeft,document.scrollingElement.scrollTop]`),later);
  assert.equal(await run(`document.activeElement===bOwner`),true);
  await run(`const control=savedRow.querySelector('[data-toggle-crit]');if(!control?.getClientRects().length)throw Error('expected visible Criterion disclosure');control.dispatchEvent(new MouseEvent('click',{bubbles:true}));const field=[...savedRow.querySelectorAll('textarea')].find(n=>n.getClientRects().length);field.focus({preventScroll:true});field.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));field.value='Typed while pending';field.dispatchEvent(new Event('input',{bubbles:true}));field.setSelectionRange(3,7);`);
  const ownDisclosure=await run(`messages.findLast(m=>m.type==='decisionTableRow'&&m.rowId==='a'&&m.message.type==='toggleCriterion').message`);
  const ownScroll=await run(`[document.scrollingElement.scrollLeft,document.scrollingElement.scrollTop]`);
  await message(row('a',{type:'render',gen:3,indexVersion:1,mode:'medical-validation',html:a.html,preserveViewport:true,disclosureToken:ownDisclosure.token}));
  assert.deepEqual(await run(`[document.activeElement.value,document.activeElement.selectionStart,document.activeElement.selectionEnd]`),['Typed while pending',3,7],await run(`JSON.stringify({hasFocus:document.hasFocus(),active:document.activeElement.tagName,token:${JSON.stringify(ownDisclosure.token)},fields:[...savedRow.querySelectorAll('textarea')].map(n=>({value:n.value,visible:n.getClientRects().length,owner:n.closest('.route-card').dataset.ownerKey})),controls:[...savedRow.querySelectorAll('[data-toggle-crit]')].map(n=>({key:n.closest('[data-flow-key]')?.dataset.flowKey,visible:n.getClientRects().length}))})`));
  assert.deepEqual(await run(`[document.scrollingElement.scrollLeft,document.scrollingElement.scrollTop]`),ownScroll);
  await run(`const root=savedRow.querySelector('.cockpit-root');root.querySelector('.flow-svg').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:20,clientY:20}));window.dispatchEvent(new PointerEvent('pointermove',{clientX:80,clientY:80,cancelable:true}));`);
  assert.equal(await run(`document.body.style.cursor`),'grabbing');
  await run(`globalThis.oldButton=savedRow.querySelector('button');messages.length=0`);
  await message({...layout,rows:[layout.rows[1]]});
  assert.equal(await run(`document.body.style.cursor`),'');
  await run(`oldButton.click()`);await message(row('a',{type:'render',gen:3,indexVersion:1,html:a.html}));
  await message({...row('b',{type:'render',gen:3,indexVersion:1,html:'bad'}),epoch:3});
  assert.deepEqual(await run(`messages`),[]);assert(await run(`document.querySelector('.decision-table-row .flow-svg')!==null`));
  await run(`globalThis.u=document.createElementNS('http://www.w3.org/2000/svg','g');u.dataset.flowUncertaintyToggle='guard';u.setAttribute('tabindex','0');u.innerHTML='<rect width="20" height="20"/><text>U</text>';document.querySelector('.decision-table-row svg').append(u);u.focus({preventScroll:true});u.dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
  const toggle=await run(`messages.findLast(m=>m.type==='decisionTableRow'&&m.message.type==='toggleUncertaintyGuard')`);
  assert.equal(toggle.message.gen,2);
  await run(`document.activeElement.blur()`);
  await message({type:'decisionTableFocus',epoch:4,rowId:'removed-row',key:'guard',focusVersion:toggle.message.tableFocusVersion});
  assert.equal(await run(`document.activeElement===u`),true,'folded origin restores corresponding surviving U without scrolling');
  await run(`u.dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
  const laterToggle=await run(`messages.findLast(m=>m.type==='decisionTableRow'&&m.message.type==='toggleUncertaintyGuard')`);
  await run(`document.querySelector('.decision-table-controls button').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.activeElement.blur()`);
  await message({type:'decisionTableFocus',epoch:4,rowId:'b',key:'guard',focusVersion:laterToggle.message.tableFocusVersion});
  assert.equal(await run(`document.activeElement===u`),false,'later interaction cancels delayed U focus');
  await message({type:'decisionTable',active:false,preserve:true,epoch:4});
  assert.equal(await run(`document.getElementById('root').hidden`),false);
  await run(`messages.length=0;[...document.querySelectorAll('button')].find(n=>n.textContent==='Return to Decision Table').click()`);
  assert.deepEqual(await run(`messages`),[{type:'decisionTableAction',epoch:4,action:'resume'}]);
  await run(`tableUi.dispose()`);assert.equal(await run(`document.getElementById('crlDecisionTable')`),null);
 }finally{await browser.close();}
}, 90000);

// REFACTOR:grounded: one yellow scope pin and one icon for the three question display modes.
test.skipIf(!browserExecutable)('tree focus pins, hidden row chooser and explicit three-mode result icon use the production runtime',async()=>{
 const browser=await browserFixture(`<!doctype html><html><head><style>${FLOW_STYLE}${ROUTE_CARD_STYLE}${DECISION_TABLE_STYLE}</style></head><body data-mode="medical-validation"><div id="fcChrome"></div><div id="root"></div><div id="flagDrawer"></div><script>window.messages=[];window.acquireVsCodeApi=()=>({postMessage:m=>messages.push(m)});${script.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);
 try{
  const run=code=>browser.evaluate('{'+code+'}'),message=data=>run(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(data)}}))`);
  await browser.until(()=>run(`!!globalThis.tableUi`),'installed runtime');
  const visible=selector=>run(`[...document.querySelectorAll(${JSON.stringify(selector)})].filter(n=>getComputedStyle(n).display!=='none'&&n.getClientRects().length).length`);
  await message({type:'render',gen:1,indexVersion:1,mode:'medical-validation',html:a.html});
  assert.equal(await visible('#root [data-flow-pin]'),0,'no suggested/default pin');
  await run(`document.querySelector('#root [data-flow-key="w"]').focus({preventScroll:true})`);assert.equal(await visible('#root [data-flow-pin]'),1);
  assert.match(await run(`getComputedStyle(document.querySelector('#root .flow-pin-focus>.flow-pin')).filter`),/255, 213, 79/);
  const layout={type:'decisionTable',epoch:7,label:'D',total:'2',range:'1–2',rows:[{id:'a',scopeKey:'w',label:'Met',caseLabel:'Case A',caseCount:2},{id:'b',label:'Met',caseLabel:'Case B',caseCount:1}]};
  await message(layout);const row=(id,message)=>({type:'decisionTableRow',epoch:7,rowId:id,message});
  await message(row('a',{type:'render',gen:1,indexVersion:1,mode:'medical-validation',html:a.html}));await message(row('b',{type:'render',gen:2,indexVersion:1,mode:'medical-validation',html:b.html}));
  assert.equal(await run(`document.querySelectorAll('[data-table-case-selection][hidden]').length`),2);assert.equal(await visible('.decision-table-row-label button'),0);
  assert.equal(await visible('.decision-table-row-label'),0,'terminal outcome is displayed in the branch rather than repeated above it');
  assert.equal(await run(`document.querySelectorAll('.decision-table-row-label button').length`),2,'picker capability retained');
  const pin={type:'routeCards',gen:1,token:'a-pin',pinKey:'end',routeKeys:['D','w','end'],cards:[{id:'q',ownerKey:'w',library:'L',concept:'Q',criterionPaths:[[{lib:'L',name:'C'}]],text:'Question?',answer:'yes',editable:true,editing:true,draftText:'Preserved draft',draftDescription:'Description',answerDraft:{kind:'boolean',value:true}}],questionMode:'off',authoritativeDrafts:true,label:'Case A'};
  await message(row('a',pin));await message(row('b',{...pin,gen:2,token:'b-pin',label:'Case B'}));
  assert.equal(await visible('.decision-table-row [data-flow-pin]'),1,'only dynamic scope anchor');
  await run(`document.querySelectorAll('.decision-table-row')[1].querySelector('[data-flow-key]').focus({preventScroll:true})`);assert.equal(await visible('.decision-table-row [data-flow-pin]'),1,'focus cannot reveal other table pins');
  assert.match(await run(`getComputedStyle(document.querySelector('.flow-scope-anchor>[data-flow-pin]')).filter`),/255, 213, 79/);
  assert.equal(await run(`document.querySelectorAll('.route-questions-toggle').length`),0,'separate Questions button removed');
  const state=mode=>message(row('a',{type:'branchQuestionnaireState',gen:1,questionMode:mode,open:mode==='panel'}));
  const click=()=>run(`document.querySelector('.decision-table-row .route-layout-toggle').dispatchEvent(new MouseEvent('click',{bubbles:true}));messages.filter(m=>m.message?.type==='toggleBranchQuestionnaire').at(-1).message.questionMode`);
  assert.equal(await click(),'panel');await state('panel');assert.equal(await run(`document.querySelector('.route-layout-toggle').dataset.questionMode`),'panel');assert.equal(await visible('.decision-table-row foreignObject .route-card'),0);
  assert.equal(await click(),'inline');await state('inline');assert.equal(await run(`document.querySelector('.decision-table-row textarea')?.value`),'Preserved draft');
  assert.equal(await click(),'off');await state('off');assert.equal(await visible('.decision-table-row foreignObject .route-card'),0);
  await state('panel');await state('inline');assert.equal(await run(`document.querySelector('.decision-table-row textarea')?.value`),'Preserved draft','panel/inline preserves host-authored draft fields');
 }finally{await browser.close();}
}, 90000);

// REFACTOR:grounded: the three-mode icon retains explicit-focus cancellation across editor frames.
test.skipIf(!browserExecutable)('Tab focus survives the full row handoff message sequence before Enter activates the new mode',async()=>{
 const browser=await browserFixture(`<!doctype html><html><head><style>${FLOW_STYLE}${ROUTE_CARD_STYLE}${DECISION_TABLE_STYLE}</style></head><body data-mode="medical-validation"><div id="fcChrome"></div><div id="root"></div><div id="flagDrawer"></div><script>window.messages=[];window.acquireVsCodeApi=()=>({postMessage:m=>messages.push(m)});${script.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);
 try{
  const run=code=>browser.evaluate('{'+code+'}'),message=data=>run(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(data)}}))`),row=(id,m)=>({type:'decisionTableRow',epoch:9,rowId:id,message:m});
  await browser.until(()=>run(`!!globalThis.tableUi`),'installed runtime');
  await message({type:'decisionTable',epoch:9,label:'D',total:'2',range:'1–2',rows:[{id:'a',scopeKey:'w',label:'Met'},{id:'b',label:'Met'}]});
  const pin={type:'routeCards',gen:1,token:'a',pinKey:'end',routeKeys:['D','w','end'],questionMode:'panel',label:'A',cards:[]};
  await message(row('a',{type:'render',gen:1,indexVersion:1,mode:'medical-validation',html:a.html}));await message(row('a',pin));
  await message(row('b',{type:'render',gen:2,indexVersion:1,mode:'medical-validation',html:b.html}));const other={...pin,gen:2,token:'b',label:'B',questionMode:'off'};await message(row('b',other));
  await run(`const icon=document.querySelectorAll('.route-layout-toggle')[1];for(const n of document.querySelectorAll('[tabindex],button'))if(n!==icon)n.setAttribute('tabindex','-1');const before=document.createElement('button');document.body.prepend(before);before.focus();messages.length=0;`);
  const key=async(key,code)=>{for(const type of ['keyDown','keyUp'])await browser.rpc('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code});};
  await key('Tab',9);assert.equal(await run(`document.activeElement===document.querySelectorAll('.route-layout-toggle')[1]`),true);
  assert.equal(await run(`messages.some(m=>m.rowId==='b'&&m.message.type==='branchFocus')`),true,'actual keyboard focus reaches host bridge');
  await message(row('a',{...pin,questionMode:'off'}));await message(row('a',{type:'branchQuestionnaireState',gen:1,questionMode:'off',open:false}));
  await message(row('b',{...other,questionMode:'panel'}));for(let i=0;i<3;i++)await message(row('b',{type:'branchQuestionnaireState',gen:2,questionMode:'panel',open:true}));
  assert.equal(await run(`document.activeElement===document.querySelectorAll('.route-layout-toggle')[1]`),true,'handoff and repeated telemetry retain the replacement icon');
  await key('Enter',13);const request=await run(`messages.filter(m=>m.rowId==='b'&&m.message.type==='toggleBranchQuestionnaire').at(-1)?.message`);assert.equal(request.questionMode,'inline');
  await message(row('b',{type:'branchQuestionnaireState',gen:2,questionMode:'inline',open:false,focusToken:'b',requestId:request.requestId}));
  await new Promise(resolve=>setTimeout(resolve,240));assert.equal(await run(`document.activeElement===document.querySelectorAll('.route-layout-toggle')[1]`),true,'delayed explicit ACK preserves keyboard icon for the next Enter');
  await key('Enter',13);assert.equal(await run(`messages.filter(m=>m.rowId==='b'&&m.message.type==='toggleBranchQuestionnaire').at(-1).message.questionMode`),'off');
 }finally{await browser.close();}
}, 90000);

// REFACTOR:grounded: the three-mode icon retains explicit-focus cancellation across editor frames.
test.skipIf(!browserExecutable)('question-mode acknowledgements never steal later editor focus across frames',async()=>{
 const browser=await browserFixture('<!doctype html><html><body><textarea id="outer"></textarea><iframe id="frame"></iframe></body></html>');
 try{
  await browser.until(()=>browser.evaluate(`!!document.getElementById('frame')`),'frame fixture');
  const result=await browser.evaluate(`(async()=>{
   const frame=document.getElementById('frame'),d=frame.contentDocument,w=frame.contentWindow;
   d.head.innerHTML='<style>'+${JSON.stringify(FLOW_STYLE+ROUTE_CARD_STYLE)}+'</style>';d.body.dataset.mode='medical-validation';d.body.innerHTML='<div id="root">'+${JSON.stringify(a.html)}+'</div>';
   const root=d.getElementById('root'),leaf=root.querySelector('[data-flow-key="end"]');leaf.classList.add('flow-pinned');leaf.setAttribute('tabindex','-1');
   const install=w.eval('('+${JSON.stringify(installRouteCards.toString())}+')'),sent=[],ui=install(root,{postMessage:m=>sent.push(m)},()=>1);
   ui.show({token:'pin',pinKey:'end',questionMode:'off',label:'A',cards:[{id:'q',ownerKey:'w',library:'L',concept:'Q',text:'Question?',value:'Yes'}]});
   let pans=0;leaf.scrollIntoView=()=>pans++;const wait=()=>new Promise(r=>setTimeout(r,220));
   const click=()=>{root.querySelector('.route-layout-toggle').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));return sent.at(-1).requestId};
   leaf.focus();const first=click();ui.questionnaireState(true,'pin',first,'panel');await wait();const explicit=pans===1;
   ui.questionnaireState(true,'pin',first,'panel');await wait();const repeated=pans===1;
   const second=click(),outer=document.getElementById('outer');outer.focus();const frameLostFocus=!d.hasFocus();ui.questionnaireState(false,'pin',second,'inline');await wait();
   const crossFrame=frameLostFocus&&document.activeElement===outer&&pans===1;
   leaf.focus();const third=click();d.body.dispatchEvent(new w.Event('wheel',{bubbles:true}));ui.questionnaireState(false,'pin',third,'off');await wait();const cancelled=pans===1;
   root.querySelector('.route-layout-toggle').focus();root.classList.add('flow-pointer-interaction');const fourth=click();ui.questionnaireState(true,'pin',fourth,'panel');await wait();const pointerIcon=pans===2&&d.activeElement===leaf;
   root.classList.remove('flow-pointer-interaction');root.querySelector('.route-layout-toggle').focus();const fifth=click();ui.questionnaireState(true,'pin',fifth,'panel');await wait();const keyboardIcon=pans===2&&d.activeElement===root.querySelector('.route-layout-toggle');
   ui.reset();frame.remove();return{explicit,repeated,crossFrame,cancelled,pointerIcon,keyboardIcon};
  })()`);
  assert.deepEqual(result,{explicit:true,repeated:true,crossFrame:true,cancelled:true,pointerIcon:true,keyboardIcon:true});
 }finally{await browser.close();}
}, 90000);
