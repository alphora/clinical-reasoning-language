import { describe, it, expect } from "vitest";

import { parseInput } from "../../ast/tests/parseInput";
import { classifyCriterionRefs } from "../../ast/criterionClassify";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";

import { runCel } from "../run";
import { renderScenario } from "../viewModel";

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
    const guardExpr = (i: number): unknown => (both.tree[i] as { condition: { expr: unknown } }).condition.expr;
    expect(guardExpr(0)).toEqual({
      op: "and",
      satisfied: true,
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
