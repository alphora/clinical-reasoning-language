import assert from "node:assert/strict";

import * as revealMapsImpl from "../revealMaps";
import {
  buildCrlRevealMaps,
  rowNodeKeysForUnit,
  rowNodeKeysForUnitWithConcepts,
  conceptCrlAnchors,
  crlAnchorsForUnits,
  unitsForRow,
  caseIdsForUnit,
  unitsForCase,
  caseIdsForNode,
  unitsForConcept,
  rowsForConcept,
  conceptKeysForUnit,
  conceptKeysForNode,
  unitsForRowAll,
  unitNumbersForRow,
  unitNumbersForCase,
  conceptNodesForUnit,
  unitsForConceptNode,
  rowNodeKeysForConcept,
  conceptNodesForRow,
} from "../revealMaps";
import * as provenanceIndex from "../index";
import type { CorrespondenceModel, CrlConceptNode, CrlDecisionStructure } from "../index";

// Cross-pane reveal-maps unit tests (#156 C2b-2 / #166) — MOVED here from crl-vscode when the implementation moved to
// crl/provenance (#170). The fixtures + assertions are the known-good crl-vscode test, verbatim (check -> it). The loose
// fixtures (the .mjs relied on esbuild type-erasure) route their build call through the typed `build` cast helper.
const build = (corr: unknown, struct: unknown, layer?: unknown) =>
  buildCrlRevealMaps(corr as CorrespondenceModel, struct as CrlDecisionStructure[], layer as CrlConceptNode[] | undefined);

describe("revealMaps — cross-pane reveal maps (#156/#166)", () => {
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

  it("keyToRowNodeKeys maps a refKey (concept) → the row that references it; own key too", () => {
  const m = build(correspondence, structure);
  assert.deepEqual(m.keyToRowNodeKeys.get("cA"), ["when0"]); // concept A → the `when A` row
  assert.deepEqual(m.keyToRowNodeKeys.get("aX"), ["when0act0"]); // activity X → the recommend row
  assert.deepEqual(m.keyToRowNodeKeys.get("when0"), ["when0"]); // own nodeKey
  assert.deepEqual(m.keyToRowNodeKeys.get("dD"), ["dD"]); // decision root addressable
});

  it("keyToUnitIds is multi-valued (cover); unresolved crl ref NOT bridged; source-bearing needs displayRange", () => {
  const m = build(correspondence, structure);
  assert.deepEqual(m.keyToUnitIds.get("cA"), ["u1", "u3", "u4"]); // u5's cA is unresolved → excluded
  assert.deepEqual(m.keyToUnitIds.get("aX"), ["u2"]);
  assert.deepEqual([...m.sourceBearingUnits].sort(), ["u1", "u3", "u5"]); // u2 no source, u4 no resolved span
});

  it("rowNodeKeysForUnit: source unit → referencing CRL row; unresolved-crl unit → no rows", () => {
  const m = build(correspondence, structure);
  assert.deepEqual(rowNodeKeysForUnit("u1", m), ["when0"]); // u1→concept A→`when A` row
  assert.deepEqual(rowNodeKeysForUnit("u2", m), ["when0act0"]);
  assert.deepEqual(rowNodeKeysForUnit("u5", m), []); // u5's only crl ref is unresolved → bridges to nothing
});

  it("unitsForRow: a CRL click → SOURCE-BEARING candidates only (cover → multiple; u4 excluded)", () => {
  const m = build(correspondence, structure);
  // clicking `when A` → units citing cA = u1,u3,u4; u4 lacks a resolved span → filtered → quick-pick over u1,u3
  assert.deepEqual(unitsForRow("when0", m), ["u1", "u3"]);
});

  it("unitsForRow filters out source-less units (no-op, not a spurious quick-pick)", () => {
  const m = build(correspondence, structure);
  // clicking recommend X → unit u2 cites aX but has no source span → filtered → no candidates
  assert.deepEqual(unitsForRow("when0act0", m), []);
});

  it("unmapped row → no candidates (clean no-op)", () => {
  const m = build(correspondence, structure);
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

  it("context-scoping: a shared activity does NOT bleed across branches (the rx501 over-match)", () => {
  const m = build(sharedCorr, sharedStruct);
  // each unit cites its concept + the shared Approve activity; only the IN-BRANCH Approve is highlighted
  assert.deepEqual(rowNodeKeysForUnit("uCrohn", m).sort(), ["w0", "w0a0"]);
  assert.deepEqual(rowNodeKeysForUnit("uUC", m).sort(), ["w1", "w1a0"]);
});

  it("no branch context (unit cites only the shared activity) → all action matches (best effort)", () => {
  const m = build({ units: [{ id: "uA", source: [{ displayRange: {} }], crl: [{ nodeKey: "aApprove" }] }] }, sharedStruct);
  assert.deepEqual(rowNodeKeysForUnit("uA", m).sort(), ["w0a0", "w1a0"]);
});

  it("REVERSE scoping: clicking the shared Crohn's Approve selects only the Crohn's unit (no chooser)", () => {
  const m = build(sharedCorr, sharedStruct);
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

  it("caseIdsForUnit / unitsForCase (unit↔case, unfiltered; unresolved skipped)", () => {
  const m = build(celCorr, []);
  assert.deepEqual(caseIdsForUnit("u1", m), ["caseX"]);
  assert.deepEqual(unitsForCase("caseX", m), ["u1", "u2"]); // includes the source-less u2 (unfiltered)
  assert.deepEqual(caseIdsForUnit("u3", m), []); // its only cel ref was unresolved
  assert.deepEqual(unitsForCase("caseY", m), []);
});

  it("caseIdsForNode: a CRL node → its units → their cases (unfiltered)", () => {
  const struct = [{ decision: "D", lib: "T", nodeKey: "dD", location: {}, children: [node("w0", "when", ["cCrohn"])] }];
  const m = build(celCorr, struct);
  // u1 cites cCrohn (→ row w0) AND caseX; clicking/selecting w0 reveals caseX
  assert.deepEqual(caseIdsForNode("w0", m), ["caseX"]);
});

// C2c-2 fact peek: thin concept→units/rows wrappers (NO branch-scoping; units source-bearing-filtered).
  it("unitsForConcept: concept key → source-bearing units only (thin, unfiltered by branch)", () => {
  const m = build(correspondence, structure);
  assert.deepEqual(unitsForConcept("cA", m), ["u1", "u3"]); // u4 cites cA but lacks a resolved span → filtered
  assert.deepEqual(unitsForConcept("nope", m), []);
});

  it("rowsForConcept: concept key → ALL referencing rows (thin Map.get, NO context-scoping)", () => {
  const m = build(correspondence, structure);
  assert.deepEqual(rowsForConcept("cA", m), ["when0"]);
  assert.deepEqual(rowsForConcept("aX", m), ["when0act0"]); // activity key too — caller's kind guard decides clickability
  assert.deepEqual(rowsForConcept("nope", m), []);
});

  it("rowsForConcept does NOT branch-scope a shared activity (unlike rowNodeKeysForUnit)", () => {
  const m = build(sharedCorr, sharedStruct);
  // a concept peek is a precise leaf identity → every referencing row corresponds (both branches' Approve rows)
  assert.deepEqual(rowsForConcept("aApprove", m).sort(), ["w0a0", "w1a0"]);
});

// C2c-2b reverse fact-highlight: the concept keys a selected unit/node references (to look up CEL fact spans).
  it("conceptKeysForUnit: the keys a unit cites; conceptKeysForNode: row nodeKey + refKeys", () => {
  const m = build(correspondence, structure);
  assert.deepEqual(conceptKeysForUnit("u1", m), ["cA"]); // u1 cites concept A
  assert.deepEqual(conceptKeysForNode("when0", m).sort(), ["cA", "when0"]); // own key + the concept it branches on
  assert.deepEqual(conceptKeysForNode("when0act0", m).sort(), ["aX", "when0act0"]); // action: own key + activity ref
  assert.deepEqual(conceptKeysForUnit("nope", m), []);
  assert.deepEqual(conceptKeysForNode("nope", m), []);
});

// #163 at-rest key: unitsForRowAll (branch-scoped, NO source-bearing filter) + the number helpers.
  it("unitsForRowAll INCLUDES source-less units (unlike unitsForRow which filters them)", () => {
  const m = build(correspondence, structure);
  assert.deepEqual(unitsForRow("when0act0", m), []); // u2 cites aX but is source-less → filtered
  assert.deepEqual(unitsForRowAll("when0act0", m), ["u2"]); // at-rest key still numbers it
});

  it("unitsForRowAll branch-scopes a shared activity (the rx501 over-tag), source-less included", () => {
  // uCrohn/uUC both source-bearing here; the point is the branch-scoping still applies in the no-filter variant
  const m = build(sharedCorr, sharedStruct);
  assert.deepEqual(unitsForRowAll("w0a0", m).sort(), ["uCrohn"]);
  assert.deepEqual(unitsForRowAll("w1a0", m).sort(), ["uUC"]);
});

  it("unitNumbersForRow: branch-scoped units → sorted numbers, filtered to numbered units", () => {
  const m = build(correspondence, structure);
  const unitNumber = new Map([["u1", 1], ["u3", 2], ["u4", 3]]);
  assert.deepEqual(unitNumbersForRow("when0", m, unitNumber), [1, 2, 3]); // cA cited by u1,u3,u4
  assert.deepEqual(unitNumbersForRow("when0", m, new Map([["u1", 1], ["u3", 2]])), [1, 2]); // u4 unnumbered → dropped
  assert.deepEqual(unitNumbersForRow("oth", m, unitNumber), []); // unmapped row
});

  it("unitNumbersForCase: case → its units' numbers (unscoped), sorted + deduped", () => {
  const m = build(celCorr, []);
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

  it("rowNodeKeysForConcept: a deeply-NESTED sub-concept (2 hops) resolves UP to the containing `when` row(s)", () => {
  const m = build(cCorr, cStruct, cLayer);
  assert.deepEqual(rowNodeKeysForConcept("kSub", m).sort(), ["wC", "wC2"]); // Sub → Mid → Container → its whens
  assert.deepEqual(rowNodeKeysForConcept("kMid", m).sort(), ["wC", "wC2"]); // 1 hop
  assert.deepEqual(rowNodeKeysForConcept("kContainer", m).sort(), ["wC", "wC2"]); // direct
  assert.deepEqual(rowNodeKeysForConcept("aX", m), []); // not a concept → []
});

  it("rowNodeKeysForConcept: a GUARD concept resolves to the guarded ACTION row (an applicable decision too)", () => {
  const m = build(cCorr, cStruct, cLayer);
  assert.deepEqual(rowNodeKeysForConcept("kGuard", m), ["wCa"]); // guard concept → its action row
});

  it("conceptNodesForRow: a `when` surfaces its concept + transitively-contained sub-concepts; an action shows its guard, drops the activity", () => {
  const m = build(cCorr, cStruct, cLayer);
  assert.deepEqual(conceptNodesForRow("wC", m), ["kContainer", "kMid", "kSub"]); // direct + 2-hop contained
  assert.deepEqual(conceptNodesForRow("wCa", m), ["kGuard"]); // guard concept kept; activity aX dropped
});

  it("conceptNodesForUnit / unitsForConceptNode", () => {
  const m = build(cCorr, cStruct, cLayer);
  assert.deepEqual(conceptNodesForUnit("uSub", m), ["kSub"]); // the cited concept node
  assert.deepEqual(unitsForConceptNode("kSub", m), ["uSub"]);
  assert.deepEqual(conceptNodesForUnit("nope", m), []);
});

  it("no conceptLayer (default []) → concept maps empty, concept helpers no-op (back-compat)", () => {
  const m = build(cCorr, cStruct);
  assert.equal(m.conceptByKey.size, 0);
  assert.deepEqual(rowNodeKeysForConcept("kSub", m), []);
});

// #166 Slice 3b: the merged single-scope resolver (rowNodeKeysForUnitWithConcepts) + the shared conceptCrlAnchors.
// (The DIRECT resolver rowNodeKeysForUnit is unchanged — its behavior is locked by the lines 60-108 tests above, which
// are also the byte-equivalence guard for the scopeRows extraction.)
  it("rowNodeKeysForUnitWithConcepts: a unit citing a NESTED sub-concept lights up the driving `when`(s) (direct resolver finds none)", () => {
  const m = build(cCorr, cStruct, cLayer);
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

  it("rowNodeKeysForUnitWithConcepts: nested sub-concept supplies branch context → shared activity NOT re-introduced across branches (single-scope)", () => {
  const m = build(mixCorr, mixStruct, mixLayer);
  // kSub → kContainerA → wA (only); aApprove is on wAa AND wBa, but only the in-branch (wA) action survives the ONE scope pass
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("uMix", m).sort(), ["wA", "wAa"]);
  // contrast: the DIRECT resolver has no branch context (kSub on no row; aApprove with no when) → all actions (best effort)
  assert.deepEqual(rowNodeKeysForUnit("uMix", m).sort(), ["wAa", "wBa"]);
});

  it("rowNodeKeysForUnitWithConcepts: a unit citing ONLY a non-concept activity → the direct rows (the else-branch in isolation)", () => {
  // uAct cites only aApprove (an activity, ∉ conceptByKey) → the non-concept/direct path; no branch context → all actions
  const m = build({ units: [{ id: "uAct", source: [{ displayRange: {} }], crl: [{ nodeKey: "aApprove" }] }] }, sharedStruct);
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("uAct", m).sort(), ["w0a0", "w1a0"]);
});

// rx501-147 regression: a SHARED sub-concept "Adult" is `defined as` part of BOTH indication concepts (Crohn + UC), each
// on its own `when`. A unit citing Adult + a Crohn-specific concept must light ONLY the Crohn branch (the ambiguous shared
// Adult must not drag in the UC branch). The containment analog of the disc-117 shared-activity over-match.
const dualStruct = [{
  decision: "D", lib: "T", nodeKey: "dD", location: {},
  children: [
    { nodeKey: "wCrohn", nodeId: "when[0]", decision: "D", lib: "T", kind: "when", label: "when Crohn IM", refKeys: ["kCrohnIM"], location: {},
      children: [{ nodeKey: "wCrohnA", nodeId: "when[0]/a0", decision: "D", lib: "T", kind: "action", label: "Approve", refKeys: ["aApprove"], location: {}, children: [] }] },
    { nodeKey: "wUC", nodeId: "when[1]", decision: "D", lib: "T", kind: "when", label: "when UC IM", refKeys: ["kUCIM"], location: {},
      children: [{ nodeKey: "wUCA", nodeId: "when[1]/a0", decision: "D", lib: "T", kind: "action", label: "Approve", refKeys: ["aApprove"], location: {}, children: [] }] },
  ],
}];
const dualLayer = [
  { nodeKey: "kCrohnIM", definitionRefs: ["kAdult", "kModCrohn"] }, // Crohn IM = Adult + ModCrohn
  { nodeKey: "kUCIM", definitionRefs: ["kAdult", "kModUC"] },       // UC IM = Adult + ModUC  (Adult SHARED)
  { nodeKey: "kAdult", definitionRefs: [] },
  { nodeKey: "kModCrohn", definitionRefs: [] },
  { nodeKey: "kModUC", definitionRefs: [] },
];

  it("rowNodeKeysForUnitWithConcepts: a SHARED sub-concept does NOT drag in the sibling branch when a confident signal exists (rx501-147)", () => {
  const m = build({ units: [{ id: "u1", source: [{ displayRange: {} }], crl: [{ nodeKey: "kCrohnIM" }, { nodeKey: "kAdult" }, { nodeKey: "kModCrohn" }, { nodeKey: "aApprove" }] }] }, dualStruct, dualLayer);
  // confident context = {wCrohn} (kCrohnIM direct on it + kModCrohn → only kCrohnIM); kAdult → BOTH IMs = ambiguous → no
  // context; the shared aApprove scopes to wCrohn. The UC branch (wUC/wUCA) must NOT appear.
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("u1", m).sort(), ["wCrohn", "wCrohnA"]);
});

  it("rowNodeKeysForUnitWithConcepts: a unit citing ONLY a shared/ambiguous sub-concept → best-effort BOTH branches (no confident context)", () => {
  const m = build({ units: [{ id: "uAdult", source: [{ displayRange: {} }], crl: [{ nodeKey: "kAdult" }] }] }, dualStruct, dualLayer);
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("uAdult", m).sort(), ["wCrohn", "wUC"]); // genuinely ambiguous → both
});

  it("rowNodeKeysForUnitWithConcepts: TWO confident single-branch signals → BOTH branches kept (not falsely pruned)", () => {
  // u cites kCrohnIM (direct → wCrohn) + kModUC (→ only kUCIM → wUC, single → confident). Both confident → both kept.
  const m = build({ units: [{ id: "uBoth", source: [{ displayRange: {} }], crl: [{ nodeKey: "kCrohnIM" }, { nodeKey: "kModUC" }] }] }, dualStruct, dualLayer);
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("uBoth", m).sort(), ["wCrohn", "wUC"]);
});

// guard concept whose OWN row is an action under the DROPPED sibling branch → pruned by the action ancestry scope.
const guardLayer = [...dualLayer, { nodeKey: "kUcGuard", definitionRefs: [] }];
const guardStruct = [{
  decision: "D", lib: "T", nodeKey: "dD", location: {},
  children: [
    dualStruct[0].children[0], // wCrohn + wCrohnA
    { nodeKey: "wUC", nodeId: "when[1]", decision: "D", lib: "T", kind: "when", label: "when UC IM", refKeys: ["kUCIM"], location: {},
      children: [{ nodeKey: "wUCA", nodeId: "when[1]/a0", decision: "D", lib: "T", kind: "action", label: "Approve", refKeys: ["aApprove", "kUcGuard"], location: {}, children: [] }] },
  ],
}];

  it("rowNodeKeysForUnitWithConcepts: a guard concept whose action is under the DROPPED sibling branch is pruned (no leak)", () => {
  // u cites kCrohnIM (confident → wCrohn) + kUcGuard (own row = wUCA, an action under the UC branch). wUCA must be pruned.
  const m = build({ units: [{ id: "uG", source: [{ displayRange: {} }], crl: [{ nodeKey: "kCrohnIM" }, { nodeKey: "kUcGuard" }] }] }, guardStruct, guardLayer);
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("uG", m).sort(), ["wCrohn"]); // wUCA dropped (not under a context branch)
});

  it("rowNodeKeysForUnitWithConcepts: conceptLayer present but ALL signals direct → byte-identical to rowNodeKeysForUnit", () => {
  // kCrohnIM is inventoried AND directly on wCrohn; aApprove shared. The WithConcepts context path must equal the direct path.
  const m = build({ units: [{ id: "uD", source: [{ displayRange: {} }], crl: [{ nodeKey: "kCrohnIM" }, { nodeKey: "aApprove" }] }] }, dualStruct, dualLayer);
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("uD", m), rowNodeKeysForUnit("uD", m));
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("uD", m).sort(), ["wCrohn", "wCrohnA"]);
});

  it("rowNodeKeysForUnitWithConcepts: a directly-cited concept row appears ONCE (dedup across the merged set)", () => {
  const m = build({ units: [{ id: "uC", source: [{ displayRange: {} }], crl: [{ nodeKey: "kContainer" }] }] }, cStruct, cLayer);
  assert.deepEqual(rowNodeKeysForUnitWithConcepts("uC", m).sort(), ["wC", "wC2"]);
});

  it("rowNodeKeysForUnitWithConcepts: no conceptLayer → byte-identical to rowNodeKeysForUnit (back-compat)", () => {
  const m = build(correspondence, structure); // no cLayer → keys are non-concept → direct path
  for (const u of ["u1", "u2", "u5"]) assert.deepEqual(rowNodeKeysForUnitWithConcepts(u, m), rowNodeKeysForUnit(u, m));
});

  it("conceptCrlAnchors: concept's own row + direct rows ∪ containment rows (the shared peek crl arm)", () => {
  const m = build(cCorr, cStruct, cLayer);
  assert.deepEqual(conceptCrlAnchors("kSub", m), ["kSub", "wC", "wC2"]); // own + (no direct) + containment whens
  assert.deepEqual(conceptCrlAnchors("kContainer", m), ["kContainer", "wC", "wC2"]); // own + direct rows (= containment, deduped)
});

  it("conceptCrlAnchors: a concept on a row but NOT inventoried (∉ conceptByKey) still highlights its direct rows (no fact-peek regression)", () => {
  const m = build(correspondence, structure); // no conceptLayer → cA ∉ conceptByKey
  assert.deepEqual(conceptCrlAnchors("cA", m), ["cA", "when0"]); // rowsForConcept rescues the direct row; rowNodeKeysForConcept→[]
});

  it("crlAnchorsForUnits (the unit→crl / case→crl highlight): driving decisions (containment) FIRST, then applicable concept rows; unioned + deduped", () => {
  const m = build(cCorr, cStruct, cLayer);
  // uSub cites nested kSub → decisions [wC, wC2] (via containment) THEN the concept row [kSub]
  assert.deepEqual(crlAnchorsForUnits(["uSub"], m), ["wC", "wC2", "kSub"]);
  // unioned over a case's units (here the same unit twice) → deduped, order stable (decisions before concepts)
  assert.deepEqual(crlAnchorsForUnits(["uSub", "uSub"], m), ["wC", "wC2", "kSub"]);
  assert.deepEqual(crlAnchorsForUnits([], m), []);
});

  it("crlAnchorsForUnits: a case SPANNING two branches → each unit's rows scoped to ITS branch (no cross-bleed) + both concepts", () => {
  const m = build(sharedCorr, sharedStruct, [{ nodeKey: "cCrohn", definitionRefs: [] }, { nodeKey: "cUC", definitionRefs: [] }]);
  // uCrohn (Crohn branch) + uUC (UC branch), each ALSO citing the shared aApprove → only the in-branch action survives per unit
  assert.deepEqual(crlAnchorsForUnits(["uCrohn", "uUC"], m).sort(), ["cCrohn", "cUC", "w0", "w0a0", "w1", "w1a0"]);
});


  // #170 drift guard: the 3 hand-synced export surfaces (revealMaps -> provenance/index -> crl/index -> the shim) cannot
  // silently diverge — every revealMaps RUNTIME export must be re-exported by provenance/index.
  it("PARITY: every revealMaps function export is re-exported by provenance/index", () => {
    for (const name of Object.keys(revealMapsImpl)) assert.equal(name in provenanceIndex, true, `missing re-export: ${name}`);
  });
});
