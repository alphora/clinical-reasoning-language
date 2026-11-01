import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, lstatSync, opendirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { validateFlagChangeSummary, flagChangeEvidenceSchema, type FlagChangeSummary, type FlagChangeItem, type FlagChangeEvidence } from '@smile-digital-health/crl';

export const SUMMARY_FILE_BYTES = 1024 * 1024;
export const SUMMARY_TOTAL_BYTES = 16 * SUMMARY_FILE_BYTES;
export const SUMMARY_ENTRY_LIMIT = 512;
export const EVIDENCE_FILE_BYTES = 64 * 1024 * 1024;
export type FlagRunChange = { runId: string; recordedAt: string; beforeCommit: string; item: FlagChangeItem };
export interface FlagChangeSummaryLoad { byFlagId: Map<string, FlagRunChange[]>; warnings: string[]; summaries: FlagChangeSummary[] }

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== '' && !isAbsolute(rel) && rel.split(/[\\/]/).every(p => p !== '..');
}
function contained(root: string, candidate: string): string {
  const real = realpathSync(candidate);
  if (!inside(root, real)) throw new Error('path is outside the selected artifact');
  return real;
}

/** Informational reader: corrupt summaries never remove flags or affect review completion. */
export function loadFlagChangeSummaries(artifactRoot: string): FlagChangeSummaryLoad {
  const result: FlagChangeSummaryLoad = { byFlagId: new Map(), warnings: [], summaries: [] };
  let folder: string, root: string;
  try {
    root = realpathSync(artifactRoot);
    folder = contained(root, join(artifactRoot, 'src', 'medical-validation', 'change-summaries'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') result.warnings.push(`Cannot read rerun summaries: ${String(error)}`);
    return result;
  }
  let total = 0, entries = 0;
  try {
    const dir = opendirSync(folder);
    const names: string[] = [];
    try {
      for (let ent = dir.readSync(); ent; ent = dir.readSync()) {
        if (++entries > SUMMARY_ENTRY_LIMIT) { result.warnings.push('Rerun summary folder has too many entries; some were not read.'); break; }
        if (ent.name.endsWith('.json')) names.push(ent.name);
      }
    } finally { dir.closeSync(); }
    for (const name of names.sort()) {
      try {
        const file = join(folder, name), stat = lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a regular summary file');
        const real = contained(root, file);
        if (stat.size > SUMMARY_FILE_BYTES) throw new Error('summary read budget exceeded');
        if (total + stat.size > SUMMARY_TOTAL_BYTES) { result.warnings.push('Rerun summary read budget exceeded; later files were not read.'); break; }
        total += stat.size;
        const bytes = readFileSync(real);
        if (bytes.length > SUMMARY_FILE_BYTES || total + bytes.length - stat.size > SUMMARY_TOTAL_BYTES) throw new Error('summary read budget exceeded');
        total += bytes.length - stat.size;
        const parsed = validateFlagChangeSummary(JSON.parse(bytes.toString('utf8')));
        if (!parsed.success) throw new Error('invalid change-summary format');
        const summary = parsed.data;
        if (basename(name, '.json') !== summary.runId) throw new Error('runId does not match filename');
        result.summaries.push(summary);
        for (const item of summary.items) for (const flagId of new Set(item.flagIds)) {
          const rows = result.byFlagId.get(flagId) ?? [];
          rows.push({ runId: summary.runId, recordedAt: summary.recordedAt, beforeCommit: summary.beforeCommit, item });
          result.byFlagId.set(flagId, rows);
        }
      } catch (error) { result.warnings.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
  } catch (error) { result.warnings.push(`Cannot read rerun summaries: ${String(error)}`); }
  const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  for (const rows of result.byFlagId.values()) rows.sort((a,b) => cmp(b.recordedAt,a.recordedAt) || cmp(a.runId,b.runId));
  return result;
}

/** Verify the historical bytes asynchronously, immediately before opening in the default editor. */
export async function verifyFlagChangeEvidence(artifactRoot: string, evidence: FlagChangeEvidence): Promise<string> {
  try {
  const validated = flagChangeEvidenceSchema.safeParse(evidence);
  if (!validated.success) throw new Error('Evidence reference is invalid for this historical run.');
  evidence = validated.data;
  const root = realpathSync(artifactRoot);
  const candidate = resolve(root, ...evidence.path.split('/'));
  const real = contained(root, candidate), stat = statSync(real);
  if (!stat.isFile() || stat.size > EVIDENCE_FILE_BYTES) throw new Error('Evidence is unavailable or exceeds the 64 MiB limit.');
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(real)) {
    bytes += chunk.length;
    if (bytes > EVIDENCE_FILE_BYTES) throw new Error('Evidence exceeds the 64 MiB limit.');
    hash.update(chunk);
  }
  if (hash.digest('hex') !== evidence.sha256) throw new Error('Evidence for this run no longer matches; the file may have been overwritten by a later run.');
  if (contained(root, candidate) !== real) throw new Error('Evidence path changed; reopen the flag.');
  return real;
  } catch (error) {
    if (['ENOENT','ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
      throw new Error('Evidence is unavailable for this historical run; the file may have been removed.');
    if (['EACCES','EPERM'].includes((error as NodeJS.ErrnoException).code ?? ''))
      throw new Error('Evidence is unavailable for this historical run because access was denied.');
    throw error;
  }
}

export interface FlagChangeDisplay {
  runId: string; recordedAt: string; beforeCommit: string; priorState: string; requestedChange: string; change: string;
  implemented: boolean; targets: string[]; evidence: {label: string; path: string; key: string}[];
}
/** Render-scoped opaque links; a refresh, deletion or policy change invalidates in-flight opens. */
export class FlagChangeSummaryController {
  private links = new Map<string, {root: string; flagId: string; evidence: FlagChangeEvidence}>();
  private cached: {root: string; data: FlagChangeSummaryLoad} | undefined;
  clearLinks(): void { this.links.clear(); }
  clear(): void { this.clearLinks(); this.cached = undefined; }
  render(root: string, flagId: string, knownFlagIds?: ReadonlySet<string>): {changes: FlagChangeDisplay[]; warnings: string[]} {
    this.clearLinks();
    const resolved = resolve(root);
    if (this.cached?.root !== resolved) this.cached = {root: resolved, data: loadFlagChangeSummaries(root)};
    const loaded = this.cached.data, rows = loaded.byFlagId.get(flagId) ?? [];
    const incomplete = (w: string) => /some were not read|later files were not read/.test(w);
    const notices = [...loaded.warnings].sort((a,b) => Number(incomplete(b)) - Number(incomplete(a)));
    const warnings = notices.slice(0,3).map(w => `Summary folder: ${w}`);
    if (loaded.warnings.length > 3) warnings.push(`${loaded.warnings.length - 3} more summary-folder notices.`);
    if (knownFlagIds) {
      const missing = [...new Set(rows.flatMap(run => run.item.flagIds))].filter(id=>!knownFlagIds.has(id));
      if (missing.length) warnings.push(`This flag's summaries also refer to missing flags: ${missing.slice(0,5).join(', ')}${missing.length>5 ? ` (+${missing.length-5} more)` : ''}`);
    }
    return {warnings, changes: rows.map(run => ({
      runId: run.runId, recordedAt: run.recordedAt, beforeCommit: run.beforeCommit, priorState: run.item.priorState,
      requestedChange: run.item.requestedChange,
      change: 'implementedChange' in run.item ? run.item.implementedChange : run.item.notImplementedReason,
      implemented: 'implementedChange' in run.item,
      targets: run.item.affectedTargets.map(t => t.label),
      evidence: run.item.evidence.map(evidence => {
        const key = randomUUID(); this.links.set(key,{root:resolve(root),flagId,evidence});
        return {label:evidence.label,path:evidence.path,key};
      }),
    }))};
  }
  async resolve(key: string, root: string, flagId: string): Promise<string> {
    const link = this.links.get(key);
    if (!link || link.root !== resolve(root) || link.flagId !== flagId) throw new Error('Reopen the flag to view its current evidence links.');
    const file = await verifyFlagChangeEvidence(root,link.evidence);
    if (this.links.get(key) !== link) throw new Error('Reopen the flag to view its current evidence links.');
    return file;
  }
}
