import { caseReviewReach, criterionReviewMembership, projectCriterionReview } from './criterionReviewProjection.ts';
import { buildReviewPerCase, deriveReviewOverlay, computeCriterionVerdictUpdate, criterionVerdictKey } from './medicalValidationStore.ts';
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
  criterionReviewProjection:()=>({states:{},pass:new Set(),blocked:new Set()}),driveCriterionVerdicts:()=>{},
  leafBucketsFromQuestionnaire:()=>({yesKeys:[]}),questionnaireFor:()=>({questions:[]}),whenKeyResolver:()=>()=>undefined,
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

test('actual verdict-save host paths immediately refresh complete criterion paint and checks, and false-operand menu reach',()=>{
 const texts=[];function collect(n){if(ts.isFunctionDeclaration(n)&&['litNodeKeysForCase','criterionReviewProjection','driveDoneOverlay','driveCriterionVerdicts','applyVerdict','applyCriterionVerdict'].includes(n.name?.text))texts.push(n.getText(source));ts.forEachChild(n,collect);}collect(source);
 const messages=[],nodes={owner:{parent:'',owner:'owner',outline:false,criterion:true},falseOperand:{parent:'owner',owner:'owner',outline:true},input:{parent:'falseOperand',owner:'owner',outline:true}};
 const tree={gen:9,focusNodes:nodes,criterionOccurrences:[{gid:'criterion',occurrenceKey:'owner',lib:'L',name:'C'}],leafConcepts:{},panel:{webview:{postMessage:m=>messages.push(m)}}};
 const live=new Map([[criterionVerdictKey('L','C'),{bodyHash:'hash',elided:false}]]);
 const cases=[{case:{name:'Left'},status:'complete'},{case:{name:'Right'},status:'complete'}];
 const context=vm.createContext({views:new Map([['tree',tree]]),mode:'medical-validation',crlMaps:{},crlStructure:[],scenarios:{scenarios:cases},
  duplicateScenarioNames:new Set(),caseIdByName:{Left:'left',Right:'right'},reviewByCaseId:{},scenarioByCaseId:new Map([['left',cases[0]],['right',cases[1]]]),
  notesByCaseId:{},criterionVerdicts:{},mvSidecarPath:'review.json',state:{},criterionIdentities:live,mvRecoveryBlock:false,mvEditBusy:false,
  guardOutlines:new Map([['owner',{expr:{kind:'criterion',lib:'L',name:'C',bodyHash:'hash',operand:{kind:'leaf',lib:'L',name:'False operand',nodeKey:'concept',isSource:true,isInferred:false}}}]]),
  collectDispositionLeafKeys:()=>new Set(),producedDispositionLeafKeys:()=>[],caseViewKey:c=>c.name,deriveAllPassLeaves:()=>new Set(),
  routesForCase:()=>[{nodeKeys:['owner']}],caseReviewReach,criterionReviewMembership,projectCriterionReview,criterionVerdictKey,
  buildLiveCriterionIdentities:()=>live,reviewDefinitionsCurrent:()=>true,buildReviewPerCase,deriveReviewOverlay,
  leafBucketsFromQuestionnaire:()=>({yesKeys:[]}),questionnaireFor:()=>({questions:[]}),whenKeyResolver:()=>()=>undefined,
  segmentsFor:(_tree,keys)=>({segmentIds:keys}),drivePinnedVerdict:()=>{},allRouteVerdictsApproved,
  isReviewState:s=>['pass','pending','fail','unreviewed'].includes(s),setReviewState:(m,id,s)=>({...m,[id]:s}),
  renderPane:()=>{},renderTreeChrome:()=>{},dispatch:()=>{},computeCriterionVerdictUpdate,
 });
 context.persistMv=(cases,_notes,criteria)=>{context.reviewByCaseId=cases;if(criteria)context.criterionVerdicts=criteria;return true;};
 vm.runInContext(transformSync(texts.join('\n'),{loader:'ts',target:'es2022'}).code,context);
 assert.deepEqual([...context.litNodeKeysForCase('left',cases[0],new Set())].sort(),['falseOperand','input','owner'],'false operand menu sees the same cases as review paint');
 context.applyVerdict('left','pass');
 assert(messages.filter(m=>m.type==='markReviewOverlay').at(-1).pass.includes('owner'),'mixed-verdict owner retains existing green route highlight');
 assert(!messages.filter(m=>m.type==='markReviewOverlay').at(-1).pass.includes('input'),'incomplete body not approved');
 context.applyVerdict('right','pass');
 const overlay=()=>messages.filter(m=>m.type==='markReviewOverlay').at(-1),chips=()=>messages.filter(m=>m.type==='criterionVerdicts').at(-1);
 assert.deepEqual([...overlay().pass].sort(),['falseOperand','input','owner']);assert.deepEqual([...chips().byState.pass],['criterion']);assert.deepEqual([...chips().derivedGids],['criterion']);
 assert.equal(context.applyCriterionVerdict('L','C','pending','hash',false),true);assert(!overlay().pass.includes('input'));assert.deepEqual([...chips().byState.pending],['criterion']);
 assert(overlay().pass.includes('owner'),'recorded Pending holds body approval, preserving existing route highlight');
 context.reviewDefinitionsCurrent=()=>false;context.driveDoneOverlay();assert(overlay().pass.includes('owner'),'definition checking preserves route highlight');assert(!overlay().pass.includes('input'));
 context.reviewDefinitionsCurrent=()=>true;
 assert.equal(context.applyCriterionVerdict('L','C','unreviewed','hash',false),true);assert(overlay().pass.includes('input'));
 context.applyVerdict('right','fail');assert(!overlay().pass.includes('input'));assert(!overlay().fail.includes('input'),'a failing case does not newly wash the whole body red');assert.deepEqual([...chips().byState.pass],[]);
 context.applyVerdict('left','pending');assert(!overlay().pending.includes('input'),'pending does not newly wash the whole body amber');
 assert.equal(context.applyCriterionVerdict('L','C','pass','hash',false),true);assert(overlay().pass.includes('input'));assert.deepEqual([...chips().derivedGids],[]);
 delete context.criterionVerdicts[criterionVerdictKey('L','C')];cases[1].status='error';context.applyVerdict('right','pass');
 assert.deepEqual([...overlay().error],['owner']);assert(overlay().pass.includes('owner'),'error remains a pass vote whose paint is overridden');
 assert.deepEqual([...chips().byState.pass],[],'errored owner cannot check its criterion');assert(!overlay().pass.includes('input'));
 context.crlMaps=undefined;context.driveDoneOverlay();assert.equal(messages.filter(m=>m.type==='clearReviewOverlay').length,1);
 assert.deepEqual([...chips().byState.pass],[],'incomplete model teardown clears checks');
});
