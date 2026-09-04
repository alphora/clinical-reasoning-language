/**
 * ⭐ THE RESULTS TREE IS OURS. Every Questionnaire and QuestionnaireResponse in it that this run did not
 * write is deleted.
 *
 * ⚠⚠ OPERATOR DECISION, and it REPLACES a much more careful earlier design — do not reintroduce that
 * design's protections thinking they were lost by accident. Review argued for sparing a sibling CEL
 * suite's artifacts, for sparing a case that timed out, and for refusing to prune when a run produced
 * nothing. Each is a real hazard IF the tree is shared. The operator's ruling is that it is not:
 *
 *     "DELETE EVERY FUCKING QUESTIONNAIRE AND EVERY QUESTIONNAIRERESPONSE. I DON'T GIVE A FUCK ABOUT
 *      ANYONE ELSE'S Q OR QR'S. THIS IS OUR FOLDER AND THEY CAN PUT THEIR SHIT SOMEWHERE ELSE."
 *
 * `tests/results/fhir/` is generated output owned by the producer. Anything of ours in it that this run
 * did not produce is superseded by definition, and something else's Q/QR does not belong there at all.
 * The rule is one line, and a one-line rule cannot have the four failure modes the careful version had.
 *
 * TWO THINGS SURVIVE, and neither is about whose files they are:
 *
 *   1. WE ONLY DELETE OUR TYPES. A file under some other type directory is something we do not
 *      understand, and deleting what you do not understand is a different mistake from deleting what
 *      is stale.
 *   2. WE NEVER LEAVE THE TREE. Symlinks are not followed. MEASURED: with `statSync`, a junction at
 *      `…/questionnaire` pointing elsewhere was traversed and its contents marked for deletion — files
 *      not in our folder at all. "Our folder" is the authorization; it is also the limit.
 */
import { readdirSync, lstatSync } from "node:fs";
import path from "node:path";

import { RESULTS_ROOT, USE_CASE_RESOURCE_TYPES, type ResultUseCase } from "./useCases";
import type { ProducerManifest } from "./manifest";

export interface OrphanScan {
  /** Files under the results tree this run did not write. */
  orphans: string[];
  /** Symlinks found and deliberately not followed, reported so they are not invisible. */
  skippedLinks: string[];
}

/** Files under `dir`, relative to `root`, `/`-separated. Symlinks are recorded and never followed. */
function walk(root: string, dir: string, acc: OrphanScan): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // nothing readable here is nothing to delete
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full).split(path.sep).join("/");
    let st;
    try {
      st = lstatSync(full); // ⚠ lstat: describe a symlink, never resolve it
    } catch {
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

/** Scan the results tree for files THIS RUN did not write. */
export function scanOrphans(outRoot: string, manifest: ProducerManifest): OrphanScan {
  const claimed = new Set<string>();
  for (const c of manifest.cases ?? []) for (const a of c.artifacts ?? []) claimed.add(a.path);

  const acc: OrphanScan = { orphans: [], skippedLinks: [] };
  walk(outRoot, path.join(outRoot, RESULTS_ROOT), acc);
  acc.orphans = acc.orphans.filter((rel) => !claimed.has(rel)).sort();
  acc.skippedLinks.sort();
  return acc;
}

/**
 * Split into what we delete (our types) and what we only report (everything else).
 *
 * Ownership is decided by the RESOURCE-TYPE DIRECTORY, which is how the whole tree is addressed
 * (`patient/<compartmentId>/<lowercased type>/`), never by filename — filenames are exactly what varied
 * between producers in the field, so they are the one thing that must not be trusted here.
 */
export function splitOrphans(
  orphans: readonly string[],
  useCase: ResultUseCase,
): { prunable: string[]; reportOnly: string[] } {
  const owned = new Set(USE_CASE_RESOURCE_TYPES[useCase].map((t) => t.toLowerCase()));
  const prunable: string[] = [];
  const reportOnly: string[] = [];
  for (const rel of orphans) {
    const parts = rel.split("/");
    const typeDir = parts.length >= 2 ? parts[parts.length - 2] : "";
    (owned.has(typeDir) ? prunable : reportOnly).push(rel);
  }
  return { prunable, reportOnly };
}

/**
 * Whether `rel` stays inside the results tree, LEXICALLY.
 *
 * ⚠ It normalises `..`, drive letters and separators. It is `path.resolve`, which never touches the
 * filesystem, so it CANNOT see a symlink. Symlink safety comes from the scan refusing to follow them.
 */
export function isInsideResultsTree(outRoot: string, rel: string): boolean {
  const treeRoot = path.resolve(outRoot, RESULTS_ROOT);
  const target = path.resolve(outRoot, rel);
  const within = path.relative(treeRoot, target);
  return within !== "" && !within.startsWith("..") && !path.isAbsolute(within);
}
