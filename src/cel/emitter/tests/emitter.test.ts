import * as path from "path";

import { resolveCelImports } from "../../imports";
import { emitCelToFhir } from "../emitFhir";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

const CORPUS = {
  cms22: path.join(REPO_ROOT, "features/cql-pattern-mining/results/models/cms22-split/cms22.cel"),
  cms22Strategy: path.join(REPO_ROOT, "features/cql-pattern-mining/results/models/cms22-split/cms22-strategy.cel"),
  cms69: path.join(REPO_ROOT, "features/cql-pattern-mining/results/models/cms69-split/cms69.cel"),
  cms69Strategy: path.join(REPO_ROOT, "features/cql-pattern-mining/results/models/cms69-split/cms69-strategy.cel"),
};

function emit(filePath: string) {
  const graph = resolveCelImports(filePath);
  return emitCelToFhir(graph);
}

describe("CEL Todo 5 — FHIR emitter on corpus", () => {
  test("cms22.cel emits Patient + Encounter + 3 Observations", () => {
    const r = emit(CORPUS.cms22);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.emittedCases).toHaveLength(1);
    const c = r.emittedCases[0];
    const types = c.resources.map((res) => res.resourceType).sort();
    expect(types).toEqual(["Encounter", "Observation", "Observation", "Observation", "Patient"]);
    // Output paths include slugified library + case dirs.
    for (const res of c.resources) {
      expect(res.outputPath).toMatch(/^patient\/cms22-blood-pressure-screening\/maria-has-normal-bp-at-her-wellness-visit\/[A-Za-z]+$/);
    }
  });

  test("cms22-strategy.cel emits Patient + Encounter + Condition + 3 Observations", () => {
    const r = emit(CORPUS.cms22Strategy);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const c = r.emittedCases[0];
    const counts = c.resources.reduce<Record<string, number>>((acc, res) => {
      acc[res.resourceType] = (acc[res.resourceType] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.Patient).toBe(1);
    expect(counts.Encounter).toBe(1);
    expect(counts.Condition).toBe(1);
    expect(counts.Observation).toBe(3);
  });

  test("cms69.cel emits Patient + Encounter + 2 Observations + 1 ServiceRequest", () => {
    const r = emit(CORPUS.cms69);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const c = r.emittedCases[0];
    const counts = c.resources.reduce<Record<string, number>>((acc, res) => {
      acc[res.resourceType] = (acc[res.resourceType] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.Patient).toBe(1);
    expect(counts.Encounter).toBe(1);
    expect(counts.Observation).toBe(2);
    expect(counts.ServiceRequest).toBe(1);
  });

  test("cms69-strategy.cel emits Patient + Encounter + Condition + Observation", () => {
    const r = emit(CORPUS.cms69Strategy);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const c = r.emittedCases[0];
    const counts = c.resources.reduce<Record<string, number>>((acc, res) => {
      acc[res.resourceType] = (acc[res.resourceType] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.Patient).toBe(1);
    expect(counts.Encounter).toBe(1);
    expect(counts.Condition).toBe(1);
    expect(counts.Observation).toBe(1);
  });
});

describe("CEL Todo 5 — emitted resource shape spot-checks", () => {
  test("Patient resource carries name + birthDate", () => {
    const r = emit(CORPUS.cms22);
    const pat = r.emittedCases[0].resources.find((res) => res.resourceType === "Patient")!;
    expect(pat.body.name).toBeDefined();
    expect(pat.body.birthDate).toBe("1972-08-22");
  });

  test("Observations carry subject reference (#91: id namespaced per case)", () => {
    const r = emit(CORPUS.cms22);
    const patient = r.emittedCases[0].resources.find((res) => res.resourceType === "Patient")!;
    const obs = r.emittedCases[0].resources.filter((res) => res.resourceType === "Observation");
    for (const o of obs) {
      const sub = (o.body as { subject?: { reference: string } }).subject;
      expect(sub?.reference).toBe(`Patient/${patient.id}`);
    }
    // Lock the namespaced shape — T12 / #91 prevents id collisions in
    // multi-case Bundles.
    expect(patient.id).toMatch(/-maria-garcia$/);
    expect(patient.id.length).toBeGreaterThan("maria-garcia".length);
  });

  test("Observation code parses canonical token form into Coding", () => {
    const r = emit(CORPUS.cms22);
    const panel = r.emittedCases[0].resources.find(
      (res) => res.id === "cms22-blood-pressure-screening-maria-has-normal-bp-at-her-wellness-visit-normal-bp-panel",
    )!;
    const code = panel.body.code as { coding: Array<{ system?: string; code: string }> };
    expect(code.coding[0].system).toBe("http://loinc.org");
    expect(code.coding[0].code).toBe("85354-9");
  });

  test("BP component observations carry valueQuantity", () => {
    const r = emit(CORPUS.cms22);
    const sys = r.emittedCases[0].resources.find(
      (res) => res.id === "cms22-blood-pressure-screening-maria-has-normal-bp-at-her-wellness-visit-normal-systolic-component",
    )!;
    const vq = sys.body.valueQuantity as { value: number };
    expect(vq.value).toBe(118);
  });

  test("ServiceRequest from cms69 has intent=order (stage is ordered)", () => {
    const r = emit(CORPUS.cms69);
    const sr = r.emittedCases[0].resources.find((res) => res.resourceType === "ServiceRequest")!;
    expect(sr.body.intent).toBe("order");
  });

  test("T12 / #89: Activity-derived ServiceRequest carries meta.profile (CPG canonical)", () => {
    const r = emit(CORPUS.cms69);
    const sr = r.emittedCases[0].resources.find((res) => res.resourceType === "ServiceRequest")!;
    const meta = (sr.body as { meta?: { profile: string[] } }).meta;
    expect(meta?.profile).toBeDefined();
    expect(meta?.profile?.[0]).toMatch(/cpg-servicerequest$/);
  });

  test("Encounter from cms22-strategy gets a period.start date", () => {
    const r = emit(CORPUS.cms22Strategy);
    const enc = r.emittedCases[0].resources.find((res) => res.resourceType === "Encounter")!;
    const period = enc.body.period as { start: string };
    expect(period.start).toBe("2026-04-12");
  });
});

describe("CEL Todo 5 — output directory shape (KALM)", () => {
  test("resource outputPath matches patient/<lib>/<case>/<Type> shape", () => {
    const r = emit(CORPUS.cms69);
    for (const res of r.emittedCases[0].resources) {
      expect(res.outputPath).toMatch(/^patient\/cms69-bmi-screening\/janes-high-bmi-is-followed-up-with-a-weight-assessment-referral\/[A-Za-z]+$/);
    }
  });
});
