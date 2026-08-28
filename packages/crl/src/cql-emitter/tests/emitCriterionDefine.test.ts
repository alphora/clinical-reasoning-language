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
import { getRefName } from "../../ast/types";
import {
  emitTotalBooleanGuard,
  emitCriterionDefine,
  type QualifyLeaf,
} from "../emitCriterionDefine";

// #236/#274 step C — the dedicated boolean emitter for a `criterion` define (design §2d/§3 C).
// Pins: every leaf rendered BARE; `not` over the bare leaf; minimal correct parenthesisation for
// CQL precedence (`not` > `and` > `or`); concept vs criterion leaves routed to the qualifier by kind.
//
// REFACTOR:grounded (#189 null/pause) — these assertions were re-derived from the target model (strong
// Kleene guards), NOT from the emitter. A PASSING test asserting old doctrine is the most convincing
// stale copy in a refactor, so the mark matters more here than in source.
// ⚠ Leaves are BARE — never `Coalesce(<leaf>, false)`. A criterion is a GUARD, and a guard is where a
// pause must be able to happen: coalescing per operand makes an unanswered question read `false`, so
// `$apply` runs on to the next arm while the CRE pauses on the same case. Totality belongs at the
// reference site (the per-action `unless` carrier), not in the define body.

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
// kind routing (the real caller returns bare `"Name"` or `Lib."Name"` per layer). #189 Slice 0c —
// `QualifyLeaf` now receives the full `ReferenceName`; extract the name via `getRefName`.
const q: QualifyLeaf = (ref, kind) => {
  const name = getRefName(ref);
  return kind === "criterion" ? `Crit."${name}"` : `"${name}"`;
};

const emit = (c: BranchCondition): string => emitTotalBooleanGuard(c, q);

describe("emitTotalBooleanGuard — leaf rendering", () => {
  it("renders a positive concept leaf BARE — #189: a criterion is a guard, so null must propagate", () => {
    expect(emit(ref("A"))).toBe(`"A"`);
  });

  it("routes a criterion leaf to the qualifier by kind (define→define edge)", () => {
    expect(emit(cref("Elig"))).toBe(`Crit."Elig"`);
  });

  it("negates the bare leaf — `not null` stays null (strong Kleene)", () => {
    expect(emit(not(ref("A")))).toBe(`not "A"`);
  });
});

describe("emitTotalBooleanGuard — composition + precedence", () => {
  it("and of two leaves", () => {
    expect(emit(and(ref("A"), ref("B")))).toBe(`"A" and "B"`);
  });

  it("or of two leaves", () => {
    expect(emit(or(ref("A"), ref("B")))).toBe(`"A" or "B"`);
  });

  it("an `or` INSIDE an `and` is parenthesised (or binds looser)", () => {
    // (A or B) and C
    expect(emit(and(or(ref("A"), ref("B")), ref("C")))).toBe(
      `("A" or "B") and "C"`,
    );
  });

  it("an `and` INSIDE an `or` is NOT parenthesised (and binds tighter)", () => {
    // A or (B and C)  —  no parens needed
    expect(emit(or(ref("A"), and(ref("B"), ref("C"))))).toBe(
      `"A" or "B" and "C"`,
    );
  });

  it("`not` over a compound is parenthesised", () => {
    expect(emit(not(or(ref("A"), ref("B"))))).toBe(
      `not ("A" or "B")`,
    );
  });

  it("the #236 leaf-gate shape: covered AND (flagA OR flagB), with a criterion cover", () => {
    // `Crit."Cov" and ("flagA" or "flagB")`
    expect(emit(and(cref("Cov"), or(ref("flagA"), ref("flagB"))))).toBe(
      `Crit."Cov" and ("flagA" or "flagB")`,
    );
  });

  it("a router body: OR of three sub-criteria (each one define→define edge)", () => {
    expect(emit(or(cref("General"), cref("Powered"), cref("NonPowered")))).toBe(
      `Crit."General" or Crit."Powered" or Crit."NonPowered"`,
    );
  });
});

describe("emitCriterionDefine — full statement", () => {
  it('wraps the body in a `define "<id>":` header, mirroring a concept define', () => {
    const cqlIdent = (name: string): string => `"${name}"`;
    expect(
      emitCriterionDefine("Accessory", or(cref("General"), cref("Powered")), q, cqlIdent),
    ).toBe(
      `define "Accessory":\n  Crit."General" or Crit."Powered"`,
    );
  });
});
