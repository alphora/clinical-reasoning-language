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
const t=(await panes()).find(p=>p.text.includes('Selected path'));
const js=esbuild.buildSync({entryPoints:['packages/crl-vscode/src/routeCardsWebview.ts'],bundle:true,write:false,format:'iife',globalName:'CardModule'}).outputFiles[0].text;
const expression=`(()=>{${js}
const d=document.querySelector('iframe').contentDocument,fixture=d.createElement('div');d.body.append(fixture);
const style=d.createElement('style');style.nonce=d.querySelector('style')?.nonce??'';style.textContent=CardModule.ROUTE_CARD_STYLE;d.head.append(style);
fixture.innerHTML='<svg class="flow-svg" viewBox="0 0 900 600" width="900" height="600"><g data-flow-key="w" data-flow-when="w"><rect x="20" y="100" width="168" height="44"/></g><g data-flow-key="q1" data-flow-parent="w" data-flow-when="w" data-flow-outline="1"><rect x="35" y="180" width="150" height="34"/></g><g data-flow-key="q2" data-flow-parent="w" data-flow-when="w" data-flow-outline="1"><rect x="35" y="240" width="150" height="34"/></g><g data-flow-key="c" data-flow-parent="w" data-flow-when="w" data-flow-outline="1"><rect x="35" y="300" width="150" height="34"/></g><g data-flow-key="end" class="flow-pinned"><rect x="240" y="100" width="168" height="44"/><g class="flow-pin"><rect x="414" y="82" width="22" height="22"/></g></g><path class="flow-edge" data-flow-from="w" data-flow-to="end" d="M188 122 L240 122"/></svg>';
for(const key of ['q1','q2'])fixture.querySelector('[data-flow-key='+key+']').dataset.flowQuestion=JSON.stringify(['L','Q']);fixture.querySelector('[data-flow-key=c]').dataset.flowHiddenCriterion=JSON.stringify(['L','C']);fixture.querySelector('[data-flow-key=c]').dataset.flowCriterion=JSON.stringify(['L','C']);
const svgFixture=fixture.querySelector('svg');
svgFixture.insertAdjacentHTML('beforeend','<g data-flow-key="input" data-flow-parent="w" data-flow-outline="1" data-flow-decoration="input"><text x="35" y="150">INPUT</text></g><g data-flow-key="option" data-flow-parent="q1" data-flow-outline="1" data-flow-decoration="choices"><rect x="35" y="220" width="150" height="30"/></g><path class="flow-def-edge" data-flow-from="input" data-flow-to="q1" d="M35 150 L35 180"/><path data-flow-from="q1" data-flow-to="option" d="M35 180 L35 220"/><g data-flow-choices-toggle="1"><text>Choices</text></g><g class="criterion-toggle"><text>Criterion</text></g>');
fixture.querySelector('[data-flow-key=q1]').dataset.flowParent='input';
const original=fixture.innerHTML,messages=[];
const ui=CardModule.installRouteCards(fixture,{postMessage:m=>messages.push(m)},()=>1);
ui.show({token:'t',label:'case',cards:[{id:'card-0',ownerKey:'w',library:'L',concept:'Q',text:'Question?',description:'Guidance',value:'Yes',answerChoices:[{code:'a',display:'Complete <choice> wording',selected:true},{code:'b',display:'Second choice',selected:false}],editable:true,scopeLabel:'all uses in this library',criterionPaths:[[],[{lib:'L',name:'C'}]]}]});
const result={attached:fixture.querySelectorAll('.route-card').length,hidden:[...fixture.querySelectorAll('.route-question-badge')].find(n=>n.textContent.includes('Hidden questions'))?.textContent};
const geometry=()=>{
 const forms=[...fixture.querySelectorAll('.route-card')];const boxes=['q1','q2'].map(key=>fixture.querySelector('[data-flow-key='+key+'] > rect').getBoundingClientRect());
 return forms.map((f,i)=>({below:f.getBoundingClientRect().top>=boxes[i].bottom,clearNext:i===forms.length-1||f.getBoundingClientRect().bottom<=boxes[i+1].top,background:d.defaultView.getComputedStyle(f).backgroundColor,border:d.defaultView.getComputedStyle(f).borderTopWidth}));
};result.geometry=geometry();
result.choicesInitiallyCollapsed=!fixture.querySelector('.route-answer-choices')&&fixture.querySelector('.route-choices-toggle').getAttribute('aria-expanded')==='false';
result.decorationsHidden=[...fixture.querySelectorAll('[data-flow-decoration],[data-flow-choices-toggle]')].every(n=>d.defaultView.getComputedStyle(n).display==='none');
result.criterionRetained=d.defaultView.getComputedStyle(fixture.querySelector('.criterion-toggle')).display!=='none';
result.inputBypassed=fixture.querySelector('path[data-flow-to=q1]').dataset.flowFrom==='w';
fixture.querySelector('.route-choices-toggle').click();
result.choiceText=fixture.querySelector('.route-answer-choices li').textContent;result.selectedCount=fixture.querySelectorAll('.route-answer-choices .is-selected').length;result.noAuthoredHtml=!fixture.querySelector('.route-answer-choices choice');result.choicesGeometry=geometry();
fixture.querySelector('.route-choices-toggle').click();
const secondDescription=fixture.querySelectorAll('.route-description-toggle')[1],descriptionBefore=secondDescription.getBoundingClientRect();secondDescription.click();result.expandedGeometry=geometry();
result.secondDescriptionFocus=d.activeElement===fixture.querySelectorAll('.route-description-toggle')[1];
result.noAnswerLabel=!fixture.querySelector('.route-answer-label');
const secondChoices=fixture.querySelectorAll('.route-choices-toggle')[1];secondChoices.click();result.secondChoicesFocus=d.activeElement===fixture.querySelectorAll('.route-choices-toggle')[1];fixture.querySelectorAll('.route-choices-toggle')[1].click();
fixture.querySelectorAll('.route-card-edit')[1].click();result.editorHeading=fixture.querySelector('.route-card-editor:not([hidden]) p').textContent;result.openEditors=fixture.querySelectorAll('.route-card-editor:not([hidden])').length;result.editorGeometry=geometry();
const input=fixture.querySelector('.route-card-editor:not([hidden]) textarea');input.value='Edited second question';input.dispatchEvent(new Event('input',{bubbles:true}));
fixture.querySelector('.route-layout-toggle').dispatchEvent(new MouseEvent('click',{bubbles:true}));result.columnCards=fixture.querySelectorAll('.route-card').length;result.panelAbove=fixture.querySelector('.route-questionnaire').getBoundingClientRect().bottom<=Math.min(...[...fixture.querySelectorAll('[data-flow-key] > rect')].filter(n=>d.defaultView.getComputedStyle(n.parentElement).display!=='none').map(n=>n.getBoundingClientRect().top));result.panelBorder=d.defaultView.getComputedStyle(fixture.querySelector('.route-questionnaire')).borderTopWidth;result.answer=fixture.querySelector('.route-card-value').textContent;result.answerBorder=d.defaultView.getComputedStyle(fixture.querySelector('.route-card-value')).borderTopWidth;result.numberBorder=d.defaultView.getComputedStyle(fixture.querySelector('.route-card-caption')).borderTopWidth;result.connectors=fixture.querySelectorAll('.route-card-connector').length;result.draft=fixture.querySelector('.route-card-editor:not([hidden]) textarea').value;
const toggleRect=fixture.querySelector('.route-layout-toggle rect').getBoundingClientRect(),pinRect=fixture.querySelector('.flow-pinned .flow-pin rect').getBoundingClientRect();
result.toggleBelowPin=toggleRect.top>pinRect.bottom;result.toggleAligned=Math.abs(toggleRect.left-pinRect.left)<1;result.toggleInside=toggleRect.right<=fixture.querySelector('svg').getBoundingClientRect().right;
result.nodeAnswers=[...fixture.querySelectorAll('.route-question-badge text')].map(n=>n.textContent).filter(t=>!t.startsWith('?'));
fixture.querySelector('.route-layout-toggle').dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));result.keyboardAttached=!fixture.querySelector('.route-questionnaire');
fixture.querySelector('.route-layout-toggle').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));result.keyboardColumn=!!fixture.querySelector('.route-questionnaire');result.pinPreserved=!!fixture.querySelector('.flow-pinned');result.toggleFocus=fixture.ownerDocument.activeElement===fixture.querySelector('.route-layout-toggle');
[...fixture.querySelectorAll('.route-card-editor:not([hidden]) button')].find(b=>b.textContent==='Save change').click();result.saved=messages[0];
fixture.querySelector('.route-layout-toggle').focus();fixture.querySelector('.route-layout-toggle').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));result.shiftEnterUnchanged=!!fixture.querySelector('.route-questionnaire');
fixture.querySelector('.route-questions-toggle').click();
result.pureTree=!fixture.querySelector('.route-card,.route-questionnaire,.route-question-badge,.route-layout-toggle')&&!!fixture.querySelector('.flow-pinned');
result.questionsOff=fixture.querySelector('.route-questions-toggle').getAttribute('aria-pressed')==='false';
fixture.querySelector('.route-questions-toggle').click();result.restoredColumn=!!fixture.querySelector('.route-questionnaire');
result.nodeVariants=[];
for(const value of ['No','Not answered','Determination: Unknown · Available value: Yes','A coded answer']){
 ui.show({token:'variant-'+value,label:'case',cards:[{id:'v',ownerKey:'w',library:'L',concept:'Q',text:'Question?',description:'',value,editable:false,criterionPaths:[[]]}]});
 result.nodeVariants.push([...fixture.querySelectorAll('.route-question-badge text')].map(n=>n.textContent));
}
ui.reset();result.restored=fixture.innerHTML===original;
fixture.querySelectorAll('[data-flow-outline]').forEach(n=>n.remove());
const svg=fixture.querySelector('svg');
for(const [key,parent,name,y,collapsed] of [['a','w','OuterA',180,false],['sa','a','Shared',230,true],['b','w','OuterB',280,false],['sb','b','Shared',330,true]]) {
 const n=d.createElementNS('http://www.w3.org/2000/svg','g');Object.assign(n.dataset,{flowKey:key,flowParent:parent,flowWhen:'w',flowOutline:'1',flowCriterion:JSON.stringify(['L',name])});if(collapsed)n.dataset.flowHiddenCriterion=n.dataset.flowCriterion;
 const rect=d.createElementNS('http://www.w3.org/2000/svg','rect');for(const [k,v] of Object.entries({x:35,y,width:150,height:34}))rect.setAttribute(k,v);n.append(rect);svg.append(n);
}
ui.show({token:'nested',label:'nested',cards:['OuterA','OuterB'].map((outer,i)=>({id:'nested-'+i,ownerKey:'w',library:'L',concept:'Q',text:outer+' question?',description:'',value:'Yes',editable:false,criterionPaths:[[{lib:'L',name:outer},{lib:'L',name:'Shared'}]]}))});
result.nestedHidden=[...fixture.querySelectorAll('.route-question-badge title')].map(n=>n.textContent);ui.reset();fixture.remove();style.remove();return result;
})()`;
const r=await rpc(t.target,'Runtime.evaluate',{expression,returnByValue:true});if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));const v=r.result.result.value;assert.equal(v.attached,2);assert.ok(v.secondDescriptionFocus&&v.secondChoicesFocus&&v.noAnswerLabel);assert.equal(v.editorHeading,'Edit Question:');assert.ok(v.choicesInitiallyCollapsed&&v.decorationsHidden&&v.criterionRetained&&v.inputBypassed);assert.equal(v.choiceText,'Complete <choice> wordingSelected');assert.equal(v.selectedCount,2);assert.ok(v.noAuthoredHtml&&v.pureTree&&v.questionsOff&&v.restoredColumn);for(const g of [...v.geometry,...v.choicesGeometry,...v.expandedGeometry,...v.editorGeometry]){assert.ok(g.below);assert.ok(g.clearNext);assert.equal(g.background,'rgba(180, 180, 180, 0.15)');assert.equal(g.border,'0px');}assert.equal(v.answer,'Yes');assert.ok(v.toggleBelowPin&&v.toggleAligned&&v.toggleInside);assert.ok(v.shiftEnterUnchanged);assert.ok(v.keyboardAttached&&v.keyboardColumn&&v.pinPreserved&&v.toggleFocus);assert.deepEqual(v.nodeAnswers,['#1 Yes','#1 Yes']);assert.equal(v.answerBorder,'1px');assert.equal(v.numberBorder,'1px');assert.equal(v.panelBorder,'1px');assert.match(v.hidden,/Hidden questions: 1/);assert.equal(v.openEditors,1);assert.equal(v.columnCards,1);assert.ok(v.panelAbove);assert.equal(v.connectors,0);assert.equal(v.draft,'Edited second question');assert.equal(v.saved.fields.questionText,'Edited second question');assert.equal(v.restored,true);assert.deepEqual(v.nodeVariants,[['#1 No','#1 No'],['#1','#1'],['#1','#1'],['#1','#1']]);assert.deepEqual(v.nestedHidden,['Hidden questions: 1. Expand this condition to show them.','Hidden questions: 2. Expand this condition to show them.']);console.log(v);
})().catch(e=>{console.error(e);process.exitCode=1});
