// REFACTOR:grounded (#328): input defaults preserve unit-bearing data and shared profile semantics.
import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildCRL } from "../../index";
import { questionUnitSource } from "../../authoring-kit/questionUnitExample";
import { createPresentationCatalog } from "../presentation";
import { prepareSingleLibraryPublication } from "../publicationProgram";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import { emitCQLImports } from "../../imports/emit";
import { QUESTION_UNIT_URL, QUESTION_UNIT_SYSTEM } from "../questionUnit";
import { planPresentationEdit } from "../../editing/presentationEdit";
import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../../cre/run";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { emitCrlTwoLane } from "../../emit-two-lane";
import { writeTwoLane } from "../../emit-writers";
import { packageFhir } from "../../fhir-package";
import { extract } from "tar";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function ast(source = questionUnitSource()) {
  const parsed = buildCRL(source);
  expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
  return parsed.result!;
}
function fixture(source = questionUnitSource(), shared?: string) {
  const root = mkdtempSync(join(tmpdir(), "crl-question-unit-")); roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "question-unit", version: "0.0.0", private: true,
    crl: { canonicalBase: "https://example.org/question-unit", date: "2026-11-01" } }));
  const path = join(root, "main.crl"); writeFileSync(path, source);
  if (shared) writeFileSync(join(root, "Shared.crl"), shared);
  return path;
}
function objects(value: unknown): Record<string, any>[] {
  if (!value || typeof value !== "object") return [];
  return [value as Record<string, any>, ...Object.values(value).flatMap(v => Array.isArray(v) ? v.flatMap(objects) : objects(v))];
}

// @kit text-answers:question-unit
test("parses one default unit, preserves it in wording edits and inherits it into scoped wording", () => {
  const source = questionUnitSource(), parsed = ast(source);
  expect(parsed.presentations![0].questionUnit).toBe("kg/m2");
  const edited = planPresentationEdit(source, { library: "Quantity Unit Intake", concept: "BMI", questionText: "Updated BMI question" });
  expect(ast(edited.candidateSource).presentations![0].questionUnit).toBe("kg/m2");
  const scoped = ast(source + '\npresentation for "BMI":\n- in decision "Assessment".\n- question text is "Scoped BMI".\n');
  expect(createPresentationCatalog(scoped).resolve("BMI", { decision: "Assessment", criteria: new Set() })).toMatchObject({ questionText: "Scoped BMI", questionUnit: "kg/m2" });
});

// @kit text-answers:question-unit
test.each(["", " ", "kg/m2'.\n- question unit is 'kg/m2"])("refuses empty, whitespace-only or duplicate unit declarations: %j", unit => {
  expect(buildCRL(questionUnitSource(unit)).success).toBe(false);
});
// @kit text-answers:question-unit
test("diagnoses lexical, scoped and non-Quantity unit declarations", () => {
  expect(createPresentationCatalog(ast()).diagnostics.some(d => d.kind === "presentation-question-unit-runtime-required" && d.severity === "warning")).toBe(true);
  expect(createPresentationCatalog(ast(questionUnitSource("kg m2"))).diagnostics.some(d => d.kind === "presentation-question-unit-invalid")).toBe(true);
  const scoped = questionUnitSource().replace('- question unit is', '- in decision "Assessment".\n- question unit is');
  expect(createPresentationCatalog(ast(scoped)).diagnostics.some(d => d.kind === "presentation-question-unit-invalid")).toBe(true);
  const boolean = questionUnitSource().replace('- value type is Quantity.', '- value type is boolean.');
  expect(createPresentationCatalog(ast(boolean)).diagnostics.some(d => d.kind === "presentation-question-unit-target")).toBe(true);
});

// @kit text-answers:question-unit
test("does not package an unused unit definition when no emitted action input uses it", () => {
  const unused = questionUnitSource(null) + '\nconcept "Unused":\n- shape is Record.\n- type is Observation.\n- value type is Quantity.\n- code is `unused`.\n- shape reduction is most recent.\npresentation for "Unused":\n- question text is "Unused number".\n- question unit is \'1\'.\n';
  const emitted = emitFhirDefFromPath(fixture(unused));
  expect(emitted.success, JSON.stringify(emitted.errors)).toBe(true);
  expect(objects(emitted.resources).some(x => x.url === QUESTION_UNIT_URL)).toBe(false);
});

// @kit text-answers:question-unit
test("emits declared non-constraining input metadata and its real extension definition, without changing clinical profiles or CQL", () => {
  // Preserve line positions so source-location-derived branch identifiers are byte-comparable too.
  const withUnit = fixture(), withoutUnit = fixture(questionUnitSource().replace("- question unit is 'kg/m2'.", ""));
  const a = emitFhirDefFromPath(withUnit), b = emitFhirDefFromPath(withoutUnit);
  expect(a.success, JSON.stringify(a.errors)).toBe(true); expect(b.success, JSON.stringify(b.errors)).toBe(true);
  const descriptors = objects(a.resources).filter(x => x.url === QUESTION_UNIT_URL && x.valueCoding);
  expect(descriptors.length).toBeGreaterThan(0);
  expect(descriptors.every(x => x.valueCoding.system === QUESTION_UNIT_SYSTEM && x.valueCoding.code === "kg/m2")).toBe(true);
  expect(a.resources.filter(r => r.resourceType === "StructureDefinition" && r.resource.url === QUESTION_UNIT_URL)).toHaveLength(1);
  const clinical = (r: typeof a) => r.resources.filter(x => x.resourceType === "StructureDefinition" && x.resource.type !== "Extension").map(x => x.resource);
  expect(clinical(a)).toEqual(clinical(b));
  const cqlA = emitCQLImports(withUnit), cqlB = emitCQLImports(withoutUnit);
  expect(cqlA.success, JSON.stringify(cqlA.errors)).toBe(true); expect(cqlB.success).toBe(true);
  expect(cqlA.cqlByLibrary.map(l => l.cql)).toEqual(cqlB.cqlByLibrary.map(l => l.cql));
  expect(objects(b.resources).some(x => x.url === QUESTION_UNIT_URL)).toBe(false);
});

// @kit text-answers:question-unit-package
test("actual package includes the extension once with fixed canonical/version and matching IG inventory", async () => {
  const policy = fixture(), root = join(policy, "..");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "question-unit", packageId: "org.example.question-unit", version: "2.3.4", author: "Synthetic", description: "Quantity presentation test", crl: { canonicalBase: "https://example.org/question-unit", date: "2026-11-01", fhirDependencies: { "hl7.fhir.uv.cpg": "2.0.0", "hl7.fhir.uv.crmi": "2.0.0", "hl7.fhir.uv.sdc": "3.0.0", "hl7.fhir.uv.cql": "1.0.0", "hl7.terminology.r4": "6.0.2" } } }));
  const emitted = emitCrlTwoLane(policy, { capability: "publishable" });
  expect(emitted.success, JSON.stringify(emitted)).toBe(true); writeTwoLane(emitted, join(root, "src"));
  const packed = await packageFhir({ projectRoot: root }); expect(packed.success, JSON.stringify(packed)).toBe(true);
  mkdirSync(join(root, "unpacked")); await extract({ file: join(root, "output/package.tgz"), cwd: join(root, "unpacked") });
  const index = JSON.parse(readFileSync(join(root, "unpacked/package/.index.json"), "utf8"));
  expect(index.files.filter((f: any) => f.url === QUESTION_UNIT_URL)).toHaveLength(1);
  expect(index.files.find((f: any) => f.url === QUESTION_UNIT_URL).version).toBe("1.0.0");
  const ig = JSON.parse(readFileSync(join(root, "unpacked/package/ImplementationGuide-question-unit.json"), "utf8"));
  expect(ig.definition.resource.filter((r: any) => r.reference?.reference === "StructureDefinition/presentation-question-unit")).toHaveLength(1);
});

// @kit text-answers:question-unit
test.each([false, true])("checks BMI roles and output through actual imported CEL/CRE preparation (include=%s)", include => {
  const root = mkdtempSync(join(tmpdir(), "crl-bmi-unit-")); roots.push(root);
  cpSync(join(__dirname, "fixtures/publication-imports"), root, { recursive: true });
  const declarations = [
    ["weight.crl", "Weight Library", "Measurement", "kg"],
    ["height.crl", "Height Library", "Measurement", "cm"],
    ["bmi.crl", "BMI Library", "BMI", "kg/m2"],
  ];
  for (const [file,, name, unit] of declarations) {
    const path = join(root, file);
    writeFileSync(path, readFileSync(path, "utf8") + `\npresentation for "${name}":\n- question text is "${name}".\n- question unit is '${unit}'.\n`);
  }
  if (include) {
    const path = join(root, "policy.crl");
    writeFileSync(path, readFileSync(path, "utf8").replace('library "Policy".', 'library "Policy".\ninclude "BMI Library".'));
  }
  const execute = () => runCel(resolveCelImports(join(root, "cases.cel")));
  const good = execute(); expect(good.errors).toEqual([]); expect(good.runs.every(r => r.status === "pass")).toBe(true);
  expect(emitCelToFhir(resolveCelImports(join(root, "cases.cel"))).diagnostics.filter(d => d.severity === "error")).toEqual([]);
  for (const [file, library,, unit] of declarations) {
    const path = join(root, file), original = readFileSync(path, "utf8");
    writeFileSync(path, original.replace(`question unit is '${unit}'`, `question unit is '${file === "weight.crl" ? "cm" : "kg"}'`));
    const bad = execute();
    expect(JSON.stringify(bad)).toContain("publication-question-unit-incompatible");
    expect(JSON.stringify(bad)).toContain(library);
    expect(bad.runs.some(r => r.status === "pass")).toBe(false);
    writeFileSync(path, original);
  }
});

// @kit text-answers:question-unit
test.each(["kg", "[lb_av]"])("refuses incompatible/unsupported default unit %s before executing a BMI-unit threshold", unit => {
  const p = prepareSingleLibraryPublication(ast(questionUnitSource(unit)), { canonicalBase: "https://example.org/question-unit", policyId: "question-unit" });
  expect(p.diagnostics.some(d => d.kind === "publication-question-unit-incompatible" && d.message.includes('"BMI"'))).toBe(true);
});

// @kit text-answers:question-unit
test("admits equivalent comparison units and checks the imported owner rather than a local same-name shadow", () => {
  const shared = `library "Shared".\nconcept "Height":\n- shape is Record.\n- type is Observation.\n- value type is Quantity.\n- code is \`height\`.\n- shape reduction is most recent.\npresentation for "Height":\n- question text is "Height".\n- question unit is 'cm'.\n`;
  const main = `library "Main".\nconcept "Height":\n- shape is Record.\n- type is Observation.\n- value type is Quantity.\n- code is \`shadow\`.\n- shape reduction is most recent.\npresentation for "Height":\n- question text is "Unrelated mass".\n- question unit is 'kg'.\nconcept "Tall":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- definition is "Shared"."Height" at least 1 'm'.\n- shape reduction is most recent.\nactivity "Review": - request CPGTaskRequest. - with \`REVIEW\`.\ndecision "D":\nfirst:\n- when "Tall" then recommend activity "Review".\n- otherwise then recommend activity "Review".\n`;
  const good = emitFhirDefFromPath(fixture(main, shared));
  expect(good.success, JSON.stringify(good.errors)).toBe(true);
  expect(objects(good.resources).filter(x => x.url === QUESTION_UNIT_URL && x.valueCoding).map(x => x.valueCoding.code)).toContain("cm");
  const bad = emitFhirDefFromPath(fixture(main, shared.replace("'cm'", "'kg'")));
  expect(bad.success).toBe(false);
  expect(bad.errors.some(d => d.kind === "publication-question-unit-incompatible" && d.message.includes('"Shared"."Height"'))).toBe(true);
});
