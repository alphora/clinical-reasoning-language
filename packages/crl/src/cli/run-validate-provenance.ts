#!/usr/bin/env node
import { basename } from "node:path";

import { validateProvenanceFiles, type ProvenanceFinding } from "../provenance";

/**
 * crl-validate-provenance — run the §9 provenance validators on a policy's provenance artifact (shares its
 * implementation with the `validate_provenance` MCP tool via validateProvenanceFiles). Prints index diagnostics +
 * findings grouped by severity; exits 0 = no error-severity findings, 1 = bad args / errors found.
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

const where = (f: ProvenanceFinding): string => {
  const bits = [
    f.itemId ? `item=${f.itemId}` : "",
    f.cluster ? `cluster=${f.cluster}` : "",
    f.ref ? `ref=${f.ref.lib}."${f.ref.name}"${f.ref.nodeId ? "#" + f.ref.nodeId : ""}` : "",
    f.range ? `range=[${f.range.start},${f.range.end})` : "",
  ].filter(Boolean);
  return bits.length ? ` (${bits.join(", ")})` : "";
};

try {
  const r = validateProvenanceFiles(artifactPath, celPath, anchorPath);
  console.log(
    `Provenance validation: ${basename(artifactPath)} (policy ${r.policyId} v${r.policyVersion})`,
  );
  if (r.diagnostics.length) {
    console.log(`\nIndex diagnostics (${r.diagnostics.length}):`);
    for (const d of r.diagnostics) console.log(`  [${d.kind}] ${d.message}`);
  }
  console.log(
    `\nFindings: ${r.findings.length} — ${r.errorCount} error, ${r.manualReviewCount} manual-review, ${r.warningCount} warning`,
  );
  const order = { error: 0, "manual-review": 1, warning: 2 } as const;
  for (const f of [...r.findings].sort((a, b) => order[a.severity] - order[b.severity])) {
    console.log(`  [${f.severity}] ${f.kind}: ${f.message}${where(f)}`);
  }
  console.log(
    `\n${r.pass ? "PASS — no error-severity findings" : `FAIL — ${r.errorCount} error-severity finding(s)`}`,
  );
  process.exit(r.pass ? 0 : 1);
} catch (e) {
  console.error(`validate failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
