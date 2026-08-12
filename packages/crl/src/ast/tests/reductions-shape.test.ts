import { describe, it, expect } from "vitest";

import { emitCQL } from "../../cql-emitter/emitCQL";
import { conceptShapes } from "../../grammar/conceptShapes";
import { buildCRL } from "../../index";
import type { CRLError } from "../../types/errors";
import { Validator } from "../../validator/validator";
import {
  Concept,
  DefinitionIsDefinition,
  NWord,
  ReductionConceptRef,
  ReductionDefinition,
  ThisRecords,
} from "../types";

import { parseInput } from "./parseInput";

// #189 grammar+validation slice — IMPL 1 (grammar + AST foundation):
//   - `shape is <Scalar|Record|RecordSet>.` concept-level line (Scalar default, builder-normalized)
//   - the dedicated `count <target> at least N` reduction production
//   - the structural `Reduction` discriminated union (exists / mostRecent / count) over a
//     `ThisRecords | ReductionConceptRef` target, replacing the recognized `definition is`
//     narrative forms
//   - builder fold of `exists this` / `exists "X"` / `most recent this`; `most recent "X"` NOT folded
//   - AT_LEAST re-expanded so existing "at least" narrative matchers are unaffected

const conceptNamed = (src: string, name: string): Concept => {
  const ast = parseInput(src);
  return ast.statements.find((s) => s.type === "Concept" && s.name === name) as Concept;
};

const ruleOf = (e: CRLError): string | undefined =>
  (e as { details?: { rule?: string } }).details?.rule;

// ---------------------------------------------------------------- shape is
describe("shape is — concept-level published-value cardinality", () => {
  it("defaults an omitted `shape is` to Scalar (REQUIRED on the AST; never undefined)", () => {
    const c = conceptNamed(
      `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n`,
      "C",
    );
    expect(c.shape).toBe("Scalar");
  });

  it("captures an explicit Record / RecordSet shape", () => {
    const src =
      `library "T".\nconcept "R":\n- type is Condition.\n- shape is Record.\n- code is \`r\`.\n` +
      `concept "RS":\n- type is Condition.\n- shape is RecordSet.\n- code is \`rs\`.\n`;
    expect(conceptNamed(src, "R").shape).toBe("Record");
    expect(conceptNamed(src, "RS").shape).toBe("RecordSet");
  });

  it("REJECTS an invalid shape value (closed allowlist in SHAPE_MODE)", () => {
    const built = buildCRL(
      `library "T".\nconcept "C":\n- shape is Bag.\n- value type is boolean.\n- code is \`c\`.\n`,
    );
    expect(built.success).toBe(false);
  });

  it("REJECTS a duplicate `shape is` line (builder cardinality)", () => {
    const built = buildCRL(
      `library "T".\nconcept "C":\n- shape is Scalar.\n- shape is Record.\n- value type is boolean.\n- code is \`c\`.\n`,
    );
    expect(built.success).toBe(false);
    expect((built.errors ?? []).some((e) => ruleOf(e) === "duplicate-shape")).toBe(true);
  });
});

// ---------------------------------------------------------------- count reduction
describe("count reduction — the dedicated production (bare integer threshold)", () => {
  it("`count this at least N` → Reduction{count, ThisRecords, atLeast:N}", () => {
    const c = conceptNamed(
      `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is count this at least 3.\n`,
      "C",
    );
    const def = c.definition as ReductionDefinition;
    expect(def.type).toBe("ReductionDefinition");
    expect(def.reduction.kind).toBe("count");
    expect(def.reduction.target.type).toBe("ThisRecords");
    expect(def.reduction.kind === "count" && def.reduction.atLeast).toBe(3);
  });

  it("`count \"X\" at least N` → Reduction{count, ReductionConceptRef, atLeast:N}", () => {
    const src =
      `library "T".\nconcept "X":\n- type is Condition.\n- shape is RecordSet.\n- code is \`x\`.\n` +
      `concept "C":\n- value type is boolean.\n- definition is count "X" at least 2.\n`;
    const def = conceptNamed(src, "C").definition as ReductionDefinition;
    expect(def.reduction.kind).toBe("count");
    const target = def.reduction.target as ReductionConceptRef;
    expect(target.type).toBe("ReductionConceptRef");
    expect(target.ref).toBe("X");
  });
});

// ---------------------------------------------------------------- narrative folds
describe("narrative reduction folds", () => {
  it("`exists this` → Reduction{exists, ThisRecords}", () => {
    const def = conceptNamed(
      `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is exists this.\n`,
      "C",
    ).definition as ReductionDefinition;
    expect(def.type).toBe("ReductionDefinition");
    expect(def.reduction.kind).toBe("exists");
    expect((def.reduction.target as ThisRecords).type).toBe("ThisRecords");
  });

  it("`exists \"X\"` → Reduction{exists, ReductionConceptRef}", () => {
    const src =
      `library "T".\nconcept "X":\n- type is Condition.\n- shape is RecordSet.\n- code is \`x\`.\n` +
      `concept "C":\n- value type is boolean.\n- definition is exists "X".\n`;
    const def = conceptNamed(src, "C").definition as ReductionDefinition;
    expect(def.reduction.kind).toBe("exists");
    expect((def.reduction.target as ReductionConceptRef).ref).toBe("X");
  });

  it("`most recent this` → Reduction{mostRecent, ThisRecords}", () => {
    const def = conceptNamed(
      `library "T".\nconcept "C":\n- value type is Quantity.\n- code is \`c\`.\n- definition is most recent this.\n`,
      "C",
    ).definition as ReductionDefinition;
    expect(def.reduction.kind).toBe("mostRecent");
    expect((def.reduction.target as ThisRecords).type).toBe("ThisRecords");
  });

  it("`most recent \"X\"` is NOT folded — stays a DefinitionIsDefinition (keeps its live matcher path)", () => {
    const src =
      `library "T".\nconcept "X":\n- type is Observation.\n- shape is RecordSet.\n- code is \`x\`.\n` +
      `concept "C":\n- value type is Quantity.\n- definition is most recent "X".\n`;
    const def = conceptNamed(src, "C").definition as DefinitionIsDefinition;
    expect(def.type).toBe("DefinitionIsDefinition");
  });
});

// ---------------------------------------------------------------- no-regression: "at least" prose
describe("keyword re-admission — prose still parses, `at least` stream preserved", () => {
  it("`at least` in an age narrative stays TWO NWords (`at`, `least`), not one AT_LEAST element", () => {
    const c = conceptNamed(
      `library "T".\nconcept "Aged 18+":\n- value type is boolean.\n- definition is age today at least 18 years.\n`,
      "Aged 18+",
    );
    const def = c.definition as DefinitionIsDefinition;
    expect(def.type).toBe("DefinitionIsDefinition");
    const words = def.body.elements.filter((e): e is NWord => e.type === "NWord").map((w) => w.value);
    expect(words).toContain("at");
    expect(words).toContain("least");
    expect(words).not.toContain("at least");
  });

  it("`count` / `this` still parse as prose narrative words when not in a reduction shape", () => {
    const src =
      `library "T".\nconcept "X":\n- type is Encounter.\n- shape is RecordSet.\n- code is \`x\`.\n` +
      `concept "C":\n- value type is boolean.\n- definition is count of "X" in this setting.\n`;
    const def = conceptNamed(src, "C").definition as DefinitionIsDefinition;
    expect(def.type).toBe("DefinitionIsDefinition");
    const words = def.body.elements.filter((e): e is NWord => e.type === "NWord").map((w) => w.value);
    expect(words).toContain("count");
    expect(words).toContain("this");
  });

  it("the count form is whitespace-insensitive (`at` / `least` are separate tokens)", () => {
    const c = conceptNamed(
      `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is count this at  least  3.\n`,
      "C",
    );
    const def = c.definition as ReductionDefinition;
    expect(def.type).toBe("ReductionDefinition");
    expect(def.reduction.kind).toBe("count");
  });
});

// -------------------------------------------------- ANTLR shared-prefix prediction (gpt56 R1 #3)
describe("count shared-prefix prediction — `COUNT reductionTarget …` falls back to narrative", () => {
  it("`count \"X\" today` (no `at least N`) stays narrative", () => {
    const src =
      `library "T".\nconcept "X":\n- type is Encounter.\n- shape is RecordSet.\n- code is \`x\`.\n` +
      `concept "C":\n- value type is boolean.\n- definition is count "X" today.\n`;
    expect((conceptNamed(src, "C").definition as DefinitionIsDefinition).type).toBe("DefinitionIsDefinition");
  });

  it("`count this today` stays narrative", () => {
    expect(
      (
        conceptNamed(
          `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is count this today.\n`,
          "C",
        ).definition as DefinitionIsDefinition
      ).type,
    ).toBe("DefinitionIsDefinition");
  });

  it("`count \"X\" at least 2 years` (a UNIT-bearing threshold) stays narrative, not a count reduction", () => {
    const src =
      `library "T".\nconcept "X":\n- type is Encounter.\n- shape is RecordSet.\n- code is \`x\`.\n` +
      `concept "C":\n- value type is boolean.\n- definition is count "X" at least 2 years.\n`;
    expect((conceptNamed(src, "C").definition as DefinitionIsDefinition).type).toBe("DefinitionIsDefinition");
  });

  it("a QUALIFIED count target `count \"Other\".\"X\" at least 2` builds a reduction with the qualified ref", () => {
    const src =
      `library "T".\nconcept "C":\n- value type is boolean.\n- definition is count "Other"."X" at least 2.\n`;
    const def = conceptNamed(src, "C").definition as ReductionDefinition;
    expect(def.reduction.kind).toBe("count");
    const target = def.reduction.target as ReductionConceptRef;
    expect(target.type).toBe("ReductionConceptRef");
    expect(typeof target.ref).toBe("object"); // QualifiedReference, not a bare string
    expect((target.ref as { name: string }).name).toBe("X");
  });
});

// -------------------------------------------------- count threshold sanity (gpt56 R1 #1)
describe("count threshold must be a whole number (structural, fail-closed)", () => {
  it("REJECTS a decimal threshold `at least 2.5`", () => {
    const built = buildCRL(
      `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is count this at least 2.5.\n`,
    );
    expect(built.success).toBe(false);
    expect((built.errors ?? []).some((e) => ruleOf(e) === "count-threshold-not-integer")).toBe(true);
  });

  it("REJECTS an unsafe-magnitude integer threshold", () => {
    const built = buildCRL(
      `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is count this at least 99999999999999999999.\n`,
    );
    expect(built.success).toBe(false);
    expect((built.errors ?? []).some((e) => ruleOf(e) === "count-threshold-not-integer")).toBe(true);
  });
});

// -------------------------------------------------- regression pins: folded refs still resolve (Claude R1 #1)
describe("folded named reductions keep ref-resolution + cycle detection (no silent regression)", () => {
  const validate = (src: string) => {
    const built = buildCRL(src);
    expect(built.success, JSON.stringify(built.errors)).toBe(true);
    return new Validator().validate(built.result!);
  };

  it("an UNRESOLVABLE `exists \"X\"` operand still errors (previously walked as narrative)", () => {
    const result = validate(
      `library "T".\nconcept "C":\n- value type is boolean.\n- definition is exists "Nope".\n`,
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => JSON.stringify(e).includes("Nope"))).toBe(true);
  });

  it("an UNRESOLVABLE `count \"X\" at least N` operand still errors", () => {
    const result = validate(
      `library "T".\nconcept "C":\n- value type is boolean.\n- definition is count "Nope" at least 2.\n`,
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => JSON.stringify(e).includes("Nope"))).toBe(true);
  });

  it("a self-referential `exists \"C\"` still trips cycle detection", () => {
    const result = validate(
      `library "T".\nconcept "C":\n- value type is boolean.\n- definition is exists "C".\n`,
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.kind === "reference-cycle")).toBe(true);
  });
});

// -------------------------------------------------- emit is non-active for reductions (Claude R1 #2)
describe("reductions are validate-only: emit fails loud", () => {
  it("a no-code reduction concept fails emit loud with the structured `emit-reduction-not-active` sentinel (IMPL 3)", () => {
    // A no-`code is` reduction reaches the deep emit throw (emitConceptBody); emitCQLFromAST's catch
    // surfaces the typed `ReductionNotActiveError` as a STRUCTURED `emit-reduction-not-active`
    // diagnostic (a filterable kind, not a bare `type: "Exception"`).
    const src =
      `library "T".\nconcept "X":\n- type is Condition.\n- shape is RecordSet.\n- code is \`x\`.\n` +
      `concept "C":\n- value type is boolean.\n- definition is exists "X".\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success).toBe(false);
    const sentinel = (r.errors ?? []).find((e) => e.kind === "emit-reduction-not-active");
    expect(sentinel).toBeDefined();
    expect(sentinel!.message).toMatch(/CANNOT yet be emitted|emit activates at the flip/);
  });

  it("IMPL 3: `code is` + `exists this` now fails emit with the dedicated `emit-reduction-not-active` sentinel (was the generic mixed error)", () => {
    // Replaces the pre-IMPL-3 INTERIM TRAP. A `code is` + reduction is caught by `lowerLocalCodes`
    // BEFORE the generic mixed check, so the KE gets the reduction-specific sentinel — NOT the generic
    // `emit-mixed-code-and-definition` that interpolated the raw `ReductionDefinition` type name.
    const src =
      `library "T".\nconcept "C":\n- value type is boolean.\n- code is \`c\`.\n- definition is exists this.\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success).toBe(false);
    expect((r.errors ?? []).some((e) => e.kind === "emit-reduction-not-active")).toBe(true);
    expect((r.errors ?? []).some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(false);
    // The misleading raw AST type name no longer leaks into the message.
    expect((r.errors ?? []).every((e) => !/ReductionDefinition/.test(e.message ?? ""))).toBe(true);
  });
});

// -------------------------------------------------- shape allowlist drift pin (gpt56 R1 #4)
describe("concept-shape allowlist", () => {
  it("the extracted runtime list matches the three canonical shapes (drift guard vs the union)", () => {
    expect(conceptShapes).toEqual(["Scalar", "Record", "RecordSet"]);
  });
});
