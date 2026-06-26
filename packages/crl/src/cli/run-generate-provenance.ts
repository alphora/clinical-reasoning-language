#!/usr/bin/env node
import { statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import {
  generateProvenanceFiles,
  type GenerateDiagnostic,
  type MergeDiagnostic,
} from "../provenance";

/**
 * crl-generate-provenance — generate a provenance SCAFFOLD for a policy from its `.cel` + canonical anchor-source `.txt`
 * (shares its implementation with the `generate_provenance` MCP tool via generateProvenanceFiles). Writes the artifact
 * JSON to --out (or stdout) and prints a diagnostics SUMMARY + the full diagnostics to STDERR (so stdout stays clean
 * JSON when --out is omitted). Exits 0 = success, 1 = bad args / IO error.
 *
 * Usage: crl-generate-provenance --cel <f.cel> --anchor <anchor-source.txt>
 *          [--out <artifact.json>] [--merge <existing.json>] [--policy-version <v>]
 */
function parseArgs(argv: string[]): {
  cel?: string;
  anchor?: string;
  out?: string;
  merge?: string;
  policyVersion?: string;
} {
  const out: {
    cel?: string;
    anchor?: string;
    out?: string;
    merge?: string;
    policyVersion?: string;
  } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (
      a === "--cel" ||
      a === "--anchor" ||
      a === "--out" ||
      a === "--merge" ||
      a === "--policy-version"
    ) {
      if (!v || v.startsWith("--")) {
        console.error(`${a} requires a value`);
        process.exit(1);
      }
      if (a === "--policy-version") out.policyVersion = v;
      else out[a.slice(2) as "cel" | "anchor" | "out" | "merge"] = v;
      i++;
    } else if (a.startsWith("--")) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

const {
  cel: celPath,
  anchor: anchorPath,
  out: outPath,
  merge: mergePath,
  policyVersion,
} = parseArgs(process.argv.slice(2));
if (!celPath || !anchorPath) {
  console.error(
    "Usage: crl-generate-provenance --cel <f.cel> --anchor <anchor-source.txt> [--out <artifact.json>] [--merge <existing.json>] [--policy-version <v>]",
  );
  process.exit(1);
}

// File checks mirror run-validate-provenance: each input must be a readable file (the optional --merge too).
const inputs: Array<[string, string]> = [
  ["cel", celPath],
  ["anchor", anchorPath],
];
if (mergePath) inputs.push(["merge", mergePath]);
for (const [label, p] of inputs) {
  let stat;
  try {
    stat = statSync(p);
  } catch {
    console.error(`${label} path "${p}" not readable.`);
    process.exit(1);
  }
  if (!stat.isFile()) {
    console.error(`${label} path "${p}" is not a file.`);
    process.exit(1);
  }
}

/** Tally diagnostics by `kind` for the summary line (sorted by kind for a deterministic readout). */
function countByKind(diags: ReadonlyArray<{ kind: string }>): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const d of diags) counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

try {
  const r = generateProvenanceFiles(celPath, anchorPath, {
    ...(policyVersion !== undefined ? { policyVersion } : {}),
    ...(mergePath !== undefined ? { existingArtifactPath: mergePath } : {}),
  });

  // stdout is reserved for the artifact JSON (clean machine-readable output when --out is omitted); every human-facing
  // line — the summary AND the full diagnostics — goes to stderr.
  const json = JSON.stringify(r.artifact, null, 2);
  if (outPath) {
    writeFileSync(outPath, json + "\n", "utf8");
    console.error(`wrote ${outPath} (policy ${r.policyId} v${r.policyVersion})`);
  } else {
    process.stdout.write(json + "\n");
  }

  console.error(
    `\nProvenance scaffold: ${basename(celPath)} → policy ${r.policyId} v${r.policyVersion}${r.merged ? " (merged onto " + basename(mergePath!) + ")" : ""}`,
  );

  console.error(`\nGenerate diagnostics (${r.diagnostics.length}):`);
  if (r.merged) {
    // The diagnostics are computed on the FRESH (all-provisional) scaffold, but the written artifact is the MERGED one —
    // so they are the PRE-MERGE baseline, not the merged residual.
    console.error(
      "  (note: diagnostics are the pre-merge baseline; run validate_provenance on the output for the merged residual.)",
    );
  }
  for (const [kind, n] of countByKind(r.diagnostics)) console.error(`  ${kind}: ${n}`);
  for (const d of r.diagnostics as GenerateDiagnostic[]) {
    console.error(`  [${d.kind}] ${d.message}`);
  }

  if (r.mergeDiagnostics) {
    console.error(`\nMerge diagnostics (${r.mergeDiagnostics.length}):`);
    for (const [kind, n] of countByKind(r.mergeDiagnostics)) console.error(`  ${kind}: ${n}`);
    for (const d of r.mergeDiagnostics as MergeDiagnostic[]) {
      console.error(`  [${d.kind}] ${d.message}`);
    }
  }

  console.error(`\nDONE — ${r.artifact.clusters.length} cluster(s) generated.`);
  process.exit(0);
} catch (e) {
  console.error(`generate failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
