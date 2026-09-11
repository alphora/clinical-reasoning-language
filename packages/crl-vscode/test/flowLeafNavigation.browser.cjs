// Run from the repository root with a development MV tree open and CDP enabled:
// CRL_TEST_CDP_URL=http://127.0.0.1:9258 node packages/crl-vscode/test/flowLeafNavigation.browser.cjs
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
const js=esbuild.buildSync({entryPoints:['packages/crl-vscode/src/flowLeafNavigation.ts'],bundle:true,write:false,format:'iife',globalName:'Navigation'}).outputFiles[0].text;
const r=await rpc(t.target,'Runtime.evaluate',{expression:`(()=>{${js}
const d=document.querySelector('iframe').contentDocument,fixture=d.createElement('div');d.body.append(fixture);
fixture.innerHTML='<button>Outside tree</button><svg class="flow-svg" tabindex="0" width="600" height="300"><g data-flow-navigation-node="1" data-flow-key="start" tabindex="-1"><rect x="300" y="20" width="100" height="40"/><g data-node-flag-gid="start" role="button" tabindex="0"><circle cx="390" cy="25" r="8"/></g></g><g data-flow-navigation-node="1" data-flow-outcome-leaf="1" data-flow-key="a" tabindex="-1" class="flow-pin-available"><rect x="20" y="20" width="100" height="40"/><g data-flow-pin="a" role="button" tabindex="0"><rect x="130" y="20" width="20" height="20"/></g></g><g data-flow-navigation-node="1" data-flow-outcome-leaf="1" data-flow-key="b" tabindex="-1"><rect x="20" y="80" width="100" height="40"/></g><g data-flow-navigation-node="1" data-flow-outcome-leaf="1" data-flow-key="c" tabindex="-1" class="flow-pin-available"><rect x="20" y="150" width="100" height="40"/><g data-flow-pin="c" role="button" tabindex="0"><rect x="130" y="150" width="20" height="20"/></g></g><g class="flow-outline"><rect x="300" y="200" width="100" height="40"/></g><g class="route-layout-toggle" role="button" tabindex="0"><rect x="450" y="20" width="20" height="20"/></g><foreignObject x="300" y="80" width="200" height="100"><textarea>Text</textarea></foreignObject></svg>';
fixture.querySelector('[data-flow-key=b]').style.display='none';
const nav=Navigation.installFlowLeafNavigation(fixture),clicks=[];let pins=0,layouts=0,flags=0;
fixture.addEventListener('click',e=>{if(e.target.closest('[data-flow-pin]')){pins++;return;}if(e.target.closest('.route-layout-toggle')){layouts++;return;}if(e.target.closest('[data-node-flag-gid]')){flags++;return;}const node=e.target.closest('[data-flow-navigation-node]');if(node)clicks.push(node.dataset.flowKey);});
const key=(name,shift=false,target=d.activeElement,ctrl=false)=>{const e=new d.defaultView.KeyboardEvent('keydown',{key:name,shiftKey:shift,ctrlKey:ctrl,bubbles:true,cancelable:true});target.dispatchEvent(e);return e.defaultPrevented;};
const id=()=>d.activeElement.matches('[data-flow-pin]')?'pin':d.activeElement.matches('.route-layout-toggle')?'layout':d.activeElement.matches('[data-node-flag-gid]')?'flag':d.activeElement.dataset.flowKey;
const tree=fixture.querySelector('.flow-svg');tree.focus();key('Tab');key('Tab');key('Tab');key('Tab',true);
const result={clicks:[...clicks],focused:id()};key('Enter');result.shiftEnter=key('Enter',true);result.pins=pins;result.layouts=layouts;
const input=fixture.querySelector('textarea');input.focus();result.inputTab=key('Tab');result.inputEnter=key('Enter');result.inputCtrlF=key('f',false,input,true);
const c=fixture.querySelector('[data-flow-key=c]');c.classList.add('flow-pinned');fixture.querySelector('[data-flow-key=a]').style.display='none';c.focus();
result.pinnedOrder=[];for(let i=0;i<5;i++){key('Tab');result.pinnedOrder.push(id());}
result.beforeActivation={pins,layouts,flags};
key('Tab');key('Enter');key('Tab');key('Enter');key('Tab');key('Tab');key('Enter');
result.afterActivation={pins,layouts,flags};result.flagFocus=id();
const old=fixture.querySelector('[data-flow-key=start]');const replacement=old.cloneNode(true);old.replaceWith(replacement);nav.rebind();result.restoredControl=id();
key('Tab',true);result.reverseNode=id();result.ctrlF=key('f',false,d.activeElement,true);result.flagShortcutCount=flags;
replacement.querySelector('[data-node-flag-gid]').style.display='none';key('Tab');result.hiddenControlSkipped=id();
c.classList.remove('flow-pinned');const a=fixture.querySelector('[data-flow-key=a]');a.style.display='';c.focus();key('Tab');const clone=a.cloneNode(true);a.replaceWith(clone);nav.rebind();result.restoredKey=id();
clone.style.display='none';nav.rebind();result.hiddenFallback=d.activeElement===tree;key('Tab');result.nextVisible=id();c.remove();nav.rebind();result.removedFallback=d.activeElement===tree;
clone.style.display='';key('Tab');key('Escape');result.escaped=!d.activeElement.closest('.flow-svg');result.outsideTab=key('Tab');
nav.dispose();fixture.remove();return result;
})()`,returnByValue:true});if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));const v=r.result.result.value;
assert.deepEqual(v.clicks,['a','c','a','c']);assert.equal(v.focused,'c');assert.equal(v.pins,1);assert.equal(v.layouts,0);assert.equal(v.shiftEnter,false);
assert.equal(v.inputTab,false);assert.equal(v.inputEnter,false);assert.equal(v.inputCtrlF,false);
assert.deepEqual(v.pinnedOrder,['pin','layout','start','flag','c']);
assert.deepEqual(v.beforeActivation,{pins:1,layouts:0,flags:0});assert.deepEqual(v.afterActivation,{pins:2,layouts:1,flags:1});
assert.equal(v.flagFocus,'flag');assert.equal(v.restoredControl,'flag');assert.equal(v.reverseNode,'start');assert.equal(v.ctrlF,true);assert.equal(v.flagShortcutCount,2);assert.equal(v.hiddenControlSkipped,'c');
assert.equal(v.restoredKey,'a');assert.ok(v.hiddenFallback&&v.removedFallback);assert.equal(v.nextVisible,'c');assert.ok(v.escaped);assert.equal(v.outsideTab,false);console.log(v);
})().catch(e=>{console.error(e);process.exitCode=1});
