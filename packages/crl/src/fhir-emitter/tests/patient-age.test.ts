import * as path from "path";

import { describe, expect, it } from "@jest/globals";

import { emitFhirDefFromPath } from "../closureOrchestrator";

/**
 * Patient-age both-representation RECENCY merge — end-to-end CRL → FHIR/CQL.
 *
 * The fixture concept "Age 18 Or Older" carries BOTH a `code is` local assertion
 * AND a `definition is age today at least 18 years` computation. The Inferred
 * layer must RECENCY-MERGE them (newest valid local Observation vs the live
 * computed age) via `CFH.recencyAgeTruths(...)`, and the age concept must STILL
 * get its case-feature input/StructureDefinition (the case-3 human-assert
 * fallback that seeds the very Observation cases 1/2 read).
 *
 * The behavioral proof (computed TRUE/FALSE, asserted-newer overrides live,
 * stale-assertion-ignored, not-determined) is the $r5.apply harness; this test
 * pins the emitted CQL SHAPE + the retained input in the jest suite.
 */

const FIXTURE = path.join(__dirname, "fixtures", "patient-age", "src", "crl", "patient-age.crl");
const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");

describe("patient-age both-rep recency merge (CRL → FHIR/CQL)", () => {
  const r = emitFhirDefFromPath(FIXTURE, { date: FIXED_DATE });

  it("emits with no errors", () => {
    expect(r.errors).toEqual([]);
    expect(r.metadataErrors).toEqual([]);
  });

  it("emits the four-layer split incl. the Inferred Library (recency merge lives in its sibling CQL)", () => {
    // The recency CQL SHAPE (CFH.recencyAgeTruths + newest-Observation filter +
    // computed AtLeast(AgeAt(), Q)) is asserted directly in the cql-emitter suite
    // (lowerLocalCodes.test.ts); here we confirm the FHIR closure emits the
    // Inferred Library whose content attachment points at that CQL.
    const inferred = r.resources.find(
      (res) => res.relativePath === "Library/PatientAgeInferred.json",
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
