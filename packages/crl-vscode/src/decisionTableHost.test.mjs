// REFACTOR:grounded: execute the production host closures at the row ownership/async boundary.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
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
 let state={index:{crlNav:[]}};const scenarioByCaseId=new Map();const renders=[];const postDecisionTableLayout=()=>{},renderBranchSession=row=>renders.push(row.id);
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
 const flagPlacementFor=()=>({gids:['other']}),snapshotCapture={settleEmpty(){}};const opened=[];
 const toggleFlagActionView=(...args)=>opened.push(args);let branchQuestionnaireOwner=deps.rows[0];`,
 `return{open:openFlagList,table:decisionTable,posts,opened,owner:()=>branchQuestionnaireOwner};`,{rows:[a,b]});
 a.view.anchors={A:{scrollTo:'a'}};await h.open();
 assert.equal(h.table.suspended,true);assert.equal(h.table.sessions.get('a'),a);assert.equal(h.table.sessions.get('b'),b);
 assert.equal(a.pin.payload.cards[0].draftText,'Unsaved current A');assert.equal(b.drafts.get('old case').payload.cards[0].draftText,'Dormant B');assert.equal(h.owner(),a);
 assert.equal(h.posts[0].preserve,true);assert.equal(h.opened.length,1);assert.equal(h.opened[0][3],true);assert.equal(h.opened[0][4],undefined,'one full-tree reveal, no row broadcast');
});
