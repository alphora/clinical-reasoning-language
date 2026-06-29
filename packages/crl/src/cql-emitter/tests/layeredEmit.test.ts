import { buildCRL } from "../../index";
import {
  emitLayered,
  isLayerSplittable,
  layersPresent,
  librariesReferencedBy,
} from "../layeredEmit";
import type { Layer } from "../layeredEmit";
import type { CRL } from "../../ast/types";

/**
 * Unit tests for the slice-2 layeredEmit mechanism. The end-to-end golden
 * (emit-golden.test.ts `layered-basic`) covers the happy path byte-for-byte;
 * these tests pin the edge cases the design review surfaced as criticals:
 * self-qualified refs, foreign includes, cross-kind same-name, and the
 * splittability gate.
 */

function ast(body: string): CRL {
  // The parser requires a leading `#` header line.
  const r = buildCRL("# fixture\n" + body);
  if (!r.success || !r.result) {
    throw new Error("parse failed: " + JSON.stringify(r.errors));
  }
  return r.result;
}

const layer = (r: ReturnType<typeof emitLayered>, name: Layer) =>
  r.entries.find((e) => e.layer === name);

describe("layeredEmit — splittability gate", () => {
  it("multi-layer all-classifiable library is splittable", () => {
    const a = ast(`library "X".

terminology "VS":
- valueset is \`vs\`.

concept "Leaf":
- type is Observation.
- coded from "VS".
`);
    expect(layersPresent(a).size).toBe(2);
    expect(isLayerSplittable(a)).toBe(true);
  });

  it("single-layer library is NOT splittable", () => {
    const a = ast(`library "X".

concept "A":
- type is Observation.
- value type is boolean.
- defined as "B".

concept "B":
- type is Observation.
- value type is boolean.
- defined as "A".
`);
    expect(layersPresent(a).size).toBe(1);
    expect(isLayerSplittable(a)).toBe(false);
  });

  it("multi-layer library carrying a Parameter is NOT splittable (would drop it)", () => {
    const a = ast(`library "X".

parameter "Measurement Period":
- param type is Period.

terminology "VS":
- valueset is \`vs\`.

concept "Leaf":
- type is Observation.
- coded from "VS".
`);
    // Two concept-layers present, BUT a Parameter is unclassifiable → not split.
    expect(layersPresent(a).size).toBe(2);
    expect(isLayerSplittable(a)).toBe(false);
  });

  it("MIXED `code is` + `defined as` concept is unclassifiable → library NOT split (fix 2)", () => {
    // A concept carrying BOTH a local `code is` AND a `defined as` must NOT
    // slip onto the layered path (the split would drop the `code is` side).
    // The whole library stays per-CRL until the `code is` slice lands.
    const a = ast(`library "X".

terminology "VS":
- valueset is \`vs\`.

concept "Leaf":
- type is Observation.
- coded from "VS".

concept "Mixed":
- type is Observation.
- value type is boolean.
- code is \`local-code\`.
- defined as "Leaf".
`);
    // The mixed concept is unclassifiable, so only Concepts + Asserted layers
    // are seen — but the unclassifiable statement still disqualifies the split.
    expect(isLayerSplittable(a)).toBe(false);
  });

  it("representation-bearing concept is unclassifiable → library NOT split (fix 2)", () => {
    // A concept with a non-empty `possible representation:` is out of scope
    // for this slice even with a top-level definition.
    const a = ast(`library "X".

terminology "VS":
- valueset is \`vs\`.

concept "Leaf":
- type is Observation.
- coded from "VS".

concept "Repd":
- type is Observation.
- value type is boolean.
- defined as "Leaf".
- source representation: - type is Condition. - coded from "VS".
`);
    expect(isLayerSplittable(a)).toBe(false);
  });
});

describe("layeredEmit — re-qualification", () => {
  it("re-qualifies bare cross-layer refs to the target layer library", () => {
    const a = ast(`library "Basic".

terminology "VS":
- valueset is \`vs\`.

concept "Leaf":
- type is Observation.
- coded from "VS".

concept "Top":
- type is Observation.
- value type is boolean.
- defined as "Leaf".
`);
    const r = emitLayered(a, "Basic");
    expect(r.success).toBe(true);
    expect(r.entries.map((e) => e.libraryName)).toEqual([
      "Basic Concepts",
      "Basic Asserted",
      "Basic Inferred",
    ]);
    // Asserted retrieves the Concepts-layer valueset + includes it.
    const asserted = layer(r, "Asserted")!;
    expect(asserted.crossLibraryIncludes).toEqual(["Basic Concepts"]);
    expect(asserted.result.result).toContain(`[Observation: "Basic Concepts"."VS"]`);
    // Inferred refs the Asserted leaf + includes it.
    const inferred = layer(r, "Inferred")!;
    expect(inferred.crossLibraryIncludes).toEqual(["Basic Asserted"]);
    expect(inferred.result.result).toContain(`"Basic Asserted"."Leaf"`);
  });

  it("re-qualifies SELF-qualified refs (qualifier === original library) to the layer", () => {
    const a = ast(`library "Self".

terminology "VS":
- valueset is \`vs\`.

concept "Leaf":
- type is Observation.
- coded from "Self"."VS".

concept "Top":
- type is Observation.
- value type is boolean.
- defined as "Self"."Leaf".
`);
    const r = emitLayered(a, "Self");
    expect(r.success).toBe(true);
    // The source self-qualified `"Self"."VS"` must become `"Self Concepts"."VS"`,
    // NOT a dangling `Self."VS"` (library `Self` no longer exists after split).
    const asserted = layer(r, "Asserted")!;
    expect(asserted.crossLibraryIncludes).toEqual(["Self Concepts"]);
    expect(asserted.result.result).toContain(`"Self Concepts"."VS"`);
    expect(asserted.result.result).not.toMatch(/\bSelf\."VS"/);
    const inferred = layer(r, "Inferred")!;
    expect(inferred.crossLibraryIncludes).toEqual(["Self Asserted"]);
    expect(inferred.result.result).toContain(`"Self Asserted"."Leaf"`);
  });

  it("keeps genuinely-foreign qualified refs AND their include", () => {
    const a = ast(`library "Mix".

terminology "VS":
- valueset is \`vs\`.

concept "Leaf":
- type is Observation.
- coded from "VS".

concept "Top":
- type is Observation.
- value type is boolean.
- defined as ( "Leaf" sem-or "Shared"."External" ).
`);
    const r = emitLayered(a, "Mix");
    expect(r.success).toBe(true);
    const inferred = layer(r, "Inferred")!;
    // Foreign `"Shared"."External"` survives untouched + earns an include.
    // "Shared" is a simple CQL identifier so it emits unquoted: `Shared."External"`.
    expect(inferred.crossLibraryIncludes).toEqual(["Mix Asserted", "Shared"]);
    expect(inferred.result.result).toContain(`Shared."External"`);
  });

  it("does NOT collapse cross-kind same-name (terminology X + concept X)", () => {
    const a = ast(`library "Ck".

terminology "BMI":
- valueset is \`bmi\`.

concept "BMI":
- type is Observation.
- coded from "BMI".
`);
    expect(isLayerSplittable(a)).toBe(true);
    const r = emitLayered(a, "Ck");
    expect(r.success).toBe(true);
    // The terminology BMI lands in Concepts; the concept BMI in Asserted, and
    // the concept's `coded from "BMI"` resolves (via the terminology slot) to
    // the Concepts-layer valueset.
    const concepts = layer(r, "Concepts")!;
    expect(concepts.result.result).toContain(`valueset "BMI"`);
    const asserted = layer(r, "Asserted")!;
    expect(asserted.crossLibraryIncludes).toEqual(["Ck Concepts"]);
    expect(asserted.result.result).toContain(`"Ck Concepts"."BMI"`);
  });

  it("re-qualifies cross-layer narrative `definition is` refs + includes the target layer (fix 1)", () => {
    // A catalog-matchable `definition is` narrative carrying TWO cross-layer
    // concept refs (`"X" component of "Y"`): both NConceptRefs must be
    // requalified to "Nar Asserted"."..." and the Inferred layer must include
    // "Nar Asserted". (A bare `"X" or "Y"` is not a catalog pattern and would
    // emit an unmatched-narrative sentinel; `component of` is matchable, so the
    // narrative requalification path is exercised end-to-end.)
    const a = ast(`library "Nar".

terminology "VS":
- valueset is \`vs\`.

concept "Asserted Leaf":
- type is Observation.
- coded from "VS".

concept "Other Asserted":
- type is Observation.
- coded from "VS".

concept "Top":
- type is Observation.
- value type is boolean.
- definition is "Asserted Leaf" component of "Other Asserted".
`);
    const r = emitLayered(a, "Nar");
    expect(r.success).toBe(true);
    const inferred = layer(r, "Inferred")!;
    expect(inferred.crossLibraryIncludes).toEqual(["Nar Asserted"]);
    expect(inferred.result.result).toContain(`"Nar Asserted"."Asserted Leaf"`);
    expect(inferred.result.result).toContain(`"Nar Asserted"."Other Asserted"`);
    expect(inferred.result.result).toMatch(/include "Nar Asserted"/);
  });

  it("re-qualifies a standalone `sem-not` cross-layer ref (fix 1)", () => {
    const a = ast(`library "Sn".

terminology "VS":
- valueset is \`vs\`.

concept "Leaf":
- type is Observation.
- coded from "VS".

concept "NotLeaf":
- type is Observation.
- value type is boolean.
- defined as ( sem-not "Leaf" ).
`);
    const r = emitLayered(a, "Sn");
    expect(r.success).toBe(true);
    const inferred = layer(r, "Inferred")!;
    expect(inferred.crossLibraryIncludes).toEqual(["Sn Asserted"]);
    expect(inferred.result.result).toContain(`"Sn Asserted"."Leaf"`);
  });

  it("same-layer self-qualified ref emits BARE, not `X.\"...\"` (fix 4)", () => {
    // Two inferred concepts, one self-qualified-referencing the other:
    // `"Sl"."Other Inferred"` from inside the Inferred layer is a KNOWN
    // same-layer target, so the qualifier drops to a bare local ref. It must
    // NOT surface as a dangling `"Sl"."..."` (library "Sl" no longer exists).
    const a = ast(`library "Sl".

terminology "VS":
- valueset is \`vs\`.

concept "Leaf":
- type is Observation.
- coded from "VS".

concept "Other Inferred":
- type is Observation.
- value type is boolean.
- defined as "Leaf".

concept "Top Inferred":
- type is Observation.
- value type is boolean.
- defined as "Sl"."Other Inferred".
`);
    const r = emitLayered(a, "Sl");
    expect(r.success).toBe(true);
    const inferred = layer(r, "Inferred")!;
    // The self-qualified same-layer ref emits bare.
    expect(inferred.result.result).toContain(`"Other Inferred"`);
    expect(inferred.result.result).not.toMatch(/"Sl"\."Other Inferred"/);
    expect(inferred.result.result).not.toMatch(/\bSl\."Other Inferred"/);
    // It does NOT earn a self-include (same layer).
    expect(inferred.crossLibraryIncludes).not.toContain("Sl");
    expect(inferred.crossLibraryIncludes).not.toContain("Sl Inferred");
  });
});

describe("layeredEmit — librariesReferencedBy (dangling-ref guard support)", () => {
  it("reports foreign qualifiers, excludes bare + self refs", () => {
    const a = ast(`library "Root".

concept "C":
- type is Observation.
- value type is boolean.
- defined as ( "Local" sem-or "Other"."X" ).

concept "Local":
- type is Observation.
- value type is boolean.
- defined as "Root"."Self".

concept "Self":
- type is Observation.
- value type is boolean.
- defined as "Local".
`);
    const refs = librariesReferencedBy(a, "Root");
    expect([...refs]).toEqual(["Other"]); // not "Root" (self), not bare locals
  });
});
