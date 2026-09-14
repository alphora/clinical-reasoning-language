// REFACTOR:grounded: distinct source decisions and actual execution occurrences bound the view.
import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCelImports } from "../../cel/imports";
import { resolveCelSuite } from "../../cel/suite";
import { validateCelCommand } from "../../cel/validateCommand";
import { runRegression } from "../../cel/regression";
import { emitCrlTwoLane } from "../../emit-two-lane";
import { buildExecutionModel } from "../../provenance/cockpitModel";
import { collectDecisionArmsTransitive } from "../../ast/decisionArms";
import { getRefName, type Decision } from "../../ast/types";
import { mvOffPathWarnings } from "../../cel/offPathWarnings";
import type { ViewNode } from "../viewModel";
import { sharedDecisionSource, SHARED_CONTINUATION_CRL, SHARED_CONTINUATION_CEL, REUSED_CONDITION_CRL, REUSED_CONDITION_CEL } from "../../authoring-kit/decisionExamples";
import { artifactRequirements } from "../../authoring-kit/requirements";
import { runCel, type TraceNode } from "../run";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function shared(depth: number, cases = 2) {
  const root = mkdtempSync(join(tmpdir(), "crl-shared-decision-")); roots.push(root);
  mkdirSync(join(root, "src/crl"), { recursive: true }); mkdirSync(join(root, "src/cel/mv"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "shared-decision", version: "1.0.0", crl: { canonicalBase: "https://example.org/shared-decision" } }));
  const crl = sharedDecisionSource(depth);
  const source = join(root, "src/crl/policy.crl"); writeFileSync(source, crl);
  let cel = 'library "Cases".\ncovers "Shared".\nfact "Patient":\n- name is "Synthetic".\n- birth date is "1970-01-01".\n- defined by "Patient".\n';
  for (let i = 0; i < depth; i++) cel += `fact "C${i}":\n- defined by "Shared"."C${i}".\n- value is false.\n`;
  cel += 'fact "E":\n- defined by "Shared"."E".\n- value is true.\n';
  for (let c = 0; c < cases; c++) cel += `case "Case${c}":\n- subject is "Patient".\n${Array.from({ length: depth }, (_, i) => `- fact is "C${i}".\n`).join("")}- fact is "E".\n- result is "Step0" is "Met".\n`;
  const file = join(root, "src/cel/mv/cases.cel"); writeFileSync(file, cel);
  return { root, source, file, graph: resolveCelImports(file) };
}

// @kit chaining-necessity:shared-definition-emission
it("emits a shared 25-decision graph without expanding all presentation paths", () => {
  const fixture = shared(24);
  const result = emitCrlTwoLane(fixture.source, { date: "2026-09-14" });
  expect(result.success, JSON.stringify({errors: result.hardErrors, unmatched: result.fhir.unmatched})).toBe(true);
  expect(result.hardErrors).toEqual([]);
  expect(result.fhir.resources.filter(r => r.sourceKind === "Decision")).toHaveLength(25);
});

it("collects shared activity reachability with one graph visit per decision", () => {
  const { graph } = shared(24);
  const decisions = new Map(graph.coversTarget!.ast.statements.filter((s): s is Decision => s.type === "Decision").map(d => [d.name, d]));
  let resolutions = 0;
  const actual = collectDecisionArmsTransitive(decisions.get("Step0")!, (_lib, ref) => {
    resolutions++;
    const name = getRefName(ref);
    const decision = decisions.get(name);
    return decision ? { lib: "Shared", decision, filePath: graph.coversTarget!.filePath } : undefined;
  }, "Shared");
  expect([...actual].sort()).toEqual(["Met", "Unmet"]);
  expect(resolutions).toBeLessThanOrEqual(48);
});

// @kit mv-case-authoring:shared-case-projection
it("keeps full source definitions and actual case occurrences in a bounded execution model", () => {
  const { graph, root, file } = shared(24, 3);
  const model = buildExecutionModel(graph);
  expect(model.crlStructure).toHaveLength(25);
  expect(model.scenarios.success).toBe(true);
  expect(model.scenarios.scenarios).toHaveLength(3);
  for (const scenario of model.scenarios.scenarios) {
    const nodes: ViewNode[] = [], walk = (rows: ViewNode[]) => { for (const row of rows) { nodes.push(row); walk(row.children ?? []); } };
    walk(scenario.tree);
    expect(nodes.length).toBeLessThan(260);
    expect(JSON.stringify(scenario).length).toBeLessThan(180_000);
    expect(scenario.produced).toEqual([{ recommendation: "Met", actionKind: "recommend-activity" }]);
    expect(nodes.filter(n => n.action?.deferred)).toHaveLength(24);
    expect(nodes.filter(n => n.action?.produced).map(n => n.nodeId)).toEqual([
      `${"otherwise/action[0]/".repeat(24)}when[0]/action[0]`,
    ]);
  }
  const suite = resolveCelSuite(root); expect(suite.ok).toBe(true);
  if (!suite.ok) throw new Error("suite did not resolve");
  expect(mvOffPathWarnings(suite.suite)).toEqual([]);
  expect(validateCelCommand(file).errors).toEqual([]);
});

function reference(name: string, crl: string, cel: string) {
  const root = mkdtempSync(join(tmpdir(), "crl-decision-reference-")); roots.push(root);
  mkdirSync(join(root, "src/crl"), { recursive: true });
  mkdirSync(join(root, "src/cel/regression"), { recursive: true });
  mkdirSync(join(root, "src/cel/mv"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "decision-reference", version: "1.0.0", crl: artifactRequirements(`${name}.crl`).crl }));
  const source = join(root, `src/crl/${name}.crl`), file = join(root, `src/cel/regression/${name}.cel`);
  writeFileSync(source, crl); writeFileSync(file, cel);
  expect(validateCelCommand(file).errors).toEqual([]);
  expect(validateCelCommand(file).warnings).toEqual([]);
  const regression = runRegression(root);
  expect(regression.success, JSON.stringify(regression)).toBe(true);
  const result = runCel(resolveCelImports(file));
  expect("caseCount" in regression && regression.caseCount).toBe(result.runs.length);
  expect(result.success, JSON.stringify(result)).toBe(true);
  expect(result.runs.every(r => r.status === "pass"), JSON.stringify(result)).toBe(true);
  const emitted = emitCrlTwoLane(source);
  expect(emitted.success).toBe(true);
  expect(emitted.hardErrors).toEqual([]);
  expect(emitted.warnings).toEqual([]);
  return result.runs;
}
const flatten = (nodes: TraceNode[]): TraceNode[] => nodes.flatMap(n => [n, ...flatten(n.children ?? [])]);

// @kit chaining-necessity:ordered-shared-continuation
it("executes the delivered shared continuation with explicit source order, not a flat formula", () => {
  // Fictional source requires C0 first, then D0 when C0 is true, then E.
  // In particular later E=false cannot bypass either required earlier unknown.
  const runs = reference("shared-continuation-reference", SHARED_CONTINUATION_CRL, SHARED_CONTINUATION_CEL);
  expect(runs.map(r => r.produced.map(p => p.recommendation))).toEqual([
    [], ["Met"], ["Unmet"], [], [], ["Unmet"], ["Met"], ["Unmet"], [],
  ]);
  expect(flatten(runs[1].trace).filter(n => n.kind === "action" && n.nodeId.endsWith("when[0]/action[0]")).map(n => n.nodeId)).toContain("otherwise/action[0]/when[0]/action[0]");
  expect(flatten(runs[6].trace).filter(n => n.kind === "action").map(n => n.nodeId)).toContain("when[0]/when[0]/action[0]/when[0]/action[0]");
  expect(runs.map(r => flatten(r.trace).filter(n => n.kind === "when").map(n => n.concept))).toEqual([
    ["C0"], ["C0", "E"], ["C0", "E"], ["C0", "E"], ["C0", "D0"], ["C0", "D0"],
    ["C0", "D0", "E"], ["C0", "D0", "E"], ["C0", "D0", "E"],
  ]);
  // Same fictional source with the remaining branch duplicated inline at both
  // call sites. CRE equivalence does not imply identical native action/group IDs.
  const inline = SHARED_CONTINUATION_CRL
    .replace(/then use decision "Step1"\./g, 'then:\nfirst:\n- when "E" then recommend activity "Met".\n- otherwise then recommend activity "Unmet".\nend.')
    .replace(/decision "Step1":[\s\S]*$/, "");
  const inlineRuns = reference("shared-continuation-reference", inline, SHARED_CONTINUATION_CEL);
  expect(inlineRuns.map(r => r.produced.map(p => p.recommendation))).toEqual(runs.map(r => r.produced.map(p => p.recommendation)));
  expect(inlineRuns.map(r => flatten(r.trace).filter(n => n.kind === "when").map(n => n.concept))).toEqual(runs.map(r => flatten(r.trace).filter(n => n.kind === "when").map(n => n.concept)));
});

// @kit criterion:reused-applicable-condition
it("executes the delivered condition reused on single and combined paths without serializing AND or OR", () => {
  const runs = reference("reused-condition-reference", REUSED_CONDITION_CRL, REUSED_CONDITION_CEL);
  expect(runs.map(r => r.produced.map(p => p.recommendation))).toEqual([
    [], ["Met"], ["Unmet"], [], ["Unmet"], ["Met"], ["Unmet"], ["Unmet"], ["Unmet"], ["Met"], [],
  ]);
  expect(flatten(runs[0].trace).filter(n => n.kind === "when")).toHaveLength(1);
  expect(runs[1].produced[0].viaWhen).not.toEqual(runs[5].produced[0].viaWhen);
});
