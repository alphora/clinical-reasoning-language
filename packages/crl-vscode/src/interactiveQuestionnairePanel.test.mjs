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
function fixture(){
 const messages=[],sessions=[],panels=[],visibility=[];let receive,revision=1,finishCleanup,failPrepare=false,failAdapter=false,cleanupSafe=true;
 const cleanup=new Promise(resolve=>finishCleanup=resolve);
 const makePanel=()=>{const listeners=[];let disposed=false;const panel={reveal:()=>{},dispose:()=>{if(disposed)return;disposed=true;for(const fn of listeners)fn();},onDidDispose:fn=>listeners.push(fn),webview:{postMessage:m=>messages.push(m),onDidReceiveMessage:f=>{receive=f;return {dispose:()=>{}};},asWebviewUri:()=>({toString:()=>''}),cspSource:'test'}};panels.push(panel);return panel;};
 class Session {
  constructor(definitions){this.definitions=definitions;sessions.push(this);}
  reset(state){this.selected=state.id;this.result=undefined;}
  cancel(){this.cancelled=true;}
  cancelAndWait(){this.cancel();return cleanup;}
  async evaluate(){this.evaluated=true;return {questionnaire:{resourceType:'Questionnaire',id:String(this.definitions.revision)}};}
 }
 const c=vm.createContext({join,randomUUID,InteractiveSession:Session,
  nativeInteractiveRunner:()=>({cleanupSafe:()=>cleanupSafe}),require:()=>{if(failAdapter)throw Error('Adapter unavailable');return {applySession:()=>{}};},
  prepareInteractivePolicy:()=>{if(failPrepare)throw Error('Invalid current definitions');return {definitions:{revision},planId:'plan',initialStates:[{id:'one',label:'One'},{id:'two',label:'Two'}],warnings:[]};},
  interactiveQuestionnaireDependencies:()=>({}),interactiveQuestionnaireHtml:()=>'<main>Actual HTML tested separately</main>',nextQuestionnaireColumn:()=>2,
  vscode:{window:{createWebviewPanel:makePanel},Uri:{joinPath:()=>({})}}});
 vm.runInContext(transformSync(body,{loader:'ts',target:'es2022'}).code,c);
 const api=c.createInteractiveQuestionnairePanel({subscriptions:[],extensionPath:'/synthetic',extensionUri:{}},undefined,undefined,()=>visibility.push(api.isOpen));
 return {api,messages,sessions,panels,visibility,receive:m=>receive(m),token:()=>messages.at(-1).token,finishCleanup,
  revision:v=>revision=v,failPrepare:v=>failPrepare=v,failAdapter:v=>failAdapter=v,cleanupSafe:v=>cleanupSafe=v};
}

test('definition changes freeze evaluation and Restart uses current definitions while retaining the selected initial case',async()=>{
 const f=fixture();f.api.open('policy.cel');await f.receive({type:'ready'});
 await f.receive({type:'select',token:f.token(),id:'two'});f.revision(2);f.api.definitionsChanged('policy.cel');
 await f.receive({type:'start',token:f.token()});assert.ok(!f.sessions.some(s=>s.evaluated));
 const restarted=f.receive({type:'restart',token:f.token()});f.finishCleanup();await restarted;
 assert.equal(f.messages.at(-1).type,'initial');assert.equal(f.messages.at(-1).selectedId,'two');assert.equal(f.sessions.at(-1).definitions.revision,2);
 await f.receive({type:'start',token:f.token()});assert.equal(f.messages.at(-1).questionnaire.id,'2');
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
 assert.equal(f.api.isOpenFor('policy.cel'),true);assert.equal(f.api.isOpenFor('other.cel'),false);assert.equal(f.api.isOpenFor(undefined),false);
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
 const f=fixture();const render=cel=>vm.runInNewContext(code+'\nquestionnaires;',{mode:'medical-validation',views:new Map(),PANE_TITLE:{questionnaire:'Result Questionnaire',fhirQuestionnaire:'FHIR Questionnaire'},interactiveQuestionnaire:f.api,currentCel:cel});
 const button=cel=>render(cel).match(/<button[^>]*data-interactive-questionnaire[^>]*>/)[0];
 assert.match(button('policy.cel'),/aria-pressed="false"/);assert.doesNotMatch(button('policy.cel'),/fc-active/);
 f.api.toggle('policy.cel');assert.match(button('policy.cel'),/fc-active/);assert.match(button('policy.cel'),/aria-pressed="true"/);
 assert.doesNotMatch(button('other.cel'),/fc-active/);assert.match(button('other.cel'),/aria-pressed="false"/);
 f.api.toggle('policy.cel');assert.doesNotMatch(button('policy.cel'),/fc-active/);
});

test('the actual chrome callback waits for retargeting to finish and is inert after disposal',()=>{
 const host=readFileSync(new URL('./correspondenceCockpit.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('host.ts',host,ts.ScriptTarget.Latest,true);
 const root=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='registerCorrespondenceCockpit');
 const fn=root.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='interactivePanelChanged');
 const pending=[],painted=[];let policy='old';
 const c=vm.createContext({queueMicrotask:f=>pending.push(f),cockpitDisposed:false,renderTreeChrome:()=>painted.push(policy)});
 vm.runInContext(transformSync(fn.getText(ast),{loader:'ts',target:'es2022'}).code,c);
 c.interactivePanelChanged();assert.deepEqual(painted,[]);policy='new';pending.shift()();assert.deepEqual(painted,['new']);
 c.interactivePanelChanged();c.cockpitDisposed=true;pending.shift()();assert.deepEqual(painted,['new']);
});
