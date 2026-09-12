// Run from the repository root with a development MV tree open and CDP enabled:
// CRL_TEST_CDP_URL=http://127.0.0.1:9258 node packages/crl-vscode/test/flowConnectorBorders.browser.cjs
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
const js=esbuild.buildSync({entryPoints:['packages/crl-vscode/src/flowConnectorBorders.ts'],bundle:true,write:false,format:'iife',globalName:'Connector'}).outputFiles[0].text;
const r=await rpc(t.target,'Runtime.evaluate',{expression:`(()=>{${js}
const d=document.querySelector('iframe').contentDocument,fixture=d.createElement('div');d.body.append(fixture);
fixture.innerHTML='<svg class="flow-svg" width="500" height="250" viewBox="0 0 500 250"><g data-flow-key="a"><rect x="20" y="20" width="100" height="44"/><g class="flow-ring"><rect x="17.5" y="17.5" width="105" height="49"/></g></g><g data-flow-key="b"><rect x="240" y="100" width="100" height="44"/></g><path class="flow-edge" data-flow-from="a" data-flow-to="b" d="M120 42 C180 42 180 122 240 122"/><path class="flow-def-edge" data-flow-from="a" data-flow-to="b" d="M30 42 V122 H240"/></svg>';
for(const n of fixture.querySelectorAll('rect')){n.style.stroke='blue';n.style.strokeWidth='2';}const ring=fixture.querySelector('.flow-ring');ring.style.display='inline';ring.querySelector('rect').style.strokeWidth='2.5';
const operator=d.createElementNS('http://www.w3.org/2000/svg','g');operator.dataset.flowKey='op';operator.innerHTML='<text x="40" y="80">ALL OF</text>';fixture.querySelector('svg').append(operator);
for(const [from,to,path] of [['a','op','M30 42 V80 H40'],['op','b','M40 80 V122 H240']]){const edge=d.createElementNS('http://www.w3.org/2000/svg','path');edge.setAttribute('class','flow-def-edge');edge.dataset.flowFrom=from;edge.dataset.flowTo=to;edge.setAttribute('d',path);fixture.querySelector('svg').append(edge);}
const paths=()=>[...fixture.querySelectorAll('path')].map(p=>p.getAttribute('d'));
Connector.alignFlowConnectorBorders(fixture);const selected=paths();Connector.alignFlowConnectorBorders(fixture);const stable=JSON.stringify(paths())===JSON.stringify(selected);
ring.style.display='none';Connector.alignFlowConnectorBorders(fixture);const plain=paths();
fixture.querySelector('[data-flow-key=a]').setAttribute('transform','translate(30 10)');fixture.querySelector('svg').style.transform='scale(0.75)';Connector.alignFlowConnectorBorders(fixture);const transformed=paths();
fixture.querySelector('[data-flow-key=b]').setAttribute('transform','translate(50 30)');Connector.alignFlowConnectorBorders(fixture);const movedTarget=paths();fixture.remove();return {selected,plain,transformed,movedTarget,stable};
})()`,returnByValue:true});if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));const v=r.result.result.value;
assert.equal(v.selected[0],'M123.75 42 C181.375 42 181.375 122 239 122');assert.equal(v.selected[1],'M30 67.75 V122 H239');assert.equal(v.plain[0],'M121 42 C180 42 180 122 239 122');assert.equal(v.transformed[0],'M151 52 C195 52 195 122 239 122');assert.equal(v.selected[2],'M30 67.75 V80 H40');assert.equal(v.selected[3],'M40 80 V122 H239');assert.equal(v.transformed[1],'M60 75 V122 H239');assert.equal(v.movedTarget[1],'M60 75 V152 H289');assert.equal(v.movedTarget[3],'M40 80 V152 H289');assert.ok(v.stable);console.log(v);
})().catch(e=>{console.error(e);process.exitCode=1});
