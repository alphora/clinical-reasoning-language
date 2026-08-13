import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import {
  branchConditionDNF,
  branchConditionArmCount,
  branchConditionConceptRefsStrict,
  branchConditionRefs,
  describeBranchCondition,
} from "../branchCondition";
import { classifyCriterionRefs } from "../criterionClassify";
import type { BranchCondition, Criterion, Decision } from "../types";

// #224 ii.1a — the `criterion` grammar/AST foundation + the classification pass.
// A criterion parses to a `Criterion` statement; a bare guard ref that names a
// criterion is classified to a distinct `BranchConditionCriterionRef`; a concept
// ref (or a qualified ref) stays a `BranchConditionRef`.

function build(src: string) {
  const r = buildCRL(src);
  if (!r.success) throw new Error("build failed: " + JSON.stringify(r.errors));
  return r.result;
}

const firstWhenCond = (dec: Decision): BranchCondition => {
  const first = dec.body.statements[0];
  if (!first || first.type !== "WhenBlock") throw new Error("expected a leading when block");
  return first.condition;
};

const LIB = `library "G".
concept "Age Qualifies":
- type is Observation.
- code is \`age\`.
concept "Has Diagnosis":
- type is Condition.
- code is \`dx\`.`;

const ACT = `activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.`;

describe("criterion — grammar + AST", () => {
  it("a `criterion` parses to a Criterion statement whose condition is the guard tree", () => {
    const ast = build(`${LIB}
criterion "Eligible":
- when ( "Age Qualifies" and "Has Diagnosis" ).
${ACT}`);
    const crit = ast.statements.find((s): s is Criterion => s.type === "Criterion");
    expect(crit).toBeTruthy();
    expect(crit!.name).toBe("Eligible");
    expect(crit!.condition.type).toBe("BranchConditionAnd");
  });
});

describe("criterion — classification of guard refs", () => {
  it("a bare guard ref naming a criterion → BranchConditionCriterionRef; a concept ref stays a Ref", () => {
    const ast = build(`${LIB}
criterion "Eligible":
- when ( "Age Qualifies" and "Has Diagnosis" ).
decision "D":
first:
- when "Eligible" and "Has Diagnosis" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACT}`);
    const dec = ast.statements.find((s): s is Decision => s.type === "Decision")!;
    const cond = firstWhenCond(dec);
    expect(cond.type).toBe("BranchConditionAnd");
    if (cond.type !== "BranchConditionAnd") throw new Error("expected and");
    // operand[0] "Eligible" → criterion ref; operand[1] "Has Diagnosis" → concept ref.
    expect(cond.operands[0]!.type).toBe("BranchConditionCriterionRef");
    expect(cond.operands[1]!.type).toBe("BranchConditionRef");
  });

  it("a criterion BODY referencing another criterion is classified (transitive)", () => {
    const ast = build(`${LIB}
criterion "Eligible":
- when ( "Age Qualifies" and "Has Diagnosis" ).
criterion "Fully Eligible":
- when ( "Eligible" and "Age Qualifies" ).
${ACT}`);
    const full = ast.statements.find(
      (s): s is Criterion => s.type === "Criterion" && s.name === "Fully Eligible",
    )!;
    expect(full.condition.type).toBe("BranchConditionAnd");
    if (full.condition.type !== "BranchConditionAnd") throw new Error("expected and");
    expect(full.condition.operands[0]!.type).toBe("BranchConditionCriterionRef"); // "Eligible"
    expect(full.condition.operands[1]!.type).toBe("BranchConditionRef"); // "Age Qualifies"
  });

  it("a file with NO criteria leaves guard refs as plain BranchConditionRef (byte-identical path)", () => {
    const ast = build(`${LIB}
decision "D":
first:
- when "Age Qualifies" and "Has Diagnosis" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACT}`);
    const dec = ast.statements.find((s): s is Decision => s.type === "Decision")!;
    const cond = firstWhenCond(dec);
    if (cond.type !== "BranchConditionAnd") throw new Error("expected and");
    expect(cond.operands.every((o) => o.type === "BranchConditionRef")).toBe(true);
  });

  it("a SELF-qualified ref (`\"G\".\"Eligible\"` in library G) IS classified (self-qualified ≡ bare)", () => {
    const ast = build(`${LIB}
criterion "Eligible":
- when ( "Age Qualifies" and "Has Diagnosis" ).
decision "D":
first:
- when "G"."Eligible" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACT}`);
    const dec = ast.statements.find((s): s is Decision => s.type === "Decision")!;
    // the language treats self-qualified as bare everywhere; classification must match.
    expect(firstWhenCond(dec).type).toBe("BranchConditionCriterionRef");
  });

  it("classifies inside a NESTED then: block (rewriteWhenBody recursion)", () => {
    const ast = build(`${LIB}
criterion "Eligible":
- when ( "Age Qualifies" and "Has Diagnosis" ).
decision "D":
first:
- when "Age Qualifies" then:
  first:
  - when "Eligible" then recommend activity "Approve".
  - otherwise then recommend activity "Deny".
  end.
- otherwise then recommend activity "Deny".
${ACT}`);
    const dec = ast.statements.find((s): s is Decision => s.type === "Decision")!;
    const outer = dec.body.statements[0];
    if (!outer || outer.type !== "WhenBlock" || outer.body.type !== "BlockBody") throw new Error("nested shape");
    const inner = outer.body.statements[0];
    if (!inner || inner.type !== "WhenBlock") throw new Error("expected nested when");
    expect(inner.condition.type).toBe("BranchConditionCriterionRef"); // "Eligible", nested
  });

  it("is idempotent — classifying an already-classified AST is a no-op", () => {
    const ast = build(`${LIB}
criterion "Eligible":
- when ( "Age Qualifies" and "Has Diagnosis" ).
decision "D":
first:
- when "Eligible" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACT}`);
    const dec = ast.statements.find((s): s is Decision => s.type === "Decision")!;
    // buildCRL already ran classification; run it again → still a single CriterionRef.
    const again = classifyCriterionRefs(ast);
    const dec2 = again.statements.find((s): s is Decision => s.type === "Decision")!;
    expect(firstWhenCond(dec).type).toBe("BranchConditionCriterionRef");
    expect(firstWhenCond(dec2).type).toBe("BranchConditionCriterionRef");
  });
});

describe("criterion — #236: a criterion ref is a DNF/arm-count LITERAL; concept-only seams still throw", () => {
  const critRef: BranchCondition = {
    type: "BranchConditionCriterionRef",
    ref: "Eligible",
    location: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
  };
  const notCrit: BranchCondition = {
    type: "BranchConditionNot",
    operand: critRef,
    location: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
  };

  it("branchConditionDNF: a positive criterion ref is ONE arm, ONE positive criterion literal (#236)", () => {
    const dnf = branchConditionDNF(critRef);
    expect(dnf).toHaveLength(1);
    expect(dnf[0]).toHaveLength(1);
    expect(dnf[0][0].type).toBe("BranchConditionCriterionRef");
  });
  it("branchConditionDNF: `not <criterion>` is ONE arm, ONE negated-criterion literal (Not over a crit ref)", () => {
    const dnf = branchConditionDNF(notCrit);
    expect(dnf).toHaveLength(1);
    expect(dnf[0]).toHaveLength(1);
    const lit = dnf[0][0];
    expect(lit.type).toBe("BranchConditionNot");
    expect((lit as { operand: BranchCondition }).operand.type).toBe("BranchConditionCriterionRef");
  });
  it("branchConditionArmCount: a criterion is ONE arm — the exponential dies here (#236)", () => {
    expect(branchConditionArmCount(critRef)).toBe(1);
    expect(branchConditionArmCount(notCrit)).toBe(1);
  });
  it("branchConditionConceptRefsStrict STILL throws — a criterion at a CONCEPT-ONLY seam is a bug", () => {
    expect(() => branchConditionConceptRefsStrict(critRef, "test")).toThrow(/concept-only seam/i);
  });
  it("the tolerant branchConditionRefs SKIPS a criterion ref (source-side, no throw)", () => {
    expect(branchConditionRefs(critRef)).toEqual([]);
  });
  it("describeBranchCondition renders the criterion NAME (source-side label)", () => {
    expect(describeBranchCondition(critRef, (r) => String(r))).toBe("Eligible");
  });
});
