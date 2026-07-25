// #224 ii.1c — criterion EMIT wiring: a `criterion` guard ref must expand at the
// `emitWhenBlock` entry and emit BYTE-IDENTICALLY to the hand-inlined guard (a `criterion`
// is authoring-DRY, not an emit-arm reducer). The critical invariants proved here:
//   1. compound criterion body  → byte-identical to the hand-inlined `and`/`or` guard;
//   2. SOLE-ref criterion (body = one concept) → re-enters the single-ref emit path,
//      byte-identical to `when "A"` (disc 303 C3 — the gate is BEFORE `soleRef`);
//   3. envelope breach → a `criterion-expansion-overflow` diagnostic + suppression (the
//      per-lane resource disposition; "materialized tree" wording).
// The full parity/tripwire battery is ii.2; this is the wiring proof.

import { describe, expect, it } from "vitest";

import type {
  Action,
  BranchBlock,
  BranchCondition,
  Criterion,
  Decision,
  RecommendActivity,
  WhenBlock,
  WhenBlockBody,
} from "../../ast/types";
import { buildCriterionTable } from "../../ast/criterionExpansion";
import {
  type ActivityResolver,
  type ConceptResolver,
  type DecisionResolver,
  emitDecisionPlanDefinition,
} from "../decision";
import type { CpgMetadata } from "../types";

const LOC = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } as const;
const FIXED_CLOCK = () => new Date("2026-06-04T15:30:00.000Z");

const METADATA: CpgMetadata = {
  version: "1.0.0",
  name: "lib",
  title: "Lib",
  description: "Test library",
  publisher: "Smile Digital Health",
  contact: [],
  canonicalBase: "http://example.org/sdh/demo",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

const RESOLVE_ALL: ConceptResolver = (ref) => (typeof ref === "string" ? ref : ref.name);
const RESOLVE_ACT_OK: ActivityResolver = (ref) =>
  `${METADATA.canonicalBase}/PlanDefinition/lib-${(typeof ref === "string" ? ref : ref.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}-recommendation`;
const RESOLVE_DEC_OK: DecisionResolver = (ref) =>
  `${METADATA.canonicalBase}/PlanDefinition/lib-${(typeof ref === "string" ? ref : ref.name).toLowerCase()}`;

function recommend(name: string): RecommendActivity {
  return { type: "RecommendActivity", activityName: name, location: LOC };
}
function leaf(action: Action): WhenBlockBody {
  return { type: "ActionStatement", action, location: LOC };
}
function refC(ref: string): BranchCondition {
  return { type: "BranchConditionRef", ref, location: LOC };
}
function andC(...operands: BranchCondition[]): BranchCondition {
  return { type: "BranchConditionAnd", operands, location: LOC };
}
function orC(...operands: BranchCondition[]): BranchCondition {
  return { type: "BranchConditionOr", operands, location: LOC };
}
function critRefC(name: string): BranchCondition {
  return { type: "BranchConditionCriterionRef", ref: name, location: LOC };
}
function whenC(condition: BranchCondition, body: WhenBlockBody): WhenBlock {
  return { type: "WhenBlock", condition, body, location: LOC };
}
function criterion(name: string, condition: BranchCondition): Criterion {
  return { type: "Criterion", name, condition, location: LOC };
}
function decision(name: string, statements: BranchBlock[], qualifier?: "first" | "all" | "any"): Decision {
  return {
    type: "Decision",
    name,
    body: { type: "DecisionBody", statements, location: LOC, ...(qualifier !== undefined ? { qualifier } : {}) },
    location: LOC,
  };
}

function emit(d: Decision, table: Criterion[] = []): { resource: unknown; errors: { kind: string }[] } {
  const r = emitDecisionPlanDefinition(
    d,
    "Lib",
    METADATA,
    RESOLVE_ALL,
    RESOLVE_ACT_OK,
    RESOLVE_DEC_OK,
    true,
    { clock: FIXED_CLOCK },
    undefined,
    undefined,
    buildCriterionTable(table),
  );
  return { resource: r.resource?.resource ?? null, errors: r.errors };
}

describe("#224 ii.1c — criterion emit parity", () => {
  it("compound criterion body emits byte-identically to the hand-inlined and/or guard", () => {
    // when ( Eligible )  where  criterion "Eligible": - when ( "A" and ( "B" or "C" ) ).
    const elig = criterion("Eligible", andC(refC("A"), orC(refC("B"), refC("C"))));
    const viaCriterion = decision("Top", [whenC(critRefC("Eligible"), leaf(recommend("Act")))]);
    const handInlined = decision("Top", [
      whenC(andC(refC("A"), orC(refC("B"), refC("C"))), leaf(recommend("Act"))),
    ]);

    const a = emit(viaCriterion, [elig]);
    const b = emit(handInlined);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    // The `sourcedFromCriterion` marker is emit-IGNORED — the emitted resources must match.
    expect(a.resource).toEqual(b.resource);
  });

  it("sole-ref criterion (body = one concept) re-enters the single-ref path (byte-identical to `when \"A\"`)", () => {
    const solo = criterion("Solo", refC("A"));
    const viaCriterion = decision("Top", [whenC(critRefC("Solo"), leaf(recommend("Act")))]);
    const handInlined = decision("Top", [whenC(refC("A"), leaf(recommend("Act")))]);

    const a = emit(viaCriterion, [solo]);
    const b = emit(handInlined);
    expect(a.errors).toEqual([]);
    // Byte-identity here proves the gate runs BEFORE soleRef (disc 303 C3): the criterion
    // collapses to the single-ref emit path, not the compound path.
    expect(a.resource).toEqual(b.resource);
  });

  it("nested criterion (criterion body references another criterion) expands transitively", () => {
    const inner = criterion("Inner", orC(refC("B"), refC("C")));
    const outer = criterion("Outer", andC(refC("A"), critRefC("Inner")));
    const viaCriterion = decision("Top", [whenC(critRefC("Outer"), leaf(recommend("Act")))]);
    const handInlined = decision("Top", [
      whenC(andC(refC("A"), orC(refC("B"), refC("C"))), leaf(recommend("Act"))),
    ]);

    const a = emit(viaCriterion, [inner, outer]);
    const b = emit(handInlined);
    expect(a.errors).toEqual([]);
    expect(a.resource).toEqual(b.resource);
  });

  it("an envelope-breaching criterion → `criterion-expansion-overflow` diagnostic + suppression", () => {
    // Doubling chain C0..C10: C0 = A and A (2 atoms); C_k = C_{k-1} and C_{k-1} → 2^(k+1)
    // atoms. C10 materializes 2048 leaves > the 1024 atom cap.
    const chain: Criterion[] = [criterion("C0", andC(refC("A"), refC("A")))];
    for (let k = 1; k <= 10; k++) {
      chain.push(criterion(`C${k}`, andC(critRefC(`C${k - 1}`), critRefC(`C${k - 1}`))));
    }
    const d = decision("Top", [whenC(critRefC("C10"), leaf(recommend("Act")))]);
    const { resource, errors } = emit(d, chain);
    const overflow = errors.find((e) => e.kind === "criterion-expansion-overflow");
    expect(overflow).toBeDefined();
    // Resource-bound wording — "materialized tree", not "expands to" (disc 302/303).
    expect((overflow as { message: string }).message).toContain("materialized tree");
    // The guard is SUPPRESSED: with the sole (overflowing) branch gone, the decision emits
    // no surviving action → no resource (parity with the arm-cap overflow disposition).
    expect(resource).toBeNull();
  });
});
