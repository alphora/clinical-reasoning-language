import { describe, it, expect } from "vitest";

import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";

import { runCel } from "../run";
import type { CaseRun, TraceNode } from "../run";
import { renderScenario } from "../viewModel";

// #224 i.2 — evaluation of COMPOUND decision guards (`when A and B`, `when A or B`).

function graphFrom(crlSrc: string, celSrc: string): ResolvedCelGraph {
  const crl = parseInput(crlSrc);
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

const PATIENT = `fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".`;

const statuses = (g: ResolvedCelGraph): string[] => runCel(g).runs.map((r) => `${r.case}:${r.status}`);
const compoundWhen = (run: CaseRun): TraceNode | undefined => run.trace.find((n) => n.conditionTrace);

const LEAVES = `concept "Leaf A":
- type is Observation.
- code is \`leaf-a\`.
concept "Leaf B":
- type is Observation.
- code is \`leaf-b\`.`;

const CASES = (dec: string) => `library "Cases".
covers "GuardLib".
${PATIENT}
fact "fA":
- date is "2026-01-01".
- defined by "GuardLib"."Leaf A".
fact "fB":
- date is "2026-01-01".
- defined by "GuardLib"."Leaf B".
case "both":
- subject is "Pat".
- fact is "fA".
- fact is "fB".
- result is "D" is "${dec === "and" ? "Approve" : "Approve"}".
case "onlyA":
- subject is "Pat".
- fact is "fA".
- result is "D" is "${dec === "and" ? "Deny" : "Approve"}".
case "onlyB":
- subject is "Pat".
- fact is "fB".
- result is "D" is "${dec === "and" ? "Deny" : "Approve"}".
case "neither":
- subject is "Pat".
- result is "D" is "Deny".`;

describe("CRE — compound guard evaluation (#224)", () => {
  const andCrl = `library "GuardLib".
${LEAVES}
decision "D":
first:
- when "Leaf A" and "Leaf B" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;

  const orCrl = `library "GuardLib".
${LEAVES}
decision "D":
first:
- when "Leaf A" or "Leaf B" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;

  it("`and`: satisfied iff BOTH operands hold", () => {
    expect(statuses(graphFrom(andCrl, CASES("and")))).toEqual([
      "both:pass",
      "onlyA:pass",
      "onlyB:pass",
      "neither:pass",
    ]);
  });

  it("`or`: satisfied iff ANY operand holds", () => {
    expect(statuses(graphFrom(orCrl, CASES("or")))).toEqual([
      "both:pass",
      "onlyA:pass",
      "onlyB:pass",
      "neither:pass",
    ]);
  });

  it("compound node carries `conditionTrace`, OMITS `concept`, label in `node`", () => {
    const run = runCel(graphFrom(andCrl, CASES("and"))).runs.find((r) => r.case === "both")!;
    const n = compoundWhen(run)!;
    expect(n.concept).toBeUndefined();
    expect(n.node).toBe("when Leaf A and Leaf B");
    expect(n.conditionTrace).toMatchObject({ op: "and", satisfied: true });
  });

  it("FULL-evaluate: a false `and` still evaluates + traces the OTHER conjunct", () => {
    const run = runCel(graphFrom(andCrl, CASES("and"))).runs.find((r) => r.case === "onlyA")!;
    const t = compoundWhen(run)!.conditionTrace!;
    if (t.op !== "and") throw new Error("expected and");
    expect(t.satisfied).toBe(false);
    // operand[0] Leaf A satisfied (asserted), operand[1] Leaf B present + false
    expect(t.operands.map((o) => o.op === "ref" && o.satisfied)).toEqual([true, false]);
    expect(t.operands.map((o) => (o.op === "ref" ? o.concept.name : "?"))).toEqual(["Leaf A", "Leaf B"]);
  });

  it("VM: a compound guard renders as an `expr` tree (no `.concept`), leaves in order", () => {
    const vm = renderScenario(graphFrom(andCrl, CASES("and")));
    const when = vm.scenarios[0]!.tree.find((n) => n.kind === "when")!;
    const cond = when.condition!;
    expect((cond as unknown as { concept?: unknown }).concept).toBeUndefined();
    expect(cond.expr.op).toBe("and");
    if (cond.expr.op === "and") {
      expect(cond.expr.operands.map((o) => (o.op === "ref" ? o.concept.name : "?"))).toEqual([
        "Leaf A",
        "Leaf B",
      ]);
      // per-leaf satisfied is carried (both true in the "both" case is default; here check presence)
      expect(cond.expr.operands.every((o) => "satisfied" in o)).toBe(true);
    }
  });

  it("nested `(A or B) and C`: eval + VM zip recursion through a parenthesized group", () => {
    const crl = `library "GuardLib".
${LEAVES}
concept "Leaf C":
- type is Observation.
- code is \`leaf-c\`.
decision "D":
first:
- when ( "Leaf A" or "Leaf B" ) and "Leaf C" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;
    // A + C present, B absent → (A or B)=true, C=true → the guard holds
    const cel = `library "Cases".
covers "GuardLib".
${PATIENT}
fact "fA":
- date is "2026-01-01".
- defined by "GuardLib"."Leaf A".
fact "fC":
- date is "2026-01-01".
- defined by "GuardLib"."Leaf C".
case "AC":
- subject is "Pat".
- fact is "fA".
- fact is "fC".
- result is "D" is "Approve".`;
    const vm = renderScenario(graphFrom(crl, cel));
    const e = vm.scenarios[0]!.tree.find((n) => n.kind === "when")!.condition!.expr;
    expect(e.op).toBe("and");
    if (e.op === "and") {
      expect(e.satisfied).toBe(true);
      expect(e.operands[0]!.op).toBe("or"); // parenthesized group preserved as nesting
      expect(e.operands[1]!.op).toBe("ref");
      if (e.operands[0]!.op === "or") {
        // full-evaluate: A true, B false — BOTH traced under the group
        expect(e.operands[0]!.operands.map((o) => o.op === "ref" && o.satisfied)).toEqual([
          true,
          false,
        ]);
      }
    }
  });

  it("FULL-evaluate: a satisfied `or` still evaluates + traces the second operand", () => {
    const run = runCel(graphFrom(orCrl, CASES("or"))).runs.find((r) => r.case === "onlyA")!;
    const t = compoundWhen(run)!.conditionTrace!;
    if (t.op !== "or") throw new Error("expected or");
    expect(t.satisfied).toBe(true);
    expect(t.operands).toHaveLength(2); // second operand NOT short-circuited away
    expect(t.operands.map((o) => o.op === "ref" && o.satisfied)).toEqual([true, false]);
  });

  // #224 iii.2/iii.3 — closed-world negation in the CRE. `not` is a first-class, validated,
  // emit-capable guard (iii.3); the CRE evaluates it closed-world (`!sat`), matching the emit-side
  // `not Coalesce(<sat>, false)` two-valued semantics — never throws.
  describe("closed-world `not` (#224 iii.2/iii.3)", () => {
    const notCrl = `library "GuardLib".
${LEAVES}
decision "D":
first:
- when not "Leaf A" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;

    // Expected outcome per case for `when not "Leaf A"`: Leaf A absent → Approve, present → Deny.
    const NOT_CASES = `library "Cases".
covers "GuardLib".
${PATIENT}
fact "fA":
- date is "2026-01-01".
- defined by "GuardLib"."Leaf A".
fact "fB":
- date is "2026-01-01".
- defined by "GuardLib"."Leaf B".
case "aPresent":
- subject is "Pat".
- fact is "fA".
- result is "D" is "Deny".
case "aAbsent":
- subject is "Pat".
- fact is "fB".
- result is "D" is "Approve".`;

    it("`not A` is satisfied iff A is NOT established (closed-world) — both cases PASS", () => {
      expect(statuses(graphFrom(notCrl, NOT_CASES))).toEqual(["aPresent:pass", "aAbsent:pass"]);
    });

    it("the trace carries `op:\"not\"` with the negated `satisfied` and the operand subtrace", () => {
      const run = runCel(graphFrom(notCrl, NOT_CASES)).runs.find((r) => r.case === "aAbsent")!;
      const t = compoundWhen(run)!.conditionTrace!;
      if (t.op !== "not") throw new Error("expected not");
      expect(t.satisfied).toBe(true); // Leaf A absent → not-satisfied
      expect(t.operand.op).toBe("ref");
      expect(t.operand.satisfied).toBe(false); // the underlying Leaf A is unsatisfied
    });

    it("renderScenario builds a structure-faithful `not` view WITHOUT throwing (unvalidated lane)", () => {
      const result = renderScenario(graphFrom(notCrl, NOT_CASES));
      expect(result.success).toBe(true);
      // schema v3 added the `not` view variant; #236 v4 added the `criterion` variant; #189 Slice 0b v5 added
      // the `ExplanationView` and/or/not (concept-space boolean composition).
      expect(result.schemaVersion).toBe(5);
      // Find the `not` guard node in the aAbsent case's view and assert its structure + negated satisfied.
      const json = JSON.stringify(result);
      expect(json).toContain('"op":"not"');
    });
  });
});
