// Dedicated fixture producer: normal CEL emission selects only src/cel/mv.
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { resolveCelImports, validateCEL, emitCelToFhir } = require('@smile-digital-health/crl');

const mode = process.argv[2] ?? '--check';
assert.ok(['--check', '--write'].includes(mode) && process.argv.length <= 3,
  'Usage: node generate-request.cjs [--check|--write]');
const graph = resolveCelImports(join(__dirname, 'requests.cel'));
assert.deepEqual(graph.diagnostics.filter(d => d.severity === 'error'), []);
const validation = validateCEL(graph);
assert.deepEqual(validation.errors, []);
// Both supported procedure answers qualify for this routing question; this is
// an existing policy warning, not an error in the answer-free request seed.
assert.deepEqual(validation.warnings.map(w => w.kind), ['answer-options-all-qualifying']);
const emitted = emitCelToFhir(graph);
assert.deepEqual(emitted.diagnostics.filter(d => d.severity === 'error'), []);
assert.deepEqual(emitted.diagnostics.filter(d => d.severity === 'warning').map(d => d.kind).sort(),
  ['answer-options-all-qualifying', 'result-deferred']);
assert.equal(emitted.emittedCases.length, 1);
const resources = emitted.emittedCases[0].resources.map(r => r.body);
assert.deepEqual(resources.map(r => r.resourceType).sort(), ['Patient', 'ServiceRequest']);
const patient = resources.find(r => r.resourceType === 'Patient');
assert.equal(resources.find(r => r.resourceType === 'ServiceRequest').subject.reference, `Patient/${patient.id}`);
const bundle = { resourceType: 'Bundle', type: 'collection', entry: resources.map(resource => ({ resource })) };
const dir = join(__dirname, 'request-1');
const target = join(dir, 'request-bundle.json');
if (mode === '--write') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(target, JSON.stringify(bundle, null, 2) + '\n');
} else {
  assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), bundle,
    'Regenerate the interactive request bundle with generate-request.cjs --write');
}
console.log(`Bleph interactive request ${mode === '--write' ? 'generated' : 'verified'}.`);
