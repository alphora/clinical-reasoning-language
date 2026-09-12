// Run from the repository root with a development MV tree open and CDP enabled:
// CRL_TEST_CDP_URL=http://127.0.0.1:9258 node packages/crl-vscode/test/flowDisclosureFocus.browser.cjs
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
(async()=>{
const t=(await panes()).find(p=>p.text.includes('Selected path'));
const js=esbuild.buildSync({entryPoints:['packages/crl-vscode/src/flowDisclosureFocus.ts'],bundle:true,write:false,format:'iife',globalName:'Disclosure'}).outputFiles[0].text;
const r=await rpc(t.target,'Runtime.evaluate',{expression:`(async()=>{${js}
const d=document.querySelector('iframe').contentDocument,fixture=d.createElement('div');d.body.append(fixture);
fixture.innerHTML='<svg width="800" height="3000"><g data-flow-key="same"><rect x="100" y="1200" width="200" height="40"/><g data-toggle-crit="old"><rect x="110" y="1210" width="15" height="15"/></g></g></svg>';
let gen=1;const ui=Disclosure.installFlowDisclosureFocus(fixture,()=>gen),sc=d.scrollingElement,originalTop=sc.scrollTop;
let control=fixture.querySelector('[data-toggle-crit]');control.scrollIntoView({block:'center'});const before=control.getBoundingClientRect(),token=ui.capture(control);
fixture.querySelector('[data-flow-key]').setAttribute('transform','translate(0 350)');control.setAttribute('data-toggle-crit','new');
ui.restore('wrong');await new Promise(r=>d.defaultView.requestAnimationFrame(r));const wrongIgnored=d.activeElement!==control;
ui.restore(token);await new Promise(r=>d.defaultView.requestAnimationFrame(r));const after=control.getBoundingClientRect(),focused=d.activeElement===control,position=Math.abs(after.top-before.top)<2;
const stale=ui.capture(control);ui.restore(stale);ui.cancel();control.blur();await new Promise(r=>d.defaultView.requestAnimationFrame(r));const cancelled=d.activeElement!==control;
const newer=ui.capture(control);ui.restore(newer);gen++;await new Promise(r=>d.defaultView.requestAnimationFrame(r));const newerRenderIgnored=d.activeElement!==control;fixture.remove();sc.scrollTop=originalTop;return {wrongIgnored,focused,position,cancelled,newerRenderIgnored};
})()`,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));const v=r.result.result.value;console.log(v);assert.ok(v.wrongIgnored&&v.focused&&v.position&&v.cancelled&&v.newerRenderIgnored);
})().catch(e=>{console.error(e);process.exitCode=1});
