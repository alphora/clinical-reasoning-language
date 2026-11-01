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
 let step = 0;
 const runner = nativeInteractiveRunner(async (request, options) => {
  const result = await applySession({ ...request, engine: engine() }, { ...options, limits: { maxHeapMb: 512, timeoutMs: 90000 } });
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
 return session;
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
  expect(quantities(start)[0].extension.some(e => e.url === marker)).toBe(true);
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
it.skipIf(!enabled)('preserves a populated compatible unit, unit-only edits and clear; refuses bare input and an old engine', async () => {
 const source = questionUnitSource('cm').replaceAll('BMI', 'Height').replace("35.00000001 'kg/m2'", "1 'm'");
 const f = fixture(source); try {
  const codeSystem = f.bundle.entry.map(e => e.resource).find(r => r.resourceType === 'CodeSystem' && r.concept?.some(c => c.code === 'bmi')).url;
  const original = { resourceType: 'Observation', id: 'source-height', status: 'final', effectiveDateTime: '2026-10-01T00:00:00Z', subject: { reference: 'Patient/p' }, code: { coding: [{ system: codeSystem, code: 'bmi' }] }, valueQuantity: { value: 1.8, system: 'http://unitsofmeasure.org', code: 'm', unit: 'm' } };
  const session = interview(f, 'alternate', [original]); const start = await session.evaluate();
  expect(unit(quantities(start)[0]).map(c => c.code)).toEqual(['cm', 'm']); expect(JSON.stringify(start.response)).toContain('"code":"m"');
  outcome(start, 'Above');
  // Stateless full-QR clients also retain explicit unit-only edits; no client-side numeric conversion.
  const fullQr = structuredClone(start.response); fullQr.authored = '2026-11-01T19:00:00Z';
  flatten(fullQr.item).find(i => i.definition?.endsWith('#Observation.value[x]')).answer = [{ valueQuantity: { value: 1.8, system: 'http://unitsofmeasure.org', code: 'cm', unit: 'cm' } }];
  const suppliedQ = structuredClone(start.questionnaire);
  quantities({ questionnaire: suppliedQ })[0].extension.push({ url: option, valueCoding: { system: 'http://unitsofmeasure.org', code: 'g', display: 'stale' } });
  quantities({ questionnaire: suppliedQ })[0].extension = quantities({ questionnaire: suppliedQ })[0].extension.filter(e => e.url !== option || e.valueCoding.code !== 'cm');
  const initial = { id: 'synthetic', label: 'Synthetic', subject: 'Patient/p', bundle: { resourceType: 'Bundle', type: 'collection', entry: [{ resource: { resourceType: 'Patient', id: 'p' } }, { resource: original }, { resource: suppliedQ }] } };
  const full = await applySession({ ...interactiveRequest(f.bundle, f.plan, initial, suppliedQ, fullQr), engine: engine() }, { outDir: join(f.root, 'full-unit-edit'), limits: { maxHeapMb: 512, timeoutMs: 90000 } });
  expect(full.ok, JSON.stringify(full)).toBe(true);
  const fullResult = readInteractiveResult(JSON.parse(readFileSync(full.artifacts['native-result.json'].path, 'utf8')));
  outcome(fullResult, 'Below'); expect(unit(quantities(fullResult)[0]).map(c => c.code)).toEqual(['cm']);
  expect(fullResult.response.contained?.filter(r => r.resourceType === 'Questionnaire') ?? []).toHaveLength(0);
  const fullData = JSON.parse(readFileSync(full.artifacts['native-data.json'].path, 'utf8'));
  expect(fullData.entry.some(e => e.resource?.resourceType === 'Observation' && e.resource.valueQuantity?.code === 'cm' && e.resource.valueQuantity?.value === 1.8)).toBe(true);
  const changed = await answer(session, { value: 1.8, system: 'http://unitsofmeasure.org', code: 'cm', unit: 'cm' }, 1);
  outcome(changed, 'Below'); expect(observations(changed).some(o => o.valueQuantity?.code === 'cm')).toBe(true);
  expect(observations(changed).find(o => o.id === original.id)).toEqual(original);
  const stable = await session.evaluate(structuredClone(changed.response)); outcome(stable, 'Below'); expect(unit(quantities(stable)[0])).toEqual(unit(quantities(changed)[0]));
  const cleared = await answer(session, null, 3); expect(cleared.activities).toHaveLength(0);
  expect(unit(quantities(cleared)[0]).map(c => c.code)).toEqual(['cm']);
  const reentered = await answer(session, { value: 180, system: 'http://unitsofmeasure.org', code: 'cm', unit: 'cm' }, 4); outcome(reentered, 'Above');
  const data = JSON.stringify({ resourceType: 'Bundle', type: 'collection', entry: [{ resource: { resourceType: 'Patient', id: 'p' } }, { resource: { ...original, valueQuantity: { value: 40 } } }] });
  const request = { schemaVersion: 1, requestId: 'raw', caseId: 'raw', stepId: 'raw', repositoryJson: JSON.stringify(f.bundle), requestDataJson: data, planDefinitionId: f.plan, subjectReference: 'Patient/p', engine: engine() };
  const bare = await applySession(request, { outDir: join(f.root, 'bare'), limits: { maxHeapMb: 512, timeoutMs: 90000 } }); expect(bare.ok).toBe(false); expect(JSON.stringify(bare)).toContain('publication-invalid-quantity');
  if (process.env.CRL_QUESTION_UNIT_OLD_ENGINE_PATH) {
   const old = await applySession({ ...request, engine: { path: process.env.CRL_QUESTION_UNIT_OLD_ENGINE_PATH, sha256: process.env.CRL_QUESTION_UNIT_OLD_ENGINE_SHA256 } }, { outDir: join(f.root, 'old'), limits: { maxHeapMb: 512, timeoutMs: 90000 } });
   expect(old.ok).toBe(false); expect(readFileSync(old.artifacts['stderr.log'].path, 'utf8')).toContain('question-unit native runtime');
  }
 } finally { rmSync(f.root, { recursive: true, force: true }); }
}, 240000);

// @kit text-answers:question-unit-native-untouched
it.skipIf(!enabled)('stateless untouched full responses preserve the undeclared extraction and validity contract', async () => {
 const snapshots = new Map();
 for (const declared of [false, true]) {
  const f = fixture(declared ? questionUnitSource() : questionUnitSource().replace("- question unit is 'kg/m2'.", ''));
  try {
   const system = f.bundle.entry.map(e => e.resource).find(r => r.resourceType === 'CodeSystem' && r.concept?.some(c => c.code === 'bmi')).url;
   for (const populated of [false, true]) {
    const resources = [{ resourceType: 'Patient', id: 'p' }];
    if (populated) resources.push({ resourceType: 'Observation', id: 'prior', status: 'final', subject: { reference: 'Patient/p' }, code: { coding: [{ system, code: 'bmi' }] }, effectiveDateTime: '2026-10-01T00:00:00Z', valueQuantity: { value: 40, system: 'http://unitsofmeasure.org', code: 'kg/m2', unit: 'kg/m2' } });
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
    const values = observations(echoed).map(o => ({ code: o.code, subject: o.subject, effectiveDateTime: o.effectiveDateTime, valueQuantity: o.valueQuantity }));
    if (declared) expect(values).toEqual(snapshots.get(populated)); else snapshots.set(populated, values);
   }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
 }
}, 240000);

// @kit text-answers:question-unit-native-static
it.skipIf(!enabled)('reuses one question for repeated action inputs and loudly rejects malformed descriptors', async () => {
 const f = fixture(); try {
  const inputs = bundle => {
   const found = [];
   const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.input)) found.push(...value.input.filter(i => i.extension?.some(e => e.url === marker)));
    for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(walk); else if (child && typeof child === 'object') walk(child);
   }; walk(bundle); return found;
  };
  const originalInput = inputs(f.bundle)[0]; expect(originalInput).toBeDefined();
  const repeated = structuredClone(f.bundle);
  const rootPlan = repeated.entry.map(e => e.resource).find(r => r.resourceType === 'PlanDefinition' && r.id === f.plan);
  rootPlan.action.push({ id: 'repeat-unit-input', input: [structuredClone(originalInput)] });
  const evaluate = async (bundle, name) => applySession({ schemaVersion: 1, requestId: name, caseId: 'protocol', stepId: name, repositoryJson: JSON.stringify(bundle), requestDataJson: JSON.stringify({ resourceType: 'Bundle', type: 'collection', entry: [{ resource: { resourceType: 'Patient', id: 'p' } }] }), planDefinitionId: f.plan, subjectReference: 'Patient/p', engine: engine() }, { outDir: join(f.root, name), limits: { maxHeapMb: 512, timeoutMs: 90000 } });
  const good = await evaluate(repeated, 'repeat'); expect(good.ok, JSON.stringify(good)).toBe(true);
  const result = readInteractiveResult(JSON.parse(readFileSync(good.artifacts['native-result.json'].path, 'utf8')));
  expect(quantities(result)).toHaveLength(1); expect(quantities(result)[0].extension.filter(e => e.url === marker)).toHaveLength(1);
  expect(unit(quantities(result)[0])).toHaveLength(1); outcome(result);
  for (const name of ['duplicate', 'wrong-type', 'missing-profile', 'multi-profile', 'choice-group']) {
   const invalid = structuredClone(f.bundle);
   for (const input of inputs(invalid)) {
    const descriptor = input.extension.find(e => e.url === marker);
    if (name === 'duplicate') input.extension.push(structuredClone(descriptor));
    if (name === 'wrong-type') { delete descriptor.valueCoding; descriptor.valueString = 'kg/m2'; }
    if (name === 'missing-profile') delete input.profile;
    if (name === 'multi-profile') input.profile.push('http://hl7.org/fhir/StructureDefinition/Observation');
    if (name === 'choice-group') input.extension.push({ url: 'http://clinicalreasoninglanguage.org/fhir/StructureDefinition/presentation-choice-group', valueString: 'conflicting descriptor' });
   }
   const bad = await evaluate(invalid, name); expect(bad.ok, JSON.stringify(bad)).toBe(false);
   const detail = JSON.stringify(bad) + (bad.artifacts['stderr.log'] ? readFileSync(bad.artifacts['stderr.log'].path, 'utf8') : '');
   expect(detail).toContain('presentation-question-unit-invalid');
  }
 } finally { rmSync(f.root, { recursive: true, force: true }); }
}, 180000);

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
  // CEL's unit literal is display-only Quantity metadata; population must preserve it, not invent a system/code.
  expect(answers).toHaveLength(1); expect(answers[0].valueQuantity).toEqual({ value: 40, unit: 'kg/m2' });
  const item = flatten(q.item).find(i => i.type === 'quantity'); expect(unit(item)[0].code).toBe('kg/m2'); expect(item.extension.some(e => e.url === marker)).toBe(true);
  expect(unit(item)).toEqual([{ system: 'http://unitsofmeasure.org', code: 'kg/m2', display: 'kg/m2' }, { display: 'kg/m2' }]);
  if (process.env.CRL_QUESTION_UNIT_EVIDENCE) writeFileSync(join(process.env.CRL_QUESTION_UNIT_EVIDENCE, 'static-questionnaire.json'), JSON.stringify(q, null, 2));
 } finally { rmSync(f.root, { recursive: true, force: true }); }
}, 180000);
