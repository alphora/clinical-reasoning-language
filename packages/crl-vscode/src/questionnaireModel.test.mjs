// Unit tests for the pure, vscode-free `buildQuestionnaire` (#177 slice 2). Like renderScenarioHtml.test.mjs
// and medicalValidationStore.test.mjs, esbuild bundles the extension TS to CJS and we import it under node.
// Each fixture is a REAL view-model: we write a tiny CRL+CEL project to a temp dir, run `renderScenario`
// (resolveCelImports → renderScenario) in-process to get a genuine `ScenarioViewModel`, then assert the
// `buildQuestionnaire` projection. Design authority: .vibe-tools/discussions/163-questionnaire-panel-design.md
// + the slice-2 impl-review re-axis (the path follows the ACTUAL produced disposition, not expected/pass-fail).
import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCelImports, renderScenario } from "@smile-digital-health/crl";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

async function load(tsFile) {
  const out = resolve(tmpdir(), `crl-${tsFile.replace(/\W/g, "_")}-${process.pid}.cjs`);
  await build({
    entryPoints: [resolve(here, tsFile)],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    outfile: out,
    logLevel: "silent",
  });
  return require(out);
}

const { buildQuestionnaire, producedPathDiverterIds } = await load("questionnaireModel.ts");

let pass = 0;
const check = (label, fn) => {
  try {
    fn();
    pass++;
    console.log(`  ok  ${label}`);
  } catch (e) {
    console.error(`FAIL  ${label}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

// Write a CRL+CEL project to a fresh temp dir (its own project root) and render the named case.
// `files` is a map of relative-name → contents. Returns the single ScenarioViewModel + its decision lib.
function renderCase(files, celName, caseName) {
  const root = mkdtempSync(join(tmpdir(), "qm-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "qm-fixture", version: "1.0.0", private: true }));
  for (const [name, contents] of Object.entries(files)) {
    const full = join(root, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  const result = renderScenario(resolveCelImports(join(root, celName)), { case: caseName });
  assert.ok(result.scenarios.length > 0, `render produced a scenario (errors: ${JSON.stringify(result.errors)})`);
  const sv = result.scenarios.find((s) => s.case.name === caseName) ?? result.scenarios[0];
  assert.ok(sv, `case "${caseName}" rendered`);
  return { sv, rootLib: sv.decision?.libraryName };
}

// A resolver stub that returns boolean for every concept (the common case). Per-lib/per-name overrides
// let a test assert WHICH (lib,name) the builder queried (the cross-lib same-name trap).
const booleanResolver = () => ["boolean"];

// ── 1. PASS path: N nested satisfied whens → N questions in order, each "yes", outcome = the activity ──
check("PASS nested-yes: N nested satisfied whens → N ordered yes-questions + the produced activity", () => {
  const crl = `# P
library "Nest".
concept "A":
- type is Condition.
- code is \`a\`.
concept "B":
- type is Condition.
- code is \`b\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "Nest":
- when "A" then:
  - when "B" then recommend activity "Approve".
  end.`;
  const cel = `# C
library "NestCases".
covers "Nest".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fA":
- code is "http://example.org|a".
- date is "2026-01-01".
- defined by "A".
fact "fB":
- code is "http://example.org|b".
- date is "2026-01-01".
- defined by "B".
case "both hold":
- subject is "Pat".
- fact is "fA".
- fact is "fB".
- result is "Nest" is "Approve".`;
  const { sv, rootLib } = renderCase({ "p.crl": crl, "p.cel": cel }, "p.cel", "both hold");
  assert.equal(sv.status, "pass", "the case passes");
  const q = buildQuestionnaire(sv, booleanResolver, rootLib);
  assert.equal(q.terminalKind, "produced");
  assert.equal(q.questions.length, 2, "two nested whens → two questions");
  assert.deepEqual(q.questions.map((x) => x.conceptName), ["A", "B"], "in path order, bare concept names");
  assert.ok(q.questions.every((x) => x.answer === "yes"), "every satisfied when answers yes");
  assert.ok(q.questions.every((x) => x.isBoolean), "boolean concepts");
  assert.deepEqual(q.questions[0].options, ["Yes", "No"]);
  assert.deepEqual(q.outcome, { activity: "Approve" }, "outcome is the produced leaf activity");
  assert.ok(q.questions.every((x) => x.nodeId && x.source), "each question carries a nodeId + source");
});

// ── 2. THE KEY MODEL-FIX TEST: a FAIL where a DIFFERENT disposition is produced. The case has an exclusion
//      → fires Deny; `result is` says Approve (so status==="fail"). The questionnaire shows the path to the
//      ACTUAL produced disposition (Deny), terminalKind "produced" — NOT "blocked". expected/pass-fail are
//      orthogonal. ──
check("KEY FIX — FAIL with a different disposition produced → path to the ACTUAL leaf, terminalKind produced", () => {
  const crl = `# X
library "Excl".
concept "Exclusion":
- type is Condition.
- code is \`excl\`.
concept "Covered":
- type is Condition.
- code is \`cov\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "Excl":
first:
- when "Exclusion" then recommend activity "Deny".
- when "Covered" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
  const cel = `# C
library "ExclCases".
covers "Excl".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fExcl":
- code is "http://example.org|excl".
- date is "2026-01-01".
- defined by "Exclusion".
case "exclusion present, but result claims Approve":
- subject is "Pat".
- fact is "fExcl".
- result is "Excl" is "Approve".`;
  const { sv, rootLib } = renderCase({ "x.crl": crl, "x.cel": cel }, "x.cel", "exclusion present, but result claims Approve");
  assert.equal(sv.status, "fail", "produces Deny but result claims Approve → fail (oracle's concern)");
  const q = buildQuestionnaire(sv, booleanResolver, rootLib);
  assert.equal(q.terminalKind, "produced", "the questionnaire shows the ACTUAL produced path, not blocked");
  assert.deepEqual(q.outcome, { activity: "Deny" }, "outcome is the ACTUALLY produced disposition (Deny), NOT expected Approve");
  // The first when (Exclusion) satisfied → fires Deny; the rest are preempted (first:) → not on the path.
  assert.deepEqual(q.questions.map((x) => x.conceptName), ["Exclusion"], "only the satisfied exclusion is on the fired path");
  assert.equal(q.questions[0].answer, "yes", "the exclusion held");
});

// ── 3. A "no" question on the path: "Is X? No → (first: fall through) → Is Y? Yes → Approve" → questions
//      [{X, no}, {Y, yes}] + Approve. The tried-and-failed exclusion renders as a "no" question. ──
check("NO-QUESTION FIX — a tried-and-failed when before the winner renders as a 'no' question", () => {
  const crl = `# N
library "FallThrough".
concept "X":
- type is Condition.
- code is \`x\`.
concept "Y":
- type is Condition.
- code is \`y\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "FallThrough":
first:
- when "X" then recommend activity "Deny".
- when "Y" then recommend activity "Approve".`;
  const cel = `# C
library "FallCases".
covers "FallThrough".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fY":
- code is "http://example.org|y".
- date is "2026-01-01".
- defined by "Y".
case "X absent, Y holds → fall through to Approve":
- subject is "Pat".
- fact is "fY".
- result is "FallThrough" is "Approve".`;
  const { sv, rootLib } = renderCase({ "n.crl": crl, "n.cel": cel }, "n.cel", "X absent, Y holds → fall through to Approve");
  assert.equal(sv.status, "pass");
  const q = buildQuestionnaire(sv, booleanResolver, rootLib);
  assert.equal(q.terminalKind, "produced");
  assert.deepEqual(q.questions.map((x) => ({ c: x.conceptName, a: x.answer })), [
    { c: "X", a: "no" },
    { c: "Y", a: "yes" },
  ], "the false X is on the path as a 'no'; then Y as 'yes'");
  assert.deepEqual(q.outcome, { activity: "Approve" });
});

// ── 4. Preemption: a prior satisfied sibling fires Deny, preempting the expected Approve → shows the Deny
//      path + Deny (the preempting branch IS the produced leaf; NOT "blocked"). ──
check("PREEMPTION — a satisfied prior sibling fires Deny, preempting Approve → path to Deny, produced", () => {
  const crl = `# Pre
library "Preempt".
concept "Excl":
- type is Condition.
- code is \`excl\`.
concept "Covered":
- type is Condition.
- code is \`cov\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "Preempt":
first:
- when "Excl" then recommend activity "Deny".
- when "Covered" then recommend activity "Approve".`;
  const cel = `# C
library "PreemptCases".
covers "Preempt".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fExcl":
- code is "http://example.org|excl".
- date is "2026-01-01".
- defined by "Excl".
fact "fCov":
- code is "http://example.org|cov".
- date is "2026-01-01".
- defined by "Covered".
case "both hold; Excl preempts → Deny":
- subject is "Pat".
- fact is "fExcl".
- fact is "fCov".
- result is "Preempt" is "Approve".`;
  const { sv, rootLib } = renderCase({ "pre.crl": crl, "pre.cel": cel }, "pre.cel", "both hold; Excl preempts → Deny");
  const q = buildQuestionnaire(sv, booleanResolver, rootLib);
  assert.equal(q.terminalKind, "produced", "the preempting branch produced Deny → not blocked");
  assert.deepEqual(q.outcome, { activity: "Deny" });
  assert.deepEqual(q.questions.map((x) => x.conceptName), ["Excl"], "the preempted Covered when is NOT on the fired path");
  assert.equal(q.questions[0].answer, "yes");
});

// ── 5. Guard-on-PASS must NOT terminate: a PASS where an unrelated `any:`-menu sibling is guarded out → still
//      terminalKind "produced" with the real outcome (NOT blocked-guard). ──
check("GUARD-ON-PASS — a guarded-out menu sibling on a producing path does NOT become blocked-guard", () => {
  // `any:` menu: the medication option is guarded out by a contraindication, but the rescreen option fires →
  // something IS produced. The guard must NOT terminate the questionnaire.
  const crl = `# GP
library "Menu".
concept "Dx":
- type is Condition.
- code is \`dx\`.
concept "Contra":
- type is Condition.
- code is \`contra\`.
activity "Med":
- request CPGMedicationRequest.
- with \`m\`.
activity "Rescreen":
- request CPGServiceRequest.
- with \`r\`.
decision "Menu":
- when "Dx" then:
  any:
  - recommend activity "Med" unless "Contra".
  - recommend activity "Rescreen".
  end.`;
  const cel = `# C
library "MenuCases".
covers "Menu".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fDx":
- code is "http://example.org|dx".
- date is "2026-01-01".
- defined by "Dx".
fact "fContra":
- code is "http://example.org|contra".
- date is "2026-01-01".
- defined by "Contra".
case "contraindicated → Med guarded out, Rescreen fires":
- subject is "Pat".
- fact is "fDx".
- fact is "fContra".
- result is "Menu" is "Rescreen".`;
  const { sv, rootLib } = renderCase({ "gp.crl": crl, "gp.cel": cel }, "gp.cel", "contraindicated → Med guarded out, Rescreen fires");
  const q = buildQuestionnaire(sv, booleanResolver, rootLib);
  assert.equal(q.terminalKind, "produced", "Rescreen produced → produced, NOT blocked-guard");
  assert.deepEqual(q.outcome, { activity: "Rescreen" });
  // No guard question — the guarded-out Med is an unrelated untaken menu option on a producing path.
  assert.ok(!q.questions.some((x) => x.conceptName === "Contra"), "the unrelated guard is NOT a question on a producing path");
  assert.deepEqual(q.questions.map((x) => x.conceptName), ["Dx"], "only the Dx when is on the path");
});

// ── 6a. Blocked (0 produced) via an all-guarded-out menu → blocked-guard + the guard question. A per-action
//      guard requires a real (2+) menu, so we use an `any:` of two options both guarded by the same Contra;
//      with the contraindication present BOTH guard out → nothing produced → blocked-guard. ──
check("BLOCKED — every menu option guarded out (no production) → blocked-guard + the guard question", () => {
  const crl = `# B
library "Block".
concept "Dx":
- type is Condition.
- code is \`dx\`.
concept "Contra":
- type is Condition.
- code is \`contra\`.
activity "Med":
- request CPGMedicationRequest.
- with \`m\`.
activity "Med2":
- request CPGMedicationRequest.
- with \`m2\`.
decision "Block":
- when "Dx" then:
  any:
  - recommend activity "Med" unless "Contra".
  - recommend activity "Med2" unless "Contra".
  end.`;
  const cel = `# C
library "BlockCases".
covers "Block".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fDx":
- code is "http://example.org|dx".
- date is "2026-01-01".
- defined by "Dx".
fact "fContra":
- code is "http://example.org|contra".
- date is "2026-01-01".
- defined by "Contra".
case "contraindicated, whole menu guarded out → nothing produced":
- subject is "Pat".
- fact is "fDx".
- fact is "fContra".
- result is "Block" is "Med".`;
  const { sv, rootLib } = renderCase({ "b.crl": crl, "b.cel": cel }, "b.cel", "contraindicated, whole menu guarded out → nothing produced");
  const q = buildQuestionnaire(sv, booleanResolver, rootLib);
  assert.equal(q.terminalKind, "blocked-guard", "nothing produced + a guarded-out action → blocked-guard");
  assert.equal(q.outcome, null);
  const guardQ = q.questions[q.questions.length - 1];
  assert.equal(guardQ.conceptName, "Contra", "the guard concept is the terminal question");
  assert.equal(guardQ.answer, "yes", "the contraindication held (satisfied) → answer yes");
  assert.deepEqual(q.questions.map((x) => x.conceptName), ["Dx", "Contra"], "Dx then the guard terminal");
});

// ── 6b. Blocked (0 produced) via a no-otherwise decision where the only when is false → blocked. ──
check("BLOCKED — no otherwise, the only when is false → blocked (the false when is the terminal question)", () => {
  const crl = `# B2
library "Gap".
concept "Dx":
- type is Condition.
- code is \`dx\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "Gap":
- when "Dx" then recommend activity "Approve".`;
  const cel = `# C
library "GapCases".
covers "Gap".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "Dx absent, no fallback → nothing produced":
- subject is "Pat".
- result is "Gap" is "Approve".`;
  const { sv, rootLib } = renderCase({ "b2.crl": crl, "b2.cel": cel }, "b2.cel", "Dx absent, no fallback → nothing produced");
  const q = buildQuestionnaire(sv, booleanResolver, rootLib);
  assert.equal(q.terminalKind, "blocked", "no production, no guard → blocked");
  assert.equal(q.outcome, null);
  assert.deepEqual(q.questions.map((x) => ({ c: x.conceptName, a: x.answer })), [{ c: "Dx", a: "no" }],
    "the false Dx when is the terminal question");
});

// ── 7a. Root-`otherwise` with a leading false when → it's a 'no' question + produced (NOT empty). ──
check("OTHERWISE with a leading false when → a 'no' question + produced (NOT empty)", () => {
  const crl = `# O
library "Otherwise".
concept "A":
- type is Condition.
- code is \`a\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.
decision "Otherwise":
first:
- when "A" then recommend activity "Deny".
- otherwise then recommend activity "Deny".`;
  const cel = `# C
library "OtherwiseCases".
covers "Otherwise".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "nothing matches → otherwise":
- subject is "Pat".
- result is "Otherwise" is "Deny".`;
  const { sv, rootLib } = renderCase({ "o.crl": crl, "o.cel": cel }, "o.cel", "nothing matches → otherwise");
  assert.equal(sv.status, "pass", "the otherwise branch produces Deny → pass");
  const q = buildQuestionnaire(sv, booleanResolver, rootLib);
  // A is false (a 'no' question), the otherwise fires. With a leading false-when, questions is NOT empty —
  // so this is "produced", not "empty". The "empty" terminal requires ZERO when questions on the path.
  assert.equal(q.terminalKind, "produced", "a leading false when makes this a produced (not empty) path");
  assert.deepEqual(q.questions.map((x) => ({ c: x.conceptName, a: x.answer })), [{ c: "A", a: "no" }]);
  assert.deepEqual(q.outcome, { activity: "Deny" });
});

// ── 7b. A bare otherwise-only decision (ZERO whens) → empty + outcome. ──
check("EMPTY — a bare otherwise-only decision (zero whens) → zero questions, terminalKind empty, outcome present", () => {
  const crl = `# OE
library "Empty".
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.
decision "Empty":
- otherwise then recommend activity "Deny".`;
  const cel = `# C
library "EmptyCases".
covers "Empty".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "no criteria at all → otherwise":
- subject is "Pat".
- result is "Empty" is "Deny".`;
  const { sv, rootLib } = renderCase({ "oe.crl": crl, "oe.cel": cel }, "oe.cel", "no criteria at all → otherwise");
  const q = buildQuestionnaire(sv, booleanResolver, rootLib);
  assert.equal(q.terminalKind, "empty", "zero when questions + a produced leaf → empty");
  assert.equal(q.questions.length, 0);
  assert.deepEqual(q.outcome, { activity: "Deny" });
});

// ── 8. Same-library `use decision` chain → the sub's whens render; the use-decision node emits none ──
check("USE-DECISION (same-lib) → the sub-decision whens render; the use-decision node itself emits no question", () => {
  const crl = `# U
library "Use".
concept "A":
- type is Condition.
- code is \`a\`.
concept "S":
- type is Condition.
- code is \`s\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "Top":
- when "A" then:
  - use decision "Sub".
  end.
decision "Sub":
- when "S" then recommend activity "Approve".`;
  const cel = `# C
library "UseCases".
covers "Use".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fA":
- code is "http://example.org|a".
- date is "2026-01-01".
- defined by "A".
fact "fS":
- code is "http://example.org|s".
- date is "2026-01-01".
- defined by "S".
case "delegated approve":
- subject is "Pat".
- fact is "fA".
- fact is "fS".
- result is "Top" is "Approve".`;
  const { sv, rootLib } = renderCase({ "u.crl": crl, "u.cel": cel }, "u.cel", "delegated approve");
  assert.equal(sv.status, "pass");
  const q = buildQuestionnaire(sv, booleanResolver, rootLib);
  assert.equal(q.terminalKind, "produced");
  assert.deepEqual(q.questions.map((x) => x.conceptName), ["A", "S"], "root when A + the sub's when S; no use-decision question");
  assert.deepEqual(q.outcome, { activity: "Approve" });
});

// ── 9. The cross-lib same-name trap: a cross-library `use decision` whose sub `when` shares a NAME with a
//      root-lib concept → resolveValueTypes must be called with the SUB's lib. Assert via a per-lib stub. ──
check("USE-DECISION (cross-lib same-name trap) → the sub's when resolves value types against the SUB's library", () => {
  const crlA = `# A
library "A".
concept "RA":
- type is Condition.
- code is \`ra\`.
concept "Shared":
- type is Condition.
- code is \`shared-a\`.
decision "Root":
- when "RA" then:
  - use decision "B"."Sub".
  end.`;
  const crlB = `# B
library "B".
concept "Shared":
- type is Condition.
- code is \`shared-b\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "Sub":
- when "Shared" then recommend activity "Approve".`;
  const cel = `# C
library "XCases".
covers "A".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fRA":
- code is "http://example.org|ra".
- date is "2026-01-01".
- defined by "RA".
fact "fSharedB":
- code is "http://example.org|shared-b".
- date is "2026-01-01".
- defined by "B"."Shared".
case "cross-lib delegated":
- subject is "Pat".
- fact is "fRA".
- fact is "fSharedB".
- result is "Root" is "Approve".`;
  const { sv, rootLib } = renderCase({ "a.crl": crlA, "b.crl": crlB, "x.cel": cel }, "x.cel", "cross-lib delegated");
  assert.equal(sv.status, "pass", "the cross-lib chain resolves to Approve");
  assert.equal(rootLib, "A", "root frame is lib A");

  const calls = [];
  const perLibResolver = (lib, name) => {
    calls.push({ lib, name });
    if (name === "Shared" && lib === "B") return ["boolean"];
    if (name === "Shared" && lib === "A") return ["CodeableConcept"];
    return ["boolean"]; // RA etc.
  };
  const q = buildQuestionnaire(sv, perLibResolver, rootLib);
  assert.deepEqual(q.questions.map((x) => x.conceptName), ["RA", "Shared"], "RA then the sub's Shared");
  const sharedQ = q.questions.find((x) => x.conceptName === "Shared");
  assert.ok(sharedQ, "the sub's Shared question is present");
  assert.equal(sharedQ.isBoolean, true, "Shared resolved against lib B (boolean), NOT lib A (CodeableConcept)");
  assert.equal(sharedQ.valueType, "boolean", "value type came from lib B");
  assert.ok(calls.some((c) => c.name === "Shared" && c.lib === "B"), "resolveValueTypes called with the SUB's lib B");
  assert.ok(!calls.some((c) => c.name === "Shared" && c.lib === "A"), "NEVER called with lib A for Shared (no mis-keying)");
});

// ── 10. Non-boolean concept → isBoolean false, options still ["Yes","No"], valueType carried ──
check("OPTIONS — non-boolean concept → isBoolean false, options Yes/No, valueType carried; empty types → null", () => {
  const crl = `# Q
library "Quant".
concept "A":
- type is Observation.
- value type is Quantity.
- code is \`a\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "Quant":
- when "A" then recommend activity "Approve".`;
  const cel = `# C
library "QuantCases".
covers "Quant".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fA":
- code is "http://example.org|a".
- date is "2026-01-01".
- defined by "A".
case "a holds":
- subject is "Pat".
- fact is "fA".
- result is "Quant" is "Approve".`;
  const { sv, rootLib } = renderCase({ "q.crl": crl, "q.cel": cel }, "q.cel", "a holds");
  assert.equal(sv.status, "pass");
  const q = buildQuestionnaire(sv, () => ["Quantity"], rootLib);
  const aQ = q.questions.find((x) => x.conceptName === "A");
  assert.ok(aQ, "the A question is present");
  assert.equal(aQ.isBoolean, false, "Quantity is not boolean");
  assert.deepEqual(aQ.options, ["Yes", "No"], "options are still Yes/No (richer options deferred)");
  assert.equal(aQ.valueType, "Quantity", "the value type is carried for the deferred work");

  const qNone = buildQuestionnaire(sv, () => [], rootLib);
  const aNone = qNone.questions.find((x) => x.conceptName === "A");
  assert.equal(aNone.valueType, null, "no declared types → valueType null");
  assert.equal(aNone.isBoolean, false);
  assert.deepEqual(aNone.options, ["Yes", "No"]);
});

// ── 11. status==="error" → empty questions + terminalKind error (no path walked) ──
check("ERROR — status error (delegation cycle) → empty questions, terminalKind error, no outcome", () => {
  const crlA = `# A
library "A".
concept "P":
- type is Condition.
- code is \`p\`.
decision "Main":
- when "P" then:
  - use decision "B"."Sub".
  end.`;
  const crlB = `# B
library "B".
concept "P":
- type is Condition.
- code is \`p\`.
decision "Sub":
- when "P" then:
  - use decision "A"."Main".
  end.`;
  const cel = `# C
library "CycCases".
covers "A".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fPa":
- code is "http://example.org|p".
- date is "2026-01-01".
- defined by "P".
fact "fPb":
- code is "http://example.org|p".
- date is "2026-01-01".
- defined by "B"."P".
case "cycle":
- subject is "Pat".
- fact is "fPa".
- fact is "fPb".
- result is "Main" is "Sub".`;
  const { sv, rootLib } = renderCase({ "a.crl": crlA, "b.crl": crlB, "c.cel": cel }, "c.cel", "cycle");
  assert.equal(sv.status, "error", "the delegation cycle yields status error");
  const q = buildQuestionnaire(sv, booleanResolver, rootLib);
  assert.equal(q.terminalKind, "error");
  assert.equal(q.questions.length, 0, "no path walked on error");
  assert.equal(q.outcome, null);
  assert.ok(typeof q.note === "string" && q.note.length > 0, "the error reason is carried in note");
});

// ── 12. Multi-produced (an `all:` of two recommend leaves) → outcome present + a 'multiple produced' note ──
check("MULTI-PRODUCED — an all: producing two leaves → outcome + a 'multiple produced' note", () => {
  const crl = `# M
library "Multi".
concept "Dx":
- type is Condition.
- code is \`dx\`.
activity "Order":
- request CPGServiceRequest.
- with \`o\`.
activity "Document":
- request CPGRecordInference.
- with \`d\`.
decision "Multi":
- when "Dx" then:
  all:
  - recommend activity "Order".
  - recommend activity "Document".
  end.`;
  const cel = `# C
library "MultiCases".
covers "Multi".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fDx":
- code is "http://example.org|dx".
- date is "2026-01-01".
- defined by "Dx".
case "both fire":
- subject is "Pat".
- fact is "fDx".
- result is "Multi" is "Order".`;
  const { sv, rootLib } = renderCase({ "m.crl": crl, "m.cel": cel }, "m.cel", "both fire");
  const q = buildQuestionnaire(sv, booleanResolver, rootLib);
  assert.equal(q.terminalKind, "produced");
  assert.ok(q.outcome && (q.outcome.activity === "Order" || q.outcome.activity === "Document"), "outcome is one of the produced leaves");
  assert.ok(typeof q.note === "string" && /multiple produced/.test(q.note), "a multiplicity note is set");
  assert.deepEqual(q.questions.map((x) => x.conceptName), ["Dx"], "the single when is on the path");
});

// ── disc 164: producedPathDiverterIds — the gated "no"-question extraction the cockpit's diverter overlay drives ──
check("producedPathDiverterIds: a PRODUCED terminal returns the evaluated-false 'no' nodeIds (in order), skipping 'yes'/null", () => {
  const q = {
    outcome: { activity: "Deny" },
    terminalKind: "produced",
    questions: [
      { answer: "no", nodeId: "when[0]" },
      { answer: "yes", nodeId: "when[1]" },
      { answer: "no", nodeId: "when[2]" },
      { answer: null, nodeId: "when[3]" },
    ],
  };
  assert.deepEqual(producedPathDiverterIds(q), ["when[0]", "when[2]"], "only the produced-path 'no' diverters, in order");
});

check("producedPathDiverterIds: a BLOCKED / blocked-guard terminal (outcome null) returns [] even with a false question (the guard is the BLOCKER, not a diverter)", () => {
  // The load-bearing gpt55/Claude impl-review catch: buildQuestionnaire emits a false GUARD/when question for a blocked
  // terminal, but with NOTHING produced there is no disposition to have diverted TO — that is the failed-criterion peek's
  // job, not the diverter overlay's. The q.outcome gate must suppress it.
  for (const terminalKind of ["blocked", "blocked-guard"]) {
    const q = { outcome: null, terminalKind, questions: [{ answer: "no", nodeId: "when[0]/guard" }] };
    assert.deepEqual(producedPathDiverterIds(q), [], `${terminalKind} (outcome null) lights NO diverter`);
  }
});

check("producedPathDiverterIds: an EMPTY terminal (produced via root otherwise, zero questions) returns []", () => {
  const q = { outcome: { activity: "Deny" }, terminalKind: "empty", questions: [] };
  assert.deepEqual(producedPathDiverterIds(q), [], "no questions → no diverters (clears the overlay)");
});

check("producedPathDiverterIds: a multi-diverter produced case (e.g. adult, neither disease → inner otherwise → Deny) returns ALL the false whens", () => {
  const q = {
    outcome: { activity: "Deny" },
    terminalKind: "produced",
    questions: [
      { answer: "yes", nodeId: "when[0]" }, // Adult? yes
      { answer: "no", nodeId: "when[0]/when[0]" }, // Crohn's? no
      { answer: "no", nodeId: "when[0]/when[1]" }, // UC? no
    ],
  };
  assert.deepEqual(producedPathDiverterIds(q), ["when[0]/when[0]", "when[0]/when[1]"], "both failed disease whens are diverters");
});

console.log(`\nquestionnaireModel.test.mjs: ${pass} checks passed.`);
