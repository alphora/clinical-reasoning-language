import { describe, it, expect } from "vitest";
import { buildCRL } from "../../index";
import { prepareSingleLibraryPublication } from "../publicationProgram";
import { adaptRequestCodePublicationCandidate, type PublicationRequestCodeSource } from "../publicationSource";
import { emitCQLFromAST } from "../../cql-emitter/emitCQL";

// REFACTOR:grounded (859): source-only projection retains request values, not editable assertions.
export const requestPolicy = (type = "MedicationRequest") => `library "Request Projection".
terminology "Covered": - system is \`urn:request\`. - code is \`covered\`.
concept "Request":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- value domain is "Covered".
- shape reduction is most recent.
- source representation:
  - type is ${type}.
  - coded from "Covered".
concept "Covered Request":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Request" has a value.
- shape reduction is most recent.
activity "Yes": - request CPGCommunicationRequest. - with \`YES\`.
activity "No": - request CPGCommunicationRequest. - with \`NO\`.
decision "D": first:
- when "Covered Request" then recommend activity "Yes".
- otherwise then recommend activity "No".
`;
function prepared(type: string, local = false) {
  const b = buildCRL(requestPolicy(type).replace('concept "Request":', 'concept "Request":' + (local ? '\n- code is `request`.' : '')));
  expect(b.success, JSON.stringify(b.errors)).toBe(true);
  const opts = { canonicalBase: "http://example.org", policyId: "request-projection" };
  const p = prepareSingleLibraryPublication(b.result!, opts);
  expect(p.diagnostics).toEqual([]);
  return { ast: b.result!, opts, d: p.descriptors.find(d => d.title === "Request")! };
}
const request = (type: string, code = "covered") => ({
  resourceType: type, id: "r", status: "active", intent: "order", subject: { reference: "Patient/p" },
  [type === "MedicationRequest" ? "medicationCodeableConcept" : "code"]: { coding: [{ system: "urn:request", code }], text: "source text" },
  authoredOn: "2026-01-01",
});
describe("request code publication", () => {
  // @kit request-code-sources:projection
  it.each(["MedicationRequest", "ServiceRequest"])("preserves %s source code without an answer profile", type => {
    const { d, ast, opts } = prepared(type);
    const raw = request(type), before = structuredClone(raw);
    const result = adaptRequestCodePublicationCandidate(d, d.sources![0] as PublicationRequestCodeSource, raw, "Patient/p");
    expect(result).toMatchObject({ kind: "candidate", candidate: { arm: "source", retrievedInputIdentity: `${type}/r`, validity: "2026-01-01", resource: { valueCodeableConcept: { coding: [{ system: "urn:request", code: "covered" }], text: "source text" } } } });
    if (result.kind === "candidate") expect(result.candidate.resource.meta).toBeUndefined();
    expect(raw).toEqual(before);
    const cql = emitCQLFromAST(ast, opts);
    expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
    expect(cql.result).toContain(`[${type}]`);
    expect(cql.result).toContain(`${type}CodeCandidate`);
  });
  it.each(["MedicationRequest", "ServiceRequest"])("returns no contribution for a valid nonmatching %s", type => {
    const { d } = prepared(type);
    expect(adaptRequestCodePublicationCandidate(d, d.sources![0] as PublicationRequestCodeSource, request(type, "other"), "Patient/p")).toEqual({ kind: "missing" });
  });
  it.each([
    { status: "cancelled" }, { intent: "plan" }, { doNotPerform: true }, { modifierExtension: [{}] },
    { medicationReference: { reference: "Medication/m" } }, { medicationCodeableConcept: { text: "only text" } },
    { medicationCodeableConcept: { coding: [{ system: "urn:request", code: "covered" }, { code: "bad" }] } },
    { id: "" }, { subject: { reference: "Patient/other" } }, { authoredOn: "invalid" },
    { authoredOn: "2026-01-01T00:00:00.1234Z" }, { authoredOn: "2016-12-31T23:59:60Z" },
  ])("fails explicitly for unsupported input %j", override => {
    const { d } = prepared("MedicationRequest");
    expect(adaptRequestCodePublicationCandidate(d, d.sources![0] as PublicationRequestCodeSource, { ...request("MedicationRequest", "other"), ...override }, "Patient/p").kind).toBe("error");
  });
  it("adds the answer profile only for an authored local code", () => {
    const { d } = prepared("MedicationRequest", true);
    const result = adaptRequestCodePublicationCandidate(d, d.sources![0] as PublicationRequestCodeSource, request("MedicationRequest"), "Patient/p");
    expect(result.kind).toBe("candidate");
    if (result.kind === "candidate") expect(result.candidate.resource.meta).toEqual({ profile: [d.profileUrl] });
  });
});
