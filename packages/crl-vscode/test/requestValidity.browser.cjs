// REFACTOR:grounded: real LForms edits pass through the production session and pinned native engine.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({native,applySession,root,post,mounted,evaluate,rpc,delay})=>{
 const {emitCrlBundle}=require('@smile-digital-health/crl');
 const emitted=emitCrlBundle(path.resolve('packages/crl-vscode/src/testdata/request-validity/src/crl/request.crl'));
 assert.equal(emitted.success,true,JSON.stringify(emitted.diagnostics));
 const plan=emitted.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='PlanDefinition'&&r.type?.coding?.some(c=>c.code==='workflow-definition')).id;
 const request={resourceType:'ServiceRequest',id:'request',status:'active',intent:'order',subject:{reference:'Patient/p'},authoredOn:new Date().toISOString().slice(0,10),code:{coding:[{system:'http://example.org/fhir/CodeSystem/synthetic-request',code:'synthetic-service',display:'Synthetic service'}]}};
 const initial={id:'one',label:'one',subject:'Patient/p',bundle:{resourceType:'Bundle',type:'collection',entry:[{resource:{resourceType:'Patient',id:'p'}},{resource:request}]}},wire=[],receipts=[];
 const runner=native.nativeInteractiveRunner(async(r,o)=>{wire.push(JSON.parse(r.requestDataJson));return applySession(r,{...o,limits:{maxHeapMb:512}});},root);
 const session=new native.InteractiveSession(emitted.bundle,plan,runner);session.reset(initial);
 let result=await session.evaluate();
 const show=async()=>{await post({type:'reset',token:20,subject:'Patient/p'});await post({type:'result',token:20,...result,subject:'Patient/p'});await mounted();};
 const key=async(name,code,modifiers=0)=>{const windowsVirtualKeyCode={a:65,Backspace:8,ArrowDown:40,Enter:13}[name];await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:name,code,modifiers,windowsVirtualKeyCode});await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:name,code,modifiers,windowsVirtualKeyCode});};
 const clearChoice=async(index)=>{await evaluate(`document.querySelectorAll('#form input[role=combobox]')[${index}].focus()`);await key('a','KeyA',2);await key('Backspace','Backspace');};
 const selectChoice=async(index,second=false)=>{
  await clearChoice(index);
  for(let i=0;i<(second?2:1);i++)await key('ArrowDown','ArrowDown');
  await delay(100);await key('Enter','Enter');await delay(400);
 };
 const submit=async(name)=>{
  await evaluate(`document.getElementById('continue').click()`);
  const pair=await evaluate(`window.sent.filter(m=>m.type==='continue').at(-1)`);
  result=await session.evaluate(pair.response,pair.questionnaire);receipts.push({name,pair,result});
  fs.writeFileSync(path.join(root,'request-validity-progress.json'),JSON.stringify({wire,receipts},null,2));
 };
 await show();await selectChoice(1);await submit('answer-a');assert.deepEqual(result.activities,[]);
 const savedA=result.nativeData.entry.map(e=>e.resource).find(r=>r.resourceType==='Observation');assert.equal(savedA.code.coding[0].code,'condition-a');
 await show();await selectChoice(2);await submit('answer-b');assert.deepEqual(result.activities,['certify.Met']);
 const obs=result.nativeData.entry.map(e=>e.resource).filter(r=>r.resourceType==='Observation');assert.equal(obs.length,2);assert.deepEqual(obs.find(o=>o.code.coding[0].code==='condition-a'),savedA);
 await show();await submit('unchanged');assert.deepEqual(result.activities,['certify.Met']);assert.ok(!wire.at(-1).entry.some(e=>e.resource.resourceType==='QuestionnaireResponse'));
 await show();await selectChoice(2,true);await submit('change-b');assert.deepEqual(result.activities,['not-certify.Unmet']);
 await show();await clearChoice(2);await evaluate(`document.querySelectorAll('#form input[role=combobox]')[2].blur()`);await delay(400);await submit('clear-b');assert.deepEqual(result.activities,[]);
 for(const d of wire){assert.deepEqual(d.entry.find(e=>e.resource.resourceType==='ServiceRequest').resource,request);assert.ok(!d.entry.some(e=>e.resource.resourceType==='Observation'&&e.resource.code.coding[0].code==='requested-service'));}
 const cleared=result.nativeData.entry.map(e=>e.resource).find(r=>r.resourceType==='Observation'&&r.code.coding[0].code==='condition-b');assert.ok(!cleared.valueCodeableConcept);
 assert.deepEqual(result.nativeData.entry.map(e=>e.resource).find(r=>r.resourceType==='Observation'&&r.code.coding[0].code==='condition-a'),savedA);
 fs.writeFileSync(path.join(root,'request-validity.json'),JSON.stringify({passed:true,wire,receipts,savedA},null,2));
 console.log('Rendered same-day request default: cumulative answers, unchanged Continue, change and clear passed');
};
