'use strict';
// REFACTOR:grounded — synthetic corruptions exercise false-green boundaries, not golden native output.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkNative, checkCre, nativeVerdict, summarize, loadFixture, exactCases, pauseInputs } = require('./check.cjs');
const { childEnvironment, runBounded } = require('./process.cjs');
const { options } = require('./run.cjs');
const fixture = path.resolve(__dirname, '../../test/acceptance/bleph');

function sample(activity = false) {
  const subject = 'Patient/example';
  const contract = { planId: 'plan', questionnaireUrl: 'https://example.test/q', bindings: {
    B: { definition: 'https://example.test/b', valueType: 'valueBoolean' }, P: { definition: 'https://example.test/p', valueType: 'valueBoolean' },
    choice: { definition: 'https://example.test/choice', valueType: 'valueCoding', system: 'https://example.test/codes' },
    cosmetic: { definition: 'https://example.test/cosmetic', valueType: 'valueBoolean' }
  }, activities: { Met: 'CommunicationRequest/met' }, activityContent: { Met: { status: 'active', doNotPerform: false, payload: [{ contentString: 'Approved' }] } }, routes: { leaf: ['Root', 'Qualifies'] }, pauseNullExpressions: { guard: ['example expression'] } };
  for (const b of Object.values(contract.bindings)) b.required = false;
  contract.bindings.choice.optionCodes = ['yes'];
  const entry = { answers: { B: true, P: activity ? false : null, choice: 'yes', cosmetic: false }, expected: { kind: activity ? 'activity' : 'pause', activity: activity ? 'Met' : null, nodeId: activity ? 'leaf' : 'guard' } };
  const q = { resourceType: 'Questionnaire', status: 'active', url: contract.questionnaireUrl, version: 'session1', item: Object.entries(contract.bindings).map(([key, b]) => ({ linkId: key, definition: b.definition, required: false, type: b.valueType === 'valueBoolean' ? 'boolean' : 'choice', ...(b.optionCodes ? { answerOption: b.optionCodes.map(code => ({ valueCoding: { system: b.system, code } })) } : {}) })) };
  const qr = { resourceType: 'QuestionnaireResponse', questionnaire: q.url + '|' + q.version, subject: { reference: subject }, item: q.item.map(i => ({ linkId: i.linkId, definition: i.definition, answer: entry.answers[i.linkId] === null ? [] : [{ [contract.bindings[i.linkId].valueType]: i.linkId === 'choice' ? { system: contract.bindings.choice.system, code: 'yes' } : entry.answers[i.linkId] }] })) };
  const group = { resourceType: 'RequestGroup', id: 'plan', subject: { reference: subject }, action: [] };
  const resources = [q, qr, group];
  if (activity) {
    group.action = [{ title: 'Root', action: [{ title: 'Qualifies', resource: { reference: 'RequestGroup/met-recommendation' } }] }];
    resources.push({ resourceType: 'RequestGroup', id: 'met-recommendation', subject: { reference: subject }, action: [{ title: 'Met', resource: { reference: 'CommunicationRequest/met' } }] }, { resourceType: 'CommunicationRequest', id: 'met', subject: { reference: subject }, ...structuredClone(contract.activityContent.Met) });
  }
  return { contract, entry, subject, q, qr, group, resources, result: { resourceType: 'Parameters', parameter: [{ name: 'return', resource: { resourceType: 'Bundle', entry: resources.map(resource => ({ resource })) } }] } };
}
const check = s => checkNative(s.result, s.entry, s.contract, s.subject, s.entry.expected.kind === 'pause' ? 'Condition expression example expression returned null' : '');

test('session file-output helper checks logs after braces', () => {
  const {sessionVerdict}=require('./session-check.cjs'),s=sample(true);
  s.contract.unknownQuestionPresence={};s.entry.suite='unknowns';
  const step={expected:s.entry.expected,questions:Object.keys(s.contract.bindings)};
  const clean={exitCode:0,stdout:'INFO context={}\n',stderr:''};
  assert.equal(sessionVerdict(s.result,s.entry,s.contract,step,s.subject,clean).passed,true);
  const bad=sessionVerdict(s.result,s.entry,s.contract,step,s.subject,{...clean,stdout:clean.stdout+'ERROR extraction failed'});
  assert.equal(bad.passed,false);assert.equal(bad.failureKind,'infrastructure');
});
test('session pause witnesses after log braces remain visible', () => {
  const {sessionVerdict}=require('./session-check.cjs'),s=sample();
  s.contract.unknownQuestionPresence={};s.entry.suite='unknowns';s.entry.expected.pauseInputs=['P'];
  const step={expected:s.entry.expected,questions:Object.keys(s.contract.bindings)};
  const p={exitCode:0,stdout:'INFO context={}\nCondition expression example expression returned null',stderr:''};
  assert.equal(sessionVerdict(s.result,s.entry,s.contract,step,s.subject,p).passed,true);
  assert.equal(sessionVerdict(s.result,s.entry,s.contract,step,s.subject,{...p,stdout:'INFO context={}'}).passed,false);
});
test('positive native pause/activity controls preserve false and typed coding', () => {
  assert.equal(check(sample()).passed, true); assert.equal(check(sample(true)).passed, true);
});
for (const [name, change] of Object.entries({
  'same code wrong system': s => { s.qr.item[2].answer[0].valueCoding.system = 'wrong'; },
  'coding replaced by string': s => { s.qr.item[2].answer = [{ valueString: 'yes' }]; },
  'false replaced by unanswered': s => { s.qr.item[1].answer = []; },
  'wrong subject': s => { s.qr.subject.reference = 'Patient/other'; },
  'wrong Q version': s => { s.qr.questionnaire = s.q.url + '|other'; },
  'duplicate question definition': s => { s.q.item.push({ ...s.q.item[0], linkId: 'duplicate' }); },
  'duplicate response': s => { s.qr.item.push({ ...s.qr.item[0] }); },
  'missing reached non-request question': s => { s.q.item.splice(2, 1); s.qr.item.splice(2, 1); },
  'extra required clinical question': s => { s.q.item.push({ linkId: 'extra', definition: 'https://example.test/extra', type: 'boolean', required: true }); s.qr.item.push({ linkId: 'extra', definition: 'https://example.test/extra', answer: [] }); },
  'wrong route resource': s => { s.group.action[0].action[0].resource.reference = 'RequestGroup/other'; },
  'wrong wrapper activity': s => { s.resources[3].action[0].resource.reference = 'CommunicationRequest/other'; },
  'dropped activity payload': s => { delete s.resources[4].payload; },
  'prohibited activity': s => { s.resources[4].doNotPerform = true; },
  'inactive activity': s => { s.resources[4].status = 'entered-in-error'; },
  'missing choice options': s => { delete s.q.item[2].answerOption; },
  'wrong question required flag': s => { s.q.item[0].required = true; },
  'unexpected additional route': s => { s.group.action.push({ title: 'Extra', resource: { reference: 'RequestGroup/met-recommendation' } }); },
  'duplicate activity': s => { s.result.parameter[0].resource.entry.push({ resource: { ...s.resources[4] } }); },
  'engine outcome': s => { s.result.parameter.push({ name: 'error', resource: { resourceType: 'OperationOutcome', issue: [] } }); }
})) test(`rejects ${name}`, () => { const s = sample(true); change(s); assert.equal(check(s).passed, false); });
test('no activity without named unanswered question is not pause', () => {
  const s = sample(); s.q.item.splice(1, 1); s.qr.item.splice(1, 1); assert.equal(check(s).passed, false);
  assert.equal(checkNative({}, s.entry, s.contract, s.subject).passed, false);
});
test('valid Questionnaire does not suppress logged errors or wrong null witnesses', () => {
  const s = sample();
  assert.equal(checkNative(s.result, s.entry, s.contract, s.subject, 'ERROR Could not resolve identifier Library').passed, false);
  assert.equal(checkNative(s.result, s.entry, s.contract, s.subject, '').passed, false);
  const a = sample(true);
  assert.equal(checkNative(a.result, a.entry, a.contract, a.subject, 'Condition expression wrong returned null').passed, false);
  s.result.parameter.push({ name: 'unexpected', resource: { resourceType: 'ServiceRequest', id: 'other' } });
  assert.equal(check(s).passed, false);
});
test('frozen case-set integrity and independent CRE/native verdicts', () => {
  const f = loadFixture(fixture); assert.equal(f.entries.length, 116);
  assert.equal(exactCases(f.entries, f.entries.slice(1)), false);
  assert.equal(exactCases(f.entries, [...f.entries.slice(1), f.entries[1]]), false);
  const rows = f.entries.map(e => ({ suite: e.suite, case: e.case, native: { passed: true }, cre: { passed: true } }));
  assert.equal(summarize(f.entries, rows).accepted, true);
  rows[0].cre.passed = false;
  const result = summarize(f.entries, rows);
  assert.equal(result.nativeAccepted, true); assert.equal(result.creAccepted, false); assert.equal(result.accepted, false);
  assert.equal(result.crePassed, 115); assert.equal(result.nativePassed, 116);
  assert.equal(summarize(f.entries, rows.slice(1)).accepted, false);
});
test('deeper pauses require valid named unanswered inputs and their returned questions', () => {
  const s=sample(); s.entry.suite='unknowns'; s.entry.caseId='deep';
  s.entry.expected.pauseInputs=['choice']; s.entry.answers.choice=null; s.qr.item[2].answer=[];
  s.contract.unknownQuestionPresence={deep:Object.keys(s.contract.bindings)};
  assert.equal(check(s).passed,true);
  for(const keys of [undefined,[],['absent'],['choice','choice'],['B']]){
    s.entry.expected.pauseInputs=keys; assert.throws(()=>pauseInputs(s.entry,s.contract),/distinct unanswered/);
  }
  s.entry.expected.pauseInputs=['choice'];
  s.q.item.splice(2,1);s.qr.item.splice(2,1);
  assert.equal(check(s).passed,false);
});
test('explicit new-case presence contracts cannot hide an extra or missing item', () => {
  const s=sample(true);s.entry.suite='unknowns';s.entry.caseId='known';
  s.contract.unknownQuestionPresence={known:Object.keys(s.contract.bindings)};
  assert.equal(check(s).passed,true);
  s.contract.unknownQuestionPresence.known=s.contract.unknownQuestionPresence.known.filter(k=>k!=='choice');
  assert.equal(check(s).passed,false);
});
test('true-OR controls leave the opposite operand unknown before OR', () => {
  const {entries}=loadFixture(fixture);
  const left=entries.find(e=>e.case==='visual-field-makes-photograph-unnecessary').answers;
  const right=entries.find(e=>e.case==='photograph-makes-visual-field-unnecessary').answers;
  assert.deepEqual([left.photoConform,left.photo,left.vfConform],[true,null,true]);
  assert.notEqual(left.vf,null);assert.notEqual(left.vf,'none-of-the-listed-visual-field-demonstrations');
  assert.deepEqual([right.vfConform,right.vf,right.photoConform],[true,null,true]);
  assert.notEqual(right.photo,null);assert.notEqual(right.photo,'none-of-the-listed-photographic-demonstrations');
});
test('CLI rejects missing options, bad worker counts, source/existing output', () => {
  const jar = __filename;
  const tempParent = path.resolve(__dirname, '../../../../tmp');
  fs.mkdirSync(tempParent, { recursive: true });
  const existing = fs.mkdtempSync(path.join(tempParent, 'native-check-'));
  try {
    assert.throws(() => options([]), /Explicit --engine-jar and --out/);
    assert.throws(() => options(['--engine-jar', jar, '--out', existing, '--workers', '5']), /workers must be 1..4/);
    assert.throws(() => options(['--engine-jar', jar, '--out', fixture]), /outside source/);
    assert.throws(() => options(['--engine-jar', jar, '--out', path.join(fixture, 'new-run')]), /outside source/);
    assert.throws(() => options(['--engine-jar', jar, '--out', existing]), /must be new/);
    for (const dir of ['harness', '.vibe-tools']) assert.throws(() => options(['--engine-jar', jar, '--out', path.resolve(__dirname, '../../../..', dir)]), /outside source/);
    assert.throws(() => options(['--engine-jar', jar, '--out', path.join(existing, 'missing-parent', 'run')]), /parent must exist/);
    assert.ok(options(['--engine-jar', jar, '--out', path.join(existing, 'new-run')]).out);
  } finally { fs.rmdirSync(existing); }
});
test('child environment removes injected Java and loader overrides', () => {
  assert.deepEqual(childEnvironment('E:/temp', { PATH: 'java', _JAVA_OPTIONS: 'bad', loader_path: 'bad', JAVA_TOOL_OPTIONS: 'bad' }), { PATH: 'java', TEMP: 'E:/temp', TMP: 'E:/temp', TMPDIR: 'E:/temp' });
});
test('malformed CRE predictions cannot become native failures', () => {
  const s = sample(true); s.entry.case = 'test';
  for (const cre of [{ runs: {} }, { runs: [{ case: 'test', status: 'pass' }] }, { runs: [{ case: 'test', status: 'pass', produced: [], trace: [{}] }] }]) {
    assert.equal(checkCre(cre, s.entry).passed, false);
    assert.equal(nativeVerdict(s.result, s.entry, s.contract, s.subject, { exitCode: 0, stderr: '' }).passed, true);
  }
  assert.equal(nativeVerdict(s.result, s.entry, s.contract, s.subject, { exitCode: 3, stderr: '' }).failureKind, 'infrastructure');
  s.resources[4].status = 'entered-in-error';
  assert.equal(nativeVerdict(s.result, s.entry, s.contract, s.subject, { exitCode: 0, stderr: '' }).failureKind, 'acceptance');
});
test('native log checks include stdout prefix and plural errors without scanning clinical JSON', () => {
  const s = sample(true), output = JSON.stringify(s.result);
  for (const prefix of ['Library contains errors\n', 'ERROR engine failure\n', 'Condition expression unexpected returned null\n']) {
    assert.equal(nativeVerdict(s.result, s.entry, s.contract, s.subject, { exitCode: 0, stdout: prefix + output, stderr: '' }).passed, false);
  }
  s.resources[4].meta = { profile: ['expected'], versionId: 'runtime' };
  s.contract.activityContent.Met.meta = { profile: ['expected'] };
  s.q.title = 'No errors in this clinical title';
  assert.equal(nativeVerdict(s.result, s.entry, s.contract, s.subject, { exitCode: 0, stdout: JSON.stringify(s.result), stderr: '' }).passed, true);
});
test('known documentation bindings belong only in the both-requested branch', () => {
  const s = sample(true);
  for (const key of ['bdoc', 'pdoc']) { s.contract.bindings[key] = { definition: 'https://example.test/' + key, valueType: 'valueBoolean', required: false }; s.entry.answers[key] = true; }
  assert.equal(check(s).passed, true);
  s.entry.answers.P = true; s.qr.item[1].answer = [{ valueBoolean: true }];
  assert.equal(check(s).passed, false);
  for (const key of ['bdoc', 'pdoc']) {
    s.q.item.push({ linkId: key, definition: s.contract.bindings[key].definition, type: 'boolean', required: false });
    s.qr.item.push({ linkId: key, definition: s.contract.bindings[key].definition, answer: [{ valueBoolean: true }] });
  }
  assert.equal(check(s).passed, true);
  s.entry.answers.P = false; s.qr.item[1].answer = [{ valueBoolean: false }];
  assert.equal(check(s).passed, false);
});
test('hanging and excessive-output children are terminated before resolution', { timeout: 30000 }, async () => {
  const cwd = __dirname;
  assert.ok(fs.existsSync(cwd));
  const env = childEnvironment(cwd);
  for (const [code, options, reason] of [
    ['setInterval(()=>{},1000)', { timeoutMs: 250 }, 'timeout'],
    ['setInterval(()=>process.stdout.write("x".repeat(4096)),5)', { maxBytes: 1024 }, 'stdout limit exceeded']
  ]) {
    const result = await runBounded(process.execPath, ['-e', code], { cwd, env, ...options });
    assert.equal(result.failure, reason); assert.notEqual(result.exitCode, 0); assert.ok(result.stdout.length <= 1024);
  }
});
test('timeout and cancellation terminate owned descendants before worker release', { timeout: 30000 }, async () => {
  const code = 'const cp=require("node:child_process");const c=cp.spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore",windowsHide:true});console.log(c.pid);setInterval(()=>{},1000);';
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    const timer = cancel ? setTimeout(() => controller.abort(), 1500) : undefined;
    try {
      const result = await runBounded(process.execPath, ['-e', code], { cwd: __dirname, env: childEnvironment(__dirname), timeoutMs: cancel ? 10000 : 1500, signal: controller.signal });
      assert.equal(result.failure, cancel ? 'cancelled' : 'timeout');
      const pid = Number(result.stdout.trim()); assert.ok(pid > 0);
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    } finally { clearTimeout(timer); }
  }
});
