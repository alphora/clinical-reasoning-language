import { describe, it, expect } from "vitest";

import { buildCriterionIndex, CRITERION_INDEX_MAX_DEPTH } from "../criterionIndex";
import type {
  BranchCondition,
  BranchConditionAnd,
  BranchConditionCriterionRef,
  BranchConditionNot,
  BranchConditionOr,
  BranchConditionRef,
  Criterion,
  Location,
} from "../types";

// #236/#274 — the CRITERION INDEX (design §3 A/B). The index records, ONCE per distinct
// criterion, the facts the lowering seams need to emit/evaluate a REFERENCE (define id,
// recursive atom closure, direct dependencies, dependency depth) — the tree→DAG collapse
// that replaces the materializing expansion engine. The load-bearing property: every
// derived figure is MEMOIZED, so a doubling/diamond DAG is analysed LINEARLY (the
// materializer's exponential case) and a cyclic table never hangs.

const L = (line = 1): Location => ({ start: { line, column: 0 }, end: { line, column: 1 } });
const ref = (name: string, loc: Location = L()): BranchConditionRef => ({
  type: "BranchConditionRef",
  ref: name,
  location: loc,
});
const cref = (name: string, loc: Location = L()): BranchConditionCriterionRef => ({
  type: "BranchConditionCriterionRef",
  ref: name,
  location: loc,
});
const and = (...ops: BranchCondition[]): BranchConditionAnd => ({
  type: "BranchConditionAnd",
  operands: ops,
  location: L(),
});
const or = (...ops: BranchCondition[]): BranchConditionOr => ({
  type: "BranchConditionOr",
  operands: ops,
  location: L(),
});
const not = (operand: BranchCondition): BranchConditionNot => ({
  type: "BranchConditionNot",
  operand,
  location: L(),
});
const crit = (name: string, condition: BranchCondition): Criterion => ({
  type: "Criterion",
  name,
  condition,
  location: L(),
});

describe("buildCriterionIndex — a single criterion (no dependencies)", () => {
  it("closure = its direct concepts; deps empty; depth 0; defineId = bare name; status ok", () => {
    const idx = buildCriterionIndex([crit("Elig", and(ref("A"), ref("B")))]);
    const e = idx.get("Elig")!;
    expect(e.name).toBe("Elig");
    expect(e.defineId).toBe("Elig"); // bare name (mirrors a `defined as` concept define)
    expect(e.recursiveAtomClosure.map((r) => r.ref)).toEqual(["A", "B"]);
    expect(e.criterionDependencies).toEqual([]);
    expect(e.dependencyDepth).toBe(0);
    expect(e.status).toBe("ok");
    expect(e.sourceCondition).toBe(idx.get("Elig")!.sourceCondition); // the unexpanded body
  });

  it("walks through `not` and `or` for the closure (reachability is polarity-agnostic)", () => {
    const idx = buildCriterionIndex([crit("C", or(not(ref("A")), ref("B")))]);
    expect(idx.get("C")!.recursiveAtomClosure.map((r) => r.ref)).toEqual(["A", "B"]);
  });
});

describe("buildCriterionIndex — recursive dependencies (the DAG)", () => {
  it("follows sub-criteria into their bodies; deps are DIRECT only; depth counts nesting", () => {
    // Parent = A and Child; Child = B and Grand; Grand = C.
    const idx = buildCriterionIndex([
      crit("Parent", and(ref("A"), cref("Child"))),
      crit("Child", and(ref("B"), cref("Grand"))),
      crit("Grand", ref("C")),
    ]);
    const parent = idx.get("Parent")!;
    expect(parent.recursiveAtomClosure.map((r) => r.ref)).toEqual(["A", "B", "C"]);
    expect(parent.criterionDependencies).toEqual(["Child"]); // DIRECT only, not Grand
    expect(parent.dependencyDepth).toBe(2); // Child(1) → Grand(2)
    expect(idx.get("Child")!.dependencyDepth).toBe(1);
    expect(idx.get("Grand")!.dependencyDepth).toBe(0);
    expect(parent.status).toBe("ok");
  });

  it("dedupes a concept reachable via two paths (first occurrence kept, deterministic order)", () => {
    // Both sub-criteria gate on the SAME shared concept `Cov` — it must appear ONCE.
    const idx = buildCriterionIndex([
      crit("Router", or(cref("Left"), cref("Right"))),
      crit("Left", and(ref("Cov"), ref("L"))),
      crit("Right", and(ref("Cov"), ref("R"))),
    ]);
    const e = idx.get("Router")!;
    expect(e.recursiveAtomClosure.map((r) => r.ref)).toEqual(["Cov", "L", "R"]); // Cov once
    expect(e.criterionDependencies).toEqual(["Left", "Right"]);
  });

  it("a DOUBLING DAG is analysed LINEARLY — deduped closure, exact depth, NO hang (the #236 property)", () => {
    // C0 = A; Ck = C(k-1) and C(k-1). The materializer visits 2^k leaves (its atom cap exists
    // precisely to refuse this); the index memoizes each level once → O(k). If the memo were
    // absent this test would hang — its prompt return IS the linearity proof. Depth 30 stays
    // under CRITERION_INDEX_MAX_DEPTH (32) so status is `ok` (over-depth is its own case below).
    const cs: Criterion[] = [crit("C0", ref("A"))];
    for (let k = 1; k <= 30; k++) cs.push(crit(`C${k}`, and(cref(`C${k - 1}`), cref(`C${k - 1}`))));
    const idx = buildCriterionIndex(cs);
    const top = idx.get("C30")!;
    expect(top.recursiveAtomClosure.map((r) => r.ref)).toEqual(["A"]); // one distinct atom
    expect(top.dependencyDepth).toBe(30);
    expect(top.criterionDependencies).toEqual(["C29"]); // deduped direct dep
    expect(top.status).toBe("ok");
  });

  it("a doubling DAG PAST the depth bound is flagged (depth-exceeded), still without hanging", () => {
    // Same shape but nested past CRITERION_INDEX_MAX_DEPTH — the recursion/eval bound trips
    // (design §G reuses CRITERION_MAX_DEPTH); the index flags it rather than hanging.
    const over = CRITERION_INDEX_MAX_DEPTH + 5;
    const cs: Criterion[] = [crit("C0", ref("A"))];
    for (let k = 1; k <= over; k++)
      cs.push(crit(`C${k}`, and(cref(`C${k - 1}`), cref(`C${k - 1}`))));
    const idx = buildCriterionIndex(cs);
    expect(idx.get(`C${over}`)!.status).toBe("depth-exceeded");
  });
});

describe("buildCriterionIndex — malformed tables never hang, and are flagged", () => {
  it("a CYCLE → status 'cycle', no infinite loop", () => {
    const idx = buildCriterionIndex([crit("X", cref("Y")), crit("Y", cref("X"))]);
    expect(idx.get("X")!.status).toBe("cycle");
    expect(idx.get("Y")!.status).toBe("cycle");
  });

  it("an UNDEFINED dependency → status 'undefined-dependency'", () => {
    const idx = buildCriterionIndex([crit("X", and(ref("A"), cref("Missing")))]);
    const e = idx.get("X")!;
    expect(e.status).toBe("undefined-dependency");
    expect(e.recursiveAtomClosure.map((r) => r.ref)).toEqual(["A"]); // inline survives
  });

  it("nesting past the depth bound → status 'depth-exceeded', depth saturates", () => {
    // A linear alias chain longer than the bound: D0..D(MAX+2).
    const cs: Criterion[] = [crit("D0", ref("A"))];
    for (let k = 1; k <= CRITERION_INDEX_MAX_DEPTH + 2; k++)
      cs.push(crit(`D${k}`, cref(`D${k - 1}`)));
    const idx = buildCriterionIndex(cs);
    const top = idx.get(`D${CRITERION_INDEX_MAX_DEPTH + 2}`)!;
    expect(top.status).toBe("depth-exceeded");
    expect(top.dependencyDepth).toBe(CRITERION_INDEX_MAX_DEPTH + 1); // saturated sentinel
  });
});

describe("buildCriterionIndex — index shape", () => {
  it("entries are in declaration (source) order; get/has resolve by name", () => {
    const idx = buildCriterionIndex([crit("First", ref("A")), crit("Second", ref("B"))]);
    expect(idx.entries.map((e) => e.name)).toEqual(["First", "Second"]);
    expect(idx.has("First")).toBe(true);
    expect(idx.has("Nope")).toBe(false);
    expect(idx.get("Second")!.defineId).toBe("Second");
  });

  it("ignores non-criterion statements and empty-named criteria", () => {
    const idx = buildCriterionIndex([
      crit("Real", ref("A")),
      crit("", ref("B")), // empty name — unreferenceable, dropped (mirrors buildCriterionTable)
    ]);
    expect(idx.entries.map((e) => e.name)).toEqual(["Real"]);
  });
});
