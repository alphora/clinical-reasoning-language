import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { validateCRLImports } from "../../imports/validate";
import { matchNarrative } from "../../template-match";
import { OPERAND_CONSTRAINTS } from "../../template-match/operandConstraints";
import {
  Validator,
  type UseSiteTypeMismatchError,
  type UseSiteTypeRule,
  type ValidationError,
  type ValidationResult,
} from "../validator";

// concept-model redesign Todo 2, rule B — use-site & result-shape type checking. End-to-end via
// buildCRL → Validator (the single-file path), mirroring representationShape.test.ts. THE HEADLINE
// (feedback_patterns-are-semantic): rule B checks pattern OPERAND value types + language-level shape
// rules, NEVER a pattern's return type. See tmp/todo2-ruleB-plan.md + disc 397.

function validateFull(src: string): ValidationResult {
  const built = buildCRL(src);
  if (!built.success || !built.result) {
    throw new Error("build failed: " + JSON.stringify(built.errors));
  }
  return new Validator().validate(built.result);
}
function mismatches(src: string, rule?: UseSiteTypeRule): UseSiteTypeMismatchError[] {
  return validateFull(src).errors.filter(
    (e): e is UseSiteTypeMismatchError =>
      e.kind === "use-site-type-mismatch" && (rule === undefined || e.rule === rule),
  );
}
function untypedWarnings(src: string): ValidationError[] {
  return validateFull(src).warnings.filter((e) => e.kind === "use-site-operand-untyped");
}
// #189 IMPL 2b — the newly-invalid composition cells route as use-site-type-mismatch WARNINGS (the
// exists-bridge still runs at emit until the flip), so they land in `.warnings`, not `.errors`.
function mismatchWarnings(src: string, rule?: UseSiteTypeRule): UseSiteTypeMismatchError[] {
  return validateFull(src).warnings.filter(
    (e): e is UseSiteTypeMismatchError =>
      e.kind === "use-site-type-mismatch" && (rule === undefined || e.rule === rule),
  );
}

describe("UseSiteTypeValidator (Todo 2 rule B) — operand constraints", () => {
  // ---- Time-selection: operand must NOT be boolean (refinement 1's catch) ----
  describe("time-selection operand must not be a derived boolean", () => {
    it("REJECTS `most recent X` over a derived-boolean concept", () => {
      const src =
        `library "T".\n` +
        `concept "Had Mammogram":\n- value type is boolean.\n- defined as exists ( "Src" ).\n` +
        `concept "Src":\n- value type is dateTime.\n- code is \`m\`.\n` +
        `concept "Most Recent Mammogram":\n- value type is dateTime.\n- definition is most recent "Had Mammogram".\n`;
      const errs = mismatches(src, "operand-shape");
      expect(errs).toHaveLength(1);
      expect(errs[0].conceptName).toBe("Most Recent Mammogram");
      expect(errs[0].pattern).toBe("MostRecent");
      expect(errs[0].argPosition).toBe(0);
      expect(errs[0].actual).toBe("boolean");
      expect(errs[0].message).toMatch(/event date/);
    });

    it("ACCEPTS `most recent X` over a dateTime concept", () => {
      const src =
        `library "T".\n` +
        `concept "Src":\n- value type is dateTime.\n- code is \`m\`.\n` +
        `concept "MR":\n- value type is dateTime.\n- definition is most recent "Src".\n`;
      expect(mismatches(src)).toHaveLength(0);
    });

    it("ACCEPTS `most recent X` over a Quantity concept (cms69 BMI idiom — not dateTime-only)", () => {
      const src =
        `library "T".\n` +
        `concept "BMI":\n- value type is Quantity.\n- code is \`b\`.\n` +
        `concept "MR BMI":\n- value type is Quantity.\n- definition is most recent "BMI".\n`;
      expect(mismatches(src)).toHaveLength(0);
    });

    it("covers last / earliest / first the same way", () => {
      for (const phrase of ['last "B"', 'earliest "B"', 'first "B"']) {
        const src =
          `library "T".\n` +
          `concept "Src":\n- value type is dateTime.\n- code is \`s\`.\n` +
          `concept "B":\n- value type is boolean.\n- defined as exists ( "Src" ).\n` + // DERIVED boolean
          `concept "Sel":\n- value type is dateTime.\n- definition is ${phrase}.\n`;
        expect(mismatches(src, "operand-shape")).toHaveLength(1);
      }
    });

    it("ACCEPTS `most recent X` over a PURE CODED boolean (asserted, not derived)", () => {
      // Design refinement 1: the constraint is "not a DERIVED boolean". A pure coded boolean concept
      // (locally-asserted boolean Observations, no `defined as` / `definition is`) is NOT derived —
      // its assertions carry event dates, so most-recent IS meaningful. It must NOT error.
      const src =
        `library "T".\n` +
        `concept "Asserted Flag":\n- value type is boolean.\n- code is \`f\`.\n` + // coded -> has stream
        `concept "MR Flag":\n- value type is boolean.\n- definition is most recent "Asserted Flag".\n`;
      expect(mismatches(src)).toHaveLength(0);
    });

    it("REJECTS `most recent X` over a boolean that is BOTH `code is` and `defined as` (derived)", () => {
      // OPERATOR RULING (disc 400): a concept with BOTH a `code is` and a `defined as` boolean counts
      // as DERIVED — its `most recent` is ambiguous (the derived lane has no event date), so it is
      // rejected. The author models the underlying dated event and time-selects THAT (disc 400's
      // alternative representation: union the dated concepts via `sem-or`, then `most recent`).
      const src =
        `library "T".\n` +
        `concept "Src":\n- value type is boolean.\n- code is \`s\`.\n` +
        `concept "Mixed":\n- value type is boolean.\n- code is \`m\`.\n- defined as exists ( "Src" ).\n` +
        `concept "MR Mixed":\n- value type is boolean.\n- definition is most recent "Mixed".\n`;
      expect(mismatches(src, "operand-shape")).toHaveLength(1);
    });
  });

  // ---- Value-comparison: operand must be a Quantity ----
  describe("value-comparison operand must be a Quantity", () => {
    it("REJECTS `X at least Q` over a non-Quantity concept", () => {
      const src =
        `library "T".\n` +
        `concept "Flag":\n- value type is boolean.\n- code is \`f\`.\n` +
        `concept "High Flag":\n- value type is boolean.\n- definition is "Flag" at least 30 'kg/m2'.\n`;
      const errs = mismatches(src, "operand-shape");
      expect(errs).toHaveLength(1);
      expect(errs[0].pattern).toBe("AtLeast");
      expect(errs[0].expected).toMatch(/Quantity/);
      expect(errs[0].actual).toBe("boolean");
    });

    it("ACCEPTS `X at least Q` over a Quantity concept", () => {
      const src =
        `library "T".\n` +
        `concept "BMI":\n- value type is Quantity.\n- code is \`b\`.\n` +
        `concept "High BMI":\n- value type is boolean.\n- definition is "BMI" at least 30 'kg/m2'.\n`;
      expect(mismatches(src)).toHaveLength(0);
    });

    it("covers at most / below / exceeds / between", () => {
      const forms = [
        '"S" at most 30 \'kg/m2\'',
        '"S" below 30 \'kg/m2\'',
        '"S" exceeds 30 \'kg/m2\'',
        '"S" between 10 \'kg/m2\' and 30 \'kg/m2\'',
      ];
      for (const phrase of forms) {
        const src =
          `library "T".\n` +
          `concept "S":\n- value type is dateTime.\n- code is \`s\`.\n` +
          `concept "C":\n- value type is boolean.\n- definition is ${phrase}.\n`;
        expect(mismatches(src, "operand-shape")).toHaveLength(1);
      }
    });
  });

  // ---- Nested & untyped operand handling ----
  describe("nested calls no-op the outer position and recurse; untyped operands warn", () => {
    it("does NOT flag an age predicate (`AtLeast(AgeAt(), Q)` — position 0 is nested, not a concept)", () => {
      // `age today at least 18 years` builds AtLeast(nested AgeAt(), Q); position 0 is a nested
      // call (no concept operand), so the Quantity constraint no-ops. This is the return-type back
      // door the headline forbids — a nested call has no derivable type.
      const src =
        `library "T".\n` +
        `concept "Adult":\n- value type is boolean.\n- definition is age today at least 18 years.\n`;
      expect(mismatches(src)).toHaveLength(0);
    });

    it("nested-modifier form (`most recent X active`): the OUTER time-selection gap holds, but the modifier's OWN constraint catches the inner operand", () => {
      // MostRecent(Active(X)). Two facts pinned together:
      //  - MostRecent's TIME-SELECTION constraint still no-ops the nested position — it can't type
      //    the nested call's RESULT (the return-type back door the headline forbids). Documented gap
      //    (disc 397 [critical] #3): NO `operand-shape` error.
      //  - BUT `Active` is itself a registered refinement predicate (Todo 4), so `recurseNested`
      //    applies Active's OWN `not boolean` to X — a boolean `active` subject IS caught as
      //    `boolean-at-refinement-position`. The inner operand is not silently dropped.
      const src =
        `library "T".\n` +
        `concept "Src":\n- value type is dateTime.\n- code is \`s\`.\n` +
        `concept "B":\n- value type is boolean.\n- defined as exists ( "Src" ).\n` +
        `concept "Sel":\n- value type is dateTime.\n- definition is most recent "B" active.\n`;
      expect(mismatches(src, "operand-shape")).toHaveLength(0); // MostRecent outer-position gap unchanged
      const ref = mismatches(src, "boolean-at-refinement-position");
      expect(ref).toHaveLength(1);
      expect(ref[0].pattern).toBe("Active");
    });

    it("checks a parameter operand at a constrained position (parameters are typed, never untyped)", () => {
      // A narrative operand slot resolves to a concept OR a parameter; a parameter has a definite
      // declared type, so a value-comparison over a boolean parameter is a mismatch (not silence).
      const src =
        `library "T".\n` +
        `parameter "Threshold":\n- param type is boolean.\n` +
        `concept "C":\n- value type is boolean.\n- definition is "Threshold" at least 30 'kg/m2'.\n`;
      expect(mismatches(src, "operand-shape")).toHaveLength(1);
    });

    it("resolves a concept-vs-parameter name collision to the CONCEPT (precedence)", () => {
      // A name declared as BOTH a concept (Quantity) and a parameter (boolean) resolves to the
      // concept (NARRATIVE_REF_KINDS = [concept, parameter], concept-first). `"X" at least` over the
      // Quantity concept is clean; a param-first regression would read boolean and fire a mismatch.
      const src =
        `library "T".\n` +
        `parameter "X":\n- param type is boolean.\n` +
        `concept "X":\n- value type is Quantity.\n- code is \`x\`.\n` +
        `concept "C":\n- value type is boolean.\n- definition is "X" at least 30 'kg/m2'.\n`;
      expect(mismatches(src, "operand-shape")).toHaveLength(0);
    });

    it("emits ONE use-site-operand-untyped WARNING (not an error) for an untyped operand", () => {
      const src =
        `library "T".\n` +
        `concept "Src":\n- code is \`s\`.\n` + // no value type -> untyped
        `concept "MR":\n- value type is dateTime.\n- definition is most recent "Src".\n`;
      expect(mismatches(src)).toHaveLength(0);
      const warns = untypedWarnings(src);
      expect(warns).toHaveLength(1);
      expect(warns[0].severity).toBe("warning");
    });

    it("no-ops an unknown (soft-compile) narrative", () => {
      const src =
        `library "T".\n` +
        `concept "Src":\n- value type is boolean.\n- code is \`s\`.\n` +
        `concept "C":\n- value type is boolean.\n- definition is frobnicate "Src" wildly.\n`;
      expect(mismatches(src)).toHaveLength(0);
      expect(untypedWarnings(src)).toHaveLength(0);
    });
  });
});

describe("UseSiteTypeValidator (Todo 2 rule B) — boolean at a refinement / anchor position", () => {
  // Concept-model redesign Todo 4. A refinement predicate or temporal anchor filters / anchors over
  // event INSTANCES; a DERIVED boolean (`defined as` / `definition is`) has no instances of its own.
  // Rule `boolean-at-refinement-position`, `not-derived boolean` — a CODED boolean is ALLOWED (its
  // define is a retrieve list, so `WasPerformed([Observation: …])` is valid CQL), matching the shipped
  // disc-400 time-selection carve-out (disc 404 Q1 (B)). `WithoutRecordOf` / `Has` are EXCLUDED (they
  // consume a derived boolean by design). A derived boolean = `defined as exists ( "Ev" )` below.
  const DERIVED_FLAG =
    `concept "Flag":\n- value type is boolean.\n- defined as exists ( "Ev" ).\n` +
    `concept "Ev":\n- value type is dateTime.\n- code is \`e\`.\n`;

  it("REJECTS a DERIVED boolean SUBJECT of `… performed` (refinement predicate, arg 0)", () => {
    const src = `library "T".\n` + DERIVED_FLAG + `concept "Bad":\n- type is Encounter.\n- definition is "Flag" performed.\n`;
    const errs = mismatches(src, "boolean-at-refinement-position");
    expect(errs).toHaveLength(1);
    expect(errs[0].conceptName).toBe("Bad");
    expect(errs[0].pattern).toBe("WasPerformed");
    expect(errs[0].argPosition).toBe(0);
    expect(errs[0].actual).toBe("boolean");
    expect(errs[0].message).toMatch(/defined as exists/); // split guidance, not "flip the value type"
  });

  it("ACCEPTS `… performed` over a resource-valued (CodeableConcept) subject", () => {
    const src =
      `library "T".\n` +
      `concept "Enc":\n- value type is CodeableConcept.\n- code is \`e\`.\n` +
      `concept "Good":\n- type is Encounter.\n- definition is "Enc" performed.\n`;
    expect(mismatches(src)).toHaveLength(0);
  });

  it("ACCEPTS a CODED boolean subject (disc 404 Q1 (B): its assertions ARE an instance stream)", () => {
    // A pure coded boolean's define is a `[Observation: …]` retrieve list regardless of value type,
    // so `WasPerformed([Observation: …])` is valid CQL. Only a DERIVED boolean has no instances.
    const src =
      `library "T".\n` +
      `concept "Coded Flag":\n- type is Observation.\n- value type is boolean.\n- code is \`f\`.\n` + // coded, NOT derived
      `concept "OK":\n- type is Observation.\n- definition is "Coded Flag" performed.\n`;
    expect(mismatches(src, "boolean-at-refinement-position")).toHaveLength(0);
  });

  it("covers the other refinement predicates (ordered / verified / active / during / justified / not-done)", () => {
    const forms: Array<[string, string]> = [
      ['"Flag" ordered', "WasOrdered"],
      ['"Flag" verified', "IsVerified"],
      ['"Flag" active', "Active"],
      ['"Flag" during "Period"', "During"],
      ['"Flag" justified by "Reason"', "Justified"],
      ['"Flag" not done with reason "Reason"', "NotDoneWithReason"],
    ];
    for (const [phrase, pattern] of forms) {
      const src =
        `library "T".\n` +
        DERIVED_FLAG +
        `concept "Period":\n- value type is CodeableConcept.\n- code is \`p\`.\n` +
        `concept "Reason":\n- value type is CodeableConcept.\n- code is \`r\`.\n` +
        `concept "Bad":\n- type is Encounter.\n- definition is ${phrase}.\n`;
      const errs = mismatches(src, "boolean-at-refinement-position");
      expect(errs.length, `${phrase}`).toBeGreaterThanOrEqual(1);
      expect(errs.some((e) => e.pattern === pattern), `${phrase} → ${pattern}`).toBe(true);
    }
  });

  it("REJECTS a derived-boolean anchor of `on day of` (nested OnDayOf, arg 0)", () => {
    // `last "Src" on day of "Flag"` → Last(Src, OnDayOf(Flag)). Src is a clean coded resource so the
    // time-selection constraint on Last's arg 0 does not confound; the flagged one is the anchor.
    const src =
      `library "T".\n` +
      `concept "Src":\n- value type is CodeableConcept.\n- code is \`s\`.\n` +
      DERIVED_FLAG +
      `concept "Sel":\n- type is Observation.\n- definition is last "Src" on day of "Flag".\n`;
    const errs = mismatches(src, "boolean-at-refinement-position");
    expect(errs).toHaveLength(1);
    expect(errs[0].pattern).toBe("OnDayOf");
    expect(errs[0].argPosition).toBe(0);
  });

  it("REJECTS a derived-boolean anchor of a window (`before start of`, nested BeforeStartOf, arg 1)", () => {
    const src =
      `library "T".\n` +
      `concept "Src":\n- value type is CodeableConcept.\n- code is \`s\`.\n` +
      DERIVED_FLAG +
      `concept "Sel":\n- type is Observation.\n- definition is last "Src" within 1 'year' before start of "Flag".\n`;
    const errs = mismatches(src, "boolean-at-refinement-position");
    expect(errs).toHaveLength(1);
    expect(errs[0].pattern).toBe("BeforeStartOf");
    expect(errs[0].argPosition).toBe(1); // the anchor is the NON-zero position
  });

  it("REJECTS a derived-boolean `during` PERIOD (arg 1, the anchor gap disc 404 Q2 closed)", () => {
    const src =
      `library "T".\n` +
      `concept "Ev2":\n- value type is CodeableConcept.\n- code is \`x\`.\n` +
      `concept "Src":\n- value type is CodeableConcept.\n- code is \`s\`.\n` +
      `concept "Flag":\n- value type is boolean.\n- defined as exists ( "Ev2" ).\n` +
      `concept "Bad":\n- type is Encounter.\n- definition is "Src" during "Flag".\n`;
    const errs = mismatches(src, "boolean-at-refinement-position");
    expect(errs).toHaveLength(1);
    expect(errs[0].pattern).toBe("During");
    expect(errs[0].argPosition).toBe(1);
  });

  it("REJECTS a derived-boolean `on or before` ANCHOR (arg 1) but ALLOWS a boolean subject (arg 0 overload)", () => {
    // `CRLCommon` gives `OnOrBefore` a Boolean overload at arg 0, so a boolean subject is legal there;
    // the anchor (arg 1) still must be an instance stream.
    const base =
      `library "T".\n` +
      `concept "Ev2":\n- value type is CodeableConcept.\n- code is \`x\`.\n` +
      `concept "Res":\n- value type is CodeableConcept.\n- code is \`r\`.\n` +
      `concept "Flag":\n- value type is boolean.\n- defined as exists ( "Ev2" ).\n`;
    const anchorBad = base + `concept "Bad":\n- type is Observation.\n- definition is "Res" on or before "Flag".\n`;
    const errs = mismatches(anchorBad, "boolean-at-refinement-position");
    expect(errs).toHaveLength(1);
    expect(errs[0].pattern).toBe("OnOrBefore");
    expect(errs[0].argPosition).toBe(1);
    const subjBad = base + `concept "OK":\n- type is Observation.\n- definition is "Flag" on or before "Res".\n`;
    expect(mismatches(subjBad, "boolean-at-refinement-position")).toHaveLength(0); // arg-0 boolean allowed
  });

  it("REJECTS a boolean at EITHER `component of` operand (panel arg 0, discriminator arg 1)", () => {
    const base =
      `library "T".\n` +
      `concept "Ev2":\n- value type is CodeableConcept.\n- code is \`x\`.\n` +
      `concept "Bool":\n- value type is boolean.\n- defined as exists ( "Ev2" ).\n` + // derived boolean
      `concept "Res":\n- value type is CodeableConcept.\n- code is \`r\`.\n`;
    // "X component of Y" → ComponentOf(panel=Y, discriminator=X).
    const panelBad = base + `concept "P":\n- type is Observation.\n- definition is "Res" component of "Bool".\n`;
    const panelErrs = mismatches(panelBad, "boolean-at-refinement-position");
    expect(panelErrs).toHaveLength(1);
    expect(panelErrs[0].argPosition).toBe(0); // panel

    const discBad = base + `concept "D":\n- type is Observation.\n- definition is "Bool" component of "Res".\n`;
    const discErrs = mismatches(discBad, "boolean-at-refinement-position");
    expect(discErrs).toHaveLength(1);
    expect(discErrs[0].argPosition).toBe(1); // discriminator
  });

  it("REJECTS a boolean at EITHER `same day as` operand (both events, args 0 and 1)", () => {
    const base =
      `library "T".\n` +
      `concept "Ev2":\n- value type is CodeableConcept.\n- code is \`x\`.\n` +
      `concept "Bool":\n- value type is boolean.\n- defined as exists ( "Ev2" ).\n` +
      `concept "Res":\n- value type is CodeableConcept.\n- code is \`r\`.\n`;
    const first = base + `concept "A":\n- type is Observation.\n- definition is "Bool" same day as "Res".\n`;
    expect(mismatches(first, "boolean-at-refinement-position").map((e) => e.argPosition)).toEqual([0]);
    const second = base + `concept "A":\n- type is Observation.\n- definition is "Res" same day as "Bool".\n`;
    expect(mismatches(second, "boolean-at-refinement-position").map((e) => e.argPosition)).toEqual([1]);
  });

  it("EXCLUDES `has X` and `without record of X` — they consume a derived boolean by design", () => {
    for (const phrase of ['has "Flag"', 'without record of "Flag"']) {
      const src =
        `library "T".\n` +
        DERIVED_FLAG +
        `concept "C":\n- value type is boolean.\n- definition is ${phrase}.\n`;
      expect(mismatches(src, "boolean-at-refinement-position"), phrase).toHaveLength(0);
    }
  });

  it("stays SILENT (no warning, no error) on an UNTYPED refinement subject (flood control; A.10 owns it)", () => {
    const src =
      `library "T".\n` +
      `concept "Untyped Enc":\n- type is Encounter.\n- code is \`e\`.\n` + // no value type
      `concept "Bad":\n- type is Encounter.\n- definition is "Untyped Enc" performed.\n`;
    expect(mismatches(src, "boolean-at-refinement-position")).toHaveLength(0);
    expect(untypedWarnings(src)).toHaveLength(0); // NOT warned, unlike the time-selection / value-comparison families
  });

  it("REJECTS a boolean PARAMETER at a refinement position with a PARAMETER-worded message (disc 404 R2 Q5 / R3 P1)", () => {
    // A parameter is a runtime SCALAR — no event instances — so `not-derived boolean` must still reject
    // it (it's classified instance-less). The message must NOT claim it's "computed by `defined as`" or
    // point at an "underlying resource concept" — a parameter has neither.
    const perf =
      `library "T".\n` +
      `parameter "Flag":\n- param type is boolean.\n` +
      `concept "Bad":\n- type is Encounter.\n- definition is "Flag" performed.\n`;
    const errs = mismatches(perf, "boolean-at-refinement-position");
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/runtime parameter is a scalar/);
    expect(errs[0].message).not.toMatch(/defined as/); // no false "computed by defined as" claim
    // Same for time-selection (the analogous instance-selection family).
    const mr =
      `library "T".\n` +
      `parameter "Flag":\n- param type is boolean.\n` +
      `concept "Sel":\n- value type is dateTime.\n- definition is most recent "Flag".\n`;
    const mrErrs = mismatches(mr, "operand-shape");
    expect(mrErrs).toHaveLength(1);
    expect(mrErrs[0].message).toMatch(/runtime parameter is a scalar/);
  });

  it("behaviorally REJECTS a derived boolean at the newly-registered reason / apart / documented positions (disc 404 R3 P3)", () => {
    const forms: Array<[string, string, number]> = [
      ['"Src" justified by "Flag"', "Justified", 1], // reason (arg 1)
      ['"Src" not done with reason "Flag"', "NotDoneWithReason", 1], // reason (arg 1)
      ['"Src" documented as "Flag"', "DocumentedAs", 1], // classification (arg 1)
      ['"Flag" and "Src" at least 1 \'year\' apart', "AtLeastApart", 0], // first event (arg 0)
      ['"Src" and "Flag" at most 1 \'year\' apart', "AtMostApart", 1], // second event (arg 1)
    ];
    for (const [phrase, pattern, pos] of forms) {
      const src =
        `library "T".\n` +
        `concept "Src":\n- value type is CodeableConcept.\n- code is \`s\`.\n` +
        `concept "Ev2":\n- value type is CodeableConcept.\n- code is \`x\`.\n` +
        `concept "Flag":\n- value type is boolean.\n- defined as exists ( "Ev2" ).\n` +
        `concept "Bad":\n- type is Observation.\n- definition is ${phrase}.\n`;
      const errs = mismatches(src, "boolean-at-refinement-position");
      expect(errs.length, phrase).toBe(1);
      expect(errs[0].pattern, phrase).toBe(pattern);
      expect(errs[0].argPosition, phrase).toBe(pos);
    }
  });
});

describe("UseSiteTypeValidator (Todo 2 rule B) — boolean operand in a refinement composition", () => {
  // A NON-boolean `defined as` composition is a resource stream; a boolean LEAF can't be combined in
  // (lifts the emitter `bridgeOperand` FIXME). Rule `boolean-in-refinement-composition`. One-
  // directional: a boolean PARENT + refinement leaf is legal (exists-bridge).
  it("REJECTS a boolean leaf under a non-boolean `sem-and`", () => {
    const src =
      `library "T".\n` +
      `concept "A":\n- value type is CodeableConcept.\n- code is \`a\`.\n` +
      `concept "B":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "Bad":\n- value type is CodeableConcept.\n- defined as ( "A" sem-and "B" ).\n`;
    const errs = mismatches(src, "boolean-in-refinement-composition");
    expect(errs).toHaveLength(1);
    expect(errs[0].conceptName).toBe("Bad");
    expect(errs[0].actual).toBe("boolean");
    expect(errs[0].expected).toBe("not boolean"); // shape demand, not exact-type compat (disc 404 Q7)
  });

  it("REJECTS a boolean leaf under a non-boolean `sem-or`", () => {
    const src =
      `library "T".\n` +
      `concept "A":\n- value type is CodeableConcept.\n- code is \`a\`.\n` +
      `concept "B":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "Bad":\n- value type is CodeableConcept.\n- defined as ( "A" sem-or "B" ).\n`;
    expect(mismatches(src, "boolean-in-refinement-composition")).toHaveLength(1);
  });

  it("REJECTS a boolean leaf nested inside a `sem-not` — positive-anchored `except` path (disc 404 Q3)", () => {
    const src =
      `library "T".\n` +
      `concept "A":\n- value type is CodeableConcept.\n- code is \`a\`.\n` +
      `concept "B":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "Bad":\n- value type is CodeableConcept.\n- defined as ( "A" sem-and sem-not "B" ).\n`;
    expect(mismatches(src, "boolean-in-refinement-composition")).toHaveLength(1);
  });

  it("REJECTS a boolean leaf inside a `sem-not` under `sem-or` — no-base-negation path (disc 404 Q3)", () => {
    const src =
      `library "T".\n` +
      `concept "A":\n- value type is CodeableConcept.\n- code is \`a\`.\n` +
      `concept "B":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "Bad":\n- value type is CodeableConcept.\n- defined as ( "A" sem-or sem-not "B" ).\n`;
    expect(mismatches(src, "boolean-in-refinement-composition")).toHaveLength(1);
  });

  it("REJECTS a grouped `(sem-not B)` leaf under a non-boolean `sem-and` (disc 404 Q3)", () => {
    const src =
      `library "T".\n` +
      `concept "A":\n- value type is CodeableConcept.\n- code is \`a\`.\n` +
      `concept "B":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "Bad":\n- value type is CodeableConcept.\n- defined as ( "A" sem-and ( sem-not "B" ) ).\n`;
    expect(mismatches(src, "boolean-in-refinement-composition")).toHaveLength(1);
  });

  it("REJECTS a bare-ref ALIAS whose boolean-ness disagrees with its target — BOTH directions (disc 404 Q4 + R2 Q3)", () => {
    // `defined as "X"` is value-preserving with NO emit bridge in either direction, so the rule is
    // BIDIRECTIONAL (rule `bare-ref-value-type-mismatch`, not the one-directional composition rule).
    const nonBoolOverBool =
      `library "T".\n` +
      `concept "B":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "Bad":\n- value type is CodeableConcept.\n- defined as "B".\n`;
    const e1 = mismatches(nonBoolOverBool, "bare-ref-value-type-mismatch");
    expect(e1).toHaveLength(1);
    expect(e1[0].conceptName).toBe("Bad");
    expect(e1[0].actual).toBe("boolean");
    expect(e1[0].expected).toBe("CodeableConcept");

    // Reverse: a boolean alias over a resource target — the direction the one-directional check missed.
    const boolOverNonBool =
      `library "T".\n` +
      `concept "R":\n- value type is CodeableConcept.\n- code is \`r\`.\n` +
      `concept "Bad":\n- value type is boolean.\n- defined as "R".\n`;
    const e2 = mismatches(boolOverNonBool, "bare-ref-value-type-mismatch");
    expect(e2).toHaveLength(1);
    expect(e2[0].actual).toBe("CodeableConcept");
    expect(e2[0].message).toMatch(/defined as exists/); // boolean direction points at exists

    // A bare-ref is value-preserving, so FULL value-type equality is required (disc 404 R3 P2): a
    // `Quantity` alias over a `CodeableConcept` target is a mismatch too (else it would pass an
    // `is Quantity` check downstream on a false declaration).
    const bothNonBool =
      `library "T".\n` +
      `concept "R":\n- value type is CodeableConcept.\n- code is \`r\`.\n` +
      `concept "Alias":\n- value type is Quantity.\n- defined as "R".\n`;
    const e3 = mismatches(bothNonBool, "bare-ref-value-type-mismatch");
    expect(e3).toHaveLength(1);
    expect(e3[0].expected).toBe("Quantity");
    expect(e3[0].actual).toBe("CodeableConcept");

    // Equal value types alias cleanly.
    const equal =
      `library "T".\n` +
      `concept "R":\n- value type is Quantity.\n- code is \`r\`.\n` +
      `concept "Alias":\n- value type is Quantity.\n- defined as "R".\n`;
    expect(mismatches(equal, "bare-ref-value-type-mismatch")).toHaveLength(0);
  });

  it("WARNS (not errors) on a resource leaf under a boolean PARENT — the exists-bridge cell #189 retires", () => {
    // Under the old asymmetric rule this was silently accepted (a boolean parent existentializes a
    // refinement leaf). #189 IMPL 2b makes it a WARNING-only `composition-result-type-mismatch`: the
    // bridge still runs at emit until the flip, so it is validate-only migration teaching — NOT an error
    // (isValid stays true), and NOT the `boolean-in-refinement-composition` error (that stays reserved
    // for a boolean leaf under a NON-boolean scalar parent).
    const src =
      `library "T".\n` +
      `concept "A":\n- value type is CodeableConcept.\n- code is \`a\`.\n` +
      `concept "B":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "OK":\n- value type is boolean.\n- defined as ( "A" sem-and "B" ).\n`;
    expect(mismatches(src, "boolean-in-refinement-composition")).toHaveLength(0); // NOT the error rule
    const warns = mismatchWarnings(src, "composition-result-type-mismatch");
    expect(warns).toHaveLength(1); // only the CodeableConcept leaf "A"; boolean leaf "B" agrees
    expect(warns[0].conceptName).toBe("OK");
    expect(warns[0].expected).toBe("boolean");
    expect(warns[0].actual).toBe("CodeableConcept");
    expect(warns[0].severity).toBe("warning");
    expect(warns[0].message).toMatch(/defined as exists/); // steers to the emit-capable form (#265)
    expect(validateFull(src).isValid).toBe(true); // a warning never flips isValid
  });

  it("WARNS on two DIFFERENT non-boolean leaves (the old rule only caught boolean leaves)", () => {
    // A `CodeableConcept` composition with a `Quantity` leaf: neither is boolean, so the old
    // one-directional (boolean-only) rule missed it. #189 IMPL 2b flags the result-type disagreement.
    const src =
      `library "T".\n` +
      `concept "A":\n- value type is CodeableConcept.\n- code is \`a\`.\n` +
      `concept "Q":\n- value type is Quantity.\n- code is \`q\`.\n` +
      `concept "Mixed":\n- value type is CodeableConcept.\n- defined as ( "A" sem-or "Q" ).\n`;
    const warns = mismatchWarnings(src, "composition-result-type-mismatch");
    expect(warns).toHaveLength(1);
    expect(warns[0].actual).toBe("Quantity");
    expect(warns[0].expected).toBe("CodeableConcept");
    expect(mismatches(src, "boolean-in-refinement-composition")).toHaveLength(0);
  });

  it("ACCEPTS a non-boolean composition with all non-boolean leaves", () => {
    const src =
      `library "T".\n` +
      `concept "A":\n- value type is CodeableConcept.\n- code is \`a\`.\n` +
      `concept "C":\n- value type is CodeableConcept.\n- code is \`c\`.\n` +
      `concept "OK":\n- value type is CodeableConcept.\n- defined as ( "A" sem-and "C" ).\n`;
    expect(mismatches(src, "boolean-in-refinement-composition")).toHaveLength(0);
    expect(mismatchWarnings(src, "composition-result-type-mismatch")).toHaveLength(0);
  });

  it("ACCEPTS an all-boolean composition (canonical `Scalar<Boolean>` leaves compose)", () => {
    // `ConditionExists sem-or ServiceRequestExists` — every leaf is a boolean determination; no warning.
    const src =
      `library "T".\n` +
      `concept "Ev":\n- value type is dateTime.\n- code is \`e\`.\n` +
      `concept "CondExists":\n- value type is boolean.\n- defined as exists ( "Ev" ).\n` +
      `concept "SrExists":\n- value type is boolean.\n- code is \`s\`.\n` +
      `concept "Either":\n- value type is boolean.\n- defined as ( "CondExists" sem-or "SrExists" ).\n`;
    expect(mismatches(src)).toHaveLength(0);
    expect(mismatchWarnings(src)).toHaveLength(0);
  });

  it("does NOT double-report on a top-level `sem-not` (that's `negation-result-nonboolean`)", () => {
    const src =
      `library "T".\n` +
      `concept "B":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "Neg":\n- value type is CodeableConcept.\n- defined as ( sem-not "B" ).\n`;
    expect(mismatches(src, "boolean-in-refinement-composition")).toHaveLength(0);
    expect(mismatches(src, "negation-result-nonboolean")).toHaveLength(1);
  });
});

describe("UseSiteTypeValidator (Todo 2 rule B) — language-level shape rules", () => {
  // ---- defined-as result shape ----
  describe("`defined as exists` / top-level `sem-not` ⟹ boolean", () => {
    it("REJECTS a `defined as exists` concept declaring a non-boolean value type", () => {
      const src =
        `library "T".\n` +
        `concept "Src":\n- value type is dateTime.\n- code is \`s\`.\n` +
        `concept "Bad":\n- value type is Quantity.\n- defined as exists ( "Src" ).\n`;
      const errs = mismatches(src, "exists-result-nonboolean");
      expect(errs).toHaveLength(1);
      expect(errs[0].actual).toBe("Quantity");
    });

    it("ACCEPTS a `defined as exists` concept declaring boolean (or no value type)", () => {
      const boolean =
        `library "T".\n` +
        `concept "Src":\n- value type is dateTime.\n- code is \`s\`.\n` +
        `concept "Ok":\n- value type is boolean.\n- defined as exists ( "Src" ).\n`;
      expect(mismatches(boolean)).toHaveLength(0);
      const untyped =
        `library "T".\n` +
        `concept "Src":\n- value type is dateTime.\n- code is \`s\`.\n` +
        `concept "Ok2":\n- defined as exists ( "Src" ).\n`;
      expect(mismatches(untyped)).toHaveLength(0);
    });

    it("REJECTS a top-level `sem-not` concept declaring a non-boolean value type", () => {
      const src =
        `library "T".\n` +
        `concept "Src":\n- value type is boolean.\n- code is \`s\`.\n` +
        `concept "Bad":\n- value type is Quantity.\n- defined as ( sem-not "Src" ).\n`;
      const errs = mismatches(src, "negation-result-nonboolean");
      expect(errs).toHaveLength(1);
    });

    it("does NOT flag a value-preserving `sem-or` / `sem-and` / bare-ref (corpus-safe)", () => {
      // cms69: `"BMI"` is Quantity via `sem-or` — value-preserving. NO blanket defined-as⟹boolean.
      const src =
        `library "T".\n` +
        `concept "A":\n- value type is Quantity.\n- code is \`a\`.\n` +
        `concept "B":\n- value type is Quantity.\n- code is \`b\`.\n` +
        `concept "Union":\n- value type is Quantity.\n- defined as ( "A" sem-or "B" ).\n`;
      expect(mismatches(src)).toHaveLength(0);
    });
  });

  // ---- no-projector posrep ⟹ concept value type ----
  describe("a source representation without a projection carries its concept's value type", () => {
    it("REJECTS a no-projector posrep whose value type differs from the concept", () => {
      const src =
        `library "T".\n` +
        `concept "C":\n- value type is boolean.\n` +
        `- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is dateTime.\n`;
      const errs = mismatches(src, "posrep-value-type-mismatch");
      expect(errs).toHaveLength(1);
      expect(errs[0].expected).toBe("boolean");
      expect(errs[0].actual).toBe("dateTime");
    });

    it("ACCEPTS a no-projector posrep whose value type matches the concept", () => {
      const src =
        `library "T".\n` +
        `concept "C":\n- value type is dateTime.\n` +
        `- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is dateTime.\n`;
      expect(mismatches(src)).toHaveLength(0);
    });

    it("SKIPS a posrep carrying a `value projection is` (the projection is the bridge)", () => {
      const src =
        `library "T".\n` +
        `concept "Adult":\n- value type is boolean.\n` +
        `- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is dateTime.\n` +
        `  - value projection is age today at least 18 years.\n`;
      expect(mismatches(src, "posrep-value-type-mismatch")).toHaveLength(0);
    });
  });

  // ---- decision guard ⟹ boolean ----
  describe("a decision / criterion / action guard consumes a boolean", () => {
    it("REJECTS a `when` guard over a non-boolean concept", () => {
      const src =
        `library "T".\n` +
        `concept "BMI":\n- value type is Quantity.\n- code is \`b\`.\n` +
        `activity "Do It":\n- request CPGCommunicationRequest.\n` +
        `decision "D":\n- when "BMI" then recommend activity "Do It".\n`;
      const errs = mismatches(src, "decision-guard-nonboolean");
      expect(errs).toHaveLength(1);
      expect(errs[0].actual).toBe("Quantity");
    });

    it("ACCEPTS a `when` guard over a boolean concept, and stays SILENT on an untyped guard", () => {
      const boolean =
        `library "T".\n` +
        `concept "Eligible":\n- value type is boolean.\n- code is \`e\`.\n` +
        `activity "Do It":\n- request CPGCommunicationRequest.\n` +
        `decision "D":\n- when "Eligible" then recommend activity "Do It".\n`;
      expect(mismatches(boolean)).toHaveLength(0);
      expect(mismatchWarnings(boolean, "decision-guard-record-shaped")).toHaveLength(0); // Scalar boolean → no shape warning
      const untyped =
        `library "T".\n` +
        `concept "Eligible":\n- code is \`e\`.\n` + // untyped presence concept — the norm today
        `activity "Do It":\n- request CPGCommunicationRequest.\n` +
        `decision "D":\n- when "Eligible" then recommend activity "Do It".\n`;
      expect(mismatches(untyped)).toHaveLength(0);
      expect(untypedWarnings(untyped)).toHaveLength(0); // guards are NOT untyped-warned (noise)
    });

    it("REJECTS a non-boolean concept inside a criterion body (checked once at its declaration)", () => {
      const src =
        `library "T".\n` +
        `concept "BMI":\n- value type is Quantity.\n- code is \`b\`.\n` +
        `criterion "Crit":\n- when ( "BMI" ).\n`;
      expect(mismatches(src, "decision-guard-nonboolean")).toHaveLength(1);
    });

    it("REJECTS a non-boolean concept in an action guard (`unless` / `only when`)", () => {
      const src =
        `library "T".\n` +
        `concept "BMI":\n- value type is Quantity.\n- code is \`b\`.\n` +
        `concept "Gate":\n- code is \`g\`.\n` + // untyped outer guard -> silent, isolates the action guard
        `activity "A":\n- request CPGCommunicationRequest.\n` +
        `activity "B":\n- request CPGCommunicationRequest.\n` +
        `decision "D":\n- when "Gate" then:\n  any:\n  - recommend activity "A" unless "BMI".\n  - recommend activity "B".\n  end.\n`;
      expect(mismatches(src, "decision-guard-nonboolean")).toHaveLength(1);
    });
  });
});

describe("UseSiteTypeValidator (Todo 2 rule B) — registry self-validation", () => {
  // A representative narrative per registry entry. Drives the matcher to assert every
  // `operandConstraints` key names a KNOWN canonical pattern AND its constrained arg position is a
  // real concept-operand slot — so a matcher arg-order change can't silently disable a check
  // (disc 397 gpt56 #5).
  const REP_PHRASE: Record<string, string> = {
    MostRecent: 'most recent "X"',
    Last: 'last "X"',
    Earliest: 'earliest "X"',
    First: 'first "X"',
    AtLeast: '"X" at least 30 \'kg/m2\'',
    AtMost: '"X" at most 30 \'kg/m2\'',
    Below: '"X" below 30 \'kg/m2\'',
    Exceeds: '"X" exceeds 30 \'kg/m2\'',
    Between: '"X" between 10 \'kg/m2\' and 30 \'kg/m2\'',
    // Refinement predicates — subject at arg 0 (During / Active also anchor at arg 1).
    WasPerformed: '"X" performed',
    WasOrdered: '"X" ordered',
    During: '"X" during "Y"',
    IsVerified: '"X" verified',
    Active: '"X" active during "Y"', // during-variant fills arg 1 (bare `active` has no anchor)
    NotDoneWithReason: '"X" not done with reason "Y"',
    Justified: '"X" justified by "Y"',
    DocumentedAs: '"X" documented as "Y"',
    AtLeastApart: '"X" and "Y" at least 1 \'year\' apart',
    AtMostApart: '"X" and "Y" at most 1 \'year\' apart',
    // Temporal anchors. OnDayOf / the window patterns are NESTED under `Last` (never top-level), so
    // the phrase produces a `Last` call and `findCall` reaches into the nested scope arg.
    OnDayOf: 'last "X" on day of "Y"',
    AsOf: '"X" as of "Y"',
    SameDay: '"X" same day as "Y"',
    Overlaps: '"X" overlaps "Y"',
    OnDayOfOrAfter: '"X" on day of or after "Y"',
    OnOrBefore: '"X" on or before "Y"',
    BeforeStartOf: 'last "X" within 1 \'year\' before start of "Y"',
    AfterStartOf: 'last "X" within 1 \'year\' after start of "Y"',
    BeforeEndOf: 'last "X" within 1 \'year\' before end of "Y"',
    AfterEndOf: 'last "X" within 1 \'year\' after end of "Y"',
    ComponentOf: '"X" component of "Y"',
  };

  function matchDef(phrase: string) {
    const built = buildCRL(`library "T".\nconcept "K":\n- definition is ${phrase}.\n`);
    if (!built.success || !built.result) throw new Error("build failed for " + phrase);
    const concept = built.result.statements.find((s) => s.type === "Concept");
    if (!concept || concept.type !== "Concept" || concept.definition?.type !== "DefinitionIsDefinition") {
      throw new Error("no definition-is concept for " + phrase);
    }
    return matchNarrative(concept.definition.body);
  }

  // Find the sub-call named `pattern` anywhere in the call tree (the call itself, or a
  // `NestedPatternArg` at any depth) — the nested-only anchors (`OnDayOf`, window patterns) never
  // appear at top level, so the registry-position assertion must reach into the scope arg.
  type Call = ReturnType<typeof matchDef>;
  function findCall(call: Call, pattern: string): Call | null {
    if (call.pattern === pattern) return call;
    for (const arg of call.args) {
      if (arg.type === "NestedPatternArg") {
        const found = findCall(arg.pattern, pattern);
        if (found) return found;
      }
    }
    return null;
  }

  it("every entry has a representative phrase", () => {
    for (const pattern of Object.keys(OPERAND_CONSTRAINTS)) {
      expect(REP_PHRASE[pattern], `add a representative phrase for ${pattern}`).toBeDefined();
    }
  });

  it("every constrained position resolves to a concept-operand slot at the named pattern", () => {
    for (const [pattern, constraints] of Object.entries(OPERAND_CONSTRAINTS)) {
      const top = matchDef(REP_PHRASE[pattern]);
      expect(top.known, `${pattern}: representative phrase should match a known pattern`).toBe(true);
      const call = findCall(top, pattern);
      expect(call, `${pattern}: no call with that name in the matched tree (top=${top.pattern})`).not.toBeNull();
      for (const c of constraints) {
        const arg = call!.args[c.position];
        expect(arg, `${pattern} arg[${c.position}] missing`).toBeDefined();
        // Every representative phrase puts a bare concept ref at each constrained position, so
        // assert EXACTLY `ConceptRefArg` — a looser set would weaken the arg-order tripwire this
        // test exists for (a matcher change that swapped in a Quantity/Enum at a constrained slot
        // must fail). This is the guard for the NON-zero anchor positions (window arg 1, etc.).
        expect(arg.type, `${pattern} arg[${c.position}] is ${arg.type}, not a bare concept operand`).toBe(
          "ConceptRefArg",
        );
      }
    }
  });

  it("every constraint pairs its `family` with the correct COMPLETE shape (no mis-route; disc 404 R2 Q1 / R3 P4)", () => {
    // `family` selects the diagnostic + rule code while `shape` drives the CHECK; they are set
    // independently, so a `{ family: "value-comparison", shape: not-derived boolean }` (or a
    // `{ family: "refinement", shape: not-derived Quantity }`) would validate one way and report
    // another. Assert the COMPLETE pairing (rel AND valueType), not just the rel.
    for (const [pattern, constraints] of Object.entries(OPERAND_CONSTRAINTS)) {
      for (const c of constraints) {
        const expected =
          c.family === "value-comparison"
            ? { rel: "is", valueType: "Quantity" }
            : { rel: "not-derived", valueType: "boolean" }; // time-selection AND refinement
        expect(
          { rel: c.shape.rel, valueType: c.shape.valueType },
          `${pattern} arg[${c.position}]: family ${c.family} must pair with ${expected.rel} ${expected.valueType}`,
        ).toEqual(expected);
      }
    }
  });
});

describe("UseSiteTypeValidator (Todo 2 rule B) — #189 IMPL 2b: record-shaped result types + guard teaching", () => {
  // A concept's FULL discriminated result type (design §2): a Scalar publishes its value type; a
  // Record / RecordSet publishes `Record<R>` / `RecordSet<R>` keyed on the FHIR resource (`type is R`),
  // NOT its value type. The composition-leaf + bare-ref checks compare on that full result type.

  it("REJECTS a bare-ref alias whose RECORD-SET resource disagrees (RecordSet<R> both directions)", () => {
    const src =
      `library "T".\n` +
      `concept "Obs Set":\n- shape is RecordSet.\n- type is Observation.\n- code is \`o\`.\n` +
      `concept "Cond Alias":\n- shape is RecordSet.\n- type is Condition.\n- defined as "Obs Set".\n`;
    const errs = mismatches(src, "bare-ref-value-type-mismatch");
    expect(errs).toHaveLength(1);
    expect(errs[0].conceptName).toBe("Cond Alias");
    expect(errs[0].expected).toBe("RecordSet<Condition>");
    expect(errs[0].actual).toBe("RecordSet<Observation>");
  });

  it("ACCEPTS a bare-ref alias over the SAME record-set resource", () => {
    const src =
      `library "T".\n` +
      `concept "Obs Set A":\n- shape is RecordSet.\n- type is Observation.\n- code is \`a\`.\n` +
      `concept "Obs Set B":\n- shape is RecordSet.\n- type is Observation.\n- defined as "Obs Set A".\n`;
    expect(mismatches(src, "bare-ref-value-type-mismatch")).toHaveLength(0);
  });

  it("WARNS on a record-shaped composition leaf whose resource disagrees with the parent", () => {
    const src =
      `library "T".\n` +
      `concept "Obs Set":\n- shape is RecordSet.\n- type is Observation.\n- code is \`o\`.\n` +
      `concept "Cond Set":\n- shape is RecordSet.\n- type is Condition.\n- code is \`c\`.\n` +
      `concept "Union":\n- shape is RecordSet.\n- type is Observation.\n- defined as ( "Obs Set" sem-or "Cond Set" ).\n`;
    const warns = mismatchWarnings(src, "composition-result-type-mismatch");
    expect(warns).toHaveLength(1); // the Condition leaf; the Observation leaf agrees
    expect(warns[0].expected).toBe("RecordSet<Observation>");
    expect(warns[0].actual).toBe("RecordSet<Condition>");
    expect(warns[0].severity).toBe("warning");
  });

  it("PRESERVES the boolean-in-refinement-composition ERROR for a boolean leaf under a RecordSet parent with a non-boolean DATUM value type (panel R1 gpt56 #2)", () => {
    // The old rule's trigger was SHAPE-BLIND (a single non-boolean value type). A RecordSet parent that
    // ALSO declares a non-boolean datum value type errored on a boolean leaf before #189 IMPL 2b, and
    // must STILL error (not demote to a warning) — the discriminator is `hadOldBooleanLeafError`, not shape.
    const src =
      `library "T".\n` +
      `concept "Obs Set":\n- shape is RecordSet.\n- type is Observation.\n- value type is Quantity.\n- code is \`o\`.\n` +
      `concept "Bool":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "Bad":\n- shape is RecordSet.\n- type is Observation.\n- value type is Quantity.\n- defined as ( "Obs Set" sem-or "Bool" ).\n`;
    const errs = mismatches(src, "boolean-in-refinement-composition");
    expect(errs).toHaveLength(1); // the boolean leaf "Bool"; the Observation leaf agrees
    expect(errs[0].conceptName).toBe("Bad");
    expect(errs[0].actual).toBe("boolean");
    expect(mismatchWarnings(src, "composition-result-type-mismatch")).toHaveLength(0); // no double-report
    expect(validateFull(src).isValid).toBe(false); // a preserved hard error
  });

  it("WARNS (not errors) on a boolean leaf under a RecordSet parent that declares NO datum value type", () => {
    // With no single parent value type, `hadOldBooleanLeafError` is false (the old code never reached this
    // cell), so the boolean leaf is the WARNING-only `composition-result-type-mismatch`, not a hard error.
    const src =
      `library "T".\n` +
      `concept "Obs Set":\n- shape is RecordSet.\n- type is Observation.\n- code is \`o\`.\n` +
      `concept "Bool":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "Union":\n- shape is RecordSet.\n- type is Observation.\n- defined as ( "Obs Set" sem-or "Bool" ).\n`;
    expect(mismatches(src, "boolean-in-refinement-composition")).toHaveLength(0);
    const warns = mismatchWarnings(src, "composition-result-type-mismatch");
    expect(warns).toHaveLength(1);
    expect(warns[0].actual).toBe("boolean");
    expect(warns[0].expected).toBe("RecordSet<Observation>");
    expect(validateFull(src).isValid).toBe(true);
  });

  it("does NOT flag a value-preserving RecordSet `sem-not` as negation-result-nonboolean (panel R1 gpt56 #3)", () => {
    // On a Record/RecordSet, `sem-not` is set-complement (`except`), value-preserving — NOT a boolean
    // negation — so the Scalar-only result-shape check must not fire, with or without a datum value type.
    const withDatum =
      `library "T".\n` +
      `concept "Conditions":\n- shape is RecordSet.\n- type is Condition.\n- code is \`c\`.\n` +
      `concept "Excluded":\n- shape is RecordSet.\n- type is Condition.\n- value type is CodeableConcept.\n- defined as ( sem-not "Conditions" ).\n`;
    expect(mismatches(withDatum, "negation-result-nonboolean")).toHaveLength(0);
    expect(mismatchWarnings(withDatum, "composition-result-type-mismatch")).toHaveLength(0); // same resource → clean
    const noDatum =
      `library "T".\n` +
      `concept "Conditions":\n- shape is RecordSet.\n- type is Condition.\n- code is \`c\`.\n` +
      `concept "Excluded":\n- shape is RecordSet.\n- type is Condition.\n- defined as ( sem-not "Conditions" ).\n`;
    expect(mismatches(noDatum, "negation-result-nonboolean")).toHaveLength(0);
  });

  it("STILL flags a Scalar non-boolean top-level `sem-not` as negation-result-nonboolean (Scalar gate keeps the existing error)", () => {
    const src =
      `library "T".\n` +
      `concept "B":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "Neg":\n- value type is CodeableConcept.\n- defined as ( sem-not "B" ).\n`;
    expect(mismatches(src, "negation-result-nonboolean")).toHaveLength(1);
  });

  it("a RecordSet parent + non-boolean datum + top-level `sem-not` + boolean leaf switches rule (negation → boolean-in-refinement) but STAYS an error (panel R2 Claude #5)", () => {
    // The Scalar gate removes `negation-result-nonboolean` here (a RecordSet `sem-not` is `except`), but the
    // descend then catches the boolean leaf via check (i) — a different rule, same `isValid: false`.
    const src =
      `library "T".\n` +
      `concept "Bool":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "Bad":\n- shape is RecordSet.\n- type is Condition.\n- value type is CodeableConcept.\n- defined as ( sem-not "Bool" ).\n`;
    expect(mismatches(src, "negation-result-nonboolean")).toHaveLength(0); // Scalar gate removed it
    expect(mismatches(src, "boolean-in-refinement-composition")).toHaveLength(1); // caught by check (i) instead
    expect(validateFull(src).isValid).toBe(false); // still an error either way
  });

  it("REJECTS a Scalar bare-ref alias over a DERIVED RecordSet with NO `type is` (shape disagreement is decidable; panel R2 Claude #1a)", () => {
    // `Union` is a derived RecordSet with no `type is` (resource unknown), so its result type is
    // `RecordSet<?>`. A `Scalar<Quantity>` bare-ref alias over it disagrees on SHAPE regardless of the
    // unknown resource — HEAD errored (value types differ) and this version must too (not go silent).
    const src =
      `library "T".\n` +
      `concept "A":\n- shape is RecordSet.\n- type is Observation.\n- code is \`a\`.\n` +
      `concept "B":\n- shape is RecordSet.\n- type is Observation.\n- code is \`b\`.\n` +
      `concept "Union":\n- shape is RecordSet.\n- defined as ( "A" sem-or "B" ).\n` + // derived RecordSet, NO type is
      `concept "Alias":\n- value type is Quantity.\n- defined as "Union".\n`;
    const errs = mismatches(src, "bare-ref-value-type-mismatch");
    expect(errs).toHaveLength(1);
    expect(errs[0].conceptName).toBe("Alias");
    expect(errs[0].actual).toBe("RecordSet<…>"); // rendered with an unknown resource
    expect(validateFull(src).isValid).toBe(false);
  });

  it("WARNS on the exists-bridge cell when the record leaf's resource is unknown (cold-flip hole closed; panel R2 Claude #1b)", () => {
    // A `boolean` composition with a DERIVED-RecordSet leaf (resource unknown): the shapes disagree
    // (`boolean` scalar vs record), so the forward-looking WARNING still fires — the exact retiring
    // exists-bridge direction §9 step 1 exists to warm, even without the leaf's `type is`.
    const src =
      `library "T".\n` +
      `concept "A":\n- shape is RecordSet.\n- type is Observation.\n- code is \`a\`.\n` +
      `concept "B":\n- shape is RecordSet.\n- type is Observation.\n- code is \`b\`.\n` +
      `concept "Union":\n- shape is RecordSet.\n- defined as ( "A" sem-or "B" ).\n` + // derived RecordSet, NO type is
      `concept "C":\n- value type is boolean.\n- code is \`c\`.\n` +
      `concept "Any":\n- value type is boolean.\n- defined as ( "Union" sem-or "C" ).\n`;
    const warns = mismatchWarnings(src, "composition-result-type-mismatch");
    expect(warns).toHaveLength(1); // the record-shaped leaf "Union"; the boolean leaf "C" agrees
    expect(warns[0].actual).toBe("RecordSet<…>");
    expect(warns[0].expected).toBe("boolean");
  });

  it("PRESERVES the error even when the RecordSet parent has a non-boolean datum value type but NO `type is` (panel R2 Claude #1b — was demoted to silence)", () => {
    // The parent's RESULT type is indeterminate (RecordSet with no resource), so the WARNING path skips —
    // but the preserved ERROR is VALUE-TYPE-keyed and does NOT depend on the result type being known, so a
    // boolean leaf still errors (it emits broken today regardless of the missing `type is`).
    const src =
      `library "T".\n` +
      `concept "Bool":\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "Other":\n- shape is RecordSet.\n- type is Observation.\n- code is \`o\`.\n` + // record leaf; parent resource unknown → indeterminate, no warning
      `concept "Bad":\n- shape is RecordSet.\n- value type is Quantity.\n- defined as ( "Other" sem-or "Bool" ).\n`;
    const errs = mismatches(src, "boolean-in-refinement-composition");
    expect(errs).toHaveLength(1); // the boolean leaf "Bool" — value-type-keyed, fires without the parent's `type is`
    expect(errs[0].conceptName).toBe("Bad");
    expect(mismatchWarnings(src, "composition-result-type-mismatch")).toHaveLength(0); // no double-report
    expect(validateFull(src).isValid).toBe(false);
  });

  it("PRESERVES the error for a boolean-DATUM record-shaped LEAF under a non-boolean scalar parent (panel R2 Claude #1c — was demoted)", () => {
    // The leaf's declared VALUE TYPE is boolean though its shape is RecordSet; HEAD keyed the error on the
    // leaf's value type, and so must this version (the emitter is shape-blind) — it must not slip to a warning.
    const src =
      `library "T".\n` +
      `concept "A":\n- value type is CodeableConcept.\n- code is \`a\`.\n` +
      `concept "RecBool":\n- shape is RecordSet.\n- type is Observation.\n- value type is boolean.\n- code is \`r\`.\n` +
      `concept "Bad":\n- value type is CodeableConcept.\n- defined as ( "A" sem-or "RecBool" ).\n`;
    const errs = mismatches(src, "boolean-in-refinement-composition");
    expect(errs).toHaveLength(1);
    expect(errs[0].conceptName).toBe("Bad");
    expect(errs[0].actual).toBe("boolean");
    expect(mismatchWarnings(src, "composition-result-type-mismatch")).toHaveLength(0); // no double-report
  });

  it("composes two RecordSet<Observation> concepts with DIFFERENT datum value types cleanly (design F5 — resource-keyed, datum-agnostic; panel R2 Claude #6)", () => {
    // A record result is keyed on the RESOURCE only, not the datum value type. A Quantity-datum and a
    // boolean-datum RecordSet<Observation> publish the same `RecordSet<Observation>` and must compose
    // without a whisper. Pinned so a later implementer does not "fix" it by folding the datum type in.
    const src =
      `library "T".\n` +
      `concept "Vitals Q":\n- shape is RecordSet.\n- type is Observation.\n- value type is Quantity.\n- code is \`q\`.\n` +
      `concept "Vitals B":\n- shape is RecordSet.\n- type is Observation.\n- value type is boolean.\n- code is \`b\`.\n` +
      `concept "All Vitals":\n- shape is RecordSet.\n- type is Observation.\n- defined as ( "Vitals Q" sem-or "Vitals B" ).\n`;
    expect(mismatches(src, "boolean-in-refinement-composition")).toHaveLength(0);
    expect(mismatchWarnings(src, "composition-result-type-mismatch")).toHaveLength(0);
  });

  it("WARNS on a boolean-DATUM record-shaped guard operand — RecordSet AND Record (forward-looking; panel R2 Claude #2 / gpt56 #4)", () => {
    // The operand declares `value type is boolean`, so today's value-type guard check passes silently —
    // but it is a record SHAPE, so at the flip it publishes records and the guard hard-errors. The
    // forward-looking WARNING leads the flip (design §9 step 1); the guard does NOT hard-error in N.
    for (const shape of ["RecordSet", "Record"]) {
      const def =
        shape === "Record"
          ? `- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is \`o\`.\n- definition is most recent this.\n`
          : `- shape is RecordSet.\n- type is Observation.\n- value type is boolean.\n- code is \`o\`.\n`;
      const src =
        `library "T".\n` +
        `concept "Obs Flags":\n${def}` +
        `activity "Do It":\n- request CPGCommunicationRequest.\n` +
        `decision "D":\n- when "Obs Flags" then recommend activity "Do It".\n`;
      expect(mismatches(src, "decision-guard-nonboolean"), shape).toHaveLength(0); // NOT the hard error
      const warns = mismatchWarnings(src, "decision-guard-record-shaped");
      expect(warns, shape).toHaveLength(1);
      expect(warns[0].message).toMatch(new RegExp(`shape is ${shape}`));
      expect(warns[0].message).toMatch(/defined as exists/);
      expect(validateFull(src).isValid, shape).toBe(true);
    }
  });

  it("teaches a RECORD-VALUED decision guard to reduce with `exists` (shape-aware message)", () => {
    // A RecordSet operand in a guard is still a hard error (a guard consumes a boolean), but the message
    // steers to an `exists` presence reduction — the generic value-comparison guidance doesn't apply.
    const src =
      `library "T".\n` +
      `concept "Obs Set":\n- shape is RecordSet.\n- type is Observation.\n- value type is Quantity.\n- code is \`o\`.\n` +
      `activity "Do It":\n- request CPGCommunicationRequest.\n` +
      `decision "D":\n- when "Obs Set" then recommend activity "Do It".\n`;
    const errs = mismatches(src, "decision-guard-nonboolean");
    expect(errs).toHaveLength(1);
    expect(errs[0].actual).toBe("Quantity");
    expect(errs[0].message).toMatch(/shape is RecordSet/);
    expect(errs[0].message).toMatch(/exists/);
    expect(errs[0].message).not.toMatch(/at least/); // record guidance drops the value-comparison hint
  });

  it("keeps the SCALAR non-boolean guard message unchanged (value-comparison hint retained)", () => {
    const src =
      `library "T".\n` +
      `concept "BMI":\n- value type is Quantity.\n- code is \`b\`.\n` +
      `activity "Do It":\n- request CPGCommunicationRequest.\n` +
      `decision "D":\n- when "BMI" then recommend activity "Do It".\n`;
    const errs = mismatches(src, "decision-guard-nonboolean");
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/at least/); // Scalar keeps the value-comparison guidance
    expect(errs[0].message).not.toMatch(/shape is/);
  });
});

describe("UseSiteTypeValidator (Todo 2 rule B) — cross-cutting", () => {
  it("a use-site-type-mismatch is NOT soft-demoted (structural author mistake)", () => {
    const src =
      `library "T".\n` +
      `concept "Src":\n- value type is dateTime.\n- code is \`s\`.\n` +
      `concept "B":\n- value type is boolean.\n- defined as exists ( "Src" ).\n` + // DERIVED boolean
      `concept "Sel":\n- value type is dateTime.\n- definition is most recent "B".\n`;
    const built = buildCRL(src);
    if (!built.success || !built.result) throw new Error("build failed");
    const soft = new Validator().validate(built.result, { soft: true });
    expect(soft.errors.some((e) => e.kind === "use-site-type-mismatch")).toBe(true);
  });

  it("the canonical mammogram-and-bmi.crl exemplar (model C) is fully rule-B clean", () => {
    // The kit's `concept-layer-model` exemplar, reconciled to model (C) with both KE teams
    // (disc 398). `"Mammogram"` is now a dateTime `code is` + value-preserving `sem-or` union, so
    // `most recent "Mammogram"` selects over an instance-bearing dateTime (NOT a derived boolean) —
    // clean. Every posrep carries its concept's value type; the value-comparison operands are
    // Quantity. This pins the exemplar as the POSITIVE rule-B exemplar (no errors, no warnings).
    const src = readFileSync(
      join(__dirname, "../../tests/fixtures/representation/mammogram-and-bmi.crl"),
      "utf8",
    );
    const built = buildCRL(src);
    if (!built.success || !built.result) throw new Error("build failed");
    const result = new Validator().validate(built.result);
    const ruleB = [...result.errors, ...result.warnings].filter(
      (e) => e.kind === "use-site-type-mismatch" || e.kind === "use-site-operand-untyped",
    );
    expect(ruleB).toHaveLength(0);
    expect(result.isValid).toBe(true);
  });
});

describe("UseSiteTypeValidator (Todo 2 rule B) — multi-file (scoped resolution)", () => {
  const FIXTURES = join(__dirname, "fixtures");

  it("REJECTS a foreign-qualified operand that resolves typed-and-wrong (`\"Vitals\".\"Flag\"` boolean at `at least`)", () => {
    const result = validateCRLImports(join(FIXTURES, "ruleb-cross-lib", "root.crl"));
    const errs = result.validationErrors.filter(
      (e): e is UseSiteTypeMismatchError => e.kind === "use-site-type-mismatch" && e.rule === "operand-shape",
    );
    expect(errs).toHaveLength(1);
    expect(errs[0].conceptName).toBe("Check");
    expect(errs[0].actual).toBe("boolean");
    // Attribution is populated in sources mode (a sibling error must squiggle the right file).
    expect(errs[0].libraryName).toBe("Root");
    expect(errs[0].filePath).toBeDefined();
  });

  it("REJECTS a FOREIGN boolean composition leaf — stronger than the emitter (disc 404 Q8)", () => {
    // `"Root"."Bad"` (CodeableConcept) composes over `"Vitals"."Flag"` (boolean). The emitter forces a
    // cross-library composition operand to "refinement" and never FIXMEs it; the validator resolves
    // the real foreign type and flags it.
    const result = validateCRLImports(join(FIXTURES, "ruleb-cross-lib-composition", "root.crl"));
    const errs = result.validationErrors.filter(
      (e): e is UseSiteTypeMismatchError =>
        e.kind === "use-site-type-mismatch" && e.rule === "boolean-in-refinement-composition",
    );
    expect(errs).toHaveLength(1);
    expect(errs[0].conceptName).toBe("Bad");
    expect(errs[0].actual).toBe("boolean");
    expect(errs[0].libraryName).toBe("Root");
  });

  it("origin-keying: a local-vs-package same-name collision does NOT produce a false mismatch", () => {
    // local Foo.X is boolean, package Foo.X is Quantity; `include "Foo".` binds `"Foo"."X"`
    // package-first (Quantity) -> a valid value-comparison operand -> NO error. A name-keyed
    // (origin-blind) index could read local Foo.X (boolean) and fire a false hard error.
    const result = validateCRLImports(join(FIXTURES, "ruleb-origin-collision", "root.crl"));
    const ruleB = result.validationErrors.filter((e) => e.kind === "use-site-type-mismatch");
    expect(ruleB).toHaveLength(0);
    // `success` with NO errors proves BOTH that the ref RESOLVED (an unresolved qualified ref would
    // fire external-library-not-included / qualified-ref-unresolved) AND that origin-keying used the
    // package's Quantity X (the local boolean X would have fired an is-Quantity mismatch).
    expect(result.validationErrors).toHaveLength(0);
    expect(result.success).toBe(true);
  });

  it("origin-keying (inverse): the PACKAGE type is positively retrieved, not the local one", () => {
    // local Foo.X=Quantity (would be clean), package Foo.X=boolean; `include "Foo".` binds
    // package-first -> the boolean X -> exactly one mismatch. Proves the package-index TYPED leg
    // is read (not silently `unresolved`) AND reverse origin isolation (local Quantity not used).
    const result = validateCRLImports(join(FIXTURES, "ruleb-origin-collision-inverse", "root.crl"));
    const errs = result.validationErrors.filter(
      (e): e is UseSiteTypeMismatchError => e.kind === "use-site-type-mismatch" && e.rule === "operand-shape",
    );
    expect(errs).toHaveLength(1);
    expect(errs[0].actual).toBe("boolean");
  });
});
