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

// -------------------------------------------------- reductions emit progressively (#189 flip)
describe("reductions emit progressively (#189 flip): `exists` + `count` + Scalar-boolean + Record `most recent this` active; non-boolean Scalar `most recent` still loud", () => {
  it("#189 flip Slice A: a no-code named `exists \"X\"` reduction now EMITS `exists (<X>)` (was validate-only)", () => {
    // Slice A activates a reduction over a NAMED RecordSet operand (`exists "X"`) — it emits like
    // `defined as exists`. `code is` + `exists this` also emits now (Slice A2, below); the value-read
    // forms (count / most recent) stay loud (below / #189).
    const src =
      `library "T".\nconcept "X":\n- type is Condition.\n- shape is RecordSet.\n- code is \`x\`.\n` +
      `concept "C":\n- value type is boolean.\n- definition is exists "X".\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
    expect(r.result ?? "").toMatch(/define "C":\s*\n\s*exists \("X"\)/);
    // The RecordSet publisher X retrieves its OWN records at the NATURAL resource (Condition), NOT the
    // forced-Observation of the scalar boolean-determination path — the two spellings of one
    // determination (`exists "X"` here, `exists this` in A2) must emit the SAME resource (crl-emit R1 crit).
    expect(r.result ?? "").toMatch(/define "X":\s*\n\s*\[Condition: "X Code"\]/);
  });

  it("Slice A2: `code is` + `exists this` now EMITS a records twin + `exists (<X Records>)` (was the reject sentinel)", () => {
    // Slice A2 activates the ONE emittable `code is` + reduction form. `lowerLocalCodes` splits "C"
    // into a RecordSet retrieve twin "C Records" (the concept's own records over its local code, at
    // its NATURAL resource) + the retargeted named `exists`. `emitConceptBody`'s Slice-A gate then
    // emits `exists ("C Records")` over the local RecordSet operand.
    const src =
      `library "T".\nconcept "C":\n- type is Condition.\n- value type is boolean.\n- code is \`c\`.\n- definition is exists this.\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
    // The twin retrieves the concept's own records at the NATURAL resource (Condition, not Observation).
    expect(r.result ?? "").toMatch(/define "C Records":\s*\n\s*\[Condition: "C Code"\]/);
    // The public boolean is the named existence over that twin.
    expect(r.result ?? "").toMatch(/define "C":\s*\n\s*exists \("C Records"\)/);
    expect(r.result ?? "").not.toContain("emit-reduction-not-active");
  });

  it("Slice B1: `code is` + `count this at least N` EMITS a records twin + `Count(<X Records>) >= N`", () => {
    // count reduces THIS concept's own records like `exists this`, but renders a threshold. Same
    // records-twin lowering; the retargeted reduction preserves `count`/`atLeast`.
    const src =
      `library "T".\nconcept "C":\n- type is Condition.\n- value type is boolean.\n- code is \`c\`.\n- definition is count this at least 2.\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
    expect(r.result ?? "").toMatch(/define "C Records":\s*\n\s*\[Condition: "C Code"\]/);
    expect(r.result ?? "").toMatch(/define "C":\s*\n\s*Count\("C Records"\) >= 2/);
  });

  it("Slice B1: a no-code named `count \"X\" at least N` reduction EMITS `Count(<X>) >= N`", () => {
    const src =
      `library "T".\nconcept "X":\n- type is Condition.\n- shape is RecordSet.\n- code is \`x\`.\n` +
      `concept "C":\n- value type is boolean.\n- definition is count "X" at least 3.\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
    expect(r.result ?? "").toMatch(/define "C":\s*\n\s*Count\("X"\) >= 3/);
  });

  it("Slice B1: `count this at least 0` is an author error (trivially true) — `emit-count-threshold-trivial`", () => {
    const src =
      `library "T".\nconcept "C":\n- type is Observation.\n- value type is boolean.\n- code is \`c\`.\n- definition is count this at least 0.\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success).toBe(false);
    expect((r.errors ?? []).some((e) => e.kind === "emit-count-threshold-trivial")).toBe(true);
  });

  it("Slice B1: a NAMED `count \"X\" at least 0` is an author error → `emit-count-threshold-trivial` (NOT the not-active sentinel)", () => {
    // The named path reaches `emitConceptBody` validator-free; a trivial threshold must surface the
    // specific author-error kind, not the misleading "not yet emittable" sentinel (crl-emit B1 disc).
    const src =
      `library "T".\nconcept "X":\n- type is Condition.\n- shape is RecordSet.\n- code is \`x\`.\n` +
      `concept "C":\n- value type is boolean.\n- definition is count "X" at least 0.\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success).toBe(false);
    expect((r.errors ?? []).some((e) => e.kind === "emit-count-threshold-trivial")).toBe(true);
    expect((r.errors ?? []).some((e) => e.kind === "emit-reduction-not-active")).toBe(false);
  });

  it("Slice B1: a NAMED reduction whose RESULT concept is non-boolean → `emit-reduction-shape-incoherent` (charter; validator-free emit path mirrors the `this` guard)", () => {
    // `emitConceptBody` checks only the OPERAND shape; without a result-concept coherence guard a
    // `value type is Quantity` consumer would emit a Boolean it did not declare. Mirror the `this`-path
    // guard (disc 431 crit) on the named path — for both `exists` and `count`.
    const existsSrc =
      `library "T".\nconcept "X":\n- type is Condition.\n- shape is RecordSet.\n- code is \`x\`.\n` +
      `concept "C":\n- value type is Quantity.\n- definition is exists "X".\n`;
    const re = emitCQL(existsSrc, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(re.success).toBe(false);
    expect((re.errors ?? []).some((e) => e.kind === "emit-reduction-shape-incoherent")).toBe(true);

    const countSrc =
      `library "T".\nconcept "X":\n- type is Condition.\n- shape is RecordSet.\n- code is \`x\`.\n` +
      `concept "C":\n- shape is RecordSet.\n- definition is count "X" at least 2.\n`;
    const rc = emitCQL(countSrc, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(rc.success).toBe(false);
    expect((rc.errors ?? []).some((e) => e.kind === "emit-reduction-shape-incoherent")).toBe(true);
  });

  it("Slice B2a: a Scalar boolean `code is` + `most recent this` EMITS select-newest + boolean read + Coalesce", () => {
    // The value-read reduction: select the newest CONFORMING Observation, read its boolean value, and
    // Coalesce to false (closed-world total boolean at the boundary — NOT the age truth-set lift).
    const src =
      `library "T".\nconcept "C":\n- type is Observation.\n- value type is boolean.\n- code is \`c\`.\n- definition is most recent this.\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
    const cql = r.result ?? "";
    expect(cql).toMatch(/define "C Records":\s*\n\s*\[Observation: "C Code"\]/);
    expect(cql).toMatch(/define "C":/);
    // select-newest (aliased where, alias-free sort), conforming type-filter, boolean read, Coalesce.
    expect(cql).toContain("Last(");
    expect(cql).toMatch(/where O\.value is FHIR\.boolean/);
    expect(cql).toMatch(/sort by \(effective as FHIR\.dateTime\)\.value, id/);
    expect(cql).toContain("FHIRHelpers.ToBoolean");
    expect(cql).toMatch(/Coalesce\(/);
    expect(cql).toMatch(/,\s*false/); // closed-world default (comma may be followed by a newline)
  });

  it("Slice B2b: a `shape is Record` `code is` + `most recent this` EMITS a record select-newest (no value read, no Coalesce)", () => {
    // The record-selection reduction: select the newest record over the twin, NO value filter/read and NO
    // Coalesce (a Record result is nullable — empty → null; only booleans are totalized). Procedure carries a
    // `dateTime`-cast recency (`performed`), so the sort is `(performed as FHIR.dateTime).value, id`.
    const src =
      `library "T".\nconcept "C":\n- type is Procedure.\n- shape is Record.\n- code is \`c\`.\n- definition is most recent this.\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
    const cql = r.result ?? "";
    // The twin retrieves the concept's own records at the NATURAL resource (Procedure).
    expect(cql).toMatch(/define "C Records":\s*\n\s*\[Procedure: "C Code"\]/);
    // select-newest, alias-free recency sort — NO where-filter, NO boolean read, NO Coalesce.
    expect(cql).toMatch(/define "C":\s*\n\s*Last\(/);
    expect(cql).toMatch(/sort by \(performed as FHIR\.dateTime\)\.value, id/);
    expect(cql).not.toContain("where O.");
    expect(cql).not.toContain("FHIRHelpers.ToBoolean");
    expect(cql).not.toContain("Coalesce");
  });

  it("Slice B2b: a Record `most recent this` on a `none`-cast recency resource (Condition) sorts by the plain dateTime element", () => {
    // Condition carries a plain-`dateTime` recency (`recordedDate`, cast:none) → `recordedDate.value` with no
    // `as FHIR.dateTime`. A VALUELESS resource is fine for a record SELECT (no value read), unlike the B2a
    // value read which errors valueless. This pins the recency-cast branch of the shared select-newest spine.
    const src =
      `library "T".\nconcept "C":\n- type is Condition.\n- shape is Record.\n- code is \`c\`.\n- definition is most recent this.\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
    const cql = r.result ?? "";
    expect(cql).toMatch(/define "C Records":\s*\n\s*\[Condition: "C Code"\]/);
    expect(cql).toMatch(/define "C":\s*\n\s*Last\(/);
    expect(cql).toMatch(/sort by recordedDate\.value, id/);
    expect(cql).not.toContain("as FHIR.dateTime");
    expect(cql).not.toContain("Coalesce");
  });

  it("Slice B2b: a `shape is Record` `most recent this` with an OPTIONAL value type on a VALUE-BEARING resource (Observation) still emits a bare record select — the datum is ignored (design §1; crl-emit B2b #1 regression guard)", () => {
    // A Record's `value type` is OPTIONAL and names the record's DATUM (design of record §1); a bare record
    // select never reads it. Emit must NOT reject it (rejecting would hard-fail validator-clean content) and
    // must NOT read it. Observation is the one value-BEARING registry row — this pins that a record select
    // ignores the value even when the resource HAS one.
    const src =
      `library "T".\nconcept "C":\n- type is Observation.\n- shape is Record.\n- value type is boolean.\n- code is \`c\`.\n- definition is most recent this.\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
    const cql = r.result ?? "";
    expect(cql).toMatch(/define "C Records":\s*\n\s*\[Observation: "C Code"\]/);
    expect(cql).toMatch(/define "C":\s*\n\s*Last\(/);
    expect(cql).toMatch(/sort by \(effective as FHIR\.dateTime\)\.value, id/);
    // The optional datum is IGNORED: no value filter, no boolean read, no Coalesce.
    expect(cql).not.toContain("where O.");
    expect(cql).not.toContain("FHIRHelpers.ToBoolean");
    expect(cql).not.toContain("Coalesce");
  });

  it("Slice B2b: a Record `most recent this` on a choice-coding resource (MedicationRequest) selects newest with the `none`-cast `authoredOn` recency", () => {
    // MedicationRequest is the one `choice-codeable-concept` coding row AND a `none`-cast recency
    // (`authoredOn`) — this pins a record select at that boundary of the registry.
    const src =
      `library "T".\nconcept "C":\n- type is MedicationRequest.\n- shape is Record.\n- code is \`c\`.\n- definition is most recent this.\n`;
    const r = emitCQL(src, { libraryName: "T", canonicalBase: "http://example.org/crl/t" });
    expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
    const cql = r.result ?? "";
    expect(cql).toMatch(/define "C":\s*\n\s*Last\(/);
    expect(cql).toMatch(/sort by authoredOn\.value, id/);
    expect(cql).not.toContain("as FHIR.dateTime");
    expect(cql).not.toContain("Coalesce");
  });

  it("`most recent this` NON-boolean `code is` reductions still fail loud (`emit-reduction-not-active`; Slice C)", () => {
    // B2a activates only the boolean value read; a non-boolean `most recent this` stays validate-only
    // (Slice C — the case-feature lane is boolean-locked + per-type conversion deferred).
    const src =
      `library "T".\nconcept "C":\n- type is Observation.\n- value type is Quantity.\n- code is \`c\`.\n- definition is most recent this.\n`;
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
