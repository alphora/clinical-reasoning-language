import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UNCERTAINTY_REFERENCE_CRL } from "../../authoring-kit/uncertaintyExample";
import { emitFhirDefFromPath } from "../closureOrchestrator";

// REFACTOR:grounded: display metadata must not change any emitted clinical resource, including embedded CQL.
describe("uncertainty guard display annotation emission neutrality", () => {
  // @kit uncertainty-guard-display:emission-neutral
  it.each(["concept", "criterion"])("keeps all FHIR and embedded CQL bytes identical for a %s marker", target => {
    const directory = mkdtempSync(join(tmpdir(), "crl-uncertainty-display-"));
    try {
      mkdirSync(join(directory, "src", "crl"), { recursive: true });
      writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "uncertainty-display", version: "1.0.0", crl: { canonicalBase: "https://example.org/uncertainty-display" } }));
      const file = join(directory, "src", "crl", "policy.crl");
      const marker = "- meta is `@tree-uncertainty-guard: Terminal uncertainty check; pass false`.";
      const unmarked = UNCERTAINTY_REFERENCE_CRL.replace(marker, "");
      const baseline = target === "concept" ? unmarked : unmarked.replaceAll('when "Current G A B Answers Include Uncertainty"', 'when "Display Check"') + '\ncriterion "Display Check": - when ("Current G A B Answers Include Uncertainty").';
      const annotated = target === "concept" ? UNCERTAINTY_REFERENCE_CRL : baseline.replace('criterion "Display Check":', `criterion "Display Check": ${marker}`);
      expect(annotated).not.toBe(baseline);
      writeFileSync(file, baseline);
      const before = emitFhirDefFromPath(file, { date: "2026-11-02" });
      expect(before.success, JSON.stringify(before.errors)).toBe(true);
      writeFileSync(file, annotated);
      const after = emitFhirDefFromPath(file, { date: "2026-11-02" });
      expect(after.success, JSON.stringify(after.errors)).toBe(true);
      expect(after.resources.some(resource => resource.resourceType === "Library")).toBe(true);
      expect(JSON.stringify(after.resources)).toBe(JSON.stringify(before.resources));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
