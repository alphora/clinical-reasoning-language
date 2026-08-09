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

    it("KNOWN LIMITATION: a nested-modifier form (`most recent X active`) does NOT check the inner operand", () => {
      // MostRecent(Active(X)) — the time-selection constraint no-ops the nested position (a nested
      // call has no derivable type; typing it is the return-type back door the headline forbids).
      // So a DERIVED-boolean X wrapped in `active` is NOT caught. This pins the documented gap
      // (disc 397 [critical] #3) so it can't silently change; closing it needs a design decision.
      const src =
        `library "T".\n` +
        `concept "Src":\n- value type is dateTime.\n- code is \`s\`.\n` +
        `concept "B":\n- value type is boolean.\n- defined as exists ( "Src" ).\n` +
        `concept "Sel":\n- value type is dateTime.\n- definition is most recent "B" active.\n`;
      expect(mismatches(src)).toHaveLength(0);
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

  it("every entry has a representative phrase", () => {
    for (const pattern of Object.keys(OPERAND_CONSTRAINTS)) {
      expect(REP_PHRASE[pattern], `add a representative phrase for ${pattern}`).toBeDefined();
    }
  });

  it("every constrained position resolves to a concept-operand slot at the named pattern", () => {
    for (const [pattern, constraints] of Object.entries(OPERAND_CONSTRAINTS)) {
      const call = matchDef(REP_PHRASE[pattern]);
      expect(call.known, `${pattern}: representative phrase should match a known pattern`).toBe(true);
      expect(call.pattern, `${pattern}: matcher produced a different pattern`).toBe(pattern);
      for (const c of constraints) {
        const arg = call.args[c.position];
        expect(arg, `${pattern} arg[${c.position}] missing`).toBeDefined();
        // Every representative phrase puts a bare concept ref at the constrained position, so
        // assert EXACTLY `ConceptRefArg` — a looser set would weaken the arg-order tripwire this
        // test exists for (a matcher change that swapped in a Quantity/Enum at position 0 must fail).
        expect(arg.type, `${pattern} arg[${c.position}] is ${arg.type}, not a bare concept operand`).toBe(
          "ConceptRefArg",
        );
      }
    }
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

  it("the pre-redesign mammogram-and-bmi.crl exemplar: `most recent \"Mammogram\"` warns (untyped), not errors", () => {
    // The kit's `concept-layer-model` exemplar predates the v3 model. Its `"Mammogram"` is a
    // value-preserving `defined as ( … sem-or … )` with NO declared value type, so under the
    // CORRECTED model (sem-or is value-preserving, NOT boolean) `most recent "Mammogram"` sees an
    // UNTYPED operand -> a use-site-operand-untyped WARNING, not a mismatch error. (The plan/disc 397
    // predicted a mismatch; that framing predates the sem-or-value-preserving correction — the
    // corrected behavior is a warning. Once the KE-migrated (C) exemplar declares "Mammogram" as
    // dateTime, this site becomes clean.) This pins that rule B does not ERROR on it.
    const src = readFileSync(
      join(__dirname, "../../tests/fixtures/representation/mammogram-and-bmi.crl"),
      "utf8",
    );
    const built = buildCRL(src);
    if (!built.success || !built.result) throw new Error("build failed");
    const result = new Validator().validate(built.result);
    const ruleBErrors = result.errors.filter((e) => e.kind === "use-site-type-mismatch");
    expect(ruleBErrors).toHaveLength(0);
    const untyped = result.warnings.filter(
      (e) => e.kind === "use-site-operand-untyped" && e.conceptName === "Most Recent Mammogram",
    );
    expect(untyped).toHaveLength(1);
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
