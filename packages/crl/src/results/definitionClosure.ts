// REFACTOR:grounded (Medical Review): Save, result freshness and native production compare the same emitted bytes.
import { emitCrlTwoLane } from '../emit-two-lane';
import { cqlIndex } from './repoBundle';
import { digest } from './runtimeFingerprint';

export type DefinitionPublicationOptions = Pick<NonNullable<Parameters<typeof emitCrlTwoLane>[1]>, 'date' | 'capability'>;

export function definitionClosureDigest(emitted: ReturnType<typeof emitCrlTwoLane>): string | undefined {
  if (!emitted.success) return undefined;
  return digest({ defs: emitted.fhir.resources.map(w => w.resource),
    cql: Object.entries(cqlIndex(emitted.cqlLibraries)).sort(([a], [b]) => a.localeCompare(b)) });
}

/** Keep emitter resource order and the producer's existing locale-sorted CQL entries.
 * The optional options leave CLI/MCP default publication behavior unchanged. */
export function emitResultDefinitionClosure(crlPath: string, options: DefinitionPublicationOptions = {}) {
  const emitted = emitCrlTwoLane(crlPath, options);
  const definitions = emitted.fhir.resources.map(w => w.resource);
  const cql = cqlIndex(emitted.cqlLibraries);
  return { emitted, definitions, cql, definitionClosureSha256: definitionClosureDigest(emitted) };
}
