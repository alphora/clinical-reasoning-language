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
function notC(operand: BranchCondition): BranchCondition {
  return { type: "BranchConditionNot", operand, location: LOC };
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
    // Message READABILITY (disc 305): resource-bound wording — "materialized tree", not "expands
    // to" (disc 302/303) — AND it names the offending criterion (`C10`) so the author can locate
    // it. A `kind`-only assertion would let the message rot.
    expect((overflow as { message: string }).message).toContain("materialized tree");
    expect((overflow as { message: string }).message).toContain("C10");
    // The guard is SUPPRESSED: with the sole (overflowing) branch gone, the decision emits
    // no surviving action → no resource (parity with the arm-cap overflow disposition).
    expect(resource).toBeNull();
  });
});

// ── ii.2 Battery 1 — the emit STRUCTURAL-parity shape matrix ────────────────────
// Each cell: a criterion guard emits deep-equal to the hand-inlined guard, across every
// shape the compound-guard feature supports. A `criterion` is authoring-DRY, NOT an
// emit-arm reducer, so the two resources must be indistinguishable. Fixed `LOC` makes the
// deep-equal exact (the only field that would diverge — source range — is emit-irrelevant).
describe("#224 ii.2 — emit parity across the shape matrix", () => {
  // via-criterion `when Elig` vs hand-inlined `when <body>` — one assertion per shape.
  const parity = (
    label: string,
    body: BranchCondition,
    table: Criterion[] = [],
    qualifier?: "first" | "all" | "any",
  ) => {
    it(`${label} — via-criterion == hand-inlined`, () => {
      const elig = criterion("Elig", body);
      const via = decision("Top", [whenC(critRefC("Elig"), leaf(recommend("Act")))], qualifier);
      const inl = decision("Top", [whenC(body, leaf(recommend("Act")))], qualifier);
      const a = emit(via, [elig, ...table]);
      const b = emit(inl, table);
      expect(a.errors).toEqual([]);
      expect(b.errors).toEqual([]);
      expect(a.resource).toEqual(b.resource);
      // Serialized-bytes pin (both arms: deep-equal proves STRUCTURAL parity; this honours
      // the literal "byte-identical to hand-inlining" claim under the fixed clock).
      expect(JSON.stringify(a.resource)).toEqual(JSON.stringify(b.resource));
    });
  };

  parity("pure and", andC(refC("A"), refC("B"), refC("C")));
  parity("pure or (DNF arms)", orC(refC("A"), refC("B"), refC("C")));
  // OR of a compound arm and a singleton — concatenates a multi-atom arm with another arm.
  parity("or of compound + singleton `(A and B) or C`", orC(andC(refC("A"), refC("B")), refC("C")));
  // Cartesian product of two disjunctions → 4 arms — the arm-MULTIPLICATION mechanism
  // behind the 256-arm envelope (the shape most likely to diverge in DNF lowering).
  parity("cartesian `(A or B) and (C or D)`", andC(orC(refC("A"), refC("B")), orC(refC("C"), refC("D"))));
  // Menu qualifiers — the criterion guard inside `all:` / `any:` decisions.
  parity("under all: qualifier", andC(refC("A"), orC(refC("B"), refC("C"))), [], "all");
  parity("under any: qualifier", andC(refC("A"), orC(refC("B"), refC("C"))), [], "any");

  // #224 iii.3 — a criterion body may carry `not`. These prove the FULL pipeline runs on the
  // expanded criterion body: classify → EXPAND → toNNF → DNF → per-literal polarity emit. The
  // via-criterion resource must byte-match the hand-inlined negated guard (criterion-free body).
  parity("negated single `not B`", notC(refC("B")));
  parity("mixed `A and not B`", andC(refC("A"), notC(refC("B"))));
  parity("De Morgan in body `not (A and B)`", notC(andC(refC("A"), refC("B"))));
  parity("De Morgan in body `not (A or B)`", notC(orC(refC("A"), refC("B"))));

  // Duplicate-atom + mixed cells CANNOT use the generic helper: their body carries a criterion
  // ref, so the helper's `inl` would ALSO expand it (both sides deduped identically → a green
  // pass while §A5 is false). These use a criterion-FREE hand-inlined twin AND an absolute
  // no-dedup content assertion.
  it("duplicate atom — via == criterion-FREE inline, and the duplicated atom is PRESERVED (no dedup)", () => {
    // `A and Dup` where `Dup = A or B`. DNF = (A∧A) ∨ (A∧B): the first arm carries A TWICE.
    const dup = criterion("Dup", orC(refC("A"), refC("B")));
    const via = decision("Top", [whenC(andC(refC("A"), critRefC("Dup")), leaf(recommend("Act")))]);
    const inl = decision("Top", [whenC(andC(refC("A"), orC(refC("A"), refC("B"))), leaf(recommend("Act")))]);
    const a = emit(via, [dup]);
    const b = emit(inl); // criterion-FREE
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(a.resource).toEqual(b.resource);
    // ABSOLUTE no-dedup: A's applicability expression appears 3× (arm1 A,A + arm2 A) — NOT 2×
    // (which a dedup to `A and (A or B)` would yield). This holds independent of the parity above
    // (which would still pass if BOTH sides deduped).
    const aExprCount = (JSON.stringify(a.resource).match(/"expression":"A"/g) ?? []).length;
    expect(aExprCount).toBe(3);
  });

  it("mixed inline+criterion `A and Mix(=B or C)` — via == criterion-FREE inline", () => {
    const mix = criterion("Mix", orC(refC("B"), refC("C")));
    const via = decision("Top", [whenC(andC(refC("A"), critRefC("Mix")), leaf(recommend("Act")))]);
    const inl = decision("Top", [whenC(andC(refC("A"), orC(refC("B"), refC("C"))), leaf(recommend("Act")))]);
    const a = emit(via, [mix]);
    const b = emit(inl); // criterion-FREE
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(a.resource).toEqual(b.resource);
  });

  it("#224 iii.3 — `not` applied TO a criterion ref `not Elig(=B or C)` — via == criterion-FREE inline", () => {
    // The "not <named exclusion>" shape: expansion must recurse INTO the `Not` and rebuild it
    // with the expanded operand (criterionExpansion `materialize`) BEFORE `toNNF` De Morgans
    // `not (B or C)` → `not B and not C`. A missed seam would throw `unexpandedCriterion` at NNF.
    const elig = criterion("Elig", orC(refC("B"), refC("C")));
    const via = decision("Top", [whenC(andC(refC("A"), notC(critRefC("Elig"))), leaf(recommend("Act")))]);
    // criterion-FREE twin: `A and not (B or C)`.
    const inl = decision("Top", [whenC(andC(refC("A"), notC(orC(refC("B"), refC("C")))), leaf(recommend("Act")))]);
    const a = emit(via, [elig]);
    const b = emit(inl); // criterion-FREE
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(a.resource).toEqual(b.resource);
  });

  it("use-decision body — a criterion guard on a `use decision` branch emits the action.definition path identically", () => {
    // Exercises the action.definition (sub-decision) emit path, NOT the recommend-activity path
    // every other cell uses. Via-criterion vs criterion-free inline, both delegating to "Sub".
    const useSub: WhenBlockBody = leaf({ type: "UseDecision", decisionName: "Sub", location: LOC });
    const elig = criterion("Elig", andC(refC("A"), refC("B")));
    const via = decision("Top", [whenC(critRefC("Elig"), useSub)]);
    const inl = decision("Top", [whenC(andC(refC("A"), refC("B")), useSub)]);
    const a = emit(via, [elig]);
    const b = emit(inl);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(a.resource).toEqual(b.resource);
  });

  it("cascade suppression — a criterion-guarded branch on an UNRESOLVED concept suppresses identically to inline", () => {
    // A resolver that fails "Missing" (else resolves by name). Branch 1's guard references it
    // (via a criterion / inline); branch 2 survives. The criterion-guarded branch must
    // cascade-suppress EXACTLY as the inline branch does — same surviving resource, same
    // suppression diagnostic.
    const resolveExceptMissing: ConceptResolver = (ref) => {
      const n = typeof ref === "string" ? ref : ref.name;
      return n === "Missing" ? null : n;
    };
    const emitWith = (d: Decision, table: Criterion[]) => {
      const r = emitDecisionPlanDefinition(
        d, "Lib", METADATA, resolveExceptMissing, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true,
        { clock: FIXED_CLOCK }, undefined, undefined, buildCriterionTable(table),
      );
      return {
        resource: r.resource?.resource ?? null,
        errors: r.errors.map((e) => e.kind),
        unmatched: r.unmatched.map((u) => u.kind),
      };
    };
    const elig = criterion("Elig", refC("Missing"));
    const via = decision(
      "Top",
      [whenC(critRefC("Elig"), leaf(recommend("Gone"))), whenC(refC("A"), leaf(recommend("Kept")))],
      "first",
    );
    const inl = decision(
      "Top",
      [whenC(refC("Missing"), leaf(recommend("Gone"))), whenC(refC("A"), leaf(recommend("Kept")))],
      "first",
    );
    const a = emitWith(via, [elig]);
    const b = emitWith(inl, []);
    // Identical suppression disposition AND identical surviving resource (the criterion is
    // authoring-DRY on the failure path too). Pin the diagnostic NON-EMPTY so "same suppression"
    // is verified, not vacuously-equal empty arrays: the unresolved concept surfaces as an
    // `unresolved-concept` unmatched entry, identically via-criterion and inline.
    expect(a.errors).toEqual(b.errors);
    expect(a.unmatched).toEqual(b.unmatched);
    expect(a.unmatched).toContain("unresolved-concept");
    expect(a.resource).toEqual(b.resource);
    // The kept branch survives; the suppressed one does not.
    expect(JSON.stringify(a.resource)).toContain("lib-kept-recommendation");
    expect(JSON.stringify(a.resource)).not.toContain("lib-gone-recommendation");
  });

  it("first: cascade placement — criterion in a NON-first branch splices identically", () => {
    // A `first:` decision: branch 1 a plain concept, branch 2 a compound criterion guard.
    // The criterion's arms must splice as contiguous siblings exactly as the inline arms do.
    const elig = criterion("Elig", orC(refC("B"), refC("C")));
    const body = orC(refC("B"), refC("C"));
    const via = decision(
      "Top",
      [whenC(refC("A"), leaf(recommend("First"))), whenC(critRefC("Elig"), leaf(recommend("Act")))],
      "first",
    );
    const inl = decision(
      "Top",
      [whenC(refC("A"), leaf(recommend("First"))), whenC(body, leaf(recommend("Act")))],
      "first",
    );
    const a = emit(via, [elig]);
    const b = emit(inl);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(a.resource).toEqual(b.resource);
  });
});

// ── ii.2 Battery 4 — the two-envelope interaction (atom-cap 1024 vs arm-cap 256) ──
// The genuinely-new proof: the atom envelope (ii.1b) and the pre-existing 256-arm cap are
// INDEPENDENT composing bounds. A criterion runs expansion BEFORE the arm-cap, so a guard
// that passes the atom envelope can still hit the arm-cap, and vice versa.
describe("#224 ii.2 — the atom-cap / arm-cap two-envelope interaction", () => {
  it("atom-OK but arm-OVERFLOW → the EXISTING arm-cap fires (not a criterion overflow), parity with inline", () => {
    // 9 binary disjunctions ANDed = 2^9 = 512 DNF arms but only 18 atoms. 18 ≤ 1024 (atom
    // envelope OK) yet 512 > 256 (arm-cap breached). Proves expansion runs BEFORE the arm-cap.
    const disjuncts: BranchCondition[] = [];
    for (let k = 0; k < 9; k++) disjuncts.push(orC(refC(`A${k}`), refC(`B${k}`)));
    const body = andC(...disjuncts);
    const elig = criterion("Wide", body);
    const via = decision("Top", [whenC(critRefC("Wide"), leaf(recommend("Act")))]);
    const inl = decision("Top", [whenC(body, leaf(recommend("Act")))]);
    const a = emit(via, [elig]);
    const b = emit(inl);
    // Both fire the ARM-cap overflow (NOT the criterion-expansion overflow) — the criterion
    // expanded fine (atom envelope OK); the resulting DNF is what breaches the arm-cap.
    const aKinds = a.errors.map((e) => e.kind);
    expect(aKinds).toContain("compound-guard-expansion-overflow");
    expect(aKinds).not.toContain("criterion-expansion-overflow");
    // Overflow PARITY: the via-criterion disposition == the inline disposition (same kind,
    // same suppression) — the criterion-is-not-special claim extends to the FAILURE path.
    expect(a.errors.map((e) => e.kind)).toEqual(b.errors.map((e) => e.kind));
    expect(a.resource).toEqual(b.resource);
  });

  it("arm-OK but atom-OVERFLOW → the criterion atom envelope fires (arm-cap would have passed)", () => {
    // A pure `and` doubling chain: 1 arm always (pure conjunction), but 2^11 = 2048 atoms.
    // The arm-cap (1 ≤ 256) would pass; the atom envelope (2048 > 1024) catches it — the
    // design-v2 §A4 raison d'être (the arm-cap alone misses unbounded conjunctive growth).
    const chain: Criterion[] = [criterion("D0", andC(refC("A"), refC("A")))];
    for (let k = 1; k <= 10; k++) {
      chain.push(criterion(`D${k}`, andC(critRefC(`D${k - 1}`), critRefC(`D${k - 1}`))));
    }
    const d = decision("Top", [whenC(critRefC("D10"), leaf(recommend("Act")))]);
    const { resource, errors } = emit(d, chain);
    const kinds = errors.map((e) => e.kind);
    expect(kinds).toContain("criterion-expansion-overflow");
    expect(kinds).not.toContain("compound-guard-expansion-overflow");
    expect(resource).toBeNull();
  });

  it("atom boundary is WIRED at emit: 1024 atoms OK, 1025 refused", () => {
    // A flat `and` of N distinct concept atoms inside a criterion — atoms == N exactly.
    const bodyOf = (n: number) => andC(...Array.from({ length: n }, (_, i) => refC(`c${i}`)));
    const okDec = decision("Top", [whenC(critRefC("Ok"), leaf(recommend("Act")))]);
    const okRes = emit(okDec, [criterion("Ok", bodyOf(1024))]);
    expect(okRes.errors.map((e) => e.kind)).not.toContain("criterion-expansion-overflow");
    expect(okRes.resource).not.toBeNull();
    // LOSSLESS materialization: the single pure-`and` arm carries exactly 1024 ANDed
    // applicability conditions (a regression that truncated/deduped would count fewer).
    const okAction = (okRes.resource as { action: Array<{ condition?: unknown[] }> }).action[0];
    expect(okAction.condition).toHaveLength(1024);

    const overDec = decision("Top", [whenC(critRefC("Over"), leaf(recommend("Act")))]);
    const overRes = emit(overDec, [criterion("Over", bodyOf(1025))]);
    expect(overRes.errors.map((e) => e.kind)).toContain("criterion-expansion-overflow");
    expect(overRes.resource).toBeNull();
  });

  it("arm boundary is WIRED at emit: exactly 256 arms OK (the >256 refused side = the atom-OK/arm-overflow test)", () => {
    // 8 binary disjunctions ANDed = 2^8 = 256 DNF arms (16 atoms) — the arm-cap is `> 256`, so
    // 256 is the LAST accepted value: emits with no overflow. (The 512-arm refusal is proven in
    // the two-envelope test above; the DEPTH 32/33 boundary is engine-owned —
    // criterionExpansion.test.ts depth-envelope suite — a deliberate non-duplication here.)
    const disjuncts: BranchCondition[] = [];
    for (let k = 0; k < 8; k++) disjuncts.push(orC(refC(`A${k}`), refC(`B${k}`)));
    const at256 = decision("Top", [whenC(critRefC("Exactly256"), leaf(recommend("Act")))]);
    const res = emit(at256, [criterion("Exactly256", andC(...disjuncts))]);
    expect(res.errors.map((e) => e.kind)).not.toContain("compound-guard-expansion-overflow");
    expect(res.errors.map((e) => e.kind)).not.toContain("criterion-expansion-overflow");
    expect(res.resource).not.toBeNull();
    // MATERIALIZED, not truncated: the `any`-grouping action carries exactly 256 arm actions (a
    // regression that truncated/deduped the DNF to e.g. 128 would also pass "no overflow").
    const group = (res.resource as { action: Array<{ action?: unknown[] }> }).action[0];
    expect(group.action).toHaveLength(256);
  });
});

// ── ii.2 Battery 3 — mixed-outcome overflow (disposition GRANULARITY) ────────────
// ii.1c overflow tests use a SOLE overflowing guard (resource === null), which cannot
// distinguish selective-branch suppression from whole-decision failure. This proves the
// disposition is PER-GUARD: an overflowing criterion guard is suppressed while a valid
// sibling branch SURVIVES and emits.
describe("#224 ii.2 — mixed-outcome overflow (a valid sibling survives)", () => {
  it("an overflowing criterion guard is suppressed but a valid sibling `when` still emits", () => {
    const chain: Criterion[] = [criterion("B0", andC(refC("X"), refC("X")))];
    for (let k = 1; k <= 10; k++) {
      chain.push(criterion(`B${k}`, andC(critRefC(`B${k - 1}`), critRefC(`B${k - 1}`))));
    }
    // Branch 1: a valid plain concept guard. Branch 2: the overflowing criterion.
    const d = decision(
      "Top",
      [
        whenC(refC("Valid"), leaf(recommend("Good"))),
        whenC(critRefC("B10"), leaf(recommend("Bad"))),
      ],
      "first",
    );
    const { resource, errors } = emit(d, chain);
    // The overflow is diagnosed…
    expect(errors.map((e) => e.kind)).toContain("criterion-expansion-overflow");
    // …but the decision SURVIVES with its valid branch (resource non-null, the good action's
    // definitionCanonical present, the suppressed branch's activity canonical absent).
    expect(resource).not.toBeNull();
    const json = JSON.stringify(resource);
    expect(json).toContain("lib-good-recommendation");
    expect(json).not.toContain("lib-bad-recommendation");
  });
});
