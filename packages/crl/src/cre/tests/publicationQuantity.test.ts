import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCelImports } from "../../cel/imports";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { runCel } from "../run";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import { emitCQLImports } from "../../imports/emit";

// REFACTOR:grounded (#320, plan587): actual CEL quantities drive the selected-value comparison.
describe("Quantity publication CEL/CRE", () => {
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
      // This prerequisite preserves CRE's explicit imports boundary; CQL emission has its own coverage.
      const full=readFileSync(crl,"utf8"), start=full.indexOf('concept "Flag":');
      writeFileSync(path.join(dir,"measurements.crl"), full.slice(0,start).replace('library "Quantity Publication".', 'library "Measurements".'));
      writeFileSync(crl, 'library "Quantity Publication".\n'+full.slice(start).replace('"Height" at least','"Measurements"."Height" at least'));
      writeFileSync(cel,readFileSync(cel,"utf8").replaceAll('"Quantity Publication"."Height"','"Measurements"."Height"'));
      const foreign=runCel(resolveCelImports(cel));
      expect(foreign.runs.every(r=>r.status!=="pass" && r.diagnostics.some(d=>d.includes("publication-unsupported-scope")))).toBe(true);
      const emitted=emitCQLImports(crl);expect(emitted.success,JSON.stringify(emitted.errors)).toBe(true);
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
});
