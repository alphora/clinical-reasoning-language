// #210 editor agent Todo D (disc 241) — the capability registry: the pure, context-filtered "what can I do here" descriptors.
// PURE (type-only import of CockpitAppState), so the standard harness loads it directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { AGENT_CAPABILITIES, availableCapabilities } = await load("agentCapabilities.ts");

const stateWith = (over) => ({ policy: "p", anchorLabel: null, anchorTitle: null, flagTargets: [], treePaneOpen: true, selectedCase: null, ...over });
const oneFlagTarget = [{ id: "t1", label: "this condition", shortLabel: "this condition" }];
const aCase = { token: "c1", label: "Patient A", verdictLabel: "To do" };

test("availableCapabilities: no cockpit (undefined) → nothing available", () => {
  assert.deepEqual(availableCapabilities(undefined), []);
});

test("availableCapabilities: a flag target present → the Flag capability, activation = prompt (opens the drawer)", () => {
  const caps = availableCapabilities(stateWith({ flagTargets: oneFlagTarget }));
  assert.deepEqual(caps.map((c) => c.id), ["flag"]);
  assert.deepEqual(caps[0].activation, { kind: "prompt", text: "Flag this node." });
});

test("availableCapabilities: a selected case → the Verdict capability, activation = fillInput with the case label (no forced clarify round-trip)", () => {
  const caps = availableCapabilities(stateWith({ selectedCase: aCase }));
  assert.deepEqual(caps.map((c) => c.id), ["verdict"]);
  assert.equal(caps[0].activation.kind, "fillInput");
  assert.match(caps[0].activation.text, /Set the verdict for Patient A to $/);
});

test("availableCapabilities: both a flag target AND a selected case → both badges", () => {
  const caps = availableCapabilities(stateWith({ flagTargets: oneFlagTarget, selectedCase: aCase }));
  assert.deepEqual(caps.map((c) => c.id).sort(), ["flag", "verdict"]);
});

test("availableCapabilities: MV open but no anchor and no case → empty (context-filtered, not a static list)", () => {
  assert.deepEqual(availableCapabilities(stateWith({})), []);
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
