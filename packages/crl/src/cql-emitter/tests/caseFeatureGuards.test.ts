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
 *     define / fold-in-less Inferences).
 *   - Fix 2: a ExternalPrimitives (`coded from`) operand woven into a truth-set
 *     `defined as` composition hard-errors (`emit-mixed-source-inference-unsupported`).
 *   - Fix 3: a bare ref to a NON-existent Inferences name under case-feature mode
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
    // Direct emit: no caseFeature mode → the Inferences twin's fold-in never fires
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
    // The Inferences twin folds in the LocalPrimitives retrieve; no guard error fires.
    const allKinds = result.entries.flatMap((e) => e.result.errors?.map((x) => x.kind) ?? []);
    expect(allKinds).not.toContain("emit-both-rep-requires-case-feature-lane");
    const inferred = result.entries.find((e) => e.layer === "Inferences");
    expect(inferred?.result.result).toContain(".asTruths()");
    expect(inferred?.result.result).toContain("union");
  });
});

describe("Fix 2 — mixed LocalPrimitives/ExternalPrimitives `defined as` hard-errors", () => {
  it("a truth-set `defined as` over a ExternalPrimitives (`coded from`) operand is unsupported", () => {
    // `Mixed` is `defined as` over a `code is` LEAF (LocalPrimitives) and a
    // `coded from` LEAF (ExternalPrimitives). The split routes the local leaf to
    // LocalPrimitives and the record leaf to ExternalPrimitives; the Inferences emit then sees
    // a ExternalPrimitives operand inside the truth-set union → hard error.
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

describe("Fix 3 — bare ref to a non-existent Inferences name does not fabricate a qualifier", () => {
  it("an unknown bare ref under case-feature mode is NOT silently qualified to the Inferences lib", () => {
    // `Top` is `defined as` a bare-ref to `Ghost`, which does not exist. Under
    // case-feature inferred mode the bare branch must NOT fabricate
    // `"…-Inferences"."Ghost"`; it falls through to legacy handling so the dangling
    // ref surfaces (a bare `"Ghost"` identifier, not an Inferences-qualified one).
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
    const inferred = result.entries.find((e) => e.layer === "Inferences");
    const cql = inferred?.result.result ?? "";
    // The fabricated qualified ref must NOT appear.
    expect(cql).not.toContain('"Pol-Inferences"."Ghost"');
    // The unknown name still appears (surfaced as a bare/legacy ref), not vanished.
    expect(cql).toContain("Ghost");
  });

  it("a VALID same-library Inferences sibling bare ref stays BARE (a library cannot qualify its own define)", () => {
    // `Top` bare-refs `A And B`, a real Inferences sibling in the SAME emitted
    // `Pol-Inferences` library. A define MUST NOT be referenced via its own library
    // name (`"Pol-Inferences"."A And B"` makes the CQL translator reject
    // `Could not resolve identifier Pol-Inferences`); the same-library ref stays
    // BARE (`"A And B"`), matching the measure lane. Only genuinely cross-library
    // Inferences operands are qualified.
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
    const inferred = result.entries.find((e) => e.layer === "Inferences");
    const cql = inferred?.result.result ?? "";
    // BARE same-library ref, NOT the self-qualified form.
    expect(cql).toContain('"A And B"');
    expect(cql).not.toContain('"Pol-Inferences"."A And B"');
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
    // Direct (none-path) emit — this pins the shared exists bridge's operand refusal (a reduction operand
    // emits a total scalar boolean, so `exists` over it is ill-typed). Since #270 the inferred lane lowers
    // via the SAME bridge, so the refusal is lane-shared.
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

  it("#270 (disc 461 code review G2) — a `shape is RecordSet` concept with a `defined as exists` body is a COHERENCE error (a record shape cannot publish an existence boolean)", () => {
    // The useSiteType validator documents this as a deferred gap it does not catch, and `emitCQLFromAST`
    // is validator-free — so `emitExistsBridge` refuses it rather than emit a scalar `exists(...)` under a
    // record declaration (charter §3 cardinality authoritative).
    const a = ast(`library "Pol".

concept "Trials":
- type is Observation.
- shape is RecordSet.
- code is \`t\`.

concept "Bad":
- type is Observation.
- shape is RecordSet.
- defined as exists ( "Trials" ).
`);
    const lowered = lowerLocalCodes(a);
    const result = emitCQLFromAST(lowered.ast, { libraryName: "Pol" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.errors)).toMatch(/publishes a Scalar boolean/);
  });

  it("#270 (disc 461 code review G3/Claude-7) — `defined as exists` over another total scalar boolean (an exists concept) is loud-refused (singleton-promotion inversion)", () => {
    // The operand must publish a RECORD SET. `exists` over an already-total scalar boolean silently inverts
    // (`exists({false})` = true). Widened from "reduction operand" to "operand emits a total scalar boolean"
    // (the ONE classifier, now exists-aware), so exists-over-exists is caught.
    const a = ast(`library "Pol".

concept "Trials":
- type is Observation.
- shape is RecordSet.
- code is \`t\`.

concept "Has Trials":
- value type is boolean.
- defined as exists ( "Trials" ).

concept "Double":
- value type is boolean.
- defined as exists ( "Has Trials" ).
`);
    const lowered = lowerLocalCodes(a);
    const result = emitCQLFromAST(lowered.ast, { libraryName: "Pol" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.errors)).toMatch(/already emits a TOTAL scalar boolean/);
  });
});
