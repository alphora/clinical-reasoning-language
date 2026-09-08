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
  'org.opencds.cqf.fhir.utility.GeneratedIds',
  'org.opencds.cqf.fhir.cr.CrSettings',
  'org.opencds.cqf.fhir.cr.plandefinition.apply.ApplyRequest',
  'org.opencds.cqf.fhir.cr.plandefinition.apply.ProcessAction'];
function helperReady() {
  const m=JSON.parse(fs.readFileSync(path.join(classDir,'build.json'))),bytes=fs.readFileSync(path.join(classDir,'ApplySessionDriver.class'));
  assert.equal(m.sourceSha256,hash(fs.readFileSync(path.join(__dirname,'ApplySessionDriver.java'))),'Session source/class drift');
  assert.deepEqual(fs.readdirSync(classDir).sort(),['ApplySessionDriver.class','build.json']);
  assert.equal(m.classFileMajor,61);assert.equal(bytes.readUInt32BE(0),0xcafebabe);assert.equal(bytes.readUInt16BE(6),61);
  assert.deepEqual(m.classes,{'ApplySessionDriver.class':hash(bytes)});return m;
}
const originalEngineSha256='10e6ae4e0846671bdfb8005fd577e9c195c7e9896bbd21342002eecd055e6ae0';
function sessionEngine(engineHash,overlay,current) {
  const original=engineHash===originalEngineSha256;
  assert.ok(original||engineHash===current.sha256,'Unrecognized session engine build');
  assert.ok(!overlay||original,'Test overlay is only compatible with the original4.7 engine');
  return original?{buildId:'upstream-4.7.0',sha256:originalEngineSha256,original:true,mode:overlay?'explicit-reviewed-overlay':'original-pinned-engine'}:{...current,original:false,mode:current.buildId};
}
const overlayClasses=new Set([
  'org.opencds.cqf.fhir.cr.questionnaireresponse.extract.ProcessDefinitionItem',
  'org.opencds.cqf.fhir.cr.questionnaire.populate.PopulateRequest',
  'org.opencds.cqf.fhir.cr.questionnaireresponse.extract.ExtractProcessor',
  'org.opencds.cqf.fhir.cr.questionnaireresponse.extract.r4.ObservationResolver',
  'org.opencds.cqf.fhir.cr.questionnaireresponse.extract.r5.ObservationResolver',
  'org.opencds.cqf.fhir.cr.common.IOperationRequest',
  'org.opencds.cqf.fhir.utility.GeneratedIds']);
function checkOrigins(text,jar,overlay,hasGeneratedIds=Boolean(overlay)) {
  const entries=text.trim().split(/\r?\n/).map(l=>l.split('\t'));
  assert.deepEqual(entries.map(e=>e[0]),classNames,'Missing/duplicate engine class origins');
  const jarPart=pathToFileURL(jar).href.slice('file:'.length).replace(/^\/\//,'');
  for(const [name,origin] of entries) {
    if(overlay&&overlayClasses.has(name)) assert.equal(origin,pathToFileURL(overlay).href.replace('file:///','file:/'),name+' overlay not loaded');
    else if(!hasGeneratedIds&&name==='org.opencds.cqf.fhir.utility.GeneratedIds') assert.equal(origin,'ABSENT',name);
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
const extractionUrls=new Set([
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-definitionExtract',
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-definitionExtractValue']);
function carryExtractionBindings(q,qr) {
  const submitted=structuredClone(qr),byId=new Map();
  function collect(items) {
    for(const item of items||[]) {
      assert.ok(item.linkId&&!byId.has(item.linkId),'Missing/duplicate Questionnaire linkId');
      byId.set(item.linkId,item);collect(item.item);
    }
  }
  collect(q.item);
  function copy(items) {
    for(const item of items||[]) {
      const source=byId.get(item.linkId);
      assert.ok(source,'QR item has no matching Questionnaire item: '+item.linkId);
      assert.equal(item.definition,source.definition,'Q/QR item definition mismatch: '+item.linkId);
      const extensions=[...(item.extension||[]).filter(e=>!extractionUrls.has(e.url)),
        ...structuredClone((source.extension||[]).filter(e=>extractionUrls.has(e.url)))];
      if(extensions.length)item.extension=extensions;else delete item.extension;
      copy(item.item);for(const answer of item.answer||[])copy(answer.item);
    }
  }
  copy(submitted.item);return submitted;
}
function buildSessionResponse(q,qr,step,contract) {
  return carryExtractionBindings(q,editResponse(q,qr,step,contract));
}
function sessionLogs(processResult,submittedQr) {
  // Keep raw logs in evidence. Only this pinned engine's exact, recoverable lookup
  // diagnostic is admitted; extraction checks must still prove patient-scoped data.
  const expected=submittedQr?.questionnaire
    ? '[main] ERROR org.opencds.cqf.fhir.cr.questionnaireresponse.QuestionnaireResponseProcessor - No resource of type Questionnaire found for url: '+submittedQr.questionnaire : null;
  const lines=((processResult.stdout||'')+'\n'+(processResult.stderr||'')).split(/\r?\n/);
  const diagnostics=[];let admitted=false;
  const remaining=lines.filter(line=>{
    if(expected&&line===expected&&!admitted){diagnostics.push(line);admitted=true;return false;}
    return true;
  }).join('\n');
  return {remaining,diagnostics};
}
function checkExtraction({before,after,storedBefore,storedAfter,repoBefore,repoAfter,subject,contract,controls}) {
  const errors=[],expect=(v,m)=>{if(!v)errors.push(m);};
  expect(same(storedBefore.entry||[],storedAfter.entry||[]),'Stored Observations changed');
  expect(same(repoBefore,repoAfter),'Repository input bundle mutated');
  const resources=b=>(b.entry||[]).map(e=>e.resource),submitted=resources(before),returned=resources(after);
  expect(submitted.every(r=>r.resourceType==='QuestionnaireResponse'),'Manually injected answer data or Questionnaire');
  expect(objects(before,r=>r.resourceType==='Questionnaire').length===0&&objects(repoBefore,r=>r.resourceType==='Questionnaire').length===0,'Questionnaire sent/contained/preloaded');
  expect(returned.every(r=>['QuestionnaireResponse','Observation'].includes(r.resourceType)),'Unexpected extracted resource type');
  expect(same(returned.filter(r=>r.resourceType==='QuestionnaireResponse'),submitted.filter(r=>r.resourceType==='QuestionnaireResponse')),'Submitted QR mutated');
  const observations=returned.filter(r=>r.resourceType==='Observation');
  if(!submitted.length){expect(observations.length===0,'Initial request extracted data');return {passed:!errors.length,errors,count:observations.length};}
  expect(submitted.length===1&&submitted[0].resourceType==='QuestionnaireResponse','Request must contain only the complete QR');
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
function sessionVerdict(result,entry,contract,step,subject,processResult,submittedQr) {
  // Session form retention is explicit and separate from direct-data question presence.
  const c=structuredClone(contract),e=structuredClone(entry);e.caseId='session';e.expected=step.expected;
  c.unknownQuestionPresence.session=step.questions;
  // This helper writes Parameters to a file: stdout is ALL logging. The production
  // stdout-JSON driver's prefix parser must not hide errors or null witnesses here.
  const logs=sessionLogs(processResult,submittedQr);
  return {...nativeVerdict(result,e,c,subject,{...processResult,stdout:'',stderr:logs.remaining}),diagnostics:logs.diagnostics};
}
module.exports={sessionEngine,originalEngineSha256,classDir,overlaySha256,helperReady,checkOrigins,single,leaf,editResponse,checkEdit,checkExtraction,sessionVerdict,carryExtractionBindings,buildSessionResponse,sessionLogs};
