// Unit tests for the three-pane viewer CORE (#156 C1): buildViewerModel. vscode-free → esbuild-bundle-then-import.
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { buildViewerModel } = await load("provenanceViewer.ts");

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};

const zr = (line) => ({ startLine: line, startCol: 0, endLine: line, endCol: 5 });
const crl = (nodeKey, file, line, decisionReached = false, extra = {}) => ({ nodeKey, location: { filePath: file, range: zr(line) }, decisionReached, ...extra });
const cel = (file, caseId, line) => ({ file, caseId, explicitCaseId: true, location: { filePath: file, range: zr(line) } });

// ── fixture: a literal CorrespondenceModel (buildViewerModel reads only the fields below) ──
const model = {
  policyId: "P",
  policyVersion: "3",
  anchor: { filePath: "/anchor.txt", text: "anchor text", meta: { textHash: "sha256:0" } },
  units: [
    // uA: source@5; crl [kX not-decision (p.crl), kD decision (det.crl)]; cel c1 — primary should be kD
    {
      id: "uA", label: "A", items: [],
      source: [{ itemId: "i1", byteRange: { start: 50, end: 60 }, displayRange: zr(5) }],
      crl: [crl("kX", "/p.crl", 3, false), crl("kD", "/det.crl", 1, true)],
      cel: [cel("/p.cel", "c1", 10)],
      findingIds: ["f1"],
    },
    // uB: source@2 (earlier → first in cycle)
    { id: "uB", label: "B", items: [], source: [{ itemId: "i2", byteRange: { start: 10, end: 20 }, displayRange: zr(2) }], crl: [], cel: [], findingIds: [] },
    // uC: source-less (CRL-only) → appended after source-positioned; an unresolved CEL ref
    {
      id: "uC", label: "C", items: [],
      source: [],
      crl: [crl("kC", "/p.crl", 8, false)],
      cel: [{ file: "/p.cel", caseId: "cBad", explicitCaseId: false, unresolved: "no such case" }],
      findingIds: [],
    },
    // uD: ALL-unresolved → excluded from the cycle
    {
      id: "uD", label: "D", items: [],
      source: [{ itemId: "i4", byteRange: { start: 99, end: 100 }, unresolved: "malformed offset" }],
      crl: [{ nodeKey: "kU", unresolved: "unresolved-ref", decisionReached: false }],
      cel: [], findingIds: [],
    },
    // uE: COVER repeat of kX (distinct step); source@7
    { id: "uE", label: "E", items: [], source: [{ itemId: "i5", byteRange: { start: 70, end: 80 }, displayRange: zr(7) }], crl: [crl("kX", "/p.crl", 3, false)], cel: [], findingIds: [] },
  ],
  overReachNodes: [crl("kOrphan", "/p.crl", 20, false)],
  ignoredSourceRanges: [
    { byteRange: { start: 50, end: 60 }, displayRange: zr(5), reason: "ignored — same range as uA covered" }, // tests ignored>covered
    { byteRange: { start: 200, end: 201 }, reason: "malformed ignore (no displayRange) → skipped" },
  ],
  findings: [
    { id: "f-unc", finding: { kind: "uncovered-span", severity: "error", message: "unc" }, targets: [{ pane: "source", resolution: "resolved", displayRange: zr(2) }] }, // tests uncovered>covered (same range as uB)
    { id: "f-drift", finding: { kind: "item-text-drift", severity: "manual-review", message: "drift" }, targets: [{ pane: "source", resolution: "resolved", displayRange: zr(9), itemId: "i9" }] }, // must NOT become an uncovered mark
  ],
  rollup: {}, diagnostics: [],
};
const vm = buildViewerModel(model);
const step = (id) => vm.steps.find((s) => s.unitId === id);

check("steps SEGREGATE: source-positioned first (by position), source-less appended; all-unresolved excluded", () => {
  assert.deepEqual(vm.steps.map((s) => s.unitId), ["uB", "uA", "uE", "uC"]); // uB@2, uA@5, uE@7, then source-less uC; uD excluded
});

check("COVER repeats are distinct steps (kX in uA and uE → both present)", () => {
  assert.ok(step("uA") && step("uE"));
});

check("primary CRL prefers a decisionReached node; the rest are secondary", () => {
  const a = step("uA");
  assert.equal(a.primaryCrl.filePath, "/det.crl"); // kD (decisionReached), not kX (first in artifact order)
  assert.equal(a.secondaryCrl.length, 1);
  assert.equal(a.secondaryCrl[0].filePath, "/p.crl"); // kX
});

check("unresolved side-info is structured (ref + reason); the resolved side stays empty", () => {
  const c = step("uC");
  assert.deepEqual(c.cel, []);
  assert.deepEqual(c.unresolved.cel, [{ ref: "/p.cel::cBad", reason: "no such case" }]);
});

check("marks.source: precedence on a byte-identical range (ignored>covered, uncovered>covered)", () => {
  const at = (r) => vm.marks.source.filter((m) => m.range.startLine === r.startLine);
  assert.deepEqual(at(zr(5)).map((m) => m.kind), ["ignored"]); // uA covered + ignored same range → ignored wins (one mark)
  assert.deepEqual(at(zr(2)).map((m) => m.kind), ["uncovered"]); // uB covered + uncovered finding → uncovered wins
  assert.deepEqual(at(zr(7)).map((m) => m.kind), ["covered"]); // uE
});

check("uncovered marks are KIND-GATED: a non-uncovered finding's source target is NOT painted uncovered", () => {
  assert.equal(vm.marks.source.filter((m) => m.range.startLine === 9).length, 0); // the item-text-drift target at line 9
  assert.deepEqual(vm.marks.source.filter((m) => m.kind === "uncovered").map((m) => m.range.startLine), [2]);
});

check("marks.crl: COVER dedup by nodeKey (kX once) + orphan present", () => {
  assert.equal(vm.marks.crl.filter((m) => m.key === "kX").length, 1); // kX from uA + uE → one mark
  assert.equal(vm.marks.crl.find((m) => m.key === "kOrphan").kind, "orphan");
});

check("renderHint invariant: source/cel = range, crl = point", () => {
  assert.ok(vm.marks.source.every((m) => m.renderHint === "range"));
  assert.ok(vm.marks.cel.every((m) => m.renderHint === "range"));
  assert.ok(vm.marks.crl.every((m) => m.renderHint === "point"));
});

check("anchor (text+meta) + policy identity carried", () => {
  assert.equal(vm.anchor.text, "anchor text");
  assert.equal(vm.anchor.meta.textHash, "sha256:0");
  assert.equal(vm.policyId, "P");
  assert.equal(vm.policyVersion, "3");
});

check("source-less ordering: by CRL filePath (raw) then range; CRL-located before CEL-only", () => {
  const m = {
    policyId: "P", policyVersion: "1", anchor: { filePath: "/a.txt", text: "t", meta: {} },
    units: [
      { id: "celOnly", label: "celOnly", items: [], source: [], crl: [], cel: [cel("/z.cel", "cz", 1)], findingIds: [] },
      { id: "crlB", label: "crlB", items: [], source: [], crl: [crl("kb", "/b.crl", 5)], cel: [], findingIds: [] },
      { id: "crlA", label: "crlA", items: [], source: [], crl: [crl("ka", "/a.crl", 9)], cel: [], findingIds: [] },
    ],
    overReachNodes: [], ignoredSourceRanges: [], findings: [], rollup: {}, diagnostics: [],
  };
  // a.crl < b.crl by raw filePath (crlA declared AFTER crlB → file order wins, not artifact order); CEL-only last
  assert.deepEqual(buildViewerModel(m).steps.map((s) => s.unitId), ["crlA", "crlB", "celOnly"]);
});

check("unresolved source + crl identity on a partial-but-included unit", () => {
  const m = {
    policyId: "P", policyVersion: "1", anchor: { filePath: "/a.txt", text: "t", meta: {} },
    units: [{
      id: "u", label: "u", items: [],
      source: [{ itemId: "i1", byteRange: { start: 5, end: 9 }, displayRange: zr(1) }, { itemId: "i2", byteRange: { start: 20, end: 25 }, unresolved: "malformed offset" }],
      crl: [{ nodeKey: "kbad", unresolved: "unresolved-ref", decisionReached: false }],
      cel: [], findingIds: [],
    }],
    overReachNodes: [], ignoredSourceRanges: [], findings: [], rollup: {}, diagnostics: [],
  };
  const s = buildViewerModel(m).steps[0]; // included — i1 is a resolved locus
  assert.deepEqual(s.unresolved.source, [{ ref: "i2@20-25", reason: "malformed offset" }]);
  assert.deepEqual(s.unresolved.crl, [{ ref: "kbad", reason: "unresolved-ref" }]);
});

console.log(`\nprovenanceViewer.test: ${pass} checks passed`);
