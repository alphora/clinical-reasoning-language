#!/usr/bin/env node
// pipeline.mjs — one-call KE engineering pipeline over the pinned CRL MCP bundle.
//
//   node pipeline.mjs --artifact <abs package root> --evidence <abs NEW dir> \
//        [--stages validate,cre,emit,native,controls,final,ids] [--crl <path>] [--mv <cel>] \
//        [--regression <cel>] [--anchor <txt>] [--provenance <json>] [--observe] [--no-mv-native]
//
// Every raw tool response is saved under <evidence>/<stage>/ ; stdout is a bounded summary
// (<= ~6 KB) and <evidence>/receipt.json carries the machine-readable result. The pipeline
// never prints a full tool payload. Reading raw evidence is the caller's job (bounded).
//
// Stages (all optional, default = validate,cre,emit,final,ids; native/controls are explicit):
//   validate  validate_crl(crl) + validate_cel(each CEL)
//   cre       run_decision(each CEL)  -> per-case status table
//   emit      emit_crl(crl,out=root) + emit_cel(mv,out=root) -> inventories (producer-owned trees)
//   native    emit_results(mv, crl, prior-auth, outRoot=root, pinned jar) -> per-case native state
//   controls  regression cases executed natively in an isolated fixture (byte-identical CRL +
//             package.json, regression CEL placed as that fixture's MV suite) -> separate outRoot
//   final     check interactive starting fixtures, then validate_provenance strict FINAL
//             (+ regression when present)
//   ids       check_fhir_ids(src/fhir) + check_fhir_ids(tests)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPins } from './active-pins.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pins = loadPins();
const args = parseArgs(process.argv.slice(2));
const P = s => s && path.resolve(s).replace(/\\/g, '/');
const artifact = P(args.artifact); const evidence = P(args.evidence);
if (!artifact || !evidence) die('--artifact and --evidence are required (absolute paths)');
if (!fs.existsSync(path.join(artifact, 'package.json'))) die(`no package.json under ${artifact}`);
if (fs.existsSync(evidence) && fs.readdirSync(evidence).length) die(`evidence dir must be new/empty: ${evidence}`);
fs.mkdirSync(evidence, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(artifact, 'package.json'), 'utf8'));
const name = pkg.name;
const first = (dir, ext) => { const d = path.join(artifact, dir); if (!fs.existsSync(d)) return []; return fs.readdirSync(d).filter(f => f.endsWith(ext)).map(f => P(path.join(d, f))); };
// policy CRL: exact package name, then "<name>-medical-policy" (manifest convention names the package without the suffix),
// then any .crl that is not the vendored shared determination library
const crlFiles = first('src/crl', '.crl');
const crl = P(args.crl) || crlFiles.find(f => path.basename(f, '.crl') === name) || crlFiles.find(f => path.basename(f, '.crl') === `${name}-medical-policy`)
  || crlFiles.find(f => path.basename(f, '.crl') !== 'medical-policy-determination') || crlFiles[0];
const mvFiles = args.mv ? [P(args.mv)] : first('src/cel/mv', '.cel');
const regFiles = args.regression ? [P(args.regression)] : first('src/cel/regression', '.cel');
const anchor = P(args.anchor) || first('src/anchor-source', '.txt')[0];
const provenance = P(args.provenance) || first('src/provenance', '.json').find(f => !f.endsWith('.anchormeta.json'));
const stages = (args.stages || 'validate,cre,emit,final,ids').split(',').map(s => s.trim()).filter(Boolean);
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const receipt = { pipeline: 'ke-initial-implementation/1', startedAt: new Date().toISOString(), artifact, evidence, package: name, pins: { crl: pins.crlVersion, kitHash: pins.kitHash, server: pins.server.sha256, driver: pins.driver.sha256, engine: pins.engine.sha256 }, inputs: { crl, mv: mvFiles, regression: regFiles, anchor, provenance }, inputHashes: {}, stages: {}, ok: true };
for (const f of [crl, ...mvFiles, ...regFiles, anchor, provenance, path.join(artifact, 'package.json')].filter(Boolean)) if (fs.existsSync(f)) receipt.inputHashes[f] = sha(f);
const lines = [];
const say = s => { lines.push(s); };

// ---------- transport ----------
function runCalls(stage, calls, extra = {}) {
  const dir = path.join(evidence, stage); fs.mkdirSync(dir, { recursive: true });
  const reqPath = path.join(dir, 'request.json');
  const full = calls.map((c, i) => ({ ...c, out: c.out || path.join(dir, `${String(i).padStart(2, '0')}-${c.name}.json`) }));
  fs.writeFileSync(reqPath, JSON.stringify({ cwd: artifact, calls: full, receipt: path.join(dir, 'transport-receipt.json'), stopOnError: false, ...extra }, null, 2));
  const r = spawnSync(pins.node, [path.join(here, 'crl-mcp.mjs'), reqPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(dir, 'transport-stdout.txt'), r.stdout || ''); fs.appendFileSync(path.join(dir, 'transport-stderr.txt'), r.stderr || '');
  if (r.status !== 0) return { transportFailed: true, status: r.status, stderrHead: (r.stderr || '').slice(0, 800), calls: full };
  return { transportFailed: false, calls: full };
}
function decode(outPath) {
  if (!fs.existsSync(outPath)) return { _missing: true };
  const env = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  if (env.transportError) return { _transportError: env.transportError, isError: true };
  const text = env.content?.find(b => b.type === 'text')?.text;
  let body = null; try { body = text != null ? JSON.parse(text) : null; } catch { body = { _text: String(text).slice(0, 600) }; }
  return { isError: !!env.isError, body, bytes: fs.statSync(outPath).size };
}
const short = (s, n = 160) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

// ---------- stages ----------
const results = {};
for (const stage of stages) {
  try {
    if (stage === 'validate') results.validate = stValidate();
    else if (stage === 'cre') results.cre = stCre();
    else if (stage === 'emit') results.emit = stEmit();
    else if (stage === 'native') results.native = stNative();
    else if (stage === 'controls') results.controls = stControls();
    else if (stage === 'final') results.final = stFinal();
    else if (stage === 'ids') results.ids = stIds();
    else if (stage === 'anchor') results.anchor = stAnchor();
    else if (stage === 'scaffold') results.scaffold = stScaffold();
    else { results[stage] = { ok: false, error: 'unknown stage' }; }
  } catch (e) { results[stage] = { ok: false, error: String(e?.stack || e).slice(0, 800) }; }
  receipt.stages[stage] = results[stage];
  if (results[stage] && results[stage].ok === false) receipt.ok = false;
}

function stValidate() {
  const calls = [{ name: 'validate_crl', arguments: { path: crl } }];
  for (const f of [...mvFiles, ...regFiles]) calls.push({ name: 'validate_cel', arguments: { path: f } });
  const t = runCalls('validate', calls); if (t.transportFailed) return { ok: false, transport: t };
  const out = { ok: true, files: [] };
  t.calls.forEach((c, i) => {
    const d = decode(c.out); const b = d.body || {};
    const rec = { tool: c.name, path: c.arguments.path, success: !!b.success && !d.isError, errors: (b.errors || []).length, warnings: (b.warnings || []).length, raw: c.out };
    rec.errorHead = (b.errors || []).slice(0, 5).map(e => short(e.message || JSON.stringify(e)));
    rec.warningHead = (b.warnings || []).slice(0, 5).map(e => short(e.message || JSON.stringify(e)));
    if (!rec.success) out.ok = false;
    out.files.push(rec);
  });
  say(`validate: ${out.ok ? 'OK' : 'FAIL'} ` + out.files.map(f => `${path.basename(f.path)} ${f.success ? 'ok' : 'FAIL'} e${f.errors}/w${f.warnings}`).join('; '));
  for (const f of out.files) for (const e of f.errorHead) say(`  ! ${path.basename(f.path)}: ${e}`);
  for (const f of out.files) for (const w of f.warningHead) say(`  ~ ${path.basename(f.path)}: ${w}`);
  return out;
}

function stCre() {
  const calls = [...mvFiles, ...regFiles].map(f => ({ name: 'run_decision', arguments: { path: f } }));
  if (!calls.length) return { ok: false, error: 'no CEL files' };
  const t = runCalls('cre', calls); if (t.transportFailed) return { ok: false, transport: t };
  const out = { ok: true, suites: [] };
  t.calls.forEach(c => {
    const d = decode(c.out); const b = d.body || {};
    const runs = (b.runs || []).map(r => ({ case: r.case, decision: r.decision, status: r.status, expected: r.expected, produced: r.produced }));
    const traceRuns = (b.runs || []).map(r => ({ valid: Array.isArray(r.trace) && r.trace.length > 0,
      routes: evaluatedRoutes(r.trace || [], r.decision, r.case) }));
    const traceComplete = traceRuns.every(r => r.valid && r.routes.length > 0);
    const suite = { path: c.arguments.path, success: !!b.success && !d.isError, caseCount: b.caseCount, pass: b.passCount, fail: b.failCount, error: b.errorCount, raw: c.out, cases: runs,
      traceComplete, routes: traceRuns.flatMap(r => r.routes) };
    suite.notPassed = runs.filter(r => r.status !== 'pass').map(r => ({ case: r.case, status: r.status, expected: short(JSON.stringify(r.expected), 120), produced: short(JSON.stringify(r.produced), 120) }));
    suite.executionSucceeded = suite.success;
    suite.success = suite.executionSucceeded && Number.isInteger(suite.caseCount) && suite.caseCount > 0
      && runs.length > 0 && suite.traceComplete && suite.notPassed.length === 0 && suite.fail === 0 && suite.error === 0
      && Number.isInteger(suite.pass) && suite.pass > 0;
    if (!suite.success) out.ok = false;
    out.suites.push(suite);
  });
  say(`cre: ${out.ok ? 'OK' : 'FAIL'} ` + out.suites.map(s => `${path.basename(s.path)} ${s.pass}/${s.caseCount} pass, ${s.fail} fail, ${s.error} error, trace ${s.traceComplete ? 'ok' : 'FAIL'}`).join('; '));
  const mv = out.suites.filter(s => mvFiles.includes(s.path));
  const regression = out.suites.filter(s => regFiles.includes(s.path));
  if (!mv.length || !regression.length) {
    out.mvRouteCoverage = { ok: false, error: 'MV and regression CEL are both required to compare Medical Validation routes' };
  } else if (out.suites.every(s => s.success)) {
    // An unresolved reached condition pauses; it does not take either decision branch.
    // Regression covers pause states without requiring a pause matrix in the clinical MV suite.
    const comparable = suites => suites.flatMap(s => s.routes.filter(r => r.state !== 'unresolved'));
    const seen = new Set(comparable(mv).map(r => r.key));
    const missing = new Map();
    for (const route of comparable(regression)) if (!seen.has(route.key) && !missing.has(route.key)) missing.set(route.key, route);
    out.mvRouteCoverage = { ok: missing.size === 0, mvRoutes: seen.size, regressionRoutes: new Set(comparable(regression).map(r => r.key)).size,
      missing: [...missing.values()] };
  } else {
    out.mvRouteCoverage = { ok: false, error: 'CRE must pass before MV route coverage can be assessed' };
  }
  if (!out.mvRouteCoverage.ok) out.ok = false;
  say(`  MV route coverage: ${out.mvRouteCoverage.ok ? 'OK' : 'FAIL'}${out.mvRouteCoverage.error ? ` ${out.mvRouteCoverage.error}` : ` ${out.mvRouteCoverage.mvRoutes} MV / ${out.mvRouteCoverage.regressionRoutes} regression routes; ${out.mvRouteCoverage.missing.length} missing`}`);
  for (const r of (out.mvRouteCoverage.missing || []).slice(0, 20)) say(`  ! MV missing ${r.decision} ${r.nodeId} [${r.state}] ${r.node} (regression witness: ${r.case})`);
  for (const s of out.suites) for (const r of s.notPassed.slice(0, 12)) say(`  ! ${r.case}: ${r.status} expected=${r.expected} produced=${r.produced}`);
  return out;
}
function evaluatedRoutes(nodes, decision, caseName) {
  if (typeof decision !== 'string' || !decision) throw new Error(`CRE trace has no decision identity for case ${caseName}`);
  const routes = [];
  const visit = node => {
    if (node?.evaluated && (node.kind === 'when' || node.kind === 'otherwise' || node.kind === 'action')) {
      if (typeof node.nodeId !== 'string' || !node.nodeId) throw new Error(`CRE trace has no node identity for case ${caseName}`);
      const state = node.kind === 'when' ? (node.satisfied === true ? 'true' : node.satisfied === false ? 'false' : 'unresolved') : 'taken';
      routes.push({ key: `${decision}\u0000${node.nodeId}\u0000${state}`, decision, nodeId: node.nodeId, node: node.node, state, case: caseName });
    }
    for (const child of node?.children || []) visit(child);
  };
  for (const node of nodes) visit(node);
  return routes;
}

function stEmit() {
  const calls = [{ name: 'emit_crl', arguments: { path: crl, out: artifact } }];
  if (mvFiles[0]) calls.push({ name: 'emit_cel', arguments: { path: mvFiles[0], out: artifact } });
  const t = runCalls('emit', calls); if (t.transportFailed) return { ok: false, transport: t };
  const out = { ok: true };
  const d1 = decode(t.calls[0].out); const b1 = d1.body || {};
  out.crl = { success: !!b1.success && !d1.isError, cql: (b1.cql?.libraries || []).length, fhir: b1.fhir?.resourceCount, hardErrors: (b1.hardErrors || []).length, warnings: (b1.warnings || []).length, collisions: (b1.filenameCollisions || []).length, fhirErrors: (b1.fhir?.errors || []).length, unmatched: (b1.fhir?.unmatched || []).length, written: { cql: (b1.written?.cql || []).length, fhir: (b1.written?.fhir || []).length }, raw: t.calls[0].out, errorHead: [...(b1.hardErrors || []), ...(b1.fhir?.errors || [])].slice(0, 5).map(e => short(e.message || JSON.stringify(e))) };
  if (!out.crl.success) out.ok = false;
  if (t.calls[1]) {
    const d2 = decode(t.calls[1].out); const b2 = d2.body || {};
    const diag = b2.diagnostics || [];
    out.cel = { success: !!b2.success && !d2.isError, cases: b2.caseCount, resources: b2.resourceCount, manifest: b2.manifest, written: (b2.written || []).length, diagnosticsByKind: count(diag.map(x => `${x.kind}/${x.severity}`)), nonWarning: diag.filter(x => x.severity && x.severity !== 'warning').slice(0, 5).map(x => short(x.message)), raw: t.calls[1].out, caseIds: (b2.caseManifest || []).map(c => c.caseId || c.caseSlug) };
    if (!out.cel.success) out.ok = false;
  }
  out.trees = { 'src/cql': treeInventory('src/cql'), 'src/fhir': treeInventory('src/fhir'), 'tests/data/fhir': treeInventory('tests/data/fhir') };
  say(`emit: ${out.ok ? 'OK' : 'FAIL'} crl ${out.crl.success ? 'ok' : 'FAIL'} cql=${out.crl.cql} fhir=${out.crl.fhir} hardErr=${out.crl.hardErrors} warn=${out.crl.warnings} coll=${out.crl.collisions}` + (out.cel ? `; cel ${out.cel.success ? 'ok' : 'FAIL'} cases=${out.cel.cases} resources=${out.cel.resources} diag=${JSON.stringify(out.cel.diagnosticsByKind)}` : ''));
  say(`  trees: ` + Object.entries(out.trees).map(([k, v]) => `${k}=${v.files} files`).join(', '));
  for (const e of out.crl.errorHead) say(`  ! emit_crl: ${e}`);
  for (const e of (out.cel?.nonWarning || [])) say(`  ! emit_cel: ${e}`);
  return out;
}

function nativeCall(celPath, crlPath, outRoot) {
  return { name: 'emit_results', arguments: { celPath, crlPath, useCase: 'prior-auth', outRoot, jarPath: pins.engine.path, jarSha256: pins.engine.sha256 }, timeoutMs: 4 * 3600 * 1000 };
}
function summarizeNative(outPath, label) {
  const d = decode(outPath); const b = d.body || {};
  const cases = (b.cases || []).map(c => ({ case: c.caseName, state: c.state, reason: c.reason ? short(c.reason, 200) : undefined, questionnaire: c.questionnaire || c.questionnairePath, response: c.questionnaireResponse || c.questionnaireResponsePath }));
  const byState = count(cases.map(c => c.state));
  const rec = { label, ok: !!b.ok && !d.isError && (b.failed || 0) === 0, manifest: b.manifestPath, failed: b.failed, notEmitted: (b.notEmitted || []).length, pruned: (b.pruned || []).length, orphaned: (b.orphaned || []).length, java: b.java, engineJar: b.engineJar, byState, cases, raw: outPath, transportError: d._transportError };
  say(`${label}: ${rec.ok ? 'OK' : 'FAIL'} ${JSON.stringify(byState)} failed=${b.failed} notEmitted=${rec.notEmitted} pruned=${rec.pruned} orphaned=${rec.orphaned}` + (rec.transportError ? ` transport=${short(rec.transportError)}` : ''));
  for (const c of cases.filter(c => c.state !== 'generated').slice(0, 12)) say(`  ! ${c.case}: ${c.state} ${c.reason || ''}`);
  return rec;
}
function stNative() {
  if (!mvFiles[0]) return { ok: false, error: 'no MV CEL' };
  const t = runCalls('native', [nativeCall(mvFiles[0], crl, artifact)], args.observe ? { observe: path.join(evidence, 'native', 'observed') } : {});
  if (t.transportFailed) return { ok: false, transport: t };
  const rec = summarizeNative(t.calls[0].out, 'native');
  rec.tree = treeInventory('tests/results');
  return rec;
}
function stControls() {
  if (!regFiles[0]) return { ok: false, error: 'no regression CEL' };
  const fixture = path.join(evidence, 'controls', 'fixture'); fs.mkdirSync(path.join(fixture, 'src/cel/mv'), { recursive: true });
  fs.copyFileSync(path.join(artifact, 'package.json'), path.join(fixture, 'package.json'));
  copyDir(path.join(artifact, 'src/crl'), path.join(fixture, 'src/crl'));
  if (fs.existsSync(path.join(artifact, 'node_modules'))) copyDir(path.join(artifact, 'node_modules'), path.join(fixture, 'node_modules'));
  const regCel = path.join(fixture, 'src/cel/mv', path.basename(regFiles[0]));
  fs.copyFileSync(regFiles[0], regCel);
  const fxCrl = path.join(fixture, 'src/crl', path.basename(crl));
  const same = sha(fxCrl) === sha(crl) && sha(path.join(fixture, 'package.json')) === sha(path.join(artifact, 'package.json'));
  const calls = [{ name: 'validate_cel', arguments: { path: P(regCel) } }, { name: 'run_decision', arguments: { path: P(regCel) } }, { name: 'emit_crl', arguments: { path: P(fxCrl), out: P(fixture) } }, { name: 'emit_cel', arguments: { path: P(regCel), out: P(fixture) } }, nativeCall(P(regCel), P(fxCrl), P(fixture))];
  const t = runCalls('controls', calls, args.observe ? { observe: path.join(evidence, 'controls', 'observed') } : {});
  if (t.transportFailed) return { ok: false, transport: t };
  const v = decode(t.calls[0].out).body || {}; const c = decode(t.calls[1].out).body || {}; const e1 = decode(t.calls[2].out).body || {}; const e2 = decode(t.calls[3].out).body || {};
  const rec = summarizeNative(t.calls[4].out, 'controls(native regression fixture)');
  rec.fixture = fixture; rec.byteIdentical = same; rec.validateCel = { success: !!v.success, errors: (v.errors || []).length }; rec.cre = { success: !!c.success, pass: c.passCount, fail: c.failCount, error: c.errorCount, caseCount: c.caseCount }; rec.emit = { crl: !!e1.success, cel: !!e2.success, cases: e2.caseCount, resources: e2.resourceCount };
  rec.ok = rec.ok && same && rec.validateCel.success && rec.cre.success && rec.emit.crl && rec.emit.cel;
  say(`  fixture byteIdentical=${same} validate_cel=${rec.validateCel.success} cre=${rec.cre.pass}/${rec.cre.caseCount} emit crl=${rec.emit.crl} cel=${rec.emit.cel} (${rec.emit.cases} cases)`);
  return rec;
}
function stFinal() {
  const fixtureDir = path.join(evidence, 'final'); fs.mkdirSync(fixtureDir, { recursive: true });
  const fixture = spawnSync(process.env.PYTHON || 'python', [path.join(here, 'prepare.py'), 'check-request-fixtures', '--artifact', artifact],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  fs.writeFileSync(path.join(fixtureDir, 'interactive-fixture-stdout.json'), fixture.stdout || '');
  fs.writeFileSync(path.join(fixtureDir, 'interactive-fixture-stderr.txt'), fixture.stderr || '');
  if (fixture.error || fixture.status !== 0) {
    const why = short(fixture.error?.message || fixture.stderr || `exit ${fixture.status}`, 500);
    say(`final: FAIL interactive starting fixture: ${why}`);
    return { ok: false, error: `interactive starting fixture: ${why}` };
  }
  let fixtureReceipt;
  try { fixtureReceipt = JSON.parse(fixture.stdout); }
  catch { return { ok: false, error: 'interactive starting fixture returned invalid receipt JSON' }; }
  if (!provenance || !anchor || !mvFiles[0]) return { ok: false, error: `final needs provenance(${!!provenance}) anchor(${!!anchor}) mv(${!!mvFiles[0]})` };
  const calls = [{ name: 'validate_provenance', arguments: { artifact: provenance, cel: mvFiles[0], anchor } }];
  if (regFiles[0]) calls.push({ name: 'validate_provenance', arguments: { artifact: provenance, cel: regFiles[0], anchor } });
  const t = runCalls('final', calls); if (t.transportFailed) return { ok: false, transport: t };
  const out = { ok: true, interactiveFixtures: fixtureReceipt.fixtures, suites: [] };
  t.calls.forEach(c => {
    const d = decode(c.out); const b = d.body || {};
    const findings = b.findings || [];
    const s = { cel: c.arguments.cel, pass: !!b.pass && !d.isError, errorCount: b.errorCount, warningCount: b.warningCount, manualReviewCount: b.manualReviewCount, waiverCount: b.waiverCount, waiverScrutinizeCount: b.waiverScrutinizeCount, worklistCount: b.worklistCount, byKind: count(findings.map(f => `${f.kind}/${f.severity}`)), raw: c.out };
    s.errors = findings.filter(f => f.severity === 'error').slice(0, 10).map(f => `${f.kind} ${label(f)}: ${short(f.message, 140)}`);
    s.warnings = findings.filter(f => f.severity === 'warning').slice(0, 10).map(f => `${f.kind} ${label(f)}: ${short(f.message, 140)}`);
    s.waivers = findings.filter(f => String(f.kind).startsWith('waiver')).map(f => ({ kind: f.kind, item: f.itemId || f.ref || f.caseId || (f.range ? `[${f.range.start},${f.range.end})` : '?'), scrutiny: f.scrutiny, message: short(f.message, 160) }));
    if (!s.pass) out.ok = false;
    out.suites.push(s);
  });
  say(`final: ${out.ok ? 'PASS' : 'FAIL'} ` + out.suites.map(s => `${path.basename(s.cel)} pass=${s.pass} err=${s.errorCount} warn=${s.warningCount} waivers=${s.waiverCount} scrutinize=${s.waiverScrutinizeCount} worklist=${s.worklistCount}`).join('; '));
  for (const s of out.suites) { for (const e of s.errors) say(`  ! ${e}`); for (const w of s.warnings) say(`  ~ ${w}`); }
  const w0 = out.suites[0]?.waivers || []; say(`  waivers (${w0.length}, MV suite): ` + w0.slice(0, 20).map(w => `${w.kind}:${w.item}`).join(', '));
  return out;
}
function stIds() {
  const calls = [{ name: 'check_fhir_ids', arguments: { path: path.join(artifact, 'src/fhir') } }];
  if (fs.existsSync(path.join(artifact, 'tests'))) calls.push({ name: 'check_fhir_ids', arguments: { path: path.join(artifact, 'tests') } });
  const t = runCalls('ids', calls); if (t.transportFailed) return { ok: false, transport: t };
  const out = { ok: true, checks: [] };
  t.calls.forEach(c => { const b = decode(c.out).body || {}; const r = { path: c.arguments.path, pass: !!b.pass, files: b.filesChecked, resources: b.resourcesChecked, violations: (b.violations || []).length, readErrors: (b.readErrors || []).length }; if (!r.pass) out.ok = false; out.checks.push(r); });
  say(`ids: ${out.ok ? 'OK' : 'FAIL'} ` + out.checks.map(c => `${path.relative(artifact, c.path)} ${c.pass ? 'ok' : 'FAIL'} ${c.resources} resources`).join('; '));
  return out;
}

// anchor: canonicalize the refined-source .docx into src/anchor-source/<stem>.txt (+ sidecar)
function stAnchor() {
  const docx = P(args.docx) || first('src/refined-source', '.docx')[0];
  if (!docx) return { ok: false, error: 'no refined-source .docx' };
  const out = P(path.join(artifact, 'src/anchor-source', path.basename(docx, '.docx') + '.txt'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const t = runCalls('anchor', [{ name: 'canonicalize_source', arguments: { in: docx, out } }]); if (t.transportFailed) return { ok: false, transport: t };
  const d = decode(t.calls[0].out); const b = d.body || {};
  const rec = { ok: !!b.success && !d.isError, docx, anchor: out, sidecar: out.replace(/\.txt$/, '.anchormeta.json'), textHash: b.textHash || b.sidecar?.textHash, warnings: (b.warnings || b.sidecar?.warnings || []).slice(0, 8).map(w => short(w.message || w)), bytes: fs.existsSync(out) ? fs.statSync(out).size : 0, raw: t.calls[0].out };
  say(`anchor: ${rec.ok ? 'OK' : 'FAIL'} ${path.basename(out)} bytes=${rec.bytes} warnings=${rec.warnings.length}`);
  for (const w of rec.warnings) say(`  ~ ${w}`);
  return rec;
}
// scaffold: generate_provenance (disposition-path clusters) -> src/provenance/<anchor-stem>.provenance.json ; merges onto an existing artifact when present
function stScaffold() {
  if (!anchor || !mvFiles[0]) return { ok: false, error: 'scaffold needs anchor and mv CEL' };
  const target = provenance || P(path.join(artifact, 'src/provenance', path.basename(anchor, '.txt') + '.provenance.json'));
  const a = { cel: mvFiles[0], anchor, policyVersion: args.policyVersion || pkg.crl?.policyVersion || path.basename(anchor, '.txt').replace(/^.*?-(\d{4}-\d{2}-\d{2})$/, '$1'), clusterBy: 'disposition-path', includeArtifact: true };
  let writeTo = target;
  if (fs.existsSync(target)) { if (args.merge) a.existingArtifact = target; else writeTo = target.replace(/\.provenance\.json$/, '.scaffold.provenance.json'); }
  const t = runCalls('scaffold', [{ name: 'generate_provenance', arguments: a }]); if (t.transportFailed) return { ok: false, transport: t };
  const d = decode(t.calls[0].out); const b = d.body || {};
  const rec = { ok: !!b.success && !d.isError, target, merged: !!b.merged, clusterCount: b.clusterCount, diagnostics: b.diagnosticCountsByKind, mergeDiagnostics: b.mergeDiagnosticCountsByKind, policyId: b.policyId, policyVersion: b.policyVersion, raw: t.calls[0].out };
  if (rec.ok && b.artifact) { fs.mkdirSync(path.dirname(writeTo), { recursive: true }); fs.writeFileSync(writeTo, JSON.stringify(b.artifact, null, 2) + '\n'); rec.written = writeTo; rec.sha256 = sha(writeTo); if (writeTo !== target) rec.note = 'existing artifact untouched; scaffold written beside it (pass --merge to merge onto it)'; }
  say(`scaffold: ${rec.ok ? 'OK' : 'FAIL'} clusters=${rec.clusterCount} merged=${rec.merged} diag=${JSON.stringify(rec.diagnostics || {})}${rec.mergeDiagnostics ? ' merge=' + JSON.stringify(rec.mergeDiagnostics) : ''} -> ${rec.written ? path.basename(rec.written) : 'not written'}`);
  if (rec.written) {
    // the generator leaves derivedFrom anchor-relative; the #250 gate wants carrier-relative POSIX — normalize in place (supported tool, not a hand edit)
    const n = runCalls('scaffold-normalize', [{ name: 'normalize_provenance', arguments: { artifact: rec.written, anchor } }]);
    const nb = n.transportFailed ? {} : (decode(n.calls[0].out).body || {});
    rec.normalize = { ok: !n.transportFailed && !!(nb.fullyNormalized ?? nb.success), fullyNormalized: nb.fullyNormalized, wrote: nb.wrote, worklist: (nb.worklist || []).length, raw: n.transportFailed ? null : n.calls[0].out };
    rec.sha256 = sha(rec.written);
    say(`  normalize: ${rec.normalize.ok ? 'OK' : 'FAIL'} fullyNormalized=${rec.normalize.fullyNormalized} wrote=${rec.normalize.wrote} worklist=${rec.normalize.worklist}`);
    if (!rec.normalize.ok) rec.ok = false;
  }
  return rec;
}

// ---------- helpers ----------
function treeInventory(rel) {
  const root = path.join(artifact, rel); const files = [];
  (function walk(d) { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files.push({ path: path.relative(artifact, p).replace(/\\/g, '/'), sha256: sha(p), bytes: fs.statSync(p).size }); } })(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const invPath = path.join(evidence, 'inventory', rel.replace(/[\/]/g, '__') + '.json'); fs.mkdirSync(path.dirname(invPath), { recursive: true });
  fs.writeFileSync(invPath, JSON.stringify(files, null, 2));
  return { files: files.length, bytes: files.reduce((a, f) => a + f.bytes, 0), inventory: invPath, treeHash: crypto.createHash('sha256').update(files.map(f => f.path + ':' + f.sha256).join('\n')).digest('hex') };
}
function copyDir(src, dst) { fs.mkdirSync(dst, { recursive: true }); for (const f of fs.readdirSync(src)) { const s = path.join(src, f), d = path.join(dst, f); if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d); } }
function label(f) { const r = f.itemId || f.caseId || f.ref; if (r == null) return f.range ? `[${f.range.start},${f.range.end})` : ''; return typeof r === 'string' ? r : (r.name || r.id || r.nodeId || JSON.stringify(r).slice(0, 60)); }
function count(arr) { const m = {}; for (const a of arr) m[a] = (m[a] || 0) + 1; return m; }
function parseArgs(a) { const o = {}; for (let i = 0; i < a.length; i++) { if (a[i].startsWith('--')) { const k = a[i].slice(2); if (i + 1 < a.length && !a[i + 1].startsWith('--')) { o[k] = a[++i]; } else o[k] = true; } } return o; }
function die(m) { console.error('ke-pipeline: ' + m); process.exit(2); }

receipt.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2));
const head = `ke-initial-implementation ${name} ${receipt.ok ? 'ALL-OK' : 'HAS-FAILURES'} stages=${stages.join(',')} evidence=${evidence}`;
const summary = [head, ...lines, `receipt: ${path.join(evidence, 'receipt.json')}`].join('\n');
fs.writeFileSync(path.join(evidence, 'summary.txt'), summary);
console.log(summary.length > 6000 ? summary.slice(0, 5900) + '\n...[truncated; see summary.txt]' : summary);
process.exit(receipt.ok ? 0 : 1);
