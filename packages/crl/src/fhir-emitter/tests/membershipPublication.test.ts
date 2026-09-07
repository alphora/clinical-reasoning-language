import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emitFhirDefFromPath } from "../closureOrchestrator";
import { emitCQLImports } from "../../imports/emit";
import { resolveCelImports } from "../../cel/imports";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { validateCEL } from "../../cel/validator/validator";
import { CPG_FEATURE_EXPRESSION_EXT } from "../types";
import { validateCRLImports } from "../../imports/validate";
import { preparePublicationContext } from "../../imports/preparePublicationContext";

// REFACTOR:grounded (#320, reviews 562/563): assertions derive from selected Record publication,
// owning declaration identity, explicit answer domains, and question/answer capability; legacy examples are not the oracle.
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const operand = `concept "Choice":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`choice\`.
- shape reduction is most recent.
- value domain is answer options.
- value from:
  - \`yes\` display is \`Yes\`, qualifying.
  - \`no\` display is \`No\`, not qualifying.
`;
const producer = (name = "Answer", ref = '"Choice"', code = "") => `concept "${name}":
- shape is Record.
- type is Observation.
- value type is boolean.
${code ? `- code is \`${code}\`.\n` : ""}- definition is ${ref} in qualifying.
- shape reduction is most recent.
`;
const actions = `activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`DENIED\`.
`;
const decision = `decision "D":
first:
- when "Answer" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
`;
function fixture(source: string, siblings: string[] = [], value?: string, factTarget = "Choice", factOwner = "Policy") {
  const dir = mkdtempSync(join(tmpdir(), "crl-membership-publication-")); dirs.push(dir);
  mkdirSync(join(dir, "src", "crl"), { recursive: true }); mkdirSync(join(dir, "src", "cel"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "publication", version: "1.0.0", crl: { canonicalBase: "http://example.org/publication", date: "2026-09-06" } }));
  const crl = join(dir, "src", "crl", "main.crl"); writeFileSync(crl, source);
  siblings.forEach((s, i) => writeFileSync(join(dir, "src", "crl", `s${i}.crl`), s));
  const cel = join(dir, "src", "cel", "main.cel");
  writeFileSync(cel, `library "Cases".\ncovers "Policy".\nfact "Patient":\n- defined by "Patient".\nfact "Input":\n- defined by "${factOwner}"."${factTarget}".\n${value === undefined ? "" : `- value is ${value}.\n`}case "C":\n- subject is "Patient".\n- fact is "Input".\n- result is "D" is "Approve".\n`);
  return { crl, graph: resolveCelImports(cel) };
}
const source = (coded = false) => `library "Policy".\n${operand}${producer("Answer", '"Choice"', coded ? "answer" : "")}${actions}${decision}`;
const profiles = (result: ReturnType<typeof emitFhirDefFromPath>) => result.resources.filter((r) => r.resourceType === "StructureDefinition").map((r) => r.resource as Record<string, any>);

const photo = `concept "Photo":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`photo\`.
- shape reduction is most recent.
`;
const actionTree = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...actionTree(node.action ?? [])]);

describe("selected membership FHIR and CEL", () => {
  it.each([false, true])("reads a foreign publication through its prepared binding in first: (named=%s)", (named) => {
    const local = photo.replace("- shape is Record.\n", "").replace("- shape reduction is most recent.", "- definition is exists this.");
    const foreign = photo.replace('"Photo"', '"X"').replace('`photo`', '`foreign-x`');
    const criterion = named ? 'criterion "Ready":\n- when ("Foreign"."X").\n' : '';
    const guard = named ? '"Ready"' : '"Foreign"."X"';
    const { crl } = fixture(`library "Policy".\n${local}${criterion}${actions}decision "D":\nfirst:\n- when ${guard} then recommend activity "Approve".\n- otherwise then recommend activity "Deny".\n`, [`library "Foreign".\n${foreign}`]);
    const result = emitFhirDefFromPath(crl); expect(result.success, JSON.stringify({ errors: result.errors, unmatched: result.unmatched })).toBe(true);
    expect(profiles(result)).toHaveLength(1);
    const plan = result.resources.find((r) => r.sourceKind === "Decision")!.resource as any;
    const branches = actionTree(plan.action).filter((a) => a.definitionCanonical);
    expect(branches).toHaveLength(2); expect(branches[0].input).toHaveLength(1);
    if (!named) {
      const target = [...emitCQLImports(crl).publicationTargets!.values()][0]!;
      expect(plan.library).toContain(`http://example.org/publication/Library/${target.libraryName}`);
      expect(branches[0].condition[0].expression.expression).toContain(`"${target.libraryName}"."${target.define}"`);
      expect(branches[1].condition[0].expression.expression).toBe(`not ${branches[0].condition[0].expression.expression}`);
    }
  });
  it.each([false, true])("retains same-named local and foreign criterion dependencies (transitive=%s)", (transitive) => {
    const legacyPhoto = photo.replace("- shape is Record.\n", "").replace("- shape reduction is most recent.", "- definition is exists this.");
    const localX = legacyPhoto.replace('"Photo"', '"X"').replace('`photo`', '`local-x`');
    const foreignX = photo.replace('"Photo"', '"X"').replace('`photo`', '`foreign-x`');
    const criterion = transitive
      ? 'criterion "Inner":\n- when ("Foreign"."X").\ncriterion "Ready":\n- when ("X" or "Inner").\n'
      : 'criterion "Ready":\n- when ("X" or "Foreign"."X").\n';
    const { crl } = fixture(`library "Policy".\n${legacyPhoto}${localX}${criterion}${actions}decision "D":\nall:\n- when ("Photo" or "Ready") then recommend activity "Approve".\n- when "Photo" then recommend activity "Deny".\n`, [`library "Foreign".\n${foreignX}`]);
    const validated = validateCRLImports(crl);
    expect(validated.success, JSON.stringify(validated.validationErrors)).toBe(true);
    expect(validated.importDiagnostics).toEqual([]);
    const prepared = preparePublicationContext(validated.graph, { canonicalBase: "http://example.org/publication", policyId: "publication" });
    expect(prepared.publications.diagnostics).toEqual([]);
    expect(prepared.publications.descriptors.map((d) => [d.identity.libraryName, d.identity.conceptName])).toEqual([["Foreign", "X"]]);
    const emitted = emitFhirDefFromPath(crl); expect(emitted.success, JSON.stringify(emitted.errors)).toBe(true);
    const sds = profiles(emitted); expect(sds).toHaveLength(3); expect(new Set(sds.map((p) => p.url)).size).toBe(3);
    const plan = emitted.resources.find((r) => r.sourceKind === "Decision")!.resource as any;
    expect(plan.action).toHaveLength(2); expect(plan.action[0].condition).toHaveLength(1);
    expect(plan.action[0].condition[0].expression.expression).toContain(' or ');
    expect(plan.action[0].input.flatMap((i: any) => i.profile).sort()).toEqual(sds.map((s) => s.url).sort());
    expect(plan.action[1].input).toHaveLength(1);
  });
  it("dedupes bare and self-qualified inputs after criterion dependency collection", () => {
    const { crl } = fixture(`library "Policy".\n${operand}${producer()}criterion "Ready":\n- when ("Answer" or "Policy"."Answer").\n${actions}${decision.replace('when "Answer"', 'when "Ready"')}`);
    const emitted = emitFhirDefFromPath(crl); expect(emitted.success, JSON.stringify(emitted.errors)).toBe(true);
    expect(profiles(emitted)).toHaveLength(1);
    const plan = emitted.resources.find((r) => r.sourceKind === "Decision")!.resource as any;
    const approve = actionTree(plan.action).find((a) => a.definitionCanonical?.includes("approve"));
    expect(approve.input).toHaveLength(1);
  });
  it.each(['"Photo" or "Answer"', 'not (not "Photo" and not "Answer")', '"Photo" or "Ready"'])(
    "preserves a whole publication condition and its inputs: %s", (guard) => {
      // The criterion vector's other leaf is legacy: only traversal THROUGH Ready finds a publication.
      const photoSource = guard.includes("Ready") ? photo.replace("- shape is Record.\n", "").replace("- shape reduction is most recent.", "- definition is exists this.") : photo;
      const crlSource = `library "Policy".\n${operand}${producer()}${photoSource}criterion "Ready":\n- when ("Answer").\n${actions}decision "D":\nall:\n- when (${guard}) then recommend activity "Approve".\n- when "Photo" then recommend activity "Deny".\n`;
      const { crl } = fixture(crlSource); const result = emitFhirDefFromPath(crl);
      expect(result.success, JSON.stringify({errors:result.errors,imports:result.importDiagnostics})).toBe(true);
      const plan = result.resources.find((r) => r.sourceKind === "Decision")!.resource as any;
      const branches = actionTree(plan.action).filter((a) => a.definitionCanonical);
      expect(branches).toHaveLength(2);
      const condition = branches[0].condition;
      expect(condition).toHaveLength(1);
      expect(condition[0].expression.language).toBe("text/cql-expression");
      if (!guard.includes("Ready")) expect(condition[0].expression.expression).toContain('FHIRHelpers.ToBoolean(');
      expect(condition[0].expression.expression).not.toContain('Coalesce');
      expect(branches[0].input).toHaveLength(2);
      expect(branches[1].input).toHaveLength(1);
      if (guard.includes("Ready")) expect(condition[0].expression.expression).toContain('."Ready"');
    });
  it("preserves the same compound failure boundary in first priority exclusions", () => {
    const { crl } = fixture(`library "Policy".\n${operand}${producer()}${photo}${actions}${decision.replace('when "Answer"', 'when ("Photo" or "Answer")')}`);
    const result = emitFhirDefFromPath(crl); expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const plan = result.resources.find((r) => r.sourceKind === "Decision")!.resource as any;
    const branches = actionTree(plan.action).filter((a) => a.definitionCanonical);
    expect(branches).toHaveLength(2);
    expect(branches[0].condition).toHaveLength(1); expect(branches[1].condition).toHaveLength(1);
    expect(branches[1].condition[0].expression.expression).toBe(`not (${branches[0].condition[0].expression.expression})`);
  });
  it.each([false, true])("gathers the coded operand and only an authored own answer slot (coded=%s)", (coded) => {
    const { crl } = fixture(source(coded)); const result = emitFhirDefFromPath(crl);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const sds = profiles(result); expect(sds).toHaveLength(coded ? 2 : 1);
    const choice = sds.find((sd) => sd.title === "Choice")!;
    expect(choice.differential.element.find((e: any) => e.path === "Observation.value[x]")).toMatchObject({ min: 0, type: [{ code: "CodeableConcept" }], binding: { strength: "extensible" } });
    expect(choice.differential.element.filter((e: any) => e.path === "Observation.category").every((e: any) => e.min === 0)).toBe(true);
    expect(choice.differential.element.find((e: any) => e.path === "Observation.code").patternCodeableConcept.coding[0]).not.toHaveProperty("display");
    const cql = emitCQLImports(crl); const targets = [...cql.publicationTargets!.values()];
    const binding = choice.extension.find((e: any) => e.url === CPG_FEATURE_EXPRESSION_EXT).valueExpression;
    const target = targets.find((t) => t.define === "Choice")!;
    expect(binding.reference).toBe(`http://example.org/publication/Library/${target.libraryName}`);
    const inputs = JSON.stringify(result.resources.filter((r) => r.sourceKind === "Decision"));
    for (const sd of sds) expect(inputs).toContain(sd.url);
    const codes = result.resources.filter((r) => r.resourceType === "CodeSystem").flatMap((r) => (r.resource as any).concept ?? []).map((c: any) => c.code);
    expect(codes.includes("answer")).toBe(coded);
  });
  it("gathers same-named qualified operands from two owners without decisions", () => {
    const main = `library "Policy".\n${producer("Answer", '"Left"."Choice"')}${producer("Other", '"Right"."Choice"')}${actions}${decision.replace('when "Answer"', 'when ("Answer" and "Other")')}`;
    const { crl } = fixture(main, [`library "Left".\n${operand}`, `library "Right".\n${operand}`]);
    const result = emitFhirDefFromPath(crl);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const sds = profiles(result); expect(sds).toHaveLength(2);
    expect(new Set(sds.map((s) => s.url)).size).toBe(2);
    const codes = sds.map((s) => s.differential.element.find((e: any) => e.path === "Observation.code").patternCodeableConcept.coding[0]);
    expect(new Set(codes.map((c) => c.system)).size).toBe(2);
    expect(codes.map((c) => c.code)).toEqual(["choice", "choice"]);
    const inputs = JSON.stringify(result.resources.filter((r) => r.sourceKind === "Decision"));
    for (const sd of sds) expect(inputs).toContain(sd.url);
  });
  it.each(['"yes"', '"no"', '"http://foreign.example|outside"', undefined])("CEL preserves typed answers and unknown: %s", (value) => {
    const { graph } = fixture(source(), [], value); const result = emitCelToFhir(graph);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const observation = result.emittedCases[0]!.resources.find((r) => r.resourceType === "Observation")!.body;
    expect(observation).not.toHaveProperty("valueString");
    if (value === undefined) expect(observation).not.toHaveProperty("valueCodeableConcept");
    else expect(observation).toHaveProperty("valueCodeableConcept");
    expect((observation.meta as any).profile).toHaveLength(1);
    expect(validateCEL(graph).errors).toEqual([]);
  });
  it("CEL permits coded derived false and refuses an uncoded direct assertion", () => {
    const coded = fixture(source(true), [], "false", "Answer");
    expect(validateCEL(coded.graph).errors).toEqual([]);
    expect(emitCelToFhir(coded.graph).emittedCases[0]!.resources.find((r) => r.resourceType === "Observation")!.body.valueBoolean).toBe(false);
    const uncoded = fixture(source(), [], "false", "Answer");
    expect(validateCEL(uncoded.graph).errors.some((e) => e.kind === "cannot-directly-assert-derived-concept")).toBe(true);
    expect(emitCelToFhir(uncoded.graph).emittedCases).toEqual([]);
  });
  it("rejects wrong carriers and half-migrated declarations", () => {
    const wrong = fixture(source(), [], "true");
    expect(validateCEL(wrong.graph).errors.some((e) => e.kind === "local-coded-value-invalid")).toBe(true);
    expect(emitCelToFhir(wrong.graph).emittedCases).toEqual([]);
    const half = fixture(source().replace("- value domain is answer options.\n", ""), [], '"yes"');
    expect(emitFhirDefFromPath(half.crl).success).toBe(false);
    expect(emitCelToFhir(half.graph).emittedCases).toEqual([]);
  });
  it("surfaces the shared no-negative-domain warning without blocking", () => {
    const { crl, graph } = fixture(source().replace("display is `No`, not qualifying.", "display is `No`, qualifying."), [], '"yes"');
    const fhir = emitFhirDefFromPath(crl); expect(fhir.success).toBe(true);
    expect(fhir.errors.filter((e) => e.kind === "publication-membership-no-negative-domain")).toHaveLength(1);
    expect(emitCelToFhir(graph).diagnostics.filter((d) => d.kind === "publication-membership-no-negative-domain")).toMatchObject([{ severity: "warning" }]);
    expect(emitCelToFhir(graph).diagnostics.find((d) => d.kind === "publication-membership-no-negative-domain")).toHaveProperty("filePath", crl);
    expect(validateCEL(graph).warnings.find((d) => d.kind === "publication-membership-no-negative-domain")).toHaveProperty("filePath", crl);
  });
  it("CEL uses the qualified operand owner's exact coding and profile", () => {
    const main = `library "Policy".\n${producer("Answer", '"Foreign"."Choice"')}${actions}${decision}`;
    const { crl, graph } = fixture(main, [`library "Foreign".\n${operand}`], '"yes"', "Choice", "Foreign");
    expect(validateCEL(graph).errors).toEqual([]);
    const emitted = emitCelToFhir(graph); expect(emitted.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const observation = emitted.emittedCases[0]!.resources.find((r) => r.resourceType === "Observation")!.body as any;
    const sd = profiles(emitFhirDefFromPath(crl))[0]!;
    expect(observation.meta.profile).toEqual([sd.url]);
    expect(observation.code.coding[0]).toEqual(sd.differential.element.find((e: any) => e.path === "Observation.code").patternCodeableConcept.coding.map(({ system, code }: any) => ({ system, code }))[0]);
    expect(observation.valueCodeableConcept.coding[0].system).toContain("publication-foreign-choice");
  });
  it("routes a foreign producer warning to that producer's CRL file", () => {
    const main = `library "Policy".\n${actions}${decision.replace('when "Answer"', 'when "Derived"."Answer"')}`;
    const options = `library "Options".\n${operand.replace("display is `No`, not qualifying.", "display is `No`, qualifying.")}`;
    const derived = `library "Derived".\n${producer("Answer", '"Options"."Choice"')}`;
    const { crl, graph } = fixture(main, [options, derived], '"yes"', "Choice", "Options");
    const expectedPath = join(crl, "..", "s1.crl");
    const emitted = emitCelToFhir(graph).diagnostics.find((d) => d.kind === "publication-membership-no-negative-domain");
    const validated = validateCEL(graph).warnings.find((d) => d.kind === "publication-membership-no-negative-domain");
    expect(emitted).toMatchObject({ filePath: expectedPath, location: { start: { line: 6 } } });
    expect(validated).toMatchObject({ filePath: expectedPath, location: { start: { line: 6 } } });
    expect(expectedPath).not.toBe(crl);
    expect(expectedPath).not.toBe(graph.filePath);
  });
  it("CEL entrypoints diagnose malformed prepared graph identity without legacy fallback", () => {
    const { graph } = fixture(source(), [], '"yes"'); graph.coversTarget!.name = "Skewed Registry Name";
    expect(() => emitCelToFhir(graph)).not.toThrow(); expect(() => validateCEL(graph)).not.toThrow();
    expect(emitCelToFhir(graph)).toMatchObject({ emittedCases: [], diagnostics: [{ kind: "publication-preparation-failed", severity: "error" }] });
    expect(validateCEL(graph).errors).toMatchObject([{ kind: "publication-preparation-failed", severity: "error" }]);
  });
});
