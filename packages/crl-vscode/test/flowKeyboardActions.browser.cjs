// Run from the repository root with a development MV tree open and CDP enabled:
// CRL_TEST_CDP_URL=http://127.0.0.1:9258 node packages/crl-vscode/test/flowKeyboardActions.browser.cjs
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
const js=esbuild.buildSync({entryPoints:['packages/crl-vscode/src/flowKeyboardActions.ts'],bundle:true,write:false,format:'iife',globalName:'Navigation'}).outputFiles[0].text;
const r=await rpc(t.target,'Runtime.evaluate',{expression:`(()=>{${js}
const d=document.querySelector('iframe').contentDocument,fixture=d.createElement('div');d.body.append(fixture);
fixture.innerHTML='<svg class="flow-svg" width="500" height="250"><g data-flow-key="n" tabindex="-1"><rect x="20" y="20" width="100" height="40"/><g data-node-flag-gid="n" tabindex="0" role="button"><circle cx="110" cy="50" r="7"/></g><g data-flow-pin="n" tabindex="0" role="button"><rect x="130" y="20" width="20" height="20"/></g></g><g class="route-layout-toggle" tabindex="0" role="button"><rect x="130" y="50" width="20" height="20"/></g><foreignObject x="200" y="80" width="200" height="100"><textarea>Text</textarea></foreignObject></svg>';
const actions=Navigation.installFlowKeyboardActions(fixture),node=fixture.querySelector('[data-flow-key]');let pins=0,layouts=0,flags=0;
fixture.addEventListener('click',e=>{if(e.target.closest('[data-flow-pin]'))pins++;else if(e.target.closest('.route-layout-toggle'))layouts++;else if(e.target.closest('[data-node-flag-gid]'))flags++;});
const key=(name,shift=false,ctrl=false)=>{const e=new d.defaultView.KeyboardEvent('keydown',{key:name,shiftKey:shift,ctrlKey:ctrl,bubbles:true,cancelable:true});d.activeElement.dispatchEvent(e);return e.defaultPrevented;};
const tabs=[];for(const pinned of [false,true]){node.classList.toggle('flow-pinned',pinned);for(const n of fixture.querySelectorAll('[tabindex]')){n.focus();for(const shift of [false,true])tabs.push({handled:key('Tab',shift),sameFocus:d.activeElement===n});}}
node.querySelector('[data-flow-pin]').focus();key('Enter');fixture.querySelector('.route-layout-toggle').focus();key('Enter');node.querySelector('[data-node-flag-gid]').focus();key('Enter');node.focus();key('f',false,true);
const input=fixture.querySelector('textarea');input.focus();const native=[key('Tab'),key('Tab',true),key('Enter'),key('f',false,true)];
actions.dispose();fixture.remove();return {tabs,pins,layouts,flags,native};
})()`,returnByValue:true});if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));const v=r.result.result.value;
assert.ok(v.tabs.every(t=>!t.handled&&t.sameFocus));assert.equal(v.pins,1);assert.equal(v.layouts,1);assert.equal(v.flags,2);assert.deepEqual(v.native,[false,false,false,false]);console.log(v);
})().catch(e=>{console.error(e);process.exitCode=1});
