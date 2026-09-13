// Run with an isolated MV development window exposing CDP9258. No content writes.
const assert=require('assert/strict'),esbuild=require('esbuild');
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

(async()=>{
const target=(await panes()).find(p=>p.text.includes('Selected path')).target;
const bundle=(file,name)=>esbuild.buildSync({entryPoints:[file],bundle:true,write:false,format:'iife',globalName:name}).outputFiles[0].text;
const js=bundle('packages/crl-vscode/src/flowLogicHighlight.ts','Logic')+bundle('packages/crl-vscode/src/flowKeyboardActions.ts','Keys');
const r=await rpc(target,'Runtime.evaluate',{expression:`(()=>{${js}
const d=document.querySelector('iframe').contentDocument,f=d.createElement('div');d.body.append(f);
const style=d.createElement('style');style.nonce=d.querySelector('style')?.nonce??'';style.textContent=Logic.FLOW_LOGIC_STYLE;d.head.append(style);
f.innerHTML='<svg class="flow-svg" width="600" height="400"></svg>';const svg=f.firstChild;
const group=(key,parent,depth)=>{const g=d.createElementNS(svg.namespaceURI,'g');Object.assign(g.dataset,{flowLogic:key,flowKey:key,flowLogicParent:parent,flowLogicDepth:String(depth),flowLogicKind:depth%2===0?'any':'all'});g.setAttribute('class','flow-logic-label');g.setAttribute('transform','translate(20 40)');g.setAttribute('tabindex','0');g.setAttribute('role','button');g.innerHTML='<text>ALL OF</text>';svg.append(g);const e=d.createElementNS(svg.namespaceURI,'path');e.setAttribute('class','flow-def-edge');e.dataset.flowFrom=key;e.dataset.flowTo=key+'-q';e.setAttribute('d','M0 0 L40 40');svg.append(e);return g;};
const a=group('a','',0),b=group('b','a',1),c=group('c','b',2),s=group('s','a',1),wrap=d.createElementNS(svg.namespaceURI,'g');
wrap.innerHTML='<g class="flow-crit-toggle" data-toggle-crit="t" tabindex="0"><rect width="20" height="20"/></g><g class="route-layout-toggle" tabindex="0"><rect width="20" height="20"/></g>';svg.append(wrap);
const ui=Logic.installFlowLogicHighlight(f),keyboard=Keys.installFlowKeyboardActions(f);ui.update();
const click=g=>g.dispatchEvent(new MouseEvent('click',{bubbles:true}));const on=g=>g.getAttribute('aria-pressed')==='true';
click(c);click(b);click(s);click(a);const out={allOn:[a,b,c,s].every(on),colors:[...f.querySelectorAll('.flow-group-halo')].map(n=>n.getAttribute('class')),clonesClean:[...f.querySelectorAll('.flow-group-halo')].every(n=>!n.hasAttribute('data-flow-from')&&!n.hasAttribute('data-flow-to'))};
out.bright=[...f.querySelectorAll('.flow-group-halo')].every(e=>{const s=d.defaultView.getComputedStyle(e);return s.stroke==='rgb(255, 255, 255)'&&s.opacity==='1'&&s.filter.includes('drop-shadow');});
click(b);out.childOff=on(a)&&!on(b)&&!on(c)&&on(s);click(b);out.parentOn=!on(c)&&on(s)&&on(a);click(c);
c.remove();ui.update();click(a);svg.append(c);ui.update();out.hiddenCleared=[a,b,c,s].every(g=>!on(g));
click(a);const edge=f.querySelector('path[data-flow-from=a]');edge.classList.add('flow-focus-hidden');ui.update();out.pinHidden=edge.classList.contains('flow-focus-hidden')&&!edge.previousElementSibling?.classList.contains('flow-group-halo');edge.classList.remove('flow-focus-hidden');ui.update();out.unpinHalo=edge.previousElementSibling?.classList.contains('flow-group-halo');click(a);
a.focus();a.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));out.keyboard=on(a);const focusStyle=d.defaultView.getComputedStyle(a);out.keyboardOutline=focusStyle.outlineStyle!=='none'&&parseFloat(focusStyle.outlineWidth)>0;out.focusBox=a.getBoundingClientRect().width>0&&a.getBoundingClientRect().height>0;a.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));out.pointerOutline=d.defaultView.getComputedStyle(a).outlineStyle==='none';
const toggle=f.querySelector('[data-toggle-crit]');toggle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));toggle.focus();out.pointerClass=f.classList.contains('flow-pointer-interaction');toggle.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));out.keyboardClass=!f.classList.contains('flow-pointer-interaction');
ui.reset();ui.update();out.reset=[a,b,c,s].every(g=>!on(g))&&!f.querySelector('.flow-group-halo');keyboard.dispose();f.remove();style.remove();return out;
})()`,returnByValue:true});if(r.result?.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));const out=r.result.result.value;
for(const key of ['bright','allOn','clonesClean','childOff','parentOn','hiddenCleared','pinHidden','unpinHalo','keyboard','keyboardOutline','focusBox','pointerOutline','pointerClass','keyboardClass','reset'])assert.ok(out[key],key);assert.ok(out.colors.filter(c=>c.includes('teal')).length===2&&out.colors.filter(c=>c.includes('orange')).length===2);console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1});
