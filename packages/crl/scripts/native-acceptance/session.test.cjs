'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {checkExtraction,editResponse,checkEdit,helperReady,checkOrigins}=require('./session-check.cjs');
const profile='http://test/StructureDefinition/cosmetic',definition=profile+'#Observation.value[x]';
const contract={bindings:{cosmetic:{definition}}};
const q={resourceType:'Questionnaire',item:[{linkId:'1',definition,type:'boolean'}]};
const qr={resourceType:'QuestionnaireResponse',subject:{reference:'Patient/test'},item:[{linkId:'group',item:[{linkId:'1',definition,answer:[{valueBoolean:true}]}]}]};
const step={key:'cosmetic',value:false,authored:'2026-09-09T12:00:00Z'};
const bundle=resources=>({resourceType:'Bundle',entry:resources.map(resource=>({resource}))});
function evidence(coding=false) {
  const response=editResponse(q,qr,step,contract);if(coding)response.item[0].item[0].answer=[{valueCoding:{system:'http://test',code:'none',display:'None'}}];
  const code={coding:[{system:'http://test/local',code:'cosmetic'}]},o={resourceType:'Observation',meta:{profile:[profile+'|1']},code,subject:{reference:'Patient/test'},effectiveDateTime:step.authored,status:'final'};
  if(coding)o.valueCodeableConcept={coding:[response.item[0].item[0].answer[0].valueCoding]};else o.valueBoolean=false;
  return {before:bundle([q,response]),after:bundle([structuredClone(q),structuredClone(response),o]),storedBefore:bundle([]),storedAfter:bundle([]),repoBefore:bundle([]),repoAfter:bundle([]),subject:'Patient/test',contract,controls:[{resourceType:'Observation',meta:{profile:[profile]},code}]};
}
test('full QR edit preserves groups, subject, and all other content',()=>{
  const submitted=editResponse(q,qr,step,contract);assert.equal(submitted.item[0].item[0].answer[0].valueBoolean,false);
  assert.equal(qr.item[0].item[0].answer[0].valueBoolean,true);
  submitted.subject.reference='Patient/other';assert.throws(()=>checkEdit(qr,submitted,step,contract),/Full QR/);
});
test('clear keeps complete item and removes answer without manufacturing false',()=>{
  const s={...step,value:null},submitted=editResponse(q,qr,s,contract);assert.equal(submitted.item[0].item[0].answer,undefined);checkEdit(qr,submitted,s,contract);
  submitted.item[0].item[0].answer=[{valueBoolean:false}];assert.throws(()=>checkEdit(qr,submitted,s,contract));
});
test('preserves explicit false and complete Coding',()=>{
  assert.equal(checkExtraction(evidence()).passed,true);assert.equal(checkExtraction(evidence(true)).passed,true);
});
const mutations={
  'lost false':e=>delete e.after.entry[2].resource.valueBoolean,
  'false turned true':e=>e.after.entry[2].resource.valueBoolean=true,
  'wrong subject':e=>e.after.entry[2].resource.subject.reference='Patient/other',
  'wrong authored time':e=>e.after.entry[2].resource.effectiveDateTime='2020-01-01',
  'wrong local code':e=>e.after.entry[2].resource.code={coding:[{system:'wrong',code:'cosmetic'}]},
  'duplicate observation':e=>e.after.entry.push(structuredClone(e.after.entry[2])),
  'manually injected data':e=>e.before.entry.push(structuredClone(e.after.entry[2])),
  'unexpected persistence':e=>e.storedAfter.entry.push(structuredClone(e.after.entry[2])),
  'repository mutation':e=>e.repoAfter.entry.push(structuredClone(e.after.entry[2])),
  'submitted response mutation':e=>e.after.entry[1].resource.item[0].item[0].answer=[{valueBoolean:true}],
  'unexpected extraction type':e=>e.after.entry.push({resource:{resourceType:'Condition'}})
};
for(const [name,mutate] of Object.entries(mutations))test('rejects '+name,()=>{const e=evidence();mutate(e);assert.equal(checkExtraction(e).passed,false);});
test('lost Coding system/code/display fails even when a code remains',()=>{
  for(const key of ['system','code','display']) {const e=evidence(true);e.after=structuredClone(e.after);delete e.after.entry[2].resource.valueCodeableConcept.coding[0][key];assert.equal(checkExtraction(e).passed,false);}
});
test('dated valueless extraction stays unknown',()=>{
  const e=evidence();delete e.before.entry[1].resource.item[0].item[0].answer;delete e.after.entry[1].resource.item[0].item[0].answer;delete e.after.entry[2].resource.valueBoolean;
  assert.equal(checkExtraction(e).passed,true);e.after.entry[2].resource.valueBoolean=false;assert.equal(checkExtraction(e).passed,false);
});
test('questionnaire expansion does not imply response or data mutation',()=>{
  const e=evidence();e.after.entry[0].resource.version='new';e.after.entry[0].resource.item.push({linkId:'new'});assert.equal(checkExtraction(e).passed,true);
});
test('runtime helper matches source and Java17 floor',()=>assert.equal(helperReady().classFileMajor,61));
test('missing class-origin evidence cannot pass',()=>assert.throws(()=>checkOrigins('',path.resolve('engine.jar'))));
