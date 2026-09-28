import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveCelImports } from "../../cel/imports";
import * as celEmission from "../../cel/emitter/emitFhir";
import { runCel } from "../run";

// REFACTOR:grounded (859): raw request FHIR exercises CRE's prepared-source boundary.
function evaluate(type: string, values: Record<string, unknown>[], expected = "Yes") {
  const parent = path.resolve(os.tmpdir());
  const dir = mkdtempSync(path.join(parent, "crl-request-source-"));
  if (path.dirname(dir) !== parent || !path.basename(dir).startsWith("crl-request-source-")) throw Error("Unexpected test path");
  try {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "request-projection", version: "1.0.0", crl: { canonicalBase: "http://example.org" } }));
    writeFileSync(path.join(dir, "policy.crl"), `library "Request Projection".
terminology "Covered": - system is \`urn:request\`. - code is \`covered\`.
concept "Request":
- shape is Record. - type is Observation. - value type is CodeableConcept.
- value domain is "Covered". - shape reduction is most recent.
- source representation: - type is ${type}. - coded from "Covered".
concept "Covered Request":
- shape is Record. - type is Observation. - value type is boolean.
- definition is "Request" has a value. - shape reduction is most recent.
activity "Yes": - request CPGCommunicationRequest. - with \`YES\`.
activity "No": - request CPGCommunicationRequest. - with \`NO\`.
decision "D": first:
- when "Covered Request" then recommend activity "Yes".
- otherwise then recommend activity "No".
`);
    const cel = path.join(dir, "cases.cel");
    writeFileSync(cel, `library "Cases". covers "Request Projection".
fact "P": - defined by "Patient".
case "Case": - subject is "P". - result is "D" is "${expected}".
`);
    const graph = resolveCelImports(cel), emitted = celEmission.emitCelToFhir(graph);
    expect(emitted.diagnostics.filter(d => d.severity === "error")).toEqual([]);
    const c = emitted.emittedCases[0], patient = c.resources.find(r => r.resourceType === "Patient")!;
    for (const [i, value] of values.entries()) {
      const body = { resourceType: type, id: `r${i}`, status: "active", intent: "order", subject: { reference: `Patient/${patient.id}` },
        [type === "MedicationRequest" ? "medicationCodeableConcept" : "code"]: { coding: [{ system: "urn:request", code: "covered" }] }, authoredOn: "2026-01-01", ...value };
      c.resources.push({ resourceType: type, id: body.id, outputPath: `${type}/${body.id}.json`, body });
    }
    const spy = vi.spyOn(celEmission, "emitCelToFhir").mockReturnValue(emitted);
    try { return runCel(graph).runs[0]; } finally { spy.mockRestore(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe.each(["MedicationRequest", "ServiceRequest"])("CRE %s source projection", type => {
  it("continues for one matching request", () => {
    const run = evaluate(type, [{}]);
    expect(run.status, JSON.stringify(run.diagnostics)).toBe("pass");
    expect(run.produced.map(p => p.recommendation)).toEqual(["Yes"]);
  });
  it("selects the negative gate for one valid nonmatch", () => {
    const field = type === "MedicationRequest" ? "medicationCodeableConcept" : "code";
    const run = evaluate(type, [{ [field]: { coding: [{ system: "urn:request", code: "other" }] } }], "No");
    expect(run.status, JSON.stringify(run.diagnostics)).toBe("pass");
    expect(run.produced.map(p => p.recommendation)).toEqual(["No"]);
  });
  it("keeps empty selected-slot presence separate from invocation preflight", () => expect(evaluate(type, [], "No").status).toBe("pass"));
  it.each([{status: "cancelled"}, {intent: "plan"}, {doNotPerform: true}])("refuses unsupported state %j", override => {
    const run = evaluate(type, [override]);
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.some(d => d.includes("publication-source-state-unsupported"))).toBe(true);
  });
  it("does not let a matching request mask another invalid source", () => {
    const run = evaluate(type, [{}, {status: "cancelled"}]);
    expect(run.status).not.toBe("pass");
    expect(run.produced).toEqual([]);
  });
  it("retains equal-time ambiguity instead of silently assessing one request", () => {
    const run = evaluate(type, [{}, {}]);
    expect(run.status).not.toBe("pass");
    expect(run.produced).toEqual([]);
  });
});
