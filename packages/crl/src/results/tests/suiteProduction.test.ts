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

const engine = vi.hoisted(() => ({ state: "generated" as ProducerCaseState, calls: 0, hasInputs: true, inputChanged: undefined as (() => void) | undefined }));
vi.mock("../spawn", async original => ({ ...await original<typeof import("../spawn")>(), verifyJar: () => ({ ok: true, hasLauncher: true, sha256: "engine-sha" }), resolveJava: () => ({ ok: true, javaExe: "fake-java", major: 21 }) }));
vi.mock("../driver", () => ({ driverReady: () => ({ ok: true }) }));
vi.mock("../../emit-two-lane", () => ({ emitCrlTwoLane: () => ({ success: true, cqlLibraries: [], fhir: { resources: [
  { resource: { resourceType: "PlanDefinition", id: "policy", type: { coding: [{ code: "workflow-definition" }] }, date: "2026-09-13", action: engine.hasInputs ? [{ input: [{ type: "Observation", profile: ["http://example.org/A"] }] }] : [] } },
] } }) }));
vi.mock("../runProducer", () => ({ runOneCase: (opts: { artifactRoot: string }, input: { caseName: string; compartmentId: string }) => {
  engine.calls++; engine.inputChanged?.();
  const artifacts = ["Questionnaire", "QuestionnaireResponse"].map(resourceType => {
    const path = `tests/results/fhir/patient/${input.compartmentId}/${resourceType.toLowerCase()}/form.json`;
    const bytes = JSON.stringify({ resourceType, id: "form" }) + "\n";
    const file = join(opts.artifactRoot, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes);
    return { path, resourceType, id: "form", sha256: suiteHash(bytes) };
  });
  return { caseName: input.caseName, compartmentDir: `patient/${input.compartmentId}`, state: engine.state, artifacts };
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
  engine.state = "generated"; engine.calls = 0; engine.hasInputs = true; engine.inputChanged = undefined;
  root = mkdtempSync(join(tmpdir(), "crl-suite-results-")); roots.push(root);
  put("package.json", JSON.stringify({ name: "results", version: "1.0.0", crl: { canonicalBase: "http://example.org/results" } }));
  put("src/crl/policy.crl", 'library "Policy".\nconcept "A":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `a`.\n');
  put("src/cel/mv/a.cel", cel("Clinical A", "a")); put("src/cel/mv/b.cel", cel("Clinical B", "b")); put("src/cel/regression/control.cel", cel("Control", "control"));
});
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
const request = () => ({ celPath: join(root, "src/cel/mv/a.cel"), crlPath: join(root, "src/crl/policy.crl"), outRoot: root, useCase: "prior-auth" as const, crlVersion: "test", jarPath: "fake.jar" });

it("publishes two same-name MV cases once, preserves foreign types and verifies manifest-bound reading", () => {
  put("tests/results/questionnaire-manifest-old-library.json", "{}");
  put("tests/results/fhir/patient/old/observation/keep.json", "user");
  put("tests/results/fhir/patient/old/questionnaire/old.json", "old");
  const result = produceResults(request()); expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.reason);
  expect(result.orphaned).toContain("tests/results/questionnaire-manifest-old-library.json");
  expect(engine.calls).toBe(2); expect(result.manifest.cases.map(c => c.caseId)).toEqual(["a", "b"]);
  expect(result.manifest).toMatchObject({ schemaVersion: 1, celLibrary: "mv" });
  expect(existsSync(join(root, "tests/results/fhir/patient/old/questionnaire/old.json"))).toBe(false);
  expect(readFileSync(join(root, "tests/results/fhir/patient/old/observation/keep.json"), "utf8")).toBe("user");
  expect(readSuiteResult(request().celPath, result.manifest.cases[0].compartmentDir)).toMatchObject({ q: { resourceType: "Questionnaire" }, qr: { resourceType: "QuestionnaireResponse" } });
  const artifact = result.manifest.cases[0].artifacts![0]; writeFileSync(join(root, artifact.path), "{}");
  expect(readSuiteResult(request().celPath, result.manifest.cases[0].compartmentDir).lookedFor).toContain("identity differs");
});

it.each(["failed", "timeout", "not-run", "populate-degraded"] as ProducerCaseState[])("reports %s in the normal results manifest", state => {
  engine.state = state;
  const result = produceResults(request()); expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(result.failed).toBe(2);
  expect(result.manifest.cases.every(c => c.state === state)).toBe(true);
  expect(readSuiteResult(request().celPath, result.manifest.cases[0].compartmentDir).lookedFor).toContain(state);
  expect(existsSync(join(root, "tests/results/failed-candidates"))).toBe(false);
});
it.each([true, false])("reports native no-questionnaire without inferring route applicability from closure inputs (%s)", hasInputs => {
  engine.hasInputs = hasInputs; engine.state = "no-questionnaire";
  const result = produceResults(request());
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.manifest.cases.every(c => c.state === "no-questionnaire")).toBe(true);
});
it("clears owned results for explicitly empty MV without invoking the engine", () => {
  const first = produceResults(request()); if (!first.ok) throw new Error(first.reason);
  rmSync(join(root, "src/cel/mv"), { recursive: true }); mkdirSync(join(root, "src/cel/mv")); engine.calls = 0;
  const result = produceResults({ ...request(), celPath: root }); expect(result.ok).toBe(true); expect(engine.calls).toBe(0);
  expect(JSON.parse(readFileSync(first.manifestPath, "utf8")).cases).toEqual([]);
});
// @kit mv-case-authoring:regression-isolation
it("runs MV plus regression once each in an automatically created temporary directory", () => {
  const result = produceRegressionResults({ ...request(), projectPath: root });
  expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.reason);
  roots.push(dirname(dirname(dirname(result.manifestPath))));
  expect(result.manifest.celLibrary).toBe("regression"); expect(engine.calls).toBe(3);
  expect(existsSync(join(root, "tests/results/questionnaire-manifest-mv.json"))).toBe(false);
  expect(result.manifestPath.startsWith(root)).toBe(false);
});

it("does not read a case compartment redirected outside the selected project", () => {
  const result = produceResults(request()); if (!result.ok) throw new Error(result.reason);
  const entry = result.manifest.cases[0];
  const outside = mkdtempSync(join(tmpdir(), "crl-outside-results-")); roots.push(outside);
  const original = join(root, "tests/results/fhir", entry.compartmentDir), moved = join(outside, "case");
  renameSync(original, moved); symlinkSync(moved, original, process.platform === "win32" ? "junction" : "dir");
  expect(readSuiteResult(request().celPath, entry.compartmentDir).lookedFor).toContain("escapes its policy root");
});
