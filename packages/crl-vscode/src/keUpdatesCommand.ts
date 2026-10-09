// REFACTOR:grounded (MV/KE): KELP invokes an explicit versioned KE operation; it owns locking and Save.
import * as vscode from 'vscode';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {runKeUpdates,type KeUpdateInput} from './keQaApply';

export function registerKeUpdates(context:vscode.ExtensionContext){
  context.subscriptions.push(vscode.commands.registerCommand('crl.keUpdates',async(input:KeUpdateInput)=>{
    try {
      if(!input || typeof input.artifactRoot!=='string')throw Error('KE Updates requires an explicit artifactRoot.');
      if(input.operation!=='discover' && !vscode.workspace.isTrusted)throw Error('Trust the workspace before applying KE updates.');
      const root=resolve(input.artifactRoot);
      if(input.operation!=='discover' && vscode.workspace.textDocuments.some(d=>{const p=relative(root,d.uri.fsPath);return d.isDirty && !isAbsolute(p) && p!=='..' && !p.startsWith('..') && /^(src|tests)[\\/]/.test(p);}))throw Error('Save or revert unsaved artifact edits before applying KE updates.');
      const result=await runKeUpdates(input,{storageRoot:join(context.globalStorageUri.fsPath,'ke-updates'),crlVersion:context.extension.packageJSON.version});
      if(result.ok && 'state' in result && ['changed','recovered'].includes(String(result.state)))await Promise.resolve(vscode.commands.executeCommand('crl.invalidateProjectCache')).catch(()=>{});
      return result;
    }catch(error){return {ok:false,schemaVersion:1,error:error instanceof Error?error.message:String(error)};}
  }));
}
