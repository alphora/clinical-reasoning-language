import { describe, it, expect } from "vitest";
import {
  assertWellFormedBranchCondition,
  branchConditionRefs,
  describeBranchCondition,
  soleRef,
  visitBranchCondition,
} from "../branchCondition";
import { getRefName, refDisplay, type BranchCondition, type ReferenceName } from "../types";

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
});
