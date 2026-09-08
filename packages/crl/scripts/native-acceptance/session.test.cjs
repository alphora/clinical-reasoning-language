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
  return {before:bundle([response]),after:bundle([structuredClone(response),o]),storedBefore:bundle([]),storedAfter:bundle([]),repoBefore:bundle([]),repoAfter:bundle([]),subject:'Patient/test',contract,controls:[{resourceType:'Observation',meta:{profile:[profile]},code}]};
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
  'lost false':e=>delete e.after.entry[1].resource.valueBoolean,
  'false turned true':e=>e.after.entry[1].resource.valueBoolean=true,
  'wrong subject':e=>e.after.entry[1].resource.subject.reference='Patient/other',
  'wrong authored time':e=>e.after.entry[1].resource.effectiveDateTime='2020-01-01',
  'wrong local code':e=>e.after.entry[1].resource.code={coding:[{system:'wrong',code:'cosmetic'}]},
  'duplicate observation':e=>e.after.entry.push(structuredClone(e.after.entry[1])),
  'manually injected data':e=>e.before.entry.push(structuredClone(e.after.entry[1])),
  'unexpected persistence':e=>e.storedAfter.entry.push(structuredClone(e.after.entry[1])),
  'repository mutation':e=>e.repoAfter.entry.push(structuredClone(e.after.entry[1])),
  'submitted response mutation':e=>e.after.entry[0].resource.item[0].item[0].answer=[{valueBoolean:true}],
  'unexpected extraction type':e=>e.after.entry.push({resource:{resourceType:'Condition'}})
};
for(const [name,mutate] of Object.entries(mutations))test('rejects '+name,()=>{const e=evidence();mutate(e);assert.equal(checkExtraction(e).passed,false);});
test('lost Coding system/code/display fails even when a code remains',()=>{
  for(const key of ['system','code','display']) {const e=evidence(true);e.after=structuredClone(e.after);delete e.after.entry[1].resource.valueCodeableConcept.coding[0][key];assert.equal(checkExtraction(e).passed,false);}
});
test('dated valueless extraction stays unknown',()=>{
  const e=evidence();delete e.before.entry[0].resource.item[0].item[0].answer;delete e.after.entry[0].resource.item[0].item[0].answer;delete e.after.entry[1].resource.valueBoolean;
  assert.equal(checkExtraction(e).passed,true);e.after.entry[1].resource.valueBoolean=false;assert.equal(checkExtraction(e).passed,false);
});
test('Questionnaire supplied directly, contained or preloaded fails QR-only contract',()=>{
  for(const target of ['direct','contained','repository']) {
    const e=evidence();
    if(target==='direct')e.before.entry.push({resource:q});
    if(target==='contained')e.before.entry[0].resource.contained=[q];
    if(target==='repository')e.repoBefore.entry.push({resource:q});
    assert.equal(checkExtraction(e).passed,false);
  }
});

test('runtime helper matches source and Java17 floor',()=>assert.equal(helperReady().classFileMajor,61));
test('missing class-origin evidence cannot pass',()=>assert.throws(()=>checkOrigins('',path.resolve('engine.jar'))));

const {sessionEngine,originalEngineSha256}=require('./session-check.cjs');
test('session admits corrected jar and explicit original control, rejects unknown and mixed overlay',()=>{
  const current={buildId:'corrected',sha256:'corrected-hash'};
  assert.equal(sessionEngine('corrected-hash',undefined,current).original,false);
  assert.equal(sessionEngine('corrected-hash',undefined,current).mode,'corrected');
  assert.equal(sessionEngine(originalEngineSha256,undefined,current).original,true);
  assert.equal(sessionEngine(originalEngineSha256,undefined,current).mode,'original-pinned-engine');
  assert.equal(sessionEngine(originalEngineSha256,'reviewed-overlay',current).original,true);
  assert.equal(sessionEngine(originalEngineSha256,'reviewed-overlay',current).mode,'explicit-reviewed-overlay');
  assert.throws(()=>sessionEngine('corrected-hash','reviewed-overlay',current),/only compatible/);
  assert.throws(()=>sessionEngine('unknown',undefined,current),/Unrecognized/);
});

const {carryExtractionBindings,sessionLogs}=require('./session-check.cjs');
const bindingUrl='http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-definitionExtractValue';
const binding={url:bindingUrl,extension:[{url:'expression',valueExpression:{language:'text/fhirpath',expression:'%resource.subject'}}]};
test('bindings replace stale values and preserve unrelated metadata; copying is pure/idempotent',()=>{
 const form={item:[{linkId:'1',definition,extension:[binding]}]};
 const response={item:[{linkId:'1',definition,extension:[{url:'urn:other',valueString:'keep'},{url:bindingUrl,valueString:'stale'}],answer:[{valueBoolean:false}]}]};
 const original=structuredClone(response),out=carryExtractionBindings(form,response);
 assert.deepEqual(response,original);assert.deepEqual(out.item[0].extension,[{url:'urn:other',valueString:'keep'},binding]);
 assert.deepEqual(carryExtractionBindings(form,out),out);assert.equal(out.item[0].answer[0].valueBoolean,false);
 form.item[0].extension=[];
 assert.deepEqual(carryExtractionBindings(form,out).item[0].extension,[{url:'urn:other',valueString:'keep'}]);
});
test('copies to nested answer items and repeated response instances without deleting answers',()=>{
 const form={item:[{linkId:'parent',item:[{linkId:'child',definition,extension:[binding]}]}]};
 const response={item:[{linkId:'parent',answer:[{valueBoolean:true,item:[{linkId:'child',definition,answer:[{valueBoolean:false}]}]},{valueBoolean:false,item:[{linkId:'child',definition}]}]}]};
 const out=carryExtractionBindings(form,response);
 for(const a of out.item[0].answer)assert.deepEqual(a.item[0].extension,[binding]);
 assert.equal(out.item[0].answer[0].item[0].answer[0].valueBoolean,false);
});
test('binding copy refuses missing/duplicate mappings and mismatched definitions',()=>{
 const item={linkId:'1',definition},response={item:[item]};
 assert.throws(()=>carryExtractionBindings({item:[]},response),/no matching/);
 assert.throws(()=>carryExtractionBindings({item:[item,item]},response),/duplicate/);
 assert.throws(()=>carryExtractionBindings({item:[{...item,definition:'wrong'}]},response),/definition mismatch/);
});
test('only exact recoverable lookup diagnostic for the submitted canonical is admitted once',()=>{
 const canonical='http://test/Questionnaire/x|1',line='[main] ERROR org.opencds.cqf.fhir.cr.questionnaireresponse.QuestionnaireResponseProcessor - No resource of type Questionnaire found for url: '+canonical;
 const logs=sessionLogs({stdout:line+'\nERROR different failure',stderr:''},{questionnaire:canonical});
 assert.deepEqual(logs.diagnostics,[line]);assert.match(logs.remaining,/ERROR different/);
 assert.match(sessionLogs({stdout:line},{questionnaire:'other'}).remaining,/ERROR/);
 assert.match(sessionLogs({stdout:line}).remaining,/ERROR/);
 assert.match(sessionLogs({stdout:line+'\n'+line},{questionnaire:canonical}).remaining,/ERROR/);
});
