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
const { buildCrlRevealMaps, rowNodeKeysForUnit, rowNodeKeysForUnitWithConcepts, conceptCrlAnchors, crlAnchorsForUnits, unitsForRow, caseIdsForUnit, unitsForCase, caseIdsForNode, unitsForConcept, rowsForConcept, conceptKeysForUnit, conceptKeysForNode, unitsForRowAll, unitNumbersForRow, unitNumbersForCase, conceptNodesForUnit, unitsForConceptNode, rowNodeKeysForConcept, conceptNodesForRow } = await load("crlRevealMaps.ts");

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

// CEL direction (C2c-1): unit↔case, UNFILTERED by source-bearing; unresolved cel refs skipped.
const celCorr = {
  units: [
    { id: "u1", source: [{ displayRange: {} }], crl: [{ nodeKey: "cCrohn" }], cel: [{ caseId: "caseX" }] },
    { id: "u2", source: [], crl: [], cel: [{ caseId: "caseX" }] }, // source-less but still maps caseX
    { id: "u3", source: [{ displayRange: {} }], crl: [], cel: [{ caseId: "caseY", unresolved: "x" }] }, // unresolved → skip
  ],
};

check("caseIdsForUnit / unitsForCase (unit↔case, unfiltered; unresolved skipped)", () => {
  const m = buildCrlRevealMaps(celCorr, []);
  assert.deepEqual(caseIdsForUnit("u1", m), ["caseX"]);
  assert.deepEqual(unitsForCase("caseX", m), ["u1", "u2"]); // includes the source-less u2 (unfiltered)
  assert.deepEqual(caseIdsForUnit("u3", m), []); // its only cel ref was unresolved
  assert.deepEqual(unitsForCase("caseY", m), []);
});

check("caseIdsForNode: a CRL node → its units → their cases (unfiltered)", () => {
  const struct = [{ decision: "D", lib: "T", nodeKey: "dD", location: {}, children: [node("w0", "when", ["cCrohn"])] }];
  const m = buildCrlRevealMaps(celCorr, struct);
  // u1 cites cCrohn (→ row w0) AND caseX; clicking/selecting w0 reveals caseX
  assert.deepEqual(caseIdsForNode("w0", m), ["caseX"]);
});

// C2c-2 fact peek: thin concept→units/rows wrappers (NO branch-scoping; units source-bearing-filtered).
check("unitsForConcept: concept key → source-bearing units only (thin, unfiltered by branch)", () => {
  const m = buildCrlRevealMaps(correspondence, structure);
  assert.deepEqual(unitsForConcept("cA", m), ["u1", "u3"]); // u4 cites cA but lacks a resolved span → filtered
  assert.deepEqual(unitsForConcept("nope", m), []);
});

check("rowsForConcept: concept key → ALL referencing rows (thin Map.get, NO context-scoping)", () => {
  const m = buildCrlRevealMaps(correspondence, structure);
  assert.deepEqual(rowsForConcept("cA", m), ["when0"]);
  assert.deepEqual(rowsForConcept("aX", m), ["when0act0"]); // activity key too — caller's kind guard decides clickability
  assert.deepEqual(rowsForConcept("nope", m), []);
});

check("rowsForConcept does NOT branch-scope a shared activity (unlike rowNodeKeysForUnit)", () => {
  const m = buildCrlRevealMaps(sharedCorr, sharedStruct);
  // a concept peek is a precise leaf identity → every referencing row corresponds (both branches' Approve rows)
  assert.deepEqual(rowsForConcept("aApprove", m).sort(), ["w0a0", "w1a0"]);
});

// C2c-2b reverse fact-highlight: the concept keys a selected unit/node references (to look up CEL fact spans).
check("conceptKeysForUnit: the keys a unit cites; conceptKeysForNode: row nodeKey + refKeys", () => {
  const m = buildCrlRevealMaps(correspondence, structure);
  assert.deepEqual(conceptKeysForUnit("u1", m), ["cA"]); // u1 cites concept A
  assert.deepEqual(conceptKeysForNode("when0", m).sort(), ["cA", "when0"]); // own key + the concept it branches on
  assert.deepEqual(conceptKeysForNode("when0act0", m).sort(), ["aX", "when0act0"]); // action: own key + activity ref
  assert.deepEqual(conceptKeysForUnit("nope", m), []);
  assert.deepEqual(conceptKeysForNode("nope", m), []);
});

// #163 at-rest key: unitsForRowAll (branch-scoped, NO source-bearing filter) + the number helpers.
check("unitsForRowAll INCLUDES source-less units (unlike unitsForRow which filters them)", () => {
  const m = buildCrlRevealMaps(correspondence, structure);
  assert.deepEqual(unitsForRow("when0act0", m), []); // u2 cites aX but is source-less → filtered
  assert.deepEqual(unitsForRowAll("when0act0", m), ["u2"]); // at-rest key still numbers it
});

check("unitsForRowAll branch-scopes a shared activity (the rx501 over-tag), source-less included", () => {
  // uCrohn/uUC both source-bearing here; the point is the branch-scoping still applies in the no-filter variant
  const m = buildCrlRevealMaps(sharedCorr, sharedStruct);
  assert.deepEqual(unitsForRowAll("w0a0", m).sort(), ["uCrohn"]);
  assert.deepEqual(unitsForRowAll("w1a0", m).sort(), ["uUC"]);
});

check("unitNumbersForRow: branch-scoped units → sorted numbers, filtered to numbered units", () => {
  const m = buildCrlRevealMaps(correspondence, structure);
  const unitNumber = new Map([["u1", 1], ["u3", 2], ["u4", 3]]);
  assert.deepEqual(unitNumbersForRow("when0", m, unitNumber), [1, 2, 3]); // cA cited by u1,u3,u4
  assert.deepEqual(unitNumbersForRow("when0", m, new Map([["u1", 1], ["u3", 2]])), [1, 2]); // u4 unnumbered → dropped
  assert.deepEqual(unitNumbersForRow("oth", m, unitNumber), []); // unmapped row
});

check("unitNumbersForCase: case → its units' numbers (unscoped), sorted + deduped", () => {
  const m = buildCrlRevealMaps(celCorr, []);
  assert.deepEqual(unitNumbersForCase("caseX", m, new Map([["u1", 1], ["u2", 2]])), [1, 2]);
  assert.deepEqual(unitNumbersForCase("caseX", m, new Map([["u2", 5]])), [5]); // u1 unnumbered → dropped
  assert.deepEqual(unitNumbersForCase("nope", m, new Map()), []);
});

// #166 Slice 2: concept-NODE correspondence. `when "Container"` references Container, which is `defined as` Mid, which is
// `defined as` Sub (a 2-HOP chain). The action under it is guarded by concept Guard. A unit cites the deeply-nested Sub.
const cStruct = [
  {
    decision: "D", lib: "T", nodeKey: "dD", location: {},
    children: [
      node("wC", "when", ["kContainer"], [node("wCa", "action", ["aX", "kGuard"])]), // action: activity aX + guard concept
      node("wC2", "when", ["kContainer"]),
    ],
  },
];
const cCorr = { units: [{ id: "uSub", source: [{ displayRange: {} }], crl: [{ nodeKey: "kSub" }] }] };
const cLayer = [
  { nodeKey: "kContainer", definitionRefs: ["kMid"] },
  { nodeKey: "kMid", definitionRefs: ["kSub"] },
  { nodeKey: "kSub", definitionRefs: [] },
  { nodeKey: "kGuard", definitionRefs: [] },
];

check("rowNodeKeysForConcept: a deeply-NESTED sub-concept (2 hops) resolves UP to the containing `when` row(s)", () => {
  const m = buildCrlRevealMaps(cCorr, cStruct, cLayer);
  assert.deepEqual(rowNodeKeysForConcept("kSub", m).sort(), ["wC", "wC2"]); // Sub → Mid → Container → its whens
  assert.deepEqual(rowNodeKeysForConcept("kMid", m).sort(), ["wC", "wC2"]); // 1 hop
  assert.deepEqual(rowNodeKeysForConcept("kContainer", m).sort(), ["wC", "wC2"]); // direct
  assert.deepEqual(rowNodeKeysForConcept("aX", m), []); // not a concept → []
});

check("rowNodeKeysForConcept: a GUARD concept resolves to the guarded ACTION row (an applicable decision too)", () => {
  const m = buildCrlRevealMaps(cCorr, cStruct, cLayer);
  assert.deepEqual(rowNodeKeysForConcept("kGuard", m), ["wCa"]); // guard concept → its action row
});

check("conceptNodesForRow: a `when` surfaces its concept + transitively-contained sub-concepts; an action shows its guard, drops the activity", () => {
  const m = buildCrlRevealMaps(cCorr, cStruct, cLayer);
  assert.deepEqual(conceptNodesForRow("wC", m), ["kContainer", "kMid", "kSub"]); // direct + 2-hop contained
  assert.deepEqual(conceptNodesForRow("wCa", m), ["kGuard"]); // guard concept kept; activity aX dropped
});

check("conceptNodesForUnit / unitsForConceptNode", () => {
  const m = buildCrlRevealMaps(cCorr, cStruct, cLayer);
  assert.deepEqual(conceptNodesForUnit("uSub", m), ["kSub"]); // the cited concept node
  assert.deepEqual(unitsForConceptNode("kSub", m), ["uSub"]);
  assert.deepEqual(conceptNodesForUnit("nope", m), []);
});

check("no conceptLayer (default []) → concept maps empty, concept helpers no-op (back-compat)", () => {
  const m = buildCrlRevealMaps(cCorr, cStruct);
  assert.equal(m.conceptByKey.size, 0);
  assert.deepEqual(rowNodeKeysForConcept("kSub", m), []);
});

// #166 Slice 3b: the merged single-scope resolver (rowNodeKeysForUnitWithConcepts) + the shared conceptCrlAnchors.
// (The DIRECT resolver rowNodeKeysForUnit is unchanged — its behavior is locked by the lines 60-108 tests above, which
// are also the byte-equivalence guard for the scopeRows extraction.)
check("rowNodeKeysForUnitWithConcepts: a unit citing a NESTED sub-concept lights up the driving `when`(s) (direct resolver finds none)", () => {
  const m = buildCrlRevealMaps(cCorr, cStruct, cLayer);
  assert.deepEqual(rowNodeKeysForUnit("uSub", m), []); // kSub isn't on any row directly → direct path empty
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("uSub", m).sort(), ["wC", "wC2"]); // via containment → the container's whens
});

// A unit citing BOTH a nested sub-concept AND a shared activity present in two branches. The containment-supplied `when`
// gives branch context so ONLY the in-branch action survives — the shared activity is NOT re-introduced (the Slice-2 risk).
const mixStruct = [{
  decision: "D", lib: "T", nodeKey: "dD", location: {},
  children: [
    { nodeKey: "wA", nodeId: "when[0]", decision: "D", lib: "T", kind: "when", label: "wA", refKeys: ["kContainerA"], location: {},
      children: [{ nodeKey: "wAa", nodeId: "when[0]/action[0]", decision: "D", lib: "T", kind: "action", label: "Approve", refKeys: ["aApprove"], location: {}, children: [] }] },
    { nodeKey: "wB", nodeId: "when[1]", decision: "D", lib: "T", kind: "when", label: "wB", refKeys: ["kOther"], location: {},
      children: [{ nodeKey: "wBa", nodeId: "when[1]/action[0]", decision: "D", lib: "T", kind: "action", label: "Approve", refKeys: ["aApprove"], location: {}, children: [] }] },
  ],
}];
const mixCorr = { units: [{ id: "uMix", source: [{ displayRange: {} }], crl: [{ nodeKey: "kSub" }, { nodeKey: "aApprove" }] }] };
const mixLayer = [{ nodeKey: "kContainerA", definitionRefs: ["kSub"] }, { nodeKey: "kSub", definitionRefs: [] }, { nodeKey: "kOther", definitionRefs: [] }];

check("rowNodeKeysForUnitWithConcepts: nested sub-concept supplies branch context → shared activity NOT re-introduced across branches (single-scope)", () => {
  const m = buildCrlRevealMaps(mixCorr, mixStruct, mixLayer);
  // kSub → kContainerA → wA (only); aApprove is on wAa AND wBa, but only the in-branch (wA) action survives the ONE scope pass
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("uMix", m).sort(), ["wA", "wAa"]);
  // contrast: the DIRECT resolver has no branch context (kSub on no row; aApprove with no when) → all actions (best effort)
  assert.deepEqual(rowNodeKeysForUnit("uMix", m).sort(), ["wAa", "wBa"]);
});

check("rowNodeKeysForUnitWithConcepts: a unit citing ONLY a non-concept activity → the direct rows (the else-branch in isolation)", () => {
  // uAct cites only aApprove (an activity, ∉ conceptByKey) → the non-concept/direct path; no branch context → all actions
  const m = buildCrlRevealMaps({ units: [{ id: "uAct", source: [{ displayRange: {} }], crl: [{ nodeKey: "aApprove" }] }] }, sharedStruct);
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("uAct", m).sort(), ["w0a0", "w1a0"]);
});

check("rowNodeKeysForUnitWithConcepts: a directly-cited concept row appears ONCE (dedup across the merged set)", () => {
  const m = buildCrlRevealMaps({ units: [{ id: "uC", source: [{ displayRange: {} }], crl: [{ nodeKey: "kContainer" }] }] }, cStruct, cLayer);
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("uC", m).sort(), ["wC", "wC2"]);
});

check("rowNodeKeysForUnitWithConcepts: no conceptLayer → byte-identical to rowNodeKeysForUnit (back-compat)", () => {
  const m = buildCrlRevealMaps(correspondence, structure); // no cLayer → keys are non-concept → direct path
  for (const u of ["u1", "u2", "u5"]) assert.deepEqual(rowNodeKeysForUnitWithConcepts(u, m), rowNodeKeysForUnit(u, m));
});

check("conceptCrlAnchors: concept's own row + direct rows ∪ containment rows (the shared peek crl arm)", () => {
  const m = buildCrlRevealMaps(cCorr, cStruct, cLayer);
  assert.deepEqual(conceptCrlAnchors("kSub", m), ["kSub", "wC", "wC2"]); // own + (no direct) + containment whens
  assert.deepEqual(conceptCrlAnchors("kContainer", m), ["kContainer", "wC", "wC2"]); // own + direct rows (= containment, deduped)
});

check("conceptCrlAnchors: a concept on a row but NOT inventoried (∉ conceptByKey) still highlights its direct rows (no fact-peek regression)", () => {
  const m = buildCrlRevealMaps(correspondence, structure); // no conceptLayer → cA ∉ conceptByKey
  assert.deepEqual(conceptCrlAnchors("cA", m), ["cA", "when0"]); // rowsForConcept rescues the direct row; rowNodeKeysForConcept→[]
});

check("crlAnchorsForUnits (the unit→crl / case→crl highlight): driving decisions (containment) FIRST, then applicable concept rows; unioned + deduped", () => {
  const m = buildCrlRevealMaps(cCorr, cStruct, cLayer);
  // uSub cites nested kSub → decisions [wC, wC2] (via containment) THEN the concept row [kSub]
  assert.deepEqual(crlAnchorsForUnits(["uSub"], m), ["wC", "wC2", "kSub"]);
  // unioned over a case's units (here the same unit twice) → deduped, order stable (decisions before concepts)
  assert.deepEqual(crlAnchorsForUnits(["uSub", "uSub"], m), ["wC", "wC2", "kSub"]);
  assert.deepEqual(crlAnchorsForUnits([], m), []);
});

check("crlAnchorsForUnits: a case SPANNING two branches → each unit's rows scoped to ITS branch (no cross-bleed) + both concepts", () => {
  const m = buildCrlRevealMaps(sharedCorr, sharedStruct, [{ nodeKey: "cCrohn", definitionRefs: [] }, { nodeKey: "cUC", definitionRefs: [] }]);
  // uCrohn (Crohn branch) + uUC (UC branch), each ALSO citing the shared aApprove → only the in-branch action survives per unit
  assert.deepEqual(crlAnchorsForUnits(["uCrohn", "uUC"], m).sort(), ["cCrohn", "cUC", "w0", "w0a0", "w1", "w1a0"]);
});

console.log(`\ncrlRevealMaps.test: ${pass} checks passed`);
