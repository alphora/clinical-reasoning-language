import * as vscode from 'vscode';
import {randomBytes} from 'node:crypto';
import {basename} from 'node:path';
import {readFileSync} from 'node:fs';
import {validateCRLImports} from '@smile-digital-health/crl';
import {listStructureSites,type StructureEditRequest,type StructureSite} from '@smile-digital-health/crl/language-services';
import {previewStructuralEdit} from './structureEditing';

export interface StructureEditorOptions {
  root:string;policy:string;files:string[];preferred?:{file:string;decision:string;nodeId:string};
  beforeSave():void; saved():Promise<void>; runUpdates():Promise<void>; active():boolean;
}
export function openStructureEditor(options:StructureEditorOptions):vscode.WebviewPanel {
  const panel=vscode.window.createWebviewPanel('crl.structureEditor','Edit decision tree',vscode.ViewColumn.Beside,{enableScripts:true,retainContextWhenHidden:true});
  const nonce=randomBytes(18).toString('hex');
  let sites:{file:string;source:string;site:StructureSite}[]=[],preview:{file:string;before:string;after:string;message:string}|undefined;
  let undo:typeof preview,busy=false;
  const send=(message:unknown)=>void panel.webview.postMessage(message);
  const assertActive=()=>{if(!options.active())throw Error('The reviewed artifact changed. Reopen the tree editor.');};
  const refresh=()=>{
    sites=options.files.flatMap(file=>{const source=readFileSync(file,'utf8');return listStructureSites(source).map(site=>({file,source,site}));});
    send({type:'sites',sites:sites.map(({file,site})=>({...site,file:basename(file),fileId:file})),preferred:options.preferred});
  };
  const write=async(file:string,before:string,after:string)=>{
    assertActive();const document=await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    assertActive();
    const bufferBefore=before.replace(/^\uFEFF/,''),bufferAfter=after.replace(/^\uFEFF/,'');
    if(document.isDirty||document.getText()!==bufferBefore||readFileSync(file,'utf8')!==before)throw Error('CRL changed since preview. Save any open edits and preview again.');
    if(!validateCRLImports(options.policy,{overlays:new Map([[file,bufferAfter]])}).success)throw Error('Project validation changed. Preview again.');
    options.beforeSave();
    const edit=new vscode.WorkspaceEdit();edit.replace(document.uri,new vscode.Range(document.positionAt(0),document.positionAt(bufferBefore.length)),bufferAfter);
    if(!await vscode.workspace.applyEdit(edit))throw Error('VS Code could not apply the CRL edit.');
    if(!await document.save())throw Error('CRL could not be saved to disk. The edited buffer is retained; save it before running updates.');
    await options.saved();
  };
  panel.webview.onDidReceiveMessage(async msg=>{
    if(busy)return;
    busy=true;
    try{
      assertActive();
      if(msg.type==='ready'){refresh();return;}
      if(msg.type==='preview'){
        preview=undefined;
        const selected=Number.isInteger(msg.index)?sites[msg.index]:undefined;if(!selected)throw Error('Select an authored test or operand.');
        const doc=await vscode.workspace.openTextDocument(vscode.Uri.file(selected.file));
        if(doc.isDirty)throw Error('Save existing CRL edits before previewing a tree change.');
        const request:StructureEditRequest={target:selected.site,operation:msg.operation,conditions:msg.operation==='split'?[msg.first,msg.second]:[msg.first],operator:msg.operator,continuation:msg.continuation,declarations:['combine','split'].includes(msg.operation)?msg.declarations:undefined};
        const before=readFileSync(selected.file,'utf8');
        if(before!==selected.source){refresh();throw Error('CRL changed since the condition list was shown. Select the intended occurrence again.');}
        if(doc.getText()!==before.replace(/^\uFEFF/,''))throw Error('The source buffer and disk differ. Reload the file before previewing.');
        const plan=previewStructuralEdit(options.root,options.policy,selected.file,before,request);
        preview={file:selected.file,before,after:plan.candidateSource,message:plan.message};
        send({type:'preview',before,after:plan.candidateSource,message:plan.message});return;
      }
      if(msg.type==='save'){
        if(!preview)throw Error('Preview this change first.');const plan=preview;
        await write(plan.file,plan.before,plan.after);undo=plan;preview=undefined;refresh();send({type:'saved',message:plan.message,canUndo:true});return;
      }
      if(msg.type==='undo'){
        if(!undo)throw Error('There is no tree edit to undo in this editor.');const previous=undo;
        await write(previous.file,previous.after,previous.before);undo=undefined;preview=undefined;refresh();send({type:'saved',message:'CRL restored. Run Updates to regenerate artifacts; approvals remain pending.',canUndo:false});return;
      }
      if(msg.type==='run'){await options.runUpdates();send({type:'saved',message:'Downstream updates completed. Review the regenerated cases before approving.',canUndo:!!undo});}
    }catch(error){send({type:'error',message:error instanceof Error?error.message:String(error)});}
    finally{busy=false;send({type:'idle'});}
  });
  panel.webview.html=structureEditorHtml(nonce);
  return panel;
}

export function structureEditorHtml(nonce:string):string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"><style>
body{font:var(--vscode-font-size)/1.5 var(--vscode-font-family);padding:18px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}
label{display:block;margin:12px 0 4px}input,select,textarea{display:block;box-sizing:border-box;width:100%;padding:7px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border)}textarea{font-family:var(--vscode-editor-font-family);min-height:74px}button{padding:6px 12px;margin:12px 8px 0 0;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;cursor:pointer}button:disabled{opacity:.5;cursor:default}details{margin-top:14px}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border)}.columns{display:grid;grid-template-columns:1fr 1fr;gap:16px}#message{white-space:pre-wrap;margin:14px 0}small{color:var(--vscode-descriptionForeground)}[hidden]{display:none!important}
</style></head><body><h2>Edit decision tree</h2><p>Save CRL now; run downstream updates when your edits are ready.</p>
<label for="site">Condition occurrence</label><select id="site"></select><small>A question may feed several tests. Select the occurrence you intend to change; shared question definitions remain available.</small>
<label for="operation">Operation</label><select id="operation"><option value="up">Move up</option><option value="down">Move down</option><option value="delete">Delete test / operand</option><option value="combine">Combine with next test / operand</option><option value="split">Split into two questions / conditions</option></select>
<div id="continuationFields" hidden><label for="continuation">When deleting a test, keep its</label><select id="continuation"><option value="">Choose continuation</option><option value="yes">Yes continuation</option><option value="no">No continuation</option></select></div>
<div id="conditionFields" hidden><label id="firstLabel" for="first">Resulting condition (CRL)</label><textarea id="first" placeholder='"Combined Question"'></textarea><div id="secondFields" hidden><label for="second">Second condition (CRL)</label><textarea id="second" placeholder='"Second Question"'></textarea><label for="operator">Evaluate the resulting questions using</label><select id="operator"><option value="">Choose logic</option><option value="and">ALL (AND)</option><option value="or">ANY (OR)</option></select></div>
<details><summary>New question definitions</summary><p>For new questions, supply their CRL concepts, terminology and presentations here. Conditions above reference their names. Existing definitions are retained. Answer interpretation and mappings must be authored explicitly.</p><textarea id="declarations" rows="12"></textarea></details></div>
<p id="effect">Moving tests can change question order, pauses and first-match priority. The preview shows the source change.</p>
<button id="preview">Preview</button><button id="save" disabled>Save CRL</button><button id="undo" disabled>Undo last edit</button><button id="run">Run Updates</button>
<div id="message" role="status"></div><div id="comparison" class="columns" hidden><section><h3>Before</h3><pre id="before"></pre></section><section><h3>After</h3><pre id="after"></pre></section></div>
<script nonce="${nonce}">
const api=acquireVsCodeApi(),el=id=>document.getElementById(id);let sites=[],busy=false,canSave=false,canUndo=false;
function controls(){for(const id of ['preview','save','undo','run'])el(id).disabled=busy||(id==='save'&&!canSave)||(id==='undo'&&!canUndo);}
function invalidate(){canSave=false;el('comparison').hidden=true;controls();}
function fields(){const op=el('operation').value;el('conditionFields').hidden=!['combine','split'].includes(op);el('secondFields').hidden=op!=='split';el('continuationFields').hidden=op!=='delete'||sites[Number(el('site').value)]?.kind==='operand';el('firstLabel').textContent=op==='split'?'First condition (CRL)':'Combined condition (CRL)';invalidate();}
for(const id of ['site','operation','continuation','operator'])el(id).onchange=fields;
for(const id of ['first','second','declarations'])el(id).oninput=invalidate;
for(const id of ['preview','save','undo','run'])el(id).onclick=()=>{busy=true;controls();api.postMessage({type:id,index:Number(el('site').value),operation:el('operation').value,first:el('first').value,second:el('second').value,operator:el('operator').value,continuation:el('continuation').value,declarations:el('declarations').value});};
window.addEventListener('message',({data:m})=>{if(m.type==='sites'){sites=m.sites;el('site').replaceChildren(...sites.map((s,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=s.file+' / '+s.label+' — '+s.condition;if(m.preferred&&s.fileId===m.preferred.file&&s.kind==='test'&&s.decision===m.preferred.decision&&s.nodeId===m.preferred.nodeId)o.selected=true;return o;}));fields();}if(m.type==='preview'){el('before').textContent=m.before;el('after').textContent=m.after;el('comparison').hidden=false;canSave=true;}if(m.type==='saved'){canSave=false;canUndo=m.canUndo;el('comparison').hidden=true;}if(m.message)el('message').textContent=m.message;if(m.type==='error')canSave=false;if(m.type==='idle')busy=false;controls();});api.postMessage({type:'ready'});
</script></body></html>`;
}
