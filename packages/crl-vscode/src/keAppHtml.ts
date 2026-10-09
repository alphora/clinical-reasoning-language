/** Authored content is delivered as messages and rendered with textContent. */
export function keAppHtml(nonce:string):string{return String.raw`<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1"><style nonce="${nonce}">
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px;max-width:1150px;margin:auto}
h1{font-size:22px;margin:0 0 8px}h2{font-size:16px;margin:0 0 12px}h3{font-size:13px;margin:0 0 8px}.muted{color:var(--vscode-descriptionForeground)}
#root{overflow-wrap:anywhere;margin-bottom:18px}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0}
button{font:inherit;border:0;padding:6px 12px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);cursor:pointer}button:hover{background:var(--vscode-button-secondaryHoverBackground)}button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,summary:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:2px}
.card,section{border:1px solid var(--vscode-panel-border);border-radius:5px;padding:16px;margin:12px 0}.card header{display:flex;gap:9px;align-items:start;margin-bottom:12px}.card header label{font-weight:600;flex:1}.identity{overflow-wrap:anywhere;font-size:12px;margin-bottom:12px}
.comparison{display:grid;grid-template-columns:1fr 1fr;gap:16px}.value{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 10px}.description{border-top:1px solid var(--vscode-panel-border);padding-top:8px}.code{font-family:var(--vscode-editor-font-family);font-size:var(--vscode-editor-font-size)}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}details{margin:10px 0}summary{cursor:pointer}#error{color:var(--vscode-errorForeground);white-space:pre-wrap}#status{white-space:pre-wrap}#preview[hidden],#result[hidden],#error[hidden],button[hidden]{display:none}.badge{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);padding:2px 6px;font-size:11px}
@media(max-width:650px){.comparison{grid-template-columns:1fr}body{padding:12px}}
</style></head><body><h1>Knowledge Engineer</h1><div id="root" class="muted"></div>
<p class="muted">Review the requested question and answer changes, then preview and run the selected updates.</p>
<div class="toolbar"><button id="refresh">Refresh</button><button id="select-all">Select all</button><button id="preview-button">Preview</button><button id="run" class="primary">Run</button><button id="recover" hidden>Recover interrupted update</button><span id="busy" role="status"></span></div>
<div id="error" role="alert" hidden></div><div id="requests"></div><section id="preview" hidden><h2>Preview</h2><div id="paths"></div><div id="diffs"></div></section><section id="result" hidden><h2>Result</h2><div id="status" role="status"></div></section><div id="findings" class="muted"></div>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi();let current;
const el=id=>document.getElementById(id),node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const send=action=>vscode.postMessage({action});
el('refresh').onclick=()=>send('refresh');el('preview-button').onclick=()=>send('preview');el('run').onclick=()=>send('run');el('recover').onclick=()=>send('recover');
el('select-all').onclick=()=>vscode.postMessage({action:'select',ids:current.selected.length===current.requests.length?[]:current.requests.map(r=>r.id)});
function content(state,question){const box=node('div');if(state===null){box.append(node('p',question?'No question':'No answer','muted'));return box;}
box.append(node('p',question?state.text:state.display,'value'));box.append(node('p',state.description||'No description','value description'+(state.description?'':' muted')));
if(!question){for(const [key,qualifies] of Object.entries(state.qualifications||{})){let names;try{names=JSON.parse(key).join(' / ');}catch{names=key;}box.append(node('p',names+': '+(qualifies?'Qualifying':'Not qualifying'),'muted'));}}return box;}
function render(s){const focus=document.activeElement?.id;current=s;el('root').textContent=s.root;const busy=!!s.busy;
el('busy').textContent=busy?({refresh:'Refreshing…',preview:'Preparing preview…',run:'Running updates…',recover:'Recovering…'}[s.busy]||'Working…'):'';
el('refresh').disabled=busy;el('select-all').disabled=busy||!s.requests.length;el('preview-button').disabled=busy||!s.selected.length||s.recoveryRequired;el('run').disabled=busy||!s.preview||s.recoveryRequired;el('recover').hidden=!s.recoveryRequired;el('recover').disabled=busy;
el('error').hidden=!s.error;el('error').textContent=s.error||'';el('requests').replaceChildren();
if(!s.requests.length)el('requests').append(node('p','No pending question or answer requests.','muted'));
for(const request of s.requests){const r=request.editRequest,q=r.kind==='question-edit',card=node('article',undefined,'card');card.dataset.requestId=request.id;
const header=node('header'),check=node('input');check.type='checkbox';check.id='request-'+request.id;check.checked=s.selected.includes(request.id);check.disabled=busy;check.onchange=()=>{const ids=new Set(current.selected);check.checked?ids.add(request.id):ids.delete(request.id);vscode.postMessage({action:'select',ids:[...ids]});};
const label=node('label',request.gist);label.htmlFor=check.id;header.append(check,label,node('span',q?'Question Edit':r.desired===null?'Delete answer':r.before===null?'Add answer':'Edit answer','badge'));card.append(header);
card.append(node('div',r.target.library+' / '+(q?r.target.concept:r.target.terminology)+' · '+r.target.file,'identity muted'));
if(!q)card.append(node('div',r.target.system+' | '+r.target.code,'identity code'));
const columns=node('div',undefined,'comparison'),original=node('div'),desired=node('div');original.append(node('h3','Original (request baseline)'),content(r.before,q));desired.append(node('h3','Requested'),content(r.desired,q));columns.append(original,desired);card.append(columns);el('requests').append(card);}
el('preview').hidden=!s.preview;el('paths').replaceChildren();el('diffs').replaceChildren();
if(s.preview){const p=s.preview;el('paths').append(node('p',p.changedPaths.length?'Source and definition changes: '+p.changedPaths.join(', '):'Source and definitions already match the requested state.'));
el('paths').append(node('p','Static questionnaires and responses checked/refreshed on Run: '+(p.refreshedFolders||[]).join(', '),'muted'));
for(const c of p.clearedCases||[])el('paths').append(node('p','Clears selected answer: '+c.caseName+' / '+c.factName+' ('+c.file+'). Review its expected outcome.'));
for(const change of p.changes||[]){const d=node('details'),comparison=node('div',undefined,'comparison'),before=node('div'),after=node('div');d.append(node('summary',change.file));before.append(node('h3','Current source'),node('pre',change.before,'code'));after.append(node('h3','After Run'),node('pre',change.after,'code'));comparison.append(before,after);d.append(comparison);el('diffs').append(d);}}
el('result').hidden=!s.result;if(s.result){const r=s.result;el('status').textContent=(r.state==='no-op'?'Already up to date.':r.state==='recovered'?'Interrupted update recovered.':'Updates saved to disk.')+(r.changedPaths.length?'\nChanged: '+r.changedPaths.join(', '):'')+(r.message?'\n'+r.message:'')+(r.clearedCases?.length?'\nCleared selected answers (review unchanged expected outcomes):\n'+r.clearedCases.map(c=>c.caseName+' / '+c.factName+' ('+c.file+')').join('\n'):'')+'\nKELP handles commit, push and unlock. MV marks Fixed and approves the changes.';}
el('findings').textContent=s.pendingFindings.length?s.pendingFindings.length+' other pending flag(s). These are not Q/A update requests.':'';if(focus){const target=el(focus);if(target&&!target.disabled)target.focus();}}
window.addEventListener('message',event=>{if(event.data?.type==='state')render(event.data.state);});send('ready');
</script></body></html>`;}
