// #189 Piece 1 (disc 506) — the both-rep value/interface flip, end-to-end on the acceptance policy dme101-030.
// The value concept `Covered Device` (a `code is` + `most recent this` + a `coded from` `source representation`)
// lowers to a 3-OUTPUT split — a LocalPrimitives records retrieve, an ExternalPrimitives `[ServiceRequest:
// "Covered Devices"]` source retrieve, and an Inferences `Scalar<CodeableConcept>` recency merge — and the boolean
// interface `Covered Device Requested` (`code is` + `defined as exists`) emits the three-leg member-existence fold
// (own-arm NEWEST-read, per design v7). This test pins the emitted structure + a CLEAN whole-boundary totality proof
// (the obligation↔discharge reconciliation for the new forms). Behavioral, NOT byte-golden — it asserts the
// load-bearing shapes so a future refactor that breaks them is caught, without freezing incidental formatting.

import { describe, it, expect } from "vitest";
import * as path from "node:path";

import { emitCQLImports } from "../../imports/emit";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import {
  proveWholeBoundaryTotality,
  extractEmittedDefineHeaders,
  type EmittedDefineEntry,
} from "../../emit/booleanTotality";

const ROOT = path.resolve(
  __dirname,
  "../../tests/fixtures/policies/dme101-030/dme101-030.crl",
);

describe("#189 Piece 1 — dme101-030 both-rep value/interface flip emits", () => {
  const res = emitCQLImports(ROOT);
  const libText = (suffix: string): string =>
    (res.cqlByLibrary ?? []).find((l) => l.libraryName.endsWith(suffix))?.cql ?? "";

  it("emits successfully (no deferral / mixed-code errors)", () => {
    expect(JSON.stringify((res as { errors?: unknown }).errors ?? null)).toBe("null");
    expect(res.success).toBe(true);
  });

  it("Covered Device — LocalPrimitives records retrieve (same-name)", () => {
    expect(libText("LocalPrimitives")).toMatch(
      /define "Covered Device":\s*\n\s*\[Observation: \S+LocalConcepts\."Covered Device"\]/,
    );
  });

  it("Covered Device Source — ExternalPrimitives source retrieve", () => {
    expect(libText("ExternalPrimitives")).toMatch(
      /define "Covered Device Source":\s*\n\s*\[ServiceRequest: \S+ExternalConcepts\."Covered Devices"\]/,
    );
  });

  it("Covered Device — Inferences recency-value merge (two-tier recency lattice, no Coalesce)", () => {
    const inf = libText("Inferences");
    // The merge encodes the two-tier selection (disc 507 D — pins the recency semantics structurally):
    //   tier 1 value-presence: source-null → LOCAL; local-null → SOURCE;
    //   tier 2 both-present: recencyLocalWins(localTs, sourceTs) → LOCAL else SOURCE.
    // Local reads Observation.value (CodeableConcept), source reads ServiceRequest.code; recency from
    // `effective`(local, cast dateTime) vs `authoredOn`(source). Scalar-value-or-null — NO totalizing Coalesce
    // (charter §4: a both-absent merge is legitimately null, which the interface fold reads as non-existence).
    expect(inf).toMatch(/define "Covered Device":\s*\n\s*if \([\s\S]*?\) is null then/); // source-null → local
    expect(inf).toMatch(/else if \([\s\S]*?\) is null then/); // local-null → source
    expect(inf).toMatch(/else if CFH\.recencyLocalWins\([\s\S]*?authoredOn\.value\) then/); // tie-break on real ts
    expect(inf).toMatch(/\.value as FHIR\.CodeableConcept/); // local value read (conforming cast)
    expect(inf).toMatch(/where O\.value is FHIR\.CodeableConcept/); // conforming-row filter (non-conforming masks nothing)
    expect(inf).toMatch(/ExternalPrimitives\."Covered Device Source"/);
    expect(inf).not.toMatch(/define "Covered Device":[\s\S]*?Coalesce/);
  });

  it("Inferences includes BOTH Local and External Primitives", () => {
    const inf = libText("Inferences");
    expect(inf).toMatch(/include \S+LocalPrimitives/);
    expect(inf).toMatch(/include \S+ExternalPrimitives/);
  });

  it("Covered Device Requested — three-leg member-existence fold (own NEWEST-read, not any-true)", () => {
    const inf = libText("Inferences");
    // own arm: NEWEST own boolean value (Last(... sort by effective), ToBoolean ... is true) — NOT exists(where true).
    expect(inf).toMatch(
      /define "Covered Device Requested":\s*\n\s*FHIRHelpers\.ToBoolean\(\(Last\([\s\S]*?\)\)\.value as FHIR\.boolean\) is true/,
    );
    expect(inf).not.toMatch(/define "Covered Device Requested":[\s\S]*?where O\.value[\s\S]*?is true\)/);
    // member legs.
    expect(inf).toMatch(/or exists \(\S+LocalPrimitives\."Covered Device"\)/);
    expect(inf).toMatch(/or exists \(\S+ExternalPrimitives\."Covered Device Source"\)/);
  });

  it("Interface re-exports the fold BARE (not `.satisfied()` on a bare boolean)", () => {
    const iface = libText("Interface");
    expect(iface).toMatch(/define "Covered Device Requested":\s*\n\s*\S+Inferences\."Covered Device Requested"\s*\n/);
    expect(iface).not.toMatch(/"Covered Device Requested":[\s\S]*?\.satisfied\(\)/);
  });

  it("whole-boundary totality proof is CLEAN (obligation↔discharge reconciles for the new forms)", () => {
    const entries: EmittedDefineEntry[] = (res.cqlByLibrary ?? []).flatMap(
      (l) => (l.ledgerEntries ?? []) as EmittedDefineEntry[],
    );
    const headers = (res.cqlByLibrary ?? []).flatMap((l) =>
      extractEmittedDefineHeaders(l.cql, l.libraryName),
    );
    const proof = proveWholeBoundaryTotality(entries, headers);
    expect(proof.status, JSON.stringify(proof)).toBe("proven");
  });

  it("FHIR lane emits cleanly (no dangling cpg-featureExpression — Claude #10)", () => {
    const fhir = emitFhirDefFromPath(ROOT, { date: new Date("2020-01-01T00:00:00.000Z") });
    const fhirErrors = ((fhir as { errors?: unknown[] }).errors ?? []) as unknown[];
    expect(fhirErrors, JSON.stringify(fhirErrors)).toHaveLength(0);
    expect(fhir.success).toBe(true);
    // Covered Device gets a case-feature StructureDefinition (a record-bearing concept, North Star §4), and its
    // cpg-featureExpression targets the SAME-NAME LocalPrimitives define "Covered Device" (NOT "Covered Device
    // Records" — the recency-value split uses the both-rep same-name convention). Inv 2(d) would have caught a dangle.
    const sd = fhir.resources.find(
      (r) => r.resourceType === "StructureDefinition" && (r.resource as { id?: string }).id === "dme101-030-covered-device",
    );
    expect(sd, "Covered Device case-feature SD").toBeDefined();
    const ext = ((sd!.resource as Record<string, unknown>).extension as Array<Record<string, unknown>>) ?? [];
    const fe = ext.find((e) => String(e.url).includes("cqf-featureExpression") || String(e.url).includes("cpg-featureExpression"));
    const expr = (fe?.valueExpression as { expression?: string } | undefined)?.expression ?? "";
    expect(expr).toBe("Covered Device");
  });
});
