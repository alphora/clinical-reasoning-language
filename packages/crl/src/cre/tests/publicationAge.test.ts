import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../run";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import { ageMethod } from "../../emit/publicationAge";

// REFACTOR:grounded (#320, plan583): ordinary CEL subject/answer emission and coherent consumer wiring.
describe("age publication CEL and CRE", () => {
  it("evaluates uncoded age from Patient without creating an answer slot", () => {
    const parent = path.resolve(os.tmpdir()), dir = mkdtempSync(path.join(parent, "crl-age-uncoded-"));
    if (path.dirname(dir) !== parent || !path.basename(dir).startsWith("crl-age-uncoded-")) throw Error("Unexpected test directory");
    try {
      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "age-read", version: "0.0.0", crl: { canonicalBase: "http://example.org/age-read", date: "2026-09-07" } }));
      const crl = path.join(dir, "policy.crl"), cel = path.join(dir, "cases.cel");
      writeFileSync(crl, readFileSync(path.join(__dirname, "../../emit/tests/fixtures/publication-age.crl"), "utf8").replace(/^- code is .*\r?\n/m, ""));
      const cases = `library "Age Read Cases".
covers "Age Publication".
fact "Adult":
- defined by "Patient".
- birth date is "1980-01-01".
fact "Child":
- defined by "Patient".
- birth date is "2020-01-01".
fact "Missing":
- defined by "Patient".
case "Adult":
- subject is "Adult".
- result is "D" is "Approve".
case "Child":
- subject is "Child".
- result is "D" is "Deny".
case "Missing":
- subject is "Missing".
- result is "D" is pause.
`;
      writeFileSync(cel, cases);
      const run = runCel(resolveCelImports(cel), { now: new Date("2026-09-07T12:00:00Z") });
      expect(run.runs.map(r => ({ status: r.status, diagnostics: r.diagnostics }))).toEqual(Array.from({ length: 3 }, () => ({ status: "pass", diagnostics: [] })));
      const fhir = emitFhirDefFromPath(crl);
      expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
      expect(fhir.resources.some(r => r.resource.resourceType === "StructureDefinition")).toBe(false);
      writeFileSync(cel, cases + '\nfact "Invented Answer":\n- defined by "Age Publication"."Adult".\n- value is false.\ncase "Invalid":\n- subject is "Adult".\n- fact is "Invented Answer".\n- result is "D" is "Deny".\n');
      const invalid = emitCelToFhir(resolveCelImports(cel));
      expect(invalid.diagnostics.some(d => d.severity === "error" || d.kind === "unsupported-yet"), JSON.stringify(invalid.diagnostics)).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("repairs missing birthDate and applies the pattern's same-day rule", () => {
    const parent = path.resolve(os.tmpdir()), dir = mkdtempSync(path.join(parent, "crl-age-publication-"));
    if (path.dirname(dir) !== parent || !path.basename(dir).startsWith("crl-age-publication-")) throw Error("Unexpected test directory");
    try {
      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "age-publication", version: "0.0.0", crl: { canonicalBase: "http://example.org", date: "2026-09-07" } }));
      const crl = path.join(dir, "policy.crl"), cel = path.join(dir, "cases.cel");
      writeFileSync(crl, readFileSync(path.join(__dirname, "../../emit/tests/fixtures/publication-age.crl")));
      writeFileSync(cel, `library "Age Cases".
covers "Age Publication".
fact "Known":
- defined by "Patient".
- birth date is "2008-09-07".
fact "Missing":
- defined by "Patient".
fact "No":
- defined by "Age Publication"."Adult".
- value is false.
- date is "2026-09-07".
fact "Old No":
- defined by "Age Publication"."Adult".
- value is false.
- date is "2026-09-06".
case "Birthday":
- subject is "Known".
- result is "D" is "Approve".
case "Override":
- subject is "Known".
- fact is "No".
- result is "D" is "Deny".
case "Recalculate":
- subject is "Known".
- fact is "Old No".
- result is "D" is "Approve".
case "Missing":
- subject is "Missing".
- result is "D" is pause.
case "Repair":
- subject is "Missing".
- fact is "No".
- result is "D" is "Deny".
`);
      const graph = resolveCelImports(cel), emission = emitCelToFhir(graph);
      expect(emission.diagnostics.filter(d => d.severity === "error")).toEqual([]);
      const observations = emission.emittedCases.flatMap(c => c.resources).filter(r => r.resourceType === "Observation");
      expect(observations).toHaveLength(3);
      for (const o of observations) expect(o.body.method).toEqual(ageMethod("asserted"));
      const run = runCel(graph, { now: new Date("2026-09-07T12:00:00Z") });
      expect(run.runs.map(r => ({ status: r.status, diagnostics: r.diagnostics }))).toEqual(Array.from({ length: 5 }, () => ({ status: "pass", diagnostics: [] })));
      const originalCel = readFileSync(cel, "utf8");
      for (const validity of ["2020", "2026-08", "2027", "2026-10"]) {
        writeFileSync(cel, originalCel.replace('date is "2026-09-06"', `date is "${validity}"`));
        const partial = runCel(resolveCelImports(cel), { now: new Date("2026-09-07T12:00:00Z") });
        const recalculated = partial.runs[2];
        if (validity === "2020" || validity === "2026-08") expect(recalculated.status).toBe("pass");
        else {
          expect(recalculated.status).toBe("error");
          expect(JSON.stringify(recalculated.diagnostics)).toContain("publication-age-future-input");
        }
      }
      const emitted = emitFhirDefFromPath(crl);expect(emitted.success, JSON.stringify(emitted.errors)).toBe(true);
      const profile = emitted.resources.find(r => r.resource.resourceType === "StructureDefinition")!.resource as any;
      expect(profile.differential.element.find((e: any) => e.path === "Observation.method")).toMatchObject({ min: 1, defaultValueCodeableConcept: ageMethod("asserted") });
      expect(profile.differential.element.find((e: any) => e.path === "Observation.method").patternCodeableConcept).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
