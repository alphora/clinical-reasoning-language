import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {buildSuiteExecutionModel,resolveCelSuite,emitCrlBundle,emitCelSuite,buildProducerInputs,nodeKey,conceptDeclRef} from '@smile-digital-health/crl';
import {applySession} from '@smile-digital-health/crl/session';
import {readInteractiveResult} from './interactiveQuestionnaire.ts';
import {pinnedMovePlans,movedOccurrenceKey} from './pinnedMove.ts';
import {executionRoutes} from './executionRoutes.ts';
import {treeTraversal} from './unpinnedTreeFocus.ts';
import {renderFlowPane} from './flowPaneHtml.ts';
import {prepareStructuralSave,validateStructuralCandidate,structuralEditsPending} from './structureEditing.ts';
import {loadSidecar,saveSidecar} from './medicalValidationStore.ts';
import {qaFixture} from './qaFlagEditingFixture.mjs';

function fixture(compound=false){
 const f=qaFixture();
 const extra=f.source.slice(f.source.indexOf('concept'),f.source.indexOf('presentation')).replace('concept "Q"','concept "R"').replace('`q`','`r`');
 const src=f.source.replace('library "L".','library "L". include "Terms".')+'\n'+extra+'\npresentation for "R": - question text is "R?".\nactivity "Met": - request CPGTaskRequest.\nactivity "Unmet": - request CPGTaskRequest.\n'+(compound?'criterion "C": - when ("Q" and "R").\ndecision "D":\nfirst:\n- when "C" then recommend activity "Met".\n- otherwise then recommend activity "Unmet".\n':'decision "D":\nfirst:\n- when "Q" then recommend activity "Met".\n- when "R" then recommend activity "Met".\n- otherwise then recommend activity "Unmet".\n');
 writeFileSync(f.policy,src);const dir=join(f.root,'src/cel/mv');mkdirSync(dir,{recursive:true});
 writeFileSync(join(dir,'cases.cel'),'library "Cases". covers "L".\nfact "P": - defined by "Patient". - name is "Synthetic". - birth date is "1970-01-01".\nfact "Q": - defined by "L"."Q". - value is "'+(compound?'yes':'no')+'". - date is "2026-10-09".\nfact "R": - defined by "L"."R". - value is "yes". - date is "2026-10-09".\ncase "Selected": - subject is "P". - fact is "Q". - fact is "R". - result is "D" is "Met".\n');
 const model=()=>{const selected=resolveCelSuite(f.root);assert.equal(selected.ok,true);return buildSuiteExecutionModel(selected.suite);};
 const view=()=>{
  const m=model(),sv=m.scenarios.scenarios[0],structure=m.crlStructure,rows=[];
  const walk=ns=>{for(const n of ns){rows.push(n);walk(n.children);}};for(const d of structure)walk(d.children);
  const route=executionRoutes(sv,structure)[0],resolve=id=>rows.find(r=>r.nodeId===id)?.nodeKey;
  const traversal=treeTraversal('case',sv,route,resolve),nodes=Object.fromEntries(rows.map(r=>[r.nodeKey,{owner:r.nodeKey,outline:false,terminal:r.kind==='action',choice:false}]));
  return {structure,route,traversal,nodes,rows,sources:new Map([[f.policy,readFileSync(f.policy,'utf8')]]),model:m,key:id=>resolve(id)};
 };
 return {...f,src,view,sidecar:join(f.root,'src/medical-validation/reviews.json')};
}

test('pinned No-path moves keep the exact Met occurrence and support a second click',()=>{
 const f=fixture();try{
  let v=f.view(),key=v.key('when[0]');
  const plan=pinnedMovePlans(f.root,v.sources,v.structure,v.nodes,v.traversal,v.route.nodeKeys,key).down;
  assert.ok(plan);assert.equal(plan.oldAnchorKey,v.key('when[1]/action[0]'));
  validateStructuralCandidate(f.root,f.policy,plan.file,plan.after);writeFileSync(plan.file,plan.after);v=f.view();
  const anchor=movedOccurrenceKey(v.structure,plan.anchor),focus=movedOccurrenceKey(v.structure,plan.focus);
  assert.ok(v.route.nodeKeys.includes(anchor));assert.equal(v.route.nodeKeys.at(-1),anchor);
  assert.notEqual(anchor,v.key('when[0]/when[0]/action[0]'),'same-label off-path Met is not selected');
  const next=pinnedMovePlans(f.root,v.sources,v.structure,v.nodes,v.traversal,v.route.nodeKeys,focus).up;assert.ok(next);
  writeFileSync(next.file,next.after);v=f.view();assert.equal(movedOccurrenceKey(v.structure,next.focus),v.key('when[0]'));
 }finally{f.close();}
});

test('only pinned authored operands move; computed inputs and unpinned rows have no arrows',()=>{
 const f=fixture(true);try{
  const v=f.view(),owner=v.key('when[0]'),key='operand-Q';
  v.nodes[key]={owner,outline:true,terminal:false,choice:false,path:'0.0'};
  const keys=[...v.route.nodeKeys,key];
  const plan=pinnedMovePlans(f.root,v.sources,v.structure,v.nodes,v.traversal,keys,key).down;assert.ok(plan);assert.equal(plan.focus.path,'0.1');
  assert.deepEqual(pinnedMovePlans(f.root,v.sources,v.structure,v.nodes,v.traversal,v.route.nodeKeys,key),{});
  for(const path of ['0.0.c.0','0.inputs.0']){v.nodes[key].path=path;assert.deepEqual(pinnedMovePlans(f.root,v.sources,v.structure,v.nodes,v.traversal,keys,key),{});}
 }finally{f.close();}
});

test('nested criterion paths retain their boundary and repeated concepts retain occurrence identity',()=>{
 const f=fixture(true);try{
  writeFileSync(f.policy,f.src.replace('decision "D":','criterion "Outer": - when ("Q" and "C").\ndecision "D":').replace('- when "C" then','- when "Outer" then'));
  const v=f.view(),owner=v.key('when[0]'),key='second-Q';v.nodes[key]={owner,outline:true,terminal:false,choice:false,path:'0.1.b.0'};
  const plan=pinnedMovePlans(f.root,v.sources,v.structure,v.nodes,v.traversal,[...v.route.nodeKeys,key],key).down;
  assert.ok(plan);assert.equal(plan.focus.path,'0.1.b.1');validateStructuralCandidate(f.root,f.policy,plan.file,plan.after);
 }finally{f.close();}
});

test('a displayed single-input question moves its transparent predicate, preserving its input address',()=>{
 const f=fixture(true);try{
  writeFileSync(f.policy,f.src.replace('criterion "C":','concept "Qualified Q": - shape is Record. - type is Observation. - value type is boolean. - shape reduction is most recent. - definition is "Q" in qualifying.\ncriterion "C":').replace('("Q" and "R")','("Qualified Q" and "R")'));
  const v=f.view(),m=v.model,owner=v.key('when[0]');
  const nodes=renderFlowPane(v.structure,{concepts:m.conceptLayer,defExpr:(lib,name)=>m.defExpr.get(nodeKey(conceptDeclRef(lib,name))),guardOutlines:m.guardOutlines,expandedGuardWhens:new Set([owner])}).focusNodes;
  const entries=Object.entries(nodes),[key,question]=entries.find(([,n])=>n.question&&n.outline&&n.concept?.[1]==='Q');
  assert.equal(question.path,'0.0.inputs.0');assert.ok(entries.some(([,n])=>n.owner===owner&&n.path==='0.0'&&n.singleInputPredicate));
  const plan=pinnedMovePlans(f.root,v.sources,v.structure,nodes,v.traversal,[...v.route.nodeKeys,key],key).down;
  assert.ok(plan);assert.equal(plan.focus.path,'0.1.inputs.0');validateStructuralCandidate(f.root,f.policy,plan.file,plan.after);
  nodes['other-input']={...question,path:'0.0.inputs.1',concept:['L','R']};assert.deepEqual(pinnedMovePlans(f.root,v.sources,v.structure,nodes,v.traversal,[...v.route.nodeKeys,key],key),{},'a computed input cannot move other questions with it');delete nodes['other-input'];
  writeFileSync(plan.file,plan.after);const after=f.view(),next=after.model;
  const nextNodes=renderFlowPane(after.structure,{concepts:next.conceptLayer,defExpr:(lib,name)=>next.defExpr.get(nodeKey(conceptDeclRef(lib,name))),guardOutlines:next.guardOutlines,expandedGuardWhens:new Set([after.key('when[0]')])}).focusNodes;
  assert.equal(Object.values(nextNodes).find(n=>n.question&&n.outline&&n.concept?.[1]==='Q').path,plan.focus.path);
 }finally{f.close();}
});

test.skipIf(process.env.CRL_STRUCTURE_NATIVE!=='1')('native apply of a No-path move retains one Met and asks the moved-first question',async()=>{
 const f=fixture();try{
  async function native(empty){
   const emitted=emitCrlBundle(f.policy,{date:'2026-10-09',capability:'publishable'});assert.equal(emitted.success,true,JSON.stringify(emitted.hardErrors));
   const suite=resolveCelSuite(f.root),inputs=buildProducerInputs(emitCelSuite(suite.suite,new Date('2026-10-09T00:00:00Z')).result);assert.deepEqual(inputs.diagnostics,[]);
   const input=inputs.inputs[0],pd=emitted.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='PlanDefinition'&&r.type?.coding?.some(c=>c.code==='workflow-definition'));
   const engine=process.env.CRL_STRUCTURE_JAR,outDir=join(f.root,'native-'+(empty?'empty':'answered')+'-'+Date.now());
   const resources=empty?input.resources.filter(r=>r.body.resourceType==='Patient'):input.resources;
   const result=await applySession({schemaVersion:1,requestId:'move',caseId:'case',stepId:'step',planDefinitionId:pd.id,subjectReference:input.subjectReference,repositoryJson:JSON.stringify(emitted.bundle),requestDataJson:JSON.stringify({resourceType:'Bundle',type:'collection',entry:resources.map(r=>({resource:r.body}))}),...(engine?{engine:{path:engine,sha256:createHash('sha256').update(readFileSync(engine)).digest('hex')}}:{})},{outDir,limits:{maxHeapMb:512,timeoutMs:120000}});
   assert.equal(result.ok,true,JSON.stringify(result));return readInteractiveResult(JSON.parse(readFileSync(result.artifacts['native-result.json'].path,'utf8')));
  }
  const before=await native(false),v=f.view(),plan=pinnedMovePlans(f.root,v.sources,v.structure,v.nodes,v.traversal,v.route.nodeKeys,v.key('when[0]')).down;
  writeFileSync(plan.file,plan.after);const after=await native(false);assert.equal(before.activities.length,1);assert.deepEqual(after.activities,before.activities);
  const blank=await native(true);assert.equal(blank.activities.length,0);assert.match(JSON.stringify(blank.questionnaire),/R\?/);assert.doesNotMatch(JSON.stringify(blank.questionnaire),/Authored question\?/);
 }finally{f.close();}
},300000);

const host=ts.createSourceFile('cockpit.ts',readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true),functions=new Map();
function visit(n){if(ts.isFunctionDeclaration(n)&&['focusPinnedMove','movePinnedItem','restorePinnedMoveFocus'].includes(n.name?.text))functions.set(n.name.text,n.getText(host));ts.forEachChild(n,visit);}visit(host);
function hostFixture(f){
 let v=f.view();const messages=[],warnings=[];let edited,saves=0,scheduled=0;
 const view={gen:1,focusNodes:v.nodes,panel:{webview:{postMessage:m=>messages.push(m)}}};
 const pin=()=>({token:'pin-'+view.gen,epoch:view.gen,caseId:'case',payload:{cards:[],pathNodeKeys:v.route.nodeKeys,showQuestions:true},traversal:v.traversal});
 const doc={uri:{fsPath:f.policy},isDirty:false,getText:()=>readFileSync(f.policy,'utf8').replace(/^\uFEFF/,''),positionAt:n=>n,save:async()=>{saves++;writeFileSync(f.policy,edited);return true;}};
 class WorkspaceEdit{replace(_uri,_range,text){edited=text;}}
 const c=vm.createContext({Error,readFileSync,resolveCelSuite,pinnedMovePlans,movedOccurrenceKey,validateStructuralCandidate,prepareStructuralSave,clearTimeout,
  views:new Map([['tree',view]]),pinnedCards:pin(),focusedMove:undefined,indexVersion:1,currentCel:f.root,mode:'medical-validation',mvEditBusy:false,mvSidecarPath:f.sidecar,debounce:undefined,mvDeferredRebuild:false,
  assertMvWriteAllowed:()=>{},reloadPublishedReviewSidecar:()=>{},markDefinitionsUnverified:()=>{},snapshotCapture:{settleEmpty:()=>{}},renderTreeChrome:()=>{},scheduleRebuild:()=>{scheduled++;},moveSources:v.sources,
  crlStructure:v.structure,routesForCase:()=>[v.route],
  rebuild:()=>{v=f.view();view.gen++;view.focusNodes=v.nodes;c.crlStructure=v.structure;c.moveSources=v.sources;c.indexVersion=view.gen;c.pinnedCards=undefined;},
  pinCards:(_case,terminal,_focus,show)=>{assert.equal(terminal,v.route.terminalId);assert.equal(show,true);c.pinnedCards=pin();},
  vscode:{Uri:{file:fsPath=>({fsPath})},WorkspaceEdit,Range:class{},workspace:{openTextDocument:async()=>doc,applyEdit:async()=>true},commands:{executeCommand:async()=>{}},window:{showWarningMessage:m=>warnings.push(m)}}
 });
 for(const text of functions.values())vm.runInContext(transformSync(text,{loader:'ts'}).code,c);
 return {c,view,messages,warnings,get saves(){return saves;},get scheduled(){return scheduled;},get v(){return v;}};
}
test('actual inline host writes CRL, rebuilds, restores pin/focus, and moves again without a dialog',async()=>{
 const f=fixture();try{
  saveSidecar(f.sidecar,{schemaVersion:2,byCaseId:{approved:'pass',failed:'fail'},notesByCaseId:{approved:[{id:'note',text:'Keep',created:1}]}});
  const h=hostFixture(f),first=h.c.pinnedCards,key=h.v.key('when[0]');
  h.c.focusPinnedMove({token:first.token,key});assert.equal(h.messages.at(-1).down,true);
  await h.c.movePinnedItem({token:first.token,key,dir:'down'});
  assert.equal(h.saves,1);assert.deepEqual(h.warnings,[]);assert.equal(structuralEditsPending(f.root),true);
  const state=loadSidecar(f.sidecar).sidecar;assert.equal(state.byCaseId.approved,'pending');assert.equal(state.byCaseId.failed,'fail');assert.equal(state.notesByCaseId.approved[0].text,'Keep');
  const restored=h.messages.findLast(m=>m.type==='pinnedMoveRestore');assert.ok(restored);assert.notEqual(h.c.pinnedCards.token,first.token);
  h.c.focusPinnedMove(restored);assert.equal(h.messages.at(-1).up,true);
  await h.c.movePinnedItem({...restored,dir:'up'});assert.equal(h.saves,2);assert.deepEqual(h.warnings,[]);
  assert.equal(h.messages.findLast(m=>m.type==='pinnedMoveRestore').key,h.v.key('when[0]'));
  await h.c.movePinnedItem({token:first.token,key,dir:'down'});assert.equal(h.saves,2,'stale token cannot move');
 }finally{f.close();}
});
test('inline host refuses changed source and reports a saved move if unique pin restoration fails',async()=>{
 for(const changed of [true,false]){
  const f=fixture();try{
   const h=hostFixture(f),key=h.v.key('when[0]'),token=h.c.pinnedCards.token;h.c.focusPinnedMove({key,token});
   if(changed)writeFileSync(f.policy,f.src+'\n// later edit\n');else h.c.routesForCase=()=>[];
   await h.c.movePinnedItem({key,token,dir:'down'});
   assert.equal(h.saves,changed?0:1);assert.match(h.warnings[0],changed?/CRL changed/:/Move saved.*Pin the branch again/);
   if(!changed)assert.equal(h.c.pinnedCards,undefined,'never pins an unrelated same-label result');
  }finally{f.close();}
 }
});

test('source changed before focus cannot bind the displayed positional ID to a different test',async()=>{
 const f=fixture();try{
  const h=hostFixture(f),key=h.v.key('when[0]'),token=h.c.pinnedCards.token;
  writeFileSync(f.policy,f.src.replace('- when "Q" then','- when "R" then').replace('- when "R" then recommend activity "Met".\n- otherwise','- when "Q" then recommend activity "Met".\n- otherwise'));
  h.c.focusPinnedMove({key,token});assert.equal(h.c.focusedMove,undefined);assert.equal(h.messages.at(-1).down,false);assert.equal(h.scheduled,1);
  await h.c.movePinnedItem({key,token,dir:'down'});assert.equal(h.saves,0);
 }finally{f.close();}
});
