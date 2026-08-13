import { describe, it, expect } from "vitest";

import { parseInput } from "../../ast/tests/parseInput";
import { classifyCriterionRefs } from "../../ast/criterionClassify";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";

import { runCel } from "../run";
import { renderScenario, __zipConditionTraceForTest, unsatisfiedFrontier, frontierTooltip } from "../viewModel";
import type { BranchConditionView } from "../viewModel";
import type { BranchCondition } from "../../ast/types";
import { allUnsatisfiedCriteria, type FcScenario } from "../../provenance/failedCriteria";

const LOC = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } as const;
const critRef = (ref: string): BranchCondition => ({ type: "BranchConditionCriterionRef", ref, location: LOC });

// #236 — the EVAL + RENDER wiring for a `criterion` guard. A `when` that references a criterion no
// longer inline-EXPANDS the criterion's body into the guard. The CRE evaluates the criterion BY
// REFERENCE to its boolean body (memoized per case), emitting an `op:"criterion"` trace node (body
// sub-trace on the FIRST occurrence per case, `reference:true` on later ones — the render-lane
// analogue of the emit DAG). The view-model walks the SAME raw AST spine (criterion refs intact)
// and zips it against that trace. So a criterion is behaviorally identical to the hand-inlined guard
// (it evaluates to the same boolean), but renders as a NAMED boundary node, not the expanded body.
// `parseInput` does NOT classify, so the test graph runs `classifyCriterionRefs` (as `buildCRL` does).

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

// Two GuardLib flavors that must EVALUATE IDENTICALLY: one factors the guard through a
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

// A doubling-chain criterion C0..C10: C0 = Leaf A and Leaf A; C_k = C_{k-1} and C_{k-1}. Inline
// expansion would materialize 2^(k+1) atoms (C10 = 2048, past the retired 1024 cap). Post-flip each
// C_k evaluates ONCE by reference (memoized per case) → LINEAR, no cap, no overflow.
function doublingChain(): string {
  const out = [`criterion "C0":\n- when ( "Leaf A" and "Leaf A" ).`];
  for (let k = 1; k <= 10; k++) out.push(`criterion "C${k}":\n- when ( "C${k - 1}" and "C${k - 1}" ).`);
  return out.join("\n");
}

describe("#236 — criterion eval + render (reference, not expansion)", () => {
  it("a `when` referencing a criterion evaluates identically to the hand-inlined guard", () => {
    const viaCriterion = statuses(graphFrom(VIA_CRITERION, CASES));
    const inlined = statuses(graphFrom(HAND_INLINED, CASES));
    // both facts → Approve (pass); onlyA → the guard fails → otherwise Deny (pass).
    expect(viaCriterion).toEqual(["both:pass", "onlyA:pass"]);
    expect(viaCriterion).toEqual(inlined);
  });

  it("renderScenario zips the raw criterion spine against the run's op:criterion trace (no degradation)", () => {
    const viaCriterion = renderScenario(graphFrom(VIA_CRITERION, CASES));
    const inlined = renderScenario(graphFrom(HAND_INLINED, CASES));
    // Both render successfully with no error scenarios; the per-case pass/fail matches the inlined
    // twin — a half-missed seam (spine expanded but trace by-reference, or vice versa) would degrade
    // the criterion node to an unevaluated leaf and desync pass/fail.
    expect(viaCriterion.success).toBe(true);
    expect(viaCriterion.errorCount).toBe(0);
    expect(viaCriterion.scenarios.map((s) => `${s.case}:${s.status}`).sort()).toEqual(
      inlined.scenarios.map((s) => `${s.case}:${s.status}`).sort(),
    );
  });

  it("a criterion used TWICE renders LINEARLY: first occurrence carries the body, later ones are references", () => {
    // Two `all:` branches both guarded by the SAME criterion. Post-flip the run trace carries the
    // criterion BODY on its first occurrence per case and `reference:true` on later ones (the render-
    // lane analogue of the emit DAG); the VM mirrors that. So the guard trees are NOT two disjoint
    // expansions — they are one named boundary shown once with its body, then referenced.
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
    const guardExpr = (i: number): BranchConditionView =>
      (both.tree[i] as { condition: { expr: BranchConditionView } }).condition.expr;
    // Both branches are the SAME named boundary (op:"criterion", satisfied, naming "Eligible").
    const e0 = guardExpr(0);
    const e1 = guardExpr(1);
    expect(e0.op).toBe("criterion");
    expect(e1.op).toBe("criterion");
    expect(e0).toMatchObject({ op: "criterion", satisfied: true, criterion: { name: "Eligible", libraryName: "GuardLib" } });
    expect(e1).toMatchObject({ op: "criterion", satisfied: true, criterion: { name: "Eligible", libraryName: "GuardLib" } });
    // FIRST occurrence carries the body (the `and` of the two leaves); the SECOND is a bare reference
    // (body omitted, `reference:true`) — the trace linearity that keeps the render linear in DISTINCT
    // criteria rather than cloning the subtree per use.
    expect((e0 as { body?: BranchConditionView }).body).toMatchObject({
      op: "and",
      satisfied: true,
      operands: [
        { op: "ref", satisfied: true, concept: { name: "Leaf A", libraryName: "GuardLib" }, facts: ["fA"] },
        { op: "ref", satisfied: true, concept: { name: "Leaf B", libraryName: "GuardLib" }, facts: ["fB"] },
      ],
    });
    expect((e1 as { body?: BranchConditionView }).body).toBeUndefined();
    expect((e1 as { reference?: boolean }).reference).toBe(true);
  });

  it("a deep doubling-chain criterion evaluates + renders LINEARLY (no overflow error, no throw)", () => {
    // The retired inline-expansion path threw/errored here (C10 materialized 2048 atoms past the
    // cap). Post-flip every criterion is evaluated ONCE by reference (memoized per case), so a
    // doubling DAG resolves in time linear in DISTINCT criteria — no `criterion-expansion` error,
    // no uncaught throw, in BOTH the run and the render lane.
    const deep = `library "GuardLib".
${LEAVES}
${ACTIVITIES}
${doublingChain()}
decision "D":
first:
- when "C10" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
    const runs = runCel(graphFrom(deep, CASES)).runs;
    expect(runs).toHaveLength(2); // guard against a vacuous `.every`/`.some` on an empty runs array
    // No case errors, and no envelope/expansion diagnostic anywhere (the retired disposition).
    expect(runs.every((r) => r.status !== "error")).toBe(true);
    expect(runs.some((r) => r.diagnostics.some((d) => /criterion-expansion|envelope/.test(d)))).toBe(false);
    // The render lane likewise succeeds with a scenario per case (never throws, never degrades all).
    const render = renderScenario(graphFrom(deep, CASES));
    expect(render.scenarios).toHaveLength(2);
    expect(render.errorCount).toBe(0);
  });
});

describe("#236 — criterion through a `use decision` sub-decision", () => {
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

  it("a sub-decision whose guard is a criterion evaluates correctly (delegated frame OK path)", () => {
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

  it("a deep-chain criterion guard behind a `use decision` sub evaluates cleanly (no overflow, no not-found)", () => {
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
    // Post-flip the deep chain resolves by reference through the sub — no envelope error, no throw,
    // and never the misleading "target not found" path the retired overflow disposition risked.
    expect(run.status).not.toBe("error");
    expect(run.diagnostics.some((d) => /envelope|criterion-expansion/.test(d))).toBe(false);
    expect(run.diagnostics.some((d) => /not found/.test(d))).toBe(false);
  });
});

// ── #236 — the render lane routing site DEGRADES on a trace mismatch (never throws) ──────────────
// The eval site (run.ts `evalBranchCondition`) no longer THROWS on a criterion ref — it resolves the
// criterion by reference. The render routing site (`zipConditionTrace`) is the SOFT counterpart: on
// any trace shape/identity mismatch it returns the NAMED unevaluated leaf, never a throw.
describe("#236 — render-lane routing degrade (VM stability contract)", () => {
  it("zipConditionTrace degrades a criterion ref against a mismatched (ref) trace to a NAMED unevaluated boundary", () => {
    // Pin the ACTUAL routing site (`zipConditionTrace`): given a criterion-ref spine + a mismatched
    // (op:"ref") trace, it must return the unevaluated `op:"criterion"` boundary naming the criterion
    // — NOT throw, NOT cross-attach the trace's `satisfied` state. This is the VM stability contract.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = __zipConditionTraceForTest(critRef("Eligible"), { op: "ref", satisfied: true } as any);
    expect(view).toEqual({ op: "criterion", criterion: { name: "Eligible" } });
  });
});

// ── #236 — structure-preserving + deterministic PIPELINE invariants ───────────────────────────────
describe("#236 — pipeline invariants (run parity + render divergence + determinism)", () => {
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

  it("a twice-used criterion RUNS identically to the twice-inlined hand doc, but RENDERS as a named boundary", () => {
    // RUN parity on the MEANINGFUL projection — case, status, AND the produced recommendation set. A
    // criterion evaluates to the same boolean as its inline body, so the runs are behaviorally equal.
    // (`viaWhen` DOES differ — see the dedicated test below — so it is not part of this projection.)
    const runProjection = (g: ResolvedCelGraph) =>
      runCel(g)
        .runs.map((r) => ({ case: r.case, status: r.status, produced: r.produced.map((p) => p.recommendation).sort() }))
        .sort((a, b) => a.case.localeCompare(b.case));
    expect(runProjection(graphFrom(TWICE_VIA, CASES))).toEqual(runProjection(graphFrom(TWICE_INLINE, CASES)));
    // RENDER DIVERGENCE (#236): the via-criterion guard renders as an `op:"criterion"` boundary
    // (naming "Eligible"); the hand-inlined twin renders its expanded `op:"and"` tree. The flip makes
    // them DELIBERATELY distinguishable — the criterion is a named unit, not an inlined subtree.
    const bothVia = renderScenario(graphFrom(TWICE_VIA, CASES)).scenarios.find((s) => s.case.name === "both")!;
    const bothInl = renderScenario(graphFrom(TWICE_INLINE, CASES)).scenarios.find((s) => s.case.name === "both")!;
    const expr = (s: typeof bothVia, i: number): BranchConditionView =>
      (s.tree[i] as { condition: { expr: BranchConditionView } }).condition.expr;
    expect(expr(bothVia, 0).op).toBe("criterion");
    expect(expr(bothVia, 1).op).toBe("criterion");
    expect(expr(bothInl, 0).op).toBe("and");
    expect(expr(bothInl, 1).op).toBe("and");
  });

  it("run + render are DETERMINISTIC across repeated invocations (no table/Map-order leakage)", () => {
    expect(statuses(graphFrom(VIA_CRITERION, CASES))).toEqual(statuses(graphFrom(VIA_CRITERION, CASES)));
    const r1 = renderScenario(graphFrom(VIA_CRITERION, CASES));
    const r2 = renderScenario(graphFrom(VIA_CRITERION, CASES));
    expect(JSON.stringify(r1.scenarios)).toEqual(JSON.stringify(r2.scenarios));
  });
});

// ── #236 — criterion NAME rendering (VM label + frontier, DISPLAY) ────────────────────────────────
// A criterion ref is NOT expanded, so `describeBranchCondition` renders it by its author name
// naturally — the `when` label names the criterion, and the structured frontier of a FAILED criterion
// blocks on the criterion NAME (a single reusable named unit), not its inner atoms.
describe("#236 — criterion NAME rendering", () => {
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

  it("boundary at guard ROOT: `when \"Eligible\"` → label `when Eligible` (the criterion name, not the body)", () => {
    expect(labelsOf(lib(ELIGIBLE, `"Eligible"`))[0]).toBe("when Eligible");
  });

  it("MID-inline `X and Eligible` → `when Leaf A and Eligible` (the criterion names, the inline atom stays)", () => {
    expect(labelsOf(lib(ELIGIBLE, `( "Leaf A" and "Eligible" )`))[0]).toBe("when Leaf A and Eligible");
  });

  it("criterion as a non-first `or` operand → `when Leaf A or Eligible` (NO parens around the name-leaf)", () => {
    // The paren [critical]: a named criterion is a LEAF, so it is never wrapped even though its body
    // `(Leaf A and Leaf B)` is compound.
    expect(labelsOf(lib(ELIGIBLE, `( "Leaf A" or "Eligible" )`))[0]).toBe("when Leaf A or Eligible");
  });

  it("`not <criterion>` → `when not Eligible`, NEVER `not (Eligible)` (criterion is a leaf)", () => {
    expect(labelsOf(lib(ELIGIBLE, `not "Eligible"`))[0]).toBe("when not Eligible");
  });

  it("nested criterion: `Outer = A and Inner`, `Inner = B or C` → `when Outer` (the referenced name wins)", () => {
    const crit = `criterion "Inner":\n- when ( "Leaf B" or "Leaf C" ).\ncriterion "Outer":\n- when ( "Leaf A" and "Inner" ).`;
    expect(labelsOf(lib(crit, `"Outer"`))[0]).toBe("when Outer");
  });

  it("criterion referencing a criterion `Outer = Inner = Leaf A` → `when Outer` (the referenced name)", () => {
    const crit = `criterion "Inner":\n- when ( "Leaf A" ).\ncriterion "Outer":\n- when ( "Inner" ).`;
    expect(labelsOf(lib(crit, `"Outer"`))[0]).toBe("when Outer");
  });

  it("SINGLE-ATOM criterion `Eligible2 = Leaf A` → `when Eligible2` + an op:criterion node over a ref body", () => {
    const crit = `criterion "Eligible2":\n- when ( "Leaf A" ).`;
    expect(labelsOf(lib(crit, `"Eligible2"`))[0]).toBe("when Eligible2");
    const expr = firstWhenExpr(lib(crit, `"Eligible2"`));
    expect(expr.op).toBe("criterion"); // #236: a named boundary, NOT a collapsed sole-ref
    expect((expr as { criterion: { name: string } }).criterion).toMatchObject({ name: "Eligible2" });
    // Its body is the criterion's own guard — the sole ref to Leaf A.
    expect((expr as { body?: BranchConditionView }).body).toMatchObject({ op: "ref", concept: { name: "Leaf A" } });
  });

  it("op:criterion node names the criterion and carries its body (the shape the cockpit box reads)", () => {
    const expr = firstWhenExpr(lib(ELIGIBLE, `"Eligible"`));
    expect(expr.op).toBe("criterion");
    expect((expr as { criterion: { name: string } }).criterion).toMatchObject({ name: "Eligible" });
    // Eligible = Leaf A and Leaf B → the body is the `and` of the two leaves.
    expect((expr as { body?: BranchConditionView }).body).toMatchObject({ op: "and" });
  });

  it("FRONTIER: a FAILED single-atom criterion labels `when Eligible2` AND its frontier names the CRITERION", () => {
    // #236 DAG-collapse philosophy: a criterion is ONE reusable named unit, so a FAILED criterion
    // blocks on the criterion NAME (Eligible2), not its inner atom (Leaf A). Label and frontier agree.
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
    // The frontier atom is the CRITERION (Eligible2), the single named blocker.
    expect(frontierTooltip(unsatisfiedFrontier(expr))).toBe("Eligible2 unmet");
  });

  it("false-`or` alternatives with criterion boundaries → frontier ALT-LABELS use the NAMES, not the bodies", () => {
    // Two criteria as the two arms of an `or`; neither holds (no facts) → the branch is a false `or`,
    // and the frontier's per-alternative labels (via `describeConditionView`) name the criteria so the
    // tooltip stays in step with the `when` label.
    const crit = `${ELIGIBLE}\ncriterion "Other":\n- when ( "Leaf C" or "Leaf D" ).`;
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
    expect(tip).not.toContain("Leaf A and Leaf B"); // the body must NOT leak into the alt label
  });

  it("failedCriteria: a FAILED single-atom criterion's display concept is the NAME (header matches `when Eligible2`)", () => {
    // `fcConcept` reads the `op:"criterion"` node, so the "single" display header reads `when Eligible2`
    // (criterion name), NOT `when Leaf A` (the body atom) — consistent with the tree node label.
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

  it("a PREEMPTED criterion branch degrades to a NAMED unevaluated op:criterion boundary (astConditionExpr path)", () => {
    // A `first:` where branch 0 matches → branch 1 (criterion-guarded) is PREEMPTED (unevaluated) → its
    // `expr` is built by `astConditionExpr` (the no-trace fallback), which renders the criterion ref as
    // an `op:"criterion"` boundary naming it, with NO `satisfied`/`body` (unreached).
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
    expect(labels).toContain("when Eligible"); // named on the PREEMPTED branch too
    const scen = renderScenario(graphFrom(src, cel)).scenarios[0]!;
    const b1 = scen.tree.find((n) => n.kind === "when" && n.nodeId === "when[1]") as {
      evaluated: boolean;
      condition: { expr: BranchConditionView };
    };
    expect(b1.evaluated).toBe(false); // preempted → astConditionExpr fallback built the expr
    expect(b1.condition.expr.op).toBe("criterion");
    expect((b1.condition.expr as { criterion: { name: string } }).criterion).toMatchObject({ name: "Eligible" });
    expect((b1.condition.expr as { satisfied?: boolean }).satisfied).toBeUndefined(); // unevaluated → no state
    expect((b1.condition.expr as { body?: BranchConditionView }).body).toBeUndefined();
  });

  it("duplicate atom inline + criterion: `Leaf A and Eligible2` (Eligible2 = Leaf A) → label keeps both; op:criterion operand", () => {
    const crit = `criterion "Eligible2":\n- when ( "Leaf A" ).`;
    const expr = firstWhenExpr(lib(crit, `( "Leaf A" and "Eligible2" )`));
    expect(labelsOf(lib(crit, `( "Leaf A" and "Eligible2" )`))[0]).toBe("when Leaf A and Eligible2");
    expect(expr.op).toBe("and");
    // operand 0 = the plain inline atom (op:"ref"); operand 1 = the criterion boundary (op:"criterion").
    const ops = (expr as { operands: BranchConditionView[] }).operands;
    expect(ops[0]!.op).toBe("ref");
    expect(ops[1]!.op).toBe("criterion");
    expect((ops[1]! as { criterion: { name: string } }).criterion).toMatchObject({ name: "Eligible2" });
  });

  it("`viaWhen` (run-trace label) is the criterion NAME (the criterion is referenced, not expanded)", () => {
    // #236: the run trace no longer inlines the criterion, so `describeBranchCondition` renders it by
    // name → `viaWhen` = "Eligible" (the flip's whole point — a criterion is a named unit end-to-end).
    const via = runCel(graphFrom(lib(ELIGIBLE, `"Eligible"`), CASES)).runs.find((r) => r.case === "both")!;
    const approve = via.produced.find((p) => p.recommendation === "Approve")!;
    expect(approve.viaWhen).toBe("Eligible");
    expect(approve.viaWhen).not.toBe("Leaf A and Leaf B");
  });
});

// A op:"criterion" trace collector over a runCel serialized trace (through conditionTrace / operand /
// body / operands / children, and a top-level trace array).
function critTraceNodes(node: unknown, out: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const c of node) critTraceNodes(c, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const n = node as Record<string, unknown>;
  if (n.op === "criterion") out.push(n);
  for (const k of ["conditionTrace", "operand", "body"]) if (n[k]) critTraceNodes(n[k], out);
  for (const k of ["operands", "children"]) if (Array.isArray(n[k])) critTraceNodes(n[k], out);
  return out;
}
const critName = (n: Record<string, unknown>): string => (n.criterion as { name: string }).name;

// #236 — the CRE evaluates on UNVALIDATED input (`runCel` runs no validator, run.ts), so the
// cyclic + undefined-criterion dispositions are production-reachable and must be closed-world false,
// LOUDLY diagnosed, and (disc 419 both-arms catch) must NOT fabricate a `reference:true` (which
// would promise a first-occurrence body that never exists).
describe("#236 — CRE criterion error dispositions (unvalidated input)", () => {
  it("a CYCLIC criterion → closed-world false + a `cycle detected` diagnostic (no hang, no spurious reference)", () => {
    const crl = `library "GuardLib".
${LEAVES}
${ACTIVITIES}
criterion "X":
- when ( "Y" ).
criterion "Y":
- when ( "X" ).
decision "D":
first:
- when "X" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
    const cel = `library "Cases".
covers "GuardLib".
${PATIENT}
case "c":
- subject is "Pat".
- result is "D" is "Deny".`;
    const run = runCel(graphFrom(crl, cel)).runs[0]!;
    // X cycles → closed-world false → otherwise → Deny (matches the expected result) — and it TERMINATED.
    expect(run.status).toBe("pass");
    expect(run.diagnostics.some((d) => /cycle detected/.test(d))).toBe(true);
    const crits = critTraceNodes(run.trace);
    const xNodes = crits.filter((n) => critName(n) === "X");
    expect(xNodes.length).toBeGreaterThanOrEqual(1);
    expect(xNodes.every((n) => n.satisfied === false)).toBe(true); // closed-world false everywhere
    // disc 419: a cyclic criterion never fabricates a `reference:true` anywhere in the trace.
    expect(crits.every((n) => n.reference === undefined)).toBe(true);
  });

  it("an UNDEFINED criterion (defensive `!crit` path) → closed-world false + a `no definition` diagnostic; `not <undefined>` does not silently invert", () => {
    // The classifier only produces a criterion ref when a declaration exists, so the undefined path is
    // defensive — inject a criterion ref to an undeclared name into a decision guard to drive it
    // through the PUBLIC runCel (rather than a test-only eval hook).
    const graph = graphFrom(
      `library "GuardLib".
${LEAVES}
${ACTIVITIES}
decision "D":
first:
- when not "Leaf A" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`,
      `library "Cases".
covers "GuardLib".
${PATIENT}
case "c":
- subject is "Pat".
- result is "D" is "Approve".`,
    );
    // Swap the first branch guard `not "Leaf A"` → `not <undefined criterion "Ghost">`.
    const dec = graph.coversTarget.ast.statements.find(
      (s) => s.type === "Decision" && s.name === "D",
    ) as { body: { statements: Array<{ condition: BranchCondition }> } };
    dec.body.statements[0]!.condition = { type: "BranchConditionNot", operand: critRef("Ghost"), location: LOC };
    const run = runCel(graph).runs[0]!;
    // Ghost undefined → false; `not false` → true → the branch fires → Approve. But it is DIAGNOSED
    // (never a silent inversion — the whole reason run.ts diagnoses the `!crit` path).
    expect(run.diagnostics.some((d) => /no definition/.test(d))).toBe(true);
    const ghost = critTraceNodes(run.trace).filter((n) => critName(n) === "Ghost");
    expect(ghost.length).toBe(1);
    expect(ghost[0]!.satisfied).toBe(false); // closed-world false
    expect(ghost[0]!.body).toBeUndefined(); // no body …
    expect(ghost[0]!.reference).toBeUndefined(); // … and no fabricated reference
  });

  it("`tracedCriteria` is PER-CASE: each case's FIRST occurrence of a criterion carries its OWN body", () => {
    // Two cases both evaluate the SAME twice-referenced criterion. If body/reference state leaked
    // across cases (per-run instead of per-case), case 2's first occurrence would be a bare reference.
    const crl = `library "GuardLib".
${LEAVES}
${ACTIVITIES}
criterion "Elig":
- when ( "Leaf A" and "Leaf B" ).
decision "D":
all:
- when "Elig" then recommend activity "Approve".
- when "Elig" then recommend activity "Deny".`;
    const runs = runCel(graphFrom(crl, CASES)).runs;
    expect(runs).toHaveLength(2);
    for (const r of runs) {
      const elig = critTraceNodes(r.trace).filter((n) => critName(n) === "Elig");
      expect(elig.length).toBe(2); // referenced twice per case
      expect(elig.filter((n) => n.body !== undefined).length).toBe(1); // exactly one bodied, PER CASE
      expect(elig.filter((n) => n.reference === true).length).toBe(1);
    }
  });
});
