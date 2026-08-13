import { describe, it, expect } from "vitest";

import {
  expandedSize,
  containsCriterionRef,
  buildCriterionTable,
  CRITERION_EXPANSION_ATOM_CAP,
  CRITERION_MAX_DEPTH,
  type CriterionTable,
} from "../criterionExpansion";
import type {
  BranchCondition,
  BranchConditionAnd,
  BranchConditionCriterionRef,
  BranchConditionOr,
  BranchConditionRef,
  Criterion,
  Location,
  Statement,
} from "../types";

// #236 retired criterion inline-expansion. What survives here is the non-materializing size/breach
// envelope (`expandedSize`) used by the provenance guard-outline render as a decomposition bound,
// plus the `containsCriterionRef` fast-path predicate and the `buildCriterionTable` lookup. The
// envelope battery (atom-cap 1024/1025, depth-cap 32/33, cycle, undefined — all WITHOUT stack
// overflow) is the regression guard for that bound.

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
const crit = (name: string, condition: BranchCondition): Criterion => ({
  type: "Criterion",
  name,
  condition,
  location: L(),
});
const table = (...cs: Criterion[]): CriterionTable => new Map(cs.map((c) => [c.name, c]));

describe("buildCriterionTable", () => {
  it("indexes Criterion statements by name (first-write-wins; empty names skipped)", () => {
    const stmts: Statement[] = [
      crit("A", ref("x")),
      crit("B", ref("y")),
      crit("A", ref("z")), // duplicate name — first wins
      crit("", ref("w")), // empty name — skipped
    ];
    const t = buildCriterionTable(stmts);
    expect([...t.keys()].sort()).toEqual(["A", "B"]);
    expect(t.get("A")!.condition).toEqual(ref("x")); // first "A" wins
  });
});

describe("containsCriterionRef", () => {
  it("is true iff a criterion ref appears anywhere", () => {
    expect(containsCriterionRef(ref("A"))).toBe(false);
    expect(containsCriterionRef(and(ref("A"), ref("B")))).toBe(false);
    expect(containsCriterionRef(and(ref("A"), cref("X")))).toBe(true);
    expect(containsCriterionRef(or(ref("A"), and(ref("B"), cref("X"))))).toBe(true);
  });
});

describe("expandedSize — the atom envelope", () => {
  // A criterion whose body is an `and` of N concept refs → N atoms, depth 1.
  const nAtoms = (n: number): Criterion =>
    crit("Cn", and(...Array.from({ length: n }, (_, i) => ref(`A${i}`))));

  it("exactly CAP atoms is OK; CAP+1 is refused (atom-cap)", () => {
    const okT = table(nAtoms(CRITERION_EXPANSION_ATOM_CAP));
    const okSize = expandedSize(cref("Cn"), okT);
    expect(okSize.status).toBe("ok");
    expect(okSize.atoms).toBe(CRITERION_EXPANSION_ATOM_CAP);

    const overT = table(nAtoms(CRITERION_EXPANSION_ATOM_CAP + 1));
    expect(expandedSize(cref("Cn"), overT).status).toBe("atom-cap");
  });

  it("the doubling attack C_k := C_{k-1} and C_{k-1} is caught (and computed in O(k), not O(2^k))", () => {
    // C0 = A (1 atom); C_k body = (C_{k-1} and C_{k-1}) → 2^k atoms. 2^11 = 2048 > 1024.
    const cs: Criterion[] = [crit("C0", ref("A"))];
    for (let k = 1; k <= 11; k++) cs.push(crit(`C${k}`, and(cref(`C${k - 1}`), cref(`C${k - 1}`))));
    const t = table(...cs);
    expect(expandedSize(cref("C10"), t).atoms).toBe(1024); // 2^10 — ok
    expect(expandedSize(cref("C10"), t).status).toBe("ok");
    expect(expandedSize(cref("C11"), t).status).toBe("atom-cap"); // 2^11 — refused, no OOM
  });
});

describe("expandedSize — the depth envelope (no stack overflow)", () => {
  // A linear alias chain C_1 := A, C_i := C_{i-1}; guard = C_n → criterionDepth n, atoms 1.
  const chain = (n: number): CriterionTable => {
    const cs: Criterion[] = [crit("C1", ref("A"))];
    for (let i = 2; i <= n; i++) cs.push(crit(`C${i}`, cref(`C${i - 1}`)));
    return table(...cs);
  };

  it("depth exactly MAX is OK; MAX+1 is refused (depth-cap), atoms stay 1", () => {
    const okSize = expandedSize(cref(`C${CRITERION_MAX_DEPTH}`), chain(CRITERION_MAX_DEPTH));
    expect(okSize.status).toBe("ok");
    expect(okSize.criterionDepth).toBe(CRITERION_MAX_DEPTH);
    expect(okSize.atoms).toBe(1);

    const over = expandedSize(cref(`C${CRITERION_MAX_DEPTH + 1}`), chain(CRITERION_MAX_DEPTH + 1));
    expect(over.status).toBe("depth-cap");
  });

  it("a pathologically deep chain bails during descent (no RangeError)", () => {
    const deep = chain(5000);
    expect(() => expandedSize(cref("C5000"), deep)).not.toThrow();
    expect(expandedSize(cref("C5000"), deep).status).toBe("depth-cap");
  });
});

describe("expandedSize — cycle + undefined", () => {
  it("a self-referential criterion → status cycle (no infinite loop)", () => {
    const t = table(crit("Loop", and(cref("Loop"), ref("A"))));
    const s = expandedSize(cref("Loop"), t);
    expect(s.status).toBe("cycle");
    expect(s.detail?.name).toBe("Loop");
  });

  it("a mutual A→B→A cycle → status cycle with a chain", () => {
    const t = table(crit("A", cref("B")), crit("B", cref("A")));
    const s = expandedSize(cref("A"), t);
    expect(s.status).toBe("cycle");
    expect(s.detail?.chain).toBeTruthy();
  });

  it("a ref to a name absent from the table → status undefined-criterion", () => {
    const s = expandedSize(cref("Ghost"), new Map());
    expect(s.status).toBe("undefined-criterion");
    expect(s.detail?.name).toBe("Ghost");
  });
});

describe("expandedSize — envelope-bypass folded in (criterion-free guards)", () => {
  it("a criterion-free over-cap inline guard is OK (not just via a fast path)", () => {
    const big = and(...Array.from({ length: 2000 }, (_, i) => ref(`A${i}`)));
    const s = expandedSize(big, new Map());
    expect(s.status).toBe("ok"); // must NOT report atom-cap — no expansion, no envelope
  });

  it("a mixed inline+criterion guard IS subject to the envelope (total atoms)", () => {
    // 2000 inline atoms AND a 2-atom criterion → 2002 → refused. Deliberate cliff: touching a
    // criterion subjects the whole tree to the cap.
    const t = table(crit("Small", and(ref("P"), ref("Q"))));
    const mixed = and(...Array.from({ length: 2000 }, (_, i) => ref(`A${i}`)), cref("Small"));
    expect(expandedSize(mixed, t).status).toBe("atom-cap");
  });
});
