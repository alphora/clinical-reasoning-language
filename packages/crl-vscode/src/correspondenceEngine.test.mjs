// Unit tests for the cockpit navigator ENGINE (#156 C2a): the pure reducer. vscode-free → esbuild-bundle-then-import.
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";
import { resolve } from "node:path";

const { reduce, initialState, navigatorItems, shouldReflectNavigatorSelection } = await load("correspondenceEngine.ts");

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};

const step = (unitId) => ({ unitId, label: unitId, source: [], secondaryCrl: [], cel: [], unresolved: { source: [], crl: [], cel: [] }, findingIds: [] });
const idx = (unitIds, sourceCycleIds, crlNav = [], celNav = []) => ({ version: 1, anchorFilePath: "/a.txt", steps: unitIds.map(step), sourceCycleIds, crlNav, celNav });
const seeded = (unitIds, cycleIds = unitIds) => reduce(initialState(), { type: "setInputs", index: idx(unitIds, cycleIds) }).state;
const sel = (unitId) => ({ primary: "source", unitId });
const crlNav = (...keys) => keys.map((k) => ({ nodeKey: k, label: k }));
const seededCrl = (keys) => reduce(reduce(initialState(), { type: "setInputs", index: idx([], [], crlNav(...keys)) }).state, { type: "setPrimary", primary: "crl" }).state;
const celNav = (...ids) => ids.map((c) => ({ caseId: c, label: c }));
const seededCel = (ids) => reduce(reduce(initialState(), { type: "setInputs", index: idx([], [], [], celNav(...ids)) }).state, { type: "setPrimary", primary: "cel" }).state;

check("select → a reveal for ALL visible panes (pane-agnostic, incl. crl/cel + the opt-in tree/questionnaire), targeting the unit", () => {
  const r = reduce(seeded(["u1", "u2", "u3"]), { type: "select", selection: sel("u2") });
  // #177 slice 3: questionnaire joined the visibility-eligible fan-out set (like tree — the shell gates opening on paneOrder).
  assert.deepEqual(r.effects.map((e) => e.pane).sort(), ["cel", "crl", "questionnaire", "source", "tree", "worklist"]);
  assert.ok(r.effects.every((e) => e.type === "reveal" && e.target.kind === "unit" && e.target.id === "u2"));
});

check("tree is a reveal target but NOT a navigable primary: initial visibility incl. tree; reveal fan-out incl. tree", () => {
  assert.equal(initialState().paneVisibility.tree, true); // visibility-eligible (the shell still gates opening on paneOrder)
  // a select fans a reveal out to tree, and next/prev does too — but the CYCLE stays 3-valued (asserted below)
  assert.ok(reduce(seeded(["u1"]), { type: "select", selection: sel("u1") }).effects.some((e) => e.pane === "tree"));
});

check("next/prev cycles sourceCycleIds + wraps; emits a tree reveal but the cycle space stays the 3 primaries", () => {
  let s = seeded(["u1", "u2", "u3"]);
  const r = reduce(s, { type: "next" });
  assert.equal(r.state.selection.unitId, "u1");
  assert.ok(r.effects.some((e) => e.pane === "tree" && e.target.id === "u1")); // tree gets the reveal
  s = r.state;
  s = reduce(s, { type: "next" }).state; assert.equal(s.selection.unitId, "u2");
  s = reduce(s, { type: "prev" }).state; assert.equal(s.selection.unitId, "u1");
  s = reduce(s, { type: "prev" }).state; assert.equal(s.selection.unitId, "u3"); // wrap (cycle never visits a "tree" id)
});

check("next skips source-less steps (sourceCycleIds drives, not all steps)", () => {
  let s = seeded(["u1", "u2", "u3"], ["u1", "u3"]); // u2 is source-less
  s = reduce(s, { type: "next" }).state; assert.equal(s.selection.unitId, "u1");
  s = reduce(s, { type: "next" }).state; assert.equal(s.selection.unitId, "u3");
});

check("setPaneVisible suppresses that pane's reveal; re-showing with a selection reveals it", () => {
  let s = reduce(seeded(["u1", "u2"]), { type: "setPaneVisible", pane: "cel", visible: false }).state;
  const r = reduce(s, { type: "select", selection: sel("u1") });
  assert.deepEqual(r.effects.map((e) => e.pane).sort(), ["crl", "questionnaire", "source", "tree", "worklist"]); // cel hidden; tree/questionnaire/worklist still revealed
  const r2 = reduce(r.state, { type: "setPaneVisible", pane: "cel", visible: true });
  assert.deepEqual(r2.effects.map((e) => e.pane), ["cel"]);
  assert.equal(r2.effects[0].target.id, "u1");
});

check("setInputs keeps + re-reveals a surviving selection; clears a gone one", () => {
  const s = reduce(seeded(["u1", "u2", "u3"]), { type: "select", selection: sel("u2") }).state;
  const kept = reduce(s, { type: "setInputs", index: idx(["u2", "u4"], ["u2", "u4"]) });
  assert.deepEqual(kept.state.selection, sel("u2"));
  assert.equal(kept.effects.length, 6); // re-reveal all 6 visible panes (source/crl/cel/tree/questionnaire/worklist)
  const gone = reduce(s, { type: "setInputs", index: idx(["u5"], ["u5"]) });
  assert.equal(gone.state.selection, undefined);
  assert.deepEqual(gone.effects, []);
});

check("setPrimary changes primary + clears selection, leaves paneVisibility untouched", () => {
  const s = reduce(seeded(["u1"]), { type: "select", selection: sel("u1") }).state;
  const r = reduce(s, { type: "setPrimary", primary: "crl" });
  assert.equal(r.state.primary, "crl");
  assert.equal(r.state.selection, undefined);
  assert.deepEqual(r.state.paneVisibility, s.paneVisibility);
});

check("effects are SEMANTIC only (pane + {kind,id}; no DOM/column/key)", () => {
  const r = reduce(seeded(["u1"]), { type: "select", selection: sel("u1") });
  for (const e of r.effects) {
    assert.deepEqual(Object.keys(e).sort(), ["pane", "target", "type"]);
    assert.deepEqual(Object.keys(e.target).sort(), ["id", "kind"]);
  }
});

check("navigatorItems lists source-bearing steps in cycle order (skips source-less)", () => {
  const s = seeded(["u1", "u2", "u3"], ["u1", "u3"]); // u2 source-less
  assert.deepEqual(navigatorItems(s).map((i) => i.id), ["u1", "u3"]);
  assert.deepEqual(navigatorItems(s)[0].selection, sel("u1"));
  assert.deepEqual(navigatorItems(initialState()), []); // no index → empty
});

check("crl primary: navigatorItems lists crlNav; next/prev cycles crl nodeKeys + wraps", () => {
  let s = seededCrl(["n1", "n2", "n3"]);
  assert.deepEqual(navigatorItems(s).map((i) => i.id), ["n1", "n2", "n3"]);
  assert.deepEqual(navigatorItems(s)[0].selection, { primary: "crl", nodeKey: "n1" });
  s = reduce(s, { type: "next" }).state; assert.deepEqual(s.selection, { primary: "crl", nodeKey: "n1" });
  s = reduce(s, { type: "next" }).state; assert.equal(s.selection.nodeKey, "n2");
  s = reduce(s, { type: "prev" }).state; assert.equal(s.selection.nodeKey, "n1");
  s = reduce(s, { type: "prev" }).state; assert.equal(s.selection.nodeKey, "n3"); // wrap
});

check("crl primary: select → a crlNode reveal for ALL visible panes", () => {
  const r = reduce(seededCrl(["n1"]), { type: "select", selection: { primary: "crl", nodeKey: "n1" } });
  assert.deepEqual(r.effects.map((e) => e.pane).sort(), ["cel", "crl", "questionnaire", "source", "tree", "worklist"]);
  assert.ok(r.effects.every((e) => e.target.kind === "crlNode" && e.target.id === "n1"));
});

check("setInputs keeps a surviving crl selection (+re-reveal), clears a vanished one", () => {
  const s = reduce(seededCrl(["n1", "n2"]), { type: "select", selection: { primary: "crl", nodeKey: "n2" } }).state;
  const kept = reduce(s, { type: "setInputs", index: idx([], [], crlNav("n2", "n3")) });
  assert.deepEqual(kept.state.selection, { primary: "crl", nodeKey: "n2" });
  assert.equal(kept.effects.length, 6);
  const gone = reduce(s, { type: "setInputs", index: idx([], [], crlNav("n9")) });
  assert.equal(gone.state.selection, undefined);
  assert.deepEqual(gone.effects, []);
});

check("cel primary: navigatorItems lists celNav; next/prev cycles caseIds + wraps", () => {
  let s = seededCel(["c1", "c2", "c3"]);
  assert.deepEqual(navigatorItems(s).map((i) => i.id), ["c1", "c2", "c3"]);
  assert.deepEqual(navigatorItems(s)[0].selection, { primary: "cel", caseId: "c1" });
  s = reduce(s, { type: "next" }).state; assert.deepEqual(s.selection, { primary: "cel", caseId: "c1" });
  s = reduce(s, { type: "next" }).state; assert.equal(s.selection.caseId, "c2");
  s = reduce(s, { type: "prev" }).state; assert.equal(s.selection.caseId, "c1");
  s = reduce(s, { type: "prev" }).state; assert.equal(s.selection.caseId, "c3"); // wrap
});

check("cel primary: select → a celCase reveal for ALL visible panes", () => {
  const r = reduce(seededCel(["c1"]), { type: "select", selection: { primary: "cel", caseId: "c1" } });
  assert.deepEqual(r.effects.map((e) => e.pane).sort(), ["cel", "crl", "questionnaire", "source", "tree", "worklist"]);
  assert.ok(r.effects.every((e) => e.target.kind === "celCase" && e.target.id === "c1"));
});

check("setInputs keeps a surviving cel selection, clears a vanished one", () => {
  const s = reduce(seededCel(["c1", "c2"]), { type: "select", selection: { primary: "cel", caseId: "c2" } }).state;
  assert.deepEqual(reduce(s, { type: "setInputs", index: idx([], [], [], celNav("c2", "c3")) }).state.selection, { primary: "cel", caseId: "c2" });
  assert.equal(reduce(s, { type: "setInputs", index: idx([], [], [], celNav("c9")) }).state.selection, undefined);
});

check("select is ignored when it doesn't resolve OR mismatches the current primary", () => {
  const s = seeded(["u1", "u2"]); // source primary
  assert.deepEqual(reduce(s, { type: "select", selection: sel("nope") }).effects, []); // unresolved → no-op
  assert.equal(reduce(s, { type: "select", selection: sel("nope") }).state.selection, undefined);
  // a crl selection while source-primary → ignored (wrong primary space)
  const r = reduce(s, { type: "select", selection: { primary: "crl", nodeKey: "n1" } });
  assert.deepEqual(r.effects, []);
  assert.equal(r.state.selection, undefined);
});

check("source selection survives setInputs only if still source-BEARING (not just in steps)", () => {
  const s = reduce(seeded(["u1", "u2"]), { type: "select", selection: sel("u1") }).state;
  const r = reduce(s, { type: "setInputs", index: idx(["u1", "u2"], ["u2"]) }); // u1 in steps but dropped from cycle
  assert.equal(r.state.selection, undefined);
});

check("shouldReflectNavigatorSelection: cockpit always reveals; MV only when navigator visible", () => {
  // cockpit mode: the flyout IS the navigation → always reveal, hidden or not.
  assert.equal(shouldReflectNavigatorSelection("cockpit", true), true);
  assert.equal(shouldReflectNavigatorSelection("cockpit", false), true);
  // MV mode: the worklist is the navigation → reveal ONLY when the flyout is already open,
  // so a worklist click never re-opens a hidden navigator. Re-sync on visible→true covers stale.
  assert.equal(shouldReflectNavigatorSelection("medical-validation", true), true);
  assert.equal(shouldReflectNavigatorSelection("medical-validation", false), false);
});

console.log(`\ncorrespondenceEngine.test: ${pass} checks passed`);
