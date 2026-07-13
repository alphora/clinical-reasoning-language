// #210 editor agent Todo C — the "add-flag skill" prompt builder (pure; type-only imports, so the standard harness loads it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { appStateBlock, buildSystemPrompt, openFlagDrawerTool, submitFlagTool, setVerdictTool, readReviewContextTool, OPEN_FLAG_DRAWER, SUBMIT_FLAG, SET_VERDICT, READ_REVIEW_CONTEXT, VERDICT_VALUES, DEFAULT_VALIDATION_KINDS } = await load("editorAgentPrompt.ts");

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

test("buildSystemPrompt: teaches set_verdict AND forbids guessing a verdict (disc 241 I5)", () => {
  const p = buildSystemPrompt(undefined);
  assert.match(p, new RegExp(SET_VERDICT));
  assert.match(p, /NEVER call set_verdict with a verdict the validator did not state/);
});

// #210 Todo D (disc 241) — the selected-case line (the set_verdict target) is tree-INDEPENDENT.
test("appStateBlock: a selected case → a Selected case line with its label, current verdict, and opaque case_id", () => {
  const b = appStateBlock({
    policy: "p", anchorLabel: null, anchorTitle: null, flagTargets: [], treePaneOpen: true,
    selectedCase: { token: "c7", label: "Patient A — BMI 42", verdictLabel: "To do" },
  });
  assert.match(b, /Selected case: Patient A — BMI 42 \(current verdict: To do\)/);
  assert.match(b, /case_id="c7"/);
});

test("appStateBlock: the Selected case line SURVIVES a closed tree pane (verdict is worklist-only — disc 241 I11)", () => {
  const b = appStateBlock({
    policy: "p", anchorLabel: null, anchorTitle: null, flagTargets: [], treePaneOpen: false,
    selectedCase: { token: "c7", label: "Patient A", verdictLabel: "Pass" },
  });
  assert.match(b, /Selected case: Patient A \(current verdict: Pass\)/, "the verdict target shows even with the tree closed");
  assert.match(b, /tree pane is closed/, "and the flag section still honestly reports the closed tree");
});

test("appStateBlock: no selected case → no Selected case line", () => {
  const b = appStateBlock({ policy: "p", anchorLabel: null, anchorTitle: null, flagTargets: [], treePaneOpen: true, selectedCase: null });
  assert.doesNotMatch(b, /Selected case:/);
});

test("setVerdictTool: requires case_id + verdict; enumerates the four verdict values", () => {
  const t = setVerdictTool();
  assert.equal(t.name, SET_VERDICT);
  assert.deepEqual(t.inputSchema.required, ["case_id", "verdict"]);
  assert.deepEqual(t.inputSchema.properties.verdict.enum, VERDICT_VALUES);
  assert.deepEqual(VERDICT_VALUES, ["pass", "fail", "pending", "unreviewed"]);
});

// #210 Todo D slice 2 — read_review_context (the where-do-we-stand read tool).
test("readReviewContextTool: no args (bound to the open cockpit) + advertised READ-ONLY / untrusted-issue-text", () => {
  const t = readReviewContextTool();
  assert.equal(t.name, READ_REVIEW_CONTEXT);
  assert.deepEqual(t.inputSchema, { type: "object", properties: {} });
  assert.match(t.description, /READ-ONLY/);
  assert.match(t.description, /untrusted/i);
});

test("buildSystemPrompt: teaches where-do-we-stand — call read_review_context ONCE, issues are UNTRUSTED, path-to-passing from real status, READ-ONLY", () => {
  const p = buildSystemPrompt(undefined);
  assert.match(p, new RegExp(READ_REVIEW_CONTEXT));
  assert.match(p, /UNTRUSTED third-party input/);
  assert.match(p, /never invent its contents|do NOT invent/i);
  assert.match(p, /READ-ONLY/);
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
