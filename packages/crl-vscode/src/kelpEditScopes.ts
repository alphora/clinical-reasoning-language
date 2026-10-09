// REFACTOR:grounded (Medical Review): KELP v0.10.2 peer-confirmed lock/save contract.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export class KelpEditError extends Error {
  constructor(readonly code: string, message: string, readonly detail?: unknown,
    readonly ambiguous = false, readonly acquired: readonly string[] = []) { super(message); }
}
export interface KelpEntity {
  key: string; folder: string; locked: boolean; heldByMe: boolean;
  owner?: string; worktreeDirty: boolean; humanEditable: boolean; reserved: boolean;
}
export interface KelpStatus {
  entities: KelpEntity[]; frozen: boolean;
  published: { name: string; version: string; at: string; owner: string } | null;
  identityResolved: boolean; mutationGateClear: boolean;
}
export interface KelpReply {
  ok: boolean; protocolVersion: unknown; command: string; outcome?: string; data?: unknown;
  error?: { code: string; message: string; detail?: unknown };
}
export type KelpRun = (verb: 'status' | 'lock' | 'save' | 'release', keys: readonly string[]) => Promise<KelpReply>;

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const publication = (v: unknown): v is KelpStatus['published'] => v === null ||
  object(v) && ['name', 'version', 'at', 'owner'].every(k => typeof v[k] === 'string');
const inside = (root: string, file: string): boolean => {
  const rel = relative(resolve(root), resolve(file));
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
};

/** Absence is only discovery data; callers must positively classify an allowed debug fixture. */
export function findKelpProject(start: string): string | undefined {
  let dir = statSync(start).isDirectory() ? resolve(start) : dirname(resolve(start));
  for (;;) {
    const file = join(dir, 'kelp.project.json');
    if (existsSync(file)) {
      let raw: unknown;
      try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (error) {
        throw new KelpEditError('invalid-project', `Cannot read managed KELP configuration: ${String(error)}`);
      }
      if (!object(raw) || !object(raw.project) || raw.project.schemaVersion !== 1 ||
        !object(raw.project.structure) || !Array.isArray(raw.project.structure.entities)) {
        throw new KelpEditError('invalid-project', `Invalid managed KELP configuration: ${file}`);
      }
      return file; // CLI status validates the complete current schema, not an invented local substitute.
    }
    const parent = dirname(dir); if (parent === dir) return undefined; dir = parent;
  }
}

/** Managed artifact identity is the shallowest package under this project's artifacts directory. */
export function kelpArtifactRoot(selectedRoot: string, projectFile: string): string {
  const artifacts = join(dirname(resolve(projectFile)), 'artifacts'), rel = relative(artifacts, resolve(selectedRoot));
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new KelpEditError('artifact-layout', 'Selected policy is outside the managed artifacts directory.');
  let current = artifacts;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    if (existsSync(join(current, 'package.json'))) return current;
  }
  throw new KelpEditError('artifact-layout', 'Managed artifact package owner is unavailable.');
}

export function resolveKelpEntry(options: { setting?: string; environment?: string; extensionPath?: string }): string | undefined {
  const candidate = options.setting || options.environment || (options.extensionPath ? join(options.extensionPath, 'dist/kelp-cli.mjs') : undefined);
  if (!candidate) return undefined;
  if (!isAbsolute(candidate) || !['.mjs', '.js', '.cjs'].includes(extname(candidate).toLowerCase()) ||
    !existsSync(candidate) || !statSync(candidate).isFile()) {
    throw new KelpEditError('invalid-cli', 'KELP requires an absolute JavaScript CLI entry, not a shell shim.');
  }
  return candidate;
}

/** Exactly one JSON stdout envelope; stderr is diagnostic. No shell and no implicit mutation retries. */
export function createKelpRunner(entry: string, artifact: string, timeoutMs = 300_000): KelpRun {
  const validated = resolveKelpEntry({ setting: entry })!;
  return (verb, keys) => new Promise((resolveReply, reject) => {
    const child = spawn(process.execPath, [validated, verb, ...keys], { cwd: artifact,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, shell: false, windowsHide: true });
    let out = '', err = '', stopped = false;
    const stop = (message: string) => {
      if (stopped) return; stopped = true; child.kill();
      // Killing the CLI does not certify completion/rollback of its Git subprocesses.
      reject(new KelpEditError('cli-outcome-unknown', message, undefined, verb !== 'status'));
    };
    const timer = setTimeout(() => stop('KELP timed out; reconcile its state before retrying.'), timeoutMs);
    child.stdout.on('data', b => { out += String(b); if (out.length > 4_000_000) stop('KELP stdout exceeded its JSON envelope limit.'); });
    child.stderr.on('data', b => { if (err.length < 64_000) err += String(b); });
    child.on('error', error => { clearTimeout(timer); reject(new KelpEditError('cli-start-failed', error.message)); });
    child.on('close', code => {
      clearTimeout(timer); if (stopped) return;
      try {
        const raw: unknown = JSON.parse(out);
        if (!object(raw) || typeof raw.ok !== 'boolean' || raw.protocolVersion === undefined || raw.command !== verb ||
          (!raw.ok && (!object(raw.error) || typeof raw.error.code !== 'string' || typeof raw.error.message !== 'string')) ||
          (raw.ok && code !== 0)) throw new Error('Invalid KELP command envelope or exit status.');
        resolveReply(raw as unknown as KelpReply);
      } catch (error) {
        reject(new KelpEditError('cli-outcome-unknown', `${String(error)}${err ? ` ${err.trim()}` : ''}`, undefined, verb !== 'status'));
      }
    });
  });
}

function successful(reply: KelpReply): KelpReply {
  if (!reply.ok) throw new KelpEditError(reply.error!.code, reply.error!.message, reply.error!.detail);
  return reply;
}
export function parseKelpStatus(reply: KelpReply, artifact: string): KelpStatus {
  const raw = successful(reply).data;
  if (!object(raw) || !Array.isArray(raw.entities) || typeof raw.frozen !== 'boolean' ||
    typeof raw.identityResolved !== 'boolean' || typeof raw.mutationGateClear !== 'boolean' ||
    !publication(raw.published)) {
    throw new KelpEditError('invalid-status', 'KELP status omitted its entity/ownership state.');
  }
  const keys = new Set<string>();
  // Built-ins have the same row shape; source is ordinarily lockable, package/publish are not.
  const entities = raw.entities.map((row): KelpEntity => {
    if (!object(row) || typeof row.key !== 'string' || !row.key || keys.has(row.key) ||
      typeof row.folder !== 'string' || !row.folder || isAbsolute(row.folder) ||
      !inside(artifact, join(artifact, row.folder)) || resolve(artifact) === resolve(artifact, row.folder) || typeof row.locked !== 'boolean' ||
      typeof row.heldByMe !== 'boolean' || typeof row.worktreeDirty !== 'boolean' ||
      typeof row.humanEditable !== 'boolean' || typeof row.reserved !== 'boolean' ||
      (row.locked ? typeof row.owner !== 'string' || !row.owner : row.owner !== null) ||
      (row.heldByMe && !row.locked)) throw new KelpEditError('invalid-status', 'KELP returned an invalid or duplicate entity row.');
    keys.add(row.key);
    return { key: row.key, folder: row.folder, locked: row.locked, heldByMe: row.heldByMe,
      worktreeDirty: row.worktreeDirty, humanEditable: row.humanEditable, reserved: row.reserved,
      ...(typeof row.owner === 'string' ? { owner: row.owner } : {}) };
  });
  if (raw.frozen || raw.published) throw new KelpEditError(raw.frozen ? 'frozen' : 'published', 'This KELP artifact is read-only.');
  if (!raw.identityResolved) throw new KelpEditError('identity-unresolved', 'KELP cannot resolve the user identity.');
  if (!raw.mutationGateClear) throw new KelpEditError('mutation-gate', 'KELP reports a Git/configuration hazard; resolve it before editing.');
  return { entities, frozen: raw.frozen, published: raw.published as KelpStatus['published'],
    identityResolved: raw.identityResolved, mutationGateClear: raw.mutationGateClear };
}

const editable = (row: KelpEntity) => row.humanEditable && (!row.reserved || row.key === 'source');

export function changedKelpScopes(artifact: string, status: KelpStatus, changedFiles: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const file of changedFiles) {
    if (!isAbsolute(file) || !inside(artifact, file)) throw new KelpEditError('outside-artifact', `Changed path is outside the artifact: ${file}`);
    const matches = status.entities.filter(e => inside(join(artifact, e.folder), file));
    if (matches.length !== 1 || !editable(matches[0])) {
      throw new KelpEditError('unmapped-path', `Changed path has no unique editable KELP scope: ${file}`);
    }
    keys.add(matches[0].key);
  }
  return [...keys].sort();
}

export class KelpEditScopes {
  constructor(readonly artifact: string, readonly run: KelpRun) {}
  async status(): Promise<KelpStatus> { return parseKelpStatus(await this.run('status', []), this.artifact); }
  async acquire(keys: readonly string[], beforeLock?: (partition: { acquired: string[]; preExisting: string[] }) => void): Promise<{ acquired: string[]; preExisting: string[] }> {
    const status = await this.status(), wanted = [...new Set(keys)].sort();
    const rows = wanted.map(key => {
      const row = status.entities.find(e => e.key === key);
      if (!row || !editable(row)) throw new KelpEditError('unmapped-scope', `Unknown editable scope: ${key}`);
      if (row.locked && !row.heldByMe) throw new KelpEditError('lock-conflict', `${key} is locked by ${row.owner ?? 'another user'}.`);
      return row;
    });
    const acquired = rows.filter(e => !e.heldByMe).map(e => e.key), preExisting = rows.filter(e => e.heldByMe).map(e => e.key);
    beforeLock?.({acquired,preExisting}); // durable operation ledger before the subprocess can acquire ownership
    if (acquired.length) successful(await this.run('lock', acquired)); // all-or-nothing; can pull the branch
    try { await this.verify(wanted); } catch (error) {
      throw new KelpEditError('ownership-recheck', `Scope acquisition requires reconciliation: ${String(error)}`, undefined, false, acquired);
    }
    return { acquired, preExisting }; // caller persists partition, re-plans after pull, then publishes
  }
  async verify(keys: readonly string[]): Promise<KelpStatus> {
    const status = await this.status();
    for (const key of keys) if (!status.entities.some(e => e.key === key && editable(e) && e.heldByMe)) {
      throw new KelpEditError('ownership-lost', `KELP ownership is unavailable for ${key}. Re-acquire this scope through KELP, then run Edit recovery again.`);
    }
    return status;
  }
  async save(keys: readonly string[], beforeLaunch?: (status: KelpStatus) => void): Promise<KelpReply> {
    const status = await this.verify(keys); beforeLaunch?.(status); return successful(await this.run('save', [...new Set(keys)].sort()));
  }
  async releaseAcquired(acquired: readonly string[], preExisting: readonly string[]): Promise<string[]> {
    const protectedKeys = new Set(preExisting), keys = [...new Set(acquired)].filter(k => !protectedKeys.has(k)).sort();
    if (!keys.length) return [];
    const status=await this.status(),owned=keys.filter(key=>status.entities.some(e=>e.key===key && editable(e) && e.heldByMe));
    if(!owned.length)return [];
    successful(await this.run('release', owned));return owned;
  }
}
