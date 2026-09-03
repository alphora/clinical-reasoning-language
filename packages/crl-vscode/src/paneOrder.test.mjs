// Unit tests for normalizePaneOrder (#156 C2b-4 + medical-validation slice 3). vscode-free.
//
// ⚠ CONTRACT CHANGED 2026-08-16 — THE SETTING IS THE SOURCE OF TRUTH.
// Panes used to be force-appended: an order that omitted a "canonical" pane silently got it back, so no pane
// could be turned off. Now any ARRAY the user writes is honored exactly, an EMPTY array yields an empty panel,
// and `canonical` is only the FALLBACK for a setting that is unset or not an array.
//
// The old behaviour was already confusing; it became indefensible once MV had two questionnaire panes and the
// user has to choose between them.
import assert from "node:assert/strict";

import { normalizePaneOrder, COCKPIT_PANE_SPEC, MEDICAL_VALIDATION_PANE_SPEC } from "./paneOrder.ts";

const cockpit = (raw) => normalizePaneOrder(raw, COCKPIT_PANE_SPEC);
const mv = (raw) => normalizePaneOrder(raw, MEDICAL_VALIDATION_PANE_SPEC);
const check = test;

// ── the contract, stated once per rule ──

check("an explicit order is honored EXACTLY — nothing is appended", () => {
  assert.deepEqual(cockpit(["crl", "source", "cel"]), ["crl", "source", "cel"]);
  assert.deepEqual(cockpit(["cel"]), ["cel"], "a single-pane order stays a single pane");
  assert.deepEqual(mv(["source", "fhirQuestionnaire", "tree"]), ["source", "fhirQuestionnaire", "tree"]);
});

check("EVERY pane is opt-out-able, including the MV worklist and the CRL questionnaire", () => {
  // The specific report that drove this change: choosing fhirQuestionnaire also got you the CRL questionnaire.
  assert.ok(!mv(["source", "fhirQuestionnaire"]).includes("questionnaire"));
  assert.ok(!mv(["source", "fhirQuestionnaire"]).includes("worklist"));
  assert.ok(!cockpit(["crl"]).includes("source"));
});

check("an EMPTY array means an empty panel — it is not repopulated", () => {
  assert.deepEqual(mv([]), []);
  assert.deepEqual(cockpit([]), []);
});

check("a NON-array (unset / malformed type) falls back to the spec's canonical set", () => {
  for (const bad of [undefined, null, "source", 42, {}, true]) {
    assert.deepEqual(mv(bad), [...MEDICAL_VALIDATION_PANE_SPEC.canonical], `MV fallback for ${String(bad)}`);
    assert.deepEqual(cockpit(bad), [...COCKPIT_PANE_SPEC.canonical], `cockpit fallback for ${String(bad)}`);
  }
});

check("MV's fallback is the operator's three-pane set, NOT every pane", () => {
  // Defaulting to all seven was tried and reverted: seven retainContextWhenHidden webviews side by side on a
  // browser-only clinician's screen, including the 1.85 MB LForms shell, for panes most never open.
  assert.deepEqual(mv(undefined), ["source", "fhirQuestionnaire", "tree"]);
});

// ── repair rules that survive unchanged ──

check("dupes dropped, first occurrence wins", () => {
  assert.deepEqual(cockpit(["crl", "crl", "cel"]), ["crl", "cel"]);
  assert.deepEqual(mv(["tree", "tree"]), ["tree"]);
});

check("unknown ids dropped, order of the rest preserved", () => {
  assert.deepEqual(cockpit(["crl", "xxx", "cel"]), ["crl", "cel"]);
  assert.deepEqual(mv(["worklist", "zzz", "source"]), ["worklist", "source"]);
});

check("non-string entries dropped", () => {
  assert.deepEqual(cockpit(["crl", 7, null, "cel"]), ["crl", "cel"]);
});

check("an array of ONLY unknown ids yields an empty panel, not the fallback", () => {
  // It is still an array, so the user expressed something; we do not second-guess it into the defaults.
  assert.deepEqual(cockpit(["xxx", "yyy"]), []);
  assert.deepEqual(mv(["nope"]), []);
});

check("case/whitespace variants are NOT recognized (ids are exact)", () => {
  assert.deepEqual(cockpit(["Source", " crl", "CEL "]), []);
});

// ── per-spec valid sets ──

check("each spec only accepts its own pane ids", () => {
  // questionnaire panes are MV-only; they never appear in a cockpit order.
  assert.deepEqual(cockpit(["questionnaire", "fhirQuestionnaire", "crl"]), ["crl"]);
  // `tree` is valid in both.
  assert.deepEqual(cockpit(["tree"]), ["tree"]);
  assert.deepEqual(mv(["tree"]), ["tree"]);
});

check("MV: worklist and cel are DISTINCT panes — listing both opens both (disc 179, no alias dedup)", () => {
  assert.deepEqual(mv(["worklist", "cel"]), ["worklist", "cel"]);
  assert.deepEqual(mv(["cel", "worklist"]), ["cel", "worklist"]);
});

check("MV: both questionnaire panes can be open at once, in either order", () => {
  assert.deepEqual(mv(["questionnaire", "fhirQuestionnaire"]), ["questionnaire", "fhirQuestionnaire"]);
  assert.deepEqual(mv(["fhirQuestionnaire", "questionnaire"]), ["fhirQuestionnaire", "questionnaire"]);
});

check("INVARIANT: output is always a dupe-free subset of the spec's valid set, in the user's order", () => {
  const inputs = [
    ["worklist", "source"],
    ["fhirQuestionnaire"],
    [],
    ["zzz", "tree", "tree"],
    ["cel", "crl", "questionnaire", "worklist", "source", "tree", "fhirQuestionnaire"],
  ];
  for (const raw of inputs) {
    const out = mv(raw);
    assert.equal(new Set(out).size, out.length, `dupes in output for ${JSON.stringify(raw)}`);
    assert.ok(
      out.every((p) => MEDICAL_VALIDATION_PANE_SPEC.valid.includes(p)),
      `output contains a non-valid pane for ${JSON.stringify(raw)}`,
    );
    const listed = raw.filter((x) => MEDICAL_VALIDATION_PANE_SPEC.valid.includes(x));
    assert.deepEqual(out, [...new Set(listed)], `output is not the user's order for ${JSON.stringify(raw)}`);
  }
});
