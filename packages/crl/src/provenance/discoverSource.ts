/**
 * #250 E2 — the bounded, Dev-Drive-safe candidate DISCOVERY scan that recovers an `upstream-source` record whose recorded
 * `derivedFrom` resolves NOWHERE on this machine (the transient-worktree flavour E1 worklists as `dead-path-needs-discovery`).
 * It walks ONE explicit `--search-root`, hashes the files whose name looks like the lost source, and confirms a candidate ONLY
 * by matching the recorded `derivedFromHash` oracle already in the data — never by name alone. E1 then rewrites the confirmed
 * path carrier-relative and normalizes it exactly as any other verified source.
 *
 * The safety contract (design disc 383, both arms) — every clause is load-bearing, several because the corpus lives on an
 * `E:` ReFS Dev Drive where heavy/forced/parallel I/O has crashed Windows into silent zero-fill corruption:
 *  - ONE synchronous, single-threaded walk PER INVOCATION over the UNION of all targets' name hints (never a walk per record).
 *  - REQUIRED explicit search root — the caller supplies it; this module never defaults to `/` or discovers a root.
 *  - Reparse points (symlinks / Windows junctions) are NEVER followed — cycle avoidance AND the forced-sweep hazard. They
 *    are rejected at enumeration (the parent's dirent) AND rechecked with `lstat` just before a directory is opened, which
 *    also closes the enumeration→descent TOCTOU window (a real dir swapped for a junction between the two).
 *  - A default ignore set (`.git`, `node_modules`) is never descended into.
 *  - A COMPLETE scan is required to COMMIT a match: if ANY budget ceiling is hit, OR any directory/file cannot be read
 *    (EACCES, a race, an oversized file), the enumeration is incomplete (`unscanned: unknown`), so uniqueness cannot be
 *    proven and EVERY served target is reported `budget-exhausted`. A partial scan is NOT trusted — not even a lone hit,
 *    because an unread sibling could hold a second copy. (A silent skip that let a lone visible hit commit would be a
 *    false-unique; confirmation-by-hash keeps the committed bytes sound, but says nothing about UNIQUENESS.)
 *  - The budget covers visited entries, directories descended, and depth — not just files/bytes hashed — so a pathological
 *    tree cannot run the walk unbounded before the file/byte counters would notice. A candidate's size is checked BEFORE it
 *    is read (a multi-GiB match cannot force a huge sequential read on the Dev Drive), and each candidate is hashed in bounded
 *    chunks (no whole-file buffer, and no `readFileSync` ≥2 GiB throw that would otherwise mask the source as unreadable).
 *  - Staged candidate predicate: basename first, then extension, each stage FULLY scanned before falling through; the outcome
 *    names which predicate matched. Confirmation is always the hash; the predicate only bounds WHICH files are hashed.
 *  - Distinct paths that both hash to the oracle are AMBIGUOUS even if they are the same inode (hard-linked) — the tool
 *    refuses to pick rather than pin the record to an arbitrary one.
 *
 * Pure discovery: this module reads the filesystem (enumerate + hash) but writes nothing. `normalizeFiles.ts` owns the
 * rewrite, the carrier-relative check, and the post-write revalidation.
 */
import { createHash } from "node:crypto";
import { closeSync, lstatSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

/** What the scan is trying to relocate: an oracle hash + the filename hints salvaged from the (dead) recorded path. */
export interface DiscoveryTarget {
  /** the record's `derivedFromHash` — the ONLY authority a candidate is confirmed against; `sha256:<64 lowercase hex>`. */
  oracle: string;
  /** basename of the dead recorded `derivedFrom` — the stage-1 predicate. */
  basename: string;
  /** extension of the dead recorded `derivedFrom` (may be `""`, in which case the stage-2 extension predicate is skipped). */
  ext: string;
}

/** Which predicate confirmed the match — reported so the worklist / advisory says HOW the source was relocated. */
export type DiscoveryPredicate = "basename" | "extension";

export type DiscoveryOutcome =
  | { kind: "found"; path: string; predicate: DiscoveryPredicate }
  | { kind: "ambiguous"; paths: string[]; predicate: DiscoveryPredicate }
  | { kind: "not-found" }
  | { kind: "budget-exhausted"; ceiling: string };

/** The scan ceilings. Any one being hit ends the walk with `complete:false` (⇒ every target `budget-exhausted`). These are
 *  conservative BOUNDS, not tuned targets — big enough for a real content repository, finite enough that a runaway tree (or a
 *  reparse-point cycle that slipped the guard) cannot sweep the Dev Drive unbounded. Overridable so tests can force exhaustion. */
export interface DiscoveryBudget {
  /** directory entries (files + subdirs + skipped) examined across the whole walk. */
  maxEntries: number;
  /** directories descended into (the root counts as one). */
  maxDirs: number;
  /** nesting depth below the search root a descent is allowed to reach. */
  maxDepth: number;
  /** candidate files hashed (predicate matches). */
  maxHashFiles: number;
  /** total bytes hashed across all candidates. */
  maxHashBytes: number;
}

export const DEFAULT_DISCOVERY_BUDGET: DiscoveryBudget = {
  maxEntries: 500_000,
  maxDirs: 100_000,
  maxDepth: 64,
  maxHashFiles: 50_000,
  maxHashBytes: 4 * 1024 * 1024 * 1024, // 4 GiB
};

/** Directory names never descended into (compared case-folded — see {@link foldName}) — cheap wins that also avoid the
 *  biggest noise/cycle sources. */
const IGNORE_DIRS = new Set([".git", "node_modules"]);

// Fold case UNCONDITIONALLY (all platforms) for both the candidate predicate and the ignore set. The predicate merely
// selects which files to hash — the hash is authoritative — so over-selecting a case-variant is provably safe, and folding
// on every host catches a corpus authored on case-insensitive Windows whose source was re-cased when discovery runs on
// case-sensitive Linux CI (`Source.docx` vs `source.docx`). A platform gate here would buy nothing except that miss.
const foldName = (s: string): string => s.toLowerCase();

/** Build a {@link DiscoveryTarget} from an oracle hash and the (dead) recorded path, extracting the filename SEPARATOR-
 *  AGNOSTICALLY: a corpus authored on Windows records `E:\worktrees\…\source.docx`, but discovery may run on Linux CI where
 *  `path.basename` would not split `\`. Splitting on both `/` and `\` recovers the filename on either host. A path with no
 *  usable trailing segment yields an empty basename (⇒ no predicate can match ⇒ `not-found`), never a crash. */
export function discoveryTargetFor(oracle: string, recordedPath: string): DiscoveryTarget {
  const name = recordedPath.split(/[\\/]/).pop() ?? "";
  return { oracle, basename: name, ext: extname(name) };
}

interface Candidate {
  path: string;
  basenameFold: string;
  extFold: string;
  hash: string;
}

interface ScanResult {
  complete: boolean;
  /** set iff !complete — which bound stopped the scan: a budget dimension (`maxDirs` …) or `unreadable-entry` (a dir/file
   *  that could not be read, so an unread sibling could hold a second copy → uniqueness unprovable). */
  ceiling?: string;
  candidates: Candidate[];
}

/** sha256 of a file's raw bytes, read in BOUNDED chunks (never a whole-file buffer) so a large candidate neither spikes
 *  memory nor trips `readFileSync`'s ≥2 GiB `ERR_FS_FILE_TOO_LARGE` throw. `capBytes` bounds the total read so a file that
 *  GROWS between its pre-read `statSync` and this read cannot force an unbounded sequential read on the Dev Drive (the size
 *  budget was checked against the statted size; this caps the actual read too). Throws on any open/read error OR on exceeding
 *  the cap — the caller turns that into an INCOMPLETE scan (an unread/over-cap candidate cannot be ruled out as a match). */
function hashFileChunked(path: string, capBytes: number): string {
  const h = createHash("sha256");
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(1 << 20); // 1 MiB window
    let total = 0;
    let n: number;
    while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) {
      total += n;
      if (total > capBytes) {
        throw new Error(
          `candidate "${path}" exceeded its ${capBytes}-byte read cap mid-read (growing file?)`,
        );
      }
      h.update(buf.subarray(0, n));
    }
  } finally {
    closeSync(fd);
  }
  return "sha256:" + h.digest("hex");
}

/**
 * The single synchronous walk. Enumerates the tree under `searchRoot` in lexical DFS order, hashing every regular file whose
 * folded basename is in `wantBasenames` OR whose folded extension is in `wantExts`. Returns `complete:false` the moment any
 * budget ceiling is exceeded OR any directory/file cannot be read — because a partial scan (whether it ran out of budget or
 * hit an unreadable subtree) cannot prove a match is unique, and the caller poisons every target in that case. A completed
 * scan (`complete:true`) therefore means the WHOLE tree under the root was enumerated, so a `not-found` / lone `found` is
 * trustworthy. Does not throw.
 */
function scan(
  searchRoot: string,
  wantBasenames: ReadonlySet<string>,
  wantExts: ReadonlySet<string>,
  budget: DiscoveryBudget,
): ScanResult {
  const candidates: Candidate[] = [];
  let entries = 0;
  let dirs = 0;
  let hashFiles = 0;
  let hashBytes = 0;

  // Explicit LIFO stack (no recursion → no call-stack limit, and depth is tracked explicitly for the budget).
  const stack: Array<{ dir: string; depth: number }> = [{ dir: searchRoot, depth: 0 }];
  while (stack.length > 0) {
    const { dir, depth } = stack.pop() as { dir: string; depth: number };
    if (++dirs > budget.maxDirs) return { complete: false, ceiling: "maxDirs", candidates };

    // Descend-time reparse recheck (closes the enumeration→descent TOCTOU window: a dir confirmed real when its parent was
    // enumerated could be swapped for a junction before we open it). `lstat` (no follow) the dir just before reading it — a
    // reparse point / now-non-dir is skipped (deliberate, not a poison), an lstat ERROR is incomplete. The ROOT (depth 0) is
    // the operator's EXPLICIT choice and is scanned as given; only reparse points found INSIDE the tree are distrusted.
    if (depth > 0) {
      let st;
      try {
        st = lstatSync(dir);
      } catch {
        return { complete: false, ceiling: "unreadable-entry", candidates };
      }
      if (st.isSymbolicLink() || !st.isDirectory()) continue;
    }

    let dirents;
    try {
      dirents = readdirSync(dir, { withFileTypes: true });
    } catch {
      // An unreadable directory is a partial scan (an unread subtree could hold a second copy) → incomplete, poison matches.
      return { complete: false, ceiling: "unreadable-entry", candidates };
    }
    dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const childDirs: string[] = [];
    for (const de of dirents) {
      if (++entries > budget.maxEntries)
        return { complete: false, ceiling: "maxEntries", candidates };
      // NEVER follow a reparse point. On Windows libuv's scandir flags any reparse point (symlink AND junction, plus e.g.
      // cloud-placeholder reparse points) as a symlink dirent, which is what `isSymbolicLink()` reads; that is BROADER than
      // lstat's name-surrogate rule and safe here (it can only over-skip → the worklist direction). The junction case is
      // verified empirically by the reparse test on the corpus OS. Belt-and-braces with the descend-time lstat above.
      if (de.isSymbolicLink()) continue;
      if (de.isDirectory()) {
        if (IGNORE_DIRS.has(foldName(de.name))) continue;
        if (depth + 1 > budget.maxDepth)
          return { complete: false, ceiling: "maxDepth", candidates };
        childDirs.push(join(dir, de.name));
        continue;
      }
      if (!de.isFile()) continue; // devices / fifos / sockets — nothing to hash.

      const bnFold = foldName(de.name);
      const extFold = foldName(extname(de.name));
      const isCandidate = wantBasenames.has(bnFold) || (extFold !== "" && wantExts.has(extFold));
      if (!isCandidate) continue;

      if (++hashFiles > budget.maxHashFiles) {
        return { complete: false, ceiling: "maxHashFiles", candidates };
      }
      const full = join(dir, de.name);
      // Budget the read BEFORE it happens (stat the size), so one multi-GiB match cannot force a huge sequential read on the
      // Dev Drive. A stat error, or an over-budget size, or a read error means we cannot rule this file out as a match, so
      // uniqueness is unprovable → INCOMPLETE (never a silent skip that could later commit a lone visible false-unique).
      let size: number;
      try {
        size = statSync(full).size;
      } catch {
        return { complete: false, ceiling: "unreadable-entry", candidates };
      }
      if (hashBytes + size > budget.maxHashBytes) {
        return { complete: false, ceiling: "maxHashBytes", candidates };
      }
      let hash: string;
      try {
        // Cap the actual read at the remaining byte budget so a file growing since its stat can't run unbounded.
        hash = hashFileChunked(full, budget.maxHashBytes - hashBytes);
      } catch {
        return { complete: false, ceiling: "unreadable-entry", candidates };
      }
      hashBytes += size;
      candidates.push({ path: full, basenameFold: bnFold, extFold, hash });
    }
    // Push children in REVERSE lexical order so the LIFO stack pops them ascending — a deterministic lexical DFS.
    for (let k = childDirs.length - 1; k >= 0; k--)
      stack.push({ dir: childDirs[k], depth: depth + 1 });
  }
  return { complete: true, candidates };
}

/** Resolve one target against a completed (or exhausted) scan, applying the staged predicate. */
function resolveTarget(t: DiscoveryTarget, scanResult: ScanResult): DiscoveryOutcome {
  if (!scanResult.complete) {
    return { kind: "budget-exhausted", ceiling: scanResult.ceiling ?? "unknown" };
  }
  const bnFold = foldName(t.basename);
  const extFold = foldName(t.ext);

  // Stage 1 — basename predicate. A hit here (fully scanned) wins; only a ZERO-hit stage falls through.
  const s1 = scanResult.candidates.filter((c) => c.basenameFold === bnFold && c.hash === t.oracle);
  if (s1.length === 1) return { kind: "found", path: s1[0].path, predicate: "basename" };
  if (s1.length > 1) {
    return { kind: "ambiguous", paths: s1.map((c) => c.path).sort(), predicate: "basename" };
  }

  // Stage 2 — extension predicate (skipped when the target has no extension: an empty-ext match is meaninglessly broad).
  if (extFold !== "") {
    const s2 = scanResult.candidates.filter((c) => c.extFold === extFold && c.hash === t.oracle);
    if (s2.length === 1) return { kind: "found", path: s2[0].path, predicate: "extension" };
    if (s2.length > 1) {
      return { kind: "ambiguous", paths: s2.map((c) => c.path).sort(), predicate: "extension" };
    }
  }
  return { kind: "not-found" };
}

/**
 * Run ONE bounded walk under `searchRoot` for the whole `targets` set and return an outcome per target (positionally
 * aligned). The union of all targets' basenames/extensions bounds what is hashed, so N dead records still cost a single scan.
 * `budget` defaults to {@link DEFAULT_DISCOVERY_BUDGET}; tests pass a tiny one to exercise exhaustion. An empty `targets`
 * returns `[]` without walking.
 */
export function discoverSources(
  searchRoot: string,
  targets: readonly DiscoveryTarget[],
  budget: DiscoveryBudget = DEFAULT_DISCOVERY_BUDGET,
): DiscoveryOutcome[] {
  if (targets.length === 0) return [];
  // Guard the safety bounds: this is a PUBLIC export, and an all-`Infinity` (or NaN / negative) budget would defeat the
  // whole point of the walk. A malformed budget is a programming error (the normalizer always passes the frozen default),
  // so fail loud rather than scan unbounded.
  for (const [k, v] of Object.entries(budget)) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new RangeError(
        `discoverSources: budget.${k} must be a finite non-negative number (got ${JSON.stringify(v)}).`,
      );
    }
  }
  const wantBasenames = new Set(targets.map((t) => foldName(t.basename)).filter((b) => b !== ""));
  const wantExts = new Set(targets.map((t) => foldName(t.ext)).filter((e) => e !== ""));
  const scanResult = scan(searchRoot, wantBasenames, wantExts, budget);
  return targets.map((t) => resolveTarget(t, scanResult));
}
