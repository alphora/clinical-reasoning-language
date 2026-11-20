// REFACTOR:grounded: exercise the actual panel host's retained-form and current-definition restart contract.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {transformSync} from 'esbuild';

const src=ts.createSourceFile('panel.ts',readFileSync(new URL('./interactiveQuestionnairePanel.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const body=src.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name.text==='createInteractiveQuestionnairePanel').getText(src).replace(/^export /,'');
function fixture(hooks,options,initialStates=[{id:'one',label:'One'},{id:'two',label:'Two'}]){
 const messages=[],sessions=[],panels=[],visibility=[],status=[];let receive,revision=1,finishCleanup,failPrepare=false,failAdapter=false,cleanupSafe=true,finishEvaluation,failEvaluation=false,deferEvaluation=false;
 const cleanup=new Promise(resolve=>finishCleanup=resolve);
 const makePanel=()=>{const listeners=[];let disposed=false;const panel={reveal:()=>{},dispose:()=>{if(disposed)return;disposed=true;for(const fn of listeners)fn();},onDidDispose:fn=>listeners.push(fn),webview:{postMessage:m=>messages.push(m),onDidReceiveMessage:f=>{receive=f;return {dispose:()=>{}};},asWebviewUri:()=>({toString:()=>''}),cspSource:'test'}};panels.push(panel);return panel;};
 class Session {
  constructor(definitions){this.definitions=definitions;sessions.push(this);}
  reset(state){this.initial=state;this.selected=state.id;this.result=undefined;}
  resetWithDefaults(state,profiles){this.reset(state);this.profiles=profiles;}
  cancel(){this.cancelled=true;}
  cancelAndWait(){this.cancel();return cleanup;}
  async evaluate(){this.evaluated=true;if(deferEvaluation)await new Promise(resolve=>finishEvaluation=resolve);if(failEvaluation)throw Error('Native failure');return this.result={questionnaire:{resourceType:'Questionnaire',id:String(this.definitions.revision),item:[{linkId:'one',type:'boolean'}]},activities:['Met'],nativeData:{private:'data'},nativeResult:{private:'result'}};}
 }
 const c=vm.createContext({join,randomUUID,InteractiveSession:Session,
  nativeInteractiveRunner:()=>({cleanupSafe:()=>cleanupSafe}),require:()=>{if(failAdapter)throw Error('Adapter unavailable');return {applySession:()=>{}};},
  prepareInteractivePolicy:()=>{if(failPrepare)throw Error('Invalid current definitions');return {definitions:{revision},definitionOrigins:[{kind:'CaseFeature',canonical:'urn:answer'}],planId:'plan',initialStates,warnings:[]};},
  interactiveQuestionnaireDependencies:()=>({}),interactiveQuestionnaireHtml:()=>'<main>Actual HTML tested separately</main>',nextQuestionnaireColumn:()=>2,
  vscode:{window:{createWebviewPanel:makePanel,setStatusBarMessage:m=>status.push(m)},Uri:{joinPath:()=>({})}}});
 vm.runInContext(transformSync(body,{loader:'ts',target:'es2022'}).code,c);
 const api=c.createInteractiveQuestionnairePanel({subscriptions:[],extensionPath:'/synthetic',extensionUri:{}},undefined,undefined,()=>visibility.push(api.isOpen),hooks,options);
 return {api,messages,sessions,panels,visibility,status,receive:m=>receive(m),token:()=>messages.at(-1).token,finishCleanup,
  revision:v=>revision=v,failPrepare:v=>failPrepare=v,failAdapter:v=>failAdapter=v,cleanupSafe:v=>cleanupSafe=v,
  failEvaluation:v=>failEvaluation=v,deferEvaluation:v=>deferEvaluation=v,finishEvaluation:()=>finishEvaluation?.()};
}

const defaultState={id:'row-default:case',label:'Selected row',subject:'Patient/p',bundle:{resourceType:'Bundle'}};
test('Default works with no request folders; definition restart requires a fresh explicit Default',async()=>{
 const f=fixture(undefined,{defaults:{describe:()=>({label:'Row'}),load:()=>({initial:defaultState,current:()=>true})}},[]);
 f.api.open('policy.cel');await f.receive({type:'ready'});assert.equal(f.messages.at(-1).states.length,0);f.finishCleanup();
 await f.receive({type:'default',token:f.token()});assert.equal(f.messages.at(-1).type,'result');
 f.api.definitionsChanged('policy.cel');await f.receive({type:'restart',token:f.token()});assert.equal(f.messages.at(-1).states.length,0);
 await f.receive({type:'default',token:f.token()});assert.equal(f.messages.at(-1).type,'result');
});
test('Default is manual, adopts current row only on success, and publishes native review controls',async()=>{
 let calls=0;const f=fixture(undefined,{defaults:{describe:()=>({label:'Row'}),load:()=>{calls++;return {initial:defaultState,current:()=>true};}}});
 f.api.open('policy.cel');await f.receive({type:'ready'});f.api.defaultsChanged();assert.equal(calls,0);assert.equal(f.messages.at(-1).type,'defaults');
 f.finishCleanup();await f.receive({type:'default',token:f.token()});assert.equal(calls,1);assert.equal(f.messages.at(-1).type,'result');assert.equal(f.messages.at(-1).selectedId,defaultState.id);assert.equal(f.sessions.at(-1).selected,defaultState.id);
 assert.equal(f.messages.at(-1).states.at(-1).label,'Empty assessment — Selected row');assert.equal(f.messages.at(-1).defaulted,true);
 await f.receive({type:'reset',token:f.token()});assert.equal(f.messages.at(-1).emptyAssessment,true);assert.equal(f.messages.at(-1).label,'Empty assessment — Selected row');
 f.api.defaultsChanged();assert.equal(calls,1);assert.equal(f.messages.at(-1).type,'defaults');
});
test('failed or cancelled Default preserves the old evaluation controls, including invalidated verdict state',async()=>{
 for(const cancellation of [false,true]){
  const calls=[];const f=fixture({describe:()=>({questions:[],outcomes:[]}),question:(ctx)=>calls.push(ctx.current()),verdict:()=>calls.push('verdict')},{defaults:{describe:()=>({label:'Row'}),load:()=>({initial:defaultState,current:()=>true})}});
  f.api.open('policy.cel');await f.receive({type:'ready'});await f.receive({type:'start',token:f.token()});const prior=f.messages.at(-1);
  await f.receive({type:'answersChanged',token:f.token(),evaluationId:prior.evaluationId});f.finishCleanup();f.failEvaluation(!cancellation);f.deferEvaluation(cancellation);
  const work=f.receive({type:'default',token:f.token()});await new Promise(resolve=>setImmediate(resolve));
  if(cancellation){await f.receive({type:'cancel',token:f.token()});f.finishEvaluation();}await work;
  await f.receive({type:'questionReviewAction',token:f.token(),evaluationId:prior.evaluationId,linkId:'one',action:'focus'});
  await f.receive({type:'outcomeVerdict',token:f.token(),evaluationId:prior.evaluationId,index:0});assert.deepEqual(calls,[true]);
 }
});
test('row changes during Default discard candidate; a closed panel cannot adopt late results',async()=>{
 for(const close of [false,true]){
  let current=true;const f=fixture(undefined,{defaults:{describe:()=>({label:'Row'}),load:()=>({initial:defaultState,current:()=>current})}});
  f.api.open('policy.cel');await f.receive({type:'ready'});f.finishCleanup();f.deferEvaluation(true);
  const work=f.receive({type:'default',token:f.token()});await new Promise(resolve=>setImmediate(resolve));current=false;if(close)f.api.close();f.finishEvaluation();await work;
  assert.equal(f.messages.filter(m=>m.type==='result').length,0);if(!close)assert.match(f.messages.at(-1).message,/selected row changed/);
 }
});
test('reopened panel waits for controller cleanup, and unsafe cleanup refuses another native run',async()=>{
 const f=fixture(undefined,{defaults:{describe:()=>({label:'Row'}),load:()=>({initial:defaultState,current:()=>true})}});
 f.api.open('one');await f.receive({type:'ready'});f.api.close();f.api.open('two');await f.receive({type:'ready'});
 const work=f.receive({type:'default',token:f.token()});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.sessions.some(s=>s.evaluated),false);
 f.cleanupSafe(false);f.finishCleanup();await work;assert.match(f.messages.at(-1).message,/cleanup was not confirmed/);assert.equal(f.sessions.some(s=>s.evaluated),false);
});

test('definition changes freeze evaluation and Restart uses current definitions while retaining the selected initial case',async()=>{
 const f=fixture();f.api.open('policy.cel');await f.receive({type:'ready'});
 await f.receive({type:'select',token:f.token(),id:'two'});f.revision(2);f.api.definitionsChanged('policy.cel');
 await f.receive({type:'start',token:f.token()});assert.ok(!f.sessions.some(s=>s.evaluated));
 const restarted=f.receive({type:'restart',token:f.token()});f.finishCleanup();await restarted;
 assert.equal(f.messages.at(-1).type,'initial');assert.equal(f.messages.at(-1).selectedId,'two');assert.equal(f.sessions.at(-1).definitions.revision,2);
 await f.receive({type:'start',token:f.token()});assert.equal(f.messages.at(-1).questionnaire.id,'2');
});

test('review actions bind to the actual evaluation and keep native artifacts host-side',async()=>{
 const calls=[];const f=fixture({describe:()=>({questions:[{linkId:'one'}],outcomes:[{label:'To do'}]}),question:(ctx,action,id)=>calls.push([ctx.current(),action,id]),verdict:(ctx,index)=>calls.push([ctx.outcomeCurrent(),'verdict',index])});
 f.api.open('policy.cel');await f.receive({type:'ready'});await f.receive({type:'start',token:f.token()});
 const result=f.messages.at(-1);assert.equal(result.type,'result');assert.ok(result.evaluationId);assert.ok(!('nativeData'in result));assert.ok(!('nativeResult'in result));
 for(const action of ['focus','edit','flag'])await f.receive({type:'questionReviewAction',token:f.token(),evaluationId:result.evaluationId,linkId:'one',action});
 await f.receive({type:'outcomeVerdict',token:f.token(),evaluationId:result.evaluationId,index:0});
 assert.deepEqual(calls,[[true,'focus','one'],[true,'edit','one'],[true,'flag','one'],[true,'verdict',0]]);
 await f.receive({type:'outcomeVerdict',token:f.token(),evaluationId:'old-result',index:0});assert.equal(calls.length,4);
 await f.receive({type:'answersChanged',token:f.token(),evaluationId:result.evaluationId});
 await f.receive({type:'outcomeVerdict',token:f.token(),evaluationId:result.evaluationId,index:0});assert.equal(calls.length,4);
 await f.receive({type:'questionReviewAction',token:f.token(),evaluationId:result.evaluationId,linkId:'one',action:'focus'});assert.equal(calls.length,5,'navigation remains available after answer edits');
});

test('answer edits during a verdict menu invalidate its captured write predicate',async()=>{
 let finish,context,writes=0;const pending=new Promise(resolve=>finish=resolve);
 const f=fixture({describe:()=>({questions:[],outcomes:[{label:'To do'}]}),question:()=>{},verdict:async ctx=>{context=ctx;await pending;if(ctx.outcomeCurrent())writes++;}});
 f.api.open('policy.cel');await f.receive({type:'ready'});await f.receive({type:'start',token:f.token()});const id=f.messages.at(-1).evaluationId;
 const menu=f.receive({type:'outcomeVerdict',token:f.token(),evaluationId:id,index:0});assert.ok(context.outcomeCurrent());
 await f.receive({type:'answersChanged',token:f.token(),evaluationId:id});finish();await menu;assert.equal(writes,0);
 f.api.policyChanged('other.cel');assert.equal(context.current(),false);
});
test('form replacement and manual closure invalidate retained editor controls; ordinary answer edits do not',async()=>{
 for(const transition of ['reset','select','continue','cancel','dispose']){
  let invalidations=0;const f=fixture({describe:()=>({questions:[],outcomes:[]}),question:()=>{},verdict:()=>{},invalidated:()=>invalidations++});
  f.api.open('policy.cel');await f.receive({type:'ready'});await f.receive({type:'start',token:f.token()});const baseline=invalidations,id=f.messages.at(-1).evaluationId;
  await f.receive({type:'answersChanged',token:f.token(),evaluationId:id});assert.equal(invalidations,baseline);
  if(transition==='dispose')f.panels.at(-1).dispose();else await f.receive({type:transition,token:f.token(),id:'two',questionnaire:{resourceType:'Questionnaire'},response:{resourceType:'QuestionnaireResponse'}});
  assert.equal(invalidations,baseline+1,transition);
 }
});
test('review refusal appears once in the current panel, or globally if its captured form was replaced',async()=>{
 for(const invalidated of [false,true]){
  let finish;const pending=new Promise(resolve=>finish=resolve);const f=fixture({describe:()=>({questions:[],outcomes:[{label:'To do'}]}),question:()=>{},verdict:async()=>{await pending;throw new Error('Not applied');}});
  f.api.open('policy.cel');await f.receive({type:'ready'});await f.receive({type:'start',token:f.token()});const id=f.messages.at(-1).evaluationId;
  const action=f.receive({type:'outcomeVerdict',token:f.token(),evaluationId:id,index:0});if(invalidated)f.api.policyChanged('other.cel');finish();await action;
  assert.equal(f.messages.filter(m=>m.type==='reviewError'&&m.message.includes('Not applied')).length,invalidated?0:1);assert.equal(f.status.length,invalidated?1:0);
 }
});

test('a definition revision arriving during native cleanup keeps the retained form stale until a fresh Restart',async()=>{
 const f=fixture();f.api.open('policy.cel');await f.receive({type:'ready'});f.api.definitionsChanged('policy.cel');
 const restart=f.receive({type:'restart',token:f.token()});f.revision(3);f.api.definitionsChanged('policy.cel');
 f.finishCleanup();await restart;assert.equal(f.messages.at(-1).type,'definitionStale');assert.equal(f.sessions.length,1);
 await f.receive({type:'restart',token:f.token()});assert.equal(f.messages.at(-1).type,'initial');assert.equal(f.sessions.at(-1).definitions.revision,3);
});

test('failed preparation or unsafe native cleanup preserves the old form and reports why Restart failed',async()=>{
 const f=fixture();f.api.open('policy.cel');await f.receive({type:'ready'});f.api.definitionsChanged('policy.cel');
 f.failPrepare(true);await f.receive({type:'restart',token:f.token()});assert.equal(f.messages.at(-1).type,'restartError');assert.equal(f.sessions.length,1);
 f.failPrepare(false);f.cleanupSafe(false);f.finishCleanup();await f.receive({type:'restart',token:f.token()});
 assert.match(f.messages.at(-1).message,/cleanup was not confirmed/);assert.equal(f.sessions.length,1);
});

test('a missing adapter becomes an in-panel error instead of throwing from open',async()=>{
 const f=fixture();f.failAdapter(true);assert.doesNotThrow(()=>f.api.open('policy.cel'));await f.receive({type:'ready'});
 assert.equal(f.messages.at(-1).type,'initial');assert.match(f.messages.at(-1).error,/Adapter unavailable/);
});

test('toggle follows actual tab lifetime, refreshes chrome and cancels the closed session',async()=>{
 const f=fixture();assert.equal(f.api.isOpen,false);
 f.api.toggle('policy.cel');assert.equal(f.api.isOpen,true);assert.deepEqual(f.visibility,[true]);
 await f.receive({type:'ready'});const session=f.sessions.at(-1);
 f.api.open('policy.cel');assert.equal(f.panels.length,1);assert.equal(f.api.isOpen,true);
 f.api.toggle('policy.cel');assert.equal(f.api.isOpen,false);assert.ok(session.cancelled);assert.deepEqual(f.visibility,[true,false]);
 f.api.toggle('policy.cel');assert.equal(f.api.isOpen,true);
 f.panels.at(-1).dispose();assert.equal(f.api.isOpen,false);assert.deepEqual(f.visibility,[true,false,true,false]);
 f.api.close();assert.equal(f.visibility.length,4,'already closed is not another visibility change');
 f.api.toggle('policy.cel');f.api.policyChanged('other.cel');assert.equal(f.api.isOpen,false);
});

test('the cockpit uses the live panel state for blue/pressed styling and dispatches toggle',()=>{
 const host=readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8');
 assert.match(host,/interactivePublication,\s*interactivePanelChanged/);
 assert.match(host,/msg\.type==='openInteractiveQuestionnaire'[^\n]+interactiveQuestionnaire\.toggle\(currentCel\)/);
 const ast=ts.createSourceFile('host.ts',host,ts.ScriptTarget.Latest,true);
 const root=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='registerCorrespondenceCockpit');
 const chrome=root.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='buildTreeChromeHtml');
 const declaration=chrome.body.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='questionnaires'));
 const code=transformSync(declaration.getText(ast),{loader:'ts',target:'es2022'}).code;
 const f=fixture();const render=cel=>vm.runInNewContext(code+'\nquestionnaires;',{mode:'medical-validation',views:new Map(),PANE_TITLE:{questionnaire:'Result Questionnaire'},interactiveQuestionnaire:f.api,currentCel:cel});
 const button=cel=>render(cel).match(/<button[^>]*data-interactive-questionnaire[^>]*>/)[0];
 assert.match(button('policy.cel'),/aria-pressed="false"/);assert.doesNotMatch(button('policy.cel'),/fc-active/);
 f.api.toggle('policy.cel');assert.match(button('policy.cel'),/fc-active/);assert.match(button('policy.cel'),/aria-pressed="true"/);
 // The button follows the one open tab. It doesn't invent a separate per-policy open state.
 f.api.toggle('other.cel');assert.doesNotMatch(button('policy.cel'),/fc-active/);assert.equal(f.api.isOpen,false);
});

test('the actual chrome callback waits for retargeting to finish and is inert after disposal',()=>{
 const host=readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('host.ts',host,ts.ScriptTarget.Latest,true);
 const root=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='registerCorrespondenceCockpit');
 const fn=root.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='interactivePanelChanged');
 const pending=[],painted=[],widthRequests=[];let policy='old';
 const c=vm.createContext({queueMicrotask:f=>pending.push(f),cockpitDisposed:false,renderTreeChrome:()=>painted.push(policy),mvPaneLayout:{request:()=>widthRequests.push(policy)}});
 vm.runInContext(transformSync(fn.getText(ast),{loader:'ts',target:'es2022'}).code,c);
 c.interactivePanelChanged();assert.deepEqual(painted,[]);policy='new';pending.shift()();assert.deepEqual(painted,['new']);
 c.interactivePanelChanged();c.cockpitDisposed=true;pending.shift()();assert.deepEqual(painted,['new']);
 assert.deepEqual(widthRequests,['new'],'open/close restores widths only after retargeting, never after disposal');
});
