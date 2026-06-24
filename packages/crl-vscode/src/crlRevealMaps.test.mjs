// Unit tests for the cross-pane reveal maps (#156 C2b-2). vscode-free + crl types erase → esbuild-bundle-then-import.
import { build } from "esbuild";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
async function load(tsFile) {
  const out = resolve(tmpdir(), `crl-${tsFile.replace(/\W/g, "_")}-${process.pid}.cjs`);
  await build({ entryPoints: [resolve(here, tsFile)], bundle: true, platform: "node", format: "cjs", target: "node18", outfile: out, logLevel: "silent" });
  return require(out);
}
const { buildCrlRevealMaps, rowNodeKeysForUnit, unitsForRow } = await load("crlRevealMaps.ts");

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};

const node = (nodeKey, kind, refKeys, children = []) => ({ nodeKey, nodeId: nodeKey, decision: "D", lib: "T", kind, label: nodeKey, refKeys, location: {}, children });
const structure = [
  {
    decision: "D", lib: "T", nodeKey: "dD", location: {},
    children: [
      node("when0", "when", ["cA"], [node("when0act0", "action", ["aX"])]),
      node("oth", "otherwise", []),
    ],
  },
];
// u1,u3 link concept A (cover, not partition — repeats). source-bearing = has a RESOLVED span (displayRange).
const correspondence = {
  units: [
    { id: "u1", source: [{ displayRange: {} }], crl: [{ nodeKey: "cA" }] },
    { id: "u2", source: [], crl: [{ nodeKey: "aX" }] }, // no source → not source-bearing
    { id: "u3", source: [{ displayRange: {} }], crl: [{ nodeKey: "cA" }] },
    { id: "u4", source: [{}], crl: [{ nodeKey: "cA" }] }, // source ref but UNRESOLVED (no displayRange) → not source-bearing
    { id: "u5", source: [{ displayRange: {} }], crl: [{ nodeKey: "cA", unresolved: "missing" }] }, // unresolved crl ref → not bridged
  ],
};

check("keyToRowNodeKeys maps a refKey (concept) → the row that references it; own key too", () => {
  const m = buildCrlRevealMaps(correspondence, structure);
  assert.deepEqual(m.keyToRowNodeKeys.get("cA"), ["when0"]); // concept A → the `when A` row
  assert.deepEqual(m.keyToRowNodeKeys.get("aX"), ["when0act0"]); // activity X → the recommend row
  assert.deepEqual(m.keyToRowNodeKeys.get("when0"), ["when0"]); // own nodeKey
  assert.deepEqual(m.keyToRowNodeKeys.get("dD"), ["dD"]); // decision root addressable
});

check("keyToUnitIds is multi-valued (cover); unresolved crl ref NOT bridged; source-bearing needs displayRange", () => {
  const m = buildCrlRevealMaps(correspondence, structure);
  assert.deepEqual(m.keyToUnitIds.get("cA"), ["u1", "u3", "u4"]); // u5's cA is unresolved → excluded
  assert.deepEqual(m.keyToUnitIds.get("aX"), ["u2"]);
  assert.deepEqual([...m.sourceBearingUnits].sort(), ["u1", "u3", "u5"]); // u2 no source, u4 no resolved span
});

check("rowNodeKeysForUnit: source unit → referencing CRL row; unresolved-crl unit → no rows", () => {
  const m = buildCrlRevealMaps(correspondence, structure);
  assert.deepEqual(rowNodeKeysForUnit("u1", m), ["when0"]); // u1→concept A→`when A` row
  assert.deepEqual(rowNodeKeysForUnit("u2", m), ["when0act0"]);
  assert.deepEqual(rowNodeKeysForUnit("u5", m), []); // u5's only crl ref is unresolved → bridges to nothing
});

check("unitsForRow: a CRL click → SOURCE-BEARING candidates only (cover → multiple; u4 excluded)", () => {
  const m = buildCrlRevealMaps(correspondence, structure);
  // clicking `when A` → units citing cA = u1,u3,u4; u4 lacks a resolved span → filtered → quick-pick over u1,u3
  assert.deepEqual(unitsForRow("when0", m), ["u1", "u3"]);
});

check("unitsForRow filters out source-less units (no-op, not a spurious quick-pick)", () => {
  const m = buildCrlRevealMaps(correspondence, structure);
  // clicking recommend X → unit u2 cites aX but has no source span → filtered → no candidates
  assert.deepEqual(unitsForRow("when0act0", m), []);
});

check("unmapped row → no candidates (clean no-op)", () => {
  const m = buildCrlRevealMaps(correspondence, structure);
  assert.deepEqual(unitsForRow("oth", m), []);
  assert.deepEqual(rowNodeKeysForUnit("nope", m), []);
});

// The rx501 over-match repro: both branches recommend the SAME activity, with realistic nodeId paths for ancestry.
const branch = (key, nodeId, label, concept, act) => ({
  nodeKey: key, nodeId, decision: "D", lib: "T", kind: "when", label, refKeys: [concept], location: {},
  children: [{ nodeKey: `${key}a0`, nodeId: `${nodeId}/action[0]`, decision: "D", lib: "T", kind: "action", label: "Approve", refKeys: [act], location: {}, children: [] }],
});
const sharedStruct = [{ decision: "D", lib: "T", nodeKey: "dD", location: {}, children: [branch("w0", "when[0]", "when Crohn", "cCrohn", "aApprove"), branch("w1", "when[1]", "when UC", "cUC", "aApprove")] }];
const sharedCorr = {
  units: [
    { id: "uCrohn", source: [{ displayRange: {} }], crl: [{ nodeKey: "cCrohn" }, { nodeKey: "aApprove" }] },
    { id: "uUC", source: [{ displayRange: {} }], crl: [{ nodeKey: "cUC" }, { nodeKey: "aApprove" }] },
  ],
};

check("context-scoping: a shared activity does NOT bleed across branches (the rx501 over-match)", () => {
  const m = buildCrlRevealMaps(sharedCorr, sharedStruct);
  // each unit cites its concept + the shared Approve activity; only the IN-BRANCH Approve is highlighted
  assert.deepEqual(rowNodeKeysForUnit("uCrohn", m).sort(), ["w0", "w0a0"]);
  assert.deepEqual(rowNodeKeysForUnit("uUC", m).sort(), ["w1", "w1a0"]);
});

check("no branch context (unit cites only the shared activity) → all action matches (best effort)", () => {
  const m = buildCrlRevealMaps({ units: [{ id: "uA", source: [{ displayRange: {} }], crl: [{ nodeKey: "aApprove" }] }] }, sharedStruct);
  assert.deepEqual(rowNodeKeysForUnit("uA", m).sort(), ["w0a0", "w1a0"]);
});

check("REVERSE scoping: clicking the shared Crohn's Approve selects only the Crohn's unit (no chooser)", () => {
  const m = buildCrlRevealMaps(sharedCorr, sharedStruct);
  assert.deepEqual(unitsForRow("w0a0", m), ["uCrohn"]); // not [uCrohn, uUC]
  assert.deepEqual(unitsForRow("w1a0", m), ["uUC"]);
});

console.log(`\ncrlRevealMaps.test: ${pass} checks passed`);
