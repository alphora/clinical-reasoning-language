// REFACTOR:grounded (Medical Review): characterize the public lanes before sharing their snapshot.
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitCrlTwoLane } from './emit-two-lane';
import { emitFhirDefFromPath } from './fhir-emitter/closureOrchestrator';
import { emitCQLImports } from './imports/emit';
import * as imports from './imports/index';

const template = resolve(__dirname, 'fhir-emitter/tests/fixtures/code-is-decision');
const dirs: string[] = [];
function fixture(change: (pkg: Record<string, any>) => void = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'crl-candidate-')); dirs.push(dir);
  const pkg = JSON.parse(readFileSync(join(template, 'package.json'), 'utf8'));
  change(pkg); writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  const file = join(dir, 'policy.crl');
  writeFileSync(file, readFileSync(join(template, 'code-is-decision.crl')));
  return { dir, file };
}
afterEach(() => { vi.restoreAllMocks(); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });

describe('two-lane orchestration parity', () => {
  it('returns the same complete CQL/FHIR resources as the separate public readers', () => {
    const { file } = fixture();
    const two = emitCrlTwoLane(file);
    expect(two.success).toBe(true);
    expect(two.fhir).toEqual(emitFhirDefFromPath(file));
    expect(two.cql).toEqual(emitCQLImports(file));
    expect(two.cqlLibraries.length).toBeGreaterThan(0);
  });

  it.each(['version', 'date'])('retains CQL when unrelated %s metadata prevents FHIR', (field) => {
    const { file } = fixture(pkg => { if (field === 'version') delete pkg.version; else pkg.crl.date = 'invalid'; });
    const two = emitCrlTwoLane(file);
    expect(two.success).toBe(false); expect(two.fhir.resources).toEqual([]);
    expect(two.fhir.metadataErrors.length).toBeGreaterThan(0);
    expect(two.cql.success).toBe(true); expect(two.cqlLibraries.length).toBeGreaterThan(0);
    expect(two.cql).toEqual(emitCQLImports(file));
  });

  it('retains import failure in both lanes without a partial CQL manifest', () => {
    const { file } = fixture(); writeFileSync(file, 'library "L".\ninclude "Missing".\n');
    const two = emitCrlTwoLane(file);
    expect(two.success).toBe(false); expect(two.cql.success).toBe(false);
    expect(two.cqlLibraries).toEqual([]);
    expect(two.fhir.importDiagnostics.some(d => d.severity === 'error')).toBe(true);
  });

  it('two-lane CQL preparation still throws on inconsistent source identity after FHIR metadata failure', () => {
    const { file } = fixture(pkg => delete pkg.version);
    const graph = imports.resolveImports(file);
    graph.resolvedLibraries[0].name = 'Wrong registry name';
    vi.spyOn(imports, 'resolveImports').mockReturnValue(graph);
    // FHIR alone returns metadata diagnostics first; two-lane CQL is still attempted.
    expect(emitFhirDefFromPath(file).metadataErrors.length).toBeGreaterThan(0);
    expect(() => emitCrlTwoLane(file)).toThrow(/publication|registry|identity|library/i);
  });
});

describe('candidate definition snapshot', () => {
  function intake() {
    const { dir, file } = fixture();
    writeFileSync(file, 'library "Policy".\ninclude "Intake".\nactivity "Refer":\n- request CPGServiceRequest.\ndecision "Review":\n- when "Intake"."Complaint" then recommend activity "Refer".\n');
    const owner = join(dir, 'intake.crl');
    const source = 'library "Intake".\nconcept "Complaint":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `complaint`.\n- shape reduction is most recent.\npresentation for "Complaint":\n- question text is "Complaint?".\n- question description is "Details".\n';
    writeFileSync(owner, source); return { dir, file, owner, source };
  }

  it('emits imported candidate wording and description with one graph, without writing source', () => {
    const f = intake(), candidate = f.source.replace('Complaint?', 'Describe complaint?').replace('"Details"', '"More detail"');
    const spy = vi.spyOn(imports, 'resolveImports');
    const result = emitCrlTwoLane(f.file, { sourceOverlays: new Map([[f.owner, candidate]]) });
    expect(result.success).toBe(true); expect(spy).toHaveBeenCalledTimes(1);
    const plans = result.fhir.resources.filter(r => r.resource.resourceType === 'PlanDefinition');
    expect(JSON.stringify(plans)).toContain('Describe complaint?');
    expect(JSON.stringify(plans)).toContain('More detail');
    expect(readFileSync(f.owner, 'utf8')).toBe(f.source);
    expect(result.cqlLibraries.length).toBeGreaterThan(0);
  });

  it('keeps both lanes on the captured graph if source changes after resolution', () => {
    const f = intake(), original = imports.resolveImports;
    vi.spyOn(imports, 'resolveImports').mockImplementation((root, opts) => {
      const graph = original(root, opts);
      writeFileSync(f.owner, f.source.replace('`complaint`', '`intervening-change`'));
      return graph;
    });
    const result = emitCrlTwoLane(f.file);
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.fhir.resources)).not.toContain('intervening-change');
    expect(result.cqlLibraries.map(r => r.cql).join('\n')).not.toContain('intervening-change');
  });

  it('keeps package identity and publication fields on the captured registry snapshot', () => {
    const f = intake(), original = imports.resolveImports;
    const expected = emitCrlTwoLane(f.file);
    vi.spyOn(imports, 'resolveImports').mockImplementation((root, opts) => {
      const graph = original(root, opts);
      const pkg = JSON.parse(readFileSync(join(f.dir, 'package.json'), 'utf8'));
      pkg.name = 'intervening-package'; pkg.version = '9.9.9';
      pkg.crl.canonicalBase = 'http://example.org/intervening';
      writeFileSync(join(f.dir, 'package.json'), JSON.stringify(pkg));
      return graph;
    });
    const result = emitCrlTwoLane(f.file);
    expect(result.success).toBe(true);
    expect(result.fhir.resources).toEqual(expected.fhir.resources);
    expect(result.cqlLibraries).toEqual(expected.cqlLibraries);
    expect(JSON.stringify(result.fhir.resources)).not.toContain('intervening-package');
  });

  it('invalid candidate refuses complete success and leaves saved source intact', () => {
    const f = intake();
    const candidate = f.source + '\npresentation for "Complaint":\n- question text is "Conflicting question?".\n';
    const result = emitCrlTwoLane(f.file, { sourceOverlays: new Map([[f.owner, candidate]]) });
    expect(result.success).toBe(false); expect(result.fhir.resources).toEqual([]);
    expect(JSON.stringify(result.hardErrors)).toMatch(/presentation|duplicate/i);
    expect(readFileSync(f.owner, 'utf8')).toBe(f.source);
  });

  it('refuses external and packaged candidate owners rather than bypassing ownership', () => {
    const f = intake(), other = fixture();
    expect(() => emitCrlTwoLane(f.file, { sourceOverlays: new Map([[other.file, 'library "Changed".']]) })).toThrow(/inside|owning/i);
    const pkg = join(f.dir, 'node_modules', 'shared'); mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), '{"name":"shared"}');
    const owned = join(pkg, 'shared.crl'); writeFileSync(owned, 'library "Shared".');
    expect(() => emitCrlTwoLane(f.file, { sourceOverlays: new Map([[owned, 'library "Changed".']]) })).toThrow(/package|local editing/i);
  });
});
