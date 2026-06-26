// Unit tests for the findings-panel CORE (#156 slice 1 / T2): discoverProvenance + buildFindingsTree.
// vscode-free, so — like renderScenarioHtml.test.mjs — esbuild bundles the TS to CJS and we import it under node.
import { build } from "esbuild";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

async function load(tsFile) {
  const out = resolve(tmpdir(), `crl-${tsFile.replace(/\W/g, "_")}-${process.pid}.cjs`);
  await build({
    entryPoints: [resolve(here, tsFile)],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    outfile: out,
    logLevel: "silent",
  });
  return require(out);
}

const { discoverProvenance, buildFindingsTree, headline, findPolicySrc } = await load("provenanceFindings.ts");

let pass = 0;
const check = (label, fn) => {
  try {
    fn();
    pass++;
    console.log(`  ok  ${label}`);
  } catch (e) {
    console.error(`FAIL  ${label}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

const sha256 = (t) => "sha256:" + createHash("sha256").update(Buffer.from(t, "utf8")).digest("hex");

// ── discovery (temp fixture replicating the crl-content policy-dir layout) ──────
function makePolicy(opts) {
  const root = mkdtempSync(join(tmpdir(), "prov-disc-"));
  const src = join(root, "artifacts", "policy", "src");
  for (const d of ["cel", "provenance", "anchor-source"]) mkdirSync(join(src, d), { recursive: true });
  const celPath = join(src, "cel", "p.cel");
  writeFileSync(celPath, '# C\nlibrary "C".\ncovers "P".\n');
  for (const [name, content] of Object.entries(opts.artifacts ?? {}))
    writeFileSync(join(src, "provenance", name), typeof content === "string" ? content : JSON.stringify(content));
  for (const [name, content] of Object.entries(opts.anchors ?? {}))
    writeFileSync(join(src, "anchor-source", name), content);
  return { root, celPath };
}
const artifactJson = (celFile, extra = {}) => ({
  schemaVersion: "1.0",
  policyId: "P",
  policyVersion: "1",
  anchorSource: { textHash: "sha256:0" },
  items: [],
  ignoredRanges: [],
  clusters: [{ id: "c", label: "x", items: [], crl: [], cel: [{ file: celFile, kind: "case", caseId: "k1", relation: "tests-branch", status: "linked" }] }],
  ...extra,
});

check("discovers the artifact + anchor for a well-formed policy dir", () => {
  const { root, celPath } = makePolicy({ artifacts: { "p.provenance.json": artifactJson("p.cel") }, anchors: { "p.txt": "x" } });
  try {
    const d = discoverProvenance(celPath);
    assert.equal(d.found, true);
    assert.equal(d.status, "ok");
    assert.ok(d.artifactPath.endsWith("p.provenance.json"));
    assert.ok(d.anchorPath.endsWith("p.txt"));
    assert.ok(findPolicySrc(celPath).endsWith("src"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("0 artifacts → status none", () => {
  const { root, celPath } = makePolicy({ anchors: { "p.txt": "x" } });
  try {
    assert.equal(discoverProvenance(celPath).status, "none");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("invalid-JSON candidate is dropped with a warning (and is the lone → error)", () => {
  const { root, celPath } = makePolicy({ artifacts: { "bad.provenance.json": "{ not json" }, anchors: { "p.txt": "x" } });
  try {
    const d = discoverProvenance(celPath);
    assert.equal(d.found, false);
    assert.equal(d.status, "error"); // no parseable artifact
    assert.ok(d.warnings.length > 0, "the dropped-parse warning is carried even on the error result");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("a path-shaped cel ref to a DIFFERENT dir does NOT match (abs-first guard) → cel-mismatch", () => {
  const { root, celPath } = makePolicy({ artifacts: { "p.provenance.json": artifactJson("../other/p.cel") }, anchors: { "p.txt": "x" } });
  try {
    assert.equal(discoverProvenance(celPath).status, "cel-mismatch");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("an ABSOLUTE cel ref matching the active .cel → ok", () => {
  const { root, celPath } = makePolicy({ anchors: { "p.txt": "x" } });
  try {
    const src = dirname(dirname(celPath));
    writeFileSync(join(src, "provenance", "p.provenance.json"), JSON.stringify(artifactJson(celPath)));
    assert.equal(discoverProvenance(celPath).status, "ok");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("two artifacts referencing the .cel → ambiguous, deterministic pick (stable sort)", () => {
  const { root, celPath } = makePolicy({
    artifacts: { "a.provenance.json": artifactJson("p.cel"), "b.provenance.json": artifactJson("p.cel") },
    anchors: { "p.txt": "x" },
  });
  try {
    const d = discoverProvenance(celPath);
    assert.equal(d.status, "ambiguous");
    assert.ok(d.artifactPath.endsWith("a.provenance.json")); // stable-sorted first
    assert.ok(d.warnings.some((w) => w.includes("multiple")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("an artifact referencing a different .cel → cel-mismatch (not silently treated as the policy)", () => {
  const { root, celPath } = makePolicy({ artifacts: { "p.provenance.json": artifactJson("other.cel") }, anchors: { "p.txt": "x" } });
  try {
    const d = discoverProvenance(celPath);
    assert.equal(d.status, "cel-mismatch");
    assert.equal(d.found, true); // still surfaced, with a warning
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check(">1 anchor → disambiguated by the artifact's anchorSource.textHash", () => {
  const want = "the real anchor text";
  const { root, celPath } = makePolicy({
    artifacts: { "p.provenance.json": artifactJson("p.cel", { anchorSource: { textHash: sha256(want) } }) },
    anchors: { "a.txt": "decoy", "b.txt": want },
  });
  try {
    const d = discoverProvenance(celPath);
    assert.ok(d.anchorPath.endsWith("b.txt"), "picks the anchor whose hash matches");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── buildFindingsTree (literal model — buildCorrespondenceModel itself is T1-tested) ──
const ZR = (a, b, c, d) => ({ startLine: a, startCol: b, endLine: c, endCol: d });
const model = {
  policyId: "P",
  policyVersion: "2",
  artifactPath: "/x/p.provenance.json",
  celPath: "/x/p.cel",
  anchor: { filePath: "/x/anchor.txt", text: "some anchor text", meta: {} },
  units: [],
  overReachNodes: [],
  ignoredSourceRanges: [],
  diagnostics: [{ source: "cel-parse", kind: "ParserError", message: "boom", severity: "error", filePath: "/x/p.cel", range: ZR(1, 0, 1, 1) }],
  // Worklist-mode shape: the over-reach (attribution) re-grades error→warning; everything else is integrity. `class` is
  // set on EVERY finding (mode-INDEPENDENT). rollup.worklistCount counts the attribution findings (here: f1).
  findings: [
    { id: "f1", finding: { kind: "over-reach", class: "attribution", severity: "warning", message: "over-reach X", ref: { lib: "P", kind: "concept", name: "X" } }, targets: [{ pane: "crl", resolution: "resolved", location: { filePath: "/x/p.crl", range: ZR(3, 0, 3, 4) }, ref: { lib: "P", kind: "concept", name: "X" } }] },
    { id: "f2", finding: { kind: "mn-keyword-soft", class: "integrity", severity: "warning", message: "covered", itemId: "i2" }, targets: [{ pane: "source", resolution: "resolved", displayRange: ZR(0, 0, 0, 4), byteRange: { start: 0, end: 4 }, itemId: "i2" }] },
    { id: "f3", finding: { kind: "cel-unresolved", class: "integrity", severity: "error", message: "bad cel", cluster: "c" }, targets: [{ pane: "cel", resolution: "unresolved", unitId: "c", reason: "no such case" }] },
    { id: "f4", finding: { kind: "structural-mistag", class: "integrity", severity: "manual-review", message: "mistag", itemId: "i5" }, targets: [{ pane: "source", resolution: "resolved", displayRange: ZR(2, 0, 2, 3), byteRange: { start: 5, end: 8 }, itemId: "i5" }] },
  ],
  // warningCount includes the worklist-graded over-reach (f1) AND the soft-keyword (f2): worklistCount = 1.
  rollup: { errorCount: 1, manualReviewCount: 1, warningCount: 2, worklistCount: 1, pass: false, mustLinkDecisionsTotal: 3, mustLinkDecisionsImplemented: 2, findingCountsByKind: {} },
};

check("groups in order: Diagnostics, Errors, Manual review, Warnings, Remaining attribution", () => {
  const t = buildFindingsTree(model);
  assert.deepEqual(t.groups.map((g) => g.id), ["diagnostics", "error", "manual-review", "warning", "remaining"]);
});

check("discovery notices surface as a top 'notices' info group", () => {
  const t = buildFindingsTree(model, ["multiple artifacts; using a.json"]);
  assert.equal(t.groups[0].id, "notices");
  assert.equal(t.groups[0].nodes[0].prominence, "info");
});

check("soft keyword finding gets prominence 'soft' (not 'warning')", () => {
  const t = buildFindingsTree(model);
  const w = t.groups.find((g) => g.id === "warning").nodes[0];
  assert.equal(w.kind, "mn-keyword-soft");
  assert.equal(w.prominence, "soft");
});

check("a resolved CRL target is navigable; an unresolved CEL target is NOT (renders with reason)", () => {
  const t = buildFindingsTree(model);
  // worklist-graded over-reach (attribution warning) now lives in the "remaining" group, NOT errors.
  const overReach = t.groups.find((g) => g.id === "remaining").nodes.find((n) => n.kind === "over-reach");
  assert.equal(overReach.targets[0].navigable, true);
  assert.equal(overReach.targets[0].filePath, "/x/p.crl");
  const celUnres = t.groups.find((g) => g.id === "error").nodes.find((n) => n.kind === "cel-unresolved");
  assert.equal(celUnres.targets[0].navigable, false);
  assert.ok(celUnres.targets[0].reason.includes("no such case"));
});

check("a source target's filePath is COMPOSED from model.anchor.filePath (model targets carry none)", () => {
  const t = buildFindingsTree(model);
  const soft = t.groups.find((g) => g.id === "warning").nodes[0];
  assert.equal(soft.targets[0].navigable, true);
  assert.equal(soft.targets[0].filePath, "/x/anchor.txt");
});

check("headline: glyph by worst BLOCKER; never prints a zero count; clean → ✓", () => {
  const t = buildFindingsTree(model); // errors:1, manualReview:1, warnings:2, worklistCount:1 → otherWarnings:1
  assert.equal(t.summary.clean, false);
  assert.ok(headline(t.summary).startsWith("✗"));
  assert.ok(headline(t.summary).includes("coverage 2/3"));
  // 0 errors but a manual-review present → ⚠, NOT "✗ 0 error(s)"
  const mr = headline({ ...t.summary, errors: 0, manualReview: 1, warnings: 3, worklistCount: 0 });
  assert.ok(mr.startsWith("⚠"), `expected ⚠ headline, got: ${mr}`);
  assert.ok(!mr.includes("0 error"), `must not print a zero error count: ${mr}`);
  assert.ok(mr.includes("1 manual-review") && mr.includes("3 warnings"));
  // truly clean → ✓ clean
  assert.equal(headline({ ...t.summary, errors: 0, manualReview: 0, warnings: 0, worklistCount: 0 }), `✓ clean · coverage 2/3`);
});

// ── worklist routing + headline (the panel-worklist slice) ──────────────────────
check("(a) a class:'attribution' severity:'warning' finding lands in 'remaining' (not 'warning')", () => {
  const t = buildFindingsTree(model);
  const remaining = t.groups.find((g) => g.id === "remaining");
  assert.ok(remaining, "a remaining group exists");
  assert.ok(remaining.nodes.some((n) => n.kind === "over-reach"), "over-reach routed to remaining");
  assert.equal(remaining.nodes[0].prominence, "soft"); // soft, NOT info
  const warning = t.groups.find((g) => g.id === "warning");
  assert.ok(!warning.nodes.some((n) => n.kind === "over-reach"), "over-reach is NOT in warnings");
  assert.equal(t.summary.worklistCount, 1);
});

check("(b) a class:'attribution' severity:'error' finding (final mode) stays in errors (NOT remaining)", () => {
  const finalModel = {
    ...model,
    findings: [
      { id: "fa", finding: { kind: "over-reach", class: "attribution", severity: "error", message: "over-reach Y", ref: { lib: "P", kind: "concept", name: "Y" } }, targets: [{ pane: "crl", resolution: "resolved", location: { filePath: "/x/p.crl", range: ZR(3, 0, 3, 4) }, ref: { lib: "P", kind: "concept", name: "Y" } }] },
    ],
    rollup: { ...model.rollup, errorCount: 1, manualReviewCount: 0, warningCount: 0, worklistCount: 1 },
  };
  const t = buildFindingsTree(finalModel);
  assert.ok(t.groups.find((g) => g.id === "error").nodes.some((n) => n.kind === "over-reach"), "final-mode attribution stays a blocker");
  assert.ok(!t.groups.some((g) => g.id === "remaining"), "no remaining group when nothing is worklist-graded");
  assert.equal(t.summary.worklistCount, 0); // routed count: nothing routed here in final mode
});

check("(c) headline on an attribution-only summary starts with ✓ and contains 'remaining'", () => {
  // fresh scaffold: 0 error, 0 manual-review, K=3 attribution warnings (all inside warnings), 0 coverage.
  const s = { errors: 0, manualReview: 0, warnings: 3, worklistCount: 3, mustLinkTotal: 3, mustLinkImplemented: 0, clean: true, policyVersion: "1" };
  const h = headline(s);
  assert.ok(h.startsWith("✓"), `expected ✓, got: ${h}`);
  assert.ok(h.includes("3 remaining"), `expected '3 remaining', got: ${h}`);
  assert.ok(!h.includes("warning"), `attribution backlog must NOT read as warnings: ${h}`);
  assert.ok(h.includes("coverage 0/3"));
});

check("(d) attribution + ONE real integrity warning → ⚠ and shows '1 warning' (otherWarnings), NOT 1+K", () => {
  // K=3 attribution warnings + 1 integrity warning → warnings:4, worklistCount:3 → otherWarnings:1.
  const s = { errors: 0, manualReview: 0, warnings: 4, worklistCount: 3, mustLinkTotal: 3, mustLinkImplemented: 0, clean: false, policyVersion: "1" };
  const h = headline(s);
  assert.ok(h.startsWith("⚠"), `expected ⚠, got: ${h}`);
  assert.ok(h.includes("1 warning") && !h.includes("4 warning"), `expected otherWarnings=1, not 4: ${h}`);
  assert.ok(h.includes("3 remaining"), `expected '3 remaining', got: ${h}`);
});

const barrel = await import("@smile-digital-health/crl");
check("barrel export: buildCorrespondenceModel is importable from @smile-digital-health/crl", () => {
  assert.equal(typeof barrel.buildCorrespondenceModel, "function");
});

console.log(`\nprovenanceFindings.test: ${pass} checks passed`);
