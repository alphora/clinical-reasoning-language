#!/usr/bin/env node
import { basename } from "node:path";

import { validateProvenanceFiles, type ProvenanceFinding } from "../provenance";

/**
 * crl-validate-provenance — run the §9 provenance validators on a policy's provenance artifact (shares its
 * implementation with the `validate_provenance` MCP tool via validateProvenanceFiles). Prints index diagnostics +
 * findings grouped by severity; exits 0 = no error-severity findings, 1 = bad args / errors found.
 *
 * Default mode = final (strict): the completed-artifact gate, exit 1 on any error-severity finding. Pass --worklist for
 * the IN-PROGRESS check: attribution-class findings (the coverage backlog) re-grade to "warning" so a fresh scaffold
 * exits 0 ("remaining attribution: <n>"); integrity findings still surface (and still fail) as-is.
 *
 * Usage: crl-validate-provenance --artifact <a.json> --cel <f.cel> --anchor <anchor-source.txt> [--worklist]
 */
function parseArgs(argv: string[]): {
  artifact?: string;
  cel?: string;
  anchor?: string;
  worklist?: boolean;
} {
  const out: { artifact?: string; cel?: string; anchor?: string; worklist?: boolean } = {};
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
    } else if (a === "--worklist") {
      out.worklist = true;
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
  worklist,
} = parseArgs(process.argv.slice(2));
if (!artifactPath || !celPath || !anchorPath) {
  console.error(
    "Usage: crl-validate-provenance --artifact <a.json> --cel <f.cel> --anchor <anchor-source.txt> [--worklist]",
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

const mode = worklist ? "worklist" : "final";
try {
  const r = validateProvenanceFiles(artifactPath, celPath, anchorPath, mode);
  console.log(
    `Provenance validation: ${basename(artifactPath)} (policy ${r.policyId} v${r.policyVersion})${
      worklist ? " [worklist]" : ""
    }`,
  );
  if (r.diagnostics.length) {
    console.log(`\nIndex diagnostics (${r.diagnostics.length}):`);
    for (const d of r.diagnostics) console.log(`  [${d.kind}] ${d.message}`);
  }
  // In worklist mode the attribution backlog (re-graded to "warning") is "remaining work," not failures — call it out
  // explicitly so a fresh scaffold reads as a worklist, not a wall of red. The integrity findings still print as-is.
  if (worklist) {
    console.log(`\nRemaining attribution: ${r.worklistCount}`);
  }
  // In worklist mode the attribution backlog rides the "warning" tally (it's re-graded error→warning), so break it out —
  // otherwise "K warning" double-shows the same backlog already named on the "Remaining attribution" line.
  const otherWarnings = worklist ? r.warningCount - r.worklistCount : r.warningCount;
  const warningText = worklist
    ? `${r.warningCount} warning (${r.worklistCount} attribution backlog, ${otherWarnings} other)`
    : `${r.warningCount} warning`;
  console.log(
    `\nFindings: ${r.findings.length} — ${r.errorCount} error, ${r.manualReviewCount} manual-review, ${warningText}`,
  );
  // FINAL mode only: call out the judge-lens waivers (escape hatches suppressing a finding) so a "PASS — no
  // error-severity findings" line isn't misread as "done" — each is a manual-review the Judge must adjudicate. Lead with
  // the SCRUTINIZE count (the few that need real judgment); the routine majority (page chrome, no-operational spans) is a
  // rubber-stamp tally so it doesn't drown the signal.
  if (!worklist && r.waiverCount > 0) {
    const routine = r.waiverCount - r.waiverScrutinizeCount;
    console.log(
      `\nWaivers to adjudicate: ${r.waiverScrutinizeCount} to scrutinize, ${routine} routine (${r.waiverCount} total, all manual-review)`,
    );
  }
  // Sort by severity, then (within manual-review) scrutinize waivers BEFORE routine ones so the few the Judge must
  // adjudicate float to the top of the stream — and tag each waiver line with its scrutiny so the list is triageable,
  // not just the headline count.
  const order = { error: 0, "manual-review": 1, warning: 2 } as const;
  const scrutinyRank = (f: ProvenanceFinding): number => (f.scrutiny === "scrutinize" ? 0 : 1);
  const sorted = [...r.findings].sort(
    (a, b) => order[a.severity] - order[b.severity] || scrutinyRank(a) - scrutinyRank(b),
  );
  for (const f of sorted) {
    const sev = f.scrutiny ? `${f.severity}·${f.scrutiny}` : f.severity;
    console.log(`  [${sev}] ${f.kind}: ${f.message}${where(f)}`);
  }
  console.log(
    `\n${r.pass ? "PASS — no error-severity findings" : `FAIL — ${r.errorCount} error-severity finding(s)`}`,
  );
  process.exit(r.pass ? 0 : 1);
} catch (e) {
  console.error(`validate failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
