import { buildCRL } from "../../index";
import {
  buildConceptShapeMap,
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
import { lowerLocalCodes as lowerLocalCodesRaw } from "../lowerLocalCodes";

// #271 — lowering local `code is` now REQUIRES `crl.canonicalBase` (no urn
// fallback); inline-AST tests thread a fixed test base by default.
const TEST_CB = "http://example.org/crl/test";
const lowerLocalCodes: typeof lowerLocalCodesRaw = (ast, opts = {}) =>
  lowerLocalCodesRaw(ast, { canonicalBase: TEST_CB, ...opts });
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

describe("buildConceptShapeMap (#189 Slice-C boundary 1 — cross-layer reduction-operand shapes)", () => {
  it("maps declared shapes by name, and a lowered `code is`+reduction to its RecordSet twin + Scalar reduction", () => {
    // After `lowerLocalCodes`, a `code is` + `exists this` concept "X" is a records
    // twin "X Records" (RecordSet) + the retargeted Scalar reduction "X".
    const raw = ast(`library "L".

concept "X":
- type is Condition.
- value type is boolean.
- code is \`x\`.
- definition is exists this.

concept "Trials":
- type is Procedure.
- shape is RecordSet.
- code is \`t\`.
`);
    const { ast: lowered, errors } = lowerLocalCodes(raw);
    expect(errors).toHaveLength(0);
    const shapes = buildConceptShapeMap(lowered);
    // The cross-layer records operand a reduction reduces reads as a RecordSet.
    expect(shapes.get("X Records")).toBe("RecordSet");
    // The reduction concept itself publishes a Scalar boolean.
    expect(shapes.get("X")).toBe("Scalar");
    // A plain RecordSet publisher maps to RecordSet (the named `exists "Trials"` operand).
    expect(shapes.get("Trials")).toBe("RecordSet");
  });

  it("excludes synthetic Interface re-exports so a `define \"X\"` façade never shadows the real shape", () => {
    // A re-export concept carries `__interfaceReexport`; the map must skip it.
    const a = ast(`library "L".

concept "R":
- type is Condition.
- shape is RecordSet.
- code is \`r\`.
`);
    const withReexport: CRL = {
      ...a,
      statements: [
        ...a.statements,
        // A synthetic Interface re-export of "R" — Scalar-shaped, same name.
        {
          type: "Concept",
          name: "R",
          shape: "Scalar",
          valueTypes: ["boolean"],
          representations: [],
          conceptType: "Condition",
          __interfaceReexport: true,
          definition: {
            type: "DefinedAsDefinition",
            body: { type: "DefinedAsBareRef", ref: "R" },
            location: a.statements[0].location,
          },
          location: a.statements[0].location,
        } as CRL["statements"][number],
      ],
    };
    // The real "R" (RecordSet) wins; the reexport is skipped.
    expect(buildConceptShapeMap(withReexport).get("R")).toBe("RecordSet");
  });
});

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
    // R2 source-typed layers: hand-authored terminology → ExternalConcepts,
    // `coded from` → ExternalPrimitives, `defined as` → Inferences. #186: names are the
    // unified hyphen-free `S` = layerLibraryName(policyId, layer) (policyId ===
    // source name for direct callers), emitted UNQUOTED in refs (simple ident).
    const rc = layerLibraryName("Basic", "ExternalConcepts");
    const rs = layerLibraryName("Basic", "ExternalPrimitives");
    const inf = layerLibraryName("Basic", "Inferences");
    expect(r.entries.map((e) => e.libraryName)).toEqual([rc, rs, inf]);
    // ExternalPrimitives retrieves the ExternalConcepts-layer valueset + includes it.
    const asserted = layer(r, "ExternalPrimitives")!;
    expect(asserted.crossLibraryIncludes).toEqual([rc]);
    expect(asserted.result.result).toContain(`[Observation: ${rc}."VS"]`);
    // Inferences refs the ExternalPrimitives leaf + includes it.
    const inferred = layer(r, "Inferences")!;
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
    // The source self-qualified `"Self"."VS"` must become the ExternalConcepts
    // layer's unified `S` ref, NOT a dangling `Self."VS"` (library `Self` no
    // longer exists after split).
    const rc = layerLibraryName("Self", "ExternalConcepts");
    const rs = layerLibraryName("Self", "ExternalPrimitives");
    const asserted = layer(r, "ExternalPrimitives")!;
    expect(asserted.crossLibraryIncludes).toEqual([rc]);
    expect(asserted.result.result).toContain(`${rc}."VS"`);
    expect(asserted.result.result).not.toMatch(/\bSelf\."VS"/);
    const inferred = layer(r, "Inferences")!;
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
    const inferred = layer(r, "Inferences")!;
    // Foreign `"Shared"."External"` survives untouched + earns an include.
    // "Shared" is a simple CQL identifier so it emits unquoted: `Shared."External"`.
    expect(inferred.crossLibraryIncludes).toEqual([
      layerLibraryName("Mix", "ExternalPrimitives"),
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
    // The terminology BMI lands in ExternalConcepts; the concept BMI in
    // ExternalPrimitives, and the concept's `coded from "BMI"` resolves (via the
    // terminology slot) to the ExternalConcepts-layer valueset.
    const concepts = layer(r, "ExternalConcepts")!;
    expect(concepts.result.result).toContain(`valueset "BMI"`);
    const rc = layerLibraryName("Ck", "ExternalConcepts");
    const asserted = layer(r, "ExternalPrimitives")!;
    expect(asserted.crossLibraryIncludes).toEqual([rc]);
    expect(asserted.result.result).toContain(`${rc}."BMI"`);
  });

  it("re-qualifies cross-layer narrative `definition is` refs + includes the target layer (fix 1)", () => {
    // A catalog-matchable `definition is` narrative carrying TWO cross-layer
    // concept refs (`"X" component of "Y"`): both NConceptRefs must be
    // requalified to "Nar Asserted"."..." and the Inferences layer must include
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
    const rs = layerLibraryName("Nar", "ExternalPrimitives");
    const inferred = layer(r, "Inferences")!;
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
    const rs = layerLibraryName("Sn", "ExternalPrimitives");
    const inferred = layer(r, "Inferences")!;
    expect(inferred.crossLibraryIncludes).toEqual([rs]);
    expect(inferred.result.result).toContain(`${rs}."Leaf"`);
  });

  it("same-layer self-qualified ref emits BARE, not `X.\"...\"` (fix 4)", () => {
    // Two inferred concepts, one self-qualified-referencing the other:
    // `"Sl"."Other Inferences"` from inside the Inferences layer is a KNOWN
    // same-layer target, so the qualifier drops to a bare local ref. It must
    // NOT surface as a dangling `"Sl"."..."` (library "Sl" no longer exists).
    const a = ast(`library "Sl".

terminology "VS":
- valueset is \`vs\`.

concept "Leaf":
- type is Observation.
- coded from "VS".

concept "Other Inferences":
- type is Observation.
- value type is boolean.
- defined as "Leaf".

concept "Top Inferences":
- type is Observation.
- value type is boolean.
- defined as "Sl"."Other Inferences".
`);
    const r = emitLayered(a, "Sl");
    expect(r.success).toBe(true);
    const inferred = layer(r, "Inferences")!;
    // The self-qualified same-layer ref emits bare.
    expect(inferred.result.result).toContain(`"Other Inferences"`);
    expect(inferred.result.result).not.toMatch(/"Sl"\."Other Inferences"/);
    expect(inferred.result.result).not.toMatch(/\bSl\."Other Inferences"/);
    // It does NOT earn a self-include (same layer).
    expect(inferred.crossLibraryIncludes).not.toContain("Sl");
    expect(inferred.crossLibraryIncludes).not.toContain(layerLibraryName("Sl", "Inferences"));
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
    // A `code is` concept makes the library `interface`-eligible (LocalPrimitives), but
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
    const localSource = layerLibraryName("example-semand", "LocalPrimitives");
    const inferred = layerLibraryName("example-semand", "Inferences");

    // #189 T5 step 2b — "A" and "B" are PURE QUESTIONS, so each now publishes an Inferences determination
    // reading its LocalPrimitives answer records three-state (`"<X> Records".answeredValue()`), and the parent
    // composes those BOOLEANS rather than weaving truth-set Lists. The cascade invariant is unchanged and is
    // what this test is actually about: the Inferences body qualifies LocalPrimitives, so its header MUST
    // `include <LocalPrimitives>` (byte-identical, unquoted).
    const inf = layer(r, "Inferences")!;
    expect(inf.result.result).toContain(`${localSource}."A Records".answeredValue()`);
    expect(inf.result.result).toContain(`${localSource}."B Records".answeredValue()`);
    expect(inf.result.result).toContain(`include ${localSource}`);
    expect(inf.crossLibraryIncludes).toContain(localSource);

    // Interface re-exports the Inferences determination. BARE, not `.satisfied()`: the parent composes two
    // three-state questions, so its result is three-state, and `.satisfied()` (an `exists` wrapper) would
    // collapse the unknown back to `false` — the pause→deny flip.
    const iface = layer(r, "Interface")!;
    expect(iface.result.result).toContain(`${inferred}."A And B"`);
    expect(iface.result.result).not.toContain(`${inferred}."A And B".satisfied()`);
    expect(iface.result.result).toContain(`include ${inferred}`);
    expect(iface.crossLibraryIncludes).toContain(inferred);

    // The header `library "<S>"` of each entry equals its `libraryName` (the
    // qualifier target used everywhere it is referenced).
    for (const e of r.entries) {
      expect(e.result.result).toContain(`library ${e.libraryName}`);
    }
  });
});

describe("layeredEmit — #189 Slice-C boundary 1: layered emit for every reduction form", () => {
  // Coverage per the plan's verification bar (impl-panel round 1, both arms): the layered emit-string was
  // pinned only for `exists`; pin `count`, Scalar-boolean `most recent` (B2a), and Record `most recent`
  // (B2b) too — the cases where the cross-layer QUALIFIED operand threads through `Count(...)` and the
  // `emitSelectNewest`/`emitMostRecentBooleanRead` helpers, which a bare-name regression would silently break.
  const inferredOf = (src: string): string => {
    const lowered = lowerLocalCodes(ast(src));
    expect(lowered.errors).toEqual([]);
    const r = emitPartitioned(lowered.ast, "Pol", "Pol", FULL_PARTITION);
    expect(r.success, JSON.stringify(r.errors)).toBe(true);
    return layer(r, "Inferences")!.result.result;
  };

  it("layered `count \"X\" at least N` → `Count(<S>-LocalPrimitives.\"X Records\") >= N` (cross-layer-qualified)", () => {
    const inf = inferredOf(`library "Pol".

concept "Trials":
- type is Observation.
- shape is RecordSet.
- code is \`t\`.

concept "Enough":
- value type is boolean.
- definition is count "Trials" at least 2.

activity "R":
- request CPGServiceRequest.

decision "D":
- when "Enough" then recommend activity "R".
`);
    expect(inf).toMatch(/define "Enough":\s*\n\s*Count\(PolLocalPrimitives\."Trials"\) >= 2/);
  });

  it("layered Scalar-boolean `most recent this` (B2a) → `Coalesce(FHIRHelpers.ToBoolean((Last(...)))...)` over the qualified twin", () => {
    const inf = inferredOf(`library "Pol".

concept "Fever":
- type is Observation.
- value type is boolean.
- shape is Scalar.
- code is \`f\`.
- definition is most recent this.

activity "R":
- request CPGServiceRequest.

decision "D":
- when "Fever" then recommend activity "R".
`);
    // The select operand is the cross-layer-qualified records twin; the value read + Coalesce wrap the select.
    expect(inf).toContain(`(PolLocalPrimitives."Fever Records") O`);
    expect(inf).toMatch(/where O\.value is FHIR\.boolean/);
    expect(inf).toMatch(/sort by \(effective as FHIR\.dateTime\)\.value, id/);
    expect(inf).toMatch(/Coalesce\(\s*\n\s*FHIRHelpers\.ToBoolean\(/);
  });

  it("layered Record `most recent this` (B2b) — decisionless full split, both recency casts, over the qualified twin", () => {
    // A Record `most recent` cannot be a decision guard (that hard-errors — see the façade test below), so
    // it reaches the Inferences layer via a decisionless FULL split. dateTime cast (Procedure.performed):
    const proc = inferredOf(`library "Pol".

concept "Last Proc":
- type is Procedure.
- shape is Record.
- code is \`p\`.
- definition is most recent this.
`);
    expect(proc).toMatch(
      /define "Last Proc":\s*\n\s*Last\(\s*\n\s*\(PolLocalPrimitives\."Last Proc Records"\) O\s*\n\s*sort by \(performed as FHIR\.dateTime\)\.value, id/,
    );
    // none cast (Condition.recordedDate — no `as FHIR.dateTime`):
    const cond = inferredOf(`library "Pol".

concept "Last Cond":
- type is Condition.
- shape is Record.
- code is \`c\`.
- definition is most recent this.
`);
    expect(cond).toMatch(
      /define "Last Cond":\s*\n\s*Last\(\s*\n\s*\(PolLocalPrimitives\."Last Cond Records"\) O\s*\n\s*sort by recordedDate\.value, id/,
    );
  });
});

describe("layeredEmit — #189 Slice-C boundary 1: non-boolean reduction on the Interface surface (façade hard-error)", () => {
  it("a decision guarding a Record `most recent this` reduction HARD-ERRORS (no `.satisfied()` on a record)", () => {
    // impl-panel round 1, both arms — critical B. A Record reduction has no valid boolean Interface
    // collapse; the old else-branch emitted `Inferences."X".satisfied()` on a record select (ill-typed CQL
    // under success:true). Synthesis must refuse loud.
    const a = ast(`library "Pol".

concept "Last Cov":
- type is Condition.
- shape is Record.
- code is \`cov\`.
- definition is most recent this.

activity "R":
- request CPGServiceRequest.

decision "D":
- when "Last Cov" then recommend activity "R".
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    const r = emitPartitioned(lowered.ast, "Pol", "Pol", FULL_PARTITION);
    expect(r.success).toBe(false);
    expect(r.errors?.some((e) => e.kind === "emit-reduction-nonboolean-interface")).toBe(true);
  });
});

describe("layeredEmit — #189 Slice-C boundary 1: composition loud-guard", () => {
  it("a `defined as` truth-set composition over a REDUCTION operand fails LOUD (emit-reduction-in-composition), not ill-typed CQL", () => {
    // The step-7 guard: post-flip a reduction ("R" = `code is` + `exists this`) classifies Inferences, so a
    // `defined as ( "R" sem-or "S" )` becomes layer-emittable. But the truth-set lane renders siblings as
    // `.asTruths()` lists and `union`s them, while "R" is a bare CQL Boolean → `"R" union
    // <LocalPrimitives>."S".asTruths()` fails to type-check at translator load. Composing `defined as` over
    // TOTAL booleans is a boundary-2 change; until then the emitter refuses LOUD with a CRL-level kind.
    const a = ast(`library "Pol".

concept "R":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`r\`.
- definition is exists this.

concept "S":
- type is Observation.
- value type is boolean.
- code is \`s\`.

concept "Combo":
- type is Observation.
- value type is boolean.
- defined as ( "R" sem-or "S" ).

activity "Approve":
- request CPGServiceRequest.

decision "Cover":
- when "Combo" then recommend activity "Approve".
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    const r = emitPartitioned(lowered.ast, "Pol", "Pol", FULL_PARTITION);
    // ⭐ #189 T5 step 2b LIFTED THIS DEFERRAL — the comment above predicted it ("a boundary-2 change"). "R" is
    // a TOTAL boolean (`exists this`) and "S" is a PURE QUESTION, which now publishes a THREE-STATE boolean
    // determination instead of a bare retrieve. Both operands are booleans, so the pivot routes "Combo" to the
    // BOOLEAN lane and the mixture is well-typed. This is the §4a case 2b exists to admit: composition is
    // strong Kleene, so an unanswered "S" makes "Combo" unknown (the guard pauses) rather than false.
    expect(r.success).toBe(true);
    const inferred = r.entries.find((e) => e.layer === "Inferences");
    expect(inferred?.result.errors ?? []).toEqual([]);
    // BARE leaves — no `Coalesce`, no `exists` wrapper. Totality belongs at the branch guard, never per operand.
    expect(inferred?.result.result).toMatch(/define "Combo":\s*\n\s*"R"\s*\n?\s*or "S"/);
    expect(inferred?.result.result).not.toContain("asTruths()");
    expect(inferred?.result.result).not.toContain("Coalesce");
  });

  it("#189 2b.2 — a BARE-REF alias `defined as \"R\"` to a reduction FLIPS: the reduction's total boolean re-exports DIRECTLY", () => {
    // Pre-2b.2 this failed loud (`assertNotReductionTruthSetOperand`). The flip: D's Inferences define emits the
    // reduction bare (`"R"`, NOT `.asTruths()`), and D's Interface façade re-exports BARE (total-boolean mode),
    // NOT `.satisfied()` on a Boolean. The classifier consults the shared `emitsTotalScalarBoolean` predicate at
    // the emit site, the façade, and the ledger in lock-step (disc 444).
    const a = ast(`library "Pol".

concept "R":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`r\`.
- definition is exists this.

concept "D":
- type is Observation.
- value type is boolean.
- defined as "R".

activity "Approve":
- request CPGServiceRequest.

decision "Cover":
- when "D" then recommend activity "Approve".
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    const r = emitPartitioned(lowered.ast, "Pol", "Pol", FULL_PARTITION);
    expect(r.success).toBe(true);
    const inferred = layer(r, "Inferences");
    // D re-exports R's total boolean directly — bare `"R"`, no truth-set lift.
    expect(inferred?.result.result).toMatch(/define "D":\s*\n\s*"R"/);
    expect(inferred?.result.result).not.toContain(`"D".asTruths()`);
    expect(inferred?.result.result).not.toContain(`"R".asTruths()`);
    // D's Interface façade re-exports BARE (total-boolean), not `.satisfied()`.
    const iface = layer(r, "Interface");
    expect(iface?.result.result).toMatch(/define "D":\s*\n\s*PolInferences\."D"/);
    expect(iface?.result.result).not.toMatch(/define "D":[\s\S]*?\.satisfied\(\)/);
  });

  it("#189 2b.2 — a COMPOSITION over the flipped alias STAYS loud (composition-over-totals is 2b.3)", () => {
    // The widened composition guard: post-flip, D is a total boolean. Weaving it into a truth-set composition
    // (`E: defined as ("D" sem-or "S")`) is `Boolean union List` — ill-typed. The reduction-only guard misses D
    // (a `DefinedAsDefinition`), so the total-boolean predicate check rejects it. 2b.3 deletes this guard.
    const a = ast(`library "Pol".

concept "R":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`r\`.
- definition is exists this.

concept "D":
- type is Observation.
- value type is boolean.
- defined as "R".

concept "S":
- type is Observation.
- value type is boolean.
- code is \`s\`.

concept "E":
- type is Observation.
- value type is boolean.
- defined as ( "D" sem-or "S" ).

activity "Approve":
- request CPGServiceRequest.

decision "Cover":
- when "E" then recommend activity "Approve".
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    const r = emitPartitioned(lowered.ast, "Pol", "Pol", FULL_PARTITION);
    // ⭐ #189 T5 step 2b LIFTED THIS DEFERRAL (the title's "composition-over-totals is 2b.3" is now done). "D"
    // is a total-boolean alias to a reduction and "S" is a PURE QUESTION publishing a three-state boolean, so
    // "E" composes two BOOLEANS in the boolean lane rather than weaving a Boolean into a truth-set List.
    expect(r.success).toBe(true);
    const inferred = r.entries.find((e) => e.layer === "Inferences");
    expect(inferred?.result.errors ?? []).toEqual([]);
    expect(inferred?.result.result).toMatch(/define "E":\s*\n\s*"D"\s*\n?\s*or "S"/);
    expect(inferred?.result.result).not.toContain("asTruths()");
  });

  it("#189 2b.2 — a boolean COMPARATOR used as a decision guard re-exports its façade BARE (total-boolean), not `.satisfied()` (2b.1 hand-off)", () => {
    // Post-2b.1 a boolean comparator emits `Coalesce(<cmp>, false)` (total). The shared predicate classifies it
    // total, so its Interface façade re-exports BARE — the pre-2b.2 `srcIsReduction`-only classifier would have
    // marked it `truth-set` → `.satisfied()` on a plain Boolean (ill-typed). (disc 444 #1; verifies site 3.)
    const a = ast(`library "Pol".

concept "Sys":
- type is Observation.
- value type is Quantity.
- code is \`sys\`.

concept "Sys Below 120":
- value type is boolean.
- definition is "Sys" below 120 'mm[Hg]'.

activity "Approve":
- request CPGServiceRequest.

decision "Cover":
- when "Sys Below 120" then recommend activity "Approve".
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    const r = emitPartitioned(lowered.ast, "Pol", "Pol", FULL_PARTITION);
    expect(r.success, JSON.stringify(r.entries.flatMap((e) => e.result.errors ?? []))).toBe(true);
    const iface = layer(r, "Interface");
    expect(iface?.result.result).toMatch(/define "Sys Below 120":\s*\n\s*PolInferences\."Sys Below 120"/);
    expect(iface?.result.result).not.toMatch(/define "Sys Below 120":[\s\S]*?\.satisfied\(\)/);
  });

  it("#189 2b.2 — a both-rep `code is` + `defined as` to a TOTAL comparator fails LOUD, not `List union Boolean` (code review, Claude #3)", () => {
    // The both-rep union twin keeps the bare-ref body and is excluded from the flip (`foldIn !== undefined`); the
    // retained reduction guard misses a comparator (a `DefinitionIsDefinition`). Without the fold-in weave guard,
    // the union would emit `LocalPrimitives."Merged".asTruths() union ("C")` — a truth-set List `union` a total
    // Boolean, ill-typed under success:true. The weave guard rejects it.
    const a = ast(`library "Pol".

concept "Sys":
- type is Observation.
- value type is Quantity.
- code is \`sys\`.

concept "C":
- value type is boolean.
- definition is "Sys" below 120 'mm[Hg]'.

concept "Merged":
- type is Observation.
- value type is boolean.
- code is \`m\`.
- defined as "C".

activity "Approve":
- request CPGServiceRequest.

decision "Cover":
- when "Merged" then recommend activity "Approve".
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    const r = emitPartitioned(lowered.ast, "Pol", "Pol", FULL_PARTITION);
    expect(r.success).toBe(false);
    const inferred = r.entries.find((e) => e.layer === "Inferences");
    expect(inferred?.result.errors?.some((e) => e.kind === "emit-reduction-in-composition")).toBe(true);
  });

  it("#189 2b.2 — a CHAINED bare-ref alias (A → D → reduction) resolves total and flips (recursion)", () => {
    const a = ast(`library "Pol".

concept "R":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`r\`.
- definition is exists this.

concept "D":
- type is Observation.
- value type is boolean.
- defined as "R".

concept "A":
- type is Observation.
- value type is boolean.
- defined as "D".

activity "Approve":
- request CPGServiceRequest.

decision "Cover":
- when "A" then recommend activity "Approve".
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    const r = emitPartitioned(lowered.ast, "Pol", "Pol", FULL_PARTITION);
    expect(r.success).toBe(true);
    const inferred = layer(r, "Inferences");
    expect(inferred?.result.result).toMatch(/define "A":\s*\n\s*"D"/);
    expect(inferred?.result.result).not.toContain(`"D".asTruths()`);
  });
});

// #189 Slice C 2b.3b.1 (crl-emit code review, gpt56 #3) — the Interface twin-selection WINNER RULE must pick the
// `public-determination` (recency) twin as the façade source DETERMINISTICALLY, not by lowering's append order.
// The recency twin reads TOTAL → the re-export is bare; the `source-impl` half reads non-total → `.satisfied()`.
// This fixture puts the source-impl twin LAST (adversarial to append-order last-write-wins), so it passes ONLY if
// the winner rule (prefer public) is in force.
describe("#189 Slice C 2b.3b.1 — Interface twin-selection winner rule", () => {
  const src = `library "Age Order".

concept "Age 21 Or Older":
- value type is boolean.
- code is \`age-21-or-older\`.
- source representation:
  - type is Patient.
  - value element is Patient.birthDate.
  - value type is date.
  - value projection is age today at least 21 years.

concept "Under Age 21":
- type is Observation.
- value type is boolean.
- defined as ( sem-not "Age 21 Or Older" ).

decision "Elig":
first:
- when "Under Age 21" then recommend activity "a.Approve".

activity "a.Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
`;

  it("picks the recency (public-determination) twin over a LAST-appended source-impl twin → bare Interface re-export (order-independent)", () => {
    const lowered = lowerLocalCodes(ast(src));
    const stmts = [...lowered.ast.statements];
    const isAge = (s: unknown): boolean =>
      (s as { type?: string; name?: string }).type === "Concept" &&
      (s as { name?: string }).name === "Age 21 Or Older";
    const impl = stmts.find(
      (s) => isAge(s) && (s as { __loweringRole?: string }).__loweringRole === "source-impl",
    )!;
    const pub = stmts.find(
      (s) => isAge(s) && (s as { __bothRepMerge?: string }).__bothRepMerge === "recency",
    )!;
    expect(impl).toBeDefined();
    expect(pub).toBeDefined();
    const ageIdx = stmts.map((s, i) => [isAge(s), i] as const).filter(([a]) => a).map(([, i]) => i);
    const lo = Math.min(...ageIdx);
    const hi = Math.max(...ageIdx);
    // Adversarial: public twin FIRST, source-impl LAST — append-order last-write would (wrongly) pick source-impl.
    stmts[lo] = pub;
    stmts[hi] = impl;
    const r = emitPartitioned({ ...lowered.ast, statements: stmts }, "AgeOrder", "AgeOrder", FULL_PARTITION);
    const iface = layer(r, "Interface")!.result.result;
    expect(iface).toContain(`define "Under Age 21":`);
    expect(iface).not.toContain(".satisfied()"); // bare re-export, NOT the truth-set façade
  });
});

// #189 Slice C 2b.3b.1 (crl-emit code review, gpt56 #4) — post-flip a recency twin emits a bare TOTAL boolean, so a
// REFINEMENT-lane `sem-not` over it must LOUD-REFUSE (`classifyConceptFlavor` recency→"unknown"), NOT render the
// ill-typed `{ true } except (<Boolean>)`. This pins the defensive classifier change against a silent regression to
// "truth-set".
describe("#189 Slice C 2b.3b.1 — refinement-lane sem-not over a recency twin loud-refuses", () => {
  it("a REFINEMENT parent `defined as ( sem-not <recency> )` refuses (emit-unlowerable-negation + UnsupportedNegation), never `{ true } except (<Boolean>)`", () => {
    const src = `library "Ref Refuse".

concept "Age 21 Or Older":
- value type is boolean.
- code is \`age-21-or-older\`.
- source representation:
  - type is Patient.
  - value element is Patient.birthDate.
  - value type is date.
  - value projection is age today at least 21 years.

concept "Weird":
- type is Observation.
- value type is CodeableConcept.
- defined as ( sem-not "Age 21 Or Older" ).
`;
    const lowered = lowerLocalCodes(ast(src));
    const r = emitPartitioned(lowered.ast, "RefR", "RefR", FULL_PARTITION);
    const blob = JSON.stringify(r);
    expect(r.success).toBe(false);
    expect(blob).toContain("emit-unlowerable-negation");
    expect(blob).toContain("UnsupportedNegation");
    expect(blob).not.toContain("{ true } except"); // the pre-flip ill-typed form must NOT appear
  });
});
