import { buildCRL } from "../../index";
import { emitCQLFromAST as emitCQLFromASTRaw } from "../emitCQL";
import { emitPartitioned, FULL_PARTITION } from "../layeredEmit";
import { lowerLocalCodes as lowerLocalCodesRaw } from "../lowerLocalCodes";

// #271 — lowering local `code is` now REQUIRES `crl.canonicalBase` (no urn
// fallback). These inline-AST tests have no package.json, so thread a fixed test
// base by default (explicit opts still override).
const TEST_CB = "http://example.org/crl/test";
const lowerLocalCodes: typeof lowerLocalCodesRaw = (ast, opts = {}) =>
  lowerLocalCodesRaw(ast, { canonicalBase: TEST_CB, ...opts });
const emitCQLFromAST: typeof emitCQLFromASTRaw = (ast, opts) =>
  emitCQLFromASTRaw(ast, { canonicalBase: TEST_CB, ...(opts ?? {}) });
import type { CRL } from "../../ast/types";

/**
 * Impl-review guards for the truth-set case-feature CQL emit (gpt55 + Claude):
 *   - Fix 1: a both-representation (`code is` + `defined as`) concept reaching a
 *     NON-truth-set emit path hard-errors instead of mis-emitting (duplicate
 *     define / fold-in-less Inferred).
 *   - Fix 2: a RecordSource (`coded from`) operand woven into a truth-set
 *     `defined as` composition hard-errors (`emit-mixed-source-inference-unsupported`).
 *   - Fix 3: a bare ref to a NON-existent Inferred name under case-feature mode
 *     does NOT silently become `<inferredLib>."name"`.
 */

function ast(body: string): CRL {
  const r = buildCRL("# fixture\n" + body);
  if (!r.success || !r.result) {
    throw new Error("parse failed: " + JSON.stringify(r.errors));
  }
  return r.result;
}

describe("Fix 1 — both-rep is gated to the truth-set/case-feature lane", () => {
  const bothRep = () =>
    ast(`library "Both".

concept "Estrogen Pellets":
- type is MedicationRequest.
- code is \`a\`.
concept "Estradiol Pellets":
- type is MedicationRequest.
- code is \`b\`.
concept "Estrogen Or Estradiol Pellets":
- type is Condition.
- code is \`c\`.
- defined as ( "Estrogen Pellets" sem-or "Estradiol Pellets" ).
`);

  it("a both-rep concept emitted via a DIRECT (non-truth-set) path hard-errors", () => {
    const lowered = lowerLocalCodes(bothRep());
    expect(lowered.errors).toEqual([]);
    // Direct emit: no caseFeature mode → the Inferred twin's fold-in never fires
    // and both twins collide in one library. The guard must surface it.
    const result = emitCQLFromAST(lowered.ast, { libraryName: "Both" });
    expect(result.success).toBe(false);
    expect(result.errors?.map((e) => e.kind)).toContain(
      "emit-both-rep-requires-case-feature-lane",
    );
    expect(
      result.errors?.find((e) => e.kind === "emit-both-rep-requires-case-feature-lane")
        ?.message,
    ).toContain('"Estrogen Or Estradiol Pellets"');
  });

  it("the SAME both-rep concept through the case-feature split lane succeeds (no false error)", () => {
    const lowered = lowerLocalCodes(bothRep());
    expect(lowered.errors).toEqual([]);
    const result = emitPartitioned(lowered.ast, "Both", "Both", FULL_PARTITION);
    expect(result.success).toBe(true);
    // The Inferred twin folds in the LocalSource retrieve; no guard error fires.
    const allKinds = result.entries.flatMap((e) => e.result.errors?.map((x) => x.kind) ?? []);
    expect(allKinds).not.toContain("emit-both-rep-requires-case-feature-lane");
    const inferred = result.entries.find((e) => e.layer === "Inferred");
    expect(inferred?.result.result).toContain(".asTruths()");
    expect(inferred?.result.result).toContain("union");
  });
});

describe("Fix 2 — mixed LocalSource/RecordSource `defined as` hard-errors", () => {
  it("a truth-set `defined as` over a RecordSource (`coded from`) operand is unsupported", () => {
    // `Mixed` is `defined as` over a `code is` LEAF (LocalSource) and a
    // `coded from` LEAF (RecordSource). The split routes the local leaf to
    // LocalSource and the record leaf to RecordSource; the Inferred emit then sees
    // a RecordSource operand inside the truth-set union → hard error.
    const a = ast(`library "Mix".

terminology "RecVS":
- valueset is \`rec-vs\`.

concept "Local Leaf":
- type is Observation.
- value type is boolean.
- code is \`a\`.

concept "Record Leaf":
- type is Condition.
- value type is boolean.
- coded from "RecVS".

concept "Mixed":
- type is Condition.
- value type is boolean.
- defined as ( "Local Leaf" sem-or "Record Leaf" ).
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    const result = emitPartitioned(lowered.ast, "Mix", "Mix", FULL_PARTITION);
    expect(result.success).toBe(false);
    const allKinds = result.entries.flatMap((e) => e.result.errors?.map((x) => x.kind) ?? []);
    expect(allKinds).toContain("emit-mixed-source-inference-unsupported");
  });
});

describe("Fix 3 — bare ref to a non-existent Inferred name does not fabricate a qualifier", () => {
  it("an unknown bare ref under case-feature mode is NOT silently qualified to the Inferred lib", () => {
    // `Top` is `defined as` a bare-ref to `Ghost`, which does not exist. Under
    // case-feature inferred mode the bare branch must NOT fabricate
    // `"…-Inferred"."Ghost"`; it falls through to legacy handling so the dangling
    // ref surfaces (a bare `"Ghost"` identifier, not an Inferred-qualified one).
    const a = ast(`library "Pol".

concept "Diagnosis A":
- type is Observation.
- value type is boolean.
- code is \`a\`.

concept "Top":
- type is Observation.
- value type is boolean.
- defined as "Ghost".
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    const result = emitPartitioned(lowered.ast, "Pol", "Pol", FULL_PARTITION);
    const inferred = result.entries.find((e) => e.layer === "Inferred");
    const cql = inferred?.result.result ?? "";
    // The fabricated qualified ref must NOT appear.
    expect(cql).not.toContain('"Pol-Inferred"."Ghost"');
    // The unknown name still appears (surfaced as a bare/legacy ref), not vanished.
    expect(cql).toContain("Ghost");
  });

  it("a VALID same-library Inferred sibling bare ref stays BARE (a library cannot qualify its own define)", () => {
    // `Top` bare-refs `A And B`, a real Inferred sibling in the SAME emitted
    // `Pol-Inferred` library. A define MUST NOT be referenced via its own library
    // name (`"Pol-Inferred"."A And B"` makes the CQL translator reject
    // `Could not resolve identifier Pol-Inferred`); the same-library ref stays
    // BARE (`"A And B"`), matching the measure lane. Only genuinely cross-library
    // Inferred operands are qualified.
    const a = ast(`library "Pol".

concept "Diagnosis A":
- type is Observation.
- value type is boolean.
- code is \`a\`.

concept "Diagnosis B":
- type is Observation.
- value type is boolean.
- code is \`b\`.

concept "A And B":
- type is Observation.
- value type is boolean.
- defined as ( "Diagnosis A" sem-and "Diagnosis B" ).

concept "Top":
- type is Observation.
- value type is boolean.
- defined as ( "A And B" sem-or "Diagnosis A" ).
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    const result = emitPartitioned(lowered.ast, "Pol", "Pol", FULL_PARTITION);
    expect(result.success).toBe(true);
    const inferred = result.entries.find((e) => e.layer === "Inferred");
    const cql = inferred?.result.result ?? "";
    // BARE same-library ref, NOT the self-qualified form.
    expect(cql).toContain('"A And B"');
    expect(cql).not.toContain('"Pol-Inferred"."A And B"');
  });
});

describe("#189 Slice-C boundary 1 — `defined as exists` over a REDUCTION is loud-refused (none-path arm)", () => {
  // impl-panel round 2 (Claude): the none-path `defined as exists ("R")` arm is a THIRD entry a reduction
  // operand can reach (besides a composition operand and a bare-ref alias). A reduction is already a TOTAL
  // boolean, so `exists ("R")` applies `exists` to a scalar Boolean — ill-typed at translator load, or
  // SILENTLY INVERTED via singleton→list promotion (`exists({false})` = true). Loud-refuse.
  it("`concept D: defined as exists (\"R\")` where R is a reduction hard-errors with `emit-reduction-in-composition`", () => {
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
- defined as exists ( "R" ).
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    // Direct (none-path) emit — the truth-set lane throws `definedAsExistsNotLowered` separately; this
    // pins the none-path arm's reduction guard.
    const result = emitCQLFromAST(lowered.ast, { libraryName: "Pol" });
    expect(result.success).toBe(false);
    expect(result.errors?.map((e) => e.kind)).toContain("emit-reduction-in-composition");
  });

  it("`defined as exists (\"X\")` over a genuine RecordSet (a `code is` records concept) still EMITS — the guard is reduction-specific", () => {
    // No over-fire: `exists` over a real record set is the legitimate #265 form.
    const a = ast(`library "Pol".

concept "Trials":
- type is Observation.
- shape is RecordSet.
- code is \`t\`.

concept "D":
- type is Observation.
- value type is boolean.
- defined as exists ( "Trials" ).
`);
    const lowered = lowerLocalCodes(a);
    expect(lowered.errors).toEqual([]);
    const result = emitCQLFromAST(lowered.ast, { libraryName: "Pol" });
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.result).toMatch(/define "D":\s*\n\s*exists \("Trials"\)/);
  });
});
