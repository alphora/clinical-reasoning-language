import { describe, it, expect } from "vitest";

import { emitCQL } from "../../cql-emitter/emitCQL";
import { buildCRL, validateCRL } from "../../index";
import type { CRLError } from "../../types/errors";
import { Concept } from "../types";

// disc 402 (T4 STEP 1) — the concept body is now ORDER-INDEPENDENT. The fixed line sequence that
// used to be grammar-enforced was pure convention (KEs faceplanted on `- meta is @tag` placement
// and `value type` vs `type` order); it is removed. CARDINALITY (at most one of each singleton
// line) is no longer the grammar's job — the BUILDER enforces it, FAIL-CLOSED (a duplicate makes
// `buildCRL` fail, so it never reaches emit — the exact guarantee the old sequence gave, and one a
// validator-only check could not give because `emit_cql` does not run the validator).

/** Deep-clone an AST value with every `location` key removed, so two parses of the same concept in
 *  different line orders compare equal on STRUCTURE (reordering necessarily shifts every Location). */
const stripLocations = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(stripLocations);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k === "location") continue;
      out[k] = stripLocations(val);
    }
    return out;
  }
  return v;
};

const conceptOf = (src: string, name: string): Concept => {
  const built = buildCRL(src);
  expect(built.success, JSON.stringify(built.errors)).toBe(true);
  const c = built.result!.statements.find((s) => s.type === "Concept" && s.name === name);
  expect(c, `concept "${name}" not found`).toBeDefined();
  return c as Concept;
};

const ruleOf = (e: CRLError): string | undefined =>
  (e as { details?: { rule?: string } }).details?.rule;

const rulesIn = (errors: CRLError[] | undefined): string[] =>
  (errors ?? []).map(ruleOf).filter((r): r is string => r !== undefined);

describe("concept body is order-independent (disc 402)", () => {
  // Same concept, three line orders. The canonical order is a strict SUBSET of the language, so all
  // three must build the SAME concept (location-stripped).
  const canonical = `library "T".
concept "C":
- type is Observation.
- value element is Observation.value.
- value type is Quantity.
- meta is \`@severity high\`.
- evidence is \`per policy\`.
- code is \`c\`.`;

  const valueTypeFirst = `library "T".
concept "C":
- value type is Quantity.
- type is Observation.
- value element is Observation.value.
- meta is \`@severity high\`.
- evidence is \`per policy\`.
- code is \`c\`.`;

  const scrambled = `library "T".
concept "C":
- code is \`c\`.
- meta is \`@severity high\`.
- value type is Quantity.
- evidence is \`per policy\`.
- type is Observation.
- value element is Observation.value.`;

  it("value-type-before-type builds the same concept as canonical", () => {
    expect(stripLocations(conceptOf(valueTypeFirst, "C"))).toEqual(
      stripLocations(conceptOf(canonical, "C")),
    );
  });

  it("a fully scrambled body (code/meta first, type last) builds the same concept", () => {
    expect(stripLocations(conceptOf(scrambled, "C"))).toEqual(
      stripLocations(conceptOf(canonical, "C")),
    );
  });

  it("`@tag` meta placed first parses and is captured on the concept", () => {
    const c = conceptOf(scrambled, "C");
    expect(c.meta?.map((m) => m.text)).toEqual(["@severity high"]);
  });

  it("repeated `meta` lines keep their relative source order regardless of surrounding order", () => {
    const src = `library "T".
concept "C":
- meta is \`@severity high\`.
- type is Observation.
- meta is \`@audience clinician\`.
- value type is Quantity.
- code is \`c\`.`;
    const c = conceptOf(src, "C");
    expect(c.meta?.map((m) => m.text)).toEqual(["@severity high", "@audience clinician"]);
  });

  it("a source-representation body is itself order-independent", () => {
    const canonicalRep = `library "T".
concept "C":
- value type is dateTime.
- code is \`c\`.
- source representation:
  - type is Patient.
  - value element is Patient.birthDate.
  - value type is dateTime.
  - value projection is age today at least 18 years.`;
    const reorderedRep = `library "T".
concept "C":
- value type is dateTime.
- code is \`c\`.
- source representation:
  - value projection is age today at least 18 years.
  - value type is dateTime.
  - value element is Patient.birthDate.
  - type is Patient.`;
    expect(stripLocations(conceptOf(reorderedRep, "C").representations)).toEqual(
      stripLocations(conceptOf(canonicalRep, "C").representations),
    );
  });
});

describe("concept-body cardinality is builder-enforced and fail-closed (disc 402)", () => {
  const build = (body: string) => buildCRL(`library "T".\nconcept "C":\n${body}`);

  it("a duplicate `type` fails the build with duplicate-type, anchored on the 2nd line", () => {
    // lines: 1 library, 2 concept, 3 type, 4 type(dup)
    const r = build(`- type is Observation.\n- type is Condition.\n- value type is boolean.\n- code is \`c\`.`);
    expect(r.success).toBe(false);
    const dup = (r.errors ?? []).find((e) => ruleOf(e) === "duplicate-type");
    expect(dup).toBeDefined();
    expect(dup!.line).toBe(4);
  });

  it("a duplicate `value element` fails with duplicate-value-element", () => {
    const r = build(
      `- type is Observation.\n- value element is Observation.value.\n- value element is Observation.note.\n- value type is Quantity.\n- code is \`c\`.`,
    );
    expect(r.success).toBe(false);
    expect(rulesIn(r.errors)).toContain("duplicate-value-element");
  });

  it("a duplicate `evidence` fails with duplicate-evidence", () => {
    const r = build(
      `- value type is boolean.\n- evidence is \`one\`.\n- evidence is \`two\`.\n- code is \`c\`.`,
    );
    expect(r.success).toBe(false);
    expect(rulesIn(r.errors)).toContain("duplicate-evidence");
  });

  it("a duplicate `code` fails with duplicate-code", () => {
    const r = build(`- value type is boolean.\n- code is \`c\`.\n- code is \`d\`.`);
    expect(r.success).toBe(false);
    expect(rulesIn(r.errors)).toContain("duplicate-code");
  });

  it("two `defined as` bodies fail with multiple-definitions (repeat wording)", () => {
    const r = build(
      `- value type is boolean.\n- defined as ("A" sem-or "B").\n- defined as ("C" sem-or "D").`,
    );
    expect(r.success).toBe(false);
    const dup = (r.errors ?? []).find((e) => ruleOf(e) === "multiple-definitions");
    expect(dup).toBeDefined();
    expect(dup!.message).toContain("defined as");
  });

  it("`defined as` + `definition is` together fail with multiple-definitions (mix wording)", () => {
    const r = build(
      `- value type is boolean.\n- defined as ("A" sem-or "B").\n- definition is "X" performed.`,
    );
    expect(r.success).toBe(false);
    const dup = (r.errors ?? []).find((e) => ruleOf(e) === "multiple-definitions");
    expect(dup).toBeDefined();
    expect(dup!.message).toMatch(/alternative definition forms/);
  });

  it("a concept-level duplicate `coded from` fails with multiple-definitions", () => {
    const r = build(`- value type is boolean.\n- coded from "VS1".\n- coded from "VS2".`);
    expect(r.success).toBe(false);
    const dup = (r.errors ?? []).find((e) => ruleOf(e) === "multiple-definitions");
    expect(dup).toBeDefined();
    expect(dup!.message).toContain("coded from");
  });

  it("`coded from` + `defined as` together fail with multiple-definitions (mix wording)", () => {
    const r = build(
      `- value type is boolean.\n- coded from "VS1".\n- defined as ("A" sem-or "B").`,
    );
    expect(r.success).toBe(false);
    const dup = (r.errors ?? []).find((e) => ruleOf(e) === "multiple-definitions");
    expect(dup).toBeDefined();
    expect(dup!.message).toMatch(/alternative definition forms/);
  });

  it("multiple-definitions anchors on the 2nd-AUTHORED line across kinds (proves the position sort)", () => {
    // Concat order is coded-from, defined-as, definition-is — so authoring `definition is` on an
    // EARLIER line than `coded from` makes the naive concat order (coded-from first) disagree with
    // source order. The sort must anchor on the LATER line (the `coded from`), not the concat-first.
    // lines: 1 library, 2 concept, 3 value type, 4 definition is, 5 coded from
    const r = buildCRL(
      `library "T".\nconcept "C":\n- value type is boolean.\n- definition is "X" performed.\n- coded from "VS".`,
    );
    expect(r.success).toBe(false);
    const dup = (r.errors ?? []).find((e) => ruleOf(e) === "multiple-definitions");
    expect(dup).toBeDefined();
    expect(dup!.line).toBe(5);
  });

  it("duplicate lines inside a source representation are rejected (type / value element / coded from / value projection)", () => {
    const dupRepType = build(
      `- value type is Quantity.\n- code is \`c\`.\n- source representation:\n  - type is Observation.\n  - type is Condition.\n  - value element is Observation.value.\n  - value type is Quantity.`,
    );
    expect(dupRepType.success).toBe(false);
    expect(rulesIn(dupRepType.errors)).toContain("duplicate-type");

    const dupRepValueElement = build(
      `- value type is Quantity.\n- code is \`c\`.\n- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value element is Observation.note.\n  - value type is Quantity.`,
    );
    expect(dupRepValueElement.success).toBe(false);
    expect(rulesIn(dupRepValueElement.errors)).toContain("duplicate-value-element");

    const dupCodedFrom = build(
      `- value type is Quantity.\n- code is \`c\`.\n- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n  - coded from "VS1".\n  - coded from "VS2".`,
    );
    expect(dupCodedFrom.success).toBe(false);
    expect(rulesIn(dupCodedFrom.errors)).toContain("duplicate-coded-from");

    const dupProjection = build(
      `- value type is dateTime.\n- code is \`c\`.\n- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is dateTime.\n  - value projection is age today at least 18 years.\n  - value projection is age today at least 21 years.`,
    );
    expect(dupProjection.success).toBe(false);
    expect(rulesIn(dupProjection.errors)).toContain("duplicate-value-projection");
  });

  it("FAIL-CLOSED: a duplicate blocks `emit_cql` too (emitCQL does not run the validator)", () => {
    // This is the property the builder-emit decision rests on: were cardinality validator-only, a
    // two-definition concept would parse and emitCQL would silently emit the priority-picked value.
    const src = `library "T".\nconcept "C":\n- value type is boolean.\n- defined as ("A" sem-or "B").\n- definition is "X" performed.`;
    expect(emitCQL(src).success).toBe(false);
  });
});

describe("boundaries preserved (disc 402)", () => {
  it("an empty concept body is still REJECTED — by the validator now, not by the builder", () => {
    // ⚠ THE BOUNDARY MOVED, IT DID NOT DISAPPEAR. "A concept must carry some substance" used to THROW in
    // the AST builder; it now lives in `conceptSubstanceValidator` (operator instruction, 2026-09-02),
    // because an `AstError` aborts the build and suppresses every OTHER diagnostic on the file — MEASURED:
    // this very source now also reports the missing `value type`, which the build abort had been hiding.
    //
    // Asserting `buildCRL(...).success === false` here would re-pin the OLD location and quietly forbid
    // the move, so this pins BOTH halves: it builds, and validation rejects it.
    const built = buildCRL(`library "T".
concept "C":`);
    expect(built.success, "an inert concept must still BUILD — the rule is semantic, not syntactic").toBe(true);

    const v = validateCRL(`library "T".
concept "C":`, { soft: true }) as unknown as {
      errors?: { kind: string }[];
    };
    expect((v.errors ?? []).map((e) => e.kind)).toContain("concept-no-substance");
  });

  // The NON-shared line kinds have no `representationBody` slot, so writing one after a posrep is a
  // LOUD parse error (the boundary "holds" for these). Pinned so a future grammar edit that adds one
  // of these to `representationBody` flips loud→silent visibly (disc 402 impl-review Fable#2).
  it.each([
    ["definition is", `- definition is "X" performed.`],
    ["defined as", `- defined as ("A" sem-or "B").`],
    ["code is", "- code is `late`."],
    ["evidence is", "- evidence is `late`."],
    ["meta is", "- meta is `@severity high`."],
  ])("a `%s` line written AFTER a posrep is a parse error (no slot)", (_kind, line) => {
    const built = buildCRL(
      `library "T".\nconcept "C":\n- value type is dateTime.\n- code is \`c\`.\n- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is dateTime.\n${line}`,
    );
    expect(built.success).toBe(false);
  });

  it("a SHARED-kind `coded from` written after a coded-from-less posrep is SILENTLY absorbed by it (design-inherent; the language cannot catch this — teaching does)", () => {
    // Fable#1: the one trap order-independence cannot flag. The trailing `coded from` joins the
    // posrep (which had none), the concept's definition slot stays null, and nothing fires. Pinned
    // so the behavior is known and the migration/teaching layer accounts for it.
    const built = buildCRL(
      `library "T".\nconcept "C":\n- code is \`c\`.\n- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n- coded from "VS".`,
    );
    expect(built.success).toBe(true);
    const c = built.result!.statements.find((s) => s.type === "Concept") as Concept;
    expect(c.definition).toBeUndefined();
    expect(c.representations[0].terminologyName).toBe("VS");
  });

  it("a concept-level singleton line written AFTER a posrep is captured by that posrep (not the concept) — so STEP-2 inserts value-type in the PREFIX", () => {
    // Posreps are trailing and `representationBody` shares line kinds with the concept body, so a
    // `- value type is …` appended after a posrep joins the posrep. Here it becomes the posrep's
    // SECOND value type → A.9 (validator), NOT a concept-level value type. Pinned so the migration
    // never blindly appends.
    const built = buildCRL(
      `library "T".\nconcept "C":\n- code is \`c\`.\n- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is dateTime.\n- value type is boolean.`,
    );
    expect(built.success).toBe(true);
    const c = built.result!.statements.find((s) => s.type === "Concept") as Concept;
    // The trailing `value type is boolean` attached to the posrep (now 2 value types there), and did
    // NOT become the concept's value type.
    expect(c.valueTypes).toEqual([]);
    expect(c.representations[0].valueTypes).toEqual(["dateTime", "boolean"]);
  });
});
