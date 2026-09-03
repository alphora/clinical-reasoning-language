import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { validateCRLImports } from "../../imports/validate";
import {
  Validator,
  type RepresentationShapeError,
  type RepresentationShapeRule,
  type ValidationResult,
} from "../validator";

// concept-model redesign Todo 2 — the STATIC representation-shape validator. Todo 1 made
// posreps / `value element is` / rep-level `value projection is` / `defined as exists` PARSE; these tests
// pin the validate errors that make the malformed forms loud. End-to-end via buildCRL → Validator
// (the real single-file path), mirroring agePredicate.test.ts.

function validateFull(src: string): ValidationResult {
  const built = buildCRL(src);
  if (!built.success || !built.result) {
    throw new Error("build failed: " + JSON.stringify(built.errors));
  }
  return new Validator().validate(built.result);
}
function shapeErrors(src: string, rule?: RepresentationShapeRule): RepresentationShapeError[] {
  return validateFull(src).errors.filter(
    (e): e is RepresentationShapeError =>
      e.kind === "representation-shape" && (rule === undefined || e.rule === rule),
  );
}

describe("RepresentationShapeValidator (Todo 2) — static shape rules", () => {
  // ---------------------------------------------------------------- A.1
  describe("A.1 incomplete-representation — a posrep is fully explicit", () => {
    it("ACCEPTS a posrep that is `type is` + `coded from` — the CANONICAL form", () => {
      // #189, 2026-08-28. This test previously asserted the OPPOSITE: that a posrep missing `value element`
      // + `value type` is REJECTED ("a posrep is ALWAYS fully explicit"). That rule is retired.
      //
      // A representation is `type is` + the arguments its projection declares (charter §3). Requiring an
      // element the projection already knows forced authors to state something FALSE — to satisfy the old
      // rule for `value projection is exists this.` over a Condition you had to write
      // `value element is Condition.code.` + `value type is boolean.`, asserting that element yields a
      // boolean. It yields a CodeableConcept, and existence reads neither. With the canonical carriers ruled
      // (Observation → `Observation.value`, Condition → `onset`) a bare read needs no declaration either.
      const src =
        `library "T".\nterminology "VS":\n- valueset is \`http://x/VS\`.\n` +
        `concept "Mammogram (ImagingStudy)":\n- value type is dateTime.\n` +
        `- source representation:\n  - type is ImagingStudy.\n  - coded from "VS".\n`;
      expect(shapeErrors(src, "incomplete-representation")).toHaveLength(0);
    });

    it("REJECTS a posrep missing type", () => {
      const src =
        `library "T".\nterminology "VS":\n- valueset is \`http://x/VS\`.\n` +
        `concept "C":\n- value type is Quantity.\n` +
        `- source representation:\n  - value element is Observation.value.\n  - value type is Quantity.\n  - coded from "VS".\n`;
      const errs = shapeErrors(src, "incomplete-representation");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/`type`/);
    });

    it("ACCEPTS a fully-explicit posrep (type + value element + value type; coded from optional)", () => {
      const coded =
        `library "T".\nterminology "VS":\n- valueset is \`http://x/VS\`.\n` +
        `concept "C":\n- value type is Quantity.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n  - coded from "VS".\n`;
      expect(shapeErrors(coded)).toHaveLength(0);
      // `coded from` is optional (Patient/birthDate has none). `value type is dateTime` (not
      // `date` — that value type lands in Todo 4 with the kit migration).
      const uncoded =
        `library "T".\nconcept "Age":\n- value type is dateTime.\n` +
        `- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is dateTime.\n`;
      expect(shapeErrors(uncoded)).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- A.2
  describe("A.2 value-element-invalid — path shape", () => {
    it("REJECTS a single-segment value element path", () => {
      const src =
        `library "T".\nconcept "C":\n- value type is Quantity.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is value.\n  - value type is Quantity.\n`;
      const errs = shapeErrors(src, "value-element-invalid");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/single segment/);
    });

    it("REJECTS a path whose root disagrees with the rep type", () => {
      const src =
        `library "T".\nconcept "C":\n- value type is dateTime.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is ImagingStudy.started.\n  - value type is dateTime.\n`;
      const errs = shapeErrors(src, "value-element-invalid");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/not on type `Observation`/);
    });
  });

  // ---------------------------------------------------------------- A.3
  describe("A.3 value-element-without-code — concept-level value element needs code is", () => {
    it("REJECTS a concept-level value element with no local code", () => {
      // Grammar order: value element precedes value type. Concept has a `definition is`
      // producer (so build doesn't reject for no-producer) but no `code is` → A.3 fires.
      const src =
        `library "T".\nconcept "C":\n- value element is Observation.value.\n- value type is Quantity.\n` +
        `- definition is most recent "C".\n`;
      const errs = shapeErrors(src, "value-element-without-code");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/no local `code is`/);
    });

    it("ACCEPTS a concept-level value element alongside a code is", () => {
      const src =
        `library "T".\nconcept "C":\n- type is Observation.\n- value element is Observation.value.\n` +
        `- value type is Quantity.\n- code is \`c\`.\n`;
      expect(shapeErrors(src, "value-element-without-code")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- A.5
  describe("A.5 value-projection-references-concept — a value projection must not reference a concept", () => {
    it("REJECTS a `value projection is` carrying a concept ref", () => {
      const src =
        `library "T".\nconcept "Weight":\n- value type is Quantity.\n- code is \`w\`.\n` +
        `concept "C":\n- value type is boolean.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n` +
        `  - value projection is most recent "Weight".\n`;
      const errs = shapeErrors(src, "value-projection-references-concept");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/use `definition is …` ABOVE/);
    });

    it("ACCEPTS a value projection that computes over its own datum (no concept ref)", () => {
      const src =
        `library "T".\nconcept "Age 18 Or Older":\n- value type is boolean.\n` +
        `- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is dateTime.\n` +
        `  - value projection is age today at least 18 years.\n`;
      expect(shapeErrors(src, "value-projection-references-concept")).toHaveLength(0);
    });

    it("REJECTS a value projection referencing a PARAMETER too (a narrative ref may resolve to either)", () => {
      const src =
        `library "T".\nparameter "Measurement Period":\n- param type is Period.\n` +
        `concept "C":\n- value type is boolean.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n` +
        `  - value projection is age at start of "Measurement Period" at least 18 years.\n`;
      const errs = shapeErrors(src, "value-projection-references-concept");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/concept or parameter/);
    });
  });

  // ---------------------------------------------------------------- A.6
  describe("A.6 duplicate-representation-key — reps are unique by {type, value element, coding-source}", () => {
    it("REJECTS two posreps with an equal structural key", () => {
      const src =
        `library "T".\nterminology "VS":\n- valueset is \`http://x/VS\`.\n` +
        `concept "C":\n- value type is Quantity.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n  - coded from "VS".\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n  - coded from "VS".\n`;
      const errs = shapeErrors(src, "duplicate-representation-key");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/same\s+representation/);
    });

    it("ACCEPTS posreps that differ in coding-source (distinct keys)", () => {
      const src =
        `library "T".\nterminology "VS1":\n- valueset is \`http://x/VS1\`.\nterminology "VS2":\n- valueset is \`http://x/VS2\`.\n` +
        `concept "C":\n- value type is Quantity.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n  - coded from "VS1".\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n  - coded from "VS2".\n`;
      expect(shapeErrors(src, "duplicate-representation-key")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- A.8
  describe("A.8 definition-is-exists-misuse — precise operator-shaped match", () => {
    it("no longer flags `definition is exists (\"X\")` — the single-ref form is now a recognized reduction (A.8 arm superseded, #189)", () => {
      // Q1→A1 (ratified): `definition is exists "X"` (parenthesized or not) folds to a structural
      // ReductionDefinition{exists, "X"} in the builder — it IS the canonical named reduction, no
      // longer an A.8 misuse steered to `defined as`. A.8's GROUP arm survives (see below). The
      // named-operand RecordSet-resolution coherence (a warning) lands with the reduction
      // validators in the next sub-commit; in this one the fold means A.8 simply no longer sees it.
      const src =
        `library "T".\nconcept "Mammogram (ImagingStudy)":\n- value type is dateTime.\n` +
        `- source representation:\n  - type is ImagingStudy.\n  - value element is ImagingStudy.started.\n  - value type is dateTime.\n` +
        `concept "C":\n- value type is boolean.\n- definition is exists ("Mammogram (ImagingStudy)").\n`;
      expect(shapeErrors(src, "definition-is-exists-misuse")).toHaveLength(0);
    });

    it("does NOT flag an ordinary narrative that merely contains the word `exists`", () => {
      // `"Weight" exists today` builds as [NConceptRef, NWord "exists", NWord "today"] — `exists`
      // is not the leading operator, so it is legal narrative (characterized in concept-model-t1).
      const src =
        `library "T".\nconcept "Weight":\n- value type is Quantity.\n- code is \`w\`.\n` +
        `concept "C":\n- value type is boolean.\n- definition is "Weight" exists today.\n`;
      expect(shapeErrors(src, "definition-is-exists-misuse")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- A.9
  describe("A.9 multiple-value-types — the canonical result shape is singular", () => {
    it("REJECTS a concept declaring two value types", () => {
      const src =
        `library "T".\nconcept "C":\n- type is Observation.\n- value type is Quantity.\n- value type is boolean.\n- code is \`c\`.\n`;
      const errs = shapeErrors(src, "multiple-value-types");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/exactly one `value type`/);
    });

    it("REJECTS a posrep declaring two value types", () => {
      const src =
        `library "T".\nconcept "C":\n- value type is Quantity.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n` +
        `  - value type is Quantity.\n  - value type is boolean.\n`;
      const errs = shapeErrors(src, "multiple-value-types");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/a representation has exactly one/i);
    });
  });

  describe("A.10 missing-value-type — value type is REQUIRED on every concept", () => {
    it("REJECTS a concept that declares no value type", () => {
      const src = `library "T".\nconcept "C":\n- type is Condition.\n- code is \`c\`.\n`;
      const errs = shapeErrors(src, "missing-value-type");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/declares no `value type`/);
      expect(errs[0].severity).toBe("error");
    });

    it("ACCEPTS a concept that declares exactly one value type", () => {
      const src =
        `library "T".\nconcept "C":\n- type is Condition.\n- value type is CodeableConcept.\n- code is \`c\`.\n`;
      expect(shapeErrors(src, "missing-value-type")).toHaveLength(0);
    });

    it("REJECTS a concept with a fully-explicit posrep but NO concept-level value type (a posrep does not substitute)", () => {
      // The redesign requires a concept-level value type even when the concept carries a
      // self-describing `source representation`. The posrep's own value type does not satisfy it.
      const src =
        `library "T".\nconcept "C":\n- code is \`c\`.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n`;
      const errs = shapeErrors(src, "missing-value-type");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/declares no `value type`/);
    });
  });

  // ---------- impl-review round-1 coverage (disc 396): branches the first 14 tests missed ----
  describe("impl-review coverage", () => {
    it("no longer flags the no-parens form `exists \"X\"` — folds to the same reduction as `exists (\"X\")` (#189)", () => {
      // The AST cannot tell `exists "X"` from `exists ("X")` (the singleton group collapses), and
      // BOTH now fold to a ReductionDefinition — so neither is an A.8 misuse. (Q1→A1 supersession.)
      const src =
        `library "T".\nconcept "X":\n- value type is boolean.\n- code is \`x\`.\n` +
        `concept "C":\n- value type is boolean.\n- definition is exists "X".\n`;
      expect(shapeErrors(src, "definition-is-exists-misuse")).toHaveLength(0);
    });

    it("A.8 flags a grouped operand `exists (\"A\" or \"B\")` and steers to promote the group", () => {
      const src =
        `library "T".\nconcept "A":\n- value type is boolean.\n- code is \`a\`.\n` +
        `concept "B":\n- value type is boolean.\n- code is \`b\`.\n` +
        `concept "C":\n- value type is boolean.\n- definition is exists ("A" or "B").\n`;
      const errs = shapeErrors(src, "definition-is-exists-misuse");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/promote the group/);
    });

    it("A.8 flags a single-ref `exists \"X\" <tail>` — the bare form folds, so a ref-with-filter survives (panel R3 F2)", () => {
      // Regression pin for the narrowing: `exists "X"` folds to a reduction and never reaches A.8, so
      // an unfolded `exists` + NConceptRef here necessarily carries a trailing filter (`… today`) that
      // a reduction can't hold. Without the re-added NConceptRef arm this got ZERO diagnostics and only
      // failed at the emit matcher.
      const src =
        `library "T".\nconcept "X":\n- value type is boolean.\n- code is \`x\`.\n` +
        `concept "C":\n- value type is boolean.\n- definition is exists "X" today.\n`;
      const errs = shapeErrors(src, "definition-is-exists-misuse");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/single bare operand|trailing filter/);
    });

    it("A.8 flags `exists this <tail>` too — bare `exists this` folds, so a tail'd `this` survives (gpt56 R3 #4)", () => {
      const src =
        `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is exists this today.\n`;
      const errs = shapeErrors(src, "definition-is-exists-misuse");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toMatch(/single bare operand|trailing filter/);
    });

    it("A.5 flags a concept ref reachable ONLY through a value-projection disjunction group (nested walk)", () => {
      // Both operands are groups — there is NO top-level NConceptRef, so a hit proves the
      // recursion into NDisjunction, not a top-level match.
      const src =
        `library "T".\nconcept "A":\n- value type is Quantity.\n- code is \`a\`.\n` +
        `concept "B":\n- value type is Quantity.\n- code is \`b\`.\n` +
        `concept "C":\n- value type is Quantity.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n` +
        `  - value projection is body mass index of ("A" or "B") and ("A" or "B").\n`;
      expect(shapeErrors(src, "value-projection-references-concept")).toHaveLength(1);
    });

    it("A.6 rejects two UNCODED posreps with an equal key (coding-source ∅)", () => {
      const src =
        `library "T".\nconcept "C":\n- value type is Quantity.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n`;
      expect(shapeErrors(src, "duplicate-representation-key")).toHaveLength(1);
    });

    it("A.6 normalizes coding-source: bare `\"VS\"` and self-qualified `\"T\".\"VS\"` are the SAME key", () => {
      const src =
        `library "T".\nterminology "VS":\n- valueset is \`http://x/VS\`.\n` +
        `concept "C":\n- value type is Quantity.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n  - coded from "VS".\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n  - coded from "T"."VS".\n`;
      expect(shapeErrors(src, "duplicate-representation-key")).toHaveLength(1);
    });

    it("A.6 does NOT collide the local rep with an identical-shaped uncoded posrep (namespace disjoint)", () => {
      // Protects the `local:`/`∅` namespacing: a local `code is` Observation and an uncoded
      // Observation.value posrep are DIFFERENT source lanes, not a duplicate.
      const src =
        `library "T".\nconcept "C":\n- type is Observation.\n- value type is Quantity.\n- code is \`c\`.\n` +
        `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n`;
      expect(shapeErrors(src, "duplicate-representation-key")).toHaveLength(0);
    });

    it("⚠ A.2 concept-level: a type-less local `code is` is REPORTED, not silently defaulted", () => {
      // ⚠ THIS TEST PINNED THE OPPOSITE BEHAVIOUR — it asserted the diagnostic would "name the implicit
      // local type `Observation`", i.e. that a concept with no `type is` was silently treated as one.
      // That default is REMOVED: it decided the retrieve resource with nothing on the page saying so,
      // three lanes applied it and a fourth refused it, so the same artifact was well-formed to the
      // validator and unemittable to the emitter. A local `code is` is ANSWERABLE, so its record must be
      // storable, and storing needs a declared type.
      const src =
        `library "T".\nconcept "C":\n- value element is ImagingStudy.started.\n- value type is dateTime.\n- code is \`c\`.\n`;
      expect(shapeErrors(src, "local-code-missing-type")).toHaveLength(1);
    });

    it("stays a hard ERROR under `soft: true` (structural, non-demotable)", () => {
      const src =
        // A.1 vehicle: a posrep missing `type is` (still a violation; the value-element/value-type
        // requirement was retired #189 2026-08-28, so it no longer produces one).
        `library "T".\nconcept "C":\n- value type is Quantity.\n` +
        `- source representation:\n  - value element is Observation.value.\n  - value type is Quantity.\n  - coded from "VS".\n`;
      const built = buildCRL(src);
      if (!built.success || !built.result) throw new Error("build failed");
      const r = new Validator().validate(built.result, { soft: true });
      expect(r.errors.some((e) => e.kind === "representation-shape")).toBe(true);
      expect(r.warnings.some((e) => e.kind === "representation-shape")).toBe(false);
    });

    it("MULTI-FILE: a shape error carries filePath + libraryName (not the wrong-file fallback)", () => {
      const dir = mkdtempSync(join(tmpdir(), "repshape-mf-"));
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "repshape-mf", version: "0.0.0", crl: { canonicalBase: "http://example.org/repshape-mf" } }),
      );
      const crlPath = join(dir, "policy.crl");
      writeFileSync(
        crlPath,
        // A.1 vehicle: missing `type is` (see the soft-mode test above).
        `library "T".\nconcept "C":\n- value type is Quantity.\n` +
          `- source representation:\n  - value element is Observation.value.\n  - value type is Quantity.\n  - coded from "VS".\n`,
      );
      const result = validateCRLImports(crlPath);
      const errs = result.validationErrors.filter((e) => e.kind === "representation-shape");
      expect(errs.length).toBeGreaterThanOrEqual(1);
      expect(errs[0].filePath).toBe(crlPath);
      expect(errs[0].libraryName).toBe("T");
    });
  });
});
