// REFACTOR:grounded: real suite/data/filesystem path; only the external JVM is substituted.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
const suiteHash = (s: string) => createHash("sha256").update(s).digest("hex");
import { produceResults, produceRegressionResults } from "../produce";
import { readSuiteResult } from "../readSuiteResult";
import type { ProducerCaseState } from "../manifest";

const engine = vi.hoisted(() => ({ state: "generated" as ProducerCaseState, calls: 0, hasInputs: true, inputChanged: undefined as (() => void) | undefined, wait: undefined as (() => Promise<void>) | undefined, probeWait: undefined as Promise<void> | undefined, uncertainAt: 0 }));
vi.mock("../spawn", async original => ({ ...await original<typeof import("../spawn")>(), verifyJar: () => ({ ok: true, hasLauncher: true, sha256: "engine-sha" }), resolveJavaAsync: async () => { await engine.probeWait; return { ok: true, javaExe: "fake-java", major: 21 }; } }));
vi.mock("../runtimeFingerprint", async original => ({ ...await original<typeof import("../runtimeFingerprint")>(), runtimeFingerprint: async () => ({sha256:"runtime",cleanupConfirmed:true}) }));
vi.mock("../driver", () => ({ driverReady: () => ({ ok: true }) }));
vi.mock("../../emit-two-lane", () => ({ emitCrlTwoLane: () => ({ success: true, cqlLibraries: [], fhir: { resources: [
  { resource: { resourceType: "PlanDefinition", id: "policy", type: { coding: [{ code: "workflow-definition" }] }, date: "2026-09-13", action: engine.hasInputs ? [{ input: [{ type: "Observation", profile: ["http://example.org/A"] }] }] : [] } },
] } }) }));
vi.mock("../runProducer", () => ({ runOneCase: async (opts: { artifactRoot: string }, input: { caseName: string; compartmentId: string }) => {
  engine.calls++; await engine.wait?.(); engine.inputChanged?.();
  const artifacts = ["Questionnaire", "QuestionnaireResponse"].map(resourceType => {
    const path = `tests/results/fhir/patient/${input.compartmentId}/${resourceType.toLowerCase()}/form.json`;
    const bytes = JSON.stringify({ resourceType, id: "form" }) + "\n";
    const file = join(opts.artifactRoot, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes);
    return { path, resourceType, id: "form", sha256: suiteHash(bytes) };
  });
  return { caseName: input.caseName, compartmentDir: `patient/${input.compartmentId}`, state: engine.state, artifacts, ...(engine.calls === engine.uncertainAt ? {cleanupUncertain: true, state: "failed", reason: "cleanup unconfirmed"} : {}) };
} }));

const roots: string[] = [];
let root: string;
function put(file: string, text: string): void { const p = join(root, file); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); }
const cel = (lib: string, id: string) => `library "${lib}".
covers "Policy".
fact "Subject":
- name is "Subject".
- defined by "Patient".
fact "A":
- defined by "Policy"."A".
- value is true.
case "Same name":
- id is "${id}".
- subject is "Subject".
- fact is "A".
`;
beforeEach(() => {
  engine.state = "generated"; engine.calls = 0; engine.hasInputs = true; engine.inputChanged = undefined; engine.wait = undefined; engine.probeWait = undefined; engine.uncertainAt = 0;
  root = mkdtempSync(join(tmpdir(), "crl-suite-results-")); roots.push(root);
  put("package.json", JSON.stringify({ name: "results", version: "1.0.0", crl: { canonicalBase: "http://example.org/results" } }));
  put("src/crl/policy.crl", 'library "Policy".\nconcept "A":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `a`.\n');
  put("src/cel/mv/a.cel", cel("Clinical A", "a")); put("src/cel/mv/b.cel", cel("Clinical B", "b")); put("src/cel/regression/control.cel", cel("Control", "control"));
});
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
const request = () => ({ celPath: join(root, "src/cel/mv/a.cel"), crlPath: join(root, "src/crl/policy.crl"), outRoot: root, useCase: "prior-auth" as const, crlVersion: "test", jarPath: "fake.jar" });

it("publishes two same-name MV cases once, replaces all generated files and verifies manifest-bound reading", async () => {
  put("tests/results/questionnaire-manifest-old-library.json", "{}");
  put("tests/results/fhir/patient/old/observation/keep.json", "user");
  put("tests/results/fhir/patient/old/questionnaire/old.json", "old");
  const result = await produceResults(request()); expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.reason);
  expect(existsSync(join(root,"tests/results/questionnaire-manifest-old-library.json"))).toBe(false);
  expect(engine.calls).toBe(2); expect(result.manifest.cases.map(c => c.caseId)).toEqual(["a", "b"]);
  expect(result.manifest).toMatchObject({ schemaVersion: 1, celLibrary: "mv" });
  expect(existsSync(join(root, "tests/results/fhir/patient/old/questionnaire/old.json"))).toBe(false);
  expect(existsSync(join(root, "tests/results/fhir/patient/old/observation/keep.json"))).toBe(false);
  expect(readSuiteResult(request().celPath, result.manifest.cases[0].compartmentDir)).toMatchObject({ q: { resourceType: "Questionnaire" }, qr: { resourceType: "QuestionnaireResponse" } });
  const artifact = result.manifest.cases[0].artifacts![0]; writeFileSync(join(root, artifact.path), "{}");
  expect(readSuiteResult(request().celPath, result.manifest.cases[0].compartmentDir).lookedFor).toContain("identity differs");
});

it.each(["failed", "timeout", "not-run", "populate-degraded"] as ProducerCaseState[])("reports %s in the normal results manifest", async state => {
  engine.state = state;
  const result = await produceResults(request()); expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(result.failed).toBe(2);
  expect(result.manifest.cases.every(c => c.state === state)).toBe(true);
  expect(readSuiteResult(request().celPath, result.manifest.cases[0].compartmentDir).lookedFor).toContain(state);
  expect(existsSync(join(root, "tests/results/failed-candidates"))).toBe(false);
});
it.each([true, false])("reports native no-questionnaire without inferring route applicability from closure inputs (%s)", async hasInputs => {
  engine.hasInputs = hasInputs; engine.state = "no-questionnaire";
  const result = await produceResults(request());
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.manifest.cases.every(c => c.state === "no-questionnaire")).toBe(true);
});
it("clears owned results for explicitly empty MV without invoking the engine", async () => {
  const first = await produceResults(request()); if (!first.ok) throw new Error(first.reason);
  rmSync(join(root, "src/cel/mv"), { recursive: true }); mkdirSync(join(root, "src/cel/mv")); engine.calls = 0;
  const result = await produceResults({ ...request(), celPath: root }); expect(result.ok).toBe(true); expect(engine.calls).toBe(0);
  expect(JSON.parse(readFileSync(first.manifestPath, "utf8")).cases).toEqual([]);
});
// @kit mv-case-authoring:regression-isolation
it("runs MV plus regression once each in an automatically created temporary directory", async () => {
  const result = await produceRegressionResults({ ...request(), projectPath: root });
  expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.reason);
  roots.push(dirname(dirname(dirname(result.manifestPath))));
  expect(result.manifest.celLibrary).toBe("regression"); expect(engine.calls).toBe(3);
  expect(existsSync(join(root, "tests/results/questionnaire-manifest-mv.json"))).toBe(false);
  expect(result.manifestPath.startsWith(root)).toBe(false);
});

it("does not read a case compartment redirected outside the selected project", async () => {
  const result = await produceResults(request()); if (!result.ok) throw new Error(result.reason);
  const entry = result.manifest.cases[0];
  const outside = mkdtempSync(join(tmpdir(), "crl-outside-results-")); roots.push(outside);
  const original = join(root, "tests/results/fhir", entry.compartmentDir), moved = join(outside, "case");
  renameSync(original, moved); symlinkSync(moved, original, process.platform === "win32" ? "junction" : "dir");
  expect(readSuiteResult(request().celPath, entry.compartmentDir).lookedFor).toContain("escapes its policy root");
});


it("rejects overlapping requests; cancelling the rejected request does not affect the accepted run", async () => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; }); engine.wait = () => wait;
  const first = produceResults(request());
  await vi.waitFor(() => expect(engine.calls).toBe(1));
  const rejectedAbort = new AbortController();
  const second = await produceResults({ ...request(), signal: rejectedAbort.signal });
  expect(second).toMatchObject({ok:false, reason:expect.stringContaining("busy")});
  rejectedAbort.abort(); release();
  expect(await first).toMatchObject({ok:true, failed:0}); expect(engine.calls).toBe(2);
});
it("cancels discovery without launching a case", async () => {
  let release!: () => void;
  engine.probeWait = new Promise<void>(resolve => { release = resolve; });
  const controller = new AbortController(); const work = produceResults({...request(), signal:controller.signal});
  controller.abort(); release();
  expect(await work).toMatchObject({ok:false, reason:expect.stringContaining("cancelled")}); expect(engine.calls).toBe(0);
});
it("cancellation persists between cases and accounts for unreached rows", async () => {
  const controller = new AbortController(); engine.inputChanged = () => controller.abort();
  const outcome = await produceResults({...request(), signal:controller.signal});
  expect(outcome.ok).toBe(true); if(!outcome.ok) throw Error(outcome.reason);
  expect(outcome.manifest.cases.map(c=>c.state)).toEqual(["generated","not-run"]); expect(engine.calls).toBe(1);
});
it.each([0,-1,NaN,Infinity,1.5,2147483648])("refuses invalid timeout %s before execution", async caseTimeoutMs => {
  const result = await produceResults({...request(), caseTimeoutMs});
  expect(result.ok).toBe(false); expect(engine.calls).toBe(0);
});
it("accounts for cleanup uncertainty, skips pruning, and quarantines subsequent requests", async () => {
  put("src/cel/mv/c.cel", cel("Clinical C", "c"));
  expect(await produceResults(request())).toMatchObject({ok:true,failed:0});
  put("tests/results/fhir/patient/stale/questionnaire/stale.json", "{}");
  engine.calls=0; engine.uncertainAt=2;
  engine.inputChanged=()=>put("tests/results/during-run.txt","keep after cleanup uncertainty");
  const result=await produceResults(request()); expect(result.ok).toBe(true); if(!result.ok) throw Error(result.reason);
  expect(result.manifest.cases.map(c=>c.state)).toEqual(["generated","failed","not-run"]);
  expect(result.failed).toBe(2); expect(result.pruned).toEqual([]);
  expect(existsSync(join(root,"tests/results/fhir/patient/stale/questionnaire/stale.json"))).toBe(false);
  expect(existsSync(join(root,"tests/results/during-run.txt"))).toBe(true);
  expect(JSON.parse(readFileSync(result.manifestPath,"utf8")).cases[1].cleanupUncertain).toBe(true);
  expect(await produceResults(request())).toMatchObject({ok:false,reason:expect.stringContaining("cleanup was not confirmed")});
  expect(engine.calls).toBe(2);
});
