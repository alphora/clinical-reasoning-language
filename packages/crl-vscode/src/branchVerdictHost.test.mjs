import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {allRouteVerdictsApproved} from './branchVerdict.ts';
const source=ts.createSourceFile('cockpit.ts',readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
let body;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='pinnedVerdictMenu')body=n.getText(source);ts.forEachChild(n,visit);}visit(source);
test('policy completion includes every frozen case, not only the pinned group or painted cases',()=>{
 let overlay;function find(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='driveDoneOverlay')overlay=n.getText(source);ts.forEachChild(n,find);}find(source);
 const messages=[],context=vm.createContext({views:new Map([['tree',{gen:9,leafConcepts:{},panel:{webview:{postMessage:m=>messages.push(m)}}}]]),
  mode:'medical-validation',crlMaps:{},crlStructure:[],scenarios:{scenarios:[{case:{name:'A'}},{case:{name:'B'},status:'error'}]},
  duplicateScenarioNames:new Set(),caseIdByName:{A:'a',B:'b'},reviewByCaseId:{a:'pass',b:'fail',stale:'pending'},scenarioByCaseId:new Map(),
  collectDispositionLeafKeys:()=>new Set(),producedDispositionLeafKeys:()=>[],caseViewKey:c=>c.name,deriveAllPassLeaves:()=>new Set(),
  buildReviewPerCase:()=>[],deriveReviewOverlay:()=>({pass:new Set(),fail:new Set(),pending:new Set(),error:new Set()}),
  segmentsFor:(_tree,keys)=>({segmentIds:keys}),drivePinnedVerdict:()=>{},allRouteVerdictsApproved,
 });
 vm.runInContext(transformSync(overlay,{loader:'ts',target:'es2022'}).code,context);
 const complete=()=>{context.driveDoneOverlay();const m=messages.at(-1);assert.equal(m.type,'markReviewOverlay');assert.equal(m.gen,9);return m.policyRoutesApproved;};
 assert.equal(complete(),false,'settled Fail is not approval');
 context.reviewByCaseId.b='pass';assert.equal(complete(),true,'obsolete stored Pending does not count');
 delete context.reviewByCaseId.b;assert.equal(complete(),false,'unreviewed case outside selected/painted group still blocks');
 context.reviewByCaseId.b='pending';assert.equal(complete(),false);
 context.reviewByCaseId.b='pass';assert.equal(complete(),true);
 context.duplicateScenarioNames.add('B');assert.equal(complete(),false,'ambiguous frozen case cannot borrow stored verdict');
 context.scenarios={scenarios:[]};assert.equal(complete(),false,'empty policy is not completed');
 context.mode='cockpit';context.driveDoneOverlay();assert.equal(messages.at(-1).type,'clearReviewOverlay');
});
test('QR verdict saves refresh paint without route selection or tree reconstruction',async()=>{
 const calls=[],tree={gen:1,panel:{webview:{postMessage:message=>calls.push(['focus',message.type])}}},pin={token:'pin',epoch:1,verdictCaseIds:['a','b']};
 const context=vm.createContext({pinnedCards:pin,views:new Map([['tree',tree]]),mvSidecarPath:'mv.json',mvRevision:0,indexVersion:1,mode:'medical-validation',reviewByCaseId:{},notesByCaseId:{},
  pinnedVerdict:()=>({state:'unreviewed'}),REVIEW_ORDER:['pass'],REVIEW_LABEL:{pass:'Pass'},
  vscode:{window:{showQuickPick:async()=>({state:'pass'})}},setAllReviewState:(_map,ids,state)=>({map:Object.fromEntries(ids.map(id=>[id,state])),changed:true}),
  persistMv:map=>{calls.push(['save',map]);return true;},renderPane:pane=>calls.push(['render',pane]),renderTreeChrome:()=>calls.push(['chrome']),driveDoneOverlay:()=>calls.push(['overlay']),cockpitAgentBridge:{notifyChanged:()=>calls.push(['notify'])},
  dispatch:()=>{throw Error('Route selection must not change after verdict');},
 });
 vm.runInContext(transformSync(body,{loader:'ts',target:'es2022'}).code,context);await context.pinnedVerdictMenu('pin');
 assert.deepEqual(calls,[['focus','routeVerdictFocus'],['save',{a:'pass',b:'pass'}],['render','worklist'],['chrome'],['overlay'],['notify']]);
});
