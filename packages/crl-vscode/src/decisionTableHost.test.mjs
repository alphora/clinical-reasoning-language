// REFACTOR:grounded: execute the production host closures at the row ownership/async boundary.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { caseDisplayName } from './caseDisplayName.ts';
import { treeTraversalSignature } from './unpinnedTreeFocus.ts';
import { branchMessageIsCurrent, branchCaptureManifest } from './decisionTableSessions.ts';
const source=ts.createSourceFile('cockpit.ts',readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function host(names,environment,result,deps={}){
 if(names.some(n=>['focusBranchSession','reconcileDecisionTable','refreshDecisionTableAfterRebuild','handleDecisionTableMessage'].includes(n)))names=[...new Set([...names,'branchSessionCurrent','postBranch','questionModeFor','hasBranchQuestionCase','postQuestionMode','publishQuestionModes','onBranchQuestionnaireClosed','closeQuestionPanel','syncQuestionPanel','setQuestionDisplayMode'])];
 const found=new Map();
 const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text))found.set(node.name.text,node.getText(source));ts.forEachChild(node,visit);};visit(source);
 for(const name of names)assert(found.has(name),'production closure '+name);
 const code=ts.transpileModule('const mvPaneLayout={request:()=>deps.layoutRequests?.push(true)};\n'+environment+'\n'+[...found.values()].join('\n')+'\n'+result,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function('deps',code)({branchMessageIsCurrent,branchCaptureManifest,...deps});
}
const row=(id)=>({id,epoch:'table',sourceVersion:1,generation:3,mounted:true,ready:false,renderToken:id+'-pin',view:{gen:3,acked:false,panel:{webview:{postMessage(){}}}},row:{cases:[{caseId:id+'Case',route:{terminalId:id+'Route'}}]},pin:{token:id+'-pin',epoch:1,caseId:id+'Case',routeId:id+'Route',verdictCaseIds:[id+'Case'],payload:{cards:[{id:'q',text:'Question'}]},targets:new Map([['q',{}]])},drafts:new Map()});
const lifetime=`let legacyQuestionMode='off';let mode='medical-validation',indexVersion=1;const decisionTable={epoch:'table',sessions:new Map(deps.rows.map(row=>[row.id,row]))};
const posts=[];const views=new Map([['tree',{panel:{webview:{postMessage:message=>posts.push(message)}}}]]);`;
test('production draft messages preserve row and RQ owner across other-row edits and paging',()=>{
 const a=row('a'),b=row('b');
 const h=host(['branchSessionCurrent','postBranch','acceptCardDraft'],lifetime+`
 let branchQuestionnaireOwner=deps.rows[0],pinnedCards;const questionnaire=[];const interactiveQuestionnaire={layoutPanel:{reveal:(...args)=>deps.moves.push(args)}},branchQuestionnaire={post:m=>questionnaire.push(m)};`,
 `return{draft:acceptCardDraft,posts,questionnaire,table:decisionTable};`,{rows:[a,b]});
 const draft=(token,text)=>({token,key:'q',fields:{editing:true,editingOwner:'w',draftText:text,draftDescription:'Description'}});
 h.draft(draft(b.pin.token,'B'),false,b);assert.equal(a.pin.payload.cards[0].draftText,undefined);assert.equal(h.questionnaire.length,0);
 h.draft(draft(a.pin.token,'A'),false,a);assert.equal(a.pin.payload.cards[0].draftText,'A');assert.equal(h.questionnaire.length,1);
 a.mounted=false;h.draft(draft(a.pin.token,'Paged A'),true,a);assert.equal(a.pin.payload.cards[0].draftText,'Paged A');assert.equal(h.posts.length,0,'paging does not lose logical owner or post to unmounted DOM');
 h.draft(draft('stale','Wrong'),false,a);assert.equal(a.pin.payload.cards[0].draftText,'Paged A');
 h.table.epoch='new';h.draft(draft(a.pin.token,'Wrong epoch'),false,a);assert.equal(a.pin.payload.cards[0].draftText,'Paged A');
});
test('production result verdict completion stays with originating contextual case set',async()=>{
 const a=row('a'),b=row('b');let resolve;
 const pick=new Promise(r=>resolve=r),persisted=[];
 const h=host(['branchSessionCurrent','postBranch','pinnedVerdictMenu'],lifetime+`
 let pinnedCards,mvSidecarPath='review.json',mvRevision=1;let reviewByCaseId={aCase:'unreviewed',bCase:'unreviewed'},notesByCaseId={};
 const REVIEW_ORDER=['pass'],REVIEW_LABEL={pass:'Pass'},vscode={window:{showQuickPick:()=>deps.pick,setStatusBarMessage(){}}};
 const pinnedVerdict=()=>({state:'unreviewed'}),setAllReviewState=(map,ids,state)=>({changed:ids.length,map:{...map,...Object.fromEntries(ids.map(id=>[id,state]))}});
 const persistMv=map=>{deps.persisted.push(map);return true},renderPane=()=>{},renderTreeChrome=()=>{},driveDoneOverlay=()=>{},cockpitAgentBridge={notifyChanged(){}};`,
 `return{set:pinnedVerdictMenu,table:decisionTable};`,{rows:[a,b],pick,persisted});
 const pending=h.set(a.pin.token,a);b.ready=true;b.view.acked=true;resolve({state:'pass'});await pending;
 assert.deepEqual(persisted,[{aCase:'pass',bCase:'unreviewed'}]);
 a.pin={...a.pin,token:'replacement'};await h.set('a-pin',a);assert.equal(persisted.length,1,'old questionnaire/verdict token refused');
});
test('production case chooser retains per-case drafts without replacing another RQ owner',async()=>{
 const a=row('a'),b=row('b'),old=a.pin;a.caseId='aCase';a.routeId='aRoute';
 a.row.cases.push({caseId:'aSecond',route:{terminalId:'aSecondRoute',nodeKeys:[]}});a.row.cases[0].route.nodeKeys=[];
 const h=host(['branchSessionCurrent','chooseBranchCase'],lifetime+`
 let state={index:{crlNav:[]}};const scenarioByCaseId=new Map();const renders=[];const postDecisionTableLayout=()=>{},renderBranchSession=row=>renders.push(row.id),syncQuestionnaireDefaults=()=>{};
 const vscode={window:{showQuickPick:async items=>items[1]}};`,
 `return{choose:chooseBranchCase,renders};`,{rows:[a,b]});
 await h.choose(a);assert.equal(a.caseId,'aSecond');assert.equal(a.pin,undefined);assert.equal(a.drafts.get(JSON.stringify(['aCase','aRoute'])),old);assert.equal(b.pin.token,'b-pin');assert.deepEqual(h.renders,['a']);
});
test('production final layout ACK is token checked, per row, and does not authorize stale epochs',()=>{
 const a=row('a'),b=row('b');
 const h=host(['branchSessionCurrent','postBranch','handleDecisionTableMessage'],lifetime+`
 const branchMessageIsCurrent=deps.branchMessageIsCurrent,acks=[],paint=[],coord={ready:(...v)=>acks.push(v)},paintBranchSession=s=>paint.push(s.id),flushQuestionFocus=()=>{},branchQuestionnaire={isOpen:true};
 let branchQuestionnaireOwner=deps.rows[0];`,
 `return{message:handleDecisionTableMessage,acks,paint};`,{rows:[a,b]});
 a.coordinatorKey='tree/a';b.coordinatorKey='tree/b';
 const message=(id,type,token,gen=3,epoch='table')=>({type:'decisionTableRow',epoch,rowId:id,message:{type,token,gen}});
 h.message(message('a','ready','a-pin'));assert.equal(a.ready,false);
 h.message(message('a','branchReady','old'));assert.equal(a.ready,false);
 h.message(message('b','branchReady','b-pin'));assert.equal(b.ready,true);assert.equal(a.ready,false);
 h.message(message('a','branchReady','a-pin',2));assert.equal(a.ready,false);
 h.message(message('a','branchReady','a-pin',3,'old'));assert.equal(a.ready,false);
 h.message(message('a','branchReady','a-pin'));assert.equal(a.ready,true);assert.deepEqual(h.acks,[['tree/b',3,1],['tree/a',3,1]]);
});
test('production snapshot rejects pending rows and changed case/page while capture is outstanding',async()=>{
 const a=row('a'),b=row('b');a.ready=b.ready=true;
 let resolve;const response=new Promise(r=>resolve=r);
 const h=host(['tableManifest','captureTreeDom'],`
 let indexVersion=1,currentCel='policy.cel',model;const tree={acked:true,gen:1,panel:{webview:{postMessage:()=>true}}};const views=new Map([['tree',tree]]);
 const branchCaptureManifest=deps.branchCaptureManifest;let decisionTable={epoch:'table',scope:{nodeKey:'root'},offset:0n,visible:['a','b'],sessions:new Map(deps.rows.map(s=>[s.id,s]))};
 const snapshotCapture={pending:false,begin:()=>deps.response,resolve(){}};const randomUUID=()=> 'capture',screenCapturedDom=html=>({ok:true,html});`,
 `return{capture:captureTreeDom,table:decisionTable};`,{rows:[a,b],response});
 b.ready=false;assert.match((await h.capture()).note,/still rendering/);b.ready=true;
 const pending=h.capture();b.renderToken='b-case2';resolve('<svg class="flow-svg"></svg>');assert.match((await pending).note,/changed while capturing/);
});

test('production off-page flag navigation preserves current and dormant drafts plus RQ owner',async()=>{
 const a=row('a'),b=row('b');a.pin.payload.cards[0].draftText='Unsaved current A';a.row.pathKeys=['A'];b.mounted=false;
 b.drafts.set('old case',{payload:{cards:[{draftText:'Dormant B'}]}});
 const h=host(['openFlagList','suspendDecisionTable'],lifetime+`
 decisionTable.visible=['a'];decisionTable.scope={nodeKey:'scope'};decisionTable.offset=20n;
 let currentCel='policy.cel',flagStateError=false,flagStateNote,flagStoreWarning=false;const flag={id:'off-page',anchor:{}};
 const flagsList=[flag],flagPickItem=flag=>({flag}),guardDrawerDiscard=async()=>true,flagNote=message=>{throw Error(message)},vscode={window:{showQuickPick:async items=>items[0]}};
 const flagPlacementFor=()=>({gids:['other']}),snapshotCapture={settleEmpty(){}},syncQuestionnaireDefaults=()=>{};const opened=[];
 const toggleFlagActionView=(...args)=>opened.push(args);let branchQuestionnaireOwner=deps.rows[0];`,
 `return{open:openFlagList,table:decisionTable,posts,opened,owner:()=>branchQuestionnaireOwner};`,{rows:[a,b]});
 a.view.anchors={A:{scrollTo:'a'}};await h.open();
 assert.equal(h.table.suspended,true);assert.equal(h.table.sessions.get('a'),a);assert.equal(h.table.sessions.get('b'),b);
 assert.equal(a.pin.payload.cards[0].draftText,'Unsaved current A');assert.equal(b.drafts.get('old case').payload.cards[0].draftText,'Dormant B');assert.equal(h.owner(),a);
 assert.equal(h.posts[0].preserve,true);assert.equal(h.opened.length,1);assert.equal(h.opened[0][3],true);assert.equal(h.opened[0][4],undefined,'one full-tree reveal, no row broadcast');
});

// REFACTOR:grounded: focusing a row updates Default availability, without reading native forms.
test('Default context follows the focused full case; uncovered/stale rows cannot borrow legacy selection',()=>{
 const a=row('a'),empty=row('empty');a.caseId='aCase';
 const h=host(['branchSessionCurrent','questionnaireDefaultContext','syncQuestionnaireDefaults','loadQuestionnaireDefault','focusBranchSession'],`
 let mode='medical-validation',currentCel='policy',indexVersion=1,focusedBranchSession,questionnaireDefaultIdentity,questionnaireDefaultRevision=0,questionnaireDefaultClock=new Date();
 const cockpitDisposed=false,caseDisplayName=x=>x,rowQuestionnaireDefaults=()=>({id:'row-default:a'});
 let decisionTable={epoch:'table',sessions:new Map(deps.rows.map(row=>[row.id,row]))};
 const currentDefinitions={digest:'one'},state={selection:{caseId:'legacy'}};
 const scenarioByCaseId=new Map([['aCase',{case:{name:'A'},compartmentDir:'a'}],['legacy',{case:{name:'Legacy'}}]]);
 const focusedCaseId=state=>state.selection.caseId,focusedScenario=()=>scenarioByCaseId.get('legacy');
 let updates=0;const interactiveQuestionnaire={defaultsChanged:()=>updates++};
 `,`return{focus:focusBranchSession,load:loadQuestionnaireDefault,context:questionnaireDefaultContext,updates:()=>updates,changeDigest:()=>currentDefinitions.digest='two',suspend:()=>decisionTable.suspended=true};`,{rows:[a,empty]});
 h.focus(a);assert.equal(h.context().scenario.case.name,'A');const captured=h.context().identity;h.changeDigest();assert.notEqual(h.context().identity,captured);
 const defaults=h.load('policy');assert.equal(defaults.current(),true);
 h.focus(empty);assert.equal(h.context().scenario,undefined);assert.match(h.context().reason,/covered/);h.focus(a);assert.equal(defaults.current(),false,'A to B to A invalidates pending Default');
 const next=h.load('policy');a.mounted=false;assert.equal(next.current(),false,'unmounted row cannot adopt an evaluated Default');a.mounted=true;
 h.suspend();assert.equal(h.context().scenario.case.name,'Legacy');
});

// REFACTOR:grounded: execute the real host mode/owner/focus handlers with the panel's synchronous close callback.
function questionHost(){
 const a=row('a'),b=row('b'),empty=row('empty'),rows=[a,b,empty],opens=[],posts=[],moves=[];
 for(const r of rows){r.questionMode='off';r.caseId=r.id+'Case';r.routeId=r.id+'Route';r.pin.payload.token=r.pin.token;r.pin.payload.authoritativeDrafts=true;r.pin.payload.cards[0].draftText=r.id+' unsaved';}
 empty.caseId=empty.routeId=undefined;empty.row.cases=[];empty.pin=undefined;
 const h=host(['focusBranchSession','syncQuestionPanel','closeQuestionPanel','setQuestionDisplayMode','handleDecisionTableMessage'],`
 let mode='medical-validation',indexVersion=1,legacyQuestionMode='off',focusedBranchSession,branchQuestionnaireOwner,pinnedCards;
 const decisionTable={epoch:'table',sessions:new Map(deps.rows.map(r=>[r.id,r]))},scenarioByCaseId=new Map([['aCase',{}],['bCase',{}]]);
 const branchMessageIsCurrent=deps.branchMessageIsCurrent,views=new Map([['tree',{gen:1,panel:{viewColumn:2,webview:{postMessage:m=>deps.posts.push(m)}}}]]);
 const syncQuestionnaireDefaults=()=>{},flushQuestionFocus=()=>{},coord={ready(){}},paintBranchSession=()=>{};let opened=false;
 const interactiveQuestionnaire={layoutPanel:{reveal:(...args)=>deps.moves.push(args)}},branchQuestionnaire={get isOpen(){return opened},open:payload=>{if(!payload?.token)throw Error('Empty panel payload');opened=true;deps.opens.push(payload);},close:()=>{if(!opened)return;opened=false;onBranchQuestionnaireClosed();}};`,
 `return{set:setQuestionDisplayMode,focus:focusBranchSession,sync:syncQuestionPanel,close:closeQuestionPanel,manualClose:()=>branchQuestionnaire.close(),legacy:()=>legacyQuestionMode,setLegacy:mode=>{legacyQuestionMode=mode},
 message:handleDecisionTableMessage,owner:()=>branchQuestionnaireOwner,open:()=>opened};`,{rows,opens,posts,moves});
 return{...h,a,b,empty,opens,posts,moves};
}
test('three explicit question modes share host draft state and manual/inline closure cannot reset intended mode',()=>{
 const h=questionHost();h.setLegacy('inline');h.set(h.a,'panel');assert.equal(h.a.questionMode,'panel');assert.equal(h.owner(),h.a);assert(h.open());
 h.set(h.a,'inline');assert.equal(h.a.questionMode,'inline');assert.equal(h.owner(),undefined);assert(!h.open());
 assert.equal(h.legacy(),'inline','closing a table-owned panel does not erase the tree display preference');
 assert.equal(h.a.pin.payload.cards[0].draftText,'a unsaved');assert.equal(h.a.pin.payload.showQuestions,true);
 h.set(h.a,'off');assert.equal(h.a.questionMode,'off');assert.equal(h.a.pin.payload.showQuestions,false);
 h.set(h.a,'panel');h.manualClose();assert.equal(h.a.questionMode,'off');assert.equal(h.owner(),undefined);
});
test('panel follows panel-row to off-row focus and an explicit rendered-panel request cannot double-cycle to inline',()=>{
 const h=questionHost();h.focus(h.a);h.set(h.a,'panel');h.focus(h.b);
 assert.equal(h.a.questionMode,'off');assert.equal(h.b.questionMode,'panel');assert.equal(h.owner(),h.b);assert.equal(h.opens.at(-1).token,'b-pin');
 h.message({type:'decisionTableRow',epoch:'table',rowId:'b',message:{type:'toggleBranchQuestionnaire',gen:3,token:'b-pin',questionMode:'panel'}});
 assert.equal(h.b.questionMode,'panel','focus-before-click still applies the rendered off->panel intent');
 h.message({type:'decisionTableRow',epoch:'table',rowId:'b',message:{type:'toggleBranchQuestionnaire',gen:3,token:'old',questionMode:'inline'}});assert.equal(h.b.questionMode,'panel');
 h.message({type:'decisionTableRow',epoch:'table',rowId:'b',message:{type:'toggleBranchQuestionnaire',gen:3,token:'b-pin',questionMode:'invented'}});assert.equal(h.b.questionMode,'panel');
 h.focus(h.a);assert.equal(h.owner(),h.a);assert.equal(h.a.pin.payload.cards[0].draftText,'a unsaved');
});
test('uncovered focus clears old panel; covered pending intent never borrows the origin payload or reopens on old ACK',()=>{
 const h=questionHost();h.focus(h.a);h.set(h.a,'panel');h.focus(h.empty);
 assert(!h.open());assert.equal(h.owner(),undefined);assert.equal(h.a.questionMode,'off');assert.equal(h.empty.questionMode,'off');
 h.focus(h.a);h.set(h.a,'panel');const pin=h.b.pin;h.b.pin=undefined;h.focus(h.b);
 assert.equal(h.b.questionMode,'panel');assert.equal(h.owner(),h.b);assert(!h.open());
 h.message({type:'decisionTableRow',epoch:'table',rowId:'a',message:{type:'branchReady',gen:3,token:'a-pin'}});assert(!h.open());assert.equal(h.owner(),h.b);
 h.b.pin=pin;h.sync(h.b);assert(h.open());assert.equal(h.opens.at(-1).token,'b-pin');
});

// REFACTOR:grounded: a pre-removal panel phase cannot turn a table-only handoff into a legacy close.
test('an uncovered replacement after owner disposal preserves the tree inline preference',()=>{
 const h=questionHost();h.setLegacy('inline');h.focus(h.a);h.set(h.a,'panel');h.manualClose();h.focus(h.empty,true);
 assert.equal(h.owner(),undefined);assert.equal(h.empty.questionMode,'off');assert.equal(h.legacy(),'inline');
});

// REFACTOR:grounded: close is safe without an open panel, while explicit close still cancels pending legacy panel intent.
test('idempotent panel close preserves dormant inline mode and clears pending legacy panel mode',()=>{
 const h=questionHost();h.setLegacy('inline');h.close();assert.equal(h.legacy(),'inline');h.setLegacy('panel');h.close();assert.equal(h.legacy(),'off');
});

test('programmatic token-refresh close preserves intent, and panel-to-inline uses the authoritative host payload',()=>{
 const h=questionHost();h.focus(h.a);h.set(h.a,'panel');h.close(true);
 assert(!h.open());assert.equal(h.a.questionMode,'panel');assert.equal(h.owner(),h.a);h.sync(h.a);assert(h.open());
 h.a.pin.payload.cards[0].answerDraft={kind:'boolean',value:true};h.set(h.a,'inline');
 const payload=h.posts.filter(p=>p.type==='decisionTableRow'&&p.rowId==='a'&&p.message.type==='routeCards').at(-1).message;
 assert.equal(payload.questionMode,'inline');assert.deepEqual(payload.cards[0].answerDraft,{kind:'boolean',value:true});assert.equal(payload.cards[0].draftText,'a unsaved');
});
test('an inline destination keeps its explicit mode instead of receiving an unrequested panel transfer',()=>{
 const h=questionHost();h.set(h.b,'inline');h.focus(h.a);h.set(h.a,'panel');h.focus(h.b);
 assert.equal(h.b.questionMode,'inline');assert.equal(h.a.questionMode,'panel');assert.equal(h.owner(),h.a);
});

// REFACTOR:grounded: rebuilding the same pin preserves manually folded question inputs.
test('same-pin refresh preserves disclosures while a new case, route or source reveals its questions',()=>{
 const session=row('a');session.expanded=new Set();session.pin.payload.cards=[];
 session.pin.traversalKey=treeTraversalSignature({route:{nodeKeys:['end']}});
 const h=host(['pinCards'],`
 let indexVersion=1,mode='medical-validation',currentCel,pinnedCards,expandedGuardWhens=new Set(),legacyQuestionMode='off';
 const views=new Map([['tree',deps.session.view]]),scenarioByCaseId=new Map([['aCase',{case:{name:'A'},tree:[]}]]),crlStructure=[],conceptLayer=[],guardOutlines=new Map(),crlMaps=undefined;
 const route={terminalId:'aRoute',nodeIds:[],nodeKeys:['end'],terminalKind:'Met'},traversal={caseId:'aCase',route};
 const routesForCase=()=>[route],treeTraversalEntries=()=>[traversal],treeTraversalSignature=deps.treeTraversalSignature;
 const branchSessionCurrent=()=>true,branchNavigation=()=>({index:0,total:1}),branchNeighbors=()=>({index:0,total:1}),clearTreeFocus=()=>{},caseIdsThroughReviewNode=()=>[],driveLeafMarks=()=>{},whenKeyResolver=()=>()=>undefined;
 const buildRouteQuestionnaire=()=>({questions:[]}),buildResolveValueTypes=()=>()=>{},buildConceptShapeResolver=()=>()=>{},buildDefExprResolver=()=>()=>{};
 const buildRouteCards=()=>({cards:[],targets:new Map()}),buildAnswerContributions=()=>new Map(),definitionValueInputs=()=>new Map();
 const answerOptionsForDisplay=()=>new Map(),answersFromTerminologyForDisplay=()=>new Map();
 let reveals=0,renders=0;
 const expandTraversalCriteria=state=>{reveals++;return new Set([...state,'input']);},expandQuestionInputs=state=>state;
 const renderBranchSession=()=>{renders++;},leafBucketsFromQuestionnaire=()=>({yesKeys:[],noKeys:[]}),conditionTruthKeys=()=>[];
 const treeFocusPaint=()=>({nodeKeys:[],groupKeys:[],groupOutcomes:[]}),pinnedVerdict=()=>{},randomUUID=()=> 'new-token';
 const postBranch=()=>{},syncQuestionPanel=()=>{},paintBranchSession=()=>{},questionModeFor=()=> 'off';
 `,`return{pin:(prior,legacy=false)=>pinCards('aCase','aRoute',undefined,false,undefined,prior,legacy?undefined:deps.session),reveals:()=>reveals,renders:()=>renders,legacyState:()=>expandedGuardWhens};`,{session,treeTraversalSignature});
 const original={...session.pin};
 h.pin(original);assert.equal(h.reveals(),0,'same current pin keeps manually collapsed Input');assert.equal(h.renders(),0);
 h.pin(original,true);assert.equal(h.reveals(),0,'legacy pin refresh also preserves manual disclosures');assert.equal(h.legacyState().size,0);
 for(const changed of [undefined,{...original,caseId:'other'},{...original,routeId:'other'},
   {...original,epoch:0}]){
   session.expanded=new Set();session.pin=undefined;
   h.pin(changed);assert(session.expanded.has('input'),'new pin reveals question ancestry');
 }
 assert.equal(h.reveals(),4);assert.equal(h.renders(),4);
});

// REFACTOR:grounded: both questionnaires occupy distinct columns beside the tree.
test('opening Result moves the existing FHIR pane after it, while row updates preserve placement',()=>{
 const h=questionHost();h.set(h.a,'panel');assert.deepEqual(h.moves,[[4,true]]);
 h.focus(h.a);h.focus(h.b);assert.equal(h.moves.length,1,'same open panel is reused across rows');
 h.manualClose();h.set(h.b,'panel');assert.deepEqual(h.moves,[[4,true],[4,true]]);
});

function sourcePaneHost(options={}){
 return host(['toggleQuestionnairePane','openHighlightedSourceLeft','focusTreeForHighlightedSource','ensurePane'],`
 let mode='medical-validation',currentCel='policy',indexVersion=1,cockpitDisposed=false,highlightedSourceOpening=false;
 const created=[],visibility=[],paint=[],errors=[],calls=[],listeners=new Set();let disposedListeners=0;
 const treeGroup={viewColumn:1,tabs:['tree']},resultGroup={viewColumn:2,tabs:['result']},fhirGroup={viewColumn:3,tabs:['fhir']};
 let groups=[treeGroup,resultGroup,fhirGroup],active=fhirGroup;
 const tree={panel:{viewColumn:1,active:false,reveal(){calls.push('reveal');if(!deps.delayFocus)focus();},onDidChangeViewState(fn){listeners.add(fn);return{dispose(){listeners.delete(fn);disposedListeners++;}}}}};
 function focus(){active=treeGroup;tree.panel.active=true;for(const fn of [...listeners])fn();}
 function renumber(){groups.forEach((g,i)=>g.viewColumn=i+1);tree.panel.viewColumn=treeGroup.viewColumn;}
 const views=new Map([['tree',tree]]),branchQuestionnaire={isOpen:true};
 const vscode={Uri:{joinPath:()=>({})},commands:{async executeCommand(name){calls.push(name);await deps.beforeSplit?.();if(deps.failSplit?.())throw Error('split failed');
  const next={viewColumn:0,tabs:[]};groups.splice(groups.indexOf(active),0,next);renumber();active=next;tree.panel.active=false;deps.afterSplit?.(next);
 }},window:{tabGroups:{get all(){return groups},get activeTabGroup(){return active}},showErrorMessage:e=>errors.push(e),
 createWebviewPanel(type,title,options){const group=groups.find(g=>g.viewColumn===options.viewColumn);group.tabs.push(type);
  const panel={viewColumn:options.viewColumn,webview:{onDidReceiveMessage:()=>({dispose(){}})},onDidDispose:fn=>panel.closed=fn,dispose(){group.tabs=group.tabs.filter(t=>t!==type);panel.closed();if(!group.tabs.length){groups=groups.filter(g=>g!==group);renumber();}}};created.push(panel);return panel;}}};
 const context={extensionUri:{}},cockpitViewType=p=>p,paneTitle=p=>p,columnFor=()=>1,nextQuestionnaireColumn=()=>9,shellHtml=()=>'',onWebviewMessage=()=>{},coord={setPaneCapability(){},disposePane(){}},
 dispatch=event=>visibility.push(event),renderPane=()=>{},renderTreeChrome=()=>paint.push(views.has('source'));
 `,`return{open:openHighlightedSourceLeft,toggle:toggleQuestionnairePane,created,views,visibility,paint,errors,calls,focus,
  get listenerCount(){return listeners.size},get disposedListeners(){return disposedListeners},get groups(){return groups},
  stale(){currentCel='new-policy';},closeTree(){views.delete('tree');}};`,options);
}

test('Highlighted Source inserts a separate column before tree, preserving both right questionnaires and manual closure',async()=>{
 const h=sourcePaneHost();await h.open();assert(h.views.has('source'));assert.equal(h.created.length,1);assert.equal(h.paint.at(-1),true);
 assert.deepEqual(h.groups.map(g=>g.tabs),[['source'],['tree'],['result'],['fhir']]);assert.equal(h.created[0].viewColumn,1);
 h.toggle('source');assert(!h.views.has('source'));assert.equal(h.paint.at(-1),false);assert.equal(h.visibility.at(-1).visible,false);
 await h.open();h.created.at(-1).dispose();assert(!h.views.has('source'));assert.equal(h.paint.at(-1),false);assert.equal(h.visibility.at(-1).pane,'source');
 assert.equal(h.listenerCount,0);assert.equal(h.disposedListeners,2);
});

test('Highlighted Source waits for confirmed tree focus and coalesces duplicate pending opens',async()=>{
 const h=sourcePaneHost({delayFocus:true});const first=h.open(),second=h.open();await second;
 assert.equal(h.created.length,0);assert(!h.calls.includes('workbench.action.newGroupLeft'));assert.equal(h.listenerCount,1);
 h.focus();await first;assert.equal(h.created.length,1);assert.equal(h.calls.filter(c=>c==='workbench.action.newGroupLeft').length,1);assert.equal(h.listenerCount,0);
});

test('retargeting while tree focus is pending never splits or opens an old source',async()=>{
 const h=sourcePaneHost({delayFocus:true});const opening=h.open();h.stale();h.focus();await opening;
 assert.equal(h.created.length,0);assert(!h.calls.includes('workbench.action.newGroupLeft'));assert.equal(h.errors.length,0);assert.equal(h.listenerCount,0);
});

test('tree-focus timeout disposes its listener and permits a later retry',async()=>{
 const h=sourcePaneHost({delayFocus:true});await h.open();assert.equal(h.created.length,0);assert.equal(h.errors.length,1);assert.equal(h.listenerCount,0);
 const retry=h.open();h.focus();await retry;assert.equal(h.created.length,1);
});

test('closing or retargeting the tree during group creation cannot open stale source content',async()=>{
 for(const action of ['stale','closeTree']){
  let resume;const split=new Promise(resolve=>resume=resolve),h=sourcePaneHost({beforeSplit:()=>split});const opening=h.open();
  await new Promise(resolve=>setTimeout(resolve,0));h[action]();resume();await opening;assert.equal(h.created.length,0);assert.equal(h.errors.length,0);
 }
});

test('a newly occupied group is preserved and split errors remain retryable',async()=>{
 const occupied=sourcePaneHost({afterSplit:g=>g.tabs.push('user-tab')});await occupied.open();assert.equal(occupied.created.length,0);assert(occupied.groups.some(g=>g.tabs.includes('user-tab')));assert.equal(occupied.errors.length,1);
 let fail=true;const retry=sourcePaneHost({failSplit:()=>fail});await retry.open();assert.equal(retry.created.length,0);assert.equal(retry.errors.length,1);
 fail=false;await retry.open();assert.equal(retry.created.length,1);
});

test('closing a table restores support widths even with Result Questionnaire already off',()=>{
 const layoutRequests=[];
 const h=host(['closeDecisionTable'],`
 let decisionTable={sessions:new Map()},focusedBranchSession,branchQuestionnaireOwner;
 const syncQuestionnaireDefaults=()=>{},branchQuestionnaire={close(){}},snapshotCapture={settleEmpty(){}},coord={disposePane(){}},views=new Map();
 `,`return{close:closeDecisionTable};`,{layoutRequests});
 h.close();assert.equal(layoutRequests.length,1);h.close();assert.equal(layoutRequests.length,1,'already closed is inert');
});
