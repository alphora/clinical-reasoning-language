import { describe, it, expect } from "vitest";
import {
  assertWellFormedBranchCondition,
  branchConditionArmCount,
  branchConditionConceptRefsFollowingCriteria,
  branchConditionConceptRefsStrict,
  branchConditionDNF,
  branchConditionRefs,
  collectNegations,
  containsNot,
  describeBranchCondition,
  soleRef,
  toNNF,
  visitBranchCondition,
} from "../branchCondition";
import { buildCriterionTable } from "../criterionExpansion";
import {
  getRefName,
  refDisplay,
  type BranchCondition,
  type BranchConditionCriterionRef,
  type BranchConditionLiteral,
  type BranchConditionNot,
  type Criterion,
  type Location,
  type ReferenceName,
  type SourcedFromCriterion,
} from "../types";

const LOC = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } };

const ref = (name: ReferenceName): BranchCondition => ({
  type: "BranchConditionRef",
  ref: name,
  location: LOC,
});
const and = (...operands: BranchCondition[]): BranchCondition => ({
  type: "BranchConditionAnd",
  operands,
  location: LOC,
});
const or = (...operands: BranchCondition[]): BranchCondition => ({
  type: "BranchConditionOr",
  operands,
  location: LOC,
});
// #224 iii.2: a `not` node.
const not = (operand: BranchCondition): BranchCondition => ({
  type: "BranchConditionNot",
  operand,
  location: LOC,
});
// Serialize a DNF arm's signed literals as `+A` (positive) / `-A` (negated single ref).
const lit = (a: BranchConditionLiteral): string =>
  a.type === "BranchConditionNot" ? `-${getRefName(a.operand.ref)}` : `+${getRefName(a.ref)}`;
const dnfSigned = (c: BranchCondition): string[][] =>
  branchConditionDNF(c).map((arm) => arm.map(lit));

describe("branchCondition traversal helpers", () => {
  describe("branchConditionRefs — ordered, duplicates preserved, returns ref nodes", () => {
    it("single ref → one node", () => {
      const refs = branchConditionRefs(ref("A"));
      expect(refs.map((r) => r.ref)).toEqual(["A"]);
      expect(refs[0]!.location).toBe(LOC);
    });
    it("compound → left-to-right leaves", () => {
      // (A or B) and C
      const c = and(or(ref("A"), ref("B")), ref("C"));
      expect(branchConditionRefs(c).map((r) => r.ref)).toEqual(["A", "B", "C"]);
    });
    it("PRESERVES duplicate operands (A and A)", () => {
      expect(branchConditionRefs(and(ref("A"), ref("A"))).map((r) => r.ref)).toEqual(["A", "A"]);
    });
  });

  describe("soleRef — ref IFF the node itself is a ref (not 'exactly one ref exists')", () => {
    it("single ref → the ref node", () => {
      expect(soleRef(ref("A"))?.ref).toBe("A");
    });
    it("and/or → null even when they wrap a single leaf (malformed unary must NOT collapse)", () => {
      expect(soleRef(and(ref("A")))).toBeNull();
      expect(soleRef(or(ref("A")))).toBeNull();
      expect(soleRef(and(ref("A"), ref("B")))).toBeNull();
    });
  });

  describe("describeBranchCondition — parenthesizes only across a differing operator", () => {
    it("single ref uses the display fn", () => {
      expect(describeBranchCondition(ref("A"), getRefName)).toBe("A");
      expect(describeBranchCondition(ref("A"), refDisplay)).toBe('"A"');
    });
    it("homogeneous chains need no parens", () => {
      expect(describeBranchCondition(and(ref("A"), ref("B"), ref("C")), getRefName)).toBe(
        "A and B and C",
      );
      expect(describeBranchCondition(or(ref("A"), ref("B")), getRefName)).toBe("A or B");
    });
    it("(A or B) and C parenthesizes the nested or", () => {
      expect(describeBranchCondition(and(or(ref("A"), ref("B")), ref("C")), getRefName)).toBe(
        "(A or B) and C",
      );
    });
    it("A and (B or C) parenthesizes the nested or on the right", () => {
      expect(describeBranchCondition(and(ref("A"), or(ref("B"), ref("C"))), getRefName)).toBe(
        "A and (B or C)",
      );
    });
  });

  describe("visitBranchCondition — fold receives node + folded child results", () => {
    it("counts leaves via the fold", () => {
      const count = (c: BranchCondition): number =>
        visitBranchCondition<number>(c, {
          ref: () => 1,
          criterionRef: () => 1, // #224 ii: a criterion-ref leaf counts as one atom
          and: (_n, ops) => ops.reduce((a, b) => a + b, 0),
          or: (_n, ops) => ops.reduce((a, b) => a + b, 0),
        });
      expect(count(and(or(ref("A"), ref("B")), ref("C")))).toBe(3);
    });
  });

  describe("assertWellFormedBranchCondition — >= 2 operands on and/or", () => {
    it("accepts a single ref and well-formed compounds", () => {
      expect(() => assertWellFormedBranchCondition(ref("A"))).not.toThrow();
      expect(() => assertWellFormedBranchCondition(and(ref("A"), ref("B")))).not.toThrow();
      expect(() =>
        assertWellFormedBranchCondition(and(or(ref("A"), ref("B")), ref("C"))),
      ).not.toThrow();
    });
    it("throws on a unary and/or", () => {
      expect(() => assertWellFormedBranchCondition(and(ref("A")))).toThrow(/>= 2 operands/);
      expect(() => assertWellFormedBranchCondition(or(ref("A")))).toThrow(/>= 2 operands/);
    });
    it("throws on a NESTED malformed operand", () => {
      expect(() => assertWellFormedBranchCondition(and(ref("A"), or(ref("B"))))).toThrow(
        />= 2 operands/,
      );
    });
  });

  describe("branchConditionRefs — defensive at the untyped boundary", () => {
    it("skips a malformed node with no operands array (partial editor AST)", () => {
      // e.g. a half-built condition from an invalid buffer, cast through `unknown`.
      const malformed = { type: "BranchConditionAnd", location: LOC } as unknown as BranchCondition;
      expect(branchConditionRefs(malformed)).toEqual([]);
    });
  });

  describe("branchConditionDNF — arms as ordered atom lists (#224 i.3)", () => {
    const names = (arms: ReturnType<typeof branchConditionDNF>): string[][] =>
      arms.map((arm) => arm.map((a) => a.ref as string));

    it("single ref → one arm", () => {
      expect(names(branchConditionDNF(ref("A")))).toEqual([["A"]]);
    });
    it("`A and B` → one arm, two atoms", () => {
      expect(names(branchConditionDNF(and(ref("A"), ref("B"))))).toEqual([["A", "B"]]);
    });
    it("`A or B` → two arms", () => {
      expect(names(branchConditionDNF(or(ref("A"), ref("B"))))).toEqual([["A"], ["B"]]);
    });
    it("`(A or B) and C` → distributes to [A,C], [B,C]", () => {
      const c = and(or(ref("A"), ref("B")), ref("C"));
      expect(names(branchConditionDNF(c))).toEqual([
        ["A", "C"],
        ["B", "C"],
      ]);
    });
    it("`(A or B) and (C or D)` → exact 4-arm cartesian order", () => {
      const c = and(or(ref("A"), ref("B")), or(ref("C"), ref("D")));
      expect(names(branchConditionDNF(c))).toEqual([
        ["A", "C"],
        ["A", "D"],
        ["B", "C"],
        ["B", "D"],
      ]);
    });
    it("duplicates are preserved (identity, not deduped)", () => {
      expect(names(branchConditionDNF(and(ref("A"), ref("A"))))).toEqual([["A", "A"]]);
      expect(names(branchConditionDNF(or(ref("A"), ref("A"))))).toEqual([["A"], ["A"]]);
    });
  });

  describe("branchConditionArmCount — saturating, no materialization (#224 i.3)", () => {
    it("counts without saturating below the cap", () => {
      expect(branchConditionArmCount(ref("A"))).toBe(1);
      expect(branchConditionArmCount(and(ref("A"), ref("B")))).toBe(1);
      expect(branchConditionArmCount(or(ref("A"), ref("B")))).toBe(2);
      // (A or B) and (C or D) = 4
      expect(
        branchConditionArmCount(and(or(ref("A"), ref("B")), or(ref("C"), ref("D")))),
      ).toBe(4);
    });
    it("saturates at cap+1 for a pathological and-of-ors (never materializes 2^N)", () => {
      // five binary ORs producted = 2^5 = 32 arms; count saturates at 17 (default cap 16).
      const bigOr = (n: number) => or(ref(`${n}a`), ref(`${n}b`));
      const guard = and(bigOr(1), bigOr(2), bigOr(3), bigOr(4), bigOr(5));
      expect(branchConditionArmCount(guard)).toBe(17);
    });
    it("exactly at the cap is not saturated", () => {
      const bigOr = (n: number) => or(ref(`${n}a`), ref(`${n}b`));
      expect(branchConditionArmCount(and(bigOr(1), bigOr(2), bigOr(3), bigOr(4)))).toBe(16);
    });
  });
});

// ─────────────────────────────── #224 iii.2 — decision-guard negation ───────────────────────────────
describe("#224 iii.2 — `not` / negation-normal-form / signed-literal DNF", () => {
  describe("toNNF — De Morgan push-down + double-negation cancel + not-free identity", () => {
    it("not-free tree returns BY IDENTITY (byte-stable — positive goldens never drift)", () => {
      const c = and(or(ref("A"), ref("B")), ref("C"));
      expect(toNNF(c)).toBe(c); // same object reference
      expect(containsNot(c)).toBe(false);
    });
    it("`not (A or B)` → `not A and not B` (De Morgan)", () => {
      expect(dnfSigned(not(or(ref("A"), ref("B"))))).toEqual([["-A", "-B"]]);
    });
    it("`not (A and B)` → `not A or not B` (two arms)", () => {
      expect(dnfSigned(not(and(ref("A"), ref("B"))))).toEqual([["-A"], ["-B"]]);
    });
    it("`not not A` cancels to `A` (positive literal)", () => {
      expect(dnfSigned(not(not(ref("A"))))).toEqual([["+A"]]);
    });
    it("idempotent — NNF of an NNF tree is structurally itself", () => {
      const once = toNNF(not(or(ref("A"), ref("B"))));
      expect(dnfSigned(once)).toEqual(dnfSigned(toNNF(once)));
    });
  });

  describe("branchConditionDNF — signed literals; positive output byte-identical", () => {
    it("positive-only guard yields ONLY positive-ref atoms, same ref identity + order", () => {
      const c = and(or(ref("A"), ref("B")), ref("C"));
      const arms = branchConditionDNF(c);
      // every atom is a plain ref (no Not literal); order preserved.
      expect(arms.map((arm) => arm.map((a) => (a.type === "BranchConditionRef" ? a.ref : "!")))).toEqual([
        ["A", "C"],
        ["B", "C"],
      ]);
    });
    it("`A and not B` → one arm `[+A, -B]`", () => {
      expect(dnfSigned(and(ref("A"), not(ref("B"))))).toEqual([["+A", "-B"]]);
    });
    it("`(A or B) and not C` → `[[+A,-C],[+B,-C]]`", () => {
      expect(dnfSigned(and(or(ref("A"), ref("B")), not(ref("C"))))).toEqual([
        ["+A", "-C"],
        ["+B", "-C"],
      ]);
    });
    it("a Not literal wraps EXACTLY a ref (single-atom boundary — no compound CQL boolean)", () => {
      for (const arm of branchConditionDNF(not(and(ref("A"), or(ref("B"), ref("C")))))) {
        for (const atom of arm) {
          if (atom.type === "BranchConditionNot") expect(atom.operand.type).toBe("BranchConditionRef");
        }
      }
    });
  });

  describe("branchConditionArmCount — computed on the NNF; parity with DNF.length", () => {
    it("De Morgan RAISES the count: `not(A and B)` = 2 arms", () => {
      expect(branchConditionArmCount(not(and(ref("A"), ref("B"))))).toBe(2);
    });
    // Parity contract: armCount(c, bigCap) === branchConditionDNF(c).length across negation fixtures.
    const fixtures: Record<string, BranchCondition> = {
      "not A": not(ref("A")),
      "A and not B": and(ref("A"), not(ref("B"))),
      "not (A or B)": not(or(ref("A"), ref("B"))),
      "not (A and B)": not(and(ref("A"), ref("B"))),
      "(A or B) and not C": and(or(ref("A"), ref("B")), not(ref("C"))),
      "not not A": not(not(ref("A"))),
      "not (A and (B or C))": not(and(ref("A"), or(ref("B"), ref("C")))),
    };
    for (const [label, c] of Object.entries(fixtures)) {
      it(`parity: ${label}`, () => {
        expect(branchConditionArmCount(c, 1024)).toBe(branchConditionDNF(c).length);
      });
    }
  });

  describe("branchConditionRefs — collects THROUGH `not` (polarity-agnostic)", () => {
    it("`A and not B` → refs [A, B] (the negated ref is still a concept ref)", () => {
      expect(branchConditionRefs(and(ref("A"), not(ref("B")))).map((r) => r.ref)).toEqual(["A", "B"]);
    });
    it("`not (A or B)` → refs [A, B]", () => {
      expect(branchConditionRefs(not(or(ref("A"), ref("B")))).map((r) => r.ref)).toEqual(["A", "B"]);
    });
    it("survives a `not` with a MISSING operand (malformed editor buffer) — no throw, no ref", () => {
      const malformed = { type: "BranchConditionNot", location: LOC } as unknown as BranchCondition;
      expect(branchConditionRefs(malformed)).toEqual([]);
      expect(branchConditionRefs(and(ref("A"), malformed)).map((r) => r.ref)).toEqual(["A"]);
    });
  });

  describe("describeBranchCondition — `not` binds tightest", () => {
    it("`not A` → bare; `not (A or B)` → parenthesized", () => {
      expect(describeBranchCondition(not(ref("A")), getRefName)).toBe("not A");
      expect(describeBranchCondition(not(or(ref("A"), ref("B"))), getRefName)).toBe("not (A or B)");
    });
    it("`A and not B` needs no parens around the not", () => {
      expect(describeBranchCondition(and(ref("A"), not(ref("B"))), getRefName)).toBe("A and not B");
    });
  });

  describe("assertWellFormedBranchCondition — `not` is a well-formed unary", () => {
    it("accepts `not A` and `A and not B`", () => {
      expect(() => assertWellFormedBranchCondition(not(ref("A")))).not.toThrow();
      expect(() => assertWellFormedBranchCondition(and(ref("A"), not(ref("B"))))).not.toThrow();
    });
    it("still throws on a malformed and/or NESTED under a not", () => {
      expect(() => assertWellFormedBranchCondition(not(and(ref("A"))))).toThrow(/>= 2 operands/);
    });
  });

  describe("soleRef — a `not` is never the sole-ref fast path", () => {
    it("`not A` → null (routes through DNF, not the single-ref emit path)", () => {
      expect(soleRef(not(ref("A")))).toBeNull();
    });
  });

  describe("collectNegations — outermost `not` nodes for the merge gate", () => {
    it("`A and not B` → one negation", () => {
      expect(collectNegations(and(ref("A"), not(ref("B"))))).toHaveLength(1);
    });
    it("`not A and not B` → two distinct negations", () => {
      expect(collectNegations(and(not(ref("A")), not(ref("B"))))).toHaveLength(2);
    });
    it("`not not A` → ONE (outermost only — does not descend into the negated operand)", () => {
      expect(collectNegations(not(not(ref("A"))))).toHaveLength(1);
    });
    it("no `not` → empty", () => {
      expect(collectNegations(and(ref("A"), ref("B")))).toEqual([]);
    });
  });

  describe("visitBranchCondition — the `not` callback fires (no silent drop)", () => {
    it("folds `A and not B` counting every ref through the not", () => {
      const count = visitBranchCondition<number>(and(ref("A"), not(ref("B"))), {
        ref: () => 1,
        criterionRef: () => 0,
        not: (_n, operand) => operand,
        and: (_n, ops) => ops.reduce((a, b) => a + b, 0),
        or: (_n, ops) => ops.reduce((a, b) => a + b, 0),
      });
      expect(count).toBe(2);
    });
  });

  // Distinct locations + a criterion-ref builder for the tripwire + marker/location tests.
  const L = (line: number): Location => ({ start: { line, column: 0 }, end: { line, column: 1 } });
  const cref = (name: string, loc: Location): BranchConditionCriterionRef => ({
    type: "BranchConditionCriterionRef",
    ref: name,
    location: loc,
  });
  const markedRef = (name: string, loc: Location, marker: SourcedFromCriterion): BranchCondition => ({
    type: "BranchConditionRef",
    ref: name,
    location: loc,
    sourcedFromCriterion: marker,
  });

  describe("toNNF — criterion tripwire (public contract, incl. the not-free fast path)", () => {
    it("throws on a ROOT criterion ref even with NO `not` in the tree", () => {
      expect(() => toNNF(cref("C", L(1)))).toThrow(/criterion/i);
    });
    it("throws on a NESTED criterion ref in a not-free tree", () => {
      expect(() => toNNF(and(ref("A"), cref("C", L(1))))).toThrow(/criterion/i);
    });
    it("throws on a criterion ref UNDER a `not`", () => {
      expect(() => toNNF(not(cref("C", L(1))))).toThrow(/criterion/i);
    });
  });

  describe("toNNF — marker + location transfer (the plan's normative rule)", () => {
    const M = (name: string): SourcedFromCriterion => ({ name, refLocation: L(9) });

    it("negated marked ref: marker HOISTS to the Not, the inner ref is UNMARKED (no duplication)", () => {
      // `not C` where C := "X" → expansion stamps C on the ref → NNF must move it to the Not.
      const out = toNNF(not(markedRef("X", L(2), M("C")))) as BranchConditionNot;
      expect(out.type).toBe("BranchConditionNot");
      expect(out.sourcedFromCriterion?.name).toBe("C"); // boundary root carries it
      expect(out.operand.type).toBe("BranchConditionRef");
      expect((out.operand as { sourcedFromCriterion?: unknown }).sourcedFromCriterion).toBeUndefined(); // NOT duplicated
    });

    it("negated literal LEAF takes the underlying REF's location", () => {
      const out = toNNF(not(ref("A"))) as BranchConditionNot;
      expect(out.operand.location).toBe(LOC); // the ref's own location (from the `ref` helper)
    });

    it("De Morgan flip TRANSFERS a marker from the negated compound to the replacement root", () => {
      // C := (A or B), used as `not C` → expansion marks the Or with C; NNF flips to And, marker moves.
      const markedOr: BranchCondition = {
        type: "BranchConditionOr",
        operands: [ref("A"), ref("B")],
        location: L(3),
        sourcedFromCriterion: M("C"),
      };
      const out = toNNF(not(markedOr));
      expect(out.type).toBe("BranchConditionAnd"); // De Morgan: not(A or B) → not A and not B
      expect(out.sourcedFromCriterion?.name).toBe("C"); // transferred to the And replacement root
    });

    it("double negation cancels and preserves the OUTER marker (outermost wins)", () => {
      const innerNot: BranchCondition = { type: "BranchConditionNot", operand: ref("A"), location: L(4) };
      const outer: BranchCondition = {
        type: "BranchConditionNot",
        operand: innerNot,
        location: L(5),
        sourcedFromCriterion: M("Outer"),
      };
      const out = toNNF(outer);
      expect(out.type).toBe("BranchConditionRef"); // not not A → A
      expect(out.sourcedFromCriterion?.name).toBe("Outer");
    });
  });

  describe("branchConditionConceptRefsStrict / …FollowingCriteria — collect THROUGH `not`", () => {
    it("strict: `A and not B` → [A, B] (never throws on a plain negated ref)", () => {
      expect(branchConditionConceptRefsStrict(and(ref("A"), not(ref("B"))), "test").map((r) => r.ref)).toEqual([
        "A",
        "B",
      ]);
    });
    it("following-criteria: `not <criterion>` follows into the body's refs", () => {
      const table = buildCriterionTable([
        { type: "Criterion", name: "C", condition: or(ref("P"), ref("Q")), location: L(1) } as Criterion,
      ]);
      const refs = branchConditionConceptRefsFollowingCriteria(not(cref("C", L(2))), table);
      expect(refs.map((r) => r.ref)).toEqual(["P", "Q"]);
    });
    it("following-criteria: a `not` INSIDE a criterion body is followed", () => {
      const table = buildCriterionTable([
        { type: "Criterion", name: "C", condition: not(ref("Hidden")), location: L(1) } as Criterion,
      ]);
      expect(branchConditionConceptRefsFollowingCriteria(cref("C", L(2)), table).map((r) => r.ref)).toEqual([
        "Hidden",
      ]);
    });
  });
});
