// #210 editor agent Todo C — the "add-flag skill" prompt builder (pure; type-only imports, so the standard harness loads it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { appStateBlock, buildSystemPrompt, openFlagDrawerTool, submitFlagTool, OPEN_FLAG_DRAWER, SUBMIT_FLAG, DEFAULT_VALIDATION_KINDS } = await load("editorAgentPrompt.ts");

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

test("appStateBlock: lists the flag targets with their opaque ids + DESCRIPTIVE labels (not the bare shortLabel)", () => {
  const b = appStateBlock({
    policy: "p",
    anchorLabel: "this condition (BMI Over 40)",
    flagTargets: [
      { id: "t1", label: "this condition (BMI Over 40)", shortLabel: "this condition" },
      { id: "t2", label: 'the concept "BMI" (every use)', shortLabel: "the concept" },
    ],
    treePaneOpen: true,
  });
  assert.match(b, /Flag anchor: this condition \(BMI Over 40\)/);
  assert.match(b, /id="t1" — this condition \(BMI Over 40\)/);
  assert.match(b, /id="t2" — the concept "BMI" \(every use\)/);
});

test("buildSystemPrompt: base skill (submit is the default, never hand-edits CRL) + the live app-state block", () => {
  const p = buildSystemPrompt(undefined);
  assert.match(p, /CRL Assist/);
  assert.match(p, /never hand-edit CRL/);
  assert.match(p, new RegExp(SUBMIT_FLAG));
  assert.match(p, /No Medical Validation cockpit/);
});

test("submitFlagTool: the default flag action — requires target_id + summary; enumerates the kinds", () => {
  const t = submitFlagTool(["underspecified", "narrative-error"]);
  assert.equal(t.name, SUBMIT_FLAG);
  assert.deepEqual(t.inputSchema.required, ["target_id", "summary"]);
  assert.deepEqual(t.inputSchema.properties.validation_kind.enum, ["underspecified", "narrative-error"]);
  assert.ok(t.inputSchema.properties.description, "carries a description property (→ the issue body)");
});

test("openFlagDrawerTool: the review-first exception — only target_id required; enumerates the kinds", () => {
  const t = openFlagDrawerTool(["underspecified", "narrative-error"]);
  assert.equal(t.name, OPEN_FLAG_DRAWER);
  assert.deepEqual(t.inputSchema.properties.validation_kind.enum, ["underspecified", "narrative-error"]);
  assert.deepEqual(t.inputSchema.required, ["target_id"]);
});

test("flag tools: empty kinds → fall back to DEFAULT_VALIDATION_KINDS (schema stays meaningful)", () => {
  assert.deepEqual(submitFlagTool([]).inputSchema.properties.validation_kind.enum, DEFAULT_VALIDATION_KINDS);
  assert.deepEqual(openFlagDrawerTool([]).inputSchema.properties.validation_kind.enum, DEFAULT_VALIDATION_KINDS);
});

console.log("editorAgentPrompt.test: ok");
