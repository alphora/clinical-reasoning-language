#!/usr/bin/env node
'use strict';
// REFACTOR:grounded — reviewed native Bleph contract, with independently frozen expectations.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { hash, loadFixture, exactCases, caseKey, checkCre, nativeVerdict, summarize } = require('./check.cjs');
const { childEnvironment, runBounded } = require('./process.cjs');
const packageRoot = path.resolve(__dirname, '../..');
const workspace = fs.realpathSync(path.resolve(packageRoot, '../..'));
const fixture = path.join(packageRoot, 'test/acceptance/bleph');
const write = (file, value) => fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
// Capture at startup, not after a long run during which the workspace may have changed.
const harnessHashes = Object.fromEntries(files(__dirname).filter(f => f.endsWith('.cjs')).map(f => [path.basename(f), hash(fs.readFileSync(f))]));
const bounds = Object.freeze({ heapMiB: 768, activeProcessors: 2, timeoutMs: 120000, maxBytes: 32 * 1024 * 1024 });
const jvmSettings = Object.freeze({ 'user.timezone': 'UTC', 'user.language': 'en', 'user.country': 'US', 'file.encoding': 'UTF-8', 'stdout.encoding': 'UTF-8', 'stderr.encoding': 'UTF-8', 'sun.stdout.encoding': 'UTF-8', 'sun.stderr.encoding': 'UTF-8' });
const settingsArgs = Object.entries(jvmSettings).map(([key, value]) => `-D${key}=${value}`);

function options(args) {
  const result = { workers: 2 };
  for (let i = 0; i < args.length; i += 2) {
    const key = { '--engine-jar': 'jar', '--out': 'out', '--workers': 'workers', '--java': 'java' }[args[i]];
    assert.ok(key && args[i + 1] && !args[i + 1].startsWith('--'), 'Usage: --engine-jar PATH --out NEW_DIRECTORY [--workers 1..4] [--java PATH]');
    assert.ok(key === 'workers' ? !result.workersSpecified : result[key] === undefined, `Duplicate option ${args[i]}`);
    if (key === 'workers') result.workersSpecified = true;
    result[key] = key === 'workers' ? Number(args[i + 1]) : args[i + 1];
  }
  assert.ok(result.jar && result.out, 'Explicit --engine-jar and --out are required');
  assert.ok(Number.isInteger(result.workers) && result.workers >= 1 && result.workers <= 4, 'workers must be 1..4');
  result.jar = fs.realpathSync(result.jar);
  // Resolve the existing parent to stop symlink/junction aliases from bypassing source protection.
  const target = path.resolve(result.out);
  assert.ok(fs.existsSync(path.dirname(target)), 'Output parent must exist');
  result.out = path.join(fs.realpathSync(path.dirname(target)), path.basename(target));
  const relative = path.relative(workspace, result.out).replaceAll('\\', '/');
  assert.ok(path.isAbsolute(relative) || relative.startsWith('../') || /^tmp\//i.test(relative), 'Output must be outside source/fixture directories: outside the workspace or under tmp/');
  assert.ok(!fs.existsSync(result.out), 'Output directory must be new');
  delete result.workersSpecified;
  return result;
}

async function main(args) {
  const opts = options(args), { contract, entries, hashes, inputs } = loadFixture(fixture);
  const { ENGINE_JAR_SOURCE, verifyJar, parseJavaMajor, MIN_JAVA_MAJOR } = require('../../dist/results/spawn');
  const { driverReady, driverClassPath, driverArgs } = require('../../dist/results/driver');
  const { buildEngineRepoBundle, parseDriverStdout } = require('../../dist/results/repoBundle');
  assert.equal(verifyJar(opts.jar, ENGINE_JAR_SOURCE.sha256).ok, true, 'Requires the original pinned engine jar');
  const ready = driverReady(); assert.equal(ready.ok, true, JSON.stringify(ready));
  fs.mkdirSync(opts.out); // Exclusive creation; never overwrite or remove another run.
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  const rows = [];
  const workerFailures = [];
  let sourceDirty = null;
  try {
    const java = opts.java || 'java';
    const version = await runBounded(java, [...settingsArgs, '-version'], { cwd: opts.out, env: childEnvironment(opts.out), signal: controller.signal, timeoutMs: 15000 });
    assert.ok(!version.failure && version.exitCode === 0 && parseJavaMajor(version.stderr + version.stdout) >= MIN_JAVA_MAJOR, 'Java runtime unavailable/too old');
    const dist = path.join(packageRoot, 'dist');
    const distHashes = Object.fromEntries(files(dist).map(f => [path.relative(dist, f).replaceAll('\\', '/'), hash(fs.readFileSync(f))]));
    const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: workspace, encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim();
    const sourceStatus = git('status', '--porcelain'); sourceDirty = sourceStatus !== '';
    write(path.join(opts.out, 'manifest.json'), { schemaVersion: 1, authority: 'Native R4 applyR5 direct-data acceptance; CRE recorded independently.',
      sourceHead: git('rev-parse', 'HEAD'), sourceStatus, sourceDirty, node: process.version, java: version.stderr + version.stdout,
      platform: process.platform, arch: process.arch, nodeTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone, nodeLocale: Intl.DateTimeFormat().resolvedOptions().locale, jvmSettings,
      engine: ENGINE_JAR_SOURCE, driverSha256: hash(fs.readFileSync(driverClassPath())), distHashes, fixtureHashes: hashes, harnessHashes,
      workers: opts.workers, invocation: 'shipped ApplyDriver; useServerData=true; no request bundle', bounds });
    const { resolveCelImports } = require('../../dist/cel/imports');
    const { validateCEL } = require('../../dist/cel/validator');
    const { emitCelToFhir } = require('../../dist/cel/emitter/emitFhir');
    const { emitCQLImports } = require('../../dist/imports/emit');
    const { emitFhirDefFromPath } = require('../../dist/fhir-emitter/closureOrchestrator');
    const { runCel } = require('../../dist/cre/run');
    const crl = path.join(fixture, 'src/crl/blepharoplasty-blepharoptosis-repair.crl');
    const cql = emitCQLImports(crl), fhir = emitFhirDefFromPath(crl);
    write(path.join(opts.out, 'definitions.json'), { cql, fhir });
    assert.equal(cql.success, true, JSON.stringify(cql.errors)); assert.equal(fhir.success, true, JSON.stringify(fhir.errors));
    assert.equal(fhir.resources.filter(r => r.sourceKind === 'Decision' && r.resource.id === contract.planId).length, 1);
    const jobs = [];
    for (const suite of Object.keys(contract.caseCounts)) {
      const graph = resolveCelImports(path.join(fixture, `src/cel/${suite}.cel`)), validation = validateCEL(graph);
      assert.deepEqual(validation.errors, []);
      const cel = emitCelToFhir(graph);
      assert.deepEqual(cel.diagnostics.filter(d => d.severity === 'error'), []);
      let cre;
      try { cre = runCel(graph); } catch (e) { cre = { error: String(e), runs: [] }; }
      write(path.join(opts.out, suite + '-emission.json'), { validation, cel, cre });
      assert.ok(exactCases(entries.filter(e => e.suite === suite), cel.emittedCases.map(c => ({ suite, case: c.caseName }))), 'Emitted case set differs from oracle');
      for (const [index, emitted] of cel.emittedCases.entries()) {
        const entry = entries.find(e => e.suite === suite && e.case === emitted.caseName);
        const prediction = checkCre(cre, entry);
        const data = emitted.resources.map(r => r.body), identities = data.map(r => `${r.resourceType}/${r.id}`);
        assert.equal(hash(JSON.stringify(data)), inputs.find(e => e.suite === suite && e.case === emitted.caseName).resourcesSha256, 'Emitted case resources differ from frozen native inputs');
        assert.equal(new Set(identities).size, identities.length, 'Duplicate case resource identity');
        const patients = data.filter(r => r.resourceType === 'Patient'); assert.equal(patients.length, 1);
        for (const sr of data.filter(r => r.resourceType === 'ServiceRequest')) {
          assert.equal(sr.status, 'active'); assert.equal(sr.intent, 'order'); assert.notEqual(sr.doNotPerform, true); assert.ok(sr.code?.coding?.[0]?.code);
        }
        const repo = buildEngineRepoBundle({ definitions: fhir.resources.map(r => r.resource), cqlByLibraryFile: Object.fromEntries(cql.cqlByLibrary.map(r => [r.outputFilename, r.cql])), caseInput: { caseName: emitted.caseName, resources: emitted.resources } });
        assert.deepEqual(repo.missingCql, []);
        for (const resource of data) assert.deepEqual(repo.bundle.entry.filter(e => e.resource.resourceType === resource.resourceType && e.resource.id === resource.id).map(e => e.resource), [resource], 'Case resource must be loaded exactly once, unchanged');
        jobs.push({ suite, case: emitted.caseName, name: `${suite}-${String(index + 1).padStart(2, '0')}`, entry, repo: repo.bundle, subject: 'Patient/' + patients[0].id, cre: prediction });
      }
    }
    assert.ok(exactCases(entries, jobs), 'Incomplete/duplicate scheduling');
    let next = 0;
    async function worker() {
      while (next < jobs.length && !controller.signal.aborted) {
        const job = jobs[next++], dir = path.join(opts.out, job.name); fs.mkdirSync(dir);
        const repoPath = path.join(dir, 'repo.json'); write(repoPath, job.repo);
        const args = driverArgs({ jvmFlags: [`-Xmx${bounds.heapMiB}m`, '-XX:+ExitOnOutOfMemoryError', `-XX:ActiveProcessorCount=${bounds.activeProcessors}`, '-Djava.awt.headless=true', `-Djava.io.tmpdir=${dir}`, ...settingsArgs], engineJarPath: opts.jar, loaderPath: ready.loaderPath, repoPath, planDefinitionId: contract.planId, subjectReference: job.subject });
        write(path.join(dir, 'command.json'), { executable: java, args });
        const start = Date.now();
        const processResult = await runBounded(java, args, { cwd: dir, env: childEnvironment(dir), signal: controller.signal, timeoutMs: bounds.timeoutMs, maxBytes: bounds.maxBytes });
        processResult.durationMs = Date.now() - start;
        write(path.join(dir, 'stdout.log'), processResult.stdout); write(path.join(dir, 'stderr.log'), processResult.stderr);
        write(path.join(dir, 'process.json'), { ...processResult, stdout: undefined, stderr: undefined });
        const result = parseDriverStdout(processResult.stdout);
        if (result) write(path.join(dir, 'result.json'), result);
        const native = nativeVerdict(result, job.entry, contract, job.subject, processResult);
        const row = { suite: job.suite, case: job.case, expected: job.entry.expected, cre: job.cre, native, evidenceDirectory: job.name };
        rows.push(row); write(path.join(dir, 'comparison.json'), row); write(path.join(opts.out, 'comparison.json'), rows);
        console.log(JSON.stringify({ completed: rows.length, case: job.name, native: native.passed, cre: job.cre.passed, errors: native.errors }));
      }
    }
    const workers = Array.from({ length: opts.workers }, (_, workerId) => worker().catch(e => { workerFailures.push({ workerId, error: String(e), occurredAt: new Date().toISOString() }); controller.abort(); throw e; }));
    await Promise.allSettled(workers);
    if (workerFailures.length) throw new Error(workerFailures[0].error);
    rows.sort((a, b) => caseKey(a) < caseKey(b) ? -1 : caseKey(a) > caseKey(b) ? 1 : 0);
    write(path.join(opts.out, 'comparison.json'), rows);
    const summary = summarize(entries, rows, sourceDirty); write(path.join(opts.out, 'summary.json'), summary);
    console.log(JSON.stringify(summary)); if (!summary.accepted) process.exitCode = 1;
  } catch (e) {
    controller.abort();
    write(path.join(opts.out, 'summary.json'), { ...summarize(entries, rows, sourceDirty), accepted: false, fatal: String(e), workerFailures });
    throw e;
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { options, main };
