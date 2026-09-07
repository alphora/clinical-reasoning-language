'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {isDeepStrictEqual:same}=require('node:util');
const {hash,objects,nativeVerdict}=require('./check.cjs');
const classDir=path.join(__dirname,'session-classes');
const overlaySha256='3d7c2ff9492006ad06e8d61e7e5f5aff9a2c3c062b9579611f1361c05a98c6f8';
const classNames=[
  'org.opencds.cqf.fhir.cr.plandefinition.PlanDefinitionProcessor',
  'org.opencds.cqf.fhir.cr.questionnaireresponse.extract.ProcessDefinitionItem',
  'org.opencds.cqf.fhir.cr.questionnaire.populate.PopulateRequest',
  'org.opencds.cqf.fhir.cr.questionnaireresponse.extract.ExtractProcessor',
  'org.opencds.cqf.fhir.cr.questionnaireresponse.extract.r4.ObservationResolver',
  'org.opencds.cqf.fhir.cr.questionnaireresponse.extract.r5.ObservationResolver',
  'org.opencds.cqf.fhir.cr.common.IOperationRequest',
  'org.opencds.cqf.fhir.utility.GeneratedIds'];
function helperReady() {
  const m=JSON.parse(fs.readFileSync(path.join(classDir,'build.json'))),bytes=fs.readFileSync(path.join(classDir,'ApplySessionDriver.class'));
  assert.equal(m.sourceSha256,hash(fs.readFileSync(path.join(__dirname,'ApplySessionDriver.java'))),'Session source/class drift');
  assert.deepEqual(fs.readdirSync(classDir).sort(),['ApplySessionDriver.class','build.json']);
  assert.equal(m.classFileMajor,61);assert.equal(bytes.readUInt32BE(0),0xcafebabe);assert.equal(bytes.readUInt16BE(6),61);
  assert.deepEqual(m.classes,{'ApplySessionDriver.class':hash(bytes)});return m;
}
function checkOrigins(text,jar,overlay) {
  const entries=text.trim().split(/\r?\n/).map(l=>l.split('\t'));
  assert.deepEqual(entries.map(e=>e[0]),classNames,'Missing/duplicate engine class origins');
  const jarPart=pathToFileURL(jar).href.slice('file:'.length).replace(/^\/\//,'');
  for(const [i,[name,origin]] of entries.entries()) {
    if(overlay&&i>0) assert.equal(origin,pathToFileURL(overlay).href.replace('file:///','file:/'),name+' overlay not loaded');
    else if(!overlay&&i===7) assert.equal(origin,'ABSENT',name);
    else assert.ok(decodeURI(origin).includes(decodeURI(jarPart))&&origin.includes('/!BOOT-INF/lib/'),name+' did not load from pinned nested jar: '+origin);
  }
}
function single(v,type) {const a=objects(v,r=>r.resourceType===type);assert.equal(a.length,1,type);return a[0];}
function leaf(v,definition) {const a=objects(v,r=>r.definition===definition&&r.linkId&&r.type!=='group');assert.equal(a.length,1,definition);return a[0];}
function editResponse(q,qr,step,contract) {
  const submitted=structuredClone(qr),definition=contract.bindings[step.key].definition,item=leaf(submitted,definition);
  if(step.value===null) delete item.answer;
  else if(typeof step.value==='boolean') item.answer=[{valueBoolean:step.value}];
  else {const option=leaf(q,definition).answerOption.filter(o=>o.valueCoding?.code===step.value);assert.equal(option.length,1);item.answer=[{valueCoding:structuredClone(option[0].valueCoding)}];}
  submitted.authored=step.authored;checkEdit(qr,submitted,step,contract);return submitted;
}
function checkEdit(previous,submitted,step,contract) {
  const restored=structuredClone(submitted),definition=contract.bindings[step.key].definition,a=leaf(restored,definition),prior=leaf(previous,definition);
  if(Object.hasOwn(prior,'answer')) a.answer=structuredClone(prior.answer);else delete a.answer;
  if(Object.hasOwn(previous,'authored'))restored.authored=previous.authored;else delete restored.authored;
  assert.deepEqual(restored,previous,'Full QR changed outside edited answer/authored');
  assert.equal(submitted.authored,step.authored);
  const answer=leaf(submitted,definition).answer||[];
  if(step.value===null)assert.equal(answer.length,0);
  else {assert.equal(answer.length,1);assert.equal(typeof step.value==='boolean'?answer[0].valueBoolean:answer[0].valueCoding?.code,step.value);}
}
function checkExtraction({before,after,storedBefore,storedAfter,repoBefore,repoAfter,subject,contract,controls}) {
  const errors=[],expect=(v,m)=>{if(!v)errors.push(m);};
  expect(same(storedBefore.entry||[],storedAfter.entry||[]),'Stored Observations changed');
  expect(same(repoBefore,repoAfter),'Repository input bundle mutated');
  const resources=b=>(b.entry||[]).map(e=>e.resource),submitted=resources(before),returned=resources(after);
  expect(submitted.every(r=>['Questionnaire','QuestionnaireResponse'].includes(r.resourceType)),'Manually injected answer data');
  expect(returned.every(r=>['Questionnaire','QuestionnaireResponse','Observation'].includes(r.resourceType)),'Unexpected extracted resource type');
  // applyR5 extends/reversions the supplied Questionnaire as it advances. The submitted
  // response stays intact; the returned form's content is checked by nativeVerdict.
  expect(same(returned.filter(r=>r.resourceType==='QuestionnaireResponse'),submitted.filter(r=>r.resourceType==='QuestionnaireResponse')),'Submitted QR mutated');
  expect(returned.filter(r=>r.resourceType==='Questionnaire').length===submitted.filter(r=>r.resourceType==='Questionnaire').length,'Request Questionnaire lost/duplicated');
  const observations=returned.filter(r=>r.resourceType==='Observation');
  if(!submitted.length){expect(observations.length===0,'Initial request extracted data');return {passed:!errors.length,errors,count:observations.length};}
  expect(submitted.length===2&&submitted.filter(r=>r.resourceType==='Questionnaire').length===1&&submitted.filter(r=>r.resourceType==='QuestionnaireResponse').length===1,'Request must contain complete Q and QR');
  const qr=single(before,'QuestionnaireResponse'),items=objects(qr,r=>r.definition&&r.linkId&&r.definition.endsWith('#Observation.value[x]'));
  expect(observations.length===items.length,'Wrong extracted Observation count');
  for(const item of items) {
    const profile=item.definition.split('#')[0],found=observations.filter(o=>o.meta?.profile?.some(p=>p.split('|')[0]===profile));
    expect(found.length===1,'Missing/duplicate extraction: '+profile);if(found.length!==1)continue;
    const o=found[0],control=controls.filter(r=>r.resourceType==='Observation'&&r.meta?.profile?.includes(profile));
    expect(control.length===1,'Missing independent CEL code control: '+profile);
    if(control.length===1)expect(same(o.code,control[0].code),'Wrong local code: '+profile);
    expect(o.subject?.reference===subject,'Wrong extracted subject: '+profile);
    expect(o.effectiveDateTime===qr.authored,'Wrong extracted timestamp: '+profile);
    expect(o.status==='final','Wrong extracted status: '+profile);
    const a=item.answer||[],values=Object.keys(o).filter(k=>k.startsWith('value'));
    if(!a.length)expect(values.length===0,'Blank answer became a value: '+profile);
    else if(a.length!==1)errors.push('Unexpected answer multiplicity: '+profile);
    else if(Object.hasOwn(a[0],'valueBoolean'))expect(same(values,['valueBoolean'])&&o.valueBoolean===a[0].valueBoolean,'Boolean extraction changed: '+profile);
    else if(a[0].valueCoding)expect(same(values,['valueCodeableConcept'])&&same(o.valueCodeableConcept?.coding,[a[0].valueCoding]),'Coding extraction changed: '+profile);
    else errors.push('Unsupported extracted answer: '+profile);
  }
  return {passed:!errors.length,errors,count:observations.length};
}
function sessionVerdict(result,entry,contract,step,subject,processResult) {
  // Session form retention is explicit and separate from direct-data question presence.
  const c=structuredClone(contract),e=structuredClone(entry);e.caseId='session';e.expected=step.expected;
  c.unknownQuestionPresence.session=step.questions;
  // This helper writes Parameters to a file: stdout is ALL logging. The production
  // stdout-JSON driver's prefix parser must not hide errors or null witnesses here.
  return nativeVerdict(result,e,c,subject,{...processResult,stdout:'',stderr:(processResult.stderr||'')+'\n'+(processResult.stdout||'')});
}
module.exports={classDir,overlaySha256,helperReady,checkOrigins,single,leaf,editResponse,checkEdit,checkExtraction,sessionVerdict};
