// #212 flags→MV slice 1 — the flag STORE: per-flag JSON records under the artifact's `.crl/flags/` (CRL's metadata namespace,
// parallel to KELP's `.kel/`; KELP is configured to track it). PER-FLAG files (`<id>.json`), NOT one `flags.json`, because
// flags are cross-step/cross-branch/cross-actor (extraction on an eng branch, validation on an MV branch, later merged) — one
// file is a merge-conflict magnet + a single corruption would lose ALL flags; per-file merges clean (uuid ids) + isolates
// corruption. Atomic tmp+rename per file (mirrors saveSidecar). ⚠ load WARNS (never silently drops) on an unreadable/invalid
// record → the caller maps `warning` to the gate's `error` so mvComplete BLOCKS on unknown flag state (never a silent pass).
//
// ⚠ SLICE-1 SCOPE: this is the store IO only — NOT wired into the cockpit write path or the mvComplete gate yet (S2 wires
// writes; the gate stays on the old `.crl` source until the migration slice, to avoid a transition blind-gate regression).
// ⚠ KELP must be configured to TRACK `.crl/flags/` (carry it on the artifact branch) — a KELP-integration item, not this slice.
import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { findPolicySrc } from "./provenanceFindings";
import { coerceFlag, isValidFlagId, type MvFlag } from "./mvFlag";

const isEnoent = (e: unknown): boolean => (e as NodeJS.ErrnoException)?.code === "ENOENT";

/** The artifact's flag store dir: `<artifactRoot>/.crl/flags/` — at the ARTIFACT/policy root (dirname of the policy `src/`),
 *  parallel to `.kel-artifact.json`, per-policy by construction (one artifact = one policy → the per-policy gate can filter).
 *  `undefined` when the `.cel` isn't inside a discoverable policy `src/` (mirrors `medicalValidationSidecarPath`). */
export function flagStoreDir(celPath: string): string | undefined {
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

/** Write one flag as `<storeDir>/<id>.json` via write-tmp-then-rename (tear-free; per-PROCESS-unique tmp so concurrent
 *  writers don't clobber a shared tmp — mirrors saveSidecar). Creates `.crl/flags/`. THROWS on a real IO failure (the S2
 *  caller surfaces it — a failed save must not silently diverge memory from disk). */
export function saveFlag(storeDir: string, flag: MvFlag): void {
  if (!isValidFlagId(flag.id)) throw new Error(`refusing to save flag with unsafe id ${JSON.stringify(flag.id)}`); // never a `../x` into join()
  mkdirSync(storeDir, { recursive: true });
  const dest = join(storeDir, `${flag.id}.json`);
  const tmp = `${dest}.${process.pid}.tmp`;
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
