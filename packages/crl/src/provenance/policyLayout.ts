// #212 — the policy source-layout primitive. Given any path inside a policy artifact (a `.cel`, a `.crl`, …), find the
// policy's `src/` directory (the one carrying `provenance/`). Extracted to core (from crl-vscode's provenanceFindings) so the
// flag store (`flags/mvFlagStore`) AND the crl-vscode provenance/MV code share ONE resolver; crl-vscode re-exports it, so its
// existing consumers stay edit-free. Filesystem-dependent (node:fs + path) but deterministic; no crl-vscode deps.
//
// The crl-content layout these encode: `artifacts/<policy>/src/{cel,provenance,medical-validation,anchor-source}`, with the
// `.cel` files under `src/cel/` (possibly nested deeper) — NOT directly in `src/`.
import { readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** Is `p` an existing DIRECTORY? `provenance` must be a directory to mark a policy `src/` — a plain file of that name is
 *  not the marker, and accepting one would resolve a bogus policy root (#244 design review). Any stat failure → false. */
function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Walk UP from `startDir` ITSELF (inclusive) to the nearest directory named `src` containing a `provenance/` directory —
 *  the policy's source root. `undefined` when none is found.
 *
 *  Use this when you hold a DIRECTORY (e.g. the folder another extension handed us on launch). `findPolicySrc` is the
 *  file-path form and simply drops the last segment first; keeping one walker means the two can't drift (#244). */
export function findPolicySrcFromDir(startDir: string): string | undefined {
  let dir = startDir;
  for (;;) {
    if (basename(dir) === "src" && isDirectory(join(dir, "provenance"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Walk UP from `startPath` to the nearest ancestor directory named `src` that contains a `provenance/` child — the policy's
 *  source root. `undefined` when none is found (the path isn't inside a discoverable policy artifact). NOTE: despite the
 *  parameter name, ANY path under the tree resolves (it walks up from `dirname(startPath)`), not only a `.cel`. */
export function findPolicySrc(startPath: string): string | undefined {
  return findPolicySrcFromDir(dirname(startPath));
}

/** A policy `src/` may sit one level BELOW the folder in hand — an "artifact root" (`artifacts/<policy>`) has `src/` as a
 *  CHILD, so the upward walk alone never resolves it. Try up first (the common case: a folder inside the policy), then the
 *  one-level-down probe. Keeps the resolver insensitive to which folder a caller anchors on (#244 design review). */
export function findPolicySrcNear(dir: string): string | undefined {
  const up = findPolicySrcFromDir(dir);
  if (up) return up;
  const down = join(dir, "src");
  return isDirectory(join(down, "provenance")) ? down : undefined;
}

/** The result of enumerating a policy's launch candidates. `complete` is false when any subtree could not be read or the
 *  traversal cap was hit — the caller must not treat a single result as certainly-the-only-one in that case. */
export interface PolicyCels {
  cels: string[];
  complete: boolean;
  /** Directories that could not be read (first few, for a diagnosable message). */
  unreadable: string[];
}

/** Bound on directory entries visited, so a pathological tree can't block the extension host (this walk is sync). Far
 *  above any real policy: the whole content repo is well under this. */
const WALK_ENTRY_CAP = 5000;

/** Every `.cel` for a policy `src/` — the launch candidates. A policy legitimately has SEVERAL (the MV sidecar is
 *  policy-scoped precisely because "a policy may have multiple `.cel` clusters under `src/cel/`").
 *
 *  Scoped to `src/cel/` when that exists, which is the crl-content layout: scanning all of `src/` would sweep in
 *  `provenance/`, `anchor-source/` and `medical-validation/`, so a stray `.cel` in any of those could become a launch
 *  candidate — or, if `cel/` were empty, be silently chosen as THE target. Falls back to the whole `src/` when there is
 *  no `cel/` dir, keeping parity with the workspace picker for a non-standard layout (#244 impl review).
 *
 *  Recursive within that root (`src/cel/<cluster>/…` is permitted) and sorted, so a caller presenting these as a choice
 *  gets a deterministic order. Symlinked directories are NOT followed: `readdirSync(withFileTypes)` reports a symlink as
 *  a symlink, so a cycle can't hang the walk. */
export function collectPolicyCels(policySrc: string): PolicyCels {
  const celDir = join(policySrc, "cel");
  const root = isDirectory(celDir) ? celDir : policySrc;
  const cels: string[] = [];
  const unreadable: string[] = [];
  let budget = WALK_ENTRY_CAP;

  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      unreadable.push(dir); // record it — an incomplete enumeration must not masquerade as a definitive one
      return;
    }
    for (const e of entries) {
      if (budget-- <= 0) return;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".cel")) cels.push(full);
    }
  };
  walk(root);

  return { cels: cels.sort(), complete: unreadable.length === 0 && budget > 0, unreadable: unreadable.slice(0, 3) };
}

/** Does `p` exist as a regular file? (Launch validation: a supplied `.cel` must be a real file, not a directory that
 *  happens to be named `foo.cel` and not a dangling path.) */
export function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
