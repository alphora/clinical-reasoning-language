import { PATIENT_GENDER_CRL } from "../../authoring-kit/genderExample";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import { buildCRL } from "../../index";
import { prepareSingleLibraryPublication, preparePublicationProgram, adaptPublicationCandidate } from "../publicationProgram";
import { produceGenderCandidate, type PublicationGenderSource } from "../publicationGender";
import { createPublicationContext } from "../publicationContext";
import { selectPublicationCandidate } from "../publicationSelection";
import { emitCQLFromAST } from "../../cql-emitter/emitCQL";

const text = readFileSync(path.join(__dirname, "fixtures/publication-gender.crl"), "utf8");
const options = { canonicalBase: "http://example.org", policyId: "patient-gender" };
function prepare(source = text) {
  const b = buildCRL(source); expect(b.success, JSON.stringify(b.errors)).toBe(true);
  return { ast: b.result!, p: prepareSingleLibraryPublication(b.result!, options) };
}
function project(gender: unknown = "female", dated = true) {
  const { p } = prepare(); expect(p.diagnostics).toEqual([]);
  const d = p.descriptors.find(d => d.title === "Female Administrative Gender")!;
  return { d, result: produceGenderCandidate(d, d.sources![0] as PublicationGenderSource,
    { resourceType: "Patient", id: "p", gender, ...(dated ? { meta: { lastUpdated: "2026-01-01T00:00:00Z" } } : {}) }, "Patient/p") };
}
describe("Patient administrative gender projection", () => {
  it("serves the exact tested source in the kit", () => expect(PATIENT_GENDER_CRL).toBe(text));
  // @kit patient-gender-projection:mapping
  it.each([["female", "true"], ["male", "false"]])("maps %s to authored answer %s", (gender, code) => {
    expect(project(gender).result).toMatchObject({ kind: "candidate", candidate: { validity: "2026-01-01T00:00:00Z",
      resource: { valueCodeableConcept: { coding: [{ system: "urn:synthetic:answers", code }] } } } });
  });
  it.each(["other", "unknown"])("unmapped %s contributes no answer", g => expect(project(g).result).toEqual({ kind: "missing" }));
  it("missing remains missing and invalid is an error", () => {
    const { d } = project(); const source = d.sources![0] as PublicationGenderSource;
    expect(produceGenderCandidate(d, source, { resourceType: "Patient", id: "p" }, "Patient/p")).toEqual({ kind: "missing" });
    expect(project("invalid").result).toMatchObject({ kind: "error", code: "publication-gender-invalid" });
  });
  it.each([
    ['female as "Yes Answer" male as "No Answer"', 'female as "Yes Answer" female as "No Answer"'],
    ['female as "Yes Answer" male as "No Answer"', ''],
    ['female as "Yes Answer"', 'female as "Answers"'],
    ['female as "Yes Answer"', 'female as "Missing"'],
    ['terminology "Yes Answer": - system is `urn:synthetic:answers`', 'terminology "Yes Answer": - system is `urn:wrong`'],
  ])("rejects invalid/ambiguous mappings %s", (from, to) => {
    expect(prepare(text.replace(from, to)).p.diagnostics.length).toBeGreaterThan(0);
  });
  // @kit patient-gender-projection:selection
  it("uses ordinary recency; local uncertain answer overrides undated Patient fallback", () => {
    const { d, result } = project(); if (result.kind !== "candidate") throw Error("No source");
    const local = adaptPublicationCandidate(d, { resourceType: "Observation", id: "a", status: "final",
      effectiveDateTime: "2026-02-01T00:00:00Z", valueCodeableConcept: { coding: [{ system: "urn:synthetic:answers", code: "unknown-true" }] } });
    if (local.kind !== "candidate") throw Error("No local");
    const context = { conceptId: d.conceptId, equalTime: d.selector.equalTime };
    expect(selectPublicationCandidate([result.candidate, local.candidate], context)).toMatchObject({ state: "selected", candidate: local.candidate });
    const undated = project("female", false).result; if (undated.kind !== "candidate") throw Error("No source");
    expect(selectPublicationCandidate([undated.candidate, local.candidate], context)).toMatchObject({ state: "selected", candidate: local.candidate });
  });
  it.each(["other", "unknown"])("supports explicit %s mapping to an uncertain answer", gender => {
    const source = text.replace('terminology "Uncertain":', 'terminology "Assumed Yes": - system is `urn:synthetic:answers`. - code is `unknown-true`.\nterminology "Uncertain":')
      .replace('male as "No Answer".', `male as "No Answer" ${gender} as "Assumed Yes".`);
    const { p } = prepare(source); expect(p.diagnostics).toEqual([]);
    const d = p.descriptors.find(d => d.title === "Female Administrative Gender")!;
    expect(produceGenderCandidate(d, d.sources![0] as PublicationGenderSource,
      { resourceType: "Patient", id: "p", gender }, "Patient/p"))
      .toMatchObject({ kind: "candidate", candidate: { resource: { valueCodeableConcept: { coding: [{ system: "urn:synthetic:answers", code: "unknown-true" }] } } } });
  });
  it.each(["2026", "2026-01-01", "2026-01-01T00:00:00", "bad"])("rejects non-instant source validity %s", lastUpdated => {
    const { d } = project();
    expect(produceGenderCandidate(d, d.sources![0] as PublicationGenderSource,
      { resourceType: "Patient", id: "p", gender: "female", meta: { lastUpdated } }, "Patient/p"))
      .toMatchObject({ kind: "error", code: "publication-invalid-validity" });
  });
  it("resolves qualified terminology by system/code despite same-name local terms and display collisions", () => {
    const local = buildCRL(text.replace('female as "Yes Answer"', 'female as "Alias"."Yes Answer"'));
    const shared = buildCRL('library "Shared". terminology "Yes Answer": - system is `urn:synthetic:answers`. - code is `false` display is `Yes`.');
    expect(local.success && shared.success).toBe(true);
    const p = preparePublicationProgram(createPublicationContext({ libraries: [
      { sourceIdentity: "p", ast: local.result!, artifact: options },
      { sourceIdentity: "shared", ast: shared.result!, artifact: { ...options, policyId: "shared" } },
    ], resolveLibrary: (from, qualifier) => from === "p" && qualifier === "Alias" ? { kind: "resolved", sourceIdentity: "shared" } : { kind: "not-visible" } }));
    expect(p.diagnostics).toEqual([]);
    const d = p.descriptors.find(d => d.title === "Female Administrative Gender")!;
    expect(produceGenderCandidate(d, d.sources![0] as PublicationGenderSource,
      { resourceType: "Patient", id: "p", gender: "female" }, "Patient/p"))
      .toMatchObject({ kind: "candidate", candidate: { resource: { valueCodeableConcept: { coding: [{ system: "urn:synthetic:answers", code: "false" }] } } } });
  });
  it("keeps validation and local ambiguity across mixed sources; clear differs from removal", () => {
    const { d, result } = project("female", false); if (result.kind !== "candidate") throw Error("No source");
    const patient = result.candidate;
    const local = { ...patient, key: "local-1", contributorId: "local", arm: "local" as const,
      retrievedInputIdentity: "Observation/local-1", validity: "2026-02-01T00:00:00Z", resource: {} };
    const options = { conceptId: d.conceptId, equalTime: d.selector.equalTime };
    const select = (c: typeof patient[]) => selectPublicationCandidate(c, options);
    expect(select([patient, local])).toMatchObject({ state: "selected", candidate: local }); // clear retains a valueless record
    expect(select([patient])).toMatchObject({ state: "selected", candidate: patient }); // removal restores fallback
    expect(select([patient, patient, local])).toMatchObject({ state: "failed", diagnostic: { code: "publication-duplicate-input" } });
    expect(select([patient, { ...local, validity: "bad" }])).toMatchObject({ state: "failed", diagnostic: { code: "publication-invalid-validity" } });
    const other = { ...patient, contributorId: "unrelated", key: "other", retrievedInputIdentity: "Observation/other" };
    expect(select([patient, other, local])).toMatchObject({ state: "selected", candidate: local });
    expect(select([patient, local, { ...local, key: "local-2", retrievedInputIdentity: "Observation/local-2" }])).toMatchObject({ state: "failed", diagnostic: { code: "publication-ambiguous-selection" } });
    expect(select([patient, { ...local, validity: undefined }])).toMatchObject({ state: "failed", diagnostic: { code: "publication-undated-input" } });
    expect(select([{ ...patient, validity: "2026-01-01T00:00:00Z" }, local])).toMatchObject({ state: "selected", candidate: local });
    const repaired = { ...patient, validity: "2026-03-01T00:00:00Z" };
    expect(select([repaired, local])).toMatchObject({ state: "selected", candidate: repaired });
  });
  it("emits Patient retrieval and explicit code mapping", () => {
    const { ast } = prepare(); const emitted = emitCQLFromAST(ast, options);
    expect(emitted.success, JSON.stringify(emitted.errors)).toBe(true);
    expect(emitted.result).toContain("P.gender.value");
    expect(emitted.result).toContain("__CRL_PatientGender_v1_Produce");
  });
});
