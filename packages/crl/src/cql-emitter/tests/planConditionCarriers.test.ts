import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INTAKE_CRL } from "../../authoring-kit/intakeExample";
import { emitCQLImports } from "../../imports/emit";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import { nodeLocallyTotal } from "../../emit/booleanTotality";

// Compatibility control for existing legacy action-unless behavior, not a general authoring rule.
describe("compiler condition carriers", () => {
  it("keeps branch NOT nullable and action unless totalized on the same legacy Boolean", () => {
    const dir = mkdtempSync(join(tmpdir(), "crl-condition-carriers-"));
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "carrier-test", version: "1.0.0",
        crl: { canonicalBase: "https://example.org/carrier", date: "2026-09-19" } }));
      const source = INTAKE_CRL.slice(0, INTAKE_CRL.indexOf('decision "Intake"')) +
        'concept "Legacy Guard": - type is Observation. - value type is boolean. - code is `legacy`.\n' +
        'decision "Intake": first:\n' +
        '- when not "Legacy Guard" then: all:\n' +
        '  - recommend activity "Human Review" unless "Legacy Guard".\n' +
        '  end.\n- otherwise then recommend activity "Human Review".\n';
      const file = join(dir, "policy.crl"); writeFileSync(file, source);
      const cql = emitCQLImports(file);
      expect(cql.success, JSON.stringify(cql)).toBe(true);
      const entries = cql.cqlByLibrary.flatMap(l => l.ledgerEntries ?? []);
      const branch = entries.find(e => e.name.startsWith("Not CRL branch Ref"));
      const action = entries.find(e => e.name.startsWith("Not CRL action Ref"));
      expect(branch).toBeDefined(); expect(action).toBeDefined();
      expect(branch!.cql).not.toContain("Coalesce");
      expect(branch!.discharge.booleanEffect).toBe("three-state");
      expect(action!.cql).toContain("not Coalesce((");
      expect(action!.origin).toBe("plan-action-condition");
      expect(nodeLocallyTotal(action!)).toBe(true);
      const fhir = emitFhirDefFromPath(file);
      expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
      expect(fhir.resources.some(r => r.resourceType === "Library" &&
        (r.resource as { name?: string }).name === "FHIRHelpers")).toBe(false);
      for (const lib of cql.cqlByLibrary.filter(l => !l.isSharedCatalog))
        expect(lib.cql).toContain("include hl7.fhir.uv.cql.FHIRHelpers version '4.0.1' called FHIRHelpers");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
