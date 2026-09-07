import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCelImports } from "../../cel/imports";
import { validateCEL } from "../../cel/validator";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { runCel } from "../run";
import { renderScenario } from "../viewModel";
import { failedCriterionFrontier } from "../../provenance/failedCriteria";

// Independent test directories vary; compare execution state while retaining all source ranges.
const withoutFilePaths = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => key === "filePath" ? "<fixture>" : item));

// REFACTOR:grounded (#320): CEL expresses the expectation. These tests prove CRE behavior,
// not native $apply conformance; the latter needs independently executed artifact evidence.
function evaluate(options: { references?: string[]; value?: string; qualifier?: string; expected?: string;
  extraResult?: string; legacy?: boolean; body?: string; code?: string; extraDecision?: string; extraConcept?: string; secondValue?: string } = {}) {
  const parent = path.resolve(tmpdir());
  const directory = mkdtempSync(path.join(parent, "crl-pause-"));
  if (path.dirname(directory) !== parent || !path.basename(directory).startsWith("crl-pause-")) throw new Error("Unexpected temporary directory");
  try {
    writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "pause-test", version: "0.0.0", crl: { canonicalBase: "http://example.org/pause" } }));
    const concept = (name: string) => `concept "${name}":
- type is Observation.
- value type is boolean.
- code is \`${name.toLowerCase()}\`.
${options.legacy ? "- shape is Scalar." : "- shape is Record.\n- shape reduction is most recent."}`;
    writeFileSync(path.join(directory, "policy.crl"), `library "Policy".
${concept("X")}
${concept("Y")}
${options.extraConcept ?? ""}
activity "A":
- request CPGCommunicationRequest.
- with \`A\`.
activity "pause":
- request CPGCommunicationRequest.
- with \`PAUSE-LABEL\`.
decision "D":
${options.qualifier ?? "first"}:
${options.body ?? '- when "X" then recommend activity "A".\n- when "Y" then recommend activity "pause".'}
${options.extraDecision ?? ""}`);
    const celPath = path.join(directory, "cases.cel");
    writeFileSync(celPath, `library "Cases".
covers "Policy".
fact "Subject":
- name is "Synthetic".
- birth date is "1970-01-01".
- defined by "Patient".
fact "X":
- defined by "Policy"."X".
${options.value === undefined ? "" : `- value is ${options.value}.`}
${options.code ? `- code is "${options.code}".` : ""}
fact "Y":
- defined by "Policy"."Y".
- value is ${options.secondValue ?? "false"}.
case "Case":
- subject is "Subject".
${(options.references ?? []).map((name) => `- fact is "${name}".`).join("\n")}
- result is "D" is ${options.expected ?? "pause"}.
${options.extraResult ?? ""}`);
    const graph = resolveCelImports(celPath);
    expect(graph.celParseErrors).toEqual([]);
    const result = runCel(graph);
    expect(result.schemaVersion).toBe(1);
    return { graph, validation: validateCEL(graph), run: result.runs[0], view: renderScenario(graph).scenarios[0], emission: emitCelToFhir(graph) };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe("CEL expected pause", () => {
  it.each(["first", "all"])("%s: missing and explicit unknown pause, explicit false is not a pause", (qualifier) => {
    for (const references of [[], ["X"]]) {
      const { run, validation, view } = evaluate({ qualifier, references });
      expect(validation.errors).toEqual([]);
      expect(run.status).toBe("pass");
      expect(run.expected).toEqual({ leaf: "D", pause: true });
      expect(run.produced).toEqual([]);
      expect(run.trace[0].unknown).toBe(true);
      expect(run.trace[0].satisfied).toBeUndefined();
      expect(view.expected).toEqual({ decision: "D", pause: true });
      expect(view.tree[0].unknown).toBe(true);
      expect(view.tree[0].condition?.satisfied).toBeUndefined();
      expect(view.tree[0].condition?.expr.satisfied).toBeUndefined();
    }
    const { run } = evaluate({ qualifier, value: "false", references: ["X", "Y"] });
    expect(run.status).toBe("fail");
    expect(run.trace.some((n) => n.unknown)).toBe(false);
    expect(run.diagnostics.join(" ")).toContain("no unknown condition");
  });

  it("later answer reaches the activity; that execution fails an expected pause", () => {
    const answered = { value: "true", references: ["X"] };
    expect(evaluate().run.status).toBe("pass");
    const { run } = evaluate(answered);
    expect(run.status).toBe("fail");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["A"]);
    expect(run.diagnostics.join(" ")).toContain("CRE produced A");
    expect(run.diagnostics.join(" ")).toContain("when[0]/action[0]");
    expect(evaluate({ ...answered, expected: '"A"' }).run.status).toBe("pass");
  });

  it("unordered partial production is retained and cannot pass whole-decision pause", () => {
    const { run } = evaluate({ qualifier: "all", references: ["X"], value: "true" });
    expect(run.status).toBe("fail");
    expect(run.trace[1].unknown).toBe(true);
    expect(run.produced.map((p) => p.recommendation)).toEqual(["A"]);
  });

  it("quoted pause stays an ordinary activity assertion", () => {
    const { run, validation } = evaluate({ body: '- otherwise then recommend activity "pause".', expected: '"pause"' });
    expect(validation.errors).toEqual([]);
    expect(run.expected).toEqual({ leaf: "D", branch: "pause" });
    expect(run.status).toBe("pass");
  });

  it.each([false, true])("rejects malformed inputs even when direct callers skip validation (legacy=%s)", (legacy) => {
    for (const input of [{ references: ["Missing"] }, { references: ["X"], value: '"not a boolean"' }]) {
      const { run, validation } = evaluate({ ...input, legacy });
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(run.status).toBe("error");
      expect(run.diagnostics.join(" ")).toContain("pause-graph-validation");
    }
  });

  it("allows intentional nonmember warnings without manufacturing evidence", () => {
    const { run, validation } = evaluate({ references: ["X"], value: "true", code: "http://example.org/unrelated|other" });
    expect(validation.errors).toEqual([]);
    expect(validation.warnings.length).toBeGreaterThan(0);
    expect(run.status).toBe("pass");
  });

  it.each(['- result is "D" is "A".', '- result is "D" is pause.'])("rejects conflicting expectations: %s", (extraResult) => {
    const { run, validation } = evaluate({ extraResult });
    expect(validation.errors.some((e) => e.kind === "conflicting-pause-results")).toBe(true);
    expect(run.status).toBe("error");
  });

  it("rejects a Concept pause and keeps the Decision kind diagnostic accurate", () => {
    const { validation } = evaluate({ extraResult: '- result is "X" is pause.' });
    expect(validation.errors.some((e) => e.kind === "invalid-result-shape" && e.message.includes("Concept") && e.message.includes("pause"))).toBe(true);
  });

  it("a compound unknown identifies the decision node without claiming false operands", () => {
    const { view, run } = evaluate({ body: '- when "X" and "Y" then recommend activity "A".' });
    expect(run.status).toBe("pass");
    expect(view.tree[0].condition?.expr).toMatchObject({ op: "and" });
    expect(JSON.stringify(view.tree[0].condition)).not.toContain('"satisfied":false');
  });

  it("delegated unknown pauses at the nested decision node", () => {
    const { run } = evaluate({
      body: '- otherwise then use decision "Sub".',
      extraDecision: 'decision "Sub":\nfirst:\n- when "X" then recommend activity "A".',
    });
    expect(run.status).toBe("pass");
    const nodes = (ns: typeof run.trace): typeof run.trace => ns.flatMap((n) => [n, ...nodes(n.children ?? [])]);
    expect(nodes(run.trace).filter((n) => n.unknown)).toHaveLength(1);
    expect(nodes(run.trace).find((n) => n.unknown)?.nodeId).toContain("when[0]");
  });

  it("unsupported guards stay errors; no pause can hide them", () => {
    const { run } = evaluate({ references: ["X"], value: "true", body: '- when "X" then:\n  any:\n  - recommend activity "A" only when "X".\n  end.' });
    expect(run.status).toBe("error");
    expect(run.diagnostics.join(" ")).toContain("unsupported-context");
  });

  it("legacy unknown action guard cannot certify pause, independent of the assertion", () => {
    const { run } = evaluate({ legacy: true, value: "true", body: '- otherwise then:\n  any:\n  - recommend activity "A" only when "X".\n  end.' });
    expect(run.status).toBe("error");
    expect(run.diagnostics.join(" ")).toContain("unanswered action guard");
    const twin = evaluate({ legacy: true, value: "true", expected: '"A"', body: '- otherwise then:\n  any:\n  - recommend activity "A" only when "X".\n  end.' }).run;
    expect(withoutFilePaths(twin.trace)).toEqual(withoutFilePaths(run.trace));
    expect(twin.produced).toEqual(run.produced);
    expect(twin.diagnostics.join(" ")).toContain("unanswered action guard");
  });

  it("an unresolved reached guard cannot be discarded to obtain a later pause", () => {
    const { run } = evaluate({ body: '- when "Typo" then recommend activity "A".\n- when "X" then recommend activity "A".' });
    expect(run.status).toBe("error");
    expect(run.diagnostics.join(" ")).toContain('unresolved guard "Typo"');
    const twin = evaluate({ expected: '"A"', body: '- when "Typo" then recommend activity "A".\n- when "X" then recommend activity "A".' }).run;
    expect(twin.status).toBe("error");
    expect(withoutFilePaths(twin.trace)).toEqual(withoutFilePaths(run.trace));
  });

  it.each([
    '- when "X" then recommend activity "A".',
    '- when "X" then recommend activity "pause".\n- otherwise then recommend activity "A".',
  ])("an activity expectation retains a pending frontier: %s", (body) => {
    const { view } = evaluate({ expected: '"A"', body });
    expect(view.status).toBe("fail");
    expect(failedCriterionFrontier(view)).toMatchObject([{ nodeId: "when[0]", reason: "unknown-when" }]);
  });

  it("retains established true in a compound unknown and preserves expectation on input error", () => {
    const { view } = evaluate({ value: "true", references: ["X"], body: '- when "X" and "Y" then recommend activity "A".' });
    expect(view.tree[0].condition?.expr).toMatchObject({ op: "and", operands: [{ satisfied: true }, { op: "ref" }] });
    const invalid = evaluate({ references: ["Missing"] });
    expect(invalid.run.expected).toEqual({ leaf: "D", pause: true });
    expect(invalid.run.diagnostics[0]).toMatch(/cases\.cel:\d+:/);
  });

  it("CEL assertion choice does not alter emitted data", () => {
    const paused = evaluate();
    const activity = evaluate({ expected: '"A"' });
    const data = (result: typeof paused) => result.emission.emittedCases.map((c) => c.resources.map((r) => r.body));
    expect(data(paused)).toEqual(data(activity));
    expect(paused.emission.diagnostics.find((d) => d.kind === "result-deferred")?.message).toContain("no FHIR data resource");
  });

  it.each(["and", "or", "sem-and", "sem-or"])("composition %s preserves the complete three-valued truth table", (op) => {
    for (const x of [true, false, null]) for (const y of [true, false, null]) {
      const want = op.endsWith("and") ? (x === false || y === false ? false : x === null || y === null ? null : true)
        : x === true || y === true ? true : x === null || y === null ? null : false;
      const extraConcept = `concept "Composite":
- shape is Scalar.
- type is Observation.
- value type is boolean.
- defined as ("X" ${op} "Y").`;
      const { run, view } = evaluate({ legacy: true, value: String(x ?? true), secondValue: String(y ?? true),
        references: [...(x === null ? [] : ["X"]), ...(y === null ? [] : ["Y"])], extraConcept,
        expected: want === null ? "pause" : want ? '"A"' : '"pause"',
        body: '- when "Composite" then recommend activity "A".\n- otherwise then recommend activity "pause".' });
      expect(run.status, `${op}: ${x},${y}: ${run.diagnostics.join(";")}`).toBe("pass");
      const expr = view.tree[0].condition?.expr;
      if (expr?.op !== "ref" || !expr.explanation || !("operands" in expr.explanation)) throw new Error("Expected composition explanation");
      expect(expr.explanation.operands.map((x) => x.satisfied)).toEqual([x ?? undefined, y ?? undefined]);
      expect(expr.explanation.operands.map((o) => "satisfied" in o)).toEqual([x !== null, y !== null]);
    }
  });

  it("compound trace preserves explicit false and unknown separately", () => {
    const { view } = evaluate({ value: "false", references: ["X"], body: '- when "X" or "Y" then recommend activity "A".' });
    expect(view.tree[0].condition?.expr).toMatchObject({ op: "or", operands: [{ satisfied: false }, { op: "ref" }] });
    const expr = view.tree[0].condition?.expr;
    if (expr?.op !== "or") throw new Error("Expected or");
    expect(expr.operands[1].satisfied).toBeUndefined();
  });

  it("labels an unrelated invalid case as a graph validation gate", () => {
    const { run } = evaluate({ extraResult: 'case "Unrelated":\n- subject is "Subject".\n- fact is "Missing".\n- result is "D" is "A".' });
    expect(run.status).toBe("error");
    expect(run.expected).toEqual({ leaf: "D", pause: true });
    expect(run.diagnostics.join(" ")).toMatch(/pause-graph-validation:.*unresolved-fact-ref/);
  });

  it.each(["not", "sem-not"])("composition %s preserves unknown and negates known answers", (op) => {
    for (const value of [true, false, null]) {
      const { run } = evaluate({ legacy: true, value: String(value ?? true), references: value === null ? [] : ["X"],
        extraConcept: `concept "Composite":\n- shape is Scalar.\n- type is Observation.\n- value type is boolean.\n- defined as (${op} "X").`,
        expected: value === null ? "pause" : value ? '"pause"' : '"A"',
        body: '- when "Composite" then recommend activity "A".\n- otherwise then recommend activity "pause".' });
      expect(run.status, run.diagnostics.join(";")).toBe("pass");
    }
  });
});
