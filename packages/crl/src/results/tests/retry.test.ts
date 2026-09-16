// REFACTOR:grounded: real suite/data/filesystem path; only the external JVM is substituted.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
const suiteHash = (s: string) => createHash("sha256").update(s).digest("hex");
import { produceResults, produceRegressionResults } from "../produce";
import { readSuiteResult } from "../readSuiteResult";
import type { ProducerCaseState } from "../manifest";

const engine = vi.hoisted(() => ({ state: "generated" as ProducerCaseState, calls: 0, hasInputs: true, inputChanged: undefined as (() => void) | undefined, wait: undefined as (() => Promise<void>) | undefined, probeWait: undefined as Promise<void> | undefined, uncertainAt: 0, failId: "", runtime: "runtime" }));
vi.mock("../spawn", async original => ({ ...await original<typeof import("../spawn")>(), verifyJar: () => ({ ok: true, hasLauncher: true, sha256: "engine-sha" }), resolveJavaAsync: async () => { await engine.probeWait; return { ok: true, javaExe: "fake-java", major: 21 }; } }));
vi.mock("../runtimeFingerprint", async original => ({ ...await original<typeof import("../runtimeFingerprint")>(), runtimeFingerprint: async () => ({sha256:engine.runtime,cleanupConfirmed:true}) }));
vi.mock("../driver", () => ({ driverReady: () => ({ ok: true }) }));
vi.mock("../../emit-two-lane", () => ({ emitCrlTwoLane: () => ({ success: true, cqlLibraries: [], fhir: { resources: [
  { resource: { resourceType: "PlanDefinition", id: "policy", type: { coding: [{ code: "workflow-definition" }] }, date: "2026-09-13", action: engine.hasInputs ? [{ input: [{ type: "Observation", profile: ["http://example.org/A"] }] }] : [] } },
] } }) }));
vi.mock("../runProducer", () => ({ runOneCase: async (opts: { artifactRoot: string }, input: { caseName: string; compartmentId: string }) => {
  engine.calls++; await engine.wait?.(); engine.inputChanged?.();
  const artifacts = ["Questionnaire", "QuestionnaireResponse"].map(resourceType => {
    const path = `tests/results/fhir/patient/${input.compartmentId}/${resourceType.toLowerCase()}/form.json`;
    const bytes = JSON.stringify({ resourceType, id: "form", ...(resourceType==="QuestionnaireResponse" ? {questionnaire:"Questionnaire/form"} : {}) }) + "\n";
    const file = join(opts.artifactRoot, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes);
    return { path, resourceType, id: "form", sha256: suiteHash(bytes) };
  });
  return { caseName: input.caseName, compartmentDir: `patient/${input.compartmentId}`, state: engine.failId && engine.calls !== 2 ? "generated" : engine.state, artifacts: engine.state==="no-questionnaire" ? undefined : artifacts, ...(engine.calls === engine.uncertainAt ? {cleanupUncertain: true, state: "failed", reason: "cleanup unconfirmed"} : {}) };
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
  engine.state = "generated"; engine.calls = 0; engine.hasInputs = true; engine.inputChanged = undefined; engine.wait = undefined; engine.probeWait = undefined; engine.uncertainAt = 0; engine.failId="";engine.runtime="runtime";
  root = mkdtempSync(join(tmpdir(), "crl-suite-results-")); roots.push(root);
  put("package.json", JSON.stringify({ name: "results", version: "1.0.0", crl: { canonicalBase: "http://example.org/results" } }));
  put("src/crl/policy.crl", 'library "Policy".\nconcept "A":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `a`.\n');
  put("src/cel/mv/a.cel", cel("Clinical A", "a")); put("src/cel/mv/b.cel", cel("Clinical B", "b")); put("src/cel/regression/control.cel", cel("Control", "control"));
});
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
const request = () => ({ celPath: join(root, "src/cel/mv/a.cel"), crlPath: join(root, "src/crl/policy.crl"), outRoot: root, useCase: "prior-auth" as const, crlVersion: "test", jarPath: "fake.jar" });


async function run(extra: Record<string,unknown> = {}) {
  const r=await produceResults({...request(),...extra});
  if(!r.ok) throw new Error(r.reason);
  return r;
}
// @kit produce-results:compatible-retry
it.each(["failed","timeout","not-run","populate-degraded"] as ProducerCaseState[])("retries %s and preserves the other same-named case",async state=>{
  engine.failId="b"; engine.state=state;
  const first=await run();expect(first.failed).toBe(1);
  const kept=first.manifest.cases.find(c=>c.caseId==="a")!;
  const file=join(root,kept.artifacts![0].path), bytes=readFileSync(file),mtime=statSync(file).mtimeMs;
  engine.failId="";engine.state="generated";engine.calls=0;
  const second=await run({retryFailed:true,caseTimeoutMs:900000});
  expect(engine.calls).toBe(1);expect(second.failed).toBe(0);
  expect(second.manifest.cases.find(c=>c.caseId==="a")).toMatchObject({reused:true,producedAt:kept.producedAt});
  expect(readFileSync(file)).toEqual(bytes);expect(statSync(file).mtimeMs).toBe(mtime);
  engine.calls=0; const third=await run({retryFailed:true});
  expect(engine.calls).toBe(0);expect(third.manifest.cases.every(c=>c.reused)).toBe(true);
  expect(third.manifest.provenance.inputClock).toBe(first.manifest.provenance.inputClock);
});
it("reruns changed input and damaged artifacts; prunes removed cases",async()=>{
  const first=await run();engine.calls=0;
  writeFileSync(join(root,"src/cel/mv/a.cel"),cel("Clinical A","a").replace("value is true","value is false"));
  writeFileSync(join(root,first.manifest.cases[1].artifacts![0].path),"{}");
  const second=await run({retryFailed:true});expect(engine.calls).toBe(2);expect(second.failed).toBe(0);
  rmSync(join(root,"src/cel/mv/b.cel"));engine.calls=0;
  const third=await run({retryFailed:true});expect(engine.calls).toBe(0);expect(third.manifest.cases).toHaveLength(1);
  expect(third.pruned).toHaveLength(2);
});
it.each(["runtime","definitions","old","duplicate"])("refuses incompatible %s before case execution or rewriting",async kind=>{
  const first=await run();engine.calls=0;
  if(kind==="runtime") engine.runtime="different-zone";
  if(kind==="definitions") engine.hasInputs=false;
  if(kind==="old" || kind==="duplicate"){
    const m=first.manifest;if(kind==="old") delete m.provenance.runtimeSha256;else m.cases.push(m.cases[0]);
    writeFileSync(first.manifestPath,JSON.stringify(m));
  }
  const bytes=readFileSync(first.manifestPath);
  const r=await produceResults({...request(),retryFailed:true});
  expect(r.ok).toBe(false);expect(engine.calls).toBe(0);expect(readFileSync(first.manifestPath)).toEqual(bytes);
});
it.each(["compartment","type"])("rejects a linked %s write destination without modifying its target",async mode=>{
  const first=await run(),c=first.manifest.cases[0];
  const linked=join(root,"tests/results/fhir",c.compartmentDir,mode==="type"?"questionnaire":"");
  const target=mkdtempSync(join(tmpdir(),"crl-retry-target-"));roots.push(target);
  writeFileSync(join(target,"sentinel"),"untouched");
  rmSync(linked,{recursive:true});symlinkSync(target,linked,"junction");engine.calls=0;
  const r=await produceResults({...request(),retryFailed:true});
  expect(r.ok).toBe(false);expect(engine.calls).toBe(0);
  expect(readdirSync(target)).toEqual(["sentinel"]);
});
it("never follows a manifest artifact outside the matching case",async()=>{
  const first=await run(),outside=join(root,"private.json");writeFileSync(outside,"untouched");
  first.manifest.cases[0].artifacts![0].path="../private.json";
  writeFileSync(first.manifestPath,JSON.stringify(first.manifest));engine.calls=0;
  await run({retryFailed:true});expect(engine.calls).toBe(1);expect(readFileSync(outside,"utf8")).toBe("untouched");
});
it("reuses a no-questionnaire result only when there are no artifacts",async()=>{
  engine.state="no-questionnaire";const first=await run();engine.calls=0;
  const result=await run({retryFailed:true});expect(engine.calls).toBe(0);
  expect(result.manifest.cases.every(c=>c.reused)).toBe(true);
});
// @kit mv-case-authoring:regression-retry-isolation
it("retries regression only in its previous scratch, never in the MV destination",async()=>{
  const first=await produceRegressionResults({...request(),projectPath:root});
  if(!first.ok) throw new Error(first.reason);
  roots.push(dirname(dirname(dirname(first.manifestPath))));engine.calls=0;
  const again=await produceRegressionResults({...request(),projectPath:root,retryFrom:first.manifestPath});
  expect(again.ok).toBe(true);expect(engine.calls).toBe(0);
  const copied=join(root,"tests/results/questionnaire-manifest-regression.json");
  mkdirSync(dirname(copied),{recursive:true});writeFileSync(copied,JSON.stringify(first.manifest));
  const refused=await produceRegressionResults({...request(),projectPath:root,retryFrom:copied});
  expect(refused.ok).toBe(false);expect(engine.calls).toBe(0);
  writeFileSync(join(dirname(first.manifestPath),"questionnaire-manifest-mv.json"),"{}");
  const mixed=await produceRegressionResults({...request(),projectPath:root,retryFrom:first.manifestPath});
  expect(mixed.ok).toBe(false);expect(engine.calls).toBe(0);
});

it("allows a linked temporary-directory parent for fresh regression and retry",async()=>{
  const container=mkdtempSync(join(tmpdir(),"crl-linked-temp-"));roots.push(container);
  const real=join(container,"real"), alias=join(container,"alias");mkdirSync(real);
  symlinkSync(real,alias,"junction");
  const keys=["TMPDIR","TMP","TEMP"] as const;
  const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try {
    for(const k of keys) process.env[k]=alias;
    const first=await produceRegressionResults({...request(),projectPath:root});
    expect(first.ok).toBe(true);if(!first.ok) throw Error(first.reason);
    expect(first.manifestPath.startsWith(real)).toBe(true);
    const aliasManifest=first.manifestPath.replace(real,alias);engine.calls=0;
    const retried=await produceRegressionResults({...request(),projectPath:root,retryFrom:aliasManifest});
    expect(retried.ok).toBe(true);expect(engine.calls).toBe(0);
  } finally { for(const k of keys) {if(saved[k]===undefined) delete process.env[k];else process.env[k]=saved[k];} }
});
