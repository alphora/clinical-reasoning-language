// #203 GAP 3 — occurrence-key addressing: nodeId address + signature fingerprint; orphan/moved detection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { occurrencesOf, occurrenceByNodeKey, occurrenceKeyValue, parseOccurrenceKey, resolveOccurrence, isOccurrenceNode, isOccurrenceKey } = await load("occurrenceKey.ts");

// Minimal CrlStructureNode factory. refKeys carry the indexer's `["lib","kind","name",null]` tuple (the SIGNATURE reads
// the REFERENCED node's lib from here, NOT the decision lib). A decision: when "Adult" → recommend "Approve"; otherwise → "Deny".
const rk = (lib, kind, name) => JSON.stringify([lib, kind, name, null]);
const nd = (nodeId, kind, label, opts = {}) => ({ nodeKey: `k:${nodeId}`, nodeId, decision: "D", lib: "Pol", kind, label, actionKind: opts.actionKind, refKeys: opts.refKeys ?? [], location: {}, children: opts.children ?? [] });
const dec = () => ({
  decision: "D", lib: "Pol", nodeKey: "k:D", location: {},
  children: [
    nd("when[0]", "when", "when Adult", { refKeys: [rk("Pol", "concept", "Adult")], children: [nd("when[0]/action[0]", "action", "Approve", { actionKind: "recommend-activity", refKeys: [rk("Pol", "activity", "Approve")] })] }),
    nd("otherwise", "otherwise", "otherwise", { children: [nd("otherwise/action[0]", "action", "Deny", { actionKind: "recommend-activity", refKeys: [rk("Pol", "activity", "Deny")] })] }),
  ],
});

test("occurrencesOf: the when-condition + the two recommend leaves, with LIBRARY-QUALIFIED signatures (from refKeys, not the decision lib)", () => {
  const occ = occurrencesOf(dec());
  const byId = Object.fromEntries(occ.map((o) => [o.nodeId, o.signature]));
  assert.equal(byId["when[0]"], "Pol:Adult"); // condition — the concept's OWN lib:name
  assert.equal(byId["when[0]/action[0]"], "Pol:Adult→Pol:Approve"); // leaf carries its controlling guard concept + activity
  assert.equal(byId["otherwise/action[0]"], "otherwise→Pol:Deny"); // otherwise leaf
  assert.equal(occ.length, 3); // NOT the otherwise interior node
  assert.equal(occ.find((o) => o.nodeId === "when[0]").isLeaf, false); // condition
  assert.equal(occ.find((o) => o.nodeId === "when[0]/action[0]").isLeaf, true); // leaf
});

test("nested branches: same nearest-guard + activity under DIFFERENT outer guards get DISTINCT signatures (full ancestor chain)", () => {
  // when A → [ when B → recommend X ];  when C → [ when B → recommend X ] — same inner guard B + activity X, different outer.
  const inner = (outer) => nd(`when[${outer}]`, "when", `when ${outer === 0 ? "A" : "C"}`, {
    refKeys: [rk("Pol", "concept", outer === 0 ? "A" : "C")],
    children: [nd(`when[${outer}]/when[0]`, "when", "when B", { refKeys: [rk("Pol", "concept", "B")], children: [nd(`when[${outer}]/when[0]/action[0]`, "action", "X", { actionKind: "recommend-activity", refKeys: [rk("Pol", "activity", "X")] })] })],
  });
  const d = { decision: "D", lib: "Pol", nodeKey: "k:D", location: {}, children: [inner(0), inner(1)] };
  const occ = occurrencesOf(d);
  const leaves = occ.filter((o) => o.isLeaf).map((o) => o.signature);
  assert.deepEqual(leaves.sort(), ["Pol:A/Pol:B→Pol:X", "Pol:C/Pol:B→Pol:X"]); // outer guard folded in → distinguishable
});

test("isOccurrenceKey: a nodeId-path key is an occurrence; a re-add-guard source-hash key is NOT", () => {
  assert.equal(isOccurrenceKey("when[0]/action[0]~Pol:Adult→Pol:Approve"), true);
  assert.equal(isOccurrenceKey("otherwise~x"), true);
  assert.equal(isOccurrenceKey("sha256:abc123"), false); // a pre-existing keyed decision flag's key
  assert.equal(isOccurrenceKey("some-source-span-hash"), false);
});

test("cross-lib same-name nodes get DISTINGUISHABLE signatures (the refKey lib differs)", () => {
  const d = { decision: "D", lib: "Pol", nodeKey: "k:D", location: {}, children: [
    nd("when[0]", "when", "when Adult", { refKeys: [rk("LibA", "concept", "Adult")] }),
    nd("when[1]", "when", "when Adult", { refKeys: [rk("LibB", "concept", "Adult")] }),
  ] };
  const occ = occurrencesOf(d);
  assert.notEqual(occ[0].signature, occ[1].signature); // LibA:Adult ≠ LibB:Adult — closes the cross-lib collision
});

test("isOccurrenceNode: leaves (recommend-activity) + when only; not otherwise/use-decision", () => {
  assert.equal(isOccurrenceNode({ kind: "when" }), true);
  assert.equal(isOccurrenceNode({ kind: "action", actionKind: "recommend-activity" }), true);
  assert.equal(isOccurrenceNode({ kind: "action", actionKind: "use-decision" }), false);
  assert.equal(isOccurrenceNode({ kind: "otherwise" }), false);
});

test("key value + parse round-trip; split on the FIRST ~ (nodeId is ~-free)", () => {
  const ref = occurrenceByNodeKey(dec(), "k:when[0]/action[0]");
  const key = occurrenceKeyValue(ref);
  assert.equal(key, "when[0]/action[0]~Pol:Adult→Pol:Approve");
  const p = parseOccurrenceKey(key);
  assert.equal(p.nodeId, "when[0]/action[0]");
  assert.equal(p.signature, "Pol:Adult→Pol:Approve"); // the → and any ~ in a name stay in the signature
});

test("resolveOccurrence: placed on an exact match", () => {
  const key = occurrenceKeyValue(occurrenceByNodeKey(dec(), "k:when[0]/action[0]"));
  const r = resolveOccurrence(dec(), key);
  assert.equal(r.placed, true);
  assert.equal(r.ref.nodeId, "when[0]/action[0]");
});

test("resolveOccurrence: ORPHAN when the nodeId no longer resolves (branch deleted/reordered away)", () => {
  const key = "when[9]/action[0]~when Ghost→Pol:X";
  const r = resolveOccurrence(dec(), key);
  assert.equal(r.placed, false);
  assert.equal(r.reason, "orphan");
});

test("resolveOccurrence: MOVED when nodeId resolves but the signature changed (a different node shifted in)", () => {
  // stored key points at when[0]/action[0] but with a STALE signature (the node there now recommends Approve, not Reject)
  const staleKey = "when[0]/action[0]~Pol:Adult→Pol:Reject";
  const r = resolveOccurrence(dec(), staleKey);
  assert.equal(r.placed, false);
  assert.equal(r.reason, "moved"); // mis-home caught — NOT painted as if correct
});

console.log("occurrenceKey.test: ok");
