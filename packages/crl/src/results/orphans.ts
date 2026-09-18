// Generated results are producer-owned. Scan without following links; no custom-type exemption.
import { readdirSync, lstatSync } from "node:fs";
import path from "node:path";

import { RESULTS_ROOT, type ResultUseCase } from "./useCases";
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

/** All stale files in the generated tree are removable, regardless of resource type. */
export function splitOrphans(orphans: readonly string[], _useCase: ResultUseCase): { prunable: string[]; reportOnly: string[] } {
  return { prunable: [...orphans], reportOnly: [] };
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
