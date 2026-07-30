import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { validateCRLImports } from "../../imports/validate";
import { Validator, type ValidationError, type ValidationResult } from "../validator";

// #215 — the AgePredicateValidator rejects an unsanctioned age predicate (`age today <…>`
// OR `age at start of <…>`) with an unsupported comparator or non-year unit, at AUTHOR
// time, closing the validate/emit divergence (KE Ask 2). End-to-end via buildCRL (so
// classification has run) then the Validator, mirroring the real single-file path.

function validateFull(src: string): ValidationResult {
  const built = buildCRL(src);
  if (!built.success || !built.result) throw new Error("build failed: " + JSON.stringify(built.errors));
  return new Validator().validate(built.result);
}
function ageErrors(src: string): ValidationError[] {
  return validateFull(src).errors.filter((e) => e.kind === "age-predicate-unsupported");
}
const concept = (pred: string, extra = "") =>
  `library "T".\nconcept "C":\n- type is Observation.\n- value type is boolean.\n${extra}- definition is ${pred}.\n`;

describe("AgePredicateValidator (#215) — unsanctioned age predicates rejected at author time", () => {
  it("REJECTS an unsupported comparator (`less than`) — age today AND anchored", () => {
    const today = ageErrors(concept("age today less than 21 years"));
    expect(today).toHaveLength(1);
    expect(today[0].message).toMatch(/under/); // points at the sanctioned spelling
    if (today[0].kind === "age-predicate-unsupported") expect(today[0].conceptName).toBe("C");
    expect(ageErrors(concept('age at start of "Measurement Period" less than 21 years'))).toHaveLength(1);
  });

  it("REJECTS a non-year unit (both families)", () => {
    expect(ageErrors(concept("age today under 21 months"))).toHaveLength(1);
    expect(ageErrors(concept("age today at most 21 days"))).toHaveLength(1);
    expect(ageErrors(concept('age at start of "Measurement Period" at most 65 months'))).toHaveLength(1);
  });

  it("REJECTS on the BOTH-REP form too (code is + unsanctioned age)", () => {
    expect(ageErrors(concept("age today less than 21 years", "- code is `x`.\n"))).toHaveLength(1);
  });

  it("REJECTS incomplete / extra-token attempts (they emit an unmatched sentinel, so must not validate green)", () => {
    for (const pred of [
      "age today", // bare prefix, no comparator
      "age today under", // no quantity
      "age today under 21 years and older", // trailing garbage
      'age at start of "Measurement Period"', // bare anchored, no comparator (no legal bare form)
    ]) {
      expect(ageErrors(concept(pred)), pred).toHaveLength(1);
    }
  });

  it("ACCEPTS every sanctioned age-today comparator with a year unit — and the doc is otherwise VALID", () => {
    for (const pred of [
      "age today at least 18 years",
      "age today at most 21 years",
      "age today under 21 years",
      "age today younger than 18 years",
      "age today under 1 year",
    ]) {
      const r = validateFull(concept(pred));
      expect(r.errors, pred).toHaveLength(0);
      expect(r.isValid, pred).toBe(true);
    }
  });

  it("ACCEPTS every sanctioned ANCHORED comparator (no age-predicate error; the anchor ref itself is orthogonal)", () => {
    for (const pred of [
      'age at start of "Measurement Period" at least 18 years',
      'age at start of "Measurement Period" at most 65 years',
      'age at start of "Measurement Period" under 21 years',
    ]) {
      // `"Measurement Period"` is a project/reserved anchor unresolved in single-file mode;
      // that is NOT this validator's concern — assert only that NO age-predicate error fires.
      expect(ageErrors(concept(pred)), pred).toHaveLength(0);
    }
  });

  it("does NOT false-positive the ONLY legal bare age calculation (`age at <ConceptRef>`, 3-element)", () => {
    // `age at "X"` (no `start of`) is the bare AgeAt calculation — a different prefix, not screened.
    const errs = ageErrors(
      `library "T".\nconcept "Anchor":\n- type is Observation.\n- code is \`a\`.\nconcept "C":\n- type is Observation.\n- value type is Quantity.\n- definition is age at "Anchor".\n`,
    );
    expect(errs).toHaveLength(0);
  });

  it("does NOT touch `sem-not` over an age concept (operator decision — it lives in `defined as`, not `definition is`)", () => {
    const errs = ageErrors(
      `library "T".\nconcept "Age 21 Or Older":\n- type is Observation.\n- value type is boolean.\n- code is \`a21\`.\n- definition is age today at least 21 years.\nconcept "Under 21":\n- type is Observation.\n- value type is boolean.\n- defined as ( sem-not "Age 21 Or Older" ).\n`,
    );
    expect(errs).toHaveLength(0);
  });

  it("is NOT soft-demoted — an author error stays an error under `soft`", () => {
    const built = buildCRL(concept("age today less than 21 years"));
    if (!built.success || !built.result) throw new Error("build failed");
    const r = new Validator().validate(built.result, { soft: true });
    expect(r.errors.some((e) => e.kind === "age-predicate-unsupported")).toBe(true);
    expect(r.warnings.some((e) => e.kind === "age-predicate-unsupported")).toBe(false);
  });

  it("MULTI-FILE: the diagnostic carries filePath + libraryName (project path), not the wrong-file fallback", () => {
    const dir = mkdtempSync(join(tmpdir(), "age-pred-mf-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "age-pred-mf", version: "0.0.0", crl: { canonicalBase: "http://example.org/age-pred-mf" } }));
    const crlPath = join(dir, "policy.crl");
    writeFileSync(crlPath, concept("age today less than 21 years"));
    const result = validateCRLImports(crlPath);
    const errs = result.validationErrors.filter((e) => e.kind === "age-predicate-unsupported");
    expect(errs).toHaveLength(1);
    expect(errs[0].filePath).toBe(crlPath);
    expect(errs[0].libraryName).toBe("T");
  });
});
