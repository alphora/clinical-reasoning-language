'use strict';
/*
 * Tests for fix-pd-adaptive-marker.cjs. Every case here was a defect found in
 * review or a scope boundary the script promises to hold; run the script as a
 * real process against real files, because writing files IS the behaviour.
 *
 *   node --test packages/crl/scripts/fix-pd-adaptive-marker.test.cjs
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'fix-pd-adaptive-marker.cjs');
const ADAPTIVE =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-questionnaireAdaptive';
const STRATEGY = 'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition';

/** A fresh directory under the OS temp root (kept off the source tree). */
function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-pd-adaptive-'));
  return dir;
}

/** Write `body` as a pretty-printed JSON file, exactly as the emitter would. */
function emitted(dir, name, body) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + '\n');
  return file;
}

/** Run the script; returns { status, stdout, stderr }. Never throws on exit 1. */
function run(...args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const marker = (value, extra = {}) => ({ url: ADAPTIVE, ...value, ...extra });
const rootPd = (id, ext) => ({
  resourceType: 'PlanDefinition',
  id,
  meta: { profile: [STRATEGY] },
  extension: ext,
});

test('rewrites a root PlanDefinition and leaves everything else in the file alone', () => {
  const dir = workspace();
  const file = emitted(dir, 'PlanDefinition-root.json', {
    ...rootPd('root', [
      { url: 'http://example.org/other', valueString: 'keep me' },
      marker({ valueUrl: 'http://hcsc.com/fhir/priorauth' }),
    ]),
    action: [{ title: 'a', extension: [marker({ valueUrl: 'http://hcsc.com/fhir/priorauth' })] }],
  });

  const r = run(dir, '--write');
  assert.equal(r.status, 0, r.stderr);

  const doc = read(file);
  assert.deepEqual(doc.extension[1], { url: ADAPTIVE, valueBoolean: true });
  assert.deepEqual(doc.extension[0], { url: 'http://example.org/other', valueString: 'keep me' });
  // action-level extensions are out of scope and must survive untouched
  assert.equal(doc.action[0].extension[0].valueUrl, 'http://hcsc.com/fhir/priorauth');
});

test('is a dry run unless --write, and the preview predicts the write', () => {
  const dir = workspace();
  const file = emitted(dir, 'PlanDefinition-root.json', rootPd('root', [marker({ valueUrl: 'u' })]));
  const before = fs.readFileSync(file, 'utf8');

  const preview = run(dir);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /would change/);
  assert.match(preview.stdout, /re-run with --write/);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'preview must not touch the file');

  assert.equal(run(dir, '--write').status, 0);
  assert.equal(read(file).extension[0].valueBoolean, true);
});

test('is idempotent — a second run changes nothing and stays clean', () => {
  const dir = workspace();
  const file = emitted(dir, 'PlanDefinition-root.json', rootPd('root', [marker({ valueUrl: 'u' })]));

  assert.equal(run(dir, '--write').status, 0);
  const after = fs.readFileSync(file, 'utf8');

  const second = run(dir, '--write');
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /changed 0 file\(s\)/);
  assert.equal(fs.readFileSync(file, 'utf8'), after, 'second run must be a byte-level no-op');
});

test('leaves a Questionnaire carrying the same extension byte-identical', () => {
  const dir = workspace();
  const file = emitted(dir, 'Questionnaire-q.json', {
    resourceType: 'Questionnaire',
    id: 'q',
    extension: [marker({ valueUrl: 'http://hcsc.com/fhir/priorauth' })],
  });
  const before = fs.readFileSync(file, 'utf8');

  assert.equal(run(dir, '--write').status, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('inside a Bundle, converts the PlanDefinition entry and not the Questionnaire entry', () => {
  const dir = workspace();
  const file = emitted(dir, 'Bundle.json', {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [
      { resource: rootPd('in-bundle', [marker({ valueUrl: 'u' })]) },
      {
        resource: {
          resourceType: 'Questionnaire',
          id: 'q',
          extension: [marker({ valueUrl: 'u' })],
        },
      },
    ],
  });

  assert.equal(run(dir, '--write').status, 0);
  const doc = read(file);
  assert.deepEqual(doc.entry[0].resource.extension[0], { url: ADAPTIVE, valueBoolean: true });
  assert.equal(doc.entry[1].resource.extension[0].valueUrl, 'u', 'Questionnaire must be untouched');
});

test('a contained PlanDefinition is converted; a contained Questionnaire is not', () => {
  const dir = workspace();
  const file = emitted(dir, 'PlanDefinition-outer.json', {
    ...rootPd('outer', [marker({ valueUrl: 'u' })]),
    contained: [
      { resourceType: 'Questionnaire', id: 'inner-q', extension: [marker({ valueUrl: 'u' })] },
      rootPd('inner-pd', [marker({ valueUrl: 'u' })]),
    ],
  });

  assert.equal(run(dir, '--write').status, 0);
  const doc = read(file);
  assert.equal(doc.extension[0].valueBoolean, true);
  assert.equal(doc.contained[0].extension[0].valueUrl, 'u', 'contained Questionnaire untouched');
  assert.equal(doc.contained[1].extension[0].valueBoolean, true, 'contained PlanDefinition converted');
});

test('reaches a PlanDefinition inside Parameters, including a nested part', () => {
  const dir = workspace();
  const file = emitted(dir, 'Parameters.json', {
    resourceType: 'Parameters',
    parameter: [
      { name: 'planDefinition', resource: rootPd('p1', [marker({ valueUrl: 'u' })]) },
      { name: 'wrap', part: [{ name: 'inner', resource: rootPd('p2', [marker({ valueUrl: 'u' })]) }] },
    ],
  });

  assert.equal(run(dir, '--write').status, 0);
  const doc = read(file);
  assert.equal(doc.parameter[0].resource.extension[0].valueBoolean, true);
  assert.equal(doc.parameter[1].part[0].resource.extension[0].valueBoolean, true);
});

test('--source-url narrows eligibility to the listed values', () => {
  const dir = workspace();
  const hit = emitted(dir, 'a.json', rootPd('a', [marker({ valueUrl: 'http://hcsc.com/fhir/priorauth' })]));
  const miss = emitted(dir, 'b.json', rootPd('b', [marker({ valueUrl: 'http://example.org/crl' })]));

  const r = run(dir, '--write', '--source-url', 'http://hcsc.com/fhir/priorauth');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(hit).extension[0].valueBoolean, true);
  assert.equal(read(miss).extension[0].valueUrl, 'http://example.org/crl');
  assert.match(r.stdout, /not in --source-url list/);
});

/* ─── forms that must never be silently "corrected" ──────────────── */

test('valueUrl alongside another value[x] is unresolved, not rewritten', () => {
  // Regression: rebuilding the entry used to emit valueBoolean:true and then let a
  // trailing valueBoolean:false overwrite it, silently asserting the opposite.
  const dir = workspace();
  const file = emitted(dir, 'conflict.json', rootPd('c', [
    { url: ADAPTIVE, valueUrl: 'u', valueBoolean: false },
  ]));
  const before = fs.readFileSync(file, 'utf8');

  const r = run(dir, '--write');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /several value\[x\]/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('valueBoolean:false is unresolved and reported as contradicting the rule', () => {
  const dir = workspace();
  const file = emitted(dir, 'false.json', rootPd('f', [marker({ valueBoolean: false })]));
  const before = fs.readFileSync(file, 'utf8');

  const r = run(dir, '--write');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /contradicts the rule/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('an unexpected value[x] or a missing one is unresolved', () => {
  const dir = workspace();
  emitted(dir, 'canonical.json', rootPd('c', [marker({ valueCanonical: 'http://example.org/x' })]));
  emitted(dir, 'novalue.json', rootPd('n', [{ url: ADAPTIVE }]));

  const r = run(dir, '--write');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /valueCanonical/);
  assert.match(r.stderr, /no value\[x\]/);
});

test('a duplicate marker on one resource is called out', () => {
  const dir = workspace();
  const r = run(
    emitted(dir, 'dup.json', rootPd('d', [marker({ valueUrl: 'u' }), marker({ valueUrl: 'v' })])),
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 adaptive markers on one resource/);
});

test('converting a non-root PlanDefinition is allowed but reported', () => {
  const dir = workspace();
  const r = run(
    emitted(dir, 'sub.json', {
      resourceType: 'PlanDefinition',
      id: 'sub',
      meta: { profile: ['http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-shareableplandefinition'] },
      extension: [marker({ valueUrl: 'u' })],
    }),
    '--write',
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /not a cpg-strategydefinition root/);
});

/* ─── write safety ───────────────────────────────────────────────── */

test('refuses outright when rewriting would lose FHIR decimal precision', () => {
  // JSON.parse turns 1.50 into 1.5; significant digits are meaningful in FHIR,
  // so no flag may wave this through.
  const dir = workspace();
  const file = path.join(dir, 'decimal.json');
  fs.writeFileSync(
    file,
    JSON.stringify(rootPd('d', [marker({ valueUrl: 'u' })]), null, 2).replace(
      '"id": "d"',
      '"id": "d",\n  "_probe": 1.50',
    ) + '\n',
  );
  const before = fs.readFileSync(file, 'utf8');

  const refused = run(dir, '--write', '--allow-reformat');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /alter unrelated CONTENT/);
  assert.equal(fs.readFileSync(file, 'utf8'), before, '--allow-reformat must not override this');
});

test('a layout-only difference needs --allow-reformat, and then writes', () => {
  const dir = workspace();
  const file = path.join(dir, 'compact.json');
  fs.writeFileSync(file, JSON.stringify(rootPd('c', [marker({ valueUrl: 'u' })])) + '\n');
  const before = fs.readFileSync(file, 'utf8');

  const preview = run(dir);
  assert.match(preview.stdout, /needs --allow-reformat/, 'preview must predict the refusal');

  const refused = run(dir, '--write');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /restyle the file's layout/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);

  const allowed = run(dir, '--write', '--allow-reformat');
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(read(file).extension[0].valueBoolean, true);
});

test('CRLF line endings and tab indentation survive the rewrite', () => {
  const dir = workspace();
  const file = path.join(dir, 'crlf.json');
  const body = JSON.stringify(rootPd('c', [marker({ valueUrl: 'u' })]), null, '\t');
  fs.writeFileSync(file, body.replace(/\n/g, '\r\n') + '\r\n');

  const r = run(dir, '--write');
  assert.equal(r.status, 0, r.stderr);
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.includes('\r\n'), 'CRLF preserved');
  assert.ok(after.includes('\t"resourceType"'), 'tab indentation preserved');
  assert.equal(read(file).extension[0].valueBoolean, true);
});

test('--backup writes one, and refuses rather than overwriting an existing one', () => {
  const dir = workspace();
  const file = emitted(dir, 'PlanDefinition-root.json', rootPd('root', [marker({ valueUrl: 'u' })]));
  const original = fs.readFileSync(file, 'utf8');

  assert.equal(run(dir, '--write', '--backup').status, 0);
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), original);

  // Put it back so a second --backup run has something to do, then confirm the
  // existing .bak is protected instead of being clobbered.
  fs.writeFileSync(file, original);
  const second = run(dir, '--write', '--backup');
  assert.equal(second.status, 1);
  assert.match(second.stderr, /backup .* already exists/);
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), original);
});

test('leaves no temporary file behind', () => {
  const dir = workspace();
  emitted(dir, 'PlanDefinition-root.json', rootPd('root', [marker({ valueUrl: 'u' })]));
  assert.equal(run(dir, '--write').status, 0);
  assert.deepEqual(
    fs.readdirSync(dir).filter(f => f.includes('.tmp-')),
    [],
  );
});

/* ─── inputs that are not ours ───────────────────────────────────── */

test('reports malformed JSON that claims the marker, and ignores unrelated files', () => {
  const dir = workspace();
  fs.writeFileSync(path.join(dir, 'broken.json'), `{"extension":[{"url":"${ADAPTIVE}",`);
  fs.writeFileSync(path.join(dir, 'other.json'), 'not json at all');
  fs.writeFileSync(path.join(dir, 'notes.txt'), `${ADAPTIVE}`);

  const r = run(dir, '--write');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /broken\.json: malformed JSON/);
  assert.doesNotMatch(r.stderr, /other\.json/, 'unrelated invalid JSON is not our problem');
  assert.match(r.stdout, /2 JSON file\(s\) scanned/, 'only .json files are scanned');
});

test('a JSON document that is not a FHIR resource is left alone', () => {
  const dir = workspace();
  const file = emitted(dir, 'config.json', {
    extension: [marker({ valueUrl: 'u' })],
    nested: { resourceType: 'PlanDefinition', extension: [marker({ valueUrl: 'u' })] },
  });
  const before = fs.readFileSync(file, 'utf8');

  const r = run(dir, '--write');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'arbitrary nesting is not a resource location');
});

test('a single file argument works, and node_modules is skipped under a directory', () => {
  const dir = workspace();
  const file = emitted(dir, 'PlanDefinition-root.json', rootPd('root', [marker({ valueUrl: 'u' })]));
  fs.mkdirSync(path.join(dir, 'node_modules'));
  const vendored = emitted(dir, 'node_modules/PlanDefinition-vendored.json', rootPd('v', [
    marker({ valueUrl: 'u' }),
  ]));

  assert.equal(run(file, '--write').status, 0);
  assert.equal(read(file).extension[0].valueBoolean, true);

  assert.equal(run(dir, '--write').status, 0);
  assert.equal(read(vendored).extension[0].valueUrl, 'u', 'node_modules is not walked');
});

test('bad usage exits 2 with the invocation', () => {
  const missing = run();
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /file or directory argument is required/);
  assert.match(missing.stderr, /usage:/);

  assert.equal(run('.', '--nope').status, 2);
  assert.equal(run('.', '--source-url').status, 2);
});
