import * as path from "path";

import { describe, expect, it } from "vitest";

import { resolveCelImports } from "../../imports";
import { emitCelToFhir } from "../emitFhir";

/**
 * #189 base QI-Core (disc 495) — resource-type coverage. Emits a case that carries an Observation, a Procedure,
 * and a MedicationRequest case-feature, and asserts each instance emits its base-QI-Core required elements +
 * `meta.profile`. Complements the cms22/cms69 goldens (Observation/Condition/Patient only) by exercising the
 * Procedure (`performedDateTime`, us-core-7) and MedicationRequest (`requester`, us-core-21) requireds.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const CEL = path.join(REPO_ROOT, "src/tests/fixtures/policies/resource-coverage/resource-coverage.cel");
const QICORE = "http://hl7.org/fhir/us/qicore/StructureDefinition";

describe("#189 base QI-Core — resource-type coverage (Observation/Procedure/MedicationRequest)", () => {
  const result = emitCelToFhir(resolveCelImports(CEL));

  const bodyOf = (t: string): Record<string, unknown> | undefined =>
    result.emittedCases.flatMap((c) => c.resources).find((r) => r.resourceType === t)?.body as
      | Record<string, unknown>
      | undefined;

  it("emits with no error diagnostics", () => {
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("Patient: identifier + name + meta.profile qicore-patient", () => {
    const p = bodyOf("Patient")!;
    expect(p).toBeDefined();
    expect((p.identifier as unknown[])?.length).toBeGreaterThan(0);
    expect((p.name as unknown[])?.length).toBeGreaterThan(0);
    expect((p.meta as { profile?: string[] })?.profile).toContain(`${QICORE}/qicore-patient`);
  });

  it("Observation: status final + category + meta.profile qicore-simple-observation", () => {
    const o = bodyOf("Observation")!;
    expect(o).toBeDefined();
    expect(o.status).toBe("final");
    expect((o.category as unknown[])?.length).toBeGreaterThan(0);
    expect((o.meta as { profile?: string[] })?.profile).toContain(`${QICORE}/qicore-simple-observation`);
  });

  it("Procedure: status completed + performedDateTime (us-core-7) + meta.profile qicore-procedure", () => {
    const p = bodyOf("Procedure")!;
    expect(p).toBeDefined();
    expect(p.status).toBe("completed");
    expect(p.performedDateTime).toBe("2026-02-01");
    expect((p.meta as { profile?: string[] })?.profile).toContain(`${QICORE}/qicore-procedure`);
  });

  it("MedicationRequest: status/intent + requester (us-core-21) + meta.profile qicore-medicationrequest", () => {
    const m = bodyOf("MedicationRequest")!;
    expect(m).toBeDefined();
    expect(m.status).toBe("active");
    expect(m.intent).toBe("order");
    expect((m.requester as { reference?: string })?.reference).toMatch(/^Patient\//);
    expect((m.meta as { profile?: string[] })?.profile).toContain(`${QICORE}/qicore-medicationrequest`);
  });
});
