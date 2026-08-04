#!/usr/bin/env node
import { normalizeProvenanceFiles } from "../provenance";

/**
 * crl-normalize-provenance — the sanctioned #250 provenance NORMALIZER (Todo E1, closed-form core). Rewrites a legacy
 * provenance carrier into the settled convention: carrier-relative + POSIX `derivedFrom`, the `schemaVersion:"1.1"`
 * envelope, and the `derivedFromContract` marker — so a corpus can repair itself before the H gate flips to hard errors.
 * Shares its implementation with the `normalize_provenance` MCP tool via `normalizeProvenanceFiles`.
 *
 * ONE carrier per invocation (corpus-wide migration enumerates artifacts externally and loops):
 *   crl-normalize-provenance --artifact <artifact.json> [--anchor <anchor.txt>] [--search-root <dir>] [--dry-run]
 *   crl-normalize-provenance --sidecar  <name.anchormeta.json>                   [--search-root <dir>] [--dry-run]
 *
 * `--anchor` overrides the anchor `.txt` used for a closed-form anchor-self repair (default: `anchorSource.path` beside the
 * artifact); the sidecar is always discovered at the CANONICAL sibling location, independent of `--anchor`.
 *
 * `--search-root <dir>` (E2) enables candidate DISCOVERY for a DEAD upstream-source path (one that resolves nowhere on this
 * machine — the transient-worktree flavour): one bounded, single-threaded scan of `<dir>` relocates the source by hashing
 * candidates against the recorded `derivedFromHash`, then rewrites it carrier-relative. Without `--search-root`, a dead
 * upstream path stays worklisted. Records that cannot be repaired even so — a real hash-mismatch, a self-inconsistent
 * record, an ambiguous or not-found discovery — are WORKLISTED, never rewritten. E leaves such records byte-untouched.
 *
 * Exit codes (distinct so CI separates "migration incomplete" from "crashed"):
 *   0 = every processed record is now normalized (the worklist is empty) — these carriers will pass the H gate;
 *   2 = a clean run, but the worklist is non-empty (residue remains — re-run with discovery / adjudicate);
 *   1 = an operational error (bad args, an unloadable carrier, a write failure, or a post-write revalidation failure).
 * `--dry-run` computes the SAME readiness status from the planned outcomes (writing nothing) — it is 0/2, never a blanket 0.
 */
function parseArgs(argv: string[]): {
  artifact?: string;
  sidecar?: string;
  anchor?: string;
  searchRoot?: string;
  dryRun: boolean;
} {
  const out: {
    artifact?: string;
    sidecar?: string;
    anchor?: string;
    searchRoot?: string;
    dryRun: boolean;
  } = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      out.dryRun = true;
    } else if (
      a === "--artifact" ||
      a === "--sidecar" ||
      a === "--anchor" ||
      a === "--search-root"
    ) {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.error(`${a} requires a value`);
        process.exit(1);
      }
      if (a === "--search-root") out.searchRoot = v;
      else out[a.slice(2) as "artifact" | "sidecar" | "anchor"] = v;
      i++;
    } else {
      // Reject anything else loudly (an unknown --flag OR a bare positional) rather than silently dropping it.
      console.error(a.startsWith("--") ? `Unknown option: ${a}` : `Unexpected argument: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

const { artifact, sidecar, anchor, searchRoot, dryRun } = parseArgs(process.argv.slice(2));
const USAGE =
  "Usage: crl-normalize-provenance (--artifact <artifact.json> [--anchor <anchor.txt>] | --sidecar <name.anchormeta.json>) [--search-root <dir>] [--dry-run]";
if ((artifact ? 1 : 0) + (sidecar ? 1 : 0) !== 1) {
  console.error(USAGE);
  process.exit(1);
}
if (sidecar && anchor) {
  // --anchor only targets a closed-form anchor-self repair, which is artifact-mode; on a standalone sidecar it is meaningless.
  console.error(
    `--anchor is not valid with --sidecar (a standalone sidecar is upstream-source).\n${USAGE}`,
  );
  process.exit(1);
}

const result = normalizeProvenanceFiles({
  ...(artifact !== undefined ? { artifactPath: artifact } : {}),
  ...(sidecar !== undefined ? { sidecarPath: sidecar } : {}),
  ...(anchor !== undefined ? { anchorPath: anchor } : {}),
  ...(searchRoot !== undefined ? { searchRoot } : {}),
  dryRun,
});

if (!result.ok) {
  console.error(`normalize failed [${result.stage}]: ${result.message}`);
  process.exit(1);
}

// Human-facing readout to stderr (stdout stays clean for any future machine-readable emission).
const verb = dryRun ? "would normalize" : "normalized";
for (const c of result.carriers) {
  const state = c.wrote
    ? verb
    : c.changed
      ? `${verb} (dry-run: not written)`
      : "already normalized";
  console.error(`  ${c.kind} ${c.path}: ${state}`);
}
for (const a of result.advisories ?? []) console.error(`  ⚠ ${a}`);
if (result.worklist.length) {
  console.error(`\nWorklist (${result.worklist.length}) — records left unrepaired:`);
  for (const w of result.worklist) console.error(`  [${w.reason}] ${w.carrier}: ${w.message}`);
}

if (result.fullyNormalized) {
  console.error(`\nDONE — ${dryRun ? "all records can be normalized" : "all records normalized"}.`);
  process.exit(0);
}
console.error(
  `\nINCOMPLETE — ${result.worklist.length} record(s) still need attention (a dead upstream path needs --search-root discovery${searchRoot ? " under a different root" : ""}, or adjudication).`,
);
process.exit(2);
