// REFACTOR:grounded (Medical Review): direct edits publish source, definitions and review state together.
// A recoverable sequence of local renames, not a globally atomic or power-loss-atomic transaction.
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync,
  rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export type EditTree = { kind: 'missing' } | { kind: 'file'; bytes: Uint8Array } |
  { kind: 'directory'; files: ReadonlyMap<string, Uint8Array>; directories?: readonly string[] };
export interface EditUnit { path: string; after: EditTree; }
export interface TreeIdentity { kind: EditTree['kind']; sha256: string; }
interface JournalUnit { path: string; before: TreeIdentity; after: TreeIdentity; }
export type EditPhase = 'prepared' | 'publishing' | 'local-applied' | 'rolled-back' |
  'saved' | 'save-failed' | 'save-in-flight' | 'save-outcome-unknown' | 'recovery-required';
interface EditJournal {
  schemaVersion: 1; id: string; artifactRoot: string; phase: EditPhase;
  units: JournalUnit[]; acquired: string[]; preExisting: string[]; scopes: string[];
  detail?: string; saveIntent?: { head: string; paths: string[] };
}
export class EditRecoveryError extends Error {}
/** Fault injection models process termination: no same-process rollback runs. */
export class EditInterrupted extends Error {}
export type EditBoundary = (boundary: 'journal-ready' | 'before-move' | 'after-backup' |
  'after-publish' | 'local-applied' | 'before-capture', ordinal: number) => void;

const within = (root: string, path: string) => {
  const rel = relative(resolve(root), resolve(path));
  return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
};
const existsSync = (path: string): boolean => {
  try { lstatSync(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};
export function assertOrdinaryEditPath(path: string): void {
  let current = resolve(path);
  for (;;) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new EditRecoveryError(`Linked recovery path is read-only: ${current}`);
    const parent = dirname(current); if (parent === current) return; current = parent;
  }
}
function checkedTarget(root: string, target: string): string {
  const absolute = resolve(target);
  if (!isAbsolute(target) || !within(root, absolute)) throw new EditRecoveryError(`Edit path is outside the artifact: ${target}`);
  let current = resolve(root);
  for (const part of relative(current, absolute).split(sep)) {
    if (existsSync(current) && (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink())) {
      throw new EditRecoveryError(`Edit parent is not an ordinary directory: ${current}`);
    }
    current = join(current, part);
  }
  if (existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) throw new EditRecoveryError(`Linked edit path is read-only: ${absolute}`);
  return absolute;
}
function checkedMember(name: string): string {
  if (!name || name.includes('\\') || isAbsolute(name) || name.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new EditRecoveryError(`Invalid tree member: ${name}`);
  }
  return name;
}
function directories(tree: Extract<EditTree, {kind: 'directory'}>): string[] {
  const names = new Set(tree.directories ?? []);
  for (const name of tree.files.keys()) {
    checkedMember(name);
    const parts = name.split('/'); parts.pop();
    while (parts.length) { names.add(parts.join('/')); parts.pop(); }
  }
  for (const name of names) checkedMember(name);
  if ([...names].some(name => tree.files.has(name))) throw new EditRecoveryError('A tree member cannot be both file and directory.');
  return [...names].sort();
}
function identity(tree: EditTree): TreeIdentity {
  const hash = createHash('sha256'); hash.update(tree.kind + '\n');
  if (tree.kind === 'file') hash.update(tree.bytes);
  if (tree.kind === 'directory') {
    for (const name of directories(tree)) hash.update(JSON.stringify(['directory', name]) + '\n');
    for (const [name, bytes] of [...tree.files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      hash.update(JSON.stringify(['file', checkedMember(name), bytes.length]) + '\n'); hash.update(bytes);
    }
  }
  return { kind: tree.kind, sha256: hash.digest('hex') };
}
export const editTreeIdentity = (tree: EditTree): TreeIdentity => identity(tree);
export const readEditTree = (path: string): EditTree => readTree(path);
function readTree(path: string): EditTree {
  if (!existsSync(path)) return { kind: 'missing' };
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new EditRecoveryError(`Linked tree is read-only: ${path}`);
  if (stat.isFile()) return { kind: 'file', bytes: readFileSync(path) };
  if (!stat.isDirectory()) throw new EditRecoveryError(`Unsupported edit tree: ${path}`);
  const files = new Map<string, Uint8Array>(), dirs: string[] = [];
  function walk(folder: string, prefix: string) {
    for (const name of readdirSync(folder).sort()) {
      const file = join(folder, name), key = prefix + name, s = lstatSync(file);
      checkedMember(key);
      if (s.isSymbolicLink()) throw new EditRecoveryError(`Linked tree member is read-only: ${file}`);
      if (s.isDirectory()) { dirs.push(key); walk(file, key + '/'); }
      else if (s.isFile()) files.set(key, readFileSync(file));
      else throw new EditRecoveryError(`Unsupported tree member: ${file}`);
    }
  }
  walk(path, ''); return { kind: 'directory', files, directories: dirs };
}
function writeTree(path: string, tree: EditTree): void {
  if (existsSync(path)) throw new EditRecoveryError(`Staging path already exists: ${path}`);
  if (tree.kind === 'missing') return;
  mkdirSync(dirname(path), { recursive: true });
  if (tree.kind === 'file') { writeFileSync(path, tree.bytes, { flag: 'wx' }); return; }
  mkdirSync(path);
  for (const folder of directories(tree)) mkdirSync(join(path, folder), { recursive: true });
  for (const [name, bytes] of tree.files) writeFileSync(join(path, checkedMember(name)), bytes, { flag: 'wx' });
}
const equal = (a: TreeIdentity, b: TreeIdentity) => a.kind === b.kind && a.sha256 === b.sha256;
const missing = identity({ kind: 'missing' });
function validatePartition(acquired: readonly string[], preExisting: readonly string[], scopes: readonly string[]): void {
  for (const list of [acquired, preExisting, scopes]) if (list.some(k => typeof k !== 'string' || !k) || new Set(list).size !== list.length) {
    throw new EditRecoveryError('Invalid persisted scope partition.');
  }
  if (acquired.some(k => preExisting.includes(k)) || [...acquired, ...preExisting].some(k => !scopes.includes(k))) {
    throw new EditRecoveryError('Scope acquisition overlaps pre-existing ownership or exceeds the Save set.');
  }
}

export class MvEditTransaction {
  private constructor(readonly directory: string, private journal: EditJournal, private boundary?: EditBoundary) {}
  get state(): Readonly<EditJournal> { return structuredClone(this.journal); }
  private slot(ordinal: number, lane: 'before' | 'after') { return join(this.directory, String(ordinal), lane); }
  private adjacent(ordinal: number, lane: 'old' | 'new') {
    return checkedTarget(this.journal.artifactRoot, `${this.journal.units[ordinal].path}.mv-edit-${this.journal.id}-${ordinal}-${lane}`);
  }
  private persist(): void {
    const file = join(this.directory, 'journal.json'), tmp = file + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.journal, null, 2) + '\n'); renameSync(tmp, file);
  }
  static prepare(options: { artifactRoot: string; storageRoot: string; units: readonly EditUnit[];
    expectedBefore?: readonly TreeIdentity[]; acquired?: readonly string[]; preExisting?: readonly string[]; scopes?: readonly string[]; boundary?: EditBoundary }): MvEditTransaction {
    const artifactRoot = resolve(options.artifactRoot), storageRoot = resolve(options.storageRoot);
    assertOrdinaryEditPath(artifactRoot); assertOrdinaryEditPath(storageRoot);
    if (!lstatSync(artifactRoot).isDirectory() || lstatSync(artifactRoot).isSymbolicLink() ||
      artifactRoot === storageRoot || within(artifactRoot, storageRoot) || within(storageRoot, artifactRoot)) {
      throw new EditRecoveryError('Recovery storage must be separate from the ordinary artifact root.');
    }
    const paths = options.units.map(u => checkedTarget(artifactRoot, u.path));
    if (!paths.length || paths.some((p, i) => paths.some((q, j) => i !== j && (p === q || within(p, q))))) {
      throw new EditRecoveryError('Edit units must be nonempty and nonoverlapping.');
    }
    const id = randomUUID(), directory = join(storageRoot, id);
    mkdirSync(directory, { recursive: true });
    const journal: EditJournal = { schemaVersion: 1, id, artifactRoot, phase: 'prepared', units: [],
      acquired: [...options.acquired ?? []], preExisting: [...options.preExisting ?? []], scopes: [...options.scopes ?? []] };
    validatePartition(journal.acquired, journal.preExisting, journal.scopes);
    const tx = new MvEditTransaction(directory, journal, options.boundary);
    if (options.expectedBefore && options.expectedBefore.length !== options.units.length) throw new EditRecoveryError("Expected baseline count differs from edit units.");
    try { options.units.forEach((unit, i) => {
      options.boundary?.("before-capture", i);
      const before = readTree(paths[i]), after = unit.after;
      if (options.expectedBefore && !equal(identity(before), options.expectedBefore[i])) throw new EditRecoveryError(`Edit baseline changed during preparation: ${paths[i]}`);
      journal.units.push({ path: paths[i], before: identity(before), after: identity(after) });
      writeTree(tx.slot(i, 'before'), before); writeTree(tx.slot(i, 'after'), after);
      for (const lane of ['old', 'new'] as const) if (existsSync(tx.adjacent(i, lane))) throw new EditRecoveryError('Adjacent transaction path collision.');
    });
    tx.persist(); } catch (error) { assertOrdinaryEditPath(directory); rmSync(directory, { recursive: true, force: true }); throw error; }
    options.boundary?.('journal-ready', -1); return tx;
  }
  static load(directory: string, artifactRoot: string, boundary?: EditBoundary, terminalMetadataOnly = false): MvEditTransaction {
    assertOrdinaryEditPath(directory); assertOrdinaryEditPath(artifactRoot);
    const raw = JSON.parse(readFileSync(join(directory, 'journal.json'), 'utf8')) as EditJournal;
    if (raw.schemaVersion !== 1 || !/^[a-f0-9-]{36}$/.test(raw.id) || resolve(directory) !== resolve(dirname(directory), raw.id) ||
      raw.artifactRoot !== resolve(artifactRoot) || !Array.isArray(raw.units) || !raw.units.length ||
      !['prepared', 'publishing', 'local-applied', 'rolled-back', 'saved', 'save-failed', 'save-in-flight', 'save-outcome-unknown', 'recovery-required'].includes(raw.phase) ||
      !Array.isArray(raw.acquired) || !Array.isArray(raw.preExisting) || !Array.isArray(raw.scopes)) throw new EditRecoveryError('Invalid recovery journal.');
    validatePartition(raw.acquired, raw.preExisting, raw.scopes);
    const tx = new MvEditTransaction(resolve(directory), raw, boundary);
    const paths = raw.units.map(u => checkedTarget(raw.artifactRoot, u.path));
    if (paths.some((p, i) => paths.some((q, j) => i !== j && (p === q || within(p, q))))) throw new EditRecoveryError('Overlapping journal edit units.');
    raw.units.forEach((u, i) => {
      checkedTarget(raw.artifactRoot, u.path);
      if([u.before,u.after].some(v=>!v || !['missing','file','directory'].includes(v.kind) || !/^[a-f0-9]{64}$/.test(v.sha256)))throw new EditRecoveryError('Invalid journal tree identity.');
      if(terminalMetadataOnly && ['saved','rolled-back','save-failed','local-applied'].includes(raw.phase))return;
      if (!equal(identity(readTree(tx.slot(i, 'before'))), u.before) || !equal(identity(readTree(tx.slot(i, 'after'))), u.after)) {
        throw new EditRecoveryError('Recovery backup or staged output changed.');
      }
    });
    return tx;
  }
  /** Caller must recheck managed scope ownership and complete input fingerprints before this call. */
  publish(): void {
    if (this.journal.phase !== 'prepared') throw new EditRecoveryError('This edit was already published or requires recovery.');
    this.journal.units.forEach((u, i) => {
      checkedTarget(this.journal.artifactRoot, u.path);
      if (!equal(identity(readTree(u.path)), u.before)) throw new EditRecoveryError(`Edit baseline changed: ${u.path}`);
      if (!equal(identity(readTree(this.slot(i, 'after'))), u.after)) throw new EditRecoveryError('Staged output changed.');
    });
    this.journal.phase = 'publishing'; this.persist();
    try {
      this.journal.units.forEach((u, i) => {
        const newer = this.adjacent(i, 'new'), older = this.adjacent(i, 'old');
        writeTree(newer, readTree(this.slot(i, 'after')));
        if (!equal(identity(readTree(u.path)), u.before)) throw new EditRecoveryError(`Edit baseline changed: ${u.path}`);
        this.boundary?.('before-move', i);
        if (u.before.kind !== 'missing') renameSync(u.path, older);
        this.boundary?.('after-backup', i);
        if (u.after.kind !== 'missing') renameSync(newer, u.path);
        this.boundary?.('after-publish', i);
      });
      this.verifyApplied();
      this.cleanupAdjacent(); // no sibling staging files may be included in scope Save
      this.journal.phase = 'local-applied'; this.persist(); this.boundary?.('local-applied', -1);
    } catch (error) {
      if (error instanceof EditInterrupted) throw error;
      try { this.rollback(); } catch (recovery) {
        this.journal.phase = 'recovery-required'; this.journal.detail = String(recovery); this.persist();
        throw new EditRecoveryError(`Publication failed; backups retained for recovery. ${String(error)} ${String(recovery)}`);
      }
      throw error;
    }
  }
  verifyApplied(): void {
    for (const unit of this.journal.units) {
      checkedTarget(this.journal.artifactRoot, unit.path);
      if (!equal(identity(readTree(unit.path)), unit.after)) throw new EditRecoveryError(`Applied edit changed: ${unit.path}`);
    }
  }
  /** Recursive removals are restricted to validated artifact paths with the recorded exact tree hash. */
  private removeKnown(path: string, expected: TreeIdentity): void {
    checkedTarget(this.journal.artifactRoot, path);
    const actual = identity(readTree(path));
    if (actual.kind === 'missing') return;
    if (!equal(actual, expected)) throw new EditRecoveryError(`Recovery conflict; preserving external bytes: ${path}`);
    rmSync(path, { recursive: true });
  }
  private cleanupAdjacent(): void {
    this.journal.units.forEach((u, i) => {
      this.removeKnown(this.adjacent(i, 'old'), u.before); this.removeKnown(this.adjacent(i, 'new'), u.after);
    });
  }
  private rollback(): void {
    for (let i = this.journal.units.length - 1; i >= 0; i--) {
      const u = this.journal.units[i], current = identity(readTree(checkedTarget(this.journal.artifactRoot, u.path))),
        older = this.adjacent(i, 'old'), newer = this.adjacent(i, 'new');
      const old = identity(readTree(older)), next = identity(readTree(newer));
      if (old.kind !== 'missing' && !equal(old, u.before) || next.kind !== 'missing' && !equal(next, u.after)) {
        throw new EditRecoveryError(`Recovery sibling changed: ${u.path}`);
      }
      if (!equal(current, u.before)) {
        const movedOriginal = equal(current, missing) && equal(old, u.before);
        if (!equal(current, u.after) && !movedOriginal) throw new EditRecoveryError(`Recovery conflict; preserving external bytes: ${u.path}`);
        this.removeKnown(u.path, u.after);
        this.removeKnown(newer, u.after);
        if (u.before.kind !== 'missing') {
          if (old.kind !== 'missing') renameSync(older, u.path);
          else { writeTree(newer, readTree(this.slot(i, 'before'))); renameSync(newer, u.path); }
        }
      }
    }
    this.cleanupAdjacent(); this.journal.phase = 'rolled-back'; delete this.journal.detail; this.persist();
  }
  recover(): EditPhase {
    if (['prepared', 'publishing', 'recovery-required'].includes(this.journal.phase)) {
      try { this.rollback(); } catch (error) {
        this.journal.phase = 'recovery-required'; this.journal.detail = String(error); this.persist(); throw error;
      }
    } else if (this.journal.phase === 'save-in-flight') { this.journal.phase = 'save-outcome-unknown'; this.persist(); }
    // Completed publication permits later notes/verdicts. Exact-byte verification belongs only to strict retry.
    return this.journal.phase;
  }
  retryChangedPaths(): string[] {
    return this.journal.units.filter(u=>{try{return !equal(identity(readTree(u.path)),u.after);}catch{return true;}}).map(u=>u.path);
  }
  retryEligible(): boolean { return !this.retryChangedPaths().length; }
  beginSave(head: string, paths: string[]): void {
    if (!['local-applied','save-failed'].includes(this.journal.phase)) throw new EditRecoveryError('Reconcile the prior Save outcome first.');
    this.verifyApplied(); this.journal.saveIntent = { head, paths }; this.journal.phase = 'save-in-flight'; this.persist();
  }
  recordSave(phase: 'saved' | 'save-failed' | 'save-outcome-unknown', detail?: string): void {
    if (!['local-applied', 'save-failed', 'save-in-flight', 'save-outcome-unknown'].includes(this.journal.phase)) throw new EditRecoveryError('There is no locally applied edit to save.');
    this.verifyApplied(); this.journal.phase = phase; this.journal.detail = detail; this.persist();
  }
}

/** Discovery does not auto-repair: the host must block affected panes until recovery is chosen. */
export function discoverMvEdits(storageRoot: string, artifactRoot: string): MvEditTransaction[] {
  if (!existsSync(storageRoot)) return [];
  return readdirSync(storageRoot).sort().filter(id => /^[a-f0-9-]{36}$/.test(id)).map(id =>
    MvEditTransaction.load(join(storageRoot, id), artifactRoot));
}


/** Per-entry diagnostics keep valid journals recoverable while malformed evidence still blocks writes. */
export function inspectMvEdits(storageRoot:string,artifactRoot:string,terminalMetadataOnly=false):{transactions:MvEditTransaction[];errors:{directory:string;message:string}[]}{
  const transactions:MvEditTransaction[]=[],errors:{directory:string;message:string}[]=[];
  if(!existsSync(storageRoot))return {transactions,errors};
  for(const id of readdirSync(storageRoot).sort().filter(id=>/^[a-f0-9-]{36}$/.test(id))){
    const directory=join(storageRoot,id);try{transactions.push(MvEditTransaction.load(directory,artifactRoot,undefined,terminalMetadataOnly));}catch(error){errors.push({directory,message:String(error)});}
  }
  return {transactions,errors};
}
