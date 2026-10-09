import { createHash, randomUUID } from 'node:crypto';
import { linkSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isValidFlagId, loadFlags, saveFlag, type FlagStoreLoad, type MvFlag } from '@smile-digital-health/crl';

export interface KeFlagActionStore {
  load(): FlagStoreLoad;
  create(flag: MvFlag): void;
  save(flag: MvFlag): void;
}

export class KeAnswerSavedError extends Error {
  readonly keAnswerSaved = true;
}
export function isKeAnswerSavedError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && (error as { keAnswerSaved?: unknown }).keAnswerSaved === true;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function keFlagRevision(flag: MvFlag): string {
  return createHash('sha256').update(canonical(flag)).digest('hex');
}

/** Synchronous optimistic operation under the existing MV ownership boundary. It does not
 * provide CAS against uncoordinated external writers. Publish the answer before resolving KE
 * so every failure retains either the original question or a retrievable MV answer.
 * Captured records must be verbatim loadFlags/coerceFlag records, without derived UI fields.
 * mv-answer points to the newest answer; Ignore clears it. Older answers retain reverse correlation.
 * applyKeFlagAction has one production caller: the mutating flagActionToggle decision path.
 * Generic Reopen intentionally checks ownership/status rather than full question revision. */
export function performKeFlagAction(store: KeFlagActionStore, captured: MvFlag,
  action: 'answer' | 'ignore', now = new Date().toISOString()): MvFlag | undefined {
  const revision = keFlagRevision(captured);
  const read = (): FlagStoreLoad => {
    const loaded = store.load();
    if (loaded.warning) throw new Error('flag store unreadable — repair the corrupt record first');
    const current = loaded.flags.find(f => f.id === captured.id);
    if (!current || current.category !== 'extraction' || current.status !== 'open' || keFlagRevision(current) !== revision) {
      throw new Error('the KE flag changed on disk — reopen the drawer');
    }
    return loaded;
  };
  const loaded = read();
  let answer: MvFlag | undefined;
  if (action === 'answer') {
    const id = `mv-answer-${revision.slice(0, 32)}`;
    answer = loaded.flags.find(f => f.id === id);
    if (answer) {
      if (answer.category !== 'validation' ||
        answer.fields['ke-flag'] !== captured.id || answer.fields['ke-question-revision'] !== revision ||
        canonical(answer.anchor) !== canonical(captured.anchor)) {
        throw new Error('the answer flag identity conflicts — original KE flag remains open');
      }
    } else {
      const title = (captured.gist || captured.anchor.label || captured.anchor.name).replace(/[`;\r\n]/g, ' ').trim();
      answer = { schemaVersion: 1, id, category: 'validation', tag: 'other', gist: `Answer: ${title || 'KE question'}`,
        description: `Question:\n${captured.description || captured.gist || captured.anchor.label || captured.anchor.name}\n\nAnswer:\n`, status: 'open',
        fields: { 'ke-flag': captured.id, 'ke-question-revision': revision },
        anchor: { ...captured.anchor }, createdAt: now };
      store.create(answer);
    }
  }
  try {
    read();
    const fields = { ...captured.fields };
    if (answer) fields['mv-answer'] = answer.id;
    else delete fields['mv-answer']; // Ignore supersedes the previous forward answer; reverse history remains.
    store.save({ ...captured, status: 'resolved', editedAt: now, fields });
  } catch (error) {
    if (answer) throw new KeAnswerSavedError(`Answer flag saved, but KE could not resolve. Retry Answer Flag: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
  return answer;
}

/** Exclusive publication of a fully written record. Unlike rename, link refuses an existing
 * destination, including a corrupt or unrelated record. Temporary files never look like flags. */
export function createFlagExclusive(dir: string, flag: MvFlag): void {
  if (!isValidFlagId(flag.id)) throw new Error('unsafe flag identity');
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${flag.id}.json`);
  const tmp = `${dest}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(flag, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    try { linkSync(tmp, dest); } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') throw new Error('Answer record already exists. Original KE flag remains open; reload the drawer and retry Answer Flag to recover the existing answer.');
      throw new Error(`Cannot publish an answer on this filesystem (${code ?? 'unknown error'}). Original KE flag remains open. Use a filesystem supporting hard links or repair its permissions.`);
    }
  } finally {
    // A cleanup failure must not turn a completed publication into a failed create.
    // Any retained .tmp is ignored by the flag loader and may be removed later.
    try { unlinkSync(tmp); } catch { /* best-effort scratch cleanup */ }
  }
}

export function applyKeFlagAction(dir: string, captured: MvFlag, action: 'answer' | 'ignore'): MvFlag | undefined {
  return performKeFlagAction({ load: () => loadFlags(dir), create: flag => createFlagExclusive(dir, flag),
    save: flag => saveFlag(dir, flag) }, captured, action);
}
