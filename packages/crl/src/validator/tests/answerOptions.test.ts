import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { Validator } from "../validator";
import type { ValidationResult } from "../validator";

/**
 * ⭐⭐ #189 gap 2 — `value from`, a coded question's ANSWER OPTIONS.
 *
 * MEASURED on the real `$apply` path before any of this was built: with no `value[x].binding` the generated
 * questionnaire item carries NO options and the user cannot answer; with one it carries an inline
 * `answerOption` coding per member. So the binding IS the dropdown.
 *
 * ⚠ RULED (operator, 2026-09-01) on the absence posture: *"b)"* — a coded question with no answer set WARNS
 * now and ERRORS at the flip. It is a WARNING today because 9 in-tree concepts must migrate first (measured:
 * 9 of 634 carry `value type is CodeableConcept` + `code is`, 5 with no representation at all), and erroring
 * before they move would reject content that is correct under the language as shipped.
 */

const HEAD = [
  "# P",
  'library "L".',
  "",
  'terminology "Opts":',
  "- system is `http://www.ama-assn.org/go/cpt`.",
  "- code is `37718`.",
  "",
];

const validate = (conceptLines: string[]): ValidationResult => {
  const built = buildCRL([...HEAD, 'concept "C":', ...conceptLines].join("\n"));
  expect(built.success, JSON.stringify(built.errors)).toBe(true);
  return new Validator().validate(built.result!);
};

const answerKinds = (r: ValidationResult): string[] =>
  [...r.errors, ...r.warnings].map((e) => e.kind).filter((k) => String(k).startsWith("answer-options"));

const CODED_QUESTION = [
  "- shape is Record.",
  "- type is Observation.",
  "- value type is CodeableConcept.",
  "- code is `c`.",
  "- definition is most recent this.",
];

describe("#189 gap 2 — value from", () => {
  it("⭐ a coded question WITH answer options is clean", () => {
    const r = validate([...CODED_QUESTION.slice(0, 3), '- value from "Opts".', ...CODED_QUESTION.slice(3)]);
    expect(answerKinds(r)).toEqual([]);
  });

  it("⭐⭐ a coded question with NO answer options WARNS, and stays VALID", () => {
    const r = validate(CODED_QUESTION);
    expect(answerKinds(r)).toContain("answer-options-missing");
    // ⚠ A WARNING, never an error — see the header. Flipping validity here would reject the 9 concepts that
    // are correct under the language as shipped, before there is any migration for them to have done.
    expect(r.errors.map((e) => e.kind)).not.toContain("answer-options-missing");
    expect(r.isValid).toBe(true);
  });

  it("⭐ `value from` on a concept with NO `code is` is an ERROR — it is not answerable at all", () => {
    // Charter §3: "A question IS an answerable. One property: a local `code is`." Without one there is no
    // answer slot, so options describe a choice nobody is ever offered.
    const r = validate([
      "- shape is Record.",
      "- type is Observation.",
      "- value type is CodeableConcept.",
      '- value from "Opts".',
      '- coded from "Opts".',
    ]);
    expect(answerKinds(r)).toContain("answer-options-unanswerable");
  });

  it("⭐ `value from` on a NON-CODED value is an ERROR — options are codes", () => {
    const r = validate([
      "- shape is Record.",
      "- type is Observation.",
      "- value type is Quantity.",
      '- value from "Opts".',
      "- code is `c`.",
      "- definition is most recent this.",
    ]);
    expect(answerKinds(r)).toContain("answer-options-not-coded");
  });

  it("⚠ says NOTHING about a non-coded question — the absence warning must not cry on every concept", () => {
    // A warning that fires broadly gets muted, and then the real ones are invisible too. Scope is exactly
    // "coded AND answerable".
    const r = validate([
      "- shape is Record.",
      "- type is Observation.",
      "- value type is Quantity.",
      "- code is `c`.",
      "- definition is most recent this.",
    ]);
    expect(answerKinds(r)).toEqual([]);
  });

  it("⚠ a REPEATED `value from` is rejected at build — neither first nor last may silently win", () => {
    const built = buildCRL(
      [
        ...HEAD,
        'terminology "Other":',
        "- system is `http://www.ama-assn.org/go/cpt`.",
        "- code is `37722`.",
        "",
        'concept "C":',
        ...CODED_QUESTION.slice(0, 3),
        '- value from "Opts".',
        '- value from "Other".',
        ...CODED_QUESTION.slice(3),
      ].join("\n"),
    );
    expect(built.success, "two answer option sets are two different claims").toBe(false);
  });
});
