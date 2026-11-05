// REFACTOR:grounded: execute the production host closures at the row ownership/async boundary.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { caseDisplayName } from './caseDisplayName.ts';
import { branchMessageIsCurrent, branchCaptureManifest } from './decisionTableSessions.ts';
const source=ts.createSourceFile('cockpit.ts',readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function host(names,environment,result,deps={}){
 const found=new Map();
 const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text))found.set(node.name.text,node.getText(source));ts.forEachChild(node,visit);};visit(source);
 for(const name of names)assert(found.has(name),'production closure '+name);
 const code=ts.transpileModule(environment+'\n'+[...found.values()].join('\n')+'\n'+result,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function('deps',code)({branchMessageIsCurrent,branchCaptureManifest,...deps});
}
const row=(id)=>({id,epoch:'table',sourceVersion:1,generation:3,mounted:true,ready:false,renderToken:id+'-pin',view:{gen:3,acked:false,panel:{webview:{postMessage(){}}}},row:{cases:[{caseId:id+'Case',route:{terminalId:id+'Route'}}]},pin:{token:id+'-pin',epoch:1,caseId:id+'Case',routeId:id+'Route',verdictCaseIds:[id+'Case'],payload:{cards:[{id:'q',text:'Question'}]},targets:new Map([['q',{}]])},drafts:new Map()});
const lifetime=`let mode='medical-validation',indexVersion=1;const decisionTable={epoch:'table',sessions:new Map(deps.rows.map(row=>[row.id,row]))};
const posts=[];const views=new Map([['tree',{panel:{webview:{postMessage:message=>posts.push(message)}}}]]);`;
test('production draft messages preserve row and RQ owner across other-row activation and paging',()=>{
 const a=row('a'),b=row('b');
 const h=host(['branchSessionCurrent','postBranch','acceptCardDraft'],lifetime+`
 let branchQuestionnaireOwner=deps.rows[0],pinnedCards;const questionnaire=[];const branchQuestionnaire={post:m=>questionnaire.push(m)};`,
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
 let state={index:{crlNav:[]}};const scenarioByCaseId=new Map();const renders=[];const postDecisionTableLayout=()=>{},renderBranchSession=row=>renders.push(row.id),syncFhirInspection=()=>{};
 const vscode={window:{showQuickPick:async items=>items[1]}};`,
 `return{choose:chooseBranchCase,renders};`,{rows:[a,b]});
 await h.choose(a);assert.equal(a.caseId,'aSecond');assert.equal(a.pin,undefined);assert.equal(a.drafts.get(JSON.stringify(['aCase','aRoute'])),old);assert.equal(b.pin.token,'b-pin');assert.deepEqual(h.renders,['a']);
});
test('production final layout ACK is token checked, per row, and does not authorize stale epochs',()=>{
 const a=row('a'),b=row('b');
 const h=host(['branchSessionCurrent','postBranch','handleDecisionTableMessage'],lifetime+`
 const branchMessageIsCurrent=deps.branchMessageIsCurrent,acks=[],paint=[],coord={ready:(...v)=>acks.push(v)},paintBranchSession=s=>paint.push(s.id),branchQuestionnaire={isOpen:true};
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
 const flagPlacementFor=()=>({gids:['other']}),snapshotCapture={settleEmpty(){}},syncFhirInspection=()=>{};const opened=[];
 const toggleFlagActionView=(...args)=>opened.push(args);let branchQuestionnaireOwner=deps.rows[0];`,
 `return{open:openFlagList,table:decisionTable,posts,opened,owner:()=>branchQuestionnaireOwner};`,{rows:[a,b]});
 a.view.anchors={A:{scrollTo:'a'}};await h.open();
 assert.equal(h.table.suspended,true);assert.equal(h.table.sessions.get('a'),a);assert.equal(h.table.sessions.get('b'),b);
 assert.equal(a.pin.payload.cards[0].draftText,'Unsaved current A');assert.equal(b.drafts.get('old case').payload.cards[0].draftText,'Dormant B');assert.equal(h.owner(),a);
 assert.equal(h.posts[0].preserve,true);assert.equal(h.opened.length,1);assert.equal(h.opened[0][3],true);assert.equal(h.opened[0][4],undefined,'one full-tree reveal, no row broadcast');
});

// REFACTOR:grounded: test the actual row inspection resolver and asynchronous native-form sender.
function fhirHost(rows){
 const loads=[],posts=[];
 const h=host(['branchSessionCurrent','fhirInspectionContext','syncFhirInspection','focusBranchSession','renderFhirQuestionnaire','handleDecisionTableMessage'],`
 let mode='medical-validation',currentCel='policy.cel',indexVersion=1,focusedBranchSession,lastFhirInspectionIdentity;
 let decisionTable={epoch:'table',sessions:new Map(deps.rows.map(row=>[row.id,row]))};
 const branchMessageIsCurrent=deps.branchMessageIsCurrent;
 const state={selection:{primary:'cel',caseId:'legacy'}};
 const scenario=id=>({case:{name:id},decision:{libraryName:'L'},compartmentDir:id+'-directory'});
 const scenarioByCaseId=new Map(['aCase','bCase','aSecond','legacy'].map(id=>[id,scenario(id)]));
 const focusedCaseId=state=>state.selection?.caseId,focusedScenario=()=>scenarioByCaseId.get(focusedCaseId(state)),caseDisplayName=name=>name;
 const views=new Map();const view={gen:0,panel:{webview:{postMessage:m=>deps.posts.push(m)}}};views.set('fhirQuestionnaire',view);
 let renders=0;const renderPane=pane=>{renders++;const v=views.get(pane);if(v)renderFhirQuestionnaire(v,++v.gen);};
 const createHash=deps.createHash,currentDefinitions={state:'current',digest:'definitions-v1'},unrenderableQuestionnaireFeatures=()=>[];
 const loadFhirQuestionnaireCase=compartment=>new Promise((resolve,reject)=>deps.loads.push({compartment,resolve,reject}));`,
 `return{focus:focusBranchSession,message:handleDecisionTableMessage,context:fhirInspectionContext,refresh:()=>renderPane('fhirQuestionnaire'),
 changeCase:(row,id,route)=>{row.caseId=id;row.routeId=route;syncFhirInspection();},suspend:value=>{decisionTable.suspended=value;syncFhirInspection();},
 close:()=>{decisionTable=undefined;syncFhirInspection();},invalidate:()=>{indexVersion++;syncFhirInspection();},legacyRoute:route=>{state.selection.routeId=route;syncFhirInspection();},
 changeDefinitions:digest=>{currentDefinitions.digest=digest;},replace:()=>views.set('fhirQuestionnaire',{gen:0,panel:{webview:{postMessage:m=>deps.posts.push(m)}}}),renders:()=>renders};`,
 {rows,loads,posts,createHash});
 return{...h,loads,posts};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
const fullNative=(name,count)=>({q:{resourceType:'Questionnaire',id:name,item:Array.from({length:count},(_,i)=>({linkId:String(i+1),text:name+' question '+(i+1),type:'string'}))},qr:{resourceType:'QuestionnaireResponse',item:Array.from({length:count},(_,i)=>({linkId:String(i+1),answer:[{valueString:name+' answer '+(i+1)}]}))},lookedFor:name});
test('focused row sends the entire native form and response; repeated same-row focus does not reload',async()=>{
 const a=row('a'),b=row('b');a.caseId='aCase';a.routeId='aRoute';b.caseId='bCase';b.routeId='bRoute';const h=fhirHost([a,b]);
 h.focus(a);assert.equal(h.loads[0].compartment,'aCase-directory');assert.equal(h.posts.at(-1).loading,true);
 const native=fullNative('A',6);h.loads[0].resolve(native);await settle();
 assert.equal(h.posts.at(-1).q,native.q);assert.equal(h.posts.at(-1).qr,native.qr);assert.equal(h.posts.at(-1).q.item.length,6);assert.equal(h.posts.at(-1).label,'aCase');
 h.focus(a);assert.equal(h.loads.length,1);assert.equal(h.renders(),1);
 const key=h.posts.at(-1).key;h.refresh();assert.equal(h.posts.filter(p=>p.loading).length,1,'unrelated same-context render keeps mounted form while reading');
 h.loads[1].resolve(native);await settle();assert.equal(h.posts.at(-1).key,key,'same native content preserves the successful webview mount key');
});
test('late A native data cannot replace the newer focused B form',async()=>{
 const a=row('a'),b=row('b');a.caseId='aCase';b.caseId='bCase';const h=fhirHost([a,b]);h.focus(a);h.focus(b);
 const nativeB=fullNative('B',1);h.loads[1].resolve(nativeB);await settle();h.loads[0].resolve(fullNative('A',6));await settle();
 assert.equal(h.posts.at(-1).q,nativeB.q);assert.equal(h.posts.at(-1).label,'bCase');assert(!h.posts.some(p=>p.q?.id==='A'));
});
test('active case changes reload only that row; another row case change cannot steal FHIR inspection',async()=>{
 const a=row('a'),b=row('b');a.caseId='aCase';a.routeId='aRoute';b.caseId='bCase';const h=fhirHost([a,b]);h.focus(a);
 h.changeCase(b,'aSecond','b-new');assert.equal(h.loads.length,1);
 h.changeCase(a,'aSecond','a-new');assert.equal(h.loads.length,2);h.loads[0].resolve(fullNative('old',6));h.loads[1].resolve(fullNative('new',6));await settle();
 assert.equal(h.posts.at(-1).q.id,'new');assert.equal(h.posts.at(-1).label,'aSecond');
});
test('uncovered, stale and unmounted rows cannot borrow the legacy selected case',async()=>{
 assert.equal(caseDisplayName(''),'','empty names select the unavailable-case placeholder');
 const a=row('a'),empty=row('empty');a.caseId='aCase';const h=fhirHost([a,empty]);
 const message=(id,gen=3)=>({type:'decisionTableRow',epoch:'table',rowId:id,message:{type:'branchFocus',gen}});
 h.message(message('a',2));assert.equal(h.loads.length,0);a.mounted=false;h.message(message('a'));assert.equal(h.loads.length,0);a.mounted=true;
 h.message(message('empty'));assert.equal(h.loads.length,0);assert.equal(h.posts.at(-1).q,undefined);assert.match(h.posts.at(-1).emptyNote,/no covering test case/);assert.equal(h.posts.at(-1).label,undefined);
 h.message(message('a'));assert.equal(h.loads[0].compartment,'aCase-directory');h.invalidate();h.loads[0].resolve(fullNative('obsolete',6));await settle();assert(!h.posts.some(p=>p.q?.id==='obsolete'));
});
test('suspending/closing restores legacy selection; resuming restores the row; replacing a pane rejects its old read',async()=>{
 const a=row('a');a.caseId='aCase';const h=fhirHost([a]);h.focus(a);h.suspend(true);assert.equal(h.loads[1].compartment,'legacy-directory');h.suspend(false);assert.equal(h.loads[2].compartment,'aCase-directory');
 h.replace();h.loads[2].resolve(fullNative('old pane',6));await settle();assert(!h.posts.some(p=>p.q?.id==='old pane'));
 h.close();assert.equal(h.loads.at(-1).compartment,'legacy-directory');
});

// Exercise the actual lifecycle callers, not test-only state transitions.
test('production table lifecycle preserves focus or replaces it after page/fold and rejects pending obsolete native reads',async()=>{
 const loads=[],posts=[],disposed=[];let picked;
 const makeRow=(id,caseIds=[id+'Case'])=>({id,rootKey:'root',label:id,cases:caseIds.map(caseId=>({caseId,route:{terminalId:id+'Route',nodeKeys:[]}}))});
 const a=makeRow('a',['aCase','aSecond']),b=makeRow('b'),c=makeRow('c');
 const wide={scope:{nodeKey:'wide'},totalRows:21n,parent:undefined,children:[],rows:offset=>offset===20n?[c]:[a,b],underlyingRow:id=>[a,b,c].find(row=>row.id===id)};
 const folded={scope:{nodeKey:'folded'},totalRows:1n,parent:wide.scope,children:[],rows:()=>[a],underlyingRow:id=>id==='a'?a:undefined};
 const h=host(['branchSessionCurrent','fhirInspectionContext','syncFhirInspection','focusBranchSession','renderFhirQuestionnaire',
 'reconcileDecisionTable','decisionTableAction','chooseBranchCase','suspendDecisionTable','closeDecisionTable','refreshDecisionTableAfterRebuild','renderRebuiltPanes'],`
 let mode='medical-validation',currentCel='policy.cel',indexVersion=1,decisionTable,focusedBranchSession,lastFhirInspectionIdentity,pinnedCards,branchQuestionnaireOwner,flagDrawerSession,nextBranchSession=0;
 const state={selection:{primary:'cel',caseId:'legacy'},index:{crlNav:[]}},scenario=id=>({case:{name:id},decision:{libraryName:'L'},compartmentDir:id+'-directory'});
 const scenarioByCaseId=new Map(['aCase','aSecond','bCase','cCase','legacy'].map(id=>[id,scenario(id)]));
 const focusedCaseId=state=>state.selection?.caseId,focusedScenario=()=>scenarioByCaseId.get(focusedCaseId(state)),caseDisplayName=name=>name;
 const view={gen:0,panel:{webview:{postMessage:m=>{if(m.type==='fhirQuestionnaire')deps.posts.push(m)}}}};
 const views=new Map([['tree',{panel:{webview:{postMessage(){}}}}],['fhirQuestionnaire',view]]);
 const createHash=deps.createHash,currentDefinitions={state:'current',digest:'definitions-v1'},unrenderableQuestionnaireFeatures=()=>[];
 const loadFhirQuestionnaireCase=compartment=>new Promise((resolve,reject)=>deps.loads.push({compartment,resolve,reject}));
 const renderPane=pane=>{const v=views.get(pane);if(v&&pane==='fhirQuestionnaire')renderFhirQuestionnaire(v,++v.gen);};
 const buildDecisionTable=(_source,_entries,scope)=>scope.nodeKey==='folded'?deps.folded:deps.wide,crlStructure={},tableEntries=()=>[],tableDisplayState=()=>({});
 const PANES=['tree','fhirQuestionnaire'],DECISION_TABLE_PAGE_SIZE=20,randomUUID=()=>String(indexVersion),clearTreeFocus=()=>{},snapshotCapture={settleEmpty(){}},expandedGuardWhens=new Set();
 const coord={disposePane:key=>deps.disposed.push(key)},branchQuestionnaire={close(){}},postDecisionTableLayout=()=>{},renderBranchSession=()=>{},driveLeafMarks=()=>{},flagNote=message=>{throw Error(message)};
 const vscode={window:{showQuickPick:async items=>items[deps.pick()]}};`,
 `return{reconcile:reconcileDecisionTable,focus:focusBranchSession,context:fhirInspectionContext,choose:chooseBranchCase,suspend:suspendDecisionTable,
 action:action=>decisionTableAction({epoch:decisionTable.epoch,action}),close:closeDecisionTable,rebuild:()=>{indexVersion++;renderRebuiltPanes();},
 row:id=>decisionTable.sessions.get(id),table:()=>decisionTable};`,{loads,posts,disposed,wide,folded,createHash,pick:()=>picked});
 h.reconcile(wide.scope);assert.equal(loads.at(-1).compartment,'aCase-directory');
 h.focus(h.row('b'));const pendingB=loads.at(-1);h.reconcile(wide.scope);assert.equal(h.context().caseId,'bCase','visible focused row is retained');
 assert.equal(loads.at(-1),pendingB,'same focus reconcile does not reload');
 await h.action('nextPage');assert.equal(h.context().caseId,'cCase','page removal chooses a current visible row');
 pendingB.resolve(fullNative('obsolete B',6));await settle();assert(!posts.some(p=>p.q?.id==='obsolete B'));
 await h.action('previousPage');assert.equal(h.context().caseId,'aCase');h.focus(h.row('b'));const foldedB=loads.at(-1);
 h.reconcile(folded.scope);assert.equal(h.context().caseId,'aCase','fold removal chooses remaining visible row');
 foldedB.resolve(fullNative('folded B',6));await settle();assert(!posts.some(p=>p.q?.id==='folded B'));
 picked=1;await h.choose(h.row('a'));assert.equal(h.context().caseId,'aSecond');assert.equal(loads.at(-1).compartment,'aSecond-directory');
 const beforeSuspend=loads.at(-1);h.suspend();assert.equal(loads.at(-1).compartment,'legacy-directory');
 beforeSuspend.resolve(fullNative('before suspension',6));await settle();assert(!posts.some(p=>p.q?.id==='before suspension'));
 await h.action('resume');assert.equal(loads.at(-1).compartment,'aSecond-directory');const beforeRebuild=loads.at(-1);
 h.rebuild();assert.equal(loads.at(-1).compartment,'aSecond-directory');assert.notEqual(loads.at(-1),beforeRebuild,'real rebuild rotates inspection epoch/source identity');
 beforeRebuild.resolve(fullNative('before rebuild',6));await settle();assert(!posts.some(p=>p.q?.id==='before rebuild'));
 const stable=fullNative('stable saved case',6);loads.at(-1).resolve(stable);await settle();const stableKey=posts.at(-1).key,beforeRender=posts.length;
 h.rebuild();assert.equal(posts.length,beforeRender,'production pre-reconcile pane render emits no empty/loading message');loads.at(-1).resolve(stable);await settle();assert.equal(posts.at(-1).key,stableKey,'production rebuild preserves the successful native form mount key');
 const beforeClose=loads.at(-1);h.close();assert.equal(loads.at(-1).compartment,'legacy-directory');
 beforeClose.resolve(fullNative('before close',6));await settle();assert(!posts.some(p=>p.q?.id==='before close'));assert.equal(h.table(),undefined);assert(disposed.length>0);
});

test('a changed native definition digest rejects the prior inspection even before source rebuild',async()=>{
 const a=row('a');a.caseId='aCase';const h=fhirHost([a]);h.focus(a);
 h.changeDefinitions('definitions-v2');assert.equal(h.loads.length,1,'definition assignment does not invent a production sync caller');
 h.loads[0].resolve(fullNative('old definitions',6));await settle();assert.equal(h.loads.length,2,'discarded read schedules the current inspection');
 h.loads[1].resolve(fullNative('current definitions',6));await settle();
 assert(!h.posts.some(p=>p.q?.id==='old definitions'));assert.equal(h.posts.at(-1).q.id,'current definitions');
});

test('pre-reconcile stale inspection is deferred and legacy route changes preserve the native mount key',async()=>{
 const a=row('a');a.caseId='aCase';const h=fhirHost([a]);const native=fullNative('same case',6);h.focus(a);h.loads[0].resolve(native);await settle();
 const before=h.posts.length,loaded=h.loads.length;
 h.invalidate();assert.equal(h.posts.length,before,'stale pre-reconcile context neither clears nor changes the mounted form');assert.equal(h.loads.length,loaded,'defer the next read until table reconciliation');
 h.close();h.loads.at(-1).resolve(native);await settle();const legacyKey=h.posts.at(-1).key,legacyLoading=h.posts.filter(p=>p.loading).length;
 h.legacyRoute('different route');assert.equal(h.posts.filter(p=>p.loading).length,legacyLoading,'legacy route-only selection does not blank the form');
 h.loads.at(-1).resolve(native);await settle();assert.equal(h.posts.at(-1).key,legacyKey,'legacy same-case route retains mount key');
});
test('an unexpected loader rejection reports a diagnostic and path instead of leaving loading',async()=>{
 const a=row('a');a.caseId='aCase';const h=fhirHost([a]);h.focus(a);assert.equal(h.posts.at(-1).loading,true);
 h.loads[0].reject(Error('read failed'));await settle();assert.equal(h.posts.at(-1).loading,false);assert.equal(h.posts.at(-1).q,undefined);assert.equal(h.posts.at(-1).label,'aCase');assert.match(h.posts.at(-1).loadError,/read failed/);assert.equal(h.posts.at(-1).lookedFor,'aCase-directory');
});
