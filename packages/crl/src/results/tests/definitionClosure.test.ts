import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { emitResultDefinitionClosure } from '../definitionClosure';
import { emitCrlTwoLane } from '../../emit-two-lane';
import { cqlIndex } from '../repoBundle';
import { digest } from '../runtimeFingerprint';

const file = resolve(__dirname, '../../fhir-emitter/tests/fixtures/code-is-decision/code-is-decision.crl');
afterEach(() => vi.unstubAllEnvs());
it('preserves the producer digest format and deterministic emitter resource order', () => {
  const options = { date: '2026-10-08', capability: 'publishable' as const };
  const two = emitCrlTwoLane(file, options), closure = emitResultDefinitionClosure(file, options);
  expect(closure.emitted.success).toBe(true);
  expect(closure.definitions).toEqual(two.fhir.resources.map(w => w.resource));
  expect(closure.definitionClosureSha256).toBe(digest({ defs: two.fhir.resources.map(w => w.resource),
    cql: Object.entries(cqlIndex(two.cqlLibraries)).sort(([a], [b]) => a.localeCompare(b)) }));
  expect(emitResultDefinitionClosure(file, options).definitionClosureSha256).toBe(closure.definitionClosureSha256);
});
it('explicit MV publication options outrank inherited reproducibility settings without mutating them', () => {
  vi.stubEnv('SOURCE_DATE_EPOCH', '946684800');
  const closure = emitResultDefinitionClosure(file, { date: '2026-10-08', capability: 'publishable' });
  expect(closure.emitted.success).toBe(true);
  expect(closure.definitions.filter(r => r.date).every(r => String(r.date).startsWith('2026-10-08'))).toBe(true);
  expect(process.env.SOURCE_DATE_EPOCH).toBe('946684800');
  expect(emitResultDefinitionClosure(file).definitionClosureSha256).not.toBe(closure.definitionClosureSha256);
});
