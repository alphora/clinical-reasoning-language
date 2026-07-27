import { describe, it, expect } from "vitest";

import { parseInput } from "../../ast/tests/parseInput";
import { classifyCriterionRefs } from "../../ast/criterionClassify";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";

import { runCel, __evalBranchConditionForTest } from "../run";
import { renderScenario, __zipConditionTraceForTest, unsatisfiedFrontier, frontierTooltip } from "../viewModel";
import type { BranchConditionView } from "../viewModel";
import type { BranchCondition } from "../../ast/types";
import { allUnsatisfiedCriteria, type FcScenario } from "../../provenance/failedCriteria";

const LOC = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } as const;
const critRef = (ref: string): BranchCondition => ({ type: "BranchConditionCriterionRef", ref, location: LOC });

// #224 ii.1c — the EVAL + RENDER wiring for a `criterion` guard. A `when` that references a
// criterion must expand to the criterion's body BEFORE the CRE evaluates it (S1) and BEFORE
// the view-model zips the trace (S3) — so the criterion version is behaviorally IDENTICAL to
// the hand-inlined guard, and the render never degrades to an unevaluated leaf (disc 303 Q3:
// both sides expand from the same table source). `parseInput` does NOT classify, so the test
// graph runs `classifyCriterionRefs` (as `buildCRL` does) to produce the tripwire node.

function graphFrom(crlSrc: string, celSrc: string): ResolvedCelGraph {
  const crl = classifyCriterionRefs(parseInput(crlSrc));
  const built = buildCEL(celSrc);
  if (!built.success || !built.result) {
    throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  }
  const coversTarget: RegistryEntry = {
    name: crl.library.name,
    filePath: "inline.crl",
    ast: crl,
    isRoot: true,
    origin: "root",
  };
  return { filePath: "inline.cel", cel: built.result, coversTarget, celParseErrors: [], diagnostics: [] };
}

const ACTIVITIES = `activity "Approve":
- request CPGServiceRequest.
- with \`ok\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.`;

const LEAVES = `concept "Leaf A":
- type is Observation.
- code is \`leaf-a\`.
concept "Leaf B":
- type is Observation.
- code is \`leaf-b\`.`;

// Two GuardLib flavors that must behave IDENTICALLY: one factors the guard through a
// `criterion`, the other inlines `Leaf A and Leaf B` directly.
const VIA_CRITERION = `library "GuardLib".
${LEAVES}
${ACTIVITIES}
criterion "Eligible":
- when ( "Leaf A" and "Leaf B" ).
decision "D":
first:
- when "Eligible" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;

const HAND_INLINED = `library "GuardLib".
${LEAVES}
${ACTIVITIES}
decision "D":
first:
- when ( "Leaf A" and "Leaf B" ) then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;

const PATIENT = `fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".`;

const CASES = `library "Cases".
covers "GuardLib".
${PATIENT}
fact "fA":
- code is "http://e|leaf-a".
- date is "2026-01-01".
- defined by "GuardLib"."Leaf A".
fact "fB":
- code is "http://e|leaf-b".
- date is "2026-01-01".
- defined by "GuardLib"."Leaf B".
case "both":
- subject is "Pat".
- fact is "fA".
- fact is "fB".
- result is "D" is "Approve".
case "onlyA":
- subject is "Pat".
- fact is "fA".
- result is "D" is "Deny".`;

const statuses = (g: ResolvedCelGraph): string[] =>
  runCel(g).runs.map((r) => `${r.case}:${r.status}`).sort();

// A doubling-chain criterion C0..C10 (2^(k+1) atoms; C10 = 2048 > the 1024 cap), as CRL text.
function doublingChain(): string {
  const out = [`criterion "C0":\n- when ( "Leaf A" and "Leaf A" ).`];
  for (let k = 1; k <= 10; k++) out.push(`criterion "C${k}":\n- when ( "C${k - 1}" and "C${k - 1}" ).`);
  return out.join("\n");
}

describe("#224 ii.1c — criterion eval + render parity", () => {
  it("a `when` referencing a criterion evaluates identically to the hand-inlined guard", () => {
    const viaCriterion = statuses(graphFrom(VIA_CRITERION, CASES));
    const inlined = statuses(graphFrom(HAND_INLINED, CASES));
    // both facts → Approve (pass); onlyA → the guard fails → otherwise Deny (pass).
    expect(viaCriterion).toEqual(["both:pass", "onlyA:pass"]);
    expect(viaCriterion).toEqual(inlined);
  });

  it("renderScenario expands the same graph the trace was zipped against (no degradation)", () => {
    const viaCriterion = renderScenario(graphFrom(VIA_CRITERION, CASES));
    const inlined = renderScenario(graphFrom(HAND_INLINED, CASES));
    // Both-sides-expanded (disc 303 Q3): render succeeds with no error scenarios, exactly as
    // the inlined version — a half-missed seam would degrade the compound guard to an
    // unevaluated leaf and desync pass/fail.
    expect(viaCriterion.success).toBe(true);
    expect(viaCriterion.errorCount).toBe(0);
    expect(viaCriterion.scenarios.map((s) => `${s.case}:${s.status}`).sort()).toEqual(
      inlined.scenarios.map((s) => `${s.case}:${s.status}`).sort(),
    );
  });

  it("a criterion used TWICE expands to disjoint identical subtrees (design §7 pin)", () => {
    // Two `all:` branches both guarded by the SAME criterion → two independent expansions.
    const twiceCriterion = `library "GuardLib".
${LEAVES}
${ACTIVITIES}
criterion "Eligible":
- when ( "Leaf A" and "Leaf B" ).
decision "D":
all:
- when "Eligible" then recommend activity "Approve".
- when "Eligible" then recommend activity "Deny".`;
    const both = renderScenario(graphFrom(twiceCriterion, CASES)).scenarios.find((s) => s.case.name === "both")!;
    // The two branches are INDEPENDENT expansions of the one criterion; their guard-expression
    // trees (op / satisfied / operands / concept / facts) must be byte-identical — proving the
    // fresh-node rebuild produced disjoint-but-structurally-equal subtrees, deterministically.
    // #224 ii.3: each boundary-root now ALSO carries `sourcedFromCriterion: { name: "Eligible" }`
    // (name-replacement marker) — pinned positively here (both expansions carry the SAME name).
    const guardExpr = (i: number): unknown => (both.tree[i] as { condition: { expr: unknown } }).condition.expr;
    expect(guardExpr(0)).toEqual({
      op: "and",
      satisfied: true,
      sourcedFromCriterion: { name: "Eligible" },
      operands: [
        { op: "ref", satisfied: true, concept: { name: "Leaf A", libraryName: "GuardLib" }, facts: ["fA"] },
        { op: "ref", satisfied: true, concept: { name: "Leaf B", libraryName: "GuardLib" }, facts: ["fB"] },
      ],
    });
    expect(guardExpr(1)).toEqual(guardExpr(0));
  });

  it("a covered-decision guard breaching the GLOBAL envelope → status:\"error\" (eval non-ok)", () => {
    const overflow = `library "GuardLib".
${LEAVES}
${ACTIVITIES}
${doublingChain()}
decision "D":
first:
- when "C10" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
    const runs = runCel(graphFrom(overflow, CASES)).runs;
    // Every case targeting the over-cap decision errors (materialization refused), never a
    // silent pass/fail — and no uncaught throw out of runCel.
    expect(runs.every((r) => r.status === "error")).toBe(true);
    expect(runs.some((r) => r.diagnostics.some((d) => /criterion-expansion|envelope/.test(d)))).toBe(true);
  });

  it("the RENDER lane degrades with the eval status on an overflow doc (no throw — census row 5's overflow side)", () => {
    // Battery 3's render-lane overflow disposition (disc 305 Claude #5c): renderScenario over an
    // envelope-breaching covered decision must NOT throw the tripwire; it degrades WITH the eval
    // status (the case becomes an error scenario), consistent with runCel above.
    const overflow = `library "GuardLib".
${LEAVES}
${ACTIVITIES}
${doublingChain()}
decision "D":
first:
- when "C10" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
    const render = renderScenario(graphFrom(overflow, CASES));
    // No uncaught throw; every scenario carries the error status (degrades with eval, not silent).
    // Guard against vacuity: `.every` is trivially true on `[]`, and a graph-level empty render on
    // overflow IS a failure of "degrades per-case" — so pin the exact count (CASES = both + onlyA).
    expect(render.scenarios).toHaveLength(2);
    expect(render.scenarios.every((s) => s.status === "error")).toBe(true);
  });
});

describe("#224 ii.1c — criterion through a `use decision` sub-decision", () => {
  const DELEG_CASES = `library "Cases".
covers "GuardLib".
${PATIENT}
fact "fA":
- code is "http://e|leaf-a".
- date is "2026-01-01".
- defined by "GuardLib"."Leaf A".
fact "fB":
- code is "http://e|leaf-b".
- date is "2026-01-01".
- defined by "GuardLib"."Leaf B".
case "both":
- subject is "Pat".
- fact is "fA".
- fact is "fB".
- result is "Top" is "Approve".`;

  it("a sub-decision whose guard is a criterion evaluates correctly (wrapResolve OK path)", () => {
    const crl = `library "GuardLib".
${LEAVES}
${ACTIVITIES}
criterion "Eligible":
- when ( "Leaf A" and "Leaf B" ).
decision "Top":
first:
- when "Leaf A" then use decision "Sub".
- otherwise then recommend activity "Deny".
decision "Sub":
first:
- when "Eligible" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
    const runs = runCel(graphFrom(crl, DELEG_CASES)).runs;
    // Both facts present → Top delegates to Sub → Sub's criterion guard holds → Approve (pass).
    expect(runs.map((r) => `${r.case}:${r.status}`)).toEqual(["both:pass"]);
  });

  it("a sub-decision whose guard breaches the envelope → status:\"error\", NOT not-found (C2)", () => {
    const crl = `library "GuardLib".
${LEAVES}
${ACTIVITIES}
${doublingChain()}
decision "Top":
first:
- when "Leaf A" then use decision "Sub".
- otherwise then recommend activity "Deny".
decision "Sub":
first:
- when "C10" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
    const run = runCel(graphFrom(crl, DELEG_CASES)).runs[0]!;
    // The overflow sub must ERROR the case (C2 fix) — not degrade to the misleading
    // "target not found" path that would silently compute pass/fail.
    expect(run.status).toBe("error");
    expect(run.diagnostics.some((d) => /envelope/.test(d))).toBe(true);
    expect(run.diagnostics.some((d) => /not found/.test(d))).toBe(false);
  });
});

// ── ii.2 Battery 2 — the STRICT eval throw-site + the SOFT render degrade ─────────
// The 4th (and highest-stakes) tripwire site is `evalBranchCondition` (run.ts:444) — the
// "silent-wrong-answer" case. It is a non-exported function, so unlike the three
// `branchCondition.ts` collector sites (pinned in criterionClassify.test.ts) it can only be
// reached via the test-only export. The render lane is the counterexample: it DEGRADES.
describe("#224 ii.2 — tripwire liveness: STRICT eval throws, SOFT render degrades", () => {
  it("evalBranchCondition THROWS on a raw un-expanded criterion ref (the eval tripwire is live)", () => {
    // ctx/frame are unread on the criterion-ref branch (it throws before touching them), so
    // stubs suffice to drive the site.
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __evalBranchConditionForTest(critRef("Eligible"), {} as any, {} as any),
    ).toThrow(/un-expanded criterion/i);
  });

  it("the render lane DEGRADES a raw criterion ref at the ROUTING site (never throws)", () => {
    // Pin the ACTUAL routing site (`zipConditionTrace`, viewModel.ts:636), not just the terminal
    // helper: given a stray criterion ref + a (mismatched) trace, it must return a NAMED
    // unevaluated leaf — NOT throw, NOT attach the trace's satisfied state. This is the VM
    // stability contract and the enumerated exception to "STRICT lanes throw"; the safety net is
    // the parity/presence assertions, not a throw. (The trace here is deliberately a `satisfied`
    // ref the routing must IGNORE for a criterion ref.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = __zipConditionTraceForTest(critRef("Eligible"), { op: "ref", satisfied: true } as any);
    expect(view).toEqual({ op: "ref", concept: { name: "Eligible" } });
  });
});

// ── ii.2 Battery 5 — structure-preserving + deterministic PIPELINE invariants ─────
describe("#224 ii.2 — pipeline invariants (joint parity + determinism)", () => {
  const TWICE_VIA = `library "GuardLib".
${LEAVES}
${ACTIVITIES}
criterion "Eligible":
- when ( "Leaf A" and "Leaf B" ).
decision "D":
all:
- when "Eligible" then recommend activity "Approve".
- when "Eligible" then recommend activity "Deny".`;
  const TWICE_INLINE = `library "GuardLib".
${LEAVES}
${ACTIVITIES}
decision "D":
all:
- when ( "Leaf A" and "Leaf B" ) then recommend activity "Approve".
- when ( "Leaf A" and "Leaf B" ) then recommend activity "Deny".`;

  it("a twice-used criterion's run+render is JOINTLY identical to the twice-inlined hand doc", () => {
    // Run parity on the MEANINGFUL projection — case, status, AND the produced recommendation set
    // (two semantically different runs can share statuses; the produced set is what the oracle
    // checks). A status-only comparison would miss a divergent recommendation.
    const runProjection = (g: ResolvedCelGraph) =>
      runCel(g)
        .runs.map((r) => ({ case: r.case, status: r.status, produced: r.produced.map((p) => p.recommendation).sort() }))
        .sort((a, b) => a.case.localeCompare(b.case));
    expect(runProjection(graphFrom(TWICE_VIA, CASES))).toEqual(runProjection(graphFrom(TWICE_INLINE, CASES)));
    // …AND render parity — REVISED by #224 ii.3 (criterion NAME rendering). ii.2 originally pinned
    // the via-criterion guard tree as byte-identical to the hand-inlined twin ("indistinguishable in
    // the rendered VM too"). ii.3 DELIBERATELY makes them distinguishable: the via tree now carries a
    // `sourcedFromCriterion` marker at the boundary (so the label name-replaces to `Eligible`). So the
    // structural parity now holds MODULO that marker, and the marker's PRESENCE (via) / ABSENCE
    // (inline) is pinned positively. Only the serialized-bytes EMIT parity stays absolute (elsewhere).
    const bothVia = renderScenario(graphFrom(TWICE_VIA, CASES)).scenarios.find((s) => s.case.name === "both")!;
    const bothInl = renderScenario(graphFrom(TWICE_INLINE, CASES)).scenarios.find((s) => s.case.name === "both")!;
    const expr = (s: typeof bothVia, i: number): unknown =>
      (s.tree[i] as { condition: { expr: unknown } }).condition.expr;
    // Recursively drop `sourcedFromCriterion` so the STRUCTURE (op/satisfied/concept/operands) can be
    // compared marker-free — ii.3 changes the marker, not the guard shape.
    const stripMarker = (e: unknown): unknown => {
      if (e === null || typeof e !== "object") return e;
      const { sourcedFromCriterion, ...rest } = e as Record<string, unknown>;
      void sourcedFromCriterion;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) out[k] = Array.isArray(v) ? v.map(stripMarker) : stripMarker(v);
      return out;
    };
    expect(stripMarker(expr(bothVia, 0))).toEqual(stripMarker(expr(bothInl, 0)));
    expect(stripMarker(expr(bothVia, 1))).toEqual(stripMarker(expr(bothInl, 1)));
    // #224 ii.3 positive pin: the via-criterion boundary CARRIES the author's name; the inline twin does NOT.
    const marker = (e: unknown): unknown => (e as { sourcedFromCriterion?: { name: string } }).sourcedFromCriterion;
    expect(marker(expr(bothVia, 0))).toEqual({ name: "Eligible" });
    expect(marker(expr(bothVia, 1))).toEqual({ name: "Eligible" });
    expect(marker(expr(bothInl, 0))).toBeUndefined();
    expect(marker(expr(bothInl, 1))).toBeUndefined();
  });

  it("run + render are DETERMINISTIC across repeated invocations (no table/Map-order leakage)", () => {
    expect(statuses(graphFrom(VIA_CRITERION, CASES))).toEqual(statuses(graphFrom(VIA_CRITERION, CASES)));
    const r1 = renderScenario(graphFrom(VIA_CRITERION, CASES));
    const r2 = renderScenario(graphFrom(VIA_CRITERION, CASES));
    expect(JSON.stringify(r1.scenarios)).toEqual(JSON.stringify(r2.scenarios));
  });
});

// ── #224 ii.3 — criterion NAME rendering (marker-aware VM label + frontier, DISPLAY-ONLY) ──────────
describe("#224 ii.3 — criterion NAME rendering", () => {
  const MORE_LEAVES = `concept "Leaf C":
- type is Observation.
- code is \`leaf-c\`.
concept "Leaf D":
- type is Observation.
- code is \`leaf-d\`.`;
  // A minimal CEL that renders the tree (labels are set from the AST, no eval needed for label pins).
  const NOFACTS = `library "Cases".
covers "GuardLib".
${PATIENT}
case "c":
- subject is "Pat".
- result is "D" is "Approve".`;

  // Render `crlSrc`+`celSrc` and collect every `when` node label in DFS order.
  const labelsOf = (crlSrc: string, celSrc: string = NOFACTS): string[] => {
    const scen = renderScenario(graphFrom(crlSrc, celSrc)).scenarios[0]!;
    const out: string[] = [];
    const walk = (nodes: { kind: string; label: string; children?: unknown[] }[]): void => {
      for (const n of nodes) {
        if (n.kind === "when") out.push(n.label);
        if (n.children) walk(n.children as typeof nodes);
      }
    };
    walk(scen.tree as never);
    return out;
  };
  const firstWhenExpr = (crlSrc: string, celSrc: string = NOFACTS): BranchConditionView =>
    (renderScenario(graphFrom(crlSrc, celSrc)).scenarios[0]!.tree.find((n) => n.kind === "when") as {
      condition: { expr: BranchConditionView };
    }).condition.expr;
  // Assemble a single-decision GuardLib around a set of criteria + one guard.
  const lib = (criteria: string, guard: string, extra = ""): string => `library "GuardLib".
${LEAVES}
${MORE_LEAVES}
${extra}
${ACTIVITIES}
${criteria}
decision "D":
first:
- when ${guard} then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;

  const ELIGIBLE = `criterion "Eligible":\n- when ( "Leaf A" and "Leaf B" ).`;

  it("boundary at guard ROOT: `when \"Eligible\"` → label `when Eligible` (name-replacement, not the expansion)", () => {
    expect(labelsOf(lib(ELIGIBLE, `"Eligible"`))[0]).toBe("when Eligible");
  });

  it("MID-inline `X and Eligible` → `when Leaf A and Eligible` (the criterion names, the inline atom stays)", () => {
    expect(labelsOf(lib(ELIGIBLE, `( "Leaf A" and "Eligible" )`))[0]).toBe("when Leaf A and Eligible");
  });

  it("criterion as a non-first `or` operand → `when Leaf A or Eligible` (NO parens around the name-leaf)", () => {
    // The paren [critical]: a name-replaced compound criterion is a LEAF, so it is never wrapped
    // even though its expansion `(Leaf A and Leaf B)` is compound.
    expect(labelsOf(lib(ELIGIBLE, `( "Leaf A" or "Eligible" )`))[0]).toBe("when Leaf A or Eligible");
  });

  it("`not <criterion>` → `when not Eligible`, NEVER `not (Eligible)` (parent-frame leaf fix)", () => {
    expect(labelsOf(lib(ELIGIBLE, `not "Eligible"`))[0]).toBe("when not Eligible");
  });

  it("nested NON-coincident: `Outer = A and Inner`, `Inner = B or C` → `when Outer` (outermost-wins)", () => {
    const crit = `criterion "Inner":\n- when ( "Leaf B" or "Leaf C" ).\ncriterion "Outer":\n- when ( "Leaf A" and "Inner" ).`;
    expect(labelsOf(lib(crit, `"Outer"`))[0]).toBe("when Outer");
  });

  it("COINCIDENT alias chain `Outer = Inner = Leaf A` → `when Outer` (outermost wins; Inner unrecoverable)", () => {
    const crit = `criterion "Inner":\n- when ( "Leaf A" ).\ncriterion "Outer":\n- when ( "Inner" ).`;
    expect(labelsOf(lib(crit, `"Outer"`))[0]).toBe("when Outer");
  });

  it("SINGLE-ATOM criterion `Eligible2 = Leaf A` → `when Eligible2` + marker on the sole ref leaf", () => {
    const crit = `criterion "Eligible2":\n- when ( "Leaf A" ).`;
    expect(labelsOf(lib(crit, `"Eligible2"`))[0]).toBe("when Eligible2");
    const expr = firstWhenExpr(lib(crit, `"Eligible2"`));
    expect(expr.op).toBe("ref"); // sole-ref collapse
    expect(expr.sourcedFromCriterion).toEqual({ name: "Eligible2" });
  });

  it("marker threads onto the VM node (the shape Todo 2's box reads)", () => {
    const expr = firstWhenExpr(lib(ELIGIBLE, `"Eligible"`));
    expect(expr.op).toBe("and"); // Eligible = Leaf A and Leaf B, boundary on the `and` root
    expect(expr.sourcedFromCriterion).toEqual({ name: "Eligible" });
  });

  it("ATOMS-STAY: a FAILED single-atom criterion labels `when Eligible2` but its frontier atom stays the concept", () => {
    // The design principle (disc 305 §A7): LABELS name-replace; the STRUCTURED frontier keeps ATOM
    // granularity. A single-atom criterion `Eligible2 = Leaf A` that fails → header/label `when Eligible2`,
    // but "which failed" is the concept `Leaf A`, not the criterion name (atom-granularity is finer).
    const crit = `criterion "Eligible2":\n- when ( "Leaf A" ).`;
    const cel = `library "Cases".
covers "GuardLib".
${PATIENT}
case "none":
- subject is "Pat".
- result is "D" is "Deny".`;
    expect(labelsOf(lib(crit, `"Eligible2"`), cel)[0]).toBe("when Eligible2");
    const expr = firstWhenExpr(lib(crit, `"Eligible2"`), cel);
    expect(expr.satisfied).toBe(false);
    // The frontier atom is the CONCEPT (Leaf A), not the criterion name — atoms stay.
    expect(frontierTooltip(unsatisfiedFrontier(expr))).toBe("Leaf A unmet");
  });

  it("false-`or` alternatives with criterion boundaries → frontier ALT-LABELS use the NAMES, not the expansions", () => {
    // Two criteria as the two arms of an `or`; neither holds (no facts) → the branch is a false `or`,
    // and the frontier's per-alternative labels (via `describeConditionView`) must name-replace so the
    // tooltip stays in step with the `when` label.
    const crit = `${ELIGIBLE}\ncriterion "Other":\n- when ( "Leaf C" or "Leaf D" ).`;
    // Give a case that evaluates (facts absent → both criteria false → or false).
    const cel = `library "Cases".
covers "GuardLib".
${PATIENT}
case "none":
- subject is "Pat".
- result is "D" is "Deny".`;
    const expr = firstWhenExpr(lib(crit, `( "Eligible" or "Other" )`), cel);
    const tip = frontierTooltip(unsatisfiedFrontier(expr));
    expect(tip).toContain("alt 1 (Eligible)");
    expect(tip).toContain("alt 2 (Other)");
    expect(tip).not.toContain("Leaf A and Leaf B"); // the expansion must NOT leak into the alt label
  });

  it("failedCriteria: a FAILED single-atom criterion's display concept is the NAME (header matches `when Eligible2`)", () => {
    // #224 ii.3 (impl-review point 1): `fcConcept` is marker-aware, so the i.4b "single" display header
    // reads `when Eligible2` (criterion name), NOT `when Leaf A` (the lone atom) — consistent with the tree
    // node label + `conceptLabel`. The compound-preemptor path shares `fcConcept`, so it is covered too.
    const crit = `criterion "Eligible2":\n- when ( "Leaf A" ).`;
    const cel = `library "Cases".
covers "GuardLib".
${PATIENT}
case "none":
- subject is "Pat".
- result is "D" is "Deny".`;
    const sv = renderScenario(graphFrom(lib(crit, `"Eligible2"`), cel)).scenarios[0] as unknown as FcScenario;
    const failed = allUnsatisfiedCriteria(sv);
    const single = failed.find((f) => f.display.reason === "unsatisfied-when");
    expect(single?.display).toMatchObject({ reason: "unsatisfied-when", guard: "single", concept: { name: "Eligible2" } });
  });

  it("marker survives the astConditionExpr DEGRADE path: a PREEMPTED criterion branch still carries the boundary + name label", () => {
    // A `first:` where branch 0 matches → branch 1 (criterion-guarded) is PREEMPTED (unevaluated) → its
    // `expr` is built by `astConditionExpr` (the no-trace fallback), which must ALSO carry the marker.
    const crit = ELIGIBLE; // Eligible = Leaf A and Leaf B
    const src = `library "GuardLib".
${LEAVES}
${MORE_LEAVES}
${ACTIVITIES}
${crit}
decision "D":
first:
- when "Leaf A" then recommend activity "Approve".
- when "Eligible" then recommend activity "Deny".
- otherwise then recommend activity "Deny".`;
    // Case: Leaf A holds → branch 0 matches → branch 1 preempted (never evaluated).
    const cel = `library "Cases".
covers "GuardLib".
${PATIENT}
fact "fA":
- code is "http://e|leaf-a".
- date is "2026-01-01".
- defined by "GuardLib"."Leaf A".
case "a":
- subject is "Pat".
- fact is "fA".
- result is "D" is "Approve".`;
    const labels = labelsOf(src, cel);
    expect(labels).toContain("when Eligible"); // name-replaced on the PREEMPTED branch too
    const scen = renderScenario(graphFrom(src, cel)).scenarios[0]!;
    const b1 = scen.tree.find((n) => n.kind === "when" && n.nodeId === "when[1]") as {
      evaluated: boolean;
      condition: { expr: BranchConditionView };
    };
    expect(b1.evaluated).toBe(false); // preempted → astConditionExpr fallback built the expr
    expect(b1.condition.expr.sourcedFromCriterion).toEqual({ name: "Eligible" });
  });

  it("duplicate atom inline + criterion: `Leaf A and Eligible2` (Eligible2 = Leaf A) → label keeps both, marker on the criterion", () => {
    const crit = `criterion "Eligible2":\n- when ( "Leaf A" ).`;
    const expr = firstWhenExpr(lib(crit, `( "Leaf A" and "Eligible2" )`));
    expect(labelsOf(lib(crit, `( "Leaf A" and "Eligible2" )`))[0]).toBe("when Leaf A and Eligible2");
    expect(expr.op).toBe("and");
    // operand 0 = the plain inline atom (no marker); operand 1 = the criterion boundary (marker).
    const ops = (expr as { operands: BranchConditionView[] }).operands;
    expect(ops[0]!.sourcedFromCriterion).toBeUndefined();
    expect(ops[1]!.sourcedFromCriterion).toEqual({ name: "Eligible2" });
  });

  it("C2 regression: `viaWhen` (run-trace label) stays the EXPANSION, marker-BLIND (eval contract frozen)", () => {
    // Eligible holds → Approve produced; the produced record's `viaWhen` is the run-trace label, which
    // MUST remain the inlined expansion (the KE path-assertion contract), NOT the criterion name.
    const via = runCel(graphFrom(lib(ELIGIBLE, `"Eligible"`), CASES)).runs.find((r) => r.case === "both")!;
    const approve = via.produced.find((p) => p.recommendation === "Approve")!;
    expect(approve.viaWhen).toBe("Leaf A and Leaf B");
    expect(approve.viaWhen).not.toBe("Eligible");
  });
});
