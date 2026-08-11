import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { validateCRLImports } from "../../imports/validate";
import {
  Validator,
  type ReductionShapeError,
  type ReductionShapeRule,
  type ValidationResult,
} from "../validator";

// #189 grammar+validation slice — IMPL 2a: the reduction/shape COHERENCE validator. Every finding is
// an intrinsic WARNING (validate-only, one version ahead of the emit flip), so `isValid` stays true
// and the findings land on `result.warnings`. End-to-end via buildCRL → Validator (the real
// single-file path), mirroring representationShape.test.ts.

function validateFull(src: string): ValidationResult {
  const built = buildCRL(src);
  if (!built.success || !built.result) {
    throw new Error("build failed: " + JSON.stringify(built.errors));
  }
  return new Validator().validate(built.result);
}

/** Reduction-shape WARNINGS (they live on `.warnings`, never `.errors` — always warning-severity). */
function redWarnings(src: string, rule?: ReductionShapeRule, conceptName?: string): ReductionShapeError[] {
  return validateFull(src).warnings.filter(
    (e): e is ReductionShapeError =>
      e.kind === "reduction-shape" &&
      (rule === undefined || e.rule === rule) &&
      (conceptName === undefined || e.conceptName === conceptName),
  );
}

// A named `shape is RecordSet` operand with a real record-yielding rep (a dated Observation posrep),
// reused so operand-shape checks resolve to a coherent RecordSet without spurious warnings on it.
const RECORDSET_X =
  `concept "X":\n- type is Observation.\n- shape is RecordSet.\n` +
  `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n`;

describe("ReductionShapeValidator (#189 IMPL 2a) — reduction/shape coherence WARNINGS", () => {
  // The whole point of the slice: every finding is validate-only. `isValid` never flips.
  it("every reduction-shape finding is a WARNING — isValid stays true", () => {
    const r = validateFull(`library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n`);
    expect(r.isValid).toBe(true);
    expect(r.warnings.some((e) => e.kind === "reduction-shape")).toBe(true);
    expect(r.errors.some((e) => e.kind === "reduction-shape")).toBe(false);
  });

  // ---------------------------------------------------------------- recordset-operand-required
  describe("recordset-operand-required — a named reduction operand must be `shape is RecordSet`", () => {
    it("WARNS when `exists \"X\"` resolves to a non-RecordSet (Scalar) operand", () => {
      const src =
        `library "T".\nconcept "X":\n- value type is boolean.\n- code is \`x\`.\n` +
        `concept "C":\n- value type is boolean.\n- definition is exists "X".\n`;
      const w = redWarnings(src, "recordset-operand-required", "C");
      expect(w).toHaveLength(1);
      expect(w[0].message).toMatch(/shape is RecordSet/);
    });

    it("is CLEAN when the operand is `shape is RecordSet`", () => {
      const src = `library "T".\n${RECORDSET_X}` + `concept "C":\n- value type is boolean.\n- definition is exists "X".\n`;
      expect(redWarnings(src, "recordset-operand-required")).toHaveLength(0);
    });

    it("does not fire on `exists this` (no named operand)", () => {
      const src = `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is exists this.\n`;
      expect(redWarnings(src, "recordset-operand-required")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- reduction-result-nonboolean
  describe("reduction-result-nonboolean — exists/count on a Scalar concept typed non-boolean", () => {
    it("WARNS for `exists \"X\"` on a Quantity-typed Scalar concept", () => {
      const src = `library "T".\n${RECORDSET_X}` + `concept "C":\n- value type is Quantity.\n- definition is exists "X".\n`;
      expect(redWarnings(src, "reduction-result-nonboolean", "C")).toHaveLength(1);
    });

    it("WARNS for `count this at least 2` typed dateTime", () => {
      const src =
        `library "T".\nconcept "C":\n- value type is dateTime.\n- code is \`c\`.\n- definition is count this at least 2.\n`;
      expect(redWarnings(src, "reduction-result-nonboolean", "C")).toHaveLength(1);
    });

    it("is CLEAN for a boolean-typed exists", () => {
      const src = `library "T".\n${RECORDSET_X}` + `concept "C":\n- value type is boolean.\n- definition is exists "X".\n`;
      expect(redWarnings(src, "reduction-result-nonboolean")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- reduction-this-no-representation
  describe("reduction-this-no-representation — `<reduction> this` needs ≥1 own record", () => {
    it("WARNS for `exists this` on a concept with no representation", () => {
      const src = `library "T".\nconcept "C":\n- value type is boolean.\n- definition is exists this.\n`;
      expect(redWarnings(src, "reduction-this-no-representation", "C")).toHaveLength(1);
    });

    it("is CLEAN when the concept has a `code is`", () => {
      const src = `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is exists this.\n`;
      expect(redWarnings(src, "reduction-this-no-representation")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- reduction-multi-rep
  describe("reduction-multi-rep — `most recent this` / `count this` with >1 representation", () => {
    it("WARNS for `most recent this` over a `code is` + one posrep (2 reps)", () => {
      const src =
        `library "T".\nconcept "C":\n- value type is Quantity.\n- code is \`c\`.\n` +
        `- definition is most recent this.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n`;
      expect(redWarnings(src, "reduction-multi-rep", "C")).toHaveLength(1);
    });

    it("is CLEAN for `most recent this` over a single representation", () => {
      const src =
        `library "T".\nconcept "C":\n- value type is Quantity.\n- code is \`c\`.\n- definition is most recent this.\n`;
      expect(redWarnings(src, "reduction-multi-rep")).toHaveLength(0);
    });

    it("does not fire on `exists this` (exists is not multi-rep-ambiguous)", () => {
      const src =
        `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n` +
        `- definition is exists this.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is boolean.\n`;
      expect(redWarnings(src, "reduction-multi-rep")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- recordset-scalar-reduction
  describe("recordset-scalar-reduction — a RecordSet must not carry a reduction", () => {
    it("WARNS for `shape is RecordSet` + `exists this`", () => {
      const src =
        `library "T".\nconcept "C":\n- type is Observation.\n- shape is RecordSet.\n- code is \`c\`.\n` +
        `- definition is exists this.\n`;
      expect(redWarnings(src, "recordset-scalar-reduction", "C")).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------- recordset-bare-code-incoherent
  describe("recordset-bare-code-incoherent — a bare `code is` is an existence, not a record set", () => {
    it("WARNS for `shape is RecordSet` + a lone `code is`", () => {
      const src = `library "T".\nconcept "C":\n- type is Condition.\n- shape is RecordSet.\n- code is \`c\`.\n`;
      expect(redWarnings(src, "recordset-bare-code-incoherent", "C")).toHaveLength(1);
    });

    it("is CLEAN for a `shape is RecordSet` sourced from a posrep", () => {
      const src = `library "T".\n${RECORDSET_X}`;
      expect(redWarnings(src, "recordset-bare-code-incoherent")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- record-shape-invariant
  describe("record-shape-invariant — a Record selects one record via `most recent`", () => {
    it("WARNS for `shape is Record` with no record-selecting reduction", () => {
      const src = `library "T".\nconcept "C":\n- type is Condition.\n- shape is Record.\n- code is \`c\`.\n`;
      expect(redWarnings(src, "record-shape-invariant", "C")).toHaveLength(1);
    });

    it("is CLEAN for `shape is Record` + `most recent this`", () => {
      const src =
        `library "T".\nconcept "C":\n- type is Observation.\n- shape is Record.\n- code is \`c\`.\n` +
        `- definition is most recent this.\n`;
      expect(redWarnings(src, "record-shape-invariant")).toHaveLength(0);
    });

    it("is CLEAN for `shape is Record` + the UN-folded narrative `most recent \"X\"`", () => {
      const src =
        `library "T".\n${RECORDSET_X}` +
        `concept "C":\n- type is Observation.\n- shape is Record.\n- definition is most recent "X".\n`;
      expect(redWarnings(src, "record-shape-invariant")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- no-bare-scalar-code (⚠ corpus-wide)
  describe("no-bare-scalar-code — THE migration prompt (Scalar bare `code is`, no reduction)", () => {
    it("WARNS a bare boolean `code is`, steering to `exists this` AND warning the reduction bricks emit until the flip (F1)", () => {
      const src = `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n`;
      const w = redWarnings(src, "no-bare-scalar-code", "C");
      expect(w).toHaveLength(1);
      expect(w[0].message).toMatch(/exists this/);
      // F1 [critical]: the migration prompt must warn that authoring the reduction NOW fails emit
      // (emit-mixed-code-and-definition) until the flip — else a KE follows it straight into a hard error.
      expect(w[0].message).toMatch(/emit-mixed-code-and-definition/);
      expect(w[0].message).toMatch(/until the flip/);
    });

    it("WARNS a bare Quantity `code is`, steering to `most recent this`", () => {
      const src = `library "T".\nconcept "C":\n- value type is Quantity.\n- code is \`c\`.\n`;
      const w = redWarnings(src, "no-bare-scalar-code", "C");
      expect(w).toHaveLength(1);
      expect(w[0].message).toMatch(/most recent this/);
    });

    it("conditions the action on repCount: a `code is` + posrep Scalar steers to a named RecordSet, not `most recent this` (F6)", () => {
      // repCount 2 (code + posrep): a `most recent this` here would immediately trip reduction-multi-rep,
      // so the action steers to promoting one representation instead of chaining into another warning.
      const src =
        `library "T".\nconcept "C":\n- value type is Quantity.\n- code is \`c\`.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n`;
      const w = redWarnings(src, "no-bare-scalar-code", "C");
      expect(w).toHaveLength(1);
      expect(w[0].message).toMatch(/promote a single representation/);
    });

    it("EXEMPTS a `code is` + `defined as` both-rep (a satisfying reduction)", () => {
      const src =
        `library "T".\nconcept "Src":\n- value type is boolean.\n- code is \`s\`.\n` +
        `concept "C":\n- value type is boolean.\n- code is \`c\`.\n- defined as "Src".\n`;
      // "Src" itself warns (it is a bare code); "C" is exempt (its definition slot is a satisfying reduction).
      expect(redWarnings(src, "no-bare-scalar-code", "C")).toHaveLength(0);
    });

    it("EXEMPTS a concept that already reduces (`exists this`)", () => {
      const src = `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is exists this.\n`;
      expect(redWarnings(src, "no-bare-scalar-code")).toHaveLength(0);
    });

    it("does not fire on a code-less concept (nothing to migrate)", () => {
      const src = `library "T".\n${RECORDSET_X}` + `concept "C":\n- value type is boolean.\n- definition is exists "X".\n`;
      expect(redWarnings(src, "no-bare-scalar-code")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- non-scalar-missing-type
  describe("non-scalar-missing-type — a record shape needs its resource declared", () => {
    it("WARNS a `shape is RecordSet` with a `code is` but no `type is`", () => {
      const src = `library "T".\nconcept "C":\n- shape is RecordSet.\n- code is \`c\`.\n`;
      expect(redWarnings(src, "non-scalar-missing-type", "C")).toHaveLength(1);
    });

    it("is CLEAN when `type is` is declared", () => {
      const src = `library "T".\nconcept "C":\n- type is Condition.\n- shape is RecordSet.\n- code is \`c\`.\n`;
      expect(redWarnings(src, "non-scalar-missing-type")).toHaveLength(0);
    });

    it("EXEMPTS a pure derive-from-operand record concept (no own rep, derives from a named set)", () => {
      const src =
        `library "T".\n${RECORDSET_X}` +
        `concept "C":\n- shape is Record.\n- definition is most recent "X".\n`;
      expect(redWarnings(src, "non-scalar-missing-type")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- shape-marker-not-emit-active
  describe("shape-marker-not-emit-active — honest note: emit does not consult `shape` yet", () => {
    it("WARNS a non-Scalar shape marker on a still-emitting (live) concept", () => {
      const src = `library "T".\nconcept "C":\n- type is Condition.\n- shape is RecordSet.\n- code is \`c\`.\n`;
      const w = redWarnings(src, "shape-marker-not-emit-active", "C");
      expect(w).toHaveLength(1);
      expect(w[0].message).toMatch(/emit does not yet consult/);
    });

    it("does NOT fire on a default (implicit) Scalar concept", () => {
      const src = `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n`;
      expect(redWarnings(src, "shape-marker-not-emit-active")).toHaveLength(0);
    });

    it("does NOT fire on a pure reduction (it already fails loud at emit, not a live lane)", () => {
      const src =
        `library "T".\nconcept "C":\n- type is Observation.\n- shape is Record.\n- code is \`c\`.\n` +
        `- definition is most recent this.\n`;
      expect(redWarnings(src, "shape-marker-not-emit-active")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- count-threshold-trivial
  describe("count-threshold-trivial — `count … at least N` with N < 1", () => {
    it("WARNS for `count this at least 0`", () => {
      const src =
        `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is count this at least 0.\n`;
      expect(redWarnings(src, "count-threshold-trivial", "C")).toHaveLength(1);
    });

    it("is CLEAN for `count this at least 1`", () => {
      const src =
        `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is count this at least 1.\n`;
      expect(redWarnings(src, "count-threshold-trivial")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- multi-file (sources) arm (F4)
  describe("multi-file (project) path — sources arm, origin-keyed index, attribution, self-scope resolution", () => {
    // Exercises validate(ast, sources): buildConceptIndex's sources arm, the origin-keyed operand
    // resolution, and libraryName/filePath attribution — none of which the single-file tests reach.
    function mfWarnings(files: { name: string; src: string }[], entry: string): ReductionShapeError[] {
      const dir = mkdtempSync(join(tmpdir(), "redshape-mf-"));
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "redshape-mf", version: "0.0.0", crl: { canonicalBase: "http://example.org/redshape-mf" } }),
      );
      let entryPath = "";
      for (const f of files) {
        const p = join(dir, f.name);
        writeFileSync(p, f.src);
        if (f.name === entry) entryPath = p;
      }
      const result = validateCRLImports(entryPath);
      return result.validationWarnings.filter((e): e is ReductionShapeError => e.kind === "reduction-shape");
    }

    it("resolves a SAME-FILE operand and carries filePath + libraryName on the warning", () => {
      // X (Scalar bare code) + C (`exists "X"`) in ONE library file → recordset-operand-required
      // resolves the operand in self-scope and the warning carries the project attribution.
      const src =
        `library "T".\nconcept "X":\n- value type is boolean.\n- code is \`x\`.\n` +
        `concept "C":\n- value type is boolean.\n- definition is exists "X".\n`;
      const w = mfWarnings([{ name: "policy.crl", src }], "policy.crl").filter(
        (e) => e.rule === "recordset-operand-required" && e.conceptName === "C",
      );
      expect(w).toHaveLength(1);
      expect(w[0].filePath?.endsWith("policy.crl")).toBe(true);
      expect(w[0].libraryName).toBe("T");
    });

    it("emits the corpus-wide no-bare-scalar-code migration prompt with project attribution", () => {
      const src = `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n`;
      const w = mfWarnings([{ name: "policy.crl", src }], "policy.crl").filter(
        (e) => e.rule === "no-bare-scalar-code",
      );
      expect(w).toHaveLength(1);
      expect(w[0].libraryName).toBe("T");
      expect(w[0].filePath?.endsWith("policy.crl")).toBe(true);
    });
  });
});
