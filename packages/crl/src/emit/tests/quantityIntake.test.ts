import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import { prepareSingleLibraryPublication, adaptPublicationCandidate } from "../publicationProgram";
import { produceHasValueCandidate } from "../publicationHasValue";
import { selectPublicationCandidate } from "../publicationSelection";
import { emitCQLImports } from "../../imports/emit";
import { validateCRLImports } from "../../imports/validate";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import { resolveCelImports } from "../../cel/imports";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { runCel } from "../../cre/run";
import { quantityIntakeSource, QUANTITY_INTAKE_CEL } from "../../authoring-kit/quantityIntakeExample";

const base = "https://example.org/numeric-intake";
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
function fixture(source = quantityIntakeSource(), cel = QUANTITY_INTAKE_CEL) {
  const dir = mkdtempSync(join(tmpdir(), "crl-numeric-intake-"));
  dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "numeric-intake", version: "1.0.0", crl: { canonicalBase: base, date: "2026-10-09" } }));
  const path = join(dir, "policy.crl");
  writeFileSync(path, source);
  const cases = join(dir, "cases.cel");
  writeFileSync(cases, cel);
  return { path, cases, dir };
}
function program() {
  const ast = buildCRL(quantityIntakeSource());
  expect(ast.success).toBe(true);
  const p = prepareSingleLibraryPublication(ast.result!, { canonicalBase: base, policyId: "numeric-intake" });
  expect(p.diagnostics).toEqual([]);
  return { answer: p.descriptors.find(d => d.title === "Completed Sessions")!, presence: p.descriptors.find(d => d.title === "Has Completed Sessions")! };
}
const resource = (extra: Record<string, unknown> = {}) => ({ resourceType: "Observation", id: "answer", status: "final", ...extra });

describe("Quantity intake presence", () => {
  // @kit text-answers:quantity-presence
  it.each([
    [undefined, false], [{ unit: "1" }, false], [{ system: "urn:foreign" }, false], [{ unit: "1", _value: { extension: [{ url: "urn:absent", valueCode: "unknown" }] } }, false],
    [{ value: 0, unit: "1" }, true], [{ value: 3, unit: "{session}" }, true], [{ value: 2, unit: "{session}/wk" }, true],
    [{ value: 0, unit: "d/wk" }, true], [{ value: 1.5, unit: "h/d" }, true],
    [{ value: 2, system: "http://unitsofmeasure.org", code: "h/d", unit: "display label" }, true],
  ])("checks the numeric value, not the Quantity object: %j", (quantity, present) => {
    const { answer, presence } = program();
    const a = adaptPublicationCandidate(answer, resource(quantity === undefined ? {} : { valueQuantity: quantity }));
    expect(a.kind).toBe("candidate");
    if (a.kind !== "candidate") throw Error(a.message);
    const produced = produceHasValueCandidate(presence, a.candidate, "Patient/p");
    expect(produced.kind).toBe("candidate");
    if (produced.kind === "candidate") expect(produced.candidate.resource.valueBoolean).toBe(present);
    const missing = produceHasValueCandidate(presence, undefined, "Patient/p");
    if (missing.kind === "candidate") expect(missing.candidate.resource).toMatchObject({ valueBoolean: false });
  });
  it.each(["bad", { value: "3", unit: "1" }, { value: Infinity, unit: "1" }, { value: 1 }, { value: 0, unit: " " }, { value: 0, unit: "\u00a0" }, { value: 0, system: "http://unitsofmeasure.org", code: " ", unit: "1" }, { value: 1, unit: "1", comparator: ">" }, { value: 1, system: "urn:foreign", code: "1" }, { value: 1, system: "http://unitsofmeasure.org", unit: "1" }])("retains invalid Quantity errors: %j", valueQuantity => {
    expect(adaptPublicationCandidate(program().answer, resource({ valueQuantity })).kind).toBe("error");
  });
  it("a newer valueless selected answer displaces the populated answer with retained validity/provenance", () => {
    const { answer, presence } = program();
    const old = adaptPublicationCandidate(answer, resource({ valueQuantity: { value: 0, unit: "1" }, effectiveDateTime: "2026-10-01" }));
    const clear = adaptPublicationCandidate(answer, resource({ id: "clear", valueQuantity: { unit: "1" }, effectiveDateTime: "2026-10-09" }));
    if (old.kind !== "candidate" || clear.kind !== "candidate") throw Error("adaptation failed");
    const selected = selectPublicationCandidate([old.candidate, clear.candidate], { conceptId: answer.conceptId, equalTime: "error" });
    expect(selected.state).toBe("selected");
    if (selected.state !== "selected") throw Error("selection failed");
    const p = produceHasValueCandidate(presence, selected.candidate, "Patient/p");
    if (p.kind !== "candidate") throw Error(p.message);
    expect(p.candidate.resource).toMatchObject({ valueBoolean: false, effectiveDateTime: "2026-10-09", derivedFrom: [{ reference: "Observation/clear" }] });
    expect(selectPublicationCandidate([old.candidate, { ...old.candidate, key: "second", retrievedInputIdentity: "Observation/second" }], { conceptId: answer.conceptId, equalTime: "error" }).state).toBe("failed");
  });
  // @kit text-answers:quantity-workflows
  it("keeps optional counts/rates nonblocking through validation, emission, CEL and CRE", () => {
    const f = fixture();
    const validation = validateCRLImports(f.path);
    expect(validation.success, JSON.stringify(validation.validationErrors)).toBe(true);
    const graph = resolveCelImports(f.cases);
    const data = emitCelToFhir(graph);
    expect(data.diagnostics.filter(d => d.severity === "error")).toEqual([]);
    expect(data.emittedCases[1].resources.map(r => r.body)).toContainEqual(expect.objectContaining({ valueQuantity: { value: 0, unit: "d/wk" } }));
    const run = runCel(graph);
    expect(run.runs.map(r => ({ status: r.status, diagnostics: r.diagnostics }))).toEqual([{ status: "pass", diagnostics: [] }, { status: "pass", diagnostics: [] }]);
    expect(run.runs.map(r => r.produced.length)).toEqual([1, 1]);
    const cql = emitCQLImports(f.path);
    expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
    expect(cql.cqlByLibrary.map(x => x.cql).join("\n")).toContain("else if valueType = 'Quantity' then (operand.selected.resource.value as FHIR.Quantity).value.value is not null");
    const fhir = emitFhirDefFromPath(f.path);
    expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
    const sd = fhir.resources.filter(r => r.resourceType === "StructureDefinition").map(r => r.resource as any);
    expect(sd).toHaveLength(3);
    for (const profile of sd) expect(profile.differential.element.find((e: any) => e.path === "Observation.value[x]").type).toEqual([{ code: "Quantity" }]);
  });
  it("required counts gate the result without inventing a threshold or treating false as a pause", () => {
    const f = fixture(quantityIntakeSource(true));
    const validation = validateCRLImports(f.path);
    expect(validation.success, JSON.stringify(validation.validationErrors)).toBe(true);
    const runs = runCel(resolveCelImports(f.cases)).runs;
    // The blank case intentionally expects Review: its failure demonstrates result withholding, not a null-condition pause.
    expect(runs[0].status).toBe("fail");
    expect(runs[0].produced).toEqual([]);
    expect(runs[1].status, JSON.stringify(runs[1])).toBe("pass");
  });
  it.each(["d/wk", "h/d", "1", "toString", "constructor"])("validation and execution both reject unsupported threshold units %s, while presence needs no threshold", unit => {
    const source = quantityIntakeSource().replace('"Completed Sessions" has a value', `"Completed Sessions" at least 0 '${unit}'`);
    const f = fixture(source);
    const validation = validateCRLImports(f.path);
    expect(validation.success).toBe(false);
    expect(validation.validationErrors.some(e => e.message.includes("Quantity threshold requires"))).toBe(true);
    expect(emitCQLImports(f.path).success).toBe(false);
    expect(runCel(resolveCelImports(f.cases)).runs.every(r => r.status !== "pass")).toBe(true);
  });
  it("resolves selected numeric dependencies from a qualified imported owner", () => {
    const full = quantityIntakeSource();
    const start = full.indexOf('concept "Has Completed Sessions"');
    const child = full.slice(0, start).replace('library "Numeric Intake".', 'library "Counts".');
    const root = 'library "Numeric Intake".\n' + full.slice(start).replace('"Completed Sessions" has a value', '"Counts"."Completed Sessions" has a value').replace(/presentation for "Completed Sessions":[\s\S]*?(?=concept "Days)/, '');
    const f = fixture(root, QUANTITY_INTAKE_CEL.replace('defined by "Numeric Intake"."Completed Sessions"', 'defined by "Counts"."Completed Sessions"'));
    writeFileSync(join(f.dir, "counts.crl"), child);
    expect(validateCRLImports(f.path).success).toBe(true);
    expect(emitCQLImports(f.path).success).toBe(true);
    expect(emitFhirDefFromPath(f.path).success).toBe(true);
    expect(runCel(resolveCelImports(f.cases)).runs.map(r => r.status)).toEqual(["pass", "pass"]);
  });
});
