import assert from 'node:assert/strict';
import { vi } from 'vitest';
vi.mock('vscode',()=>{
 const panels=[];
 return {ViewColumn:{Beside:-2},__panels:panels,window:{createWebviewPanel:(type,title,column,options)=>{
  const panel={type,title,column,options,posts:[],disposed:false,_viewColumn:column.viewColumn,
   // REFACTOR:grounded: real VS Code rejects viewColumn after setting disposed, before firing listeners.
   get viewColumn(){if(panel.disposed)throw Error('Webview is disposed');return panel._viewColumn;},
   set viewColumn(value){panel._viewColumn=value;panel.didViewChange?.({webviewPanel:panel});},
   webview:{html:'',onDidReceiveMessage(fn){panel.receive=fn;return{dispose(){}};},postMessage(m){panel.posts.push(m);return Promise.resolve(true);}},
   onDidChangeViewState(fn){panel.didViewChange=fn;return{dispose(){}};},
   onDidDispose(fn){panel.didDispose=fn;return{dispose(){}};},dispose(){panel.disposed=true;if(!panel.deferDispose)panel.didDispose?.();}};
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

test('Result Questionnaire opens beside the tree on creation and reopening',()=>{
 let treeColumn=1;
 const pane=createBranchQuestionnairePanel(()=>{},()=>{},()=>treeColumn+1);
 pane.open({token:'first',cards:[]});
 assert.equal(vscode.__panels.at(-1).column.viewColumn,2);
 pane.close();
 treeColumn=3;
 pane.open({token:'second',cards:[]});
 assert.equal(vscode.__panels.at(-1).column.viewColumn,4);
 pane.close();
});
test('pane handshake replays newest branch and stale panels cannot write or close replacements',()=>{
 const messages=[];let closes=0;const pane=createBranchQuestionnairePanel(m=>messages.push(m),()=>closes++);
 pane.open({token:'one',cards:[]});const old=vscode.__panels.at(-1);
 assert.match(old.title,/Result Questionnaire/);assert.equal(old.column.viewColumn,-2);assert.equal(old.options.retainContextWhenHidden,true);
 pane.update({token:'two',cards:[{id:'new'}]});assert.equal(old.posts.length,0);
 old.receive({type:'ready',gen:1});assert.equal(old.posts.at(-1).token,'two');
 old.receive({type:'routeCardSave',token:'one',gen:1});assert.equal(messages.length,0);
 old.receive({type:'routeCardDraft',token:'two',gen:1});assert.equal(messages.length,1);
 old.deferDispose=true;pane.close();assert.equal(closes,1,'public close notifies synchronously even when disposal notification is deferred');assert.equal(pane.isOpen,false);
 pane.open({token:'two',cards:[]});const current=vscode.__panels.at(-1);
 old.receive({type:'ready',gen:1});old.receive({type:'routeCardSave',token:'two',gen:1});old.didDispose();
 assert.equal(messages.length,1);assert.equal(closes,1);assert.equal(pane.isOpen,true);
 current.receive({type:'ready',gen:2});assert.equal(current.posts.length,1);
 pane.post({type:'routeCardSaveResult',token:'two',key:'a'});assert.equal(current.posts.at(-1).gen,2);
 current.dispose();assert.equal(closes,2);assert.equal(pane.isOpen,false);
 current.receive({type:'routeCardSave',token:'two',gen:2});assert.equal(messages.length,1);
});

// REFACTOR:grounded: panel mode cycling retains its column instead of growing editor groups.
test('closing/reopening the result panel reuses its last column, including a user-moved column',()=>{
 vscode.window.tabGroups={all:[{viewColumn:1},{viewColumn:3}]};const pane=createBranchQuestionnairePanel(()=>{},()=>{});
 pane.open({token:'a',cards:[]});const first=vscode.__panels.at(-1);assert.equal(first.column.viewColumn,4);pane.close();
 vscode.window.tabGroups.all=[{viewColumn:1},{viewColumn:3},{viewColumn:4}];pane.open({token:'b',cards:[]});const second=vscode.__panels.at(-1);assert.equal(second.column.viewColumn,4);
 second.viewColumn=2;assert.doesNotThrow(()=>second.dispose());assert.equal(pane.isOpen,false);pane.open({token:'c',cards:[]});assert.equal(vscode.__panels.at(-1).column.viewColumn,2);pane.close();delete vscode.window.tabGroups;
});
