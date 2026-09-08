import { isFhirDefError } from "../types";
import * as path from "path";

import { describe, expect, it } from "vitest";

import { emitFhirDefFromPath } from "../closureOrchestrator";

/**
 * Current explicit Record/Observation age publication with a Patient source projection.
 * Checks emission diagnostics, an Inferences Library, profile and action input presence.
 * This suite does not inspect the age CQL algorithm or execute native age arbitration.
 */

const FIXTURE = path.join(__dirname, "fixtures", "patient-age", "src", "crl", "patient-age.crl");
const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");

describe("patient-age publication FHIR artifacts", () => {
  const r = emitFhirDefFromPath(FIXTURE, { date: FIXED_DATE });

  it("emits with no errors", () => {
    expect(r.errors.filter(isFhirDefError)).toEqual([]);
    expect(r.metadataErrors).toEqual([]);
  });

  it("emits an Inferences Library", () => {
    const inferred = r.resources.find(
      (res) => res.relativePath === "Library/PatientAgeInferences.json",
    );
    expect(inferred).toBeDefined();
  });

  it("retains the age case-feature StructureDefinition + PlanDefinition input (case-3 human-assert fallback)", () => {
    const sd = r.resources.find(
      (res) => res.relativePath === "StructureDefinition/patient-age-age-18-or-older.json",
    );
    expect(sd).toBeDefined();
    // The decision PlanDefinition carries an action.input referencing that SD.
    const pd = r.resources.find(
      (res) =>
        res.relativePath === "PlanDefinition/patient-age-adult-eligibility-determination.json",
    );
    expect(pd).toBeDefined();
    const inputs: unknown[] = [];
    const walk = (actions: unknown): void => {
      if (!Array.isArray(actions)) return;
      for (const a of actions) {
        const rec = a as { input?: unknown; action?: unknown };
        if (Array.isArray(rec.input)) inputs.push(...rec.input);
        walk(rec.action);
      }
    };
    walk((pd!.resource as { action?: unknown }).action);
    const serialized = JSON.stringify(inputs);
    expect(serialized).toContain("patient-age-age-18-or-older");
  });
});
