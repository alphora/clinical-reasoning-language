import { describe, it, expect } from "vitest";

import type {
  BranchCondition,
  BranchConditionAnd,
  BranchConditionCriterionRef,
  BranchConditionNot,
  BranchConditionOr,
  BranchConditionRef,
  Location,
} from "../../ast/types";
import {
  emitTotalBooleanGuard,
  emitCriterionDefine,
  type QualifyLeaf,
} from "../emitCriterionDefine";

// #236/#274 step C — the dedicated total-boolean emitter for a `criterion` define (design
// §2d/§3 C). Pins: EVERY leaf totalized `Coalesce(<leaf>, false)` (positive included);
// `not` over the totalized leaf; minimal correct parenthesisation for CQL precedence
// (`not` > `and` > `or`); concept vs criterion leaves routed to the qualifier by kind.

const L = (line = 1): Location => ({ start: { line, column: 0 }, end: { line, column: 1 } });
const ref = (name: string): BranchConditionRef => ({
  type: "BranchConditionRef",
  ref: name,
  location: L(),
});
const cref = (name: string): BranchConditionCriterionRef => ({
  type: "BranchConditionCriterionRef",
  ref: name,
  location: L(),
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

// A qualifier that quotes concept names and PREFIXES criterion names, so tests can see the
// kind routing (the real caller returns bare `"Name"` or `Lib."Name"` per layer).
const q: QualifyLeaf = (name, kind) => (kind === "criterion" ? `Crit."${name}"` : `"${name}"`);

const emit = (c: BranchCondition): string => emitTotalBooleanGuard(c, q);

describe("emitTotalBooleanGuard — totality", () => {
  it("totalizes a positive concept leaf (Coalesce applied to positives too)", () => {
    expect(emit(ref("A"))).toBe(`Coalesce("A", false)`);
  });

  it("routes a criterion leaf to the qualifier by kind (define→define edge)", () => {
    expect(emit(cref("Elig"))).toBe(`Coalesce(Crit."Elig", false)`);
  });

  it("negates the totalized leaf, not the raw ref", () => {
    expect(emit(not(ref("A")))).toBe(`not Coalesce("A", false)`);
  });
});

describe("emitTotalBooleanGuard — composition + precedence", () => {
  it("and of two leaves", () => {
    expect(emit(and(ref("A"), ref("B")))).toBe(`Coalesce("A", false) and Coalesce("B", false)`);
  });

  it("or of two leaves", () => {
    expect(emit(or(ref("A"), ref("B")))).toBe(`Coalesce("A", false) or Coalesce("B", false)`);
  });

  it("an `or` INSIDE an `and` is parenthesised (or binds looser)", () => {
    // (A or B) and C
    expect(emit(and(or(ref("A"), ref("B")), ref("C")))).toBe(
      `(Coalesce("A", false) or Coalesce("B", false)) and Coalesce("C", false)`,
    );
  });

  it("an `and` INSIDE an `or` is NOT parenthesised (and binds tighter)", () => {
    // A or (B and C)  —  no parens needed
    expect(emit(or(ref("A"), and(ref("B"), ref("C"))))).toBe(
      `Coalesce("A", false) or Coalesce("B", false) and Coalesce("C", false)`,
    );
  });

  it("`not` over a compound is parenthesised", () => {
    expect(emit(not(or(ref("A"), ref("B"))))).toBe(
      `not (Coalesce("A", false) or Coalesce("B", false))`,
    );
  });

  it("the #236 leaf-gate shape: covered AND (flagA OR flagB), with a criterion cover", () => {
    // `Coalesce(Crit."Cov", false) and (Coalesce("flagA", false) or Coalesce("flagB", false))`
    expect(emit(and(cref("Cov"), or(ref("flagA"), ref("flagB"))))).toBe(
      `Coalesce(Crit."Cov", false) and (Coalesce("flagA", false) or Coalesce("flagB", false))`,
    );
  });

  it("a router body: OR of three sub-criteria (each one define→define edge)", () => {
    expect(emit(or(cref("General"), cref("Powered"), cref("NonPowered")))).toBe(
      `Coalesce(Crit."General", false) or Coalesce(Crit."Powered", false) or Coalesce(Crit."NonPowered", false)`,
    );
  });
});

describe("emitCriterionDefine — full statement", () => {
  it('wraps the body in a `define "<id>":` header, mirroring a concept define', () => {
    const cqlIdent = (name: string): string => `"${name}"`;
    expect(
      emitCriterionDefine("Accessory", or(cref("General"), cref("Powered")), q, cqlIdent),
    ).toBe(
      `define "Accessory":\n  Coalesce(Crit."General", false) or Coalesce(Crit."Powered", false)`,
    );
  });
});
