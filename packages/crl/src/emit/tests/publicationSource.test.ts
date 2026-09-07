import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import { adaptBooleanPublicationCandidate, prepareSingleLibraryPublication } from "../publicationProgram";
import { adaptServiceRequestPublicationCandidate, matchesPublicationSource, matchesCelPublicationPatient } from "../publicationSource";
import { selectPublicationCandidate } from "../publicationSelection";
import { emitCQLFromAST } from "../../cql-emitter/emitCQL";
import { lowerLocalCodes, leafEligibleConcepts } from "../../cql-emitter/lowerLocalCodes";
import { emitPartitioned, FULL_PARTITION } from "../../cql-emitter/layeredEmit";
import { emitCQLImports } from "../../imports/emit";

// REFACTOR:grounded (#320, review 564): exact records, values and temporal failures across arms.
const source = readFileSync(path.join(__dirname, "fixtures/publication-source.crl"), "utf8");
const options = { canonicalBase: "http://example.org", policyId: "source-publication" };
function prepare(text = source) {
  const parsed = buildCRL(text);
  expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
  return { ast: parsed.result!, program: prepareSingleLibraryPublication(parsed.result!, options) };
}
const request = (extra: Record<string, unknown> = {}) => ({ resourceType: "ServiceRequest", id: "r1",
  status: "active", intent: "order", subject: { reference: "Patient/p" },
  code: { coding: [{ system: "http://example.org/procedures", code: "repair" }] },
  authoredOn: "2026-01-01", ...extra });
function candidate(extra: Record<string, unknown> = {}) {
  const descriptor = prepare().program.descriptors[0];
  const result = adaptServiceRequestPublicationCandidate(descriptor, descriptor.sources![0], request(extra), "Patient/p");
  if (result.kind !== "candidate") throw new Error(result.message);
  return result.candidate;
}
describe("ServiceRequest publication", () => {
  it("prepares the finite source, preserves validity and keeps input identity separate from the CF", () => {
    const { program } = prepare();
    expect(program.diagnostics).toEqual([]);
    expect(program.descriptors[0].sources![0].codes).toHaveLength(2);
    const result = candidate();
    expect(result).toMatchObject({ arm: "source", retrievedInputIdentity: "ServiceRequest/r1", validity: "2026-01-01",
      resource: { resourceType: "Observation", valueBoolean: true, effectiveDateTime: "2026-01-01", subject: { reference: "Patient/p" } } });
    expect(result.resource.id).toBeUndefined();
    expect(result.resource.basedOn).toBeUndefined();
    expect(result.resource.derivedFrom).toBeUndefined();
    expect(result.resource.meta).toBeDefined();
  });
  it("matches either finite code by exact system/code, not display or resource presence", () => {
    const s = prepare().program.descriptors[0].sources![0];
    expect(matchesPublicationSource(s, request({ code: { coding: [{ system: "http://example.org/procedures", code: "second-code" }] } }))).toBe(true);
    expect(matchesPublicationSource(s, request({ code: { text: "repair" } }))).toBe(false);
    expect(matchesPublicationSource(s, request({ code: { coding: [{ system: "http://other", code: "repair" }] } }))).toBe(false);
  });
  it.each([false, undefined])("newer local %s displaces the positive source without OR", (value) => {
    const d = prepare().program.descriptors[0];
    const local = adaptBooleanPublicationCandidate(d, { resourceType: "Observation", id: "a", status: "final", effectiveDateTime: "2026-02-01", ...(value === undefined ? {} : { valueBoolean: value }) });
    if (local.kind !== "candidate") throw new Error(local.message);
    const result = selectPublicationCandidate([candidate(), local.candidate], { conceptId: d.conceptId, equalTime: "error" });
    expect(result).toMatchObject({ state: "selected", candidate: { key: "Observation/a" } });
    if (result.state === "selected") expect(result.candidate.resource.valueBoolean).toBe(value);
  });
  it.each([
    [{ id: "r2" }, "publication-ambiguous-selection"],
    [{ id: "r2", authoredOn: undefined }, "publication-undated-input"],
    [{}, "publication-duplicate-input"],
  ])("never silently collapses conflicting record identities %j", (extra, code) => {
    expect(selectPublicationCandidate([candidate(), candidate(extra)], { conceptId: "c", equalTime: "error" }))
      .toMatchObject({ state: "failed", diagnostic: { code } });
  });
  it("preserves a sole undated witness", () => {
    expect(selectPublicationCandidate([candidate({ authoredOn: undefined })], { conceptId: "c", equalTime: "error" })).toMatchObject({ state: "selected" });
  });
  it("preserves an extension-only authoredOn as an undated positive witness", () => {
    const extension = { extension: [{ url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason", valueCode: "unknown" }] };
    const value = candidate({ authoredOn: undefined, _authoredOn: extension });
    expect(value.validity).toBeUndefined();
    expect(value.resource.effectiveDateTime).toBeUndefined();
    expect(value.resource._effectiveDateTime).toEqual(extension);
    expect(selectPublicationCandidate([value], { conceptId: "c", equalTime: "error" })).toMatchObject({ state: "selected", candidate: { resource: { valueBoolean: true } } });
  });
  it("reports malformed lexical validity at the TS selection boundary", () => {
    expect(selectPublicationCandidate([candidate({ authoredOn: "not-a-date" })], { conceptId: "c", equalTime: "error" }))
      .toMatchObject({ state: "failed", diagnostic: { code: "publication-invalid-validity" } });
  });
  it("uses authored preference for a persisted copy beside its source; it does not deduplicate by value", () => {
    const d = prepare().program.descriptors[0], original = candidate();
    const copy = adaptBooleanPublicationCandidate(d, { ...original.resource, id: "persisted" });
    if (copy.kind !== "candidate") throw new Error(copy.message);
    expect(selectPublicationCandidate([original, copy.candidate], { conceptId: d.conceptId, equalTime: "error" }))
      .toMatchObject({ state: "failed", diagnostic: { code: "publication-ambiguous-selection" } });
    expect(selectPublicationCandidate([original, copy.candidate], { conceptId: d.conceptId, equalTime: "preferLocal" }))
      .toMatchObject({ state: "selected", candidate: { key: "Observation/persisted", arm: "local" } });
  });
  it("retains distinct contributors for overlapping representations, exposing their maximal tie", () => {
    const one = candidate(), two = { ...one, key: "different-key", contributorId: "other-source" };
    expect(selectPublicationCandidate([one, two], { conceptId: "c", equalTime: "error" }))
      .toMatchObject({ state: "failed", diagnostic: { code: "publication-ambiguous-selection" } });
  });
  it("refuses an unsupported projection or unresolved ValueSet instead of dropping its arm", () => {
    expect(prepare(source.replace('exists this', 'count this')).program.diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ kind: "publication-unsupported-form" })]));
    expect(prepare(source.replace('- system is `http://example.org/procedures`.\n- code is `repair`.\n- code is `second-code`.', '- valueset is `http://example.org/dynamic`.')).program.diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ kind: "publication-domain-not-finite" })]));
  });
  it.each([{ status: "revoked" }, { status: "draft", intent: "proposal" }, { doNotPerform: true }, { modifierExtension: [{}] }, { intent: undefined }])(
    "refuses unsupported source states %j", (extra) => {
      const d = prepare().program.descriptors[0];
      expect(adaptServiceRequestPublicationCandidate(d, d.sources![0], request(extra), "Patient/p"))
        .toMatchObject({ kind: "error", code: "publication-source-state-unsupported" });
    });
  it.each(["Patient/p", "http://server/fhir/Patient/p", "https://server/fhir/Patient/p/_history/3"])("checks an already-retrieved subject %s, without claiming provider resolution", (reference) => {
    expect(candidate({ subject: { reference } }).resource.subject).toEqual({ reference: "Patient/p" });
  });
  it.each([undefined, "Group/p", "Patient/q", "http://server/fhir/Patient/p", "Patient/p/_history/3"])("CRE's CEL compartment does not retrieve %s", (reference) => {
    expect(matchesCelPublicationPatient(request({ subject: { reference } }), "Patient/p")).toBe(false);
  });
  it("source publication preserves provenance leaf eligibility for itself and its local neighbor", () => {
    const { ast } = prepare(source+'\nconcept "Neighbor":\n- type is Observation.\n- value type is boolean.\n- code is `neighbor`.\n');
    expect([...leafEligibleConcepts(ast)].sort()).toEqual(["Neighbor", "Requested"]);
  });
  it("refuses mismatched subjects and missing policy identity", () => {
    const { ast, program } = prepare(); const d = program.descriptors[0];
    expect(adaptServiceRequestPublicationCandidate(d, d.sources![0], request({ subject: { reference: "Patient/q" } }), "Patient/p"))
      .toMatchObject({ kind: "error", code: "publication-source-subject-unsupported" });
    expect(prepareSingleLibraryPublication(ast, { canonicalBase: options.canonicalBase }).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ kind: "publication-source-profile-required" })]));
  });
  it("emits source bindings in direct, full and custom partitions", () => {
    const { ast } = prepare();
    const direct = emitCQLFromAST(ast, options);
    expect(direct.success, JSON.stringify(direct.errors)).toBe(true);
    expect(direct.result).toContain('(("Requested Source 1") S return all');
    expect(direct.result).toContain("[ServiceRequest: { System.Code { system: 'http://example.org/procedures', code: 'repair' }");
    const lowered = lowerLocalCodes(ast, options);
    for (const partition of [FULL_PARTITION, { ...FULL_PARTITION, libraryNameFor: (_p: string, view: string) => `Custom${view}` }]) {
      const result = emitPartitioned(lowered.ast, "Source Publication", options.policyId, partition, options);
      expect(result.success, JSON.stringify(result.errors)).toBe(true);
      const inference = result.entries.find((lib) => lib.libraryName.endsWith("Inferences"));
      expect(inference).toBeDefined();
      expect(JSON.stringify(inference)).toContain("Requested Source 1");
      expect(JSON.stringify(inference)).toContain("ExternalPrimitives");
    }
  });
  it("refuses a generated source binding collision", () => {
    const { ast } = prepare(source + '\nconcept "Requested Source 1":\n- type is Observation.\n- code is `collision`.\n');
    expect(emitCQLFromAST(ast, options).errors).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "publication-name-collision" })]));
  });
  it("resolves two authored sources and a foreign terminology with the same local name", () => {
    const parent = path.resolve(os.tmpdir()), directory = mkdtempSync(path.join(parent, "crl-source-scope-"));
    if (path.dirname(directory) !== parent || !path.basename(directory).startsWith("crl-source-scope-")) throw new Error("Unexpected directory");
    try {
      writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "source-scope", crl: { canonicalBase: "http://example.org" } }));
      writeFileSync(path.join(directory, "terms.crl"), 'library "Source Terms".\nterminology "Procedures":\n- system is `http://foreign`.\n- code is `foreign-only`.\n');
      const entry = path.join(directory, "policy.crl");
      const two = source.replace('library "Source Publication".', 'library "Source Publication".\ninclude "Source Terms".')
        .replace('  - value projection is exists this.', '  - value projection is exists this.\n- source representation:\n  - type is ServiceRequest.\n  - coded from "Source Terms"."Procedures".\n  - value projection is exists this.');
      writeFileSync(entry, two);
      const result = emitCQLImports(entry);
      expect(result.success, JSON.stringify(result.errors)).toBe(true);
      const primitives = result.cqlByLibrary!.find(l=>l.libraryName.endsWith("ExternalPrimitives"))!.cql;
      expect(primitives).toContain('define "Requested Source 1":');
      expect(primitives).toContain('define "Requested Source 2":');
      expect(primitives).toContain("system: 'http://foreign', code: 'foreign-only'");
      const inference = result.cqlByLibrary!.find(l=>l.libraryName.endsWith("Inferences"))!.cql;
      expect(inference).toContain('"Requested Source 1") S return all');
      expect(inference).toContain('"Requested Source 2") S return all');
      writeFileSync(entry, two+'\nconcept "Requested Source 1":\n- type is Observation.\n- code is `collision`.\n');
      const collision = emitCQLImports(entry);
      expect(collision.success).toBe(false);
      expect(JSON.stringify(collision.errors)).toContain("publication-name-collision");
      expect(JSON.stringify(collision.errors)).not.toContain("lost a prepared source binding");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("resolves an explicitly included package source terminology to literal codes", () => {
    const parent = path.resolve(os.tmpdir()), directory = mkdtempSync(path.join(parent, "crl-source-package-"));
    if (path.dirname(directory) !== parent || !path.basename(directory).startsWith("crl-source-package-")) throw new Error("Unexpected directory");
    try {
      writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "source-publication", crl: { canonicalBase: "http://example.org" } }));
      const dep = path.join(directory, "node_modules/source-terms"); mkdirSync(dep, { recursive: true });
      writeFileSync(path.join(dep, "package.json"), JSON.stringify({ name: "source-terms", version: "1.0.0", crl: { libraries: ["terms.crl"] } }));
      writeFileSync(path.join(dep, "terms.crl"), 'library "Package Terms".\nterminology "Imported Procedures":\n- system is `http://package`.\n- code is `package-only`.\n');
      const entry = path.join(directory, "policy.crl");
      writeFileSync(entry, source.replace('library "Source Publication".', 'library "Source Publication".\ninclude "Package Terms".')
        .replace('coded from "Procedures".', 'coded from "Package Terms"."Imported Procedures".'));
      const result = emitCQLImports(entry);
      expect(result.success, JSON.stringify(result.errors)).toBe(true);
      expect(result.cqlByLibrary!.some(l => l.libraryName === "PackageTerms")).toBe(true);
      expect(result.cqlByLibrary!.find(l => l.libraryName.endsWith("ExternalPrimitives"))!.cql)
        .toContain("system: 'http://package', code: 'package-only'");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
