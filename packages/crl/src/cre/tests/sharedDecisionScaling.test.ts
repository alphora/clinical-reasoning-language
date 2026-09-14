// REFACTOR:grounded: distinct source decisions and actual execution occurrences bound the view.
import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCelImports } from "../../cel/imports";
import { resolveCelSuite } from "../../cel/suite";
import { validateCelCommand } from "../../cel/validateCommand";
import { emitCrlTwoLane } from "../../emit-two-lane";
import { buildExecutionModel } from "../../provenance/cockpitModel";
import { collectDecisionArmsTransitive } from "../../ast/decisionArms";
import { getRefName, type Decision } from "../../ast/types";
import { mvOffPathWarnings } from "../../cel/offPathWarnings";
import type { ViewNode } from "../viewModel";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function shared(depth: number, cases = 2) {
  const root = mkdtempSync(join(tmpdir(), "crl-shared-decision-")); roots.push(root);
  mkdirSync(join(root, "src/crl"), { recursive: true }); mkdirSync(join(root, "src/cel/mv"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "shared-decision", version: "1.0.0", crl: { canonicalBase: "https://example.org/shared-decision" } }));
  const question = (name: string) => `concept "${name}":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is \`${name.toLowerCase()}\`.\n- shape reduction is most recent.\n`;
  let crl = 'library "Shared".\n';
  for (let i = 0; i < depth; i++) crl += question(`C${i}`) + question(`D${i}`);
  crl += question("E") + 'activity "Met":\n- request CPGCommunicationRequest.\n- with `Met`.\nactivity "Unmet":\n- request CPGCommunicationRequest.\n- with `Unmet`.\n';
  for (let i = 0; i < depth; i++) crl += `decision "Step${i}":\nfirst:\n- when "C${i}" then:\n  first:\n  - when "D${i}" then use decision "Step${i + 1}".\n  - otherwise then recommend activity "Unmet".\n  end.\n- otherwise then use decision "Step${i + 1}".\n`;
  crl += `decision "Step${depth}":\nfirst:\n- when "E" then recommend activity "Met".\n- otherwise then recommend activity "Unmet".\n`;
  const source = join(root, "src/crl/policy.crl"); writeFileSync(source, crl);
  let cel = 'library "Cases".\ncovers "Shared".\nfact "Patient":\n- name is "Synthetic".\n- birth date is "1970-01-01".\n- defined by "Patient".\n';
  for (let i = 0; i < depth; i++) cel += `fact "C${i}":\n- defined by "Shared"."C${i}".\n- value is false.\n`;
  cel += 'fact "E":\n- defined by "Shared"."E".\n- value is true.\n';
  for (let c = 0; c < cases; c++) cel += `case "Case${c}":\n- subject is "Patient".\n${Array.from({ length: depth }, (_, i) => `- fact is "C${i}".\n`).join("")}- fact is "E".\n- result is "Step0" is "Met".\n`;
  const file = join(root, "src/cel/mv/cases.cel"); writeFileSync(file, cel);
  return { root, source, file, graph: resolveCelImports(file) };
}

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
