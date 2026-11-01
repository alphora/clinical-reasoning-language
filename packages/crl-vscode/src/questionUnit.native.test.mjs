import { normalizePublicationQuantity } from "../../crl/dist/emit/publicationQuantity.js";
// REFACTOR:grounded (#328): real engine and interview state, not mocked clinical outcomes.
import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { emitCrlBundle, produceResults } from '@smile-digital-health/crl';
import { applySession } from '@smile-digital-health/crl/session';
import { questionUnitSource } from '../../crl/src/authoring-kit/questionUnitExample';
import { InteractiveSession, nativeInteractiveRunner, readInteractiveResult, interactiveRequest } from './interactiveQuestionnaire';

const enabled = process.env.CRL_QUESTION_UNIT_NATIVE === '1';
const engine = () => ({ path: process.env.CRL_QUESTION_UNIT_ENGINE_PATH, sha256: process.env.CRL_QUESTION_UNIT_ENGINE_SHA256 });
const marker = 'http://clinicalreasoninglanguage.org/fhir/StructureDefinition/presentation-question-unit';
const option = 'http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption';
const flatten = items => (items ?? []).flatMap(i => [i, ...flatten(i.item), ...(i.answer ?? []).flatMap(a => flatten(a.item))]);
const quantities = r => flatten(r.questionnaire.item).filter(i => i.type === 'quantity');
const observations = r => (r.nativeData?.entry ?? []).map(e => e.resource).filter(r => r.resourceType === 'Observation');
const unit = q => q.extension?.filter(e => e.url === option).map(e => e.valueCoding);
const outcome = (result, expected) => expect(result.activities).toEqual(expected ? [expected] : []);

function fixture(source = questionUnitSource()) {
 const root = mkdtempSync(join(tmpdir(), 'crl-question-unit-native-'));
 writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'question-unit-native', version: '0.0.0', private: true, crl: { canonicalBase: 'https://example.org/question-unit', date: '2026-11-01' } }));
 mkdirSync(join(root, 'src/crl'), { recursive: true });
 const policy = join(root, 'src/crl/policy.crl'); writeFileSync(policy, source);
 const emitted = emitCrlBundle(policy); expect(emitted.success, JSON.stringify(emitted)).toBe(true);
 const plan = emitted.bundle.entry.map(e => e.resource).find(r => r.resourceType === 'PlanDefinition' && r.type?.coding?.some(c => c.code === 'workflow-definition'));
 return { root, policy, bundle: emitted.bundle, plan: plan.id };
}
function interview(f, suffix, initial = []) {
 let step = 0; const receipts=[];
 const runner = nativeInteractiveRunner(async (request, options) => {
  const result = await applySession({ ...request, engine: engine() }, { ...options, limits: { maxHeapMb: 512, timeoutMs: 90000 } });
  receipts.push(result);
  if (process.env.CRL_QUESTION_UNIT_EVIDENCE) {
   const dir = join(process.env.CRL_QUESTION_UNIT_EVIDENCE, suffix, String(step++)); mkdirSync(dir, { recursive: true });
   writeFileSync(join(dir, 'request.json'), request.requestDataJson);
   writeFileSync(join(dir, 'receipt.json'), JSON.stringify(result, null, 2));
   for (const [name, artifact] of Object.entries(result.artifacts)) writeFileSync(join(dir, name + '.json'), readFileSync(artifact.path));
  }
  return result;
 }, f.root);
 const session = new InteractiveSession(f.bundle, f.plan, runner);
 session.reset({ id: 'synthetic', label: 'Synthetic', subject: 'Patient/p', bundle: { resourceType: 'Bundle', type: 'collection', entry: [{ resource: { resourceType: 'Patient', id: 'p' } }, ...initial.map(resource => ({ resource }))] } });
 session.qualificationReceipts=receipts; return session;
}
async function answer(session, quantity, minute) {
 const qr = structuredClone(session.result.response); qr.authored = `2026-11-01T20:${String(minute).padStart(2, '0')}:00Z`;
 const item = flatten(qr.item).find(i => i.definition?.endsWith('#Observation.value[x]'));
 expect(item).toBeDefined(); if (quantity === null) delete item.answer; else item.answer = [{ valueQuantity: quantity }];
 return session.evaluate(qr);
}

// @kit text-answers:question-unit-native-session
it.skipIf(!enabled)('declared BMI default survives native Start, untouched, number entry, change, clear and repeated applies', async () => {
 const f = fixture(); try {
  const session = interview(f, 'bmi'); const start = await session.evaluate();
  expect(quantities(start)).toHaveLength(1); expect(unit(quantities(start)[0])).toEqual([{ system: 'http://unitsofmeasure.org', code: 'kg/m2', display: 'kg/m2' }]);
  expect(quantities(start)[0].extension.some(e => e.url === marker)).toBe(false);
  expect(start.activities).toHaveLength(0); expect(observations(start)).toHaveLength(0);
  const untouched = await session.evaluate(structuredClone(start.response)); expect(observations(untouched)).toHaveLength(0); expect(untouched.activities).toHaveLength(0);
  const entered = await answer(session, { value: 40, system: 'http://unitsofmeasure.org', code: 'kg/m2', unit: 'kg/m2' }, 1);
  expect(observations(entered).at(-1).valueQuantity).toMatchObject({ value: 40, code: 'kg/m2', system: 'http://unitsofmeasure.org' });
  outcome(entered, 'Above');
  const saved = structuredClone(observations(entered));
  const repeated = await session.evaluate(structuredClone(entered.response)); outcome(repeated, 'Above'); expect(observations(repeated)).toEqual(saved); expect(unit(quantities(repeated)[0])).toEqual(unit(quantities(entered)[0]));
  const changed = await answer(session, { value: 30, system: 'http://unitsofmeasure.org', code: 'kg/m2', unit: 'kg/m2' }, 3);
  outcome(changed, 'Below');
  const cleared = await answer(session, null, 4); expect(cleared.activities).toHaveLength(0); expect(observations(cleared).at(-1)).not.toHaveProperty('valueQuantity');
  expect(unit(quantities(cleared)[0])[0].code).toBe('kg/m2');
 } finally { rmSync(f.root, { recursive: true, force: true }); }
}, 240000);

// @kit text-answers:question-unit-native-alternate
// REFACTOR:grounded (#328): canonical publication value differs from immutable raw evidence.
it.skipIf(!enabled)('normalizes source metres into declared centimetres and preserves edit/clear behavior',async()=>{
 const source=questionUnitSource('cm').replaceAll('BMI','Height').replace("35.00000001 'kg/m2'","1 'm'");
 const f=fixture(source);try{
 const system=f.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='CodeSystem'&&r.concept?.some(c=>c.code==='bmi')).url;
 const raw={resourceType:'Observation',id:'height',status:'final',subject:{reference:'Patient/p'},code:{coding:[{system,code:'bmi'}]},effectiveDateTime:'2026-10-01T00:00:00Z',valueQuantity:{value:1.8,unit:'m',system:'http://unitsofmeasure.org',code:'m'}};
 const session=interview(f,'conversion',[raw]);const start=await session.evaluate();outcome(start,'Above');
 expect(unit(quantities(start)[0]).map(c=>c.code)).toEqual(['cm']);
 const populated=flatten(start.response.item).flatMap(i=>i.answer??[]).find(a=>a.valueQuantity)?.valueQuantity;
 expect(populated).toMatchObject({value:180,unit:'cm',code:'cm',system:'http://unitsofmeasure.org'});
 expect(observations(start).find(o=>o.id===raw.id)).toEqual(raw);
 const unchanged=await session.evaluate(structuredClone(start.response));outcome(unchanged,'Above');expect(observations(unchanged)).toEqual(observations(start));
 const changed=await answer(session,{value:90,unit:'cm',code:'cm',system:'http://unitsofmeasure.org'},1);outcome(changed,'Below');
 const clear=await answer(session,null,2);outcome(clear,null);
 const again=await answer(session,{value:180,unit:'cm',code:'cm',system:'http://unitsofmeasure.org'},3);outcome(again,'Above');
 }finally{rmSync(f.root,{recursive:true,force:true});}
},240000);
// @kit text-answers:question-unit-native-alternate
it.skipIf(!enabled)('rejects lossy/out-of-range conversions and raw unitless values through actual CQL',async()=>{
 for(const [typeUnit,value,code,error,extra]of [['m',0.00000001,'cm','publication-quantity-precision-unsupported'],['cm',1000000,'m','publication-quantity-precision-unsupported'],['cm',1.234567891,'m','publication-quantity-precision-unsupported'],['cm',1,'kg','publication-quantity-unit-unsupported'],['cm',40,null,'publication-invalid-quantity'],['cm',1.8,'m','publication-invalid-quantity',{system:'urn:other-units',code:'m'}],['cm',1.8,'m','publication-invalid-quantity',{comparator:'<'}]]){
 const f=fixture(questionUnitSource(typeUnit).replaceAll('BMI','Height').replace("35.00000001 'kg/m2'","1 'm'"));try{
 const system=f.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='CodeSystem'&&r.concept?.some(c=>c.code==='bmi')).url;
 const q={value,...(code?{unit:code}:{} ),...extra};const raw={resourceType:'Observation',id:'raw',status:'final',subject:{reference:'Patient/p'},code:{coding:[{system,code:'bmi'}]},valueQuantity:q};
 const session=interview(f,'invalid-'+typeUnit+'-'+value,[raw]);await expect(session.evaluate()).rejects.toThrow('native-error');expect(JSON.stringify(session.qualificationReceipts.at(-1).diagnostics)).toContain(error);
 }finally{rmSync(f.root,{recursive:true,force:true});}
 }
},240000);
// @kit text-answers:question-unit-native-alternate
it.skipIf(!enabled)('refuses an older generator for referenced differential or snapshot units, and permits unrelated profiles',async()=>{
 const f=fixture();const legacy=fixture(questionUnitSource(null));try{
 const base={schemaVersion:1,requestId:'old',caseId:'old',stepId:'old',requestDataJson:JSON.stringify({resourceType:'Bundle',type:'collection',entry:[{resource:{resourceType:'Patient',id:'p'}}]}),planDefinitionId:f.plan,subjectReference:'Patient/p',engine:{path:process.env.CRL_QUESTION_UNIT_OLD_ENGINE_PATH,sha256:process.env.CRL_QUESTION_UNIT_OLD_ENGINE_SHA256}};
 for(const snapshot of [false,true]){
 const bundle=structuredClone(f.bundle);if(snapshot)for(const {resource:r}of bundle.entry)if(r.resourceType==='StructureDefinition'&&r.differential){r.snapshot=r.differential;delete r.differential;}
 const result=await applySession({...base,repositoryJson:JSON.stringify(bundle)},{outDir:join(f.root,'old-'+snapshot),limits:{maxHeapMb:512,timeoutMs:90000}});
 expect(result.ok).toBe(false);expect(JSON.stringify(result)+(result.artifacts['stderr.log']?readFileSync(result.artifacts['stderr.log'].path,'utf8'):'')).toContain('allowedUnits');
 }
 const unrelated=structuredClone(f.bundle.entry.find(e=>e.resource.resourceType==='StructureDefinition').resource);unrelated.id='unrelated';unrelated.url='https://example.org/unrelated';legacy.bundle.entry.push({resource:unrelated});
 const result=await applySession({...base,planDefinitionId:legacy.plan,repositoryJson:JSON.stringify(legacy.bundle)},{outDir:join(legacy.root,'unrelated'),limits:{maxHeapMb:512,timeoutMs:90000}});expect(result.ok,JSON.stringify(result)).toBe(true);
 }finally{rmSync(f.root,{recursive:true,force:true});rmSync(legacy.root,{recursive:true,force:true});}
},120000);
// @kit text-answers:question-unit-native-static
it.skipIf(!enabled)('repeated profile inputs reuse the same unit-bearing question and malformed standard metadata errors',async()=>{
 const f=fixture();try{
 const root=f.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='PlanDefinition'&&r.id===f.plan);
 const inputs=[];const walk=actions=>{for(const a of actions??[]){inputs.push(...(a.input??[]));walk(a.action);}};walk(root.action);
 const input=inputs.find(i=>i.profile?.length);expect(input).toBeDefined();root.action.push({id:'repeat',input:[structuredClone(input)]});
 const request={schemaVersion:1,requestId:'repeat',caseId:'repeat',stepId:'repeat',repositoryJson:JSON.stringify(f.bundle),requestDataJson:JSON.stringify({resourceType:'Bundle',type:'collection',entry:[{resource:{resourceType:'Patient',id:'p'}}]}),planDefinitionId:f.plan,subjectReference:'Patient/p',engine:engine()};
 const good=await applySession(request,{outDir:join(f.root,'repeat'),limits:{maxHeapMb:512,timeoutMs:90000}});expect(good.ok,JSON.stringify(good)).toBe(true);
 const result=readInteractiveResult(JSON.parse(readFileSync(good.artifacts['native-result.json'].path,'utf8')));expect(quantities(result)).toHaveLength(1);expect(unit(quantities(result)[0])).toHaveLength(1);
 const profile=f.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='StructureDefinition'&&r.differential?.element.some(e=>e.extension?.some(x=>x.url.endsWith('elementdefinition-allowedUnits'))));
 profile.differential.element.find(e=>e.extension?.some(x=>x.url.endsWith('elementdefinition-allowedUnits'))).extension.find(x=>x.url.endsWith('elementdefinition-allowedUnits')).valueCodeableConcept.coding[0].system='urn:invalid';
 const bad=await applySession({...request,requestId:'malformed',repositoryJson:JSON.stringify(f.bundle)},{outDir:join(f.root,'malformed'),limits:{maxHeapMb:512,timeoutMs:90000}});expect(bad.ok).toBe(false);expect(JSON.stringify(bad.diagnostics)).toContain('allowedUnits');
 }finally{rmSync(f.root,{recursive:true,force:true});}
},120000);
// @kit text-answers:question-unit-native-static
it.skipIf(!enabled)('actual result producer retains unit metadata in the saved static Questionnaire', async () => {
 const f = fixture(); try {
  mkdirSync(join(f.root, 'src/cel/mv'), { recursive: true });
  const cel = join(f.root, 'src/cel/mv/case.cel'); writeFileSync(cel, 'library "Cases". covers "Quantity Unit Intake".\nfact "Patient": - name is "Synthetic". - birth date is "1970-01-01". - defined by "Patient".\nfact "BMI": - value is 40 \'kg/m2\'. - date is "2026-11-01". - defined by "Quantity Unit Intake"."BMI".\ncase "Above": - subject is "Patient". - fact is "BMI". - result is "Assessment" is "Above".\n');
  const result = await produceResults({ crlPath: f.policy, celPath: cel, outRoot: f.root, useCase: 'prior-auth', crlVersion: 'source-quantity-unit', jarPath: engine().path, jarSha256: engine().sha256, bounds: { maxHeapMb: 512, batchTimeoutMs: 90000, maxCapturedBytes: 1048576 } });
  expect(result.ok, JSON.stringify(result)).toBe(true); expect(result.failed, JSON.stringify(result)).toBe(0);
  expect(result.manifest.cases).toHaveLength(1); expect(result.manifest.cases[0].state).toBe('generated');
  const files = []; const walk = dir => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.json')) files.push(JSON.parse(readFileSync(p, 'utf8'))); } }; walk(join(f.root, 'tests/results/fhir'));
  expect(files.filter(r => r.resourceType === 'Questionnaire')).toHaveLength(1);
  expect(files.filter(r => r.resourceType === 'QuestionnaireResponse')).toHaveLength(1);
  const q = files.find(r => r.resourceType === 'Questionnaire'); expect(flatten(q.item).filter(i => i.type === 'quantity')).toHaveLength(1);
  const qr = files.find(r => r.resourceType === 'QuestionnaireResponse');
  const answers = flatten(qr.item).flatMap(i => i.answer ?? []).filter(a => a.valueQuantity);
  // REFACTOR:grounded: CEL materializes its declared Quantity type unit before profile stamping.
  expect(answers).toHaveLength(1); expect(answers[0].valueQuantity).toEqual({ value: 40, unit: 'kg/m2', code: 'kg/m2', system: 'http://unitsofmeasure.org' });
  const item = flatten(q.item).find(i => i.type === 'quantity'); expect(unit(item)[0].code).toBe('kg/m2'); expect(item.extension.some(e => e.url === marker)).toBe(false);
  expect(unit(item)).toEqual([{ system: 'http://unitsofmeasure.org', code: 'kg/m2', display: 'kg/m2' }]);
  if (process.env.CRL_QUESTION_UNIT_EVIDENCE) writeFileSync(join(process.env.CRL_QUESTION_UNIT_EVIDENCE, 'static-questionnaire.json'), JSON.stringify(q, null, 2));
 } finally { rmSync(f.root, { recursive: true, force: true }); }
}, 180000);

// @kit text-answers:question-unit-native-alternate
it.skipIf(!enabled)('absence of a declared unit retains comparison-time conversion and emits no unit options',async()=>{
 const f=fixture(questionUnitSource(null).replaceAll('BMI','Height').replace("35.00000001 'kg/m2'","1 'm'"));try{
 const system=f.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='CodeSystem'&&r.concept?.some(c=>c.code==='bmi')).url;
 const raw={resourceType:'Observation',id:'untyped-height',status:'final',subject:{reference:'Patient/p'},code:{coding:[{system,code:'bmi'}]},valueQuantity:{value:180,unit:'cm'}};
 const result=await interview(f,'undeclared',[raw]).evaluate();outcome(result,'Above');expect(unit(quantities(result)[0])??[]).toEqual([]);
 expect(flatten(result.response.item).flatMap(i=>i.answer??[]).find(a=>a.valueQuantity)?.valueQuantity).toEqual(raw.valueQuantity);
 }finally{rmSync(f.root,{recursive:true,force:true});}
},120000);

// @kit text-answers:question-unit-native-alternate
// REFACTOR:grounded (#328): actual normalized native value must preserve the metadata CRE retains.
it.skipIf(!enabled)('native Quantity normalization agrees with CRE on primitive metadata with and without conversion',async()=>{
 const f=fixture(questionUnitSource('cm').replaceAll('BMI','Height').replace("35.00000001 'kg/m2'","1 'm'"));try{
 // Probe the published FHIR Quantity inside native CQL. SDC population converts that
 // value into an answer and drops primitive metadata independently of normalization.
 const library=f.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='Library'&&r.name.endsWith('Inferences'));
 const attachment=library.content.find(c=>c.contentType==='text/cql');
 attachment.data=Buffer.from(Buffer.from(attachment.data,'base64').toString('utf8')+`
 define "QuantityMetadataRetained":
   ("Height".value as FHIR.Quantity).value.id = 'value-id'
   and ("Height".value as FHIR.Quantity).unit.id = 'unit-id'
   and ("Height".value as FHIR.Quantity).code.id = 'code-id'
   and ("Height".value as FHIR.Quantity).system.id = 'system-id'
   and (First(("Height".value as FHIR.Quantity).value.extension).value as FHIR.string).value = 'retained'
 `).toString('base64');
 const actions=items=>(items??[]).flatMap(a=>[a,...actions(a.action)]);
 const condition=f.bundle.entry.map(e=>e.resource).filter(r=>r.resourceType==='PlanDefinition').flatMap(r=>actions(r.action)).flatMap(a=>a.condition??[]).find(c=>c.kind==='applicability');
 expect(condition).toBeDefined();
 condition.expression.expression='QuantityMetadataRetained'; condition.expression.reference=library.url;
 const system=f.bundle.entry.map(e=>e.resource).find(r=>r.resourceType==='CodeSystem'&&r.concept?.some(c=>c.code==='bmi')).url;
 for(const code of ['m','cm']){
 const input={value:1.8,unit:code,code,system:'http://unitsofmeasure.org',_value:{id:'value-id',extension:[{url:'urn:synthetic:value-note',valueString:'retained'}]},_unit:{id:'unit-id'},_code:{id:'code-id'},_system:{id:'system-id'}};
 const raw={resourceType:'Observation',id:'annotated-'+code,status:'final',subject:{reference:'Patient/p'},code:{coding:[{system,code:'bmi'}]},valueQuantity:input};
 const result=await interview(f,'metadata-'+code,[raw]).evaluate();
 const quantity=flatten(result.response.item).flatMap(i=>i.answer??[]).find(a=>a.valueQuantity)?.valueQuantity;
 const expected=normalizePublicationQuantity(input,'cm').quantity;
 expect(quantity).toMatchObject({value:expected.value,unit:expected.unit,code:expected.code,system:expected.system});
 outcome(result,'Above'); // All four primitive ids and the value extension survived native CQL.
 // HAPI's JSON output omits id-only primitive metadata. The CQL predicate above
 // checks all ids before that serialization boundary; raw numeric evidence stays unchanged.
 expect(observations(result).find(o=>o.id===raw.id).valueQuantity).toMatchObject({value:input.value,unit:code,code,system:input.system,_value:input._value});
 }
 }finally{rmSync(f.root,{recursive:true,force:true});}
},120000);

// @kit text-answers:question-unit-native-untouched
it.skipIf(!enabled)('stateless untouched full responses preserve the undeclared extraction and validity contract', async () => {
 const snapshots = new Map();
 for (const declared of [false, true]) {
  const f = fixture(questionUnitSource(declared ? 'cm' : null).replaceAll('BMI','Height').replace("35.00000001 'kg/m2'","1 'm'"));
  try {
   const system = f.bundle.entry.map(e => e.resource).find(r => r.resourceType === 'CodeSystem' && r.concept?.some(c => c.code === 'bmi')).url;
   for (const populated of [false, true]) {
    const resources = [{ resourceType: 'Patient', id: 'p' }];
    if (populated) resources.push({ resourceType: 'Observation', id: 'prior', status: 'final', subject: { reference: 'Patient/p' }, code: { coding: [{ system, code: 'bmi' }] }, effectiveDateTime: '2026-10-01T00:00:00Z', valueQuantity: { value: 1.8, unit: 'm' } });
    const initial = { id: 'synthetic', label: 'Synthetic', subject: 'Patient/p', bundle: { resourceType: 'Bundle', type: 'collection', entry: resources.map(resource => ({ resource })) } };
    const direct = async (step, q, qr) => {
     const dir = join(f.root, `${populated}-${step}`);
     const request = { ...interactiveRequest(f.bundle, f.plan, initial, q, qr), engine: engine() };
     const r = await applySession(request, { outDir: dir, limits: { maxHeapMb: 512, timeoutMs: 90000 } }); expect(r.ok, JSON.stringify(r)).toBe(true);
     const result = { ...readInteractiveResult(JSON.parse(readFileSync(r.artifacts['native-result.json'].path, 'utf8'))), nativeData: JSON.parse(readFileSync(r.artifacts['native-data.json'].path, 'utf8')) };
     if (process.env.CRL_QUESTION_UNIT_EVIDENCE) {
      const evidence = join(process.env.CRL_QUESTION_UNIT_EVIDENCE, `full-${declared}-${populated}-${step}`); mkdirSync(evidence, { recursive: true });
      writeFileSync(join(evidence, 'request.json'), JSON.stringify(request));
      for (const [name, a] of Object.entries(r.artifacts)) writeFileSync(join(evidence, name + '.json'), readFileSync(a.path));
     }
     return result;
    };
    const start = await direct('start'); const qr = structuredClone(start.response); qr.authored = '2026-11-01T21:00:00Z';
    const echoed = await direct('echo', start.questionnaire, qr); outcome(echoed, populated ? 'Above' : undefined);
    const values = observations(echoed).map(o => ({ id: o.id, code: o.code, subject: o.subject, effectiveDateTime: o.effectiveDateTime, valueQuantity: o.valueQuantity }));
    // Extraction ids are not an inter-run identity. Preserve the measured timestamp set;
    // declared populated assertions are canonical, while the retained prior resource stays in metres.
    const comparable=values.map(({id,...value})=>value);
    if (declared) {
      const expected=snapshots.get(populated).map(({id,...value})=>({...value,...(value.valueQuantity && id!=='prior' ? {valueQuantity:normalizePublicationQuantity(value.valueQuantity,'cm').quantity}:{} )}));
      expect(comparable).toEqual(expected);
    } else snapshots.set(populated,values);
    if(populated) expect(observations(echoed).find(o=>o.id==='prior').valueQuantity).toEqual(resources[1].valueQuantity);
    for(const value of values.filter(v=>v.id!=='prior'&&v.effectiveDateTime)) expect(Date.parse(value.effectiveDateTime)).toBe(Date.parse(qr.authored));
   }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
 }
}, 240000);
