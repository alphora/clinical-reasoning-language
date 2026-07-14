// #212 flags→MV slice 1 — the anchor resolver. Pure (type-only crl import via occurrenceKey), so the harness loads it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { resolveAnchor } = await load("mvFlagAnchor.ts");

// A minimal decision structure with ONE recommend-activity leaf. occurrencesOf walks children; the leaf's occurrence key is
// `<nodeId>~<signature>` where signature = `(top)→<lib>:<activity>` (refKeys[0] is the JSON refKey tuple).
const leaf = { kind: "action", actionKind: "recommend-activity", nodeId: "action[0]", nodeKey: "nk1", refKeys: ['["L","activity","DoThing",null]'], children: [] };
const dec = { decision: "D", lib: "L", children: [leaf] };
const LIVE_KEY = "action[0]~(top)→L:DoThing"; // matches signatureFor(leaf, [])
const ctx = { decisions: [dec], concepts: [{ name: "C", lib: "L", id: "id1" }], libraries: ["L"] };
const anchor = (over) => ({ scope: "decision", name: "D", library: "L", label: "the node", ...over });

test("ctx undefined (unparseable source) → error, NOT orphaned (gate must block, not read as a benign completed change)", () => {
  assert.deepEqual(resolveAnchor(anchor({ occurrenceKey: LIVE_KEY }), undefined), {
    state: "error", reason: "CRL structure unavailable (source unparseable or not indexed)",
  });
});

test("occurrence: placed → live (carries ref + nodeKey for navigation)", () => {
  const r = resolveAnchor(anchor({ occurrenceKey: LIVE_KEY }), ctx);
  assert.equal(r.state, "live");
  assert.equal(r.nodeKey, "nk1");
  assert.equal(r.ref.nodeId, "action[0]");
});

test("occurrence: MOVED (nodeId resolves, signature changed = a mis-home) → orphaned, NEVER live (no wrong-node follow)", () => {
  assert.deepEqual(resolveAnchor(anchor({ occurrenceKey: "action[0]~(top)→L:SOMETHINGELSE" }), ctx), { state: "orphaned" });
});

test("occurrence: orphan (nodeId gone) → orphaned", () => {
  assert.deepEqual(resolveAnchor(anchor({ occurrenceKey: "when[9]~whatever" }), ctx), { state: "orphaned" });
});

test("decision-scope (no occurrenceKey): found → live; missing library → orphaned; not found → orphaned", () => {
  assert.equal(resolveAnchor(anchor({}), ctx).state, "live");
  assert.deepEqual(resolveAnchor(anchor({ library: undefined }), ctx), { state: "orphaned" }, "library required");
  assert.deepEqual(resolveAnchor(anchor({ name: "Nope" }), ctx), { state: "orphaned" });
});

test("decision-scope: a multi-match (post-rename collision) → orphaned, never a guessed pick", () => {
  const dupCtx = { ...ctx, decisions: [dec, { decision: "D", lib: "L", children: [] }] };
  assert.deepEqual(resolveAnchor(anchor({}), dupCtx), { state: "orphaned" });
});

test("library-scope: present → live; absent → orphaned", () => {
  assert.equal(resolveAnchor({ scope: "library", name: "L", label: "x" }, ctx).state, "live");
  assert.deepEqual(resolveAnchor({ scope: "library", name: "Other", label: "x" }, ctx), { state: "orphaned" });
});

test("concept-scope: (name, library) match → live; name-alone (no library) → orphaned; not found → orphaned", () => {
  assert.equal(resolveAnchor({ scope: "concept", name: "C", library: "L", label: "x" }, ctx).state, "live");
  assert.deepEqual(resolveAnchor({ scope: "concept", name: "C", label: "x" }, ctx), { state: "orphaned" }, "no library → orphaned");
  assert.deepEqual(resolveAnchor({ scope: "concept", name: "C", library: "WrongLib", label: "x" }, ctx), { state: "orphaned" });
});

test("concept-scope: entityId (@id) wins — rename-safe (matches even when name/library differ)", () => {
  const r = resolveAnchor({ scope: "concept", name: "RenamedAway", library: "AlsoMoved", entityId: "id1", label: "x" }, ctx);
  assert.equal(r.state, "live");
});

test("concept-scope: an AMBIGUOUS @id (>1 match) → orphaned, never guessed, never a fallback to the weaker name match", () => {
  const dupIdCtx = { ...ctx, concepts: [{ name: "C", lib: "L", id: "id1" }, { name: "C2", lib: "L2", id: "id1" }] };
  // name+library WOULD have matched the first concept, but the ambiguous id must short-circuit to orphaned.
  assert.deepEqual(resolveAnchor({ scope: "concept", name: "C", library: "L", entityId: "id1", label: "x" }, dupIdCtx), { state: "orphaned" });
});

test("concept-scope: an @id that no longer exists falls back to (name, library) — deleted/recreated/older records still resolve", () => {
  assert.equal(resolveAnchor({ scope: "concept", name: "C", library: "L", entityId: "goneId", label: "x" }, ctx).state, "live");
});

test("concept-scope: a (name, library) multi-match → orphaned (post-rename collision, never a guessed pick)", () => {
  const dupCtx = { ...ctx, concepts: [{ name: "C", lib: "L" }, { name: "C", lib: "L" }] };
  assert.deepEqual(resolveAnchor({ scope: "concept", name: "C", library: "L", label: "x" }, dupCtx), { state: "orphaned" });
});

test("partial ctx (an array not yet populated) → error, NOT a crash and NOT a benign orphan (gate must block on unknown structure)", () => {
  for (const partial of [
    { decisions: undefined, concepts: [], libraries: [] },
    { decisions: [], concepts: undefined, libraries: [] },
    { decisions: [], concepts: [], libraries: undefined },
  ]) {
    const r = resolveAnchor(anchor({}), partial);
    assert.equal(r.state, "error", "a missing array → error");
  }
});

console.log("mvFlagAnchor.test: ok");
