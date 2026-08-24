import { describe, it, expect } from "vitest";

import { emitCQL } from "../emitCQL";

/**
 * #189 functional-VS slice — a HAND-AUTHORED functional terminology (`system is`/`code is`, no `valueset is`) binds
 * its OWN emitted FHIR ValueSet by url in CQL (`valueset "X": '<vs-url>'`), the SAME rule the reference form
 * (`valueset is <url>`) already uses — instead of per-code `code "X"` decls that COLLIDE (invalid CQL) on a
 * multi-code body. The `<vs-url>` is byte-matched to the FHIR `ValueSet.url` via the shared `valueSetUrl`, and the
 * new path is discriminated from lowered local-code terminologies (whose `TerminologySystem.name` is set) so local
 * codes stay on the unchanged `codesystem`/`code` emission.
 */
describe("#189 functional-VS CQL binding", () => {
  const BASE = "http://example.org/crl/test";
  const POLICY = "test-policy";

  it("a MULTI-CODE functional terminology binds ONE valueset decl (no duplicate `code` decls — the multi-code bug)", () => {
    const src = `library "Test".
terminology "Options":
- system is \`http://example.org/options\`.
- code is \`opt1\`.
- code is \`opt2\`.
- code is \`opt3\`.
concept "Chosen":
- type is Observation.
- value type is CodeableConcept.
- coded from "Options".`;
    const r = emitCQL(src, { canonicalBase: BASE, policyId: POLICY });
    expect(r.success, JSON.stringify(r.errors)).toBe(true);
    // ONE valueset decl bound to the shared VS url (byte-matched to the FHIR ValueSet.url).
    expect(r.result).toContain(`valueset "Options": '${BASE}/ValueSet/${POLICY}-options'`);
    // NO per-code `code "Options"` decls (the collision that made a multi-code body invalid CQL), no codesystem decl.
    expect(r.result).not.toContain(`code "Options":`);
    expect(r.result).not.toContain(`codesystem "Options System":`);
  });

  it("without policyId (direct/test caller) a functional terminology keeps the legacy per-code emission", () => {
    const src = `library "Test".
terminology "Options":
- system is \`http://example.org/options\`.
- code is \`opt1\`.
concept "Chosen":
- type is Observation.
- value type is CodeableConcept.
- coded from "Options".`;
    const r = emitCQL(src, { canonicalBase: BASE }); // no policyId → new path is gated off
    expect(r.success, JSON.stringify(r.errors)).toBe(true);
    expect(r.result).toContain(`code "Options":`);
    expect(r.result).not.toContain(`valueset "Options":`);
  });

  it("a REFERENCE terminology is unchanged — binds the external url, not a CRL VS url", () => {
    const src = `library "Test".
terminology "External VS":
- valueset is \`http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.1\`.
concept "Chosen":
- type is Observation.
- value type is CodeableConcept.
- coded from "External VS".`;
    const r = emitCQL(src, { canonicalBase: BASE, policyId: POLICY });
    expect(r.success, JSON.stringify(r.errors)).toBe(true);
    expect(r.result).toContain(`valueset "External VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.1'`);
    expect(r.result).not.toContain(`${BASE}/ValueSet/`);
  });
});
