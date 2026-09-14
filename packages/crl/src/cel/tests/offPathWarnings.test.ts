// REFACTOR:grounded: warnings are advisory and require a demonstrated skipped local question.
import { afterEach, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mvOffPathWarnings } from "../offPathWarnings";
import { resolveCelSuite, type CelSuite } from "../suite";
import { emitCelSuite } from "../suiteEmit";
import * as viewModel from "../../cre/viewModel";
import * as cre from "../../cre/run";

const roots: string[] = [];
const question = (name: string) => `concept "${name}":
- shape is Record.
- shape reduction is most recent.
- type is Observation.
- value type is boolean.
- code is \`${name.toLowerCase()}\`.
`;
function fixture(first = "true", extra = "", facts = '- fact is "A".\n- fact is "B".'): CelSuite {
  const root = mkdtempSync(join(tmpdir(), "crl-offpath-")); roots.push(root);
  mkdirSync(join(root, "src/crl"), { recursive: true }); mkdirSync(join(root, "src/cel/mv"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "offpath", version: "1.0.0", crl: { canonicalBase: "http://example.org/offpath" } }));
  writeFileSync(join(root, "src/crl/policy.crl"), `library "Policy".
${question("A")}${question("B")}${extra}
activity "Met":
- request CPGServiceRequest.
- with \`met\`.
activity "Unmet":
- request CPGCommunicationRequest.
- with \`unmet\`.
decision "D":
first:
- when "A" then recommend activity "Met".
- when "B" then recommend activity "Met".
- otherwise then recommend activity "Unmet".
`);
  writeFileSync(join(root, "src/cel/mv/cases.cel"), `library "Clinical".
covers "Policy".
fact "Subject":
- name is "Subject".
- defined by "Patient".
fact "A":
- defined by "Policy"."A".
- value is ${first}.
fact "B":
- defined by "Policy"."B".
- value is true.
case "Clinical route":
- id is "clinical-route".
- subject is "Subject".
${facts}
- result is "D" is "Met".
`);
  const selected = resolveCelSuite(root);
  if (!selected.ok) throw new Error(JSON.stringify(selected));
  return selected.suite;
}
afterEach(() => { vi.restoreAllMocks(); for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });

// @kit mv-case-authoring:off-path-advisory
it("warns about later preempted B while preserving exactly the supplied data", () => {
  const suite = fixture(), now = new Date("2026-09-13T00:00:00Z");
  const before = emitCelSuite(suite, now), source = readFileSync(suite.files[0].path, "utf8");
  expect(before.result.diagnostics.filter(d => d.severity === "error")).toEqual([]);
  expect(mvOffPathWarnings(suite, now)).toMatchObject([{ kind: "mv-off-path-data", factName: "B", severity: "warning" }]);
  expect(emitCelSuite(suite, now)).toEqual(before);
  expect(readFileSync(suite.files[0].path, "utf8")).toBe(source);
});
it("keeps earlier false evidence needed to reach B", () => { expect(mvOffPathWarnings(fixture("false"))).toEqual([]); });
it("does not warn on a pause caused by missing A", () => { expect(mvOffPathWarnings(fixture("true", "", '- fact is "B".'))).toEqual([]); });
it("suppresses advice when a criterion computes from B", () => { expect(mvOffPathWarnings(fixture("true", 'criterion "Depends":\n- when ("B" and "A").'))).toEqual([]); });
it("suppresses advice for a potentially overlapping unfiltered source retrieve", () => {
  expect(mvOffPathWarnings(fixture("true", `concept "Other":
- shape is Record.
- shape reduction is most recent.
- value type is boolean.
- source representation:
  - type is Observation.
`))).toEqual([]);
});
it("does not run MV minimality advice for the regression union", () => { const suite = fixture(); expect(mvOffPathWarnings({ ...suite, purpose: "regression" })).toEqual([]); });
it("CRE refusal cannot fail or change data emission", () => {
  const suite = fixture(); vi.spyOn(cre, "runCel").mockImplementation(() => { throw new Error("unsupported CRE"); });
  expect(mvOffPathWarnings(suite)).toEqual([]);
  expect(emitCelSuite(suite).result.emittedCases).toHaveLength(1);
});

it("never uses the scenario renderer to establish advice", () => {
  vi.spyOn(viewModel, "renderScenario").mockImplementation(() => { throw new Error("renderer must not run"); });
  expect(mvOffPathWarnings(fixture())).toMatchObject([{ factName: "B" }]);
});

it("conservatively retains B when an unentered shared helper may use it", () => {
  const suite=fixture("true", 'decision "Sub":\nfirst:\n- when "B" then recommend activity "Met".');
  expect(mvOffPathWarnings(suite)).toMatchObject([{ factName: "B" }]);
  const source=suite.files[0].graph.coversTarget!.filePath;
  writeFileSync(source,readFileSync(source,"utf8").replace('- otherwise then recommend activity "Unmet".', '- otherwise then use decision "Sub".'));
  const next=resolveCelSuite(roots[roots.length-1]); if(!next.ok) throw new Error("resolve");
  expect(next.suite.files[0].graph.diagnostics.filter(d => d.severity === "error")).toEqual([]);
  expect(cre.runCel(next.suite.files[0].graph).runs[0].status, JSON.stringify(cre.runCel(next.suite.files[0].graph))).toBe("pass");
  expect(mvOffPathWarnings(next.suite)).toEqual([]);
});
it("advisory traversal retains a local use behind same-named cross-library inputs", () => {
  const suite=fixture(); const root=roots[roots.length-1];
  expect(mvOffPathWarnings(suite)).toMatchObject([{ factName: "B" }]);
  const initialSource=suite.files[0].graph.coversTarget!.filePath;
  writeFileSync(initialSource,readFileSync(initialSource,"utf8").replace('- otherwise then recommend activity "Unmet".', '- otherwise then use decision "LocalStub".')+'\ndecision "LocalStub":\nfirst:\n- otherwise then recommend activity "Unmet".');
  const initial=resolveCelSuite(root); if(!initial.ok) throw new Error("resolve");
  expect(mvOffPathWarnings(initial.suite)).toMatchObject([{ factName: "B" }]);
  const localRun=cre.runCel(initial.suite.files[0].graph);
  writeFileSync(join(root,"src/crl/other.crl"), `library "Other".\n${question("B").replace("`b`", "`other-b`")}\ndecision "Sub":\nfirst:\n- when "B" then use decision "Policy"."LocalSub".`);
  const source=suite.files[0].graph.coversTarget!.filePath;
  writeFileSync(source,readFileSync(source,"utf8").replace('- otherwise then use decision "LocalStub".', '- otherwise then use decision "Other"."Sub".')+'\ndecision "LocalSub":\nfirst:\n- when "B" then recommend activity "Met".');
  const next=resolveCelSuite(root); if(!next.ok) throw new Error(JSON.stringify(next));
  expect(next.suite.files[0].graph.diagnostics.filter(d => d.severity === "error")).toEqual([]);
  // CRE currently refuses foreign delegation in the publication lane. Isolate
  // this advisory consumer with a real trace of the same guarded-out delegation site.
  // Only its never-entered target changes; no trace entry from a different action kind is reused.
  expect(localRun.runs[0].status).toBe("pass");
  const ids = (rows: (typeof localRun.runs)[number]["trace"]): string[] => rows.flatMap(n => [n.nodeId, ...ids(n.children ?? [])]);
  expect(ids(localRun.runs[0].trace)).not.toContain("otherwise/action[0]");
  vi.spyOn(cre,"runCel").mockReturnValue(localRun);
  expect(mvOffPathWarnings(next.suite)).toEqual([]);
});

it("retains whole-file suppression when a sibling case errors", () => {
  const suite = fixture();
  expect(mvOffPathWarnings(suite)).toMatchObject([{ factName: "B" }]);
  const path = suite.files[0].path;
  writeFileSync(path, readFileSync(path, "utf8") + '\ncase "Unsupported":\n- subject is "Subject".\n- result is "D" is "Met".\n- result is "D" is "Unmet".');
  const selected = resolveCelSuite(roots.at(-1)!); if (!selected.ok) throw new Error("resolve");
  expect(cre.runCel(selected.suite.files[0].graph).runs.map(r => r.status)).toEqual(["pass", "error"]);
  expect(mvOffPathWarnings(selected.suite)).toEqual([]);
});
