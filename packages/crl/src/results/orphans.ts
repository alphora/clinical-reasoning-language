/**
 * ⭐ WHAT THE RESULTS TREE HOLDS THAT THIS RUN DID NOT WRITE.
 *
 * Reported by the IEHP knowledge-engineering project. Switching producers left them with 88
 * QuestionnaireResponses in a 44-case artifact: our filenames are `<engine id>-<compartmentId>.json` and
 * their hand-built ones were `qr-<caseId>.json`, so ours landed BESIDE theirs rather than replacing them.
 * Every compartment held two responses and the manifest said `44 generated` — true, and not the whole
 * picture.
 *
 * The worse case is not switching producers, it is RENAMING. Rename a CEL case and its old compartment
 * directory survives intact, holding a complete Questionnaire + QuestionnaireResponse pair for a case
 * that no longer exists — which the pane will offer a medical reviewer as a real case. That is not
 * clutter; it is a reviewer certifying a case the suite no longer contains.
 *
 * ⚠⚠ THIS MODULE DECIDES WHAT GETS DELETED, so its failure mode is destroying someone's work. Three
 * safety properties, each of which had to be built rather than assumed — the first two were caught by
 * review AFTER the naive version had been measured working end to end:
 *
 *   1. SYMLINKS ARE NEVER TRAVERSED (`lstatSync`, not `statSync`). MEASURED: with `statSync`, a
 *      junction at `…/questionnaire` pointing outside the tree was walked and its contents were
 *      classified prunable — the tool would have deleted files that are not in the results tree at all.
 *   2. OTHER SUITES' MANIFESTS ARE HONOURED. There is one manifest PER CEL SOURCE and ONE shared
 *      results tree, so a second suite's live artifacts are unclaimed by THIS run's manifest. Without
 *      this, running suite A deletes suite B's current results.
 *   3. AN UNREADABLE DIRECTORY IS NOT AN EMPTY ONE. A walk that swallows EACCES reports "no orphans"
 *      for a tree it could not read, which reads as "clean" — the exact silence this whole area exists
 *      to remove.
 */
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import path from "node:path";

import { RESULTS_ROOT, USE_CASE_RESOURCE_TYPES, type ResultUseCase } from "./useCases";
import { producerManifestName, type ProducerManifest } from "./manifest";

export interface OrphanScan {
  /** Files under the results tree claimed by no manifest. */
  orphans: string[];
  /**
   * Directories that could not be read, or entries that could not be stat'd.
   *
   * ⚠ NEVER SILENTLY EMPTY. `orphans: []` from a tree we failed to read would claim the tree is clean.
   */
  unreadable: string[];
  /** Symlinks encountered and deliberately NOT followed, reported so they are not invisible. */
  skippedLinks: string[];
}

/** Files under `dir`, relative to `root`, `/`-separated. Symlinks are recorded and never followed. */
function walk(root: string, dir: string, acc: OrphanScan): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (e) {
    // A tree that does not exist yet is genuinely empty; anything else is a failure to LOOK.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      acc.unreadable.push(path.relative(root, dir).split(path.sep).join("/"));
    }
    return;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full).split(path.sep).join("/");
    let st;
    try {
      st = lstatSync(full); // ⚠ lstat: a symlink must be described, never resolved
    } catch {
      acc.unreadable.push(rel);
      continue;
    }
    if (st.isSymbolicLink()) {
      acc.skippedLinks.push(rel);
      continue;
    }
    if (st.isDirectory()) walk(root, full, acc);
    else acc.orphans.push(rel);
  }
}

/**
 * Artifact paths claimed by EVERY producer manifest in the results tree, not just this run's.
 *
 * ⚠ One manifest per CEL source, one shared tree. A sibling suite's live artifacts are unclaimed by
 * this run and would otherwise be deleted as stale — turning "re-run suite A" into "destroy suite B".
 * A manifest we cannot parse protects nothing, so it is reported rather than skipped in silence.
 *
 * ⚠ KNOWN LIMIT, stated because the alternative is a silent one: this protects by TRUSTING every
 * manifest present. Rename the CEL LIBRARY (`foo.cel` → `bar.cel`) and `questionnaire-manifest-foo.json`
 * stays behind, still claiming foo's compartments — so a library rename leaves ghosts that pruning will
 * never reach, which is the case-rename problem one level up. Deleting on a missing manifest's behalf
 * is the far worse error, so the trade stands; a stale manifest is visible in the tree and can be
 * removed by hand.
 */
function claimedByAllManifests(
  outRoot: string,
  manifest: ProducerManifest,
  acc: OrphanScan,
): Set<string> {
  const claimed = new Set<string>();
  const add = (m: ProducerManifest): void => {
    for (const c of m.cases ?? []) for (const a of c.artifacts ?? []) claimed.add(a.path);
  };
  add(manifest);

  const dir = path.join(outRoot, "tests/results");
  const own = producerManifestName(manifest.celLibrary);
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return claimed; // no manifest dir yet: this run's claims are all there are
  }
  for (const name of names) {
    if (name === own || !name.startsWith("questionnaire-manifest-") || !name.endsWith(".json")) continue;
    try {
      add(JSON.parse(readFileSync(path.join(dir, name), "utf8")) as ProducerManifest);
    } catch {
      // Unparseable sibling manifest: we cannot tell what it claims, so we must not delete on its behalf.
      acc.unreadable.push(`tests/results/${name}`);
    }
  }
  return claimed;
}

/** Scan the results tree for files no manifest claims. */
export function scanOrphans(outRoot: string, manifest: ProducerManifest): OrphanScan {
  const acc: OrphanScan = { orphans: [], unreadable: [], skippedLinks: [] };
  const claimed = claimedByAllManifests(outRoot, manifest, acc);
  walk(outRoot, path.join(outRoot, RESULTS_ROOT), acc);
  acc.orphans = acc.orphans.filter((rel) => !claimed.has(rel)).sort();
  acc.unreadable.sort();
  acc.skippedLinks.sort();
  return acc;
}

/**
 * Split orphans into the ones this use case OWNS (safe to prune) and everything else (report only).
 *
 * ⚠ THE SPLIT IS THE SAFETY. The results tree is regenerated output, so a stale Questionnaire or
 * QuestionnaireResponse in it is by definition superseded — pruning those restores the tree to what the
 * run actually produced. Anything else found under the tree was put there by something that is not this
 * producer, and deleting it would be us destroying a file we do not understand. Those are reported and
 * left alone, forever.
 *
 * Ownership is decided by the RESOURCE-TYPE DIRECTORY, which is how the whole tree is addressed
 * (`patient/<compartmentId>/<lowercased type>/`), not by filename — filenames are exactly what varied
 * between producers in the field and are therefore the one thing that must not be trusted here.
 */
export function splitOrphans(
  orphans: readonly string[],
  useCase: ResultUseCase,
): { prunable: string[]; reportOnly: string[] } {
  const owned = new Set(USE_CASE_RESOURCE_TYPES[useCase].map((t) => t.toLowerCase()));
  const prunable: string[] = [];
  const reportOnly: string[] = [];
  for (const rel of orphans) {
    // `tests/results/fhir/patient/<compartmentId>/<type>/<file>` — the type dir is the parent.
    const parts = rel.split("/");
    const typeDir = parts.length >= 2 ? parts[parts.length - 2] : "";
    (owned.has(typeDir) ? prunable : reportOnly).push(rel);
  }
  return { prunable, reportOnly };
}

/**
 * ⚠⚠ WHETHER DELETING ANYTHING IS JUSTIFIED AT ALL. Pure, so CI exercises it without a JVM — the
 * end-to-end path needs a 215 MB engine and therefore runs almost nowhere.
 *
 * Three cases where "everything unclaimed is stale" is FALSE. Each was found by review after the naive
 * version had been measured working end to end, which is the whole argument for reviewing destructive
 * code rather than testing it:
 *
 *   1. A RUN THAT PRODUCED NOTHING CLAIMS NOTHING. A broken emit writes `cases: []` and the entire tree
 *      is then unclaimed. MEASURED: a zero-case run marked every artifact in the tree for deletion. So
 *      the tree is destroyed exactly when the run failed — the worst possible moment.
 *   2. AN INCOMPLETE SCAN CANNOT JUSTIFY A DELETION. An unreadable directory, or a sibling manifest we
 *      could not parse, means we do not know what is claimed. A sibling manifest that fails to parse
 *      would otherwise protect NOTHING, which is the opposite of its purpose.
 *   3. A CASE THAT DID NOT PRODUCE IS NOT A CASE THAT WENT AWAY — handled by `heldBackCompartments`.
 */
export function pruneRefusalReason(
  manifest: ProducerManifest,
  scan: Pick<OrphanScan, "unreadable">,
  prune: boolean | undefined,
): string | undefined {
  if (prune === false) return "disabled by --no-prune";
  const claimsNothing = (manifest.cases ?? []).every((c) => (c.artifacts?.length ?? 0) === 0);
  if (claimsNothing) return "this run produced no artifacts, so nothing here is known to be superseded";
  if (scan.unreadable.length > 0) {
    return "the results tree could not be fully read, so what is claimed is unknown";
  }
  return undefined;
}

/**
 * Path prefixes that must survive pruning: compartments of cases that EXIST but produced nothing.
 *
 * ⚠ `timeout` / `failed` / `not-run` entries carry no artifacts, so their last-good pair reads as
 * unclaimed. One flaky JVM timeout must not delete a committed artifact — the case did not go away,
 * it did not produce THIS time.
 */
export function heldBackCompartments(manifest: ProducerManifest): string[] {
  return (manifest.cases ?? [])
    .filter((c) => (c.artifacts?.length ?? 0) === 0)
    .map((c) => `${RESULTS_ROOT}/${c.compartmentDir}/`);
}

/**
 * Whether `rel` stays inside the results tree, LEXICALLY.
 *
 * ⚠ WHAT THIS DOES AND DOES NOT GUARD. It normalises `..`, drive letters and separators, so a relative
 * path that escapes the tree is rejected. It is `path.resolve`, which never touches the filesystem, so
 * it CANNOT see a symlink — including one introduced between the scan and the delete. Symlink safety
 * comes from the scan refusing to follow them (`lstatSync`), not from here.
 *
 * It is the last gate before `rmSync` and should never fire, which is why it is worth keeping: a check
 * that only matters once an earlier assumption has failed.
 */
export function isInsideResultsTree(outRoot: string, rel: string): boolean {
  const treeRoot = path.resolve(outRoot, RESULTS_ROOT);
  const target = path.resolve(outRoot, rel);
  const within = path.relative(treeRoot, target);
  return within !== "" && !within.startsWith("..") && !path.isAbsolute(within);
}
