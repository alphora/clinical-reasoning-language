/**
 * ⭐ WHAT THE RESULTS TREE HOLDS THAT THIS RUN DID NOT WRITE.
 *
 * ⚠ DETECTION, NEVER DELETION. Deleting a person’s files is worse than leaving them, and the producer
 * cannot know whether an unclaimed file is stale or something a human put there deliberately. So this
 * reports and stops.
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
 * The manifest already enumerates exactly what the run wrote, so this costs one directory walk.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { RESULTS_ROOT, USE_CASE_RESOURCE_TYPES, type ResultUseCase } from "./useCases";
import type { ProducerManifest } from "./manifest";

/** Every file under `dir`, as paths relative to `root`, with `/` separators. */
function walkRelative(root: string, dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // a tree that does not exist yet has no orphans
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue; // vanished mid-walk; not ours to report
    }
    if (isDir) walkRelative(root, full, out);
    else out.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return out;
}

/**
 * Files under the results tree that the manifest does not claim.
 *
 * Compares against the artifact paths the manifest records, which are already relative and
 * `/`-separated — the same strings a consumer reads — so a mismatch here is a real mismatch and not a
 * path-normalisation artifact.
 */
export function findOrphans(outRoot: string, manifest: ProducerManifest): string[] {
  const claimed = new Set<string>();
  for (const c of manifest.cases) for (const a of c.artifacts ?? []) claimed.add(a.path);

  const treeRoot = path.join(outRoot, RESULTS_ROOT);
  return walkRelative(outRoot, treeRoot)
    .filter((rel) => !claimed.has(rel))
    .sort();
}

/**
 * Split orphans into the ones this use case OWNS (safe to prune) and everything else (report only).
 *
 * ⚠ THE SPLIT IS THE SAFETY. The results tree is regenerated output, so a stale Questionnaire or
 * QuestionnaireResponse in it is by definition superseded — pruning those is restoring the tree to what
 * the run actually produced. Anything else found under the tree was put there by something that is not
 * this producer, and deleting it would be us destroying a file we do not understand. Those are reported
 * and left alone, forever.
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
