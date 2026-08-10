import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { validateCRLImports } from "../../imports/validate";
import { Validator, type ValidationError, type ValidationResult } from "../validator";

// #215 / #257 — the AgePredicateValidator at AUTHOR time:
//  - RETIRES any `definition is age today …` (the carve-out migrated to a Patient age `source
//    representation`), pointing at the posrep fix (#257);
//  - keeps rejecting an unsanctioned ANCHORED `age at start of …` (unsupported comparator / non-
//    year unit, #215) — anchored age stays a concept-level `definition is`;
//  - rejects a posrep `value projection is age today …` that is unsanctioned or on the wrong
//    carrier.
// All carry `kind: "age-predicate-unsupported"` with a `reason` sub-discriminator. End-to-end via
// buildCRL (so classification has run) then the Validator, mirroring the real single-file path.

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
// The migrated posrep form: a Patient age `source representation` (optionally with a local
// `code is` override) whose `value projection` computes live age over Patient.birthDate.
const posrepConcept = (projection: string, extra = "") =>
  `library "T".\nconcept "C":\n- value type is boolean.\n${extra}- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is ${projection}.\n`;

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

  it("RETIRES every `definition is age today …` (sanctioned or not) with a migration-pointing error (#257)", () => {
    for (const pred of [
      "age today at least 18 years",
      "age today at most 21 years",
      "age today under 21 years",
      "age today younger than 18 years",
      "age today under 1 year",
    ]) {
      const errs = ageErrors(concept(pred));
      expect(errs, pred).toHaveLength(1);
      if (errs[0].kind === "age-predicate-unsupported") {
        expect(errs[0].reason, pred).toBe("definition-retired");
      }
      // The migration message points at the posrep replacement.
      expect(errs[0].message, pred).toMatch(/source representation/);
      expect(errs[0].message, pred).toMatch(/Patient\.birthDate/);
    }
  });

  it("ACCEPTS the migrated posrep form — a sanctioned `value projection is age today …` on the Patient carrier validates clean (YEARS and MONTHS, #257 T2)", () => {
    for (const proj of [
      "age today at least 18 years",
      "age today at most 21 years",
      "age today under 21 years",
      "age today younger than 18 years",
      // #257 T2 — months are now sanctioned (rx501-098); plural AND singular unit.
      "age today at least 6 months",
      "age today at most 6 months",
      "age today under 6 months",
      "age today younger than 6 months",
      "age today under 1 month",
    ]) {
      // Standalone (no local override) AND with a local `code is` override both validate clean.
      expect(ageErrors(posrepConcept(proj)), proj).toHaveLength(0);
      expect(ageErrors(posrepConcept(proj, "- code is `x`.\n")), `${proj} + code`).toHaveLength(0);
    }
  });

  it("REJECTS the concept-shape lattice at AUTHOR time (validate/emit parity — no green-then-emit-fails)", () => {
    // A non-boolean concept value type on an age projection.
    const nonBool = ageErrors(posrepConcept("age today at least 18 years").replace("value type is boolean", "value type is Quantity"));
    expect(nonBool).toHaveLength(1);
    if (nonBool[0].kind === "age-predicate-unsupported") expect(nonBool[0].reason).toBe("projection-shape");
    // A top-level definition + age posrep with no `code is` (the age posrep would be silently dropped
    // at emit without this rule).
    const defPlusPosrep = ageErrors(
      `library "T".\nconcept "X":\n- type is Observation.\n- value type is boolean.\n- code is \`x\`.\nconcept "C":\n- value type is boolean.\n- defined as "X".\n- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age today at least 18 years.\n`,
    ).filter((e) => e.kind === "age-predicate-unsupported" && e.reason === "projection-shape");
    expect(defPlusPosrep).toHaveLength(1);
    // A `code is` + age posrep on an explicit non-Observation local type.
    const nonObs = ageErrors(
      posrepConcept("age today at least 18 years", "- type is Condition.\n- code is `c`.\n"),
    ).filter((e) => e.kind === "age-predicate-unsupported" && e.reason === "projection-shape");
    expect(nonObs).toHaveLength(1);
  });

  it("REJECTS a posrep age projection that is unsanctioned or on the wrong carrier", () => {
    // Unsanctioned comparator on the Patient carrier → projection-unsupported.
    const unsup = ageErrors(posrepConcept("age today less than 21 years"));
    expect(unsup).toHaveLength(1);
    if (unsup[0].kind === "age-predicate-unsupported") expect(unsup[0].reason).toBe("projection-unsupported");
    // UNSANCTIONED units (days AND weeks — not years/months even after #257 T2) → projection-unsupported.
    for (const unit of ["days", "weeks"]) {
      const unsupUnit = ageErrors(posrepConcept(`age today under 21 ${unit}`));
      expect(unsupUnit, unit).toHaveLength(1);
      if (unsupUnit[0].kind === "age-predicate-unsupported") expect(unsupUnit[0].reason, unit).toBe("projection-unsupported");
    }
    // A sanctioned age-today projection on the WRONG carrier (Observation, not Patient) →
    // projection-wrong-carrier.
    const wrong =
      `library "T".\nconcept "C":\n- value type is boolean.\n- source representation:\n` +
      `  - type is Observation.\n  - value element is Observation.value.\n  - value type is boolean.\n` +
      `  - value projection is age today at least 18 years.\n`;
    const wc = ageErrors(wrong);
    expect(wc).toHaveLength(1);
    if (wc[0].kind === "age-predicate-unsupported") expect(wc[0].reason).toBe("projection-wrong-carrier");
  });

  it("REJECTS a concept with TWO age `source representation`s of DIFFERENT units (exactly-one rule; validator/emit parity — disc 410 Q4)", () => {
    const src =
      `library "T".\nconcept "Two Units":\n- value type is boolean.\n- code is \`tu\`.\n` +
      `- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age today at least 18 years.\n` +
      `- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age today under 6 months.\n`;
    const errs = ageErrors(src);
    expect(errs.length).toBeGreaterThanOrEqual(1);
    expect(errs.some((e) => /more than one age .*source representation/.test(e.message))).toBe(true);
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
    // "Age 21 Or Older" authored in the migrated posrep form (local override + Patient age
    // projection); the `sem-not` over it is orthogonal to the age validator.
    const errs = ageErrors(
      `library "T".\nconcept "Age 21 Or Older":\n- value type is boolean.\n- code is \`a21\`.\n- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age today at least 21 years.\nconcept "Under 21":\n- type is Observation.\n- value type is boolean.\n- defined as ( sem-not "Age 21 Or Older" ).\n`,
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
