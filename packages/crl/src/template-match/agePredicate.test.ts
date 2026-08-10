import { describe, expect, it } from "vitest";

import type { Location } from "../ast/types";

import { ageComputeFnForUnit, isSanctionedAgeUnit, sanctionedAgeTodayOp } from "./agePredicate";
import type { CanonicalPatternCall, NestedPatternArg, QuantityArg } from "./canonicalTypes";

// #257 T2 — the SHARED age-today classifier and its unit→compute-fn table. The matcher only ever
// produces a matched (fn, unit) pair, so the cross-check reject below is defense-in-depth: this
// classifier is the single gate the validator + both lowering lanes consult, so making it reject a
// mismatch closes the #215 miscompile hole STRUCTURALLY even for a call some future path builds by
// hand.

const L: Location = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } };
const noArg = (pattern: string): NestedPatternArg => ({
  type: "NestedPatternArg",
  pattern: { type: "CanonicalPatternCall", pattern, args: [], known: true, location: L },
  location: L,
});
const q = (value: number, unit: string): QuantityArg => ({ type: "QuantityArg", value, unit, location: L });
const call = (op: string, a0: NestedPatternArg, a1: QuantityArg): CanonicalPatternCall => ({
  type: "CanonicalPatternCall",
  pattern: op,
  args: [a0, a1],
  known: true,
  location: L,
});

describe("agePredicate — unit→compute-fn table (#257 T2)", () => {
  it("maps years→AgeAt, months→AgeInMonths (plural AND singular), else null; isSanctionedAgeUnit agrees", () => {
    expect(ageComputeFnForUnit("year")).toBe("AgeAt");
    expect(ageComputeFnForUnit("years")).toBe("AgeAt");
    expect(ageComputeFnForUnit("month")).toBe("AgeInMonths");
    expect(ageComputeFnForUnit("months")).toBe("AgeInMonths");
    expect(ageComputeFnForUnit("days")).toBeNull();
    expect(ageComputeFnForUnit("week")).toBeNull();
    expect(isSanctionedAgeUnit("months")).toBe(true);
    expect(isSanctionedAgeUnit("days")).toBe(false);
  });
});

describe("sanctionedAgeTodayOp — classifier + unit/compute-fn cross-check (#257 T2, gpt56 #1)", () => {
  it("accepts a matched pair, returning {op, computeFn} read off the call", () => {
    expect(sanctionedAgeTodayOp(call("AtLeast", noArg("AgeAt"), q(18, "years")))).toEqual({
      op: "AtLeast",
      computeFn: "AgeAt",
    });
    expect(sanctionedAgeTodayOp(call("Below", noArg("AgeInMonths"), q(6, "months")))).toEqual({
      op: "Below",
      computeFn: "AgeInMonths",
    });
  });

  it("REJECTS an inconsistent fn/unit pair — BOTH directions (the matcher never produces these)", () => {
    // years fn + months threshold: would miscompile to `ageYears >= 6` through the unit-blind overload.
    expect(sanctionedAgeTodayOp(call("AtLeast", noArg("AgeAt"), q(6, "months")))).toBeNull();
    // months fn + years threshold: the mirror miscompile.
    expect(sanctionedAgeTodayOp(call("Below", noArg("AgeInMonths"), q(18, "years")))).toBeNull();
  });

  it("REJECTS a non-age nested fn, a with-arg AgeAt (anchored), and an unsanctioned unit", () => {
    expect(sanctionedAgeTodayOp(call("AtLeast", noArg("Foo"), q(18, "years")))).toBeNull();
    // anchored `AgeAt(StartOf(…))` has a 1-arg AgeAt at arg[0] → not age-today (sanctionedAgeAnchoredOp owns it).
    const anchored: NestedPatternArg = {
      type: "NestedPatternArg",
      pattern: { type: "CanonicalPatternCall", pattern: "AgeAt", args: [noArg("StartOf")], known: true, location: L },
      location: L,
    };
    expect(sanctionedAgeTodayOp(call("AtLeast", anchored, q(18, "years")))).toBeNull();
    // days is not a sanctioned age unit even after T2.
    expect(sanctionedAgeTodayOp(call("AtLeast", noArg("AgeAt"), q(18, "days")))).toBeNull();
  });
});
