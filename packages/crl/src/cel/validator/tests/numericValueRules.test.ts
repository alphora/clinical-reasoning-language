import * as path from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";

import { describe, it, expect } from "vitest";

import { validateCELFile } from "../validator";
import type { CELValidationResult } from "../types";

/**
 * ⭐⭐ The NUMERIC cell of the value-type × literal-shape table (disc 529, both panel arms).
 *
 * ⚠⚠ A UNITLESS NUMBER IS A DIMENSIONLESS ONE, NOT AN UNDECIDED ONE — and that is the whole reason these
 * rules are ERRORS. `FHIRHelpers.ToQuantity` coalesces `Coalesce(code, unit, '1')`, so a FHIR Quantity
 * written with no unit becomes `System.Quantity{unit:'1'}` and EVERY comparison against a real unit is NULL.
 *
 * MEASURED on the cqf engine, with a control: the same BMI answer of 35 pauses the tree when unitless and
 * APPROVES when it carries `'kg/m2'`. And before this rule existed, SEVEN COMMITTED GOLDENS shipped unitless
 * quantities — goldens are the pinned spec of correct output, so we were shipping dimensionless data as
 * correct. A fact that reads `value is 90` and executes as null in every comparison is the charter's
 * canonical invisible intent-vs-execution gap (§0).
 *
 * ⚠ The unit is AUTHOR-OWNED and checked only for presence, never against a UCUM lexicon. Proving membership
 * in a code system is the trap this project refuses everywhere else.
 */

const POLICY = [
  "# P",
  'library "L".',
  'terminology "BMI VS":',
  "- valueset is `http://example.org/v/ValueSet/bmi`.",
  // a Quantity datum — the unit-REQUIRED arm
  'concept "Body Weight":',
  "- shape is Record.",
  "- type is Observation.",
  "- value type is Quantity.",
  "- code is `weight`.",
  "- definition is most recent this.",
  "- source representation:",
  "  - type is Observation.",
  '  - coded from "BMI VS".',
  // an integer datum — the unit-FORBIDDEN arm. ⭐ A dimensionless integer is a first-class shape; the
  // charter's own worked example declares `value type is integer`, so forcing `'1'` onto it would be noise.
  'concept "Visit Count":',
  "- shape is Scalar.",
  "- type is Observation.",
  "- value type is integer.",
  "- code is `visits`.",
  // a CodeableConcept datum — a number is simply the wrong literal shape. This is the cms22 cell: a fact
  // stated `value is 118` against a `value type is CodeableConcept` concept, and it validated AND emitted
  // silently before this rule (the emitter's legacy switch sent every number to `valueQuantity`).
  'concept "Coded Thing":',
  "- shape is Scalar.",
  "- type is Observation.",
  "- value type is CodeableConcept.",
  "- code is `coded-thing`.",
].join("\n");

function validateInline(factsAndCases: string): CELValidationResult {
  const root = mkdtempSync(path.join(os.tmpdir(), "numeric-value-rules-"));
  try {
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "l",
        version: "0.0.0",
        private: true,
        crl: { canonicalBase: "http://example.org/v" },
      }),
    );
    writeFileSync(path.join(root, "policy.crl"), POLICY);
    const cel = path.join(root, "cases.cel");
    writeFileSync(
      cel,
      [
        "# C",
        'library "C".',
        'covers "L".',
        'fact "Pat":',
        '- name is "Pat".',
        '- birth date is "1970-01-01".',
        '- defined by "Patient".',
        factsAndCases,
      ].join("\n"),
    );
    return validateCELFile(cel);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const kinds = (r: CELValidationResult): string[] => r.errors.map((e) => e.kind);

const withFact = (fact: string): string =>
  [fact, 'case "c":', '- subject is "Pat".', '- fact is "F".', '- result is "D" is "Deny".'].join("\n");

describe("#189 — the NUMERIC value-type × literal-shape table", () => {
  it("⭐ a Quantity target REQUIRES a unit — the shape that shipped dimensionless in seven goldens", () => {
    const r = validateInline(withFact(['fact "F":', "- value is 90.", '- defined by "L"."Body Weight".'].join("\n")));
    expect(kinds(r)).toContain("quantity-value-missing-unit");
  });

  it("⭐ a Quantity target WITH a unit is clean", () => {
    const r = validateInline(
      withFact(['fact "F":', "- value is 90 'kg'.", '- defined by "L"."Body Weight".'].join("\n")),
    );
    expect(kinds(r)).not.toContain("quantity-value-missing-unit");
    expect(kinds(r)).not.toContain("dimensionless-value-with-unit");
    expect(kinds(r)).not.toContain("value-type-mismatch");
  });

  it("⚠ an EMPTY unit is not a unit", () => {
    const r = validateInline(withFact(['fact "F":', "- value is 90 ' '.", '- defined by "L"."Body Weight".'].join("\n")));
    expect(kinds(r)).toContain("quantity-value-empty-unit");
  });

  it("⚠ an integer target FORBIDS a unit — a dimensionless datum is first-class, not an under-specified Quantity", () => {
    const r = validateInline(
      withFact(['fact "F":', "- value is 3 'kg'.", '- defined by "L"."Visit Count".'].join("\n")),
    );
    expect(kinds(r)).toContain("dimensionless-value-with-unit");
  });

  it("an integer target WITHOUT a unit is clean", () => {
    const r = validateInline(withFact(['fact "F":', "- value is 3.", '- defined by "L"."Visit Count".'].join("\n")));
    // Scoped to THIS table's kinds: the inline harness's `result is "D"` names a decision the mini-policy
    // does not define, so an unrelated `unresolved-result-leaf` is expected and is not what this pins.
    expect(kinds(r)).not.toContain("dimensionless-value-with-unit");
    expect(kinds(r)).not.toContain("quantity-value-missing-unit");
    expect(kinds(r)).not.toContain("value-type-mismatch");
  });

  it("⭐ a NUMBER for a CodeableConcept target is a MISMATCH — the cms22 cell, silent until now", () => {
    // `cms22.cel` stated `value is 118` against `"Systolic Blood Pressure Code"` (`value type is
    // CodeableConcept`) and BOTH lanes accepted it: no validator rule covered the pair, and the emitter's
    // legacy switch sent every number to `valueQuantity`. The fixture is migrated to the Quantity-typed
    // sibling that already existed beside it; this pins the rule that would have caught it.
    const r = validateInline(withFact(['fact "F":', "- value is 118.", '- defined by "L"."Coded Thing".'].join("\n")));
    expect(kinds(r)).toContain("value-type-mismatch");
  });

  it("⚠ a bare-type fact declares no datum contract, so it is NOT judged here", () => {
    // `defined by "Observation"` names a FHIR type, not a concept — there is no declared value type to check
    // against, and inferring one would be exactly the guess this table exists to avoid.
    const r = validateInline(withFact(['fact "F":', "- value is 90.", '- defined by "Observation".'].join("\n")));
    expect(kinds(r)).not.toContain("quantity-value-missing-unit");
    expect(kinds(r)).not.toContain("value-type-mismatch");
  });
});
