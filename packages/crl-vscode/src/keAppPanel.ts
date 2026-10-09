import * as vscode from 'vscode';
import {randomBytes} from 'node:crypto';
import {basename} from 'node:path';
import {resolveKeLaunchTarget} from './keAppLaunch';
import {KeAppController,type KeAppResult} from './keAppController';
import {keAppHtml} from './keAppHtml';

export function registerKeApp(context:vscode.ExtensionContext){
  const apps=new Map<string,{controller:KeAppController;panel?:vscode.WebviewPanel;watcher:vscode.FileSystemWatcher}>();
  context.subscriptions.push({dispose(){for(const app of apps.values()){app.controller.dispose();app.watcher.dispose();app.panel?.dispose();}apps.clear();}});
  context.subscriptions.push(vscode.commands.registerCommand('crl.knowledgeEngineering.show',async(arg:unknown)=>{
    let target=resolveKeLaunchTarget(arg);
    if(target.kind==='none'){
      const active=vscode.window.activeTextEditor?.document.uri;if(active?.scheme==='file')target=resolveKeLaunchTarget(active);
      if(target.kind!=='artifact'){
        const packages=await vscode.workspace.findFiles('**/package.json','**/node_modules/**'),roots=new Set<string>();
        for(const file of packages){const candidate=resolveKeLaunchTarget(file);if(candidate.kind==='artifact')roots.add(candidate.root);}
        const picked=await vscode.window.showQuickPick([...roots].map(root=>({label:basename(root),description:root,root})),{placeHolder:'Select an artifact for Knowledge Engineer'});
        if(!picked)return;target={kind:'artifact',root:picked.root};
      }
    }
    if(target.kind==='error'){await vscode.window.showErrorMessage(target.detail);return;}
    if(target.kind!=='artifact')return;
    const root=target.root,key=process.platform==='win32'?root.toLowerCase():root;
    let app=apps.get(key);
    if(!app){
      const controller=new KeAppController(root,async input=>await vscode.commands.executeCommand('crl.keUpdates',input) as KeAppResult);
      const watcher=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root,'{package.json,src/**,tests/**}'));
      watcher.onDidChange(()=>controller.invalidate());watcher.onDidCreate(()=>controller.invalidate());watcher.onDidDelete(()=>controller.invalidate());
      app={controller,watcher};apps.set(key,app);
    }
    if(app.panel){app.panel.reveal();return root;}
    const panel=vscode.window.createWebviewPanel('crlKnowledgeEngineering',`KE: ${basename(root)}`,vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true,localResourceRoots:[]});
    app.panel=panel;panel.webview.html=keAppHtml(randomBytes(24).toString('hex'));
    const activeApp=app,subscription=app.controller.subscribe(state=>{void panel.webview.postMessage({type:'state',state});});
    const messages=panel.webview.onDidReceiveMessage(message=>{
      if(message?.action==='ready'){void panel.webview.postMessage({type:'state',state:activeApp.controller.state});if(!activeApp.controller.state.busy)void activeApp.controller.act('refresh');}
      else if(message?.action==='select')activeApp.controller.select(message.ids);
      else if(['refresh','preview','run','recover'].includes(message?.action))void activeApp.controller.act(message.action);
    });
    panel.onDidDispose(()=>{subscription();messages.dispose();activeApp.panel=undefined;});
    return root;
  }));
}
