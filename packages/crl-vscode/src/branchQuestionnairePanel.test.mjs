import assert from 'node:assert/strict';
import { vi } from 'vitest';
vi.mock('vscode',()=>{
 const panels=[];
 return {ViewColumn:{Beside:-2},__panels:panels,window:{createWebviewPanel:(type,title,column,options)=>{
  const panel={type,title,column,options,posts:[],disposed:false,
   webview:{html:'',onDidReceiveMessage(fn){panel.receive=fn;return{dispose(){}};},postMessage(m){panel.posts.push(m);return Promise.resolve(true);}},
   onDidDispose(fn){panel.didDispose=fn;return{dispose(){}};},dispose(){panel.disposed=true;panel.didDispose?.();}};
  panels.push(panel);return panel;
 }}};
});
const vscode=await import('vscode');
const {createBranchQuestionnairePanel,nextQuestionnaireColumn}=await import('./branchQuestionnairePanel.ts');
test('new questionnaires open beyond existing editor groups',()=>{
 vscode.window.tabGroups={all:[{viewColumn:1},{viewColumn:3}]};
 assert.equal(nextQuestionnaireColumn(),4);
 vscode.window.tabGroups.all=[{viewColumn:9}];
 assert.equal(nextQuestionnaireColumn(),9);
 delete vscode.window.tabGroups;
 assert.equal(nextQuestionnaireColumn(),-2);
});
test('pane handshake replays newest branch and stale panels cannot write or close replacements',()=>{
 const messages=[];let closes=0;const pane=createBranchQuestionnairePanel(m=>messages.push(m),()=>closes++);
 pane.open({token:'one',cards:[]});const old=vscode.__panels.at(-1);
 assert.match(old.title,/Result Questionnaire/);assert.equal(old.column.viewColumn,-2);assert.equal(old.options.retainContextWhenHidden,true);
 pane.update({token:'two',cards:[{id:'new'}]});assert.equal(old.posts.length,0);
 old.receive({type:'ready',gen:1});assert.equal(old.posts.at(-1).token,'two');
 old.receive({type:'routeCardProposal',token:'one',gen:1});assert.equal(messages.length,0);
 old.receive({type:'routeCardDraft',token:'two',gen:1});assert.equal(messages.length,1);
 pane.close();assert.equal(closes,1);assert.equal(pane.isOpen,false);
 pane.open({token:'two',cards:[]});const current=vscode.__panels.at(-1);
 old.receive({type:'ready',gen:1});old.receive({type:'routeCardProposal',token:'two',gen:1});old.didDispose();
 assert.equal(messages.length,1);assert.equal(closes,1);assert.equal(pane.isOpen,true);
 current.receive({type:'ready',gen:2});assert.equal(current.posts.length,1);
 pane.post({type:'routeCardProposalResult',token:'two',key:'a'});assert.equal(current.posts.at(-1).gen,2);
 current.dispose();assert.equal(closes,2);assert.equal(pane.isOpen,false);
 current.receive({type:'routeCardProposal',token:'two',gen:2});assert.equal(messages.length,1);
});
