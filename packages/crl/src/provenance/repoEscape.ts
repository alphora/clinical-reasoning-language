import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Best-effort #250 advisory (P1/T11): when the source a `derivedFrom` points at resolves OUTSIDE the repository checkout
 * that carries the record, the back-pointer will not resolve in a clone that does not also contain that out-of-tree file.
 * PRODUCER-SIDE ONLY — P1 forbids repo-root discovery in the VALIDATOR, but the producer already sits at a real on-disk
 * location and may look around. Never throws; any fs hiccup → undefined. The result is ADVISORY — it rides the producer's
 * return envelope / stderr, never the determinism-bearing sidecar fields.
 *
 * Root discovery is a cheap upward walk (see {@link findCheckoutRoot}): `.git` first (a dir OR a worktree/submodule file),
 * else the TOPMOST `package.json`; disabled (undefined) when neither is found. Both the root and the source are passed
 * through a best-effort `realpath` so a SYMLINKED source pointing out of the checkout is caught (a clone can't carry the
 * link target) — but only when BOTH resolve, else the compare is lexical on both, so a symlinked-tmpdir root can't be
 * mismatched against a not-yet-existing source.
 *
 * Known bound (acceptable for a best-effort advisory): the mirror of the symlink case — a lexically-OUTSIDE source that
 * is a symlink back INTO the checkout — produces no advisory, yet the stored (lexical) `derivedFrom` still climbs outside
 * and is dead in a clone. Not flagged here; the stored value's own portability is the detector's concern, not this hint's.
 */
export function repoEscapeAdvisory(sourcePath: string, carrierDir: string): string | undefined {
  try {
    const root = findCheckoutRoot(resolve(carrierDir));
    if (!root) return undefined; // no discoverable checkout → nothing to be "outside" of
    const realRoot = tryRealpath(root);
    const realSrc = tryRealpath(resolve(sourcePath));
    const [useRoot, useSrc] =
      realRoot && realSrc ? [realRoot, realSrc] : [root, resolve(sourcePath)];
    const rel = relative(useRoot, useSrc);
    // Outside the root iff the relative path steps up (`..`) or is drive-qualified (a different Windows volume). The
    // drive-qualified arm is defensive here — a cross-drive source already failed loud in `toCarrierRelative` before this
    // runs — but keeps the helper correct standalone (normalizer E reuses it).
    if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
      return `derivedFrom source "${sourcePath}" resolves OUTSIDE the repository checkout at "${root}" — the back-pointer will not resolve in a clone that lacks that out-of-tree file (#250).`;
    }
    return undefined;
  } catch {
    return undefined; // best-effort: an advisory must never block or fail a write
  }
}

/** realpath, or null when it can't be resolved (e.g. the source does not exist yet) — the caller falls back to lexical. */
function tryRealpath(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * The checkout root by a cheap upward walk: the NEAREST ancestor with a `.git` entry (dir OR file) wins outright. If none
 * exists anywhere up (a `.git`-less export / tarball), fall back to the TOPMOST ancestor carrying a `package.json` — the
 * outermost package boundary, which in a monorepo is the repo root, NOT a sub-package, so a sibling-package source is not
 * false-flagged. undefined when neither marker is found. Exported for a hermetic unit test of the two-pass precedence
 * (the `package.json` fallback walks to the filesystem root, so its RESULT is ambient-sensitive and can't be asserted
 * exactly via `repoEscapeAdvisory` — but the precedence properties it guarantees CAN be).
 */
export function findCheckoutRoot(startDir: string): string | undefined {
  let dir = startDir;
  let topmostPkg: string | undefined;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir; // `.git` wins at the nearest level
    if (existsSync(join(dir, "package.json"))) topmostPkg = dir; // remember the HIGHEST package.json seen
    const parent = dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    dir = parent;
  }
  return topmostPkg;
}
