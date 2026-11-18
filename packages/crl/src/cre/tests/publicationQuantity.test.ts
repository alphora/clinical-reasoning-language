import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCelImports } from "../../cel/imports";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { runCel } from "../run";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import { emitCQLImports } from "../../imports/emit";
import { quantityThresholdSource } from "../../authoring-kit/quantityThresholdExample";

// REFACTOR:grounded (#320, plan587): actual CEL quantities drive the selected-value comparison.
describe("Quantity publication CEL/CRE", () => {
  // @kit text-answers:quantity-thresholds-candidate-order
  it.each([true, false])("declared=%s preserves older incompatible versus newer valid Quantity admission", declared => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "crl-threshold-order-"));
    try {
      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "quantity-order", version: "0.0.0", crl: { canonicalBase: "https://example.org/quantity-order", date: "2026-11-18" } }));
      const source = quantityThresholdSource("%", "at most", 55);
      writeFileSync(path.join(dir, "policy.crl"), declared ? source : source.replace("Quantity '%'", "Quantity"));
      const cel = path.join(dir, "cases.cel");
      writeFileSync(cel, `library "Cases". covers "Quantity Threshold Intake".
fact "P": - defined by "Patient".
fact "Old": - defined by "Quantity Threshold Intake"."Measurement". - value is 1 'ms'. - date is "2026-11-01".
fact "New": - defined by "Quantity Threshold Intake"."Measurement". - value is 55 '%'. - date is "2026-11-02".
case "Latest": - subject is "P". - fact is "Old". - fact is "New". - result is "Assessment" is "Meets".
`);
      const context = resolveCelImports(cel), data = emitCelToFhir(context), run = runCel(context);
      if (declared) {
        expect(data.diagnostics.some(d => d.message.includes("Quantity is incompatible with its declared type unit"))).toBe(true);
        expect(run.runs.map(r => r.status), JSON.stringify(run)).toEqual(["error"]);
        expect(JSON.stringify(run.runs)).toContain("Quantity is incompatible with its declared type unit");
      } else {
        expect(data.diagnostics.filter(d => d.severity === "error")).toEqual([]);
        expect(run.errors).toEqual([]); expect(run.runs.map(r => r.status)).toEqual(["pass"]);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  // @kit text-answers:quantity-thresholds-cre
  it.each(["%", "ms"])("runs both inclusive operators with native unit identities and imported owners for %s", unit => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "crl-threshold-"));
    try {
      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "quantity-threshold", version: "0.0.0", crl: { canonicalBase: "https://example.org/quantity-threshold", date: "2026-11-18" } }));
      const crl = path.join(dir, "policy.crl"), cel = path.join(dir, "cases.cel");
      for (const comparison of ["at least", "at most"] as const) for (const imported of [false, true]) {
        const source = quantityThresholdSource(unit, comparison, 55);
        const start = source.indexOf('concept "Threshold Met":');
        writeFileSync(crl, imported ? 'library "Quantity Threshold Intake".\n' + source.slice(start).replace('"Measurement"', '"Measurements"."Measurement"') : source);
        const owner = imported ? "Measurements" : "Quantity Threshold Intake";
        if (imported) writeFileSync(path.join(dir, "measurements.crl"), source.slice(0, start).replace('library "Quantity Threshold Intake".', 'library "Measurements".'));
        const rows = [["Below", 54.99999999], ["Equal", 55], ["Above", 55.00000001], ["Zero", 0]] as const;
        writeFileSync(cel, `library "Cases". covers "Quantity Threshold Intake".\nfact "P": - defined by "Patient".\n` + rows.map(([name, value]) => `fact "${name}": - defined by "${owner}"."Measurement". - value is ${value} '${unit}'.\ncase "${name}": - subject is "P". - fact is "${name}". - result is "Assessment" is "${(comparison === "at most" ? value <= 55 : value >= 55) ? "Meets" : "Does Not Meet"}".\n`).join("") + 'case "Missing": - subject is "P". - result is "Assessment" is pause.\n');
        const context = resolveCelImports(cel), data = emitCelToFhir(context), run = runCel(context);
        expect(data.diagnostics.filter(d => d.severity === "error")).toEqual([]);
        expect(JSON.stringify(data)).toContain(`"code":"${unit}"`);
        expect(run.errors).toEqual([]);
        expect(run.runs.map(r => ({ status: r.status, diagnostics: r.diagnostics }))).toEqual(Array.from({ length: 5 }, () => ({ status: "pass", diagnostics: [] })));
        const cql = emitCQLImports(crl); expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
        const calls = cql.cqlByLibrary.map(l => l.cql).join("\n").split("\n").filter(line => !line.startsWith("define function ")).join("\n");
        expect(calls).toContain(comparison === "at most" ? '"__CRL_PublicationProducer_v1_QuantityAtMostCandidate"(' : '"__CRL_PublicationProducer_v1_QuantityThresholdCandidate"(');
        if (!imported) continue;
        // Remove the imported library before the next local iteration; no duplicate owner.
        rmSync(path.join(dir, "measurements.crl"));
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  // @kit source-representation:quantity-cel-outcomes
  it("preserves unit-only CEL quantities, computes determinate outcomes and pauses on absence", () => {
    const parent = path.resolve(os.tmpdir()), dir = mkdtempSync(path.join(parent,"crl-quantity-"));
    if (path.dirname(dir) !== parent || !path.basename(dir).startsWith("crl-quantity-")) throw Error("Unexpected test path");
    try {
      writeFileSync(path.join(dir,"package.json"),JSON.stringify({name:"quantity-publication",version:"0.0.0",crl:{canonicalBase:"http://example.org/quantity",date:"2026-09-07"}}));
      const crl=path.join(dir,"policy.crl"),cel=path.join(dir,"cases.cel");
      writeFileSync(crl,readFileSync(path.join(__dirname,"../../emit/tests/fixtures/publication-quantity.crl")));
      writeFileSync(cel,`library "Measurement Cases".
covers "Quantity Publication".
fact "P":
- defined by "Patient".
fact "Tall":
- defined by "Quantity Publication"."Height".
- value is 200 'cm'.
- date is "2026-09-01".
fact "Short":
- defined by "Quantity Publication"."Height".
- value is 0.9 'm'.
- date is "2026-09-02".
case "Tall":
- subject is "P".
- fact is "Tall".
- result is "D" is "Approve".
case "Override":
- subject is "P".
- fact is "Tall".
- fact is "Short".
- result is "D" is "Deny".
case "Missing":
- subject is "P".
- result is "D" is pause.
`);
      const context=resolveCelImports(cel), data=emitCelToFhir(context), run=runCel(context);
      expect(data.diagnostics.filter(d=>d.severity==="error")).toEqual([]);
      expect(run.runs.map(r=>({status:r.status,diagnostics:r.diagnostics}))).toEqual(Array.from({length:3},()=>({status:"pass",diagnostics:[]})));
      const fhir=emitFhirDefFromPath(crl);expect(fhir.success,JSON.stringify(fhir.errors)).toBe(true);
      expect(fhir.resources.filter(x=>x.resource.resourceType==="StructureDefinition").map(x=>x.resource.id)).toEqual(["quantity-publication-height"]);
      // REFACTOR:grounded (#320, plan593): imported operands preserve the same outcomes.
      const full=readFileSync(crl,"utf8"), start=full.indexOf('concept "Flag":');
      writeFileSync(path.join(dir,"measurements.crl"), full.slice(0,start).replace('library "Quantity Publication".', 'library "Measurements".'));
      writeFileSync(crl, 'library "Quantity Publication".\n'+full.slice(start).replace('"Height" at least','"Measurements"."Height" at least'));
      writeFileSync(cel,readFileSync(cel,"utf8").replaceAll('"Quantity Publication"."Height"','"Measurements"."Height"'));
      const foreign=runCel(resolveCelImports(cel));
      expect(foreign.runs.map(r=>({status:r.status,diagnostics:r.diagnostics}))).toEqual(Array.from({length:3},()=>({status:"pass",diagnostics:[]})));
      const emitted=emitCQLImports(crl);expect(emitted.success,JSON.stringify(emitted.errors)).toBe(true);
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
});
