#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { effectiveCaseId } from "../cel/ast/caseId";
import type { CELCase } from "../cel/ast/types";
import { resolveCelImports } from "../cel/imports";
import type { ProvenanceArtifact } from "../provenance/artifact";
import { buildProvenanceIndex } from "../provenance/indexer";
import { validateProvenance, type ProvenanceFinding } from "../provenance/validators";

/**
 * crl-validate-provenance — run the §9 provenance validators on a policy's provenance artifact.
 *
 * Builds the CRL index from the .cel's covered closure, derives coverage, and runs validateProvenance against the
 * canonical anchor-source text. celCaseIds (existence) + frozenCaseIds (explicit/authored ids) are computed from the
 * resolved .cel's cases, keyed by BOTH the .cel basename and its absolute path (so the artifact's CelNodeRef.file may
 * use either). Exit 0 = no error-severity findings; 1 = bad args / errors found.
 *
 * Usage: crl-validate-provenance --artifact <a.json> --cel <f.cel> --anchor <anchor-source.txt>
 */
function parseArgs(argv: string[]): { artifact?: string; cel?: string; anchor?: string } {
  const out: { artifact?: string; cel?: string; anchor?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === "--artifact" || a === "--cel" || a === "--anchor") {
      if (!v || v.startsWith("--")) {
        console.error(`${a} requires a value`);
        process.exit(1);
      }
      out[a.slice(2) as "artifact" | "cel" | "anchor"] = v;
      i++;
    } else if (a.startsWith("--")) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

function read(path: string, label: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    console.error(`Cannot read ${label} ${path}: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

const {
  artifact: artifactPath,
  cel: celPath,
  anchor: anchorPath,
} = parseArgs(process.argv.slice(2));
if (!artifactPath || !celPath || !anchorPath) {
  console.error(
    "Usage: crl-validate-provenance --artifact <a.json> --cel <f.cel> --anchor <anchor-source.txt>",
  );
  process.exit(1);
}

let artifact: ProvenanceArtifact;
try {
  artifact = JSON.parse(read(artifactPath, "artifact")) as ProvenanceArtifact;
} catch (e) {
  console.error(
    `Artifact ${artifactPath} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
  );
  process.exit(1);
}

const anchorText = read(anchorPath, "anchor-source");
const graph = resolveCelImports(celPath);
const index = buildProvenanceIndex(graph);

// caseId sets from the resolved .cel, keyed by both basename and absolute path.
const cases = (graph.cel?.statements ?? []).filter((s): s is CELCase => s.type === "CELCase");
const effective = new Set(cases.map((c, i) => effectiveCaseId(c, i)));
const frozen = new Set(cases.filter((c) => c.caseId !== undefined).map((c) => c.caseId as string));
const celCaseIds = new Map([
  [basename(celPath), effective],
  [graph.filePath, effective],
]);
const frozenCaseIds = new Map([
  [basename(celPath), frozen],
  [graph.filePath, frozen],
]);

const findings = validateProvenance(artifact, index, anchorText, { celCaseIds, frozenCaseIds });

const where = (f: ProvenanceFinding): string => {
  const bits = [
    f.itemId ? `item=${f.itemId}` : "",
    f.cluster ? `cluster=${f.cluster}` : "",
    f.ref ? `ref=${f.ref.lib}."${f.ref.name}"${f.ref.nodeId ? "#" + f.ref.nodeId : ""}` : "",
    f.range ? `range=[${f.range.start},${f.range.end})` : "",
  ].filter(Boolean);
  return bits.length ? ` (${bits.join(", ")})` : "";
};

console.log(
  `Provenance validation: ${basename(artifactPath)} (policy ${artifact.policyId} v${artifact.policyVersion})`,
);
if (index.diagnostics.length) {
  console.log(`\nIndex diagnostics (${index.diagnostics.length}):`);
  for (const d of index.diagnostics) console.log(`  [${d.kind}] ${d.message}`);
}

const errors = findings.filter((f) => f.severity === "error");
const warnings = findings.filter((f) => f.severity === "warning");
const manual = findings.filter((f) => f.severity === "manual-review");
console.log(
  `\nFindings: ${findings.length} — ${errors.length} error, ${manual.length} manual-review, ${warnings.length} warning`,
);
for (const f of [...errors, ...manual, ...warnings])
  console.log(`  [${f.severity}] ${f.kind}: ${f.message}${where(f)}`);

console.log(
  `\n${errors.length === 0 ? "PASS — no error-severity findings" : `FAIL — ${errors.length} error-severity finding(s)`}`,
);
process.exit(errors.length === 0 ? 0 : 1);
