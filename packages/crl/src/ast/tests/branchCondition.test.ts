import { describe, it, expect } from "vitest";
import {
  assertWellFormedBranchCondition,
  branchConditionArmCount,
  branchConditionConceptRefsStrict,
  branchConditionDNF,
  branchConditionRefs,
  containsNot,
  describeBranchCondition,
  soleRef,
  toNNF,
  visitBranchCondition,
} from "../branchCondition";
import {
  getRefName,
  refDisplay,
  type BranchCondition,
  type BranchConditionCriterionRef,
  type BranchConditionLiteral,
  type BranchConditionNot,
  type Location,
  type ReferenceName,
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
  describe("toNNF — #236: a criterion ref is a signed literal (not a to-expand node)", () => {
    it("a ROOT criterion ref in a not-free tree passes through by IDENTITY (already NNF)", () => {
      const c = cref("C", L(1));
      expect(toNNF(c)).toBe(c);
    });
    it("a NESTED criterion ref in a not-free tree passes through by IDENTITY", () => {
      const t = and(ref("A"), cref("C", L(1)));
      expect(toNNF(t)).toBe(t);
    });
    it("`not <criterion>` normalizes to a negated-criterion literal (Not over a criterion ref)", () => {
      const r = toNNF(not(cref("C", L(1))));
      expect(r.type).toBe("BranchConditionNot");
      expect((r as { operand: BranchCondition }).operand.type).toBe("BranchConditionCriterionRef");
    });
    it("De Morgan over a COMPOUND containing a criterion: `not (A and Elig)` → `not A or not Elig`", () => {
      // The only path that manufactures a negated-criterion literal from a COMPOUND (the sole-`not`
      // case above comes straight from the source). The criterion operand must survive as a
      // `Not`-over-`BranchConditionCriterionRef`, NOT be flattened to a concept ref.
      const nnf = toNNF(not(and(ref("A"), cref("Elig", L(1)))));
      expect(nnf.type).toBe("BranchConditionOr");
      const ops = (nnf as { operands: BranchCondition[] }).operands;
      expect(ops[0]!.type).toBe("BranchConditionNot");
      expect((ops[0] as { operand: BranchCondition }).operand.type).toBe("BranchConditionRef");
      expect(ops[1]!.type).toBe("BranchConditionNot");
      expect((ops[1] as { operand: BranchCondition }).operand.type).toBe("BranchConditionCriterionRef");
    });
    it("DNF `A and not Elig` → ONE arm: a positive concept literal + a negated CRITERION literal", () => {
      const arms = branchConditionDNF(and(ref("A"), not(cref("Elig", L(1)))));
      expect(arms).toHaveLength(1); // a criterion negation contributes ONE arm, never its body's arms
      const arm = arms[0]!;
      expect(arm).toHaveLength(2);
      expect(arm[0]!.type).toBe("BranchConditionRef");
      expect((arm[0] as { ref: string }).ref).toBe("A");
      expect(arm[1]!.type).toBe("BranchConditionNot");
      expect((arm[1] as { operand: BranchCondition }).operand.type).toBe("BranchConditionCriterionRef");
    });
    it("armCount of `A and not Elig` = 1 (parity with DNF; the signed criterion literal is one atom)", () => {
      expect(branchConditionArmCount(and(ref("A"), not(cref("Elig", L(1)))), 1024)).toBe(1);
    });
  });

  describe("toNNF — location preservation", () => {
    it("negated literal LEAF takes the underlying REF's location", () => {
      const out = toNNF(not(ref("A"))) as BranchConditionNot;
      expect(out.operand.location).toBe(LOC); // the ref's own location (from the `ref` helper)
    });
  });

  describe("branchConditionConceptRefsStrict — collect THROUGH `not`", () => {
    it("strict: `A and not B` → [A, B] (never throws on a plain negated ref)", () => {
      expect(branchConditionConceptRefsStrict(and(ref("A"), not(ref("B"))), "test").map((r) => r.ref)).toEqual([
        "A",
        "B",
      ]);
    });
  });
});
