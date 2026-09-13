// Run from the repository root with a development MV tree open and CDP enabled:
// CRL_TEST_CDP_URL=http://127.0.0.1:9258 node packages/crl-vscode/test/flowComponentContainers.browser.cjs
// Uses an isolated temporary DOM fixture; never saves an MV patch or changes content.
const esbuild=require('esbuild'),assert=require('assert/strict');
const endpoint=process.env.CRL_TEST_CDP_URL||'http://127.0.0.1:9258';
async function rpc(target,method,params){
 const ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 try{return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('CDP timeout')),10000);ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id===1){clearTimeout(timeout);resolve(r);}};ws.send(JSON.stringify({id:1,method,params}));});}finally{ws.close();}
}
async function panes(){
 const out=[];for(const target of await(await fetch(endpoint+'/json')).json()){
  if(target.type!=='iframe')continue;
  const r=await rpc(target,'Runtime.evaluate',{expression:"document.querySelector('iframe')?.contentDocument?.body?.innerText",returnByValue:true});
  if(r.result?.result?.value)out.push({target,text:r.result.result.value});
 }return out;
}
// REFACTOR:grounded: reusable boundaries enclose visible logic, never unrelated route outcomes or detached cards.
(async()=>{
const t=(await panes()).find(p=>p.text.includes('Selected path'));
const bundle=(file,name)=>esbuild.buildSync({entryPoints:[file],bundle:true,write:false,format:'iife',globalName:name}).outputFiles[0].text;
const js=bundle('packages/crl-vscode/src/flowComponentContainers.ts','Components')+bundle('packages/crl-vscode/src/routeCardsWebview.ts','Cards');
const r=await rpc(t.target,'Runtime.evaluate',{expression:`(()=>{${js}
const d=document.querySelector('iframe').contentDocument,f=d.createElement('div');d.body.append(f);
f.innerHTML='<svg class="flow-svg" viewBox="0 0 900 700" width="900" height="700"><g data-flow-key="outer" data-flow-when="outer" data-flow-component="expanded"><rect x="20" y="20" width="150" height="34"/><g data-toggle-crit="outer-toggle"><rect x="25" y="25" width="12" height="12"/></g></g><g data-flow-key="inner" data-flow-parent="outer" data-flow-when="outer" data-flow-outline="1" data-flow-component="expanded"><rect x="40" y="80" width="150" height="34"/><g data-toggle-crit="inner-toggle"><rect x="45" y="85" width="12" height="12"/></g></g><g data-flow-key="q" data-flow-parent="inner" data-flow-when="outer" data-flow-outline="1"><rect x="60" y="140" width="150" height="34"/></g><g data-flow-key="sibling" data-flow-parent="outer" data-flow-when="outer" data-flow-outline="1"><rect x="40" y="220" width="150" height="34"/></g><g class="flow-pinned" data-flow-key="end" data-flow-parent="outer"><rect x="400" y="20" width="150" height="34"/></g></svg>';
const flag=d.createElementNS('http://www.w3.org/2000/svg','g');flag.setAttribute('class','flow-flag-badge');flag.setAttribute('transform','translate(2 3)');flag.innerHTML='<circle cx="180" cy="103" r="5"/>';f.querySelector('[data-flow-key=inner]').classList.add('flow-crit-row','has-flag');f.querySelector('[data-flow-key=inner]').append(flag);
flag.innerHTML+='<g class="flow-flag-authoring"><rect x=130 y=98 width=20 height=10/></g>';
const outerFlag=flag.cloneNode(true);f.querySelector('[data-flow-key=outer]').classList.add('flow-row','flow-when','has-flag');f.querySelector('[data-flow-key=outer]').append(outerFlag);
const verdicts=['inner','outer'].map(key=>{const v=d.createElementNS('http://www.w3.org/2000/svg','g');v.setAttribute('class','flow-crit-verdict');v.setAttribute('transform','translate(1 2)');v.innerHTML='<circle cx=155 cy=29 r=8/>';f.querySelector('[data-flow-key='+key+']').append(v);return v;});
f.querySelector('[data-flow-key=q]').dataset.flowQuestion=JSON.stringify(['L','Q']);
const controls=[...f.querySelectorAll('[data-toggle-crit]')],draw=Components.installFlowComponentContainers(f),ui=Cards.installRouteCards(f,{postMessage(){}},()=>1,draw);
ui.show({token:'t',pinKey:'end',cards:[{id:'q',library:'L',concept:'Q',ownerKey:'outer',text:'Actual question',value:'Yes',criterionPaths:[[]],editable:false}]});
const frame=k=>f.querySelector('[data-component-frame='+k+']').getBoundingClientRect();
const flagFits=()=>[['inner',flag],['outer',outerFlag]].every(([key,n])=>{const b=frame(key),r=n.querySelector('circle').getBoundingClientRect();return Math.abs((r.left+r.right)/2-(b.right-12))<1&&Math.abs((r.top+r.bottom)/2-(b.bottom-9))<1;});
const verdictFits=()=>['inner','outer'].every((key,i)=>{const b=frame(key),v=verdicts[i].querySelector('circle').getBoundingClientRect();return Math.abs((v.left+v.right)/2-(b.right-12))<1&&Math.abs((v.top+v.bottom)/2-(b.top+12))<1;});
const inner=frame('inner'),outer=frame('outer'),card=f.querySelector('.route-card').getBoundingClientRect(),sibling=f.querySelector('[data-flow-key=sibling]>rect').getBoundingClientRect(),end=f.querySelector('[data-flow-key=end]>rect').getBoundingClientRect();
const result={verdictAttached:verdictFits(),flagAttached:flagFits(),nested:outer.right>inner.right&&outer.bottom>inner.bottom,enclosesCard:inner.bottom>card.bottom&&inner.left<card.left,clearSibling:inner.bottom<sibling.top,excludesOutcome:outer.right<end.left,controlsRetained:controls.every(n=>n.isConnected)};
ui.questionnaireState(true);result.detachedOutside=!f.querySelector('.route-questionnaire,.route-card');draw();draw();result.flagRepeatedDetached=flagFits();result.verdictRepeated=verdictFits();result.singleLayer=f.querySelectorAll('.flow-component-frames').length===1;
ui.reset();draw();result.flagReset=flagFits();result.unpinnedFrames=f.querySelectorAll('[data-component-frame]').length;
f.querySelector('[data-flow-key=inner]').dataset.flowComponent='collapsed';f.querySelector('[data-flow-key=q]').setAttribute('display','none');draw();result.collapsed=!f.querySelector('[data-component-frame=inner]');result.flagTransformRestored=flag.getAttribute('transform')==='translate(2 3)';
result.verdictRestored=verdicts[0].getAttribute('transform')==='translate(1 2)';f.querySelector('[data-flow-key=inner]').dataset.flowComponent='expanded';f.querySelector('[data-flow-key=q]').removeAttribute('display');draw();draw();result.verdictReexpanded=verdictFits();
const rootCriterion=f.querySelector('[data-flow-key=outer]');rootCriterion.classList.add('review-pass','failed-criterion');const paint=d.defaultView.getComputedStyle(rootCriterion.querySelector(':scope > rect'));result.reviewFill=paint.fill;result.failureStroke=paint.strokeWidth;result.failureDash=paint.strokeDasharray;
flag.querySelector('circle').style.display='none';draw();draw();const keRect=flag.querySelector('.flow-flag-authoring>rect').getBoundingClientRect(),keFrame=frame('inner');result.keOnlyFits=Math.abs((keRect.left+keRect.right)/2-(keFrame.right-12))<1&&Math.abs((keRect.top+keRect.bottom)/2-(keFrame.bottom-9))<1;flag.querySelector('circle').style.display='';
rootCriterion.classList.remove('review-pass','failed-criterion');rootCriterion.dataset.flowComponent='collapsed';draw();outerFlag.removeAttribute('transform');outerFlag.innerHTML='<circle cx="160" cy="44" r="5"/>';rootCriterion.querySelector(':scope > rect').setAttribute('width','150');
ui.show({token:'collapsed',pinKey:'end',cards:[]});const bodyRect=rootCriterion.querySelector(':scope > rect').getBoundingClientRect(),flagRect=outerFlag.getBoundingClientRect();result.collapsedFlagRight=Math.abs((flagRect.left+flagRect.right)/2-(bodyRect.right-10))<1;
f.remove();return result;
})()`,returnByValue:true});if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));const v=r.result.result.value;console.log(v);assert.ok(v.keOnlyFits);assert.ok(v.verdictAttached&&v.verdictRepeated&&v.verdictRestored&&v.verdictReexpanded);assert.ok(v.flagAttached&&v.flagRepeatedDetached&&v.flagReset&&v.flagTransformRestored);assert.ok(v.nested&&v.enclosesCard&&v.clearSibling&&v.excludesOutcome&&v.controlsRetained&&v.detachedOutside&&v.singleLayer&&v.collapsed);assert.equal(v.unpinnedFrames,2);assert.ok(v.collapsedFlagRight);assert.notEqual(v.reviewFill,'rgba(0, 0, 0, 0)');assert.equal(v.failureStroke,'2.5px');assert.equal(v.failureDash,'4px, 2px');
})().catch(e=>{console.error(e);process.exitCode=1});
