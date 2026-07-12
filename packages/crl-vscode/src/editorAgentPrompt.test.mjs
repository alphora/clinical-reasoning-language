// #210 editor agent Todo C — the "add-flag skill" prompt builder (pure; type-only imports, so the standard harness loads it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { appStateBlock, buildSystemPrompt, openFlagDrawerTool, OPEN_FLAG_DRAWER, DEFAULT_VALIDATION_KINDS } = await load("editorAgentPrompt.ts");

test("appStateBlock: no cockpit → asks the validator to open one", () => {
  assert.match(appStateBlock(undefined), /No Medical Validation cockpit/);
});

test("appStateBlock: tree pane closed → says so (honest — no node can be perceived)", () => {
  assert.match(appStateBlock({ policy: "p", anchorLabel: null, flagTargets: [], treePaneOpen: false }), /tree pane is closed/);
});

test("appStateBlock: MV open but no anchor → names the policy + asks to click a node", () => {
  const b = appStateBlock({ policy: "bariatric", anchorLabel: null, flagTargets: [], treePaneOpen: true });
  assert.match(b, /bariatric/);
  assert.match(b, /click a decision or condition/);
});

test("appStateBlock: lists the flag targets with their opaque ids + short labels", () => {
  const b = appStateBlock({
    policy: "p",
    anchorLabel: "this condition",
    flagTargets: [{ id: "t1", label: "L", shortLabel: "this condition" }, { id: "t2", label: "L2", shortLabel: 'the concept "BMI" (every use)' }],
    treePaneOpen: true,
  });
  assert.match(b, /Flag anchor: this condition/);
  assert.match(b, /id="t1" — this condition/);
  assert.match(b, /id="t2" — the concept "BMI" \(every use\)/);
});

test("buildSystemPrompt: base skill (never writes CRL) + the live app-state block", () => {
  const p = buildSystemPrompt(undefined);
  assert.match(p, /CRL Assist/);
  assert.match(p, /never write CRL/);
  assert.match(p, /No Medical Validation cockpit/);
});

test("openFlagDrawerTool: schema enumerates the given kinds; target_id is required", () => {
  const t = openFlagDrawerTool(["underspecified", "narrative-error"]);
  assert.equal(t.name, OPEN_FLAG_DRAWER);
  assert.deepEqual(t.inputSchema.properties.validation_kind.enum, ["underspecified", "narrative-error"]);
  assert.deepEqual(t.inputSchema.required, ["target_id"]);
});

test("openFlagDrawerTool: empty kinds → falls back to DEFAULT_VALIDATION_KINDS (schema stays meaningful)", () => {
  assert.deepEqual(openFlagDrawerTool([]).inputSchema.properties.validation_kind.enum, DEFAULT_VALIDATION_KINDS);
});

console.log("editorAgentPrompt.test: ok");
