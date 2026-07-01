import { buildCRL } from "../../index";
import {
  emitLayered,
  emitPartitioned,
  FULL_PARTITION,
  interfaceConceptNames,
  isLayerSplittable,
  layerLibraryName,
  layersPresent,
  librariesReferencedBy,
} from "../layeredEmit";
import type { Layer } from "../layeredEmit";
import { lowerLocalCodes } from "../lowerLocalCodes";
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
    // R2 source-typed layers: hand-authored terminology → RecordConcepts,
    // `coded from` → RecordSource, `defined as` → Inferred. #186: names are the
    // unified hyphen-free `S` = layerLibraryName(policyId, layer) (policyId ===
    // source name for direct callers), emitted UNQUOTED in refs (simple ident).
    const rc = layerLibraryName("Basic", "RecordConcepts");
    const rs = layerLibraryName("Basic", "RecordSource");
    const inf = layerLibraryName("Basic", "Inferred");
    expect(r.entries.map((e) => e.libraryName)).toEqual([rc, rs, inf]);
    // RecordSource retrieves the RecordConcepts-layer valueset + includes it.
    const asserted = layer(r, "RecordSource")!;
    expect(asserted.crossLibraryIncludes).toEqual([rc]);
    expect(asserted.result.result).toContain(`[Observation: ${rc}."VS"]`);
    // Inferred refs the RecordSource leaf + includes it.
    const inferred = layer(r, "Inferred")!;
    expect(inferred.crossLibraryIncludes).toEqual([rs]);
    expect(inferred.result.result).toContain(`${rs}."Leaf"`);
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
    // The source self-qualified `"Self"."VS"` must become the RecordConcepts
    // layer's unified `S` ref, NOT a dangling `Self."VS"` (library `Self` no
    // longer exists after split).
    const rc = layerLibraryName("Self", "RecordConcepts");
    const rs = layerLibraryName("Self", "RecordSource");
    const asserted = layer(r, "RecordSource")!;
    expect(asserted.crossLibraryIncludes).toEqual([rc]);
    expect(asserted.result.result).toContain(`${rc}."VS"`);
    expect(asserted.result.result).not.toMatch(/\bSelf\."VS"/);
    const inferred = layer(r, "Inferred")!;
    expect(inferred.crossLibraryIncludes).toEqual([rs]);
    expect(inferred.result.result).toContain(`${rs}."Leaf"`);
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
    expect(inferred.crossLibraryIncludes).toEqual([
      layerLibraryName("Mix", "RecordSource"),
      "Shared",
    ]);
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
    // The terminology BMI lands in RecordConcepts; the concept BMI in
    // RecordSource, and the concept's `coded from "BMI"` resolves (via the
    // terminology slot) to the RecordConcepts-layer valueset.
    const concepts = layer(r, "RecordConcepts")!;
    expect(concepts.result.result).toContain(`valueset "BMI"`);
    const rc = layerLibraryName("Ck", "RecordConcepts");
    const asserted = layer(r, "RecordSource")!;
    expect(asserted.crossLibraryIncludes).toEqual([rc]);
    expect(asserted.result.result).toContain(`${rc}."BMI"`);
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
    const rs = layerLibraryName("Nar", "RecordSource");
    const inferred = layer(r, "Inferred")!;
    expect(inferred.crossLibraryIncludes).toEqual([rs]);
    expect(inferred.result.result).toContain(`${rs}."Asserted Leaf"`);
    expect(inferred.result.result).toContain(`${rs}."Other Asserted"`);
    expect(inferred.result.result).toContain(`include ${rs}`);
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
    const rs = layerLibraryName("Sn", "RecordSource");
    const inferred = layer(r, "Inferred")!;
    expect(inferred.crossLibraryIncludes).toEqual([rs]);
    expect(inferred.result.result).toContain(`${rs}."Leaf"`);
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
    expect(inferred.crossLibraryIncludes).not.toContain(layerLibraryName("Sl", "Inferred"));
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

describe("layeredEmit — F3 non-source-typed decision concept hard error", () => {
  it("emitPartitioned hard-errors when a decision when-concept is not source-typed", () => {
    // A `code is` concept makes the library `interface`-eligible (LocalSource), but
    // the decision references a SECOND concept "Ghost" that is representation-bearing
    // → `classifyStatementLayer` returns null (out of scope) → NOT a re-exportable
    // source layer. Pre-F3 it was silently skipped (emptying the Interface → silent
    // decision demote). F3 surfaces a structured `emit-decision-concept-not-source-typed`
    // error and emits nothing.
    const a = ast(`library "Pol".

terminology "GhostVS":
- valueset is \`ghost-vs\`.

concept "Adult Patient":
- type is Observation.
- value type is boolean.
- code is \`adult\`.

concept "Ghost":
- type is Observation.
- value type is boolean.
- defined as "Adult Patient".
- source representation: - type is Condition. - coded from "GhostVS".

activity "Refer":
- request CPGServiceRequest.

decision "Triage":
- when "Ghost" then recommend activity "Refer".
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    const result = emitPartitioned(lowered.ast, "Pol", "Pol", FULL_PARTITION);
    expect(result.success).toBe(false);
    expect(result.entries).toEqual([]);
    expect(result.errors?.map((e) => e.kind)).toContain("emit-decision-concept-not-source-typed");
    expect(result.errors?.[0]?.message).toContain('"Ghost"');
  });
});

describe("layeredEmit — F5 qualified when/guard refs are skipped (not strip-and-mislookup)", () => {
  it("interfaceConceptNames skips a qualified when-concept ref", () => {
    // A decision `when "Other"."Flag"` carries a cross-library qualifier. Pre-F5
    // `getRefName` stripped it to bare `Flag`, which would mis-look-up a same-named
    // LOCAL concept. F5 skips the qualified ref entirely (v0-unsupported), so it
    // never appears in the interface concept set. The bare `when "Local"` still does.
    const a = ast(`library "Pol".

concept "Local":
- type is Observation.
- value type is boolean.
- defined as "A".

concept "A":
- type is Observation.
- value type is boolean.
- defined as "Local".

activity "Refer":
- request CPGServiceRequest.

decision "Triage":
- when "Other"."Flag" then recommend activity "Refer".
- when "Local" then recommend activity "Refer".
`);
    const names = interfaceConceptNames(a);
    expect(names).toContain("Local");
    expect(names).not.toContain("Flag");
  });
});

describe("layeredEmit — #186 unified identifier (S) cascade", () => {
  // The truth-set qualifier cascade (#186 work item 1): S is the SINGLE source of
  // the CQL `library` header, every `include`, and every qualified ref. A silent
  // drift between an emitted `S."X".asTruths()` qualifier and the `include S`
  // target reproduces cqf's `Could not load source` one level down. These pin the
  // agreement mechanically.
  const FULL = `library "Cascade".

concept "A":
- type is Observation.
- value type is boolean.
- code is \`a\`.

concept "B":
- type is Observation.
- value type is boolean.
- code is \`b\`.

concept "A And B":
- type is Observation.
- value type is boolean.
- defined as ( "A" sem-and "B" ).

activity "Approve":
- request CPGServiceRequest.

decision "Cover":
- when "A And B" then recommend activity "Approve".
`;

  it("every S is hyphen-free (FHIR Library.name-valid) and PascalCase", () => {
    const lowered = lowerLocalCodes(ast(FULL));
    const r = emitPartitioned(lowered.ast, "Cascade", "example-semand", FULL_PARTITION);
    expect(r.success).toBe(true);
    for (const e of r.entries) {
      // FHIR `Library.name` regex: [A-Z]([A-Za-z0-9_]){0,254} — NO hyphens.
      expect(e.libraryName).toMatch(/^[A-Z][A-Za-z0-9_]*$/);
      expect(e.libraryName).not.toContain("-");
    }
  });

  it("every qualified-ref library prefix in a body byte-matches an `include <S>` target in that library", () => {
    const lowered = lowerLocalCodes(ast(FULL));
    const r = emitPartitioned(lowered.ast, "Cascade", "example-semand", FULL_PARTITION);
    expect(r.success).toBe(true);
    // The unified S for each present layer (what the FHIR lane will also use).
    const localSource = layerLibraryName("example-semand", "LocalSource");
    const inferred = layerLibraryName("example-semand", "Inferred");

    // Inferred body qualifies LocalSource truth-sets → `LocalSource."A".asTruths()`;
    // its header MUST `include <LocalSource>` (byte-identical, unquoted).
    const inf = layer(r, "Inferred")!;
    expect(inf.result.result).toContain(`${localSource}."A".asTruths()`);
    expect(inf.result.result).toContain(`${localSource}."B".asTruths()`);
    expect(inf.result.result).toContain(`include ${localSource}`);
    expect(inf.crossLibraryIncludes).toContain(localSource);

    // Interface re-exports the Inferred determination → `Inferred."A And B".satisfied()`;
    // its header MUST `include <Inferred>`.
    const iface = layer(r, "Interface")!;
    expect(iface.result.result).toContain(`${inferred}."A And B".satisfied()`);
    expect(iface.result.result).toContain(`include ${inferred}`);
    expect(iface.crossLibraryIncludes).toContain(inferred);

    // The header `library "<S>"` of each entry equals its `libraryName` (the
    // qualifier target used everywhere it is referenced).
    for (const e of r.entries) {
      expect(e.result.result).toContain(`library ${e.libraryName}`);
    }
  });
});
