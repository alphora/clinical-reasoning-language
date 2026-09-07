'use strict';
// REFACTOR:grounded — operator #320: native $apply is authority; absent activity alone is not pause.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { isDeepStrictEqual: same } = require('node:util');
const hasEngineError = text => /\bERRORS?\b|encountered exception|Could not resolve identifier|Exception in thread|OutOfMemoryError/i.test(text);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const caseKey = row => `${row.suite}\0${row.case}`;

function loadFixture(dir) {
  const hashes = JSON.parse(fs.readFileSync(path.join(dir, 'sha256.json')));
  const files = root => fs.readdirSync(root, { withFileTypes: true }).flatMap(e => {
    assert.ok(!e.isSymbolicLink(), 'Fixture symlinks are not permitted');
    return e.isDirectory() ? files(path.join(root, e.name)) : [path.relative(dir, path.join(root, e.name)).replaceAll('\\', '/')];
  });
  assert.deepEqual(files(dir).filter(f => !['README.md', '.gitattributes', 'sha256.json'].includes(f)).sort(), Object.keys(hashes).sort(), 'Fixture contains unpinned/missing files');
  for (const [name, expected] of Object.entries(hashes)) {
    assert.ok(!path.isAbsolute(name) && !name.split(/[\\/]/).includes('..'), 'Unsafe fixture manifest path');
    assert.equal(hash(fs.readFileSync(path.join(dir, name))), expected, `Fixture changed: ${name}`);
  }
  const read = name => {
    assert.ok(hashes[name], `Unhashed fixture: ${name}`);
    return JSON.parse(fs.readFileSync(path.join(dir, name)));
  };
  const contract = read('contract.json');
  const original = read('expected-frozen.json'), supplemental = read('supplemental-frozen.json');
  const entries = [...original.entries, ...supplemental.entries];
  const inputs = read('emitted-inputs.json');
  assert.ok(exactCases(entries, inputs), 'Pinned emitted input set differs');
  assert.equal(contract.schemaVersion, 1);
  assert.equal(original.schemaVersion, 1);
  assert.equal(supplemental.schemaVersion, 1);
  assert.deepEqual(original.conceptNames, supplemental.conceptNames);
  assert.deepEqual(Object.keys(contract.caseCounts).sort(), ['completed', 'preserved', 'supplemental']);
  assert.deepEqual(contract.caseCounts, { preserved: 47, completed: 47, supplemental: 3 });
  assert.equal(entries.length, 97);
  assert.equal(new Set(entries.map(caseKey)).size, entries.length, 'Duplicate oracle case');
  assert.equal(new Set(Object.values(contract.routes).map(route => JSON.stringify(route))).size, Object.keys(contract.routes).length, 'Activity routes must be distinct');
  assert.deepEqual([...new Set(entries.filter(e => e.expected.kind === 'activity').map(e => e.expected.nodeId))].sort(), Object.keys(contract.routes).sort(), 'Missing activity route coverage');
  assert.deepEqual([...new Set(entries.filter(e => e.expected.kind === 'activity').map(e => e.expected.activity))].sort(), Object.keys(contract.activities).sort(), 'Missing disposition coverage');
  assert.deepEqual([...new Set(entries.filter(e => e.expected.kind === 'pause').map(e => e.expected.nodeId))].sort(), Object.keys(contract.pauseNullExpressions).sort(), 'Missing pause frontier coverage');
  const dispositionCounts = { preserved: [38, 2, 7], completed: [0, 29, 18], supplemental: [1, 1, 1] };
  for (const [suite, count] of Object.entries(contract.caseCounts)) {
    assert.equal(entries.filter(e => e.suite === suite).length, count);
    const cases = entries.filter(e => e.suite === suite);
    assert.deepEqual([cases.filter(e => e.expected.kind === 'pause').length, cases.filter(e => e.expected.activity === 'certify.Met').length, cases.filter(e => e.expected.activity === 'not-certify.Unmet').length], dispositionCounts[suite], 'Disposition coverage changed');
    assert.ok(hashes[`src/cel/${suite}.cel`]);
  }
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry.answers).sort(), Object.keys(contract.bindings).sort());
    assert.ok(['pause', 'activity'].includes(entry.expected.kind));
    for (const [key, value] of Object.entries(entry.answers)) {
      assert.ok(value === null || typeof value === (contract.bindings[key].valueType === 'valueBoolean' ? 'boolean' : 'string'));
    }
    if (entry.expected.kind === 'activity') {
      assert.ok(contract.activities[entry.expected.activity] && contract.routes[entry.expected.nodeId]);
    } else {
      assert.equal(entry.expected.activity, null);
      assert.ok(Array.isArray(contract.pauseNullExpressions[entry.expected.nodeId]), 'Pause frontier lacks native witness contract');
      assert.ok(['B', 'P'].some(k => entry.answers[k] === null), 'This pause suite requires an unknown request determination');
    }
  }
  return { contract, entries, hashes, inputs };
}

function exactCases(expected, actual) {
  const a = expected.map(caseKey), b = actual.map(caseKey);
  return a.length === b.length && new Set(b).size === b.length && same([...a].sort(), [...b].sort());
}

function objects(value, predicate) {
  if (!value || typeof value !== 'object') return [];
  return [...(predicate(value) ? [value] : []), ...Object.values(value).flatMap(v => objects(v, predicate))];
}

function checkNative(result, entry, contract, subject, stderr = '') {
  const errors = [];
  const check = (ok, message) => { if (!ok) errors.push(message); };
  check(result?.resourceType === 'Parameters' && Array.isArray(result.parameter), 'Expected Parameters result');
  check(!hasEngineError(stderr), 'Engine logged an error');
  const nullExpressions = [...new Set([...stderr.matchAll(/Condition expression (.+) returned null/g)].map(m => m[1]))].sort();
  const expectedNulls = entry.expected.kind === 'pause' ? contract.pauseNullExpressions?.[entry.expected.nodeId] : [];
  check(Array.isArray(expectedNulls) && same(nullExpressions, [...(expectedNulls || [])].sort()), 'Wrong native null-condition witnesses');
  const resources = objects(result, r => typeof r.resourceType === 'string');
  check(!resources.some(r => r.resourceType === 'OperationOutcome'), 'Engine returned OperationOutcome');
  const qs = resources.filter(r => r.resourceType === 'Questionnaire');
  const qrs = resources.filter(r => r.resourceType === 'QuestionnaireResponse');
  const groups = resources.filter(r => r.resourceType === 'RequestGroup');
  const activities = resources.filter(r => r.resourceType === 'CommunicationRequest');
  check(resources.every(r => ['Parameters', 'Bundle', 'Questionnaire', 'QuestionnaireResponse', 'RequestGroup', 'CommunicationRequest'].includes(r.resourceType)), 'Unexpected returned resource type');
  check(qs.length === 1 && qrs.length === 1, 'Expected exactly one Questionnaire and QuestionnaireResponse');
  const expectedRef = contract.activities[entry.expected.activity];
  const wrapperId = expectedRef ? expectedRef.split('/')[1] + '-recommendation' : null;
  const roots = groups.filter(g => g.id === contract.planId);
  const wrappers = groups.filter(g => g.id === wrapperId);
  check(roots.length === 1 && groups.length === (expectedRef ? 2 : 1) && wrappers.length === (expectedRef ? 1 : 0), 'Unexpected/duplicate RequestGroup');
  for (const r of [...qrs, ...groups, ...activities]) check(r.subject?.reference === subject, `Wrong subject: ${r.resourceType}/${r.id}`);
  const q = qs[0], qr = qrs[0];
  check(q?.url === contract.questionnaireUrl && typeof q?.version === 'string' && q.version.length > 0, 'Wrong Questionnaire canonical/version');
  check(q?.status === 'active', 'Questionnaire is not active');
  check(qr?.questionnaire === `${q?.url}|${q?.version}`, 'QuestionnaireResponse is not linked to this Questionnaire version');
  const questions = objects(q?.item, r => typeof r.linkId === 'string');
  const responses = objects(qr?.item, r => typeof r.linkId === 'string');
  const definitions = new Set(Object.values(contract.bindings).map(b => b.definition));
  check(questions.filter(i => !['group', 'display'].includes(i.type)).every(i => definitions.has(i.definition)), 'Unexpected answerable question');
  for (const [name, items] of [['Questionnaire', questions], ['QuestionnaireResponse', responses]]) {
    check(new Set(items.map(i => i.linkId)).size === items.length, `Duplicate ${name} linkId`);
  }
  for (const response of responses) check(questions.some(i => i.linkId === response.linkId && i.definition === response.definition), 'Unassociated response item');
  const answers = {};
  for (const [key, binding] of Object.entries(contract.bindings)) {
    const matches = questions.filter(i => i.definition === binding.definition);
    // Authored nesting: request inputs at root; cosmetic in the entered request arm;
    // qualification in its non-cosmetic branch; individual documentation in the both arm.
    // This freezes the observed pinned-engine item set, not CQL short-circuit evaluation
    // or client visibility. Later-action inputs can be included at a null frontier.
    const requestEntered = entry.answers.B === true || entry.answers.P === true;
    const nonCosmetic = requestEntered && entry.answers.cosmetic === false;
    const present = ['B', 'P'].includes(key) || (key === 'cosmetic' ? requestEntered : ['bdoc', 'pdoc'].includes(key) ? nonCosmetic && entry.answers.B === true && entry.answers.P === true : nonCosmetic);
    check(matches.length === (present ? 1 : 0), `Wrong question presence: ${key}`);
    if (matches.length === 0) {
      answers[key] = { state: 'item-absent' };
      continue;
    }
    const item = matches[0];
    check(item.type === (binding.valueType === 'valueBoolean' ? 'boolean' : 'choice'), `Wrong question type: ${key}`);
    check(item.required === binding.required, `Wrong question required flag: ${key}`);
    const optionKeys = (item.answerOption || []).map(o => Object.keys(o).filter(k => k.startsWith('value')).join(','));
    const optionValues = (item.answerOption || []).map(o => `${o.valueCoding?.system}|${o.valueCoding?.code}`).sort();
    const wantedOptions = (binding.optionCodes || []).map(code => `${binding.system}|${code}`).sort();
    check(!item.answerValueSet && optionKeys.every(k => k === 'valueCoding') && same(optionValues, wantedOptions), `Wrong question answer options: ${key}`);
    const matchedResponses = responses.filter(i => i.linkId === item.linkId && i.definition === binding.definition);
    check(matchedResponses.length === 1, `Missing/duplicate response: ${key}`);
    const actual = matchedResponses[0]?.answer || [];
    const want = entry.answers[key];
    check(Array.isArray(actual) && actual.length === (want === null ? 0 : 1), `Wrong answer count: ${key}`);
    if (want !== null && actual.length === 1) {
      const answer = actual[0];
      check(same(Object.keys(answer).filter(k => k.startsWith('value')), [binding.valueType]), `Wrong answer value type: ${key}`);
      const value = answer[binding.valueType];
      check(binding.valueType === 'valueBoolean' ? value === want : value?.system === binding.system && value?.code === want, `Wrong typed answer: ${key}`);
    }
    answers[key] = { state: actual.length ? 'answered' : 'unanswered', answer: actual, definition: item.definition, linkId: item.linkId };
  }
  const routes = [];
  function visit(actions, parents = []) {
    for (const action of actions || []) {
      const route = [...parents, action.title ?? action.id ?? '?'];
      if (action.resource) routes.push({ route, resource: action.resource.reference });
      visit(action.action, route);
    }
  }
  roots.forEach(g => visit(g.action));
  check(same(activities.map(a => `${a.resourceType}/${a.id}`).sort(), expectedRef ? [expectedRef] : []), 'Wrong/duplicate native activity');
  if (expectedRef && activities.length === 1) {
    const want = contract.activityContent[entry.expected.activity];
    check(!!want && Object.entries(want).every(([key, value]) => key === 'meta' ? same(activities[0].meta?.profile, value.profile) : same(activities[0][key], value)), 'Wrong native activity content');
  }
  check(same(routes, expectedRef ? [{ route: contract.routes[entry.expected.nodeId], resource: `RequestGroup/${wrapperId}` }] : []), 'Wrong native route/resource association');
  if (expectedRef) {
    const actions = wrappers[0]?.action;
    check(actions?.length === 1 && actions[0].title === entry.expected.activity && !actions[0].action && actions[0].resource?.reference === expectedRef, 'Recommendation wrapper points to wrong activity');
  }
  if (entry.expected.kind === 'pause') {
    for (const key of ['B', 'P'].filter(k => entry.answers[k] === null)) check(answers[key]?.state === 'unanswered', `Pause lacks named unanswered input: ${key}`);
  }
  return { passed: errors.length === 0, errors, routes, answers, nullExpressions };
}

function checkCre(cre, entry) {
  try {
    const predictions = (cre?.runs || []).filter(r => r.case === entry.case);
    const prediction = predictions[0];
    const trace = nodes => (nodes || []).flatMap(n => [n, ...trace(n.children)]);
    const relevant = trace(prediction?.trace).filter(n => entry.expected.kind === 'pause' ? n.unknown : n.kind === 'action' && n.evaluated && !n.children && !n.guardedOut);
    const passed = predictions.length === 1 && prediction.status === 'pass'
      && same(prediction.produced.map(p => p.recommendation), entry.expected.activity ? [entry.expected.activity] : [])
      && same(relevant.map(n => n.nodeId), [entry.expected.nodeId]);
    return { passed, prediction: prediction ?? null, error: cre?.error ?? null };
  } catch (e) { return { passed: false, prediction: null, error: `Malformed CRE prediction: ${String(e)}` }; }
}

function nativeVerdict(result, entry, contract, subject, processResult) {
  // parseDriverStdout strips a dependency-log prefix; inspect it without scanning clinical JSON.
  const stdout = processResult.stdout || '', jsonStart = stdout.indexOf('{');
  const logs = (processResult.stderr || '') + '\n' + stdout.slice(0, jsonStart < 0 ? stdout.length : jsonStart);
  const infrastructure = !!processResult.failure || processResult.exitCode !== 0 || result?.resourceType !== 'Parameters'
    || hasEngineError(logs)
    || objects(result, r => r.resourceType === 'OperationOutcome').length > 0;
  let verdict;
  try { verdict = checkNative(result, entry, contract, subject, logs); }
  catch (e) { return { passed: false, failureKind: 'infrastructure', errors: [`Malformed native result: ${String(e)}`] }; }
  if (infrastructure) { verdict.errors.push(processResult.failure || `Engine/result failure (exit ${processResult.exitCode})`); verdict.passed = false; }
  return { ...verdict, failureKind: verdict.passed ? null : infrastructure ? 'infrastructure' : 'acceptance' };
}

function summarize(entries, rows, sourceDirty = null) {
  const complete = exactCases(entries, rows);
  const nativeAccepted = complete && rows.every(r => r.native?.passed === true);
  const creAccepted = complete && rows.every(r => r.cre?.passed === true);
  return { complete, cases: rows.length, nativePassed: rows.filter(r => r.native?.passed === true).length,
    crePassed: rows.filter(r => r.cre?.passed === true).length, nativeAccepted, creAccepted, sourceDirty,
    infrastructureFailures: rows.filter(r => r.native?.failureKind === 'infrastructure').length,
    nativeAcceptanceFailures: rows.filter(r => r.native?.failureKind === 'acceptance').length,
    // A disagreeing CRE fails the paired suite, but never rewrites the native verdict.
    accepted: nativeAccepted && creAccepted };
}
module.exports = { hash, loadFixture, caseKey, exactCases, objects, checkNative, checkCre, nativeVerdict, summarize };
