import { describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import type { CRL } from "../../ast/types";
import { emitCQLFromAST } from "../emitCQL";
import { emitPartitioned, FULL_PARTITION, type Partition } from "../layeredEmit";

// REFACTOR:grounded (#320, review 563 C1): a foreign criterion cannot bind a local
// namesake. Physical output naming must not make a genuine source self-ref foreign.
function source(target: string, nested: boolean): CRL {
  const result = buildCRL(`# fixture
library "RawPolicy".
terminology "VS":
- valueset is \`vs\`.
concept "Leaf":
- type is Observation.
- coded from "VS".
criterion "Ready":
- when ( "Leaf" ).
${nested ? `criterion "Nested":\n- when ( ${target} ).` : ""}
activity "Approve":
- request CPGServiceRequest.
- with \`approve\`.
decision "D":
first:
- when ${nested ? '"Nested"' : target} then recommend activity "Approve".`);
  if (!result.success || !result.result) throw new Error(JSON.stringify(result.errors));
  // Parsing cannot classify a foreign name without the other library. Exercise the
  // exported typed-AST boundary explicitly, as the FHIR/CRE refusal regressions do.
  // Do not teach the classifier to infer a foreign criterion from a local namesake.
  if (target === '"Foreign"."Ready"') {
    if (nested) {
      const criterion = result.result.statements.find((s) => s.type === "Criterion" && s.name === "Nested");
      if (criterion?.type !== "Criterion" || criterion.condition.type !== "BranchConditionRef") throw new Error("bad fixture");
      criterion.condition = { ...criterion.condition, type: "BranchConditionCriterionRef" };
    } else {
      const decision = result.result.statements.find((s) => s.type === "Decision");
      const branch = decision?.type === "Decision" ? decision.body.statements[0] : undefined;
      if (branch?.type !== "WhenBlock" || branch.condition.type !== "BranchConditionRef") throw new Error("bad fixture");
      branch.condition = { ...branch.condition, type: "BranchConditionCriterionRef" };
    }
  }
  return result.result;
}

const entries = [
  { name: "emitCQLFromAST", emit: (ast: CRL) => emitCQLFromAST(ast, { libraryName: "PhysicalRoot" }) },
  { name: "emitPartitioned", emit: (ast: CRL) => emitPartitioned(ast, "RawPolicy", "PhysicalPolicy", FULL_PARTITION) },
];

describe.each(entries)("$name foreign criterion boundary", ({ emit }) => {
  it.each([false, true])("refuses a foreign criterion with a local namesake (nested=%s)", (nested) => {
    const result = emit(source('"Foreign"."Ready"', nested));
    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      type: "Validation", kind: "criterion-guard-unavailable",
      line: expect.any(Number), column: expect.any(Number),
      message: 'Foreign-qualified criterion "Foreign"."Ready" is unsupported; use a criterion declared in the current library.',
    }));
    if ("entries" in result) expect(result.entries).toEqual([]);
    else expect(result.result).toBeUndefined();
  });

  it.each([false, true])("keeps raw self-qualified criteria legal under a physical library name (nested=%s)", (nested) => {
    const result = emit(source('"RawPolicy"."Ready"', nested));
    expect(result.success).toBe(true);
    expect(result.errors ?? []).toEqual([]);
    const text = "entries" in result
      ? result.entries.map((entry) => entry.result.result).join("\n") : result.result!;
    expect(text).toContain('define "Ready":');
    expect(text).not.toContain('RawPolicy."Ready"');
    if (nested) expect(text).toContain('define "Nested":\n  "Ready"');
  });
});

it("preserves a custom partial partition that omits an unused foreign criterion", () => {
  const input = source('"Foreign"."Ready"', true);
  const partition: Partition = {
    classify: (stmt) => stmt.type === "Decision" || stmt.type === "Activity" ||
      (stmt.type === "Criterion" && stmt.name === "Nested") ? null : "Root",
    order: ["Root"],
    libraryNameFor: () => "PhysicalRoot",
  };
  const result = emitPartitioned(input, "RawPolicy", "PhysicalPolicy", partition);
  expect(result.success).toBe(true);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]!.result.result).toContain('define "Ready":');
  expect(result.entries[0]!.result.result).not.toContain('define "Nested":');
});
