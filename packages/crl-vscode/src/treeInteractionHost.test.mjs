import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
const source=ts.createSourceFile('cockpit.ts',readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const bodies=new Map();function visit(n){if(ts.isFunctionDeclaration(n)&&['toggleCriterionExpand','navigatePinnedBranch','selectRoutesThroughNode','onWebviewMessage'].includes(n.name?.text))bodies.set(n.name.text,n.getText(source));ts.forEachChild(n,visit);}visit(source);
test('disclosure and result navigation suppress selection pans before their final local focus',()=>{
 const calls=[],tree={gen:1};
 const c=vm.createContext({views:new Map([['tree',tree]]),expandedGuardWhens:new Set(),crlStructure:[],conceptLayer:[],guardOutlines:[],
  buildDefExprResolver:()=>{},answerOptionsForDisplay:()=>{},answersFromTerminologyForDisplay:()=>{},toggleCriterionExpansion:()=>new Set(['criterion']),
  renderPane:(pane,token)=>{tree.gen++;calls.push(['render',pane,token]);},disclosureFocus:undefined,
  state:{selection:{primary:'cel',caseId:'one'}},scrollSuppressPane:undefined,
  dispatch:()=>calls.push(['select',c.scrollSuppressPane]),
  pinnedCards:{token:'pin',epoch:1},indexVersion:1,mode:'medical-validation',branchOrder:()=>[],
  leafRouteNeighbors:()=>({next:{caseId:'two',routeId:'leaf'}}),pinCards:(...args)=>calls.push(['pin',...args]),
 });
 for(const name of ['toggleCriterionExpand','navigatePinnedBranch'])vm.runInContext(transformSync(bodies.get(name),{loader:'ts'}).code,c);
 c.toggleCriterionExpand('criterion','click');assert.deepEqual(calls,[['render','tree','click'],['select','tree']]);assert.equal(c.scrollSuppressPane,undefined);
 calls.length=0;c.navigatePinnedBranch('next','pin');assert.deepEqual(calls,[['select','tree'],['pin','two','leaf','branch-navigation']]);assert.equal(c.scrollSuppressPane,undefined);
});
test('RQ host round-trips each click identity and ignores stale route requests',()=>{
 const messages=[],pane={isOpen:false,open(){this.isOpen=true;},close(){this.isOpen=false;}};
 const tree={gen:2,panel:{webview:{postMessage:m=>messages.push(m)}}};
 const c=vm.createContext({views:new Map([['tree',tree]]),pinnedCards:{token:'route',epoch:1,payload:{}},indexVersion:1,mode:'medical-validation',branchQuestionnaire:pane});
 vm.runInContext(transformSync(bodies.get('onWebviewMessage'),{loader:'ts'}).code,c);
 for(const id of ['click1','click2'])c.onWebviewMessage('tree',{type:'toggleBranchQuestionnaire',gen:2,token:'route',requestId:id});
 assert.deepEqual(messages.map(m=>[m.open,m.focusToken,m.requestId]),[[true,'route','click1'],[false,'route','click2']]);
 c.onWebviewMessage('tree',{type:'toggleBranchQuestionnaire',gen:2,token:'old-route',requestId:'stale'});assert.equal(messages.length,2);
});
test('first-route pinning suppresses the selection pan before constructing its cards',async()=>{
 const calls=[],tree={gen:2};
 const c=vm.createContext({routeSelectionRequest:0,indexVersion:1,mode:'medical-validation',state:{primary:'cel',selection:undefined},views:new Map([['tree',tree]]),scrollSuppressPane:undefined,
  scenarioByCaseId:new Map([['case',{case:{name:'Case'}}]]),routesForCase:()=>[{nodeKeys:['leaf'],terminalId:'route',terminalKind:'Met'}],
  dispatch:e=>{calls.push(c.scrollSuppressPane);c.state.selection=e.selection;},branchQuestionnaire:{close:()=>{}},pinCards:()=>calls.push('cards')});
 vm.runInContext(transformSync(bodies.get('selectRoutesThroughNode'),{loader:'ts'}).code,c);
 await c.selectRoutesThroughNode('leaf','pin',true);assert.deepEqual(calls,['tree','cards']);assert.equal(c.scrollSuppressPane,undefined);
});
