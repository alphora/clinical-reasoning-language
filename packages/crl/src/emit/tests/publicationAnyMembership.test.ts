// REFACTOR:grounded (MR10): authored activities use CPGTaskRequest and produce FHIR Task.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import { prepareSingleLibraryPublication } from "../publicationProgram";
import { produceAnyMembershipCandidate } from "../publicationAnyMembership";
import { validateCRLImports } from "../../imports/validate";
import { emitCQLImports } from "../../imports/emit";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import { emitCrlTwoLane } from "../../emit-two-lane";
import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../../cre/run";
import { validateCEL } from "../../cel/validator";
import { selectPublicationCandidate } from "../publicationSelection";

const answer = (name: string) => `concept "${name}":
- code is \`${name.toLowerCase()}\`.
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- value domain is answer options.
- value from is "Answers".
- shape reduction is most recent.
`;
const source = `library "Aggregate".
terminology "Answers":
- system is \`urn:answers\`.
- code is \`known\` display is \`Known\`.
- code is \`flagged\` display is \`Flagged\`.
terminology "Flagged Answers":
- system is \`urn:answers\`.
- code is \`flagged\`.
${answer("A")}${answer("B")}
concept "Flagged":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is any of "A" and "B" in "Flagged Answers" using validity of "A".
- shape reduction is most recent.
activity "Passed":
- request CPGTaskRequest.
- with \`Passed\`.
decision "Aggregate":
first:
- when not "Flagged" then recommend activity "Passed".
- otherwise then recommend activity "Passed".
`;
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture(text = source) {
  const dir = mkdtempSync(join(tmpdir(), "crl-aggregate-")); dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "aggregate", version: "1.0.0", crl: { canonicalBase: "https://example.org/", date: "2026-09-27" } }));
  const path = join(dir, "aggregate.crl"); writeFileSync(path, text); return path;
}
function program(text = source) {
  const parsed = buildCRL(text); expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
  return prepareSingleLibraryPublication(parsed.result!, { canonicalBase: "https://example.org/", policyId: "aggregate" });
}
const candidate = (code: string | undefined, key = "input") => ({ key, contributorId: "local", arm: "local" as const, resource: {
  resourceType: "Observation", id: key, status: "final", ...(code === undefined ? {} : { valueCodeableConcept: { coding: [{ system: "urn:answers", code }] } }),
} });

// REFACTOR:grounded - ordinary gathering and conditional retention are different inputs.
function questionProfiles(resources: ReturnType<typeof emitFhirDefFromPath>["resources"], purpose: "ordinary" | "retained" = "ordinary"): string[] {
  const profiles: string[] = [];
  const visit = (value: unknown, retained = false): void => {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const isRetained = retained || (typeof node.title === "string" && node.title.startsWith("Retain available "));
    if (Array.isArray(node.input) && isRetained === (purpose === "retained"))
      for (const input of node.input) profiles.push(...(input.profile ?? []));
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(item => visit(item, isRetained)); else visit(child, isRetained);
    }
  };
  for (const resource of resources) if (resource.resourceType === "PlanDefinition") visit(resource.resource);
  return [...new Set(profiles)].sort();
}

describe("aggregate selected-answer membership", () => {
  // @kit selected-answer-aggregate:singleton-available
  it.each([
    ["known", false], ["flagged", true], [undefined, false],
  ])("reads a singleton available answer %s as %s without requesting it", (code, expected) => {
    const text = source.replace('any of "A" and "B"', 'any available value of "A"');
    const p = program(text); expect(p.diagnostics).toEqual([]);
    const d = p.descriptors.find(d => d.title === "Flagged")!;
    const result = produceAnyMembershipCandidate(d, [code === undefined ? undefined : candidate(code)], "Patient/p");
    expect(result).toMatchObject({ kind: "candidate", candidate: { resource: { valueBoolean: expected } } });
    const path = fixture(text);
    expect(validateCRLImports(path).success).toBe(true);
    const cql = emitCQLImports(path); expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
    const fhir = emitFhirDefFromPath(path); expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
    expect(fhir.resources.some(r => r.resourceType === "StructureDefinition" && r.sourceName === "A")).toBe(true);
    expect(questionProfiles(fhir.resources)).toEqual([]);
    const aProfile = fhir.resources.find(r => r.resourceType === "StructureDefinition" && r.sourceName === "A")!;
    expect(questionProfiles(fhir.resources, "retained")).toEqual([aProfile.resource.url]);
  });
  it("preserves singleton clear metadata and rejects invalid or contradictory available answers", () => {
    const p = program(source.replace('any of "A" and "B"', 'any available value of "A"'));
    expect(p.diagnostics).toEqual([]);
    const d = p.descriptors.find(d => d.title === "Flagged")!;
    const cleared = { ...candidate(undefined), validity: "2026-01", resource: { ...candidate(undefined).resource, effectiveDateTime: "2026-01" } };
    expect(produceAnyMembershipCandidate(d, [cleared], "Patient/p")).toMatchObject({ kind: "candidate", candidate: { validity: "2026-01", resource: { valueBoolean: false, effectiveDateTime: "2026-01" } } });
    expect(produceAnyMembershipCandidate(d, [candidate("invalid")], "Patient/p")).toMatchObject({ kind: "error", code: "publication-uninterpretable-value" });
    const mixed = candidate("flagged"); mixed.resource.valueCodeableConcept!.coding.push({ system: "urn:answers", code: "known" });
    expect(produceAnyMembershipCandidate(d, [mixed], "Patient/p")).toMatchObject({ kind: "error", code: "publication-ambiguous-coded-value" });
  });
  it.each(['any of "A"', 'any available value of', 'any available value of "A" and', 'any available value of "A" and "A"'])
    ("continues refusing unsupported operand syntax: %s", replacement => {
      expect(validateCRLImports(fixture(source.replace('any of "A" and "B"', replacement))).success).toBe(false);
    });
  it("requires the singleton itself as anchor and a predicate inside its domain", () => {
    const text = source.replace('any of "A" and "B"', 'any available value of "A"');
    expect(program(text.replace('using validity of "A"', 'using validity of "B"')).diagnostics.some(d => d.kind === "publication-validity-operand-unsupported")).toBe(true);
    const outside = text.replace('- code is `flagged`.','- code is `outside`.');
    expect(program(outside).diagnostics.some(d => d.kind === "publication-membership-domain-coverage")).toBe(true);
    expect(emitCQLImports(fixture(outside)).success).toBe(false);
  });
  // @kit selected-answer-aggregate:question-inputs
  it.each(["any of", "any available value of"])("retains operand profiles but requests them only when needed by %s", operation => {
    const fhir = emitFhirDefFromPath(fixture(source.replace("any of", operation)));
    expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
    const profiles = fhir.resources.filter(r => r.resourceType === "StructureDefinition").map(r => r.resource.url).sort();
    expect(profiles).toHaveLength(2);
    expect(questionProfiles(fhir.resources)).toEqual(operation === "any of" ? profiles : []);
    expect(questionProfiles(fhir.resources, "retained")).toEqual(operation === "any of" ? [] : profiles);
  });
  it("keeps a coded available aggregate's own answer without asking for its operands", () => {
    const text = source.replace("any of", "any available value of").replace('concept "Flagged":', 'concept "Flagged":\n- code is `flagged-answer`.');
    const fhir = emitFhirDefFromPath(fixture(text));
    expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
    expect(fhir.resources.filter(r => r.resourceType === "StructureDefinition")).toHaveLength(3);
    const own = fhir.resources.find(r => r.resourceType === "StructureDefinition" && r.sourceName === "Flagged")!;
    expect(own).toBeDefined();
    expect(questionProfiles(fhir.resources)).toEqual([own.resource.url]);
    expect(questionProfiles(fhir.resources, "retained")).toEqual(fhir.resources.filter(r => r.resourceType === "StructureDefinition" && r.sourceName !== "Flagged").map(r => r.resource.url).sort());
  });
  it("still requests an operand reached independently of an available-value check", () => {
    const text = source.replace("any of", "any available value of")
      .replace('- otherwise then recommend activity "Passed".', '- when "A" then recommend activity "Passed".\n- otherwise then recommend activity "Passed".');
    const fhir = emitFhirDefFromPath(fixture(text));
    expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
    const a = fhir.resources.find(r => r.resourceType === "StructureDefinition" && r.sourceName === "A")!;
    expect(questionProfiles(fhir.resources)).toEqual([a.resource.url]);
    expect(questionProfiles(fhir.resources, "retained")).toEqual(fhir.resources.filter(r => r.resourceType === "StructureDefinition").map(r => r.resource.url).sort());
  });
  it("validates and emits terminology-only refs through the full public path without a question profile", () => {
    const path = fixture();
    const validation = validateCRLImports(path); expect(validation.success, JSON.stringify(validation.validationErrors)).toBe(true);
    const cql = emitCQLImports(path); expect(cql.success, JSON.stringify(cql)).toBe(true);
    const fhir = emitFhirDefFromPath(path); expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
    expect(fhir.resources.filter(r => r.resourceType === "StructureDefinition")).toHaveLength(2);
  });
  it("resolves same-name refs independently while retaining the existing emitted-name collision refusal", () => {
    const path = fixture(source.replace('concept "Flagged":', answer("Flagged Answers") + '\nconcept "Flagged":'));
    expect(validateCRLImports(path).success).toBe(true);
    const emitted = emitCrlTwoLane(path);
    expect(emitted.success).toBe(false);
    expect(JSON.stringify(emitted.hardErrors)).toContain("publication-name-collision");
    expect(JSON.stringify(emitted.hardErrors)).not.toContain("unresolved-reference");
  });
  // @kit selected-answer-aggregate:three-state
  it.each([
    ["known", "known", false], ["flagged", "known", true], ["known", "flagged", true],
    ["flagged", undefined, true], [undefined, "flagged", true], ["known", undefined, undefined], [undefined, undefined, undefined],
  ])("classifies %s + %s as %s", (a, b, expected) => {
    const p = program(); expect(p.diagnostics).toEqual([]);
    const d = p.descriptors.find(d => d.title === "Flagged")!;
    const result = produceAnyMembershipCandidate(d, [a === undefined ? undefined : candidate(a), b === undefined ? undefined : candidate(b, "second")], "Patient/p");
    expect(result.kind).toBe("candidate");
    if (result.kind === "candidate") {
      expect(result.candidate.resource.valueBoolean).toBe(expected);
      expect(result.candidate.resource.effectiveDateTime).toBeUndefined();
      expect(result.candidate.validity).toBeUndefined();
    }
  });
  it("does not mask an invalid sibling behind a positive", () => {
    const d = program().descriptors.find(d => d.title === "Flagged")!;
    expect(produceAnyMembershipCandidate(d, [candidate("flagged"), candidate("invalid", "second")], "Patient/p")).toMatchObject({ kind: "error", code: "publication-uninterpretable-value" });
    const mixed = candidate("flagged", "second"); mixed.resource.valueCodeableConcept!.coding.push({ system: "urn:answers", code: "known" });
    expect(produceAnyMembershipCandidate(d, [candidate("flagged"), mixed], "Patient/p")).toMatchObject({ kind: "error", code: "publication-ambiguous-coded-value" });
  });
  it.each([
    ['any of "A" and "B"', 'any of "A" and "A"', "publication-duplicate-operand"],
    ['using validity of "A"', 'using validity of "Flagged"', "publication-validity-operand-unsupported"],
  ])("refuses invalid operand/anchor %s", (before, after, code) => {
    expect(program(source.replace(before, after)).diagnostics.some(d => d.kind === code)).toBe(true);
  });
  it("rejects duplicate and dangling-separator syntax through public validation", () => {
    for (const replacement of ['any of "A" and "A"', 'any of "A" and "Aggregate"."A"', 'any of "A" and "B" and'])
      expect(validateCRLImports(fixture(source.replace('any of "A" and "B"', replacement))).success).toBe(false);
  });
  it("arbitrates local answers, explicit valueless clears, and removal independently", () => {
    const p = program(source.replace('concept "Flagged":', 'concept "Flagged":\n- code is `flagged-answer`.'));
    expect(p.diagnostics).toEqual([]);
    const d = p.descriptors.find(d => d.title === "Flagged")!;
    const anchor = { ...candidate("flagged"), validity: "2026-01-01", resource: { ...candidate("flagged").resource, effectiveDateTime: "2026-01-01" } };
    const produced = produceAnyMembershipCandidate(d, [anchor, candidate("known", "b")], "Patient/p");
    expect(produced.kind).toBe("candidate"); if (produced.kind !== "candidate") return;
    const local = { key: "local-answer", contributorId: d.localContributorId!, arm: "local" as const, retrievedInputIdentity: "Observation/local-answer", validity: "2026-02-01", resource: { valueBoolean: false } };
    const chosen = selectPublicationCandidate([produced.candidate, local], { conceptId: d.conceptId, equalTime: "error" });
    expect(chosen.state).toBe("selected"); if (chosen.state === "selected") expect(chosen.candidate.resource.valueBoolean).toBe(false);
    const cleared = selectPublicationCandidate([produced.candidate, { ...local, resource: {} }], { conceptId: d.conceptId, equalTime: "error" });
    expect(cleared.state).toBe("selected"); if (cleared.state === "selected") expect(cleared.candidate.resource.valueBoolean).toBeUndefined();
    const removed = selectPublicationCandidate([produced.candidate], { conceptId: d.conceptId, equalTime: "error" });
    expect(removed.state).toBe("selected"); if (removed.state === "selected") expect(removed.candidate.resource.valueBoolean).toBe(true);
  });
  it("handles three distinct domains, a non-first validity anchor, and a selected valueless answer", () => {
    const text = source.replace('concept "Flagged":', answer("C").replace('value domain is answer options', 'value domain is answer options, "Extra"') + '\nterminology "Extra":\n- system is `urn:answers`.\n- code is `extra`.\nconcept "Flagged":')
      .replace('any of "A" and "B"', 'any of "A" and "B" and "C"').replace('using validity of "A"', 'using validity of "B"');
    const p = program(text); expect(p.diagnostics).toEqual([]);
    const d = p.descriptors.find(d => d.title === "Flagged")!;
    const anchor = { ...candidate("known", "b"), validity: "2026-01", resource: { ...candidate("known", "b").resource, effectiveDateTime: "2026-01" } };
    const result = produceAnyMembershipCandidate(d, [candidate(undefined), anchor, candidate("extra", "c")], "Patient/p");
    expect(result.kind).toBe("candidate");
    if (result.kind === "candidate") {
      expect(result.candidate.resource.valueBoolean).toBeUndefined();
      expect(result.candidate.validity).toBe("2026-01");
      expect(result.candidate.resource.effectiveDateTime).toBe("2026-01");
    }
  });
  it.each(["any of", "any available value of"])("resolves imported operands and terminology for %s through validation, CRE and emission", (operation) => {
    const term = 'terminology "Flagged Answers":\n- system is `urn:answers`.\n- code is `flagged`.\n';
    const text = 'library "Aggregate".\n' + source.slice(source.indexOf('concept "Flagged":'))
      .replace('any of "A" and "B" in "Flagged Answers" using validity of "A"', 'any of "Foreign"."A" and "Foreign"."B" in "Foreign"."Flagged Answers" using validity of "Foreign"."A"');
    const path = fixture(text.replaceAll("any of", operation));
    writeFileSync(join(dirname(path), "foreign.crl"), 'library "Foreign".\n'+source.slice(source.indexOf('terminology "Answers":'), source.indexOf('terminology "Flagged Answers":'))+term+answer("A")+answer("B"));
    expect(validateCRLImports(path).success).toBe(true);
    const emitted = emitCQLImports(path); expect(emitted.success, JSON.stringify(emitted.errors)).toBe(true);
    const fhir = emitFhirDefFromPath(path);
    expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
    const profiles = fhir.resources.filter(r => r.resourceType === "StructureDefinition").map(r => r.resource.url).sort();
    expect(profiles).toHaveLength(2);
    expect(questionProfiles(fhir.resources)).toEqual(operation === "any of" ? profiles : []);
    expect(questionProfiles(fhir.resources, "retained")).toEqual(operation === "any of" ? [] : profiles);
    const cases = join(dirname(path), "cases.cel");
    writeFileSync(cases, `library "Cases". covers "Aggregate".
fact "Patient": - name is "Synthetic". - birth date is "1970-01-01". - defined by "Patient".
fact "A": - value is "known". - date is "2026-09-27". - defined by "Foreign"."A".
fact "B": - value is "known". - date is "2026-09-27". - defined by "Foreign"."B".
case "Known": - subject is "Patient". - fact is "A". - fact is "B". - result is "Aggregate" is "Passed".
case "Missing": - subject is "Patient". - fact is "A". - result is "Aggregate" is ${operation === "any of" ? 'pause' : '"Passed"'}.
`);
    const graph = resolveCelImports(cases);
    expect(validateCEL(graph).errors).toEqual([]);
    expect(runCel(graph).runs.map(r => r.status)).toEqual(["pass", "pass"]);
  });
  // REFACTOR:grounded — available-set membership and ordinary missing answers have distinct semantics.
  // @kit selected-answer-aggregate:available-values
  it.each([
    ["known", undefined, false], [undefined, "known", false], [undefined, undefined, false],
    ["flagged", undefined, true], [undefined, "flagged", true], ["known", "known", false],
  ])("checks only available values: %s + %s => %s", (a, b, expected) => {
    const d = program(source.replace("any of", "any available value of")).descriptors.find(d => d.title === "Flagged")!;
    const result = produceAnyMembershipCandidate(d, [a === undefined ? undefined : candidate(a), b === undefined ? undefined : candidate(b, "b")], "Patient/p");
    expect(result).toMatchObject({ kind: "candidate", candidate: { resource: { valueBoolean: expected } } });
    if (result.kind === "candidate") expect(result.candidate.validity).toBeUndefined();
  });
  it("ignores selected valueless clears but preserves errors and anchor metadata", () => {
    const d = program(source.replace("any of", "any available value of")).descriptors.find(d => d.title === "Flagged")!;
    const cleared = { ...candidate(undefined), validity: "2026-01", resource: { ...candidate(undefined).resource, effectiveDateTime: "2026-01" } };
    expect(produceAnyMembershipCandidate(d, [cleared, undefined], "Patient/p")).toMatchObject({ kind: "candidate", candidate: { validity: "2026-01", resource: { valueBoolean: false, effectiveDateTime: "2026-01", derivedFrom: [{ reference: "Observation/input" }] } } });
    expect(produceAnyMembershipCandidate(d, [candidate("flagged"), candidate("invalid", "b")], "Patient/p")).toMatchObject({ kind: "error", code: "publication-uninterpretable-value" });
    const mixed = candidate("flagged", "b"); mixed.resource.valueCodeableConcept!.coding.push({ system: "urn:answers", code: "known" });
    expect(produceAnyMembershipCandidate(d, [candidate("flagged"), mixed], "Patient/p")).toMatchObject({ kind: "error", code: "publication-ambiguous-coded-value" });
  });
  it("keeps both operations distinct in a single emitted library and in producer identities", () => {
    const available = source.slice(source.indexOf('concept "Flagged":'), source.indexOf('activity "Passed":')).replace('concept "Flagged":', 'concept "Available Flagged":').replace("any of", "any available value of");
    const text = source.replace('activity "Passed":', available + 'activity "Passed":');
    const p = program(text); expect(p.diagnostics).toEqual([]);
    const descriptors = p.descriptors.filter(d => d.producer?.kind === "anyMembership");
    expect(descriptors.map(d => d.producer?.kind === "anyMembership" && d.producer.availableValuesOnly)).toEqual([false, true]);
    const oldId = program().descriptors.find(d => d.title === "Flagged")!.producer!.producerId;
    const newId = program(source.replace("any of", "any available value of")).descriptors.find(d => d.title === "Flagged")!.producer!.producerId;
    expect(oldId).not.toBe(newId);
    const emitted = emitCQLImports(fixture(text)); expect(emitted.success, JSON.stringify(emitted.errors)).toBe(true);
    const serialized = JSON.stringify(emitted);
    expect(serialized).toContain(", false, 0,"); expect(serialized).toContain(", true, 0,");
  });
});
