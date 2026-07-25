import { describe, it, expect } from "vitest";

import {
  expandCriteria,
  expandedSize,
  containsCriterionRef,
  buildCriterionTable,
  CriterionExpansionError,
  CRITERION_EXPANSION_ATOM_CAP,
  CRITERION_MAX_DEPTH,
  type CriterionTable,
} from "../criterionExpansion";
import { branchConditionArmCount, branchConditionDNF, soleRef } from "../branchCondition";
import type {
  BranchCondition,
  BranchConditionAnd,
  BranchConditionCriterionRef,
  BranchConditionOr,
  BranchConditionRef,
  Criterion,
  Location,
} from "../types";

// #224 ii.1b — the pure criterion EXPANSION engine: expandCriteria + the atoms/depth
// envelope. Cases pinned by the design panel (disc 302): the no-criterion fast-path
// (identity, no envelope), boundary-root marker (incl. outermost-wins alias collapse),
// no-aliasing, idempotence/determinism, the sole-ref collapse, and the envelope battery
// (atom-cap 1024/1025, depth-cap 32/33, cycle, undefined — all WITHOUT stack overflow).

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

describe("containsCriterionRef", () => {
  it("is true iff a criterion ref appears anywhere", () => {
    expect(containsCriterionRef(ref("A"))).toBe(false);
    expect(containsCriterionRef(and(ref("A"), ref("B")))).toBe(false);
    expect(containsCriterionRef(and(ref("A"), cref("X")))).toBe(true);
    expect(containsCriterionRef(or(ref("A"), and(ref("B"), cref("X"))))).toBe(true);
  });
});

describe("expandCriteria — fast path (no criterion ref)", () => {
  it("returns the EXACT input object (identity) even with unrelated criteria in the table", () => {
    const g = and(ref("A"), or(ref("B"), ref("C")));
    const t = table(crit("Unused", and(ref("A"), ref("B"))));
    expect(expandCriteria(g, t)).toBe(g); // referential identity — no rebuild, no envelope
  });

  it("a no-criterion guard is NOT subject to the atom envelope (a 2000-atom inline guard passes)", () => {
    const big = and(...Array.from({ length: 2000 }, (_, i) => ref(`A${i}`)));
    // no criterion ref → identity, no refusal, even though 2000 > the atom cap.
    expect(expandCriteria(big, new Map())).toBe(big);
  });
});

describe("expandCriteria — substitution + boundary marker", () => {
  it("a bare-concept-ref body expands to a fresh Ref carrying the boundary marker", () => {
    const t = table(crit("Eligible", ref("Age Qualifies")));
    const out = expandCriteria(cref("Eligible", L(7)), t);
    expect(out.type).toBe("BranchConditionRef");
    expect((out as BranchConditionRef).ref).toBe("Age Qualifies");
    expect(out.sourcedFromCriterion).toEqual({ name: "Eligible", refLocation: L(7) });
  });

  it("expands into a compound body and stamps the boundary-root only", () => {
    const t = table(crit("Eligible", and(ref("A"), ref("B"))));
    const out = expandCriteria(cref("Eligible"), t);
    expect(out.type).toBe("BranchConditionAnd");
    expect(out.sourcedFromCriterion?.name).toBe("Eligible");
    // the operands (inner nodes) carry NO marker
    expect((out as BranchConditionAnd).operands.every((o) => o.sourcedFromCriterion === undefined)).toBe(true);
  });

  it("two uses of one criterion produce disjoint node identities, each with its own refLocation", () => {
    const t = table(crit("X", and(ref("A"), ref("B"))));
    const g = and(cref("X", L(3)), cref("X", L(9)));
    const out = expandCriteria(g, t) as BranchConditionAnd;
    const [u0, u1] = out.operands;
    expect(u0).not.toBe(u1); // distinct objects
    expect(u0.sourcedFromCriterion?.refLocation).toEqual(L(3));
    expect(u1.sourcedFromCriterion?.refLocation).toEqual(L(9));
    // deeply disjoint: the inner operand nodes are not shared either
    expect((u0 as BranchConditionAnd).operands[0]).not.toBe((u1 as BranchConditionAnd).operands[0]);
  });

  it("nested NON-coincident boundaries keep BOTH markers", () => {
    // X: when (Y and A); Y: when (B)  → and[X]( B[Y], A )
    const t = table(crit("X", and(cref("Y"), ref("A"))), crit("Y", ref("B")));
    const out = expandCriteria(cref("X"), t) as BranchConditionAnd;
    expect(out.sourcedFromCriterion?.name).toBe("X");
    const [yNode, aNode] = out.operands;
    expect(yNode.type).toBe("BranchConditionRef");
    expect((yNode as BranchConditionRef).ref).toBe("B");
    expect(yNode.sourcedFromCriterion?.name).toBe("Y"); // inner boundary survives (deeper node)
    expect(aNode.sourcedFromCriterion).toBeUndefined();
  });

  it("coincident boundaries (a bare alias chain) collapse to the OUTERMOST criterion", () => {
    // X: when (Y); Y: when (A)  → the two boundary-roots are the SAME node → outer X wins
    const t = table(crit("X", cref("Y")), crit("Y", ref("A")));
    const out = expandCriteria(cref("X"), t);
    expect(out.type).toBe("BranchConditionRef");
    expect((out as BranchConditionRef).ref).toBe("A");
    expect(out.sourcedFromCriterion?.name).toBe("X"); // outermost, not "Y"
  });
});

describe("expandCriteria — idempotence + determinism", () => {
  it("expanding an already-expanded guard is a no-op (identity — no criterion refs remain)", () => {
    const t = table(crit("X", and(ref("A"), ref("B"))));
    const once = expandCriteria(cref("X"), t);
    expect(expandCriteria(once, t)).toBe(once); // fast path — same object
  });

  it("is structurally byte-stable but returns fresh node objects each call", () => {
    const t = table(crit("X", and(ref("A"), ref("B"))));
    const a = expandCriteria(cref("X"), t);
    const b = expandCriteria(cref("X"), t);
    expect(a).toEqual(b); // structurally equal
    expect(a).not.toBe(b); // but distinct identities
  });

  it("criterion-table insertion order does not affect the output", () => {
    const g = and(cref("X"), cref("Y"));
    const t1 = table(crit("X", ref("A")), crit("Y", ref("B")));
    const t2 = table(crit("Y", ref("B")), crit("X", ref("A")));
    expect(expandCriteria(g, t1)).toEqual(expandCriteria(g, t2));
  });
});

describe("expandCriteria — sole-ref collapse (ii.2 parity anchor)", () => {
  it("a lone criterion ref whose body is one concept ref → a bare Ref that soleRef returns", () => {
    const t = table(crit("Eligible", ref("Age Qualifies")));
    const out = expandCriteria(cref("Eligible"), t);
    const sole = soleRef(out);
    expect(sole).not.toBeNull();
    expect(sole!.ref).toBe("Age Qualifies");
  });
});

describe("expandedSize + expandCriteria — the atom envelope", () => {
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

describe("expandCriteria — hard backstop throws (pre-check bypassed)", () => {
  it("throws CriterionExpansionError(cycle) on a cyclic table", () => {
    const t = table(crit("A", cref("B")), crit("B", cref("A")));
    try {
      expandCriteria(cref("A"), t);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CriterionExpansionError);
      expect((e as CriterionExpansionError).reason).toBe("cycle");
    }
  });

  it("throws CriterionExpansionError(undefined-criterion) on a missing table entry", () => {
    try {
      expandCriteria(cref("Ghost"), new Map());
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CriterionExpansionError);
      expect((e as CriterionExpansionError).reason).toBe("undefined-criterion");
    }
  });

  it("throws CriterionExpansionError(atom-cap) on the over-cap doubling table", () => {
    const cs: Criterion[] = [crit("C0", ref("A"))];
    for (let k = 1; k <= 11; k++) cs.push(crit(`C${k}`, and(cref(`C${k - 1}`), cref(`C${k - 1}`))));
    expect(() => expandCriteria(cref("C11"), table(...cs))).toThrow(CriterionExpansionError);
  });
});

describe("expandedSize — envelope-bypass folded in (criterion-free guards)", () => {
  it("a criterion-free over-cap inline guard is OK via expandedSize (not just via the fast path)", () => {
    const big = and(...Array.from({ length: 2000 }, (_, i) => ref(`A${i}`)));
    const s = expandedSize(big, new Map());
    expect(s.status).toBe("ok"); // must NOT report atom-cap — no expansion, no envelope
  });

  it("a mixed inline+criterion guard IS subject to the envelope (total materialized atoms)", () => {
    // 2000 inline atoms AND a 2-atom criterion → 2002 materialized → refused. Deliberate
    // cliff: touching a criterion subjects the whole materialized tree to the cap.
    const t = table(crit("Small", and(ref("P"), ref("Q"))));
    const mixed = and(...Array.from({ length: 2000 }, (_, i) => ref(`A${i}`)), cref("Small"));
    expect(expandedSize(mixed, t).status).toBe("atom-cap");
  });
});

describe("expandCriteria — through-materialization boundary (pre-check pass ⇒ engine never throws)", () => {
  const nAtoms = (n: number): Criterion =>
    crit("Cn", and(...Array.from({ length: n }, (_, i) => ref(`A${i}`))));

  const leaves = (c: BranchCondition, acc: BranchConditionRef[] = []): BranchConditionRef[] => {
    if (c.type === "BranchConditionRef") acc.push(c);
    else if (c.type === "BranchConditionAnd" || c.type === "BranchConditionOr")
      c.operands.forEach((o) => leaves(o, acc));
    return acc;
  };

  it("exactly CAP atoms: expandedSize ok AND expandCriteria materializes without throwing", () => {
    const t = table(nAtoms(CRITERION_EXPANSION_ATOM_CAP));
    expect(expandedSize(cref("Cn"), t).status).toBe("ok");
    const out = expandCriteria(cref("Cn"), t);
    expect(leaves(out)).toHaveLength(CRITERION_EXPANSION_ATOM_CAP);
  });

  it("exactly MAX depth: expandedSize ok AND expandCriteria materializes without throwing", () => {
    const cs: Criterion[] = [crit("C1", ref("A"))];
    for (let i = 2; i <= CRITERION_MAX_DEPTH; i++) cs.push(crit(`C${i}`, cref(`C${i - 1}`)));
    const t = table(...cs);
    expect(expandedSize(cref(`C${CRITERION_MAX_DEPTH}`), t).status).toBe("ok");
    expect(() => expandCriteria(cref(`C${CRITERION_MAX_DEPTH}`), t)).not.toThrow();
  });

  it("the C10 doubling case materializes to 1024 DISJOINT leaves (memo sizes, materialize rebuilds)", () => {
    const cs: Criterion[] = [crit("C0", ref("A"))];
    for (let k = 1; k <= 10; k++) cs.push(crit(`C${k}`, and(cref(`C${k - 1}`), cref(`C${k - 1}`))));
    const out = expandCriteria(cref("C10"), table(...cs));
    const ls = leaves(out);
    expect(ls).toHaveLength(1024);
    expect(new Set(ls).size).toBe(1024); // every leaf is a distinct object (no aliasing)
  });

  it("depth-cap via the ARITHMETIC (memo-hit) branch throws reason depth-cap", () => {
    // Memoize a depth-32 chain via the first operand, then compose one level deeper via a
    // memo hit (shallow physical stack) — the arithmetic `criterionDepth+1 > MAX` branch.
    const cs: Criterion[] = [crit("C1", ref("A"))];
    for (let i = 2; i <= CRITERION_MAX_DEPTH; i++) cs.push(crit(`C${i}`, cref(`C${i - 1}`)));
    cs.push(crit("W", cref(`C${CRITERION_MAX_DEPTH}`))); // depth 33
    const t = table(...cs);
    const guard = and(cref(`C${CRITERION_MAX_DEPTH}`), cref("W")); // C32 memoized first
    expect(expandedSize(guard, t).status).toBe("depth-cap");
    try {
      expandCriteria(guard, t);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CriterionExpansionError);
      expect((e as CriterionExpansionError).reason).toBe("depth-cap");
    }
  });
});

describe("expandCriteria — preserves a pre-existing marker on partial re-expansion", () => {
  it("re-expanding a guard that mixes an already-marked subtree with an un-expanded ref keeps both markers", () => {
    const preX = expandCriteria(cref("Xc"), table(crit("Xc", ref("A")))); // Ref A, marker Xc
    expect(preX.sourcedFromCriterion?.name).toBe("Xc");
    const guard = and(preX, cref("Y"));
    const out = expandCriteria(guard, table(crit("Y", ref("B")))) as BranchConditionAnd;
    expect(out.operands[0].sourcedFromCriterion?.name).toBe("Xc"); // preserved across rebuild
    expect(out.operands[1].sourcedFromCriterion?.name).toBe("Y");
  });
});

describe("expandCriteria — the expanded tree is a clean guard for downstream helpers", () => {
  it("the expanded output has NO criterion refs, so armCount/DNF work without throwing", () => {
    const t = table(crit("X", or(ref("A"), ref("B"))));
    const g = and(cref("X"), ref("C")); // (A or B) and C  →  2 arms
    const out = expandCriteria(g, t);
    expect(containsCriterionRef(out)).toBe(false);
    expect(branchConditionArmCount(out)).toBe(2);
    expect(branchConditionDNF(out)).toHaveLength(2);
  });

  it("buildCriterionTable collects criteria (first-write-wins) from a statement list", () => {
    const c1 = crit("X", ref("A"));
    const c2 = crit("X", ref("B"));
    const built = buildCriterionTable([c1, c2, crit("Y", ref("C"))]);
    expect(built.get("X")).toBe(c1); // first wins
    expect(built.has("Y")).toBe(true);
    expect(built.size).toBe(2);
  });
});
