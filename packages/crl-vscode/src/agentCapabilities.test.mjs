// #210 editor agent Todo D (disc 241) — the capability registry: the pure, context-filtered "what can I do here" descriptors.
// PURE (type-only import of CockpitAppState), so it is imported directly.
import assert from "node:assert/strict";

import { AGENT_CAPABILITIES, availableCapabilities } from "./agentCapabilities.ts";

const stateWith = (over) => ({ policy: "p", anchorLabel: null, anchorTitle: null, flagTargets: [], treePaneOpen: true, selectedCase: null, ...over });
const oneFlagTarget = [{ id: "t1", label: "this condition", shortLabel: "this condition" }];
const aCase = { token: "c1", label: "Patient A", verdictLabel: "To do" };

test("availableCapabilities: no cockpit (undefined) → nothing available", () => {
  assert.deepEqual(availableCapabilities(undefined), []);
});

test("availableCapabilities: a flag target present → the Flag capability, activation = prompt (opens the drawer)", () => {
  const caps = availableCapabilities(stateWith({ flagTargets: oneFlagTarget }));
  const flag = caps.find((c) => c.id === "flag");
  assert.ok(flag, "the flag badge shows with a flag target");
  assert.deepEqual(flag.activation, { kind: "prompt", text: "Flag this node." });
});

test("availableCapabilities: a selected case → the Verdict capability, activation = fillInput with the case label (no forced clarify round-trip)", () => {
  const caps = availableCapabilities(stateWith({ selectedCase: aCase }));
  const verdict = caps.find((c) => c.id === "verdict");
  assert.ok(verdict, "the verdict badge shows with a selected case");
  assert.equal(verdict.activation.kind, "fillInput");
  assert.match(verdict.activation.text, /Set the verdict for Patient A to $/);
});

test("availableCapabilities: both a flag target AND a selected case → both badges (plus where-we-stand, policy open)", () => {
  const caps = availableCapabilities(stateWith({ flagTargets: oneFlagTarget, selectedCase: aCase }));
  assert.deepEqual(caps.map((c) => c.id).sort(), ["flag", "verdict", "where-we-stand"]);
});

test("availableCapabilities: a policy is open → the 'Where do we stand' capability (prompt-kind), always available with a policy", () => {
  const caps = availableCapabilities(stateWith({ policy: "bariatric" }));
  const stand = caps.find((c) => c.id === "where-we-stand");
  assert.ok(stand, "the where-we-stand badge shows when a policy is open");
  assert.deepEqual(stand.activation, { kind: "prompt", text: "Where do we stand on this policy?" });
});

test("availableCapabilities: no cockpit / no policy → no 'Where do we stand' badge", () => {
  assert.deepEqual(availableCapabilities(undefined), []);
  const caps = availableCapabilities(stateWith({ policy: undefined }));
  assert.ok(!caps.some((c) => c.id === "where-we-stand"), "no policy → no where-we-stand");
});

test("availableCapabilities: MV open with a policy but no anchor and no case → ONLY where-we-stand (context-filtered)", () => {
  const caps = availableCapabilities(stateWith({ policy: "p" }));
  assert.deepEqual(caps.map((c) => c.id), ["where-we-stand"]);
});

test("registry: every descriptor exposes id/label/isAvailable/activation (the peer contract shape)", () => {
  for (const c of AGENT_CAPABILITIES) {
    assert.equal(typeof c.id, "string");
    assert.equal(typeof c.label, "string");
    assert.equal(typeof c.isAvailable, "function");
    assert.equal(typeof c.activation, "function");
  }
});

console.log("agentCapabilities.test: ok");
