const esbuild=require('esbuild'),assert=require('assert/strict');
const endpoint=process.env.CRL_TEST_CDP_URL||'http://127.0.0.1:9258';
async function rpc(target,method,params){
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
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
 const js=esbuild.buildSync({entryPoints:['packages/crl-vscode/src/flowPinVisibility.ts'],bundle:true,write:false,format:'iife',globalName:'Pins'}).outputFiles[0].text+esbuild.buildSync({entryPoints:['packages/crl-vscode/src/flowKeyboardActions.ts'],bundle:true,write:false,format:'iife',globalName:'Keys'}).outputFiles[0].text;
 const css={exports:{}};new Function('require','module','exports',esbuild.buildSync({entryPoints:['packages/crl-vscode/src/flowPaneHtml.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text)(require,css,css.exports);
 const r=await rpc(target,'Runtime.evaluate',{expression:`(()=>{${js}
 const d=document.querySelector('iframe').contentDocument,frame=d.createElement('iframe');d.body.append(frame);
 const f=frame.contentDocument,w=f.defaultView;f.body.dataset.mode='medical-validation';f.body.classList.add('vscode-dark');
 const st=f.createElement('style');st.nonce=d.querySelector('style[nonce]')?.nonce??'';st.textContent=${JSON.stringify(css.exports.FLOW_STYLE)};f.head.append(st);
 const root=f.createElement('div');root.id='root';f.body.append(root);
 root.innerHTML='<svg class="flow-svg"><g id="a" class="flow-activity leaf-allpass" data-flow-key="a" tabindex="-1"><rect width="100" height="30"/><g class="flow-pin"><rect width="10" height="10"/></g></g><g id="b" class="flow-activity" data-flow-key="b" tabindex="-1"><rect x="120" width="100" height="30"/><g class="flow-pin"><rect x="220" width="10" height="10"/></g></g><g id="c" class="flow-activity"><g class="flow-pin"/></g></svg>';
 const ui=Pins.installFlowPinVisibility(root),shown=()=>[...root.querySelectorAll('.flow-pin')].filter(p=>w.getComputedStyle(p).display!=='none').map(p=>p.parentElement.id);
 const result={initial:shown()};f.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Shift',shiftKey:true}));result.shift=shown();f.dispatchEvent(new w.KeyboardEvent('keyup',{key:'Shift'}));result.released=shown();
 f.getElementById('b').classList.add('leaf-allpass');ui.update();result.next=shown();f.getElementById('c').classList.add('leaf-allpass');ui.update();result.allPass=shown();
 f.getElementById('a').classList.remove('leaf-allpass');ui.update();result.unexercisedFirst=shown();
 root.dispatchEvent(new w.PointerEvent('pointermove',{shiftKey:true}));result.enterHeld=shown();w.dispatchEvent(new w.Event('blur'));result.blur=shown();
 root.classList.add('flow-has-pin');f.getElementById('b').classList.add('flow-pinned');f.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Shift',shiftKey:true}));result.pinned=shown();
 f.getElementById('b').focus({preventScroll:true});const style=w.getComputedStyle(f.getElementById('b'));result.focusOutline=style.outlineStyle;result.focusFilter=w.getComputedStyle(f.getElementById('b').querySelector('rect')).filter;
 const node=f.getElementById('b'),flags=f.createElementNS('http://www.w3.org/2000/svg','g');flags.innerHTML='<circle data-node-flag-gid="mv" cx="150" cy="20" r="5" style="display:none"/><g data-node-flag-gid="ke" tabindex="0"><rect x="170" y="15" width="20" height="10"/></g>';node.append(flags);flags.querySelector('circle').style.display='none';const keyboard=Keys.installFlowKeyboardActions(root);let category;flags.addEventListener('click',e=>category=e.target.closest('[data-node-flag-gid]')?.dataset.nodeFlagGid);node.focus();node.dispatchEvent(new w.KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true}));result.keOnlyKeyboard=category==='ke';flags.querySelector('circle').style.display='';const ke=flags.querySelector('g');ke.focus();category=undefined;ke.dispatchEvent(new w.KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true}));result.focusedKeKeyboard=category==='ke';keyboard.dispose();
 ui.dispose();result.disposed=!root.classList.contains('flow-show-all-pins');frame.remove();return result;})()`,returnByValue:true});
 if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));const v=r.result.result.value;assert.ok(v.keOnlyKeyboard&&v.focusedKeKeyboard);
 assert.deepEqual(v.initial,['b']);assert.deepEqual(v.shift,['a','b','c']);assert.deepEqual(v.released,['b']);assert.deepEqual(v.next,['c']);assert.deepEqual(v.allPass,['a']);assert.deepEqual(v.unexercisedFirst,['a']);assert.deepEqual(v.enterHeld,['a','b','c']);assert.deepEqual(v.blur,['a']);assert.deepEqual(v.pinned,['b']);assert.equal(v.focusOutline,'none');assert.ok(v.focusFilter.includes('255, 255, 255'));assert.ok(v.disposed);console.log(v);
})().catch(e=>{console.error(e);process.exitCode=1});
