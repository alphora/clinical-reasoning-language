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
- code is "http://e|leaf-a".
- date is "2026-01-01".
- defined by "GuardLib"."Leaf A".
fact "fC":
- code is "http://e|leaf-c".
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
});
