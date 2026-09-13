// Run from the repository root with a development MV tree open and CDP enabled:
// CRL_TEST_CDP_URL=http://127.0.0.1:9258 node packages/crl-vscode/test/routeCards.browser.cjs
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
 const target=(await panes()).find(p=>p.text.includes('Selected path')).target;
 const js=esbuild.buildSync({entryPoints:['packages/crl-vscode/src/flagBadgesWebview.ts'],bundle:true,write:false,format:'iife',globalName:'Flags'}).outputFiles[0].text;
 const cssModule={exports:{}};new Function('require','module','exports',esbuild.buildSync({entryPoints:['packages/crl-vscode/src/flowPaneHtml.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text)(require,cssModule,cssModule.exports);
 const styles='const Flow='+JSON.stringify({FLOW_STYLE:cssModule.exports.FLOW_STYLE})+';';
 const r=await rpc(target,'Runtime.evaluate',{expression:`(()=>{${js}${styles}
 const d=document.querySelector('iframe').contentDocument,host=d.createElement('div'),style=d.createElement('style');style.nonce=d.querySelector('style[nonce]')?.nonce??'';style.textContent=Flow.FLOW_STYLE;d.head.append(style);d.body.append(host);
 host.innerHTML='<svg><g id="flag-fixture" class="flow-row"><g class="flow-flag-badge flow-flag-create"><title></title><circle class="flow-flag-control" r="9"/><text class="flow-flag-glyph"></text><g class="flow-flag-authoring"><rect/><text>KE</text></g></g></g></svg>';
 const paint=(open,resolved,authoringOpen,authoringResolved)=>Flags.paintFlagBadges(d,{flaggableGids:['flag-fixture'],summaries:open+resolved?[{gid:'flag-fixture',open,resolved,authoringOpen,authoringResolved}]:[]});
 const read=()=>{const b=host.querySelector('.flow-flag-badge'),ai=b.querySelector('.flow-flag-authoring');return {state:b.dataset.flagState,ai:ai.dataset.flagState,glyph:b.querySelector('.flow-flag-glyph').textContent,label:b.querySelector('.flow-flag-control').getAttribute('aria-label'),display:d.defaultView.getComputedStyle(b.querySelector('.flow-flag-control')).display,fill:d.defaultView.getComputedStyle(b.querySelector('circle')).fill,aiFill:d.defaultView.getComputedStyle(ai.querySelector('rect')).fill};};
 paint(1,0,1,0);const keOnly=read();paint(1,1,0,1);const humanOpen=read();paint(1,1,1,0);const authoringOpen=read();paint(0,1,0,1);const resolved=read();paint(0,1,0,0);const mvResolved=read();paint(0,0,0,0);const empty=read();host.querySelector('.flow-flag-badge').classList.remove('flow-flag-create');paint(1,0,1,0);const rollup=read();host.remove();style.remove();return {rollup,keOnly,humanOpen,authoringOpen,resolved,mvResolved,empty};})()`,returnByValue:true});
 if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));const v=r.result.result.value;
 assert.equal(v.rollup.state,'none');assert.equal(v.rollup.ai,'open');assert.equal(v.rollup.display,'none');assert.equal(v.rollup.label,'No MV flags');assert.equal(v.humanOpen.state,'open');assert.equal(v.humanOpen.ai,'resolved');assert.notEqual(v.humanOpen.fill,v.humanOpen.aiFill);assert.equal(v.authoringOpen.ai,'open');assert.notEqual(v.authoringOpen.fill,v.authoringOpen.aiFill);assert.equal(v.authoringOpen.state,'resolved');assert.equal(v.resolved.state,'none');assert.equal(v.resolved.ai,'resolved');assert.equal(v.resolved.glyph,'⚑');assert.equal(v.empty.glyph,'⚑');assert.equal(v.keOnly.state,'none');assert.equal(v.keOnly.ai,'open');assert.equal(v.keOnly.fill,v.empty.fill);assert.equal(v.mvResolved.fill,v.resolved.aiFill);assert.notEqual(v.mvResolved.fill,v.empty.fill);assert.equal(v.empty.state,'none');assert.equal(v.empty.ai,'none');assert.equal(v.empty.label,'Add flag');console.log(v);
})().catch(e=>{console.error(e);process.exitCode=1});

