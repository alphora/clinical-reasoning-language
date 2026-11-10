/** Optional same-call evidence. Capture errors never become clinical/worker failures. */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ProducerCaseInput } from './caseInput';
import type { ProducerCaseEntry } from './manifest';
import type { OwnedProcessResult } from './ownedProcess';
import { assertSafePath, canonicalOutputRoot } from './retry';
import { digest } from './runtimeFingerprint';
import {runtimeFileIdentities} from './runtimeIdentity';
export { default as batchEvidenceJsonSchema } from './batch-evidence.schema.json';

export const EVIDENCE_LIMITS = { artifactBytes: 64 * 1024 * 1024, batchBytes: 512 * 1024 * 1024 } as const;
export interface EvidenceReceipt { indexPath: string; sha256?: string; complete: boolean; errors: string[] }
export interface EvidenceFile { path: string; bytes: number; sha256: string }
export interface BatchEvidenceCase {
  captureId: string; sourceFile?: string; caseId?: string; caseName: string; compartmentDir: string;
  inputSha256: string; captureState: 'pending' | 'capturing' | 'complete' | 'incomplete' | 'unavailable';
  files: Record<string, EvidenceFile>; evaluation?: ProducerCaseEntry; reason?: string;
  native?: { status: number | null; statusKind: 'worker-request' | 'worker-exit' | 'process-exit' | 'unavailable'; workerPid?: number; failure?: string; cleanupConfirmed: boolean; startedAt: string; finishedAt: string; elapsedMs: number };
  streams?: Record<'stdout' | 'stderr', { observedBytes: number | null; retained: string; complete: boolean; diagnostic?: string }>;
  outputOrigin?: string; hostDiagnostics?: string[]; requestControlFormat?: string;
}
export interface BatchEvidenceIndex {
  schemaVersion: 1; operation: 'emit_results'; batchId: string; state: 'running' | 'finished'; complete: boolean;
  producerVersion: string; suite: string; useCase: string; inputClock: string;
  definitionClosureSha256?: string; runtimeSha256?: string; planDefinitionId?: string;
  runtime?: Record<string, unknown>; limits: { artifactBytes: number; batchBytes: number }; files: Record<string, EvidenceFile>;
  cases: BatchEvidenceCase[]; errors: string[];
}
export interface CaseEvidenceCapture {
  request(value: Record<string, unknown>): void;
  result(proc: OwnedProcessResult, parameters: Record<string, unknown> | undefined, timing: { startedAt: string; finishedAt: string; elapsedMs: number }, mode: 'worker' | 'isolated'): void;
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const folded = (s: string) => process.platform === 'win32' ? s.toLowerCase() : s;
const contains = (parent: string, child: string) => { const rel = path.relative(folded(parent), folded(child)); return !rel || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)); };

export function validateEvidenceRoot(root: string, protectedRoots: string[]): string {
  if (!path.isAbsolute(root)) throw new Error('evidenceRoot must be absolute.');
  assertSafePath(root, path.parse(path.resolve(root)).root);
  const target = canonicalOutputRoot(root);
  if (existsSync(target)) throw new Error('evidenceRoot must be a new directory; existing evidence is never overwritten.');
  for (const item of protectedRoots) {
    const protectedRoot = canonicalOutputRoot(item);
    if (contains(target, protectedRoot) || contains(protectedRoot, target)) throw new Error('evidenceRoot must be separate from source and output trees.');
  }
  return target;
}

export class BatchEvidenceWriter {
  readonly indexPath: string;
  readonly index: BatchEvidenceIndex;
  private totalBytes = 0;
  private indexBytes = 0;
  private indexHash?: string;
  private rawComplete = new Set<number>();
  constructor(readonly root: string, metadata: Pick<BatchEvidenceIndex, 'producerVersion' | 'suite' | 'useCase' | 'inputClock'>, private inputs: ProducerCaseInput[],
    private limits: { artifactBytes: number; batchBytes: number } = EVIDENCE_LIMITS) {
    mkdirSync(path.dirname(root), { recursive: true, mode: 0o700 });
    mkdirSync(root, { mode: 0o700 });
    this.indexPath = path.join(root, 'batch-evidence.json');
    this.index = { schemaVersion: 1, operation: 'emit_results', batchId: randomUUID(), state: 'running', complete: false,
      ...metadata, limits: { ...limits }, files: {}, errors: [], cases: inputs.map(input => ({
        captureId: randomUUID(), sourceFile: input.sourceFile, caseId: input.caseId, caseName: input.caseName,
        compartmentDir: input.compartmentDir, inputSha256: '', captureState: 'pending', files: {},
      })) };
    this.persist(); // Reservation failure is pre-dispatch and may refuse the operation.
  }
  private fail(error: unknown, row?: BatchEvidenceCase) {
    const reason = String(error).slice(0, 700);
    if (this.index.errors.length < 20) this.index.errors.push(reason);
    if (row) { row.captureState = 'incomplete'; row.reason ??= reason; }
    this.index.complete = false;
  }
  private safe(work: () => void, row?: BatchEvidenceCase) { try { work(); } catch (error) { this.fail(error, row); } }
  private checkRoot() {
    if (lstatSync(this.root).isSymbolicLink() || folded(realpathSync(this.root)) !== folded(this.root)) throw new Error('Evidence root identity changed.');
  }
  private budget(bytes: number) {
    if (bytes > this.limits.artifactBytes || this.totalBytes + bytes > this.limits.batchBytes) throw new Error('Evidence storage limit exceeded; evaluation is retained without complete capture.');
  }
  private write(relative: string, bytes: Buffer): EvidenceFile {
    this.checkRoot(); this.budget(bytes.length);
    const file = path.join(this.root, relative); assertSafePath(file, this.root);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    // Reserve before writing: partial writes must count against the bound too.
    this.totalBytes += bytes.length;
    writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
    return { path: relative, bytes: bytes.length, sha256: hash(bytes) };
  }
  private json(relative: string, value: unknown) { return this.write(relative, Buffer.from(JSON.stringify(value, null, 2) + '\n')); }
  private file(relative: string, source: string) {
    this.budget(statSync(source).size);
    return this.write(relative, readFileSync(source));
  }
  private persist() {
    this.checkRoot();
    const bytes = Buffer.from(JSON.stringify(this.index, null, 2) + '\n');
    this.budget(bytes.length); // Includes the temporary atomic index while the previous index still exists.
    const temporary = path.join(this.root, 'index-' + randomUUID() + '.tmp');
    assertSafePath(this.indexPath, this.root);
    this.totalBytes += bytes.length; // Failed writes/renames can retain this owned staging file.
    writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 }); renameSync(temporary, this.indexPath);
    this.totalBytes -= this.indexBytes; this.indexBytes = bytes.length; this.indexHash = hash(bytes);
  }
  definitions(definitions: unknown[], cql: Record<string, string>, definitionClosureSha256: string, planDefinitionId: string, sourceFiles: string[]) {
    this.safe(() => {
      this.index.definitionClosureSha256 = definitionClosureSha256; this.index.planDefinitionId = planDefinitionId;
      this.index.files.definitions = this.json('definitions.json', definitions);
      this.index.files.cql = this.json('cql.json', cql);
      this.index.files.sources = this.json('source-hashes.json', [...new Set(sourceFiles)].map(file => {
        this.budget(statSync(file).size); return { path: file, sha256: hash(readFileSync(file)) };
      }));
      this.index.cases.forEach((row,index)=>{row.inputSha256=digest({input:this.inputs[index],planDefinitionId});});
      this.persist();
    });
  }
  runtime(value: Record<string, unknown>, runtimeSha256: string) {
    this.safe(() => {
      const identities=runtimeFileIdentities();
      this.index.runtime = { ...value, files: identities }; this.index.runtimeSha256 = runtimeSha256; this.persist();
    });
  }
  begin(index: number, input: ProducerCaseInput, planDefinitionId: string, repoPath: string): CaseEvidenceCapture {
    const row = this.index.cases[index], relative = 'cases/' + row.captureId + '/';
    row.inputSha256 = digest({ input, planDefinitionId }); row.captureState = 'capturing';
    this.safe(() => { row.files.input = this.json(relative + 'input.json', input); row.files.repository = this.file(relative + 'repository.json', repoPath); this.persist(); }, row);
    return {
      request: value => this.safe(() => { row.files.request = this.json(relative + 'request.json', value); this.persist(); }, row),
      result: (proc, parameters, timing, mode) => this.safe(() => {
        const output = proc.outputCapture;
        row.native = { ...timing, status: output?.status?.code ?? proc.status, statusKind: output?.status?.kind ?? (mode === 'worker' ? 'unavailable' : 'process-exit'),
          ...(output?.workerPid !== undefined ? {workerPid: output.workerPid} : {}), failure: proc.failure, cleanupConfirmed: proc.cleanupConfirmed };
        if (output?.status) row.native.status = output.status.code;
        if (!output) { row.captureState = 'incomplete'; row.reason ??= 'Raw stream capture unavailable.'; this.persist(); return; }
        row.outputOrigin = output.origin; row.hostDiagnostics = output.diagnostics;
        const metadata = ({bytes: _bytes, ...stream}: typeof output.stdout) => stream;
        row.streams = { stdout: metadata(output.stdout), stderr: metadata(output.stderr) };
        if(output.requestControl){row.files.requestControl=this.write(relative+'request-control.bin',output.requestControl);row.requestControlFormat=output.requestControlFormat;}
        for (const name of ['stdout', 'stderr'] as const) {
          const stream = output[name];
          if (stream.bytes !== undefined) row.files[name] = this.write(relative + name + '.bin', stream.bytes);
        }
        if (parameters) row.files.parameters = this.json(relative + 'parameters.json', parameters);
        const complete = output.stdout.complete && output.stderr.complete && parameters?.resourceType === 'Parameters' && proc.cleanupConfirmed && !proc.failure && row.native.status !== null &&
          (row.native.statusKind === 'worker-request' || row.native.statusKind === 'process-exit');
        if (complete) this.rawComplete.add(index);
        row.captureState = row.reason || !complete ? 'incomplete' : row.evaluation ? 'complete' : 'capturing';
        if (!complete) row.reason ??= 'Native output or request completion is incomplete; inspect raw bytes and status.';
        this.persist();
      }, row),
    };
  }
  finishCase(index: number, entry: ProducerCaseEntry) {
    const row = this.index.cases[index];
    this.safe(() => {
      row.evaluation = entry; row.inputSha256 = entry.inputSha256 ?? row.inputSha256;
      if (!entry.reused && row.captureState === 'capturing' && this.rawComplete.has(index)) row.captureState = 'complete';
      else if (entry.reused || row.captureState === 'pending' || row.captureState === 'capturing') {
        row.captureState = 'unavailable'; row.reason ??= entry.reused ? 'Retained success was not evaluated again; no new capture. Verify original evidence separately.' : 'Case did not produce a captured native request.';
      }
      this.persist();
    }, row);
  }
  finish(reason?: string): EvidenceReceipt {
    this.safe(() => {
      if (reason) this.fail(reason);
      for (const row of this.index.cases) {
        if (row.captureState === 'pending' || row.captureState === 'capturing') {
          row.captureState = 'unavailable'; row.reason ??= 'Batch stopped before a captured native result was available.';
        }
      }
      this.index.state = 'finished';
      this.index.complete = !this.index.errors.length && this.index.cases.every(row => row.captureState === 'complete') && !!this.index.definitionClosureSha256 && !!this.index.runtimeSha256;
      this.persist();
    });
    return { indexPath: this.indexPath, sha256: this.indexHash, complete: this.index.complete, errors: [...this.index.errors] };
  }
}
