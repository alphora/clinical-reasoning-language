import { describe, it, expect } from "vitest";
import { buildCRL } from "../../index";
import { lowerLocalCodes } from "../lowerLocalCodes";
import { emitPartitioned, FULL_PARTITION } from "../layeredEmit";

// #189 Slice C 2b.3b.1ii — the boolean `defined as` composition PIVOT: the flip and its honest error kinds. Kinds
// (plan §4.2/§4.3, 1ii-a review both arms):
//   - `emit-composition-result-type-mismatch` — a Scalar<boolean> parent over an operand with a KNOWN non-boolean
//     OR INDETERMINATE result type. Hard error at the flip (design §7), remedy category-specific.
//   - `emit-composition-totality-mixed` — every operand boolean-COMPATIBLE but some total, some not. NEW kind;
//     REPLACES the stale `ReductionInCompositionError` for same-layer mixed compositions.
//   - `emit-declared-result-unresolved` — a same-layer bare operand that resolves to no concept (author typo).
//   - PARENT CARDINALITY: only a Scalar<boolean> parent flips; a Record/RecordSet/multi-value-type parent does NOT
//     (disc 452 #1 re-affirmed) — it stays loud via the retained refinement guard, never a silent scalar flip.
// A qualified/cross-lib operand is NOT classified here (rides the index-backed resolver in a later slice).

const CB = "http://example.org/crl/test";

function emit(src: string): {
  success: boolean;
  kinds: string[];
  inferred: string;
} {
  const r = buildCRL("# fixture\n" + src);
  if (!r.success || !r.result) throw new Error("parse failed: " + JSON.stringify(r.errors));
  const lowered = lowerLocalCodes(r.result, { canonicalBase: CB });
  const res = emitPartitioned(lowered.ast, "P", "P", FULL_PARTITION) as unknown as {
    success: boolean;
    entries: { layer: string; result: { result?: string; errors?: { kind: string }[] } }[];
  };
  const kinds = res.entries.flatMap((e) => e.result.errors ?? []).map((err) => err.kind);
  const inferred = res.entries.find((e) => e.layer === "Inferences")?.result.result ?? "";
  return { success: res.success, kinds, inferred };
}

const AGE_RECENCY = `concept "Age 21 Or Older":
- value type is boolean.
- code is \`age-21-or-older\`.
- source representation:
  - type is Patient.
  - value element is Patient.birthDate.
  - value type is date.
  - value projection is age today at least 21 years.`;

const DECISION = `decision "D":
first:
- when "Gate" then recommend activity "a.A".
activity "a.A":
- request CPGCommunicationRequest.
- with \`ok\`.`;

// A same-layer (Inferences) NON-total boolean: a `defined as` truth-set composition over local `code is` booleans.
const TRUTH_SET = `concept "L1":
- type is Observation.
- value type is boolean.
- code is \`l1\`.

concept "L2":
- type is Observation.
- value type is boolean.
- code is \`l2\`.

concept "TS":
- type is Observation.
- value type is boolean.
- defined as ( "L1" sem-or "L2" ).`;

// A same-layer (Inferences) non-boolean concept: a `defined as` CodeableConcept refinement composition.
const CC_REFINEMENT = `terminology "VS":
- valueset is \`http://example.org/vs\`.

concept "CC1":
- type is Observation.
- value type is CodeableConcept.
- coded from "VS".

concept "CC2":
- type is Observation.
- value type is CodeableConcept.
- coded from "VS".

concept "CCComp":
- type is Observation.
- value type is CodeableConcept.
- defined as ( "CC1" sem-or "CC2" ).`;

describe("#189 Slice C 2b.3b.1ii — boolean composition pivot error kinds (same-layer)", () => {
  it("MIXED three-state (recency merge + a composition over questions) → ADMITTED to the boolean lane, strong Kleene", () => {
    const { success, kinds, inferred } = emit(`library "P".

${AGE_RECENCY}

${TRUTH_SET}

concept "Gate":
- type is Observation.
- value type is boolean.
- defined as ( "Age 21 Or Older" sem-or "TS" ).

${DECISION}
`);
    // ⭐ #189 T5 step 2b — this cell FLIPPED, and the flip is the point of the slice. Both operands are
    // THREE-STATE booleans: `"Age 21 Or Older"` is a both-rep recency merge (three-state since O3 dropped its
    // outer `Coalesce`) and `"TS"` is a composition over two PURE QUESTIONS, each of which now publishes a
    // three-state determination instead of a truth-set List. So there is no longer a totality MIXTURE to
    // report — there are two nullable booleans, which is exactly what the boolean lane must accept.
    //
    // The charter settles the direction: composition is strong Kleene, and totality belongs at the ARM, never
    // per operand. Refusing here (or coalescing either operand) would deny a patient whose age is unknown AND
    // whose questions are unanswered, where the tree must pause and ask.
    expect(success).toBe(true);
    expect(kinds).toEqual([]);
    // BARE leaves — no `Coalesce`, no truth-set weave, no compile-failing sentinel.
    expect(inferred).toMatch(/define "Gate":\s*\n\s*"Age 21 Or Older"\s*\n?\s*or "TS"/);
    expect(inferred).not.toContain("CRLCommon.CompositionTotalityMixed");
    expect(inferred).not.toContain("asTruths()");
  });

  it("boolean parent over a KNOWN non-boolean (Scalar<CodeableConcept>) operand → emit-composition-result-type-mismatch + type-realign remedy (NOT `exists`)", () => {
    const { success, kinds, inferred } = emit(`library "P".

${CC_REFINEMENT}

${AGE_RECENCY}

concept "Gate":
- type is Observation.
- value type is boolean.
- defined as ( "Age 21 Or Older" sem-or "CCComp" ).

${DECISION}
`);
    expect(success).toBe(false);
    expect(kinds).toContain("emit-composition-result-type-mismatch");
    expect(inferred).toContain("CRLCommon.CompositionResultTypeMismatch");
  });

  it("PRECEDENCE: a non-boolean operand PLUS a total/non-total mix → result-type-mismatch wins (the type defect is deeper)", () => {
    const { success, kinds } = emit(`library "P".

${CC_REFINEMENT}

${TRUTH_SET}

${AGE_RECENCY}

concept "Gate":
- type is Observation.
- value type is boolean.
- defined as ( ( "Age 21 Or Older" sem-or "TS" ) sem-or "CCComp" ).

${DECISION}
`);
    expect(success).toBe(false);
    expect(kinds).toContain("emit-composition-result-type-mismatch");
    expect(kinds).not.toContain("emit-composition-totality-mixed");
  });

  it("PARENT CARDINALITY: a `shape is Record` + boolean parent with ALL-total operands does NOT flip to a scalar boolean (loud, not a silent flip — disc 452 #1 at the pivot)", () => {
    const { success, inferred } = emit(`library "P".

${AGE_RECENCY}

concept "R":
- type is Condition.
- value type is boolean.
- shape is Scalar.
- code is \`r\`.
- definition is exists this.

concept "Gate":
- type is Observation.
- value type is boolean.
- shape is Record.
- defined as ( "Age 21 Or Older" sem-or "R" ).

${DECISION}
`);
    // The Record-declared parent must NOT emit a bare scalar-boolean composition (`not`/`and`/`or`). Pre-fix it
    // would have flipped (the [critical] regression); post-fix it is loud (the retained refinement guard rejects
    // the total operands) → success:false and no flipped `define "Gate": … or …` scalar boolean.
    expect(success).toBe(false);
    expect(inferred).not.toMatch(/define "Gate":\s*\n\s*"Age 21 Or Older"\s+or\s+"R"/);
  });

  it("UNRESOLVED same-layer bare operand → emit-declared-result-unresolved (loud, not a dangling identifier)", () => {
    const { success, kinds, inferred } = emit(`library "P".

${AGE_RECENCY}

concept "Gate":
- type is Observation.
- value type is boolean.
- defined as ( "Age 21 Or Older" sem-or "Nonexistent Concept" ).

${DECISION}
`);
    expect(success).toBe(false);
    expect(kinds).toContain("emit-declared-result-unresolved");
    expect(inferred).toContain("CRLCommon.DeclaredResultUnresolved");
  });
});
