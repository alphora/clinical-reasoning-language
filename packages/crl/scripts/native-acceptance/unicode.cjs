#!/usr/bin/env node
'use strict';
// Real shipped-driver encoding probe. Explicit paths; never modifies a clinical fixture.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { childEnvironment, runBounded } = require('./process.cjs');
const dist = path.resolve(__dirname, '../../dist');
const { ANSWER_EXAMPLE_BASE, ANSWER_EXAMPLE_TERMS, ANSWER_EXAMPLE_CEL, answerExampleSource } = require(path.join(dist, 'authoring-kit/answerExample'));
const { emitCQLImports } = require(path.join(dist, 'imports/emit'));
const { emitFhirDefFromPath } = require(path.join(dist, 'fhir-emitter/closureOrchestrator'));
const { resolveCelImports } = require(path.join(dist, 'cel/imports'));
const { emitCelToFhir } = require(path.join(dist, 'cel/emitter/emitFhir'));
const { buildEngineRepoBundle, parseDriverStdout } = require(path.join(dist, 'results/repoBundle'));
const { extractResults } = require(path.join(dist, 'results/runProducer'));
const { driverArgs, driverDir, PROPERTIES_LAUNCHER } = require(path.join(dist, 'results/driver'));
const { verifyJar, ENGINE_JAR_SOURCE } = require(path.join(dist, 'results/spawn'));
const sample = 'Caf\u00e9 \u2014 \u65e5\u672c\u8a9e \ud83e\ude7a';
const answerCode = 'sympt\u00f4me-\u65e5\u672c\ud83e\ude7a';
const question = `Which complaint? ${sample}`;
const description = `Select one: ${sample}`;
const write = (file, data) => fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n', 'utf8');
const strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
async function main() {
  const [jarArg, java, outputArg, baselineArg] = process.argv.slice(2);
  assert.ok(jarArg && java && outputArg, 'unicode.cjs ENGINE_JAR JAVA NEW_OUTPUT [BASELINE_DRIVER_DIR]');
  const jar = fs.realpathSync(jarArg), output = path.resolve(outputArg);
  assert.ok(verifyJar(jar, ENGINE_JAR_SOURCE.sha256).ok, 'Pinned engine required');
  fs.mkdirSync(output); // New owned evidence directory, never overwrite a run.
  write(path.join(output, 'package.json'), { name: 'unicode-probe', version: '1.0.0', crl: { canonicalBase: ANSWER_EXAMPLE_BASE, date: '2026-09-16' } });
  const source = path.join(output, 'src/crl'), caseDir = path.join(output, 'src/cel/mv');
  fs.mkdirSync(source, {recursive: true}); fs.mkdirSync(caseDir, {recursive: true});
  const crl = path.join(source, 'policy.crl'), cel = path.join(caseDir, 'cases.cel');
  write(crl, answerExampleSource().replace('Which complaint supports this request?', question).replace('Select the documented complaint.', description));
  write(path.join(source, 'shared.crl'), 'library "Shared".\n' + ANSWER_EXAMPLE_TERMS.replace('`symptom`', '`' + answerCode + '`').replace('display is `Symptom`', `display is \`${sample}\``));
  write(cel, ANSWER_EXAMPLE_CEL.replace(/case "Negative"[\s\S]*/, '').replace('value is "symptom"', 'value is "' + answerCode + '"'));
  const cql = emitCQLImports(crl), fhir = emitFhirDefFromPath(crl, { date: "2026-09-16" }), cases = emitCelToFhir(resolveCelImports(cel));
  assert.equal(cql.success, true, JSON.stringify(cql.errors)); assert.equal(fhir.success, true, JSON.stringify(fhir.errors));
  assert.deepEqual(cases.diagnostics.filter(d => d.severity === 'error'), []);
  assert.ok(strings(fhir).includes(question)); assert.ok(strings(fhir).includes(description));
  const definitions = fhir.resources.map(r => r.resource);
  const pd = definitions.find(r => r.resourceType === 'PlanDefinition' && r.type?.coding?.some(c => c.code === 'workflow-definition'));
  assert.ok(pd);
  const positive = cases.emittedCases.find(c => c.caseName === 'Positive'); assert.ok(positive);
  const repo = buildEngineRepoBundle({ definitions, cqlByLibraryFile: Object.fromEntries(cql.cqlByLibrary.map(l => [l.outputFilename, l.cql])), caseInput: positive });
  assert.deepEqual(repo.missingCql, []);
  const patient = positive.resources.find(r => r.body.resourceType === 'Patient').body;
  const repoPath = path.join(output, 'repo.json'); write(repoPath, repo.bundle);
  const env = childEnvironment(output);
  const settings = ['-Xmx768m', '-XX:ActiveProcessorCount=2'];
  const hostile = ['-Dfile.encoding=windows-1252', '-Dstdout.encoding=windows-1252', '-Dstderr.encoding=windows-1252', '-Dsun.stdout.encoding=windows-1252', '-Dsun.stderr.encoding=windows-1252'];
  const runs = [];
  async function run(name, loaderPath, flags, expectExact) {
    const result = await runBounded(java, driverArgs({ jvmFlags: [...settings, ...flags], engineJarPath: jar, loaderPath, repoPath, planDefinitionId: pd.id, subjectReference: `Patient/${patient.id}` }), { cwd: output, env, timeoutMs: 120000 });
    write(path.join(output, name + '.stdout'), result.stdout); write(path.join(output, name + '.stderr'), result.stderr);
    assert.equal(result.exitCode, 0, result.stderr); assert.ok(!result.failure);
    const params = parseDriverStdout(result.stdout); assert.ok(params);
    const pair = extractResults(params);
    assert.ok(pair.questionnaire); assert.ok(pair.questionnaireResponse);
    const exactQuestion = strings(pair.questionnaire).includes(question);
    const exactAnswer = strings(pair.questionnaireResponse).includes(answerCode);
    if (expectExact) { assert.ok(exactQuestion, 'Question text corrupted'); assert.ok(exactAnswer, 'Typed answer code corrupted'); }
    else assert.ok(!exactQuestion || !exactAnswer, 'Baseline did not reproduce corruption');
    runs.push({ name, exactQuestion, exactAnswer });
    return pair;
  }
  if (baselineArg) await run('baseline-hostile', fs.realpathSync(baselineArg), hostile, false);
  await run('current-hostile', driverDir(), hostile, true);
  await run('current-default', driverDir(), [], true);
  // The production path must preserve values in the files its consumers read.
  const savedEnv = { ...process.env };
  try {
    for (const key of Object.keys(process.env)) if (/^(JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS)$/i.test(key)) delete process.env[key];
    process.env.JAVA_HOME = path.dirname(path.dirname(java));
    process.env.JAVA_TOOL_OPTIONS = hostile.join(' ');
    process.env.TEMP = process.env.TMP = process.env.TMPDIR = output;
    const { produceResults } = require(path.join(dist, 'results/produce'));
    const produced = await produceResults({ celPath: cel, crlPath: crl, useCase: 'prior-auth', outRoot: output, jarPath: jar, crlVersion: 'unicode-probe' });
    assert.equal(produced.ok, true, JSON.stringify(produced));
    assert.equal(produced.failed, 0, JSON.stringify(produced.manifest));
    assert.equal(produced.manifest.cases.length, 1);
    const artifacts = produced.manifest.cases[0].artifacts.map(a => JSON.parse(fs.readFileSync(path.join(output, a.path), 'utf8')));
    assert.ok(strings(artifacts.find(r => r.resourceType === 'Questionnaire')).includes(question));
    assert.ok(strings(artifacts.find(r => r.resourceType === 'QuestionnaireResponse')).includes(answerCode));
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
  // Reflection retains per-case routing and caps; no JSON may escape into wrapper stdout.
  const jobs = [];
  for (const name of ['batch-one', 'batch-two']) {
    const directory = path.join(output, name); fs.mkdirSync(directory);
    jobs.push(repoPath, pd.id, `Patient/${patient.id}`, directory);
  }
  const jobsFile = path.join(output, 'jobs.txt'); write(jobsFile, jobs.join('\n') + '\n');
  const batchArgs = limit => [...settings, ...hostile, '-Dloader.main=BatchApplyDriver', `-Dloader.path=${driverDir()},${path.join(__dirname, 'batch-classes')}`, '-cp', jar, PROPERTIES_LAUNCHER, 'ApplyDriver', jobsFile, '120000', String(limit)];
  const batch = await runBounded(java, batchArgs(32 * 1024 * 1024), { cwd: output, env, timeoutMs: 240000 });
  assert.equal(batch.exitCode, 0, batch.stderr); assert.ok(!batch.failure);
  assert.ok(!batch.stdout.includes('"resourceType"'), 'JSON escaped routed capture');
  for (const name of ['batch-one', 'batch-two']) {
    const pair = extractResults(parseDriverStdout(fs.readFileSync(path.join(output, name, 'stdout.log'), 'utf8')));
    assert.ok(strings(pair.questionnaire).includes(question));
    assert.ok(strings(pair.questionnaireResponse).includes(answerCode));
    assert.ok(fs.existsSync(path.join(output, name, 'completed.txt')));
  }
  const capped = path.join(output, 'batch-capped'); fs.mkdirSync(capped);
  write(jobsFile, [repoPath, pd.id, `Patient/${patient.id}`, capped].join('\n') + '\n');
  const cap = await runBounded(java, batchArgs(4096), { cwd: output, env, timeoutMs: 120000 });
  assert.equal(cap.exitCode, 125); assert.ok(!fs.existsSync(path.join(capped, 'completed.txt')));
  assert.equal(fs.statSync(path.join(capped, 'stdout.log')).size, 4096);
  assert.ok(fs.readFileSync(path.join(capped, 'stdout.log'), 'utf8').includes('"resourceType":"Parameters"'));
  assert.ok(fs.statSync(path.join(capped, 'stderr.log')).size < 4096);
  write(path.join(output, 'summary.json'), { sample, question, description, runs, runtime: java });
  console.log(JSON.stringify(runs));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
