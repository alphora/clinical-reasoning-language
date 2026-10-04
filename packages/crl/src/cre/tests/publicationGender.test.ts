import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveCelImports } from "../../cel/imports";
import * as celEmission from "../../cel/emitter/emitFhir";
import { runCel } from "../run";

// Patient.gender is supplied externally. This does not claim CEL has a gender field.
function evaluate(gender: string | undefined, answer?: string | null, lastUpdated: string | null = "2026-01-01T00:00:00Z") {
  const parent = path.resolve(os.tmpdir()), dir = mkdtempSync(path.join(parent, "crl-gender-"));
  if (path.dirname(dir) !== parent || !path.basename(dir).startsWith("crl-gender-")) throw Error("Unexpected test directory");
  try {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "patient-gender", version: "1.0.0", crl: { canonicalBase: "http://example.org" } }));
    writeFileSync(path.join(dir, "policy.crl"), readFileSync(path.join(__dirname, "../../emit/tests/fixtures/publication-gender.crl")));
    const file = path.join(dir, "cases.cel");
    writeFileSync(file, `library "Cases". covers "Patient Gender".
fact "P": - defined by "Patient".
case "Case": - subject is "P". - result is "D" is "Met".`);
    const graph = resolveCelImports(file), emitted = celEmission.emitCelToFhir(graph);
    expect(emitted.diagnostics.filter(d => d.severity === "error")).toEqual([]);
    const c = emitted.emittedCases[0], patient = c.resources.find(r => r.resourceType === "Patient")!;
    Object.assign(patient.body, { ...(gender === undefined ? {} : { gender }), meta: lastUpdated === null ? {} : { lastUpdated } });
    if (answer !== undefined) c.resources.push({ resourceType: "Observation", id: "a", outputPath: "Observation/a.json", body: {
      resourceType: "Observation", id: "a", status: "final", subject: { reference: `Patient/${patient.id}` },
      code: { coding: [{ system: "http://example.org/CodeSystem/patient-gender-local", code: "gender" }] },
      effectiveDateTime: "2026-02-01T00:00:00Z", ...(answer === null ? {} : { valueCodeableConcept: { coding: [{ system: "urn:synthetic:answers", code: answer }] } }),
    } });
    const spy = vi.spyOn(celEmission, "emitCelToFhir").mockReturnValue(emitted);
    try { return runCel(graph).runs[0]; } finally { spy.mockRestore(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
describe("CRE supplied Patient gender", () => {
  it.each([["female", "Met"], ["male", "Unmet"]])("uses supplied %s", (g, result) => {
    expect(evaluate(g).produced.map(p => p.recommendation)).toEqual([result]);
  });
  it.each([undefined, "unknown", "other"])("missing or unmapped %s pauses", g => {
    const r = evaluate(g); expect(r.produced).toEqual([]); expect(r.status).not.toBe("error");
  });
  it.each(["false", "unknown-true", "unknown-false"])("retains newer local %s", answer => {
    expect(evaluate("female", answer).produced.map(p => p.recommendation)).toEqual(["Unmet"]);
  });
  it.each(["false", "unknown-true", "unknown-false", null])("local %s overrides undated Patient", answer => {
    const r = evaluate("female", answer, null); expect(r.status).not.toBe("error");
    expect(r.produced.map(p => p.recommendation)).toEqual(answer === null ? [] : ["Unmet"]);
  });
  it("returns to normal recency when Patient timestamp is supplied", () => {
    expect(evaluate("female", "false", "2026-01-01T00:00:00Z").produced.map(p => p.recommendation)).toEqual(["Unmet"]);
    expect(evaluate("female", "false", "2026-03-01T00:00:00Z").produced.map(p => p.recommendation)).toEqual(["Met"]);
  });
  it("does not mask invalid source with a newer answer", () => {
    const r = evaluate("invalid", "true"); expect(r.status).toBe("error"); expect(r.produced).toEqual([]);
  });
});
