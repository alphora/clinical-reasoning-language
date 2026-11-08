// Execute the production row-paint closure and render its messages through actual table row runtimes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { buildReviewPerCase, deriveReviewOverlay } from './medicalValidationStore.ts';
import { caseReviewReach } from './criterionReviewProjection.ts';
import { createRouteReviewMatcher } from './routeReviewMatch.ts';
import { allRouteVerdictsApproved } from './branchVerdict.ts';
import { buildDecisionTable } from './decisionTableModel.ts';
import { renderFlowPane, FLOW_STYLE } from './flowPaneHtml.ts';
import { COCKPIT_WEBVIEW_SCRIPT } from './correspondenceCockpit.ts';
import { installDecisionTableWebview, captureDecisionTable, DECISION_TABLE_STYLE } from './decisionTableWebview.ts';
import { browserExecutable, browserFixture } from '../test/browserHarness.mjs';

const source=ts.createSourceFile('cockpit.ts',readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const closures=[];function collect(node){if(ts.isFunctionDeclaration(node)&&['paintBranchSession','segmentsFor'].includes(node.name?.text))closures.push(node.getText(source));ts.forEachChild(node,collect);}collect(source);
assert.equal(closures.length,2);
const leaf=key=>({nodeKey:key,nodeId:key,kind:'action',actionKind:'recommend-activity',label:key,lib:'L',decision:'D',refKeys:['activity:'+key],location:{},children:[]});
const branch=(key,children)=>({nodeKey:key,nodeId:key,kind:'when',label:key,lib:'L',decision:'D',refKeys:[],location:{},children,childrenQualifier:'first'});
const structure=[{nodeKey:'node1',lib:'L',decision:'D',location:{},childrenQualifier:'first',children:[branch('node2',[leaf('node3'),leaf('node4')]),branch('node5',[leaf('node6')])]}];
const paths={a:['node1','node2','node3'],b:['node1','node2','node4'],c:['node1','node5','node6']};
function fixture(conditional=false){
 const shape=conditional?[{...structure[0],nodeKey:'D',children:[branch('node1',[branch('node2',[leaf('node3'),leaf('node4')])]),branch('node5',[leaf('node6')])]}]:structure;
 const entries=Object.entries(paths).map(([caseId,nodeKeys])=>({caseId,route:{nodeKeys:conditional?['D',...nodeKeys]:nodeKeys,nodeIds:nodeKeys.slice(1),terminalId:nodeKeys.at(-1),terminalKind:'produced',gaps:[]}}));
 const model=buildDecisionTable(shape,entries,{nodeKey:shape[0].nodeKey}),posts=[],states={},leaves=new Set(['node3','node4','node6']);
 const cases=entries.map(entry=>({case:{name:entry.caseId},status:'pass'}));
 const renders=Object.fromEntries(Object.keys(paths).map(id=>[id,renderFlowPane(shape,{concepts:[],revealPrefix:id+'_',expandedGuardWhens:new Set()})]));
 const sessions=Object.fromEntries(entries.map((entry,index)=>{const rendered=renders[entry.caseId];return [entry.caseId,{id:entry.caseId,mounted:true,view:{...rendered,gen:index+1},row:model.rows().find(row=>row.terminalKey===entry.route.terminalId)}];}));
 const projection={pass:new Set(),blocked:new Set()};
 const context=vm.createContext({buildReviewPerCase,deriveReviewOverlay,caseReviewReach,allRouteVerdictsApproved,createRouteReviewMatcher,
  branchSessionCurrent:session=>session.mounted,postBranch:(session,message)=>posts.push({rowId:session.id,message}),
  collectDispositionLeafKeys:()=>leaves,crlStructure:shape,scenarioByCaseId:new Map(cases.map(sc=>[sc.case.name,sc])),reviewByCaseId:states,
  routesForCase:id=>entries.filter(entry=>entry.caseId===id).map(entry=>entry.route),criterionReviewProjection:()=>projection,driveCriterionVerdicts:()=>{},
  flagPlacementFor:()=>({byGid:new Map(),gids:[],unplaced:[]}),flagsList:[],summarizeFlagBadges:()=>[],isOpen:()=>true,
  decisionTable:{model},scenarios:{scenarios:cases},caseIdByName:{a:'a',b:'b',c:'c'},caseViewKey:entry=>entry.name,duplicateScenarioNames:new Set(),flagStateError:undefined});
 vm.runInContext(ts.transpileModule(closures.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
 const paint=(ids=Object.keys(sessions))=>{posts.length=0;for(const id of ids)context.paintBranchSession(sessions[id]);return posts;};
 const overlay=id=>posts.findLast(post=>post.rowId===id&&post.message.type==='markReviewOverlay').message;
 const keys=(id,state)=>Object.keys(renders[id].anchors).filter(key=>paths[id].includes(key)&&renders[id].anchors[key].segmentIds.some(gid=>overlay(id)[state].includes(gid))).sort();
 return {context,states,sessions,renders,model,entries,projection,posts,paint,overlay,keys};
}

test('shares reviewed ancestors before the pin across applicable rows, preserving pass over fail on interiors',()=>{
 const h=fixture();h.states.a='pass';h.paint();
 assert.deepEqual(h.keys('a','pass'),['node1','node2','node3']);assert.deepEqual(h.keys('b','pass'),['node1','node2']);assert.deepEqual(h.keys('c','pass'),['node1']);
 h.states.b='fail';h.paint();
 assert.deepEqual(h.keys('a','pass'),['node1','node2','node3']);assert.deepEqual(h.keys('b','pass'),['node1','node2']);assert.deepEqual(h.keys('b','fail'),['node4']);assert.deepEqual(h.keys('c','pass'),['node1']);assert.deepEqual(h.keys('c','fail'),[]);
 const scoped=buildDecisionTable(structure,h.entries,{nodeKey:'node2'});
 assert(scoped.rows().every(row=>row.pathKeys[0]==='node1'),'left-of-pin ancestors are part of modeled row identity');
});
test('pending, clear, off-page voters and obsolete/ambiguous case identities obey the existing fold',()=>{
 const h=fixture();h.states.a='pass';h.states.b='pending';h.paint(['b','c']);
 assert.deepEqual(h.keys('b','pass'),['node1','node2'],'off-page pass still votes');assert.deepEqual(h.keys('b','pending'),['node4']);
 delete h.states.a;h.paint();assert.deepEqual(h.keys('b','pass'),[]);assert.deepEqual(h.keys('c','pending'),['node1']);assert.deepEqual(h.keys('a','pending'),['node1','node2']);
 h.states.a='pass';h.context.scenarioByCaseId.delete('a');h.states.obsolete='pass';h.context.routesForCase=id=>[{nodeKeys:id==='b'?paths.b:['node1','node5','node6']}];h.paint();
 assert.deepEqual(h.keys('c','pass'),[],'absent/ambiguous frozen cases cannot vote even with stale routes');
});
test('shares the same node only for matching outgoing branches, including two different continuations on the left',()=>{
 const h=fixture(true);h.states.a='pass';h.paint();
 assert.deepEqual(h.keys('a','pass'),['node1','node2','node3']);assert.deepEqual(h.keys('b','pass'),['node1','node2']);assert.deepEqual(h.keys('c','pass'),[],'the right-taking copy of node1 must stay unreviewed');
 h.states.b='fail';h.paint();assert.deepEqual(h.keys('b','pass'),['node1','node2']);assert.deepEqual(h.keys('b','fail'),['node4']);assert.deepEqual(h.keys('c','pass'),[]);assert.deepEqual(h.keys('c','fail'),[]);
});
test('terminal verdicts and all-pass badges stay row-local even when terminal node identities repeat',()=>{
 const h=fixture();h.states.a='pass';h.states.b='fail';
 h.sessions.b.row={...h.sessions.b.row,terminalKey:'node3',pathKeys:paths.a};h.paint();
 const node3=h.renders.b.anchors.node3.segmentIds;
 assert(node3.every(gid=>h.overlay('b').fail.includes(gid)));assert(node3.every(gid=>!h.overlay('b').pass.includes(gid)));assert.deepEqual([...h.overlay('b').allPassLeaves],[]);
});
test('uncovered rows retain coverage errors and shared execution-error overlays without borrowing terminal approval',()=>{
 const h=fixture();h.states.a='pass';h.context.scenarioByCaseId.get('a').status='error';
 h.sessions.b.row={...h.sessions.b.row,cases:[],error:'Coverage error'};h.paint();
 assert.deepEqual(h.keys('b','error'),['node1','node2','node4']);assert.deepEqual(h.keys('b','pass'),['node1','node2']);
 assert(!h.overlay('b').pass.includes(h.renders.b.anchors.node4.segmentIds[0]));assert.deepEqual([...h.overlay('b').allPassLeaves],[]);
});
test('body approval still respects the existing criterion projection and its blockers',()=>{
 const h=fixture();h.states.a='pass';h.sessions.b.view.focusNodes.node2={...h.sessions.b.view.focusNodes.node2,outline:true};
 h.projection.blocked.add('node2');h.paint();assert.deepEqual(h.keys('b','pass'),['node1']);
 h.projection.blocked.clear();h.projection.pass.add('node2');h.paint();assert.deepEqual(h.keys('b','pass'),['node1','node2']);
});

test.skipIf(!browserExecutable).each([false,true])('actual row runtimes paint only matching branches, failed terminals and clearing (conditional=%s)',async conditional=>{
 const h=fixture(conditional);h.states.a='pass';
 const script=COCKPIT_WEBVIEW_SCRIPT+`globalThis.tableUi=(${installDecisionTableWebview.toString()})(document.getElementById('root'),crlCockpitBridge,globalThis.installCrlCockpitRuntime,(${captureDecisionTable.toString()}),[]);`;
 const browser=await browserFixture(`<!doctype html><html><head><style>body{background:#1e1e1e;color:#ddd}${FLOW_STYLE}${DECISION_TABLE_STYLE}</style></head><body><div id="fcChrome"></div><div id="root"></div><div id="flagDrawer"></div><script>window.acquireVsCodeApi=()=>({postMessage(){}});${script.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);
 try{
  const send=data=>browser.evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(data)}}))`);
  await send({type:'decisionTable',epoch:1,label:'Verdicts',total:'3',range:'1–3',rows:Object.keys(h.sessions).map(id=>({id,label:id,caseCount:1}))});
  for(const id of Object.keys(h.sessions)){
   await send({type:'decisionTableRow',epoch:1,rowId:id,message:{type:'render',gen:h.sessions[id].view.gen,indexVersion:1,mode:'medical-validation',html:h.renders[id].html}});
   await send({type:'decisionTableRow',epoch:1,rowId:id,message:{type:'modeledBranch',gen:h.sessions[id].view.gen,token:id,pinKey:paths[id].at(-1),routeKeys:h.sessions[id].row.pathKeys,label:id}});
  }
  const repaint=async()=>{for(const post of h.paint())if(post.message.type==='markReviewOverlay')await send({type:'decisionTableRow',epoch:1,rowId:post.rowId,message:post.message});};
  const painted=(id,key,state)=>browser.evaluate(`document.getElementById(${JSON.stringify(h.renders[id].anchors[key].segmentIds[0])}).classList.contains(${JSON.stringify('review-'+state)})`);
  await repaint();assert.equal(await painted('b','node1','pass'),true);assert.equal(await painted('b','node2','pass'),true);assert.equal(await painted('c','node1','pass'),!conditional);assert.equal(await painted('c','node5','pass'),false);
  h.states.b='fail';await repaint();assert.equal(await painted('b','node2','pass'),true);assert.equal(await painted('b','node4','fail'),true);
  const fills=await browser.evaluate(`['a','b','c'].map(id=>getComputedStyle(document.getElementById(({a:${JSON.stringify(h.renders.a.anchors.node1.segmentIds[0])},b:${JSON.stringify(h.renders.b.anchors.node1.segmentIds[0])},c:${JSON.stringify(h.renders.c.anchors.node1.segmentIds[0])}})[id]).querySelector('rect')).fill)`);
  assert.equal(fills[0],fills[1],'same outgoing branch has the same green fill');
  if(conditional)assert.notEqual(fills[0],fills[2],'opposite outgoing branch stays neutral');else assert.equal(new Set(fills).size,1,'unconditional shared nodes retain the same green fill');
  delete h.states.a;delete h.states.b;await repaint();assert.equal(await painted('b','node1','pass'),false);assert.equal(await painted('b','node4','fail'),false);
  h.states.a='pass';h.context.scenarioByCaseId.get('a').status='error';h.sessions.b.row={...h.sessions.b.row,cases:[],error:'Coverage error'};await repaint();
  const errors=await browser.evaluate(`${JSON.stringify([h.renders.b.anchors.node1.segmentIds[0],h.renders.b.anchors.node4.segmentIds[0]])}.map(id=>{const e=document.getElementById(id);return [e.classList.contains('error-node'),e.classList.contains('review-pass'),e.classList.contains('leaf-allpass')];})`);
  assert.deepEqual(errors,[[true,false,false],[true,false,false]],'shared execution error and uncovered terminal both remain visible');
 }finally{await browser.close();}
},90000);
