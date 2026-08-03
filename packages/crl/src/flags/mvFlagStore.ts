// #212/#230 flags→MV — the flag STORE: per-flag JSON records under the artifact's `medical-validation/flags/` (INSIDE the
// tracked `medical-validation` entity folder, beside the MV sidecar — see medicalValidationSidecarPath). PER-FLAG files
// (`<id>.json`), NOT one `flags.json`, because flags are cross-step/cross-branch/cross-actor (extraction on an eng branch,
// validation on an MV branch, later merged) — one file is a merge-conflict magnet + a single corruption would lose ALL flags;
// per-file merges clean (uuid ids) + isolates corruption. Atomic tmp+rename per file (mirrors saveSidecar). ⚠ load WARNS (never
// silently drops) on an unreadable/invalid record → the caller maps `warning` to the gate's `error` so mvComplete BLOCKS on
// unknown flag state (never a silent pass).
//
// ⚠ #230: the store MOVED from `<artifactRoot>/.crl/flags/` (artifact root, OUTSIDE every KELP entity → never captured by
// `kelp save`, left the worktree dirty, blocked downstream `kelp lock` with `worktree-dirty`) INTO the `medical-validation`
// entity. KELP captures an entity FOLDER recursively (a git-tree hash), so a `flags/` subfolder under it is carried on the
// artifact branch — provided the writes are COMMITTED through MV's lock→save→release (an uncommitted flag still dirties the
// tree). Confirmed with KELP (folder-entity, content-agnostic capture).
import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import { findPolicySrc } from "../provenance/policyLayout";
import { coerceFlag, isValidFlagId, type MvFlag } from "./mvFlag";

const isEnoent = (e: unknown): boolean => (e as NodeJS.ErrnoException)?.code === "ENOENT";

/** The artifact's flag store dir: `<policySrc>/medical-validation/flags/` — a `flags/` subfolder INSIDE the tracked
 *  `medical-validation` entity (#230 moved it here from the untracked `<artifactRoot>/.crl/flags/`), per-policy by
 *  construction (one artifact = one policy → the per-policy gate can filter). `undefined` when the `.cel` isn't inside a
 *  discoverable policy `src/`. Mirrors `medicalValidationSidecarPath`, whose `medical-validation/<policyName>.json` is this
 *  dir's sibling — so store and sidecar live in, and are captured by, the same entity. */
export function flagStoreDir(celPath: string): string | undefined {
  const src = findPolicySrc(celPath);
  if (!src) return undefined;
  return join(src, "medical-validation", "flags");
}

/** #230 migration probe: the OLD store dir `<artifactRoot>/.crl/flags/`, which this code no longer reads or writes. Used by the
 *  cockpit gate + the MCP write tools to DETECT records stranded at the old location — a hidden open flag there would silently
 *  pass mvComplete, and a fresh write would split-brain a half-migrated policy. `undefined` outside a discoverable policy. */
export function legacyFlagStoreDir(celPath: string): string | undefined {
  const src = findPolicySrc(celPath);
  if (!src) return undefined;
  return join(dirname(src), ".crl", "flags");
}

/** A load that tolerated a corrupt/invalid record carries a soft `warning` — the caller maps its PRESENCE to the gate's
 *  `error` (block mvComplete: flag state is partially UNKNOWN). A clean load (incl. a missing dir = no flags yet) omits it. */
export interface FlagStoreLoad {
  flags: MvFlag[];
  warning?: string;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Load every `<id>.json` under the store dir. Missing dir → empty, no warning (a fresh policy). A file that is unreadable /
 *  malformed JSON / not a valid flag record is NOT dropped silently — it sets `warning` (→ the gate blocks). Valid records
 *  load. NEVER throws (read at panel-open; a transient failure must not crash the show-command). */
export function loadFlags(storeDir: string): FlagStoreLoad {
  let names: string[];
  try {
    names = readdirSync(storeDir).filter((f) => f.toLowerCase().endsWith(".json")).sort();
  } catch (e) {
    if (isEnoent(e)) return { flags: [] }; // dir absent = a fresh policy (no flags yet). ANY OTHER error (EACCES…) → warning, NOT silent-empty.
    return { flags: [], warning: `could not read ${basename(storeDir)}/: ${msg(e)}` };
  }
  const flags: MvFlag[] = [];
  const bad: string[] = [];
  for (const name of names) {
    const p = join(storeDir, name);
    let flag: MvFlag | undefined;
    try {
      flag = coerceFlag(JSON.parse(readFileSync(p, "utf8")));
    } catch {
      flag = undefined; // unreadable / malformed JSON
    }
    // Reconcile the filename with the record's own id: `<id>.json` is the identity contract saveFlag/removeFlag rely on. A
    // mismatch (external edit, merge, a crafted id) means the store's on-disk identity is UNKNOWN → treat as bad (warn, block),
    // never load it under the wrong key (which would break removeFlag idempotency + let a "removed" flag reappear).
    if (flag && basename(name, ".json") !== flag.id) flag = undefined;
    if (flag) flags.push(flag);
    else bad.push(name);
  }
  const warning = bad.length ? `${bad.length} unreadable/invalid flag record(s) in ${basename(storeDir)}/ (${bad.join(", ")})` : undefined;
  return warning ? { flags, warning } : { flags };
}

/** #230: is there a store at the OLD `.crl/flags/` location that must be migrated? `present` iff any record remains (INCLUDING
 *  resolved — the audit trail still needs moving) OR the old store is unreadable/corrupt (absence can't be established safely).
 *  A missing old dir → not present (clean, the common case). Reuses `loadFlags` (ENOENT→empty, corrupt→warning). Callers block
 *  mvComplete / refuse writes on `present` until the records are moved to `medical-validation/flags/` and the old dir deleted. */
export function hasLegacyFlagStore(celPath: string): { present: boolean; count: number; warning?: string } {
  const dir = legacyFlagStoreDir(celPath);
  if (!dir) return { present: false, count: 0 };
  const { flags, warning } = loadFlags(dir);
  return { present: flags.length > 0 || warning !== undefined, count: flags.length, warning };
}

/** Write one flag as `<storeDir>/<id>.json` via write-tmp-then-rename (tear-free; per-CALL-unique tmp — pid + a fresh uuid —
 *  so two writers to the same id in one process can't clobber a shared tmp). Creates the store dir. THROWS on a real IO
 *  failure (the caller surfaces it — a failed save must not silently diverge memory from disk). */
export function saveFlag(storeDir: string, flag: MvFlag): void {
  if (!isValidFlagId(flag.id)) throw new Error(`refusing to save flag with unsafe id ${JSON.stringify(flag.id)}`); // never a `../x` into join()
  mkdirSync(storeDir, { recursive: true });
  const dest = join(storeDir, `${flag.id}.json`);
  const tmp = `${dest}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(flag, null, 2) + "\n", "utf8");
  renameSync(tmp, dest);
}

/** Remove a flag's file (idempotent — a missing file is a no-op). THROWS on a real IO failure other than absence. */
export function removeFlag(storeDir: string, id: string): void {
  if (!isValidFlagId(id)) throw new Error(`refusing to remove flag with unsafe id ${JSON.stringify(id)}`); // never a `../x` into join()
  const dest = join(storeDir, `${id}.json`);
  try {
    unlinkSync(dest);
  } catch (e) {
    if (!isEnoent(e)) throw e; // absent = already removed (idempotent); any other IO error surfaces
  }
}
