import { describe, expect, it } from "@jest/globals";

import type { Terminology, TerminologyBodyLine } from "../../ast/types";
import { emitValueSet, emitValueSetsForLibrary } from "../valueSet";
import type { CpgMetadata } from "../types";

const LOC = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } as const;

const METADATA: CpgMetadata = {
  version: "1.0.0",
  name: "cms22",
  title: "CMS22 Demo",
  description: "CMS22 Blood Pressure Control demonstration corpus",
  publisher: "Smile Digital Health",
  contact: [{ system: "email", value: "ops@smiledigitalhealth.com" }],
  canonicalBase: "http://hl7.org/fhir/us/cqfmeasures/crl/cms22",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

const FIXED_CLOCK = () => new Date("2026-06-04T15:30:00.000Z");

function term(name: string, body: TerminologyBodyLine[]): Terminology {
  return { type: "Terminology", name, body, location: LOC };
}

describe("fhir-emitter valueSet.emitValueSet", () => {
  it("emits a cpg-shareableValueSet for a valueset-URL terminology", () => {
    const t = term("BP Screening Encounter Codes", [
      {
        type: "TerminologyValueset",
        valuesetName: "http://example.org/vs/bp-screening-encounter",
        location: LOC,
      },
    ]);
    const { resource, errors, unmatched } = emitValueSet(t, "CMS22 Terminology", METADATA, {
      clock: FIXED_CLOCK,
    });
    expect(errors).toEqual([]);
    expect(unmatched).toEqual([]);
    expect(resource).not.toBeNull();
    const r = resource!.resource as Record<string, unknown>;
    expect(r.resourceType).toBe("ValueSet");
    expect(r.id).toBe("cms22-terminology-bp-screening-encounter-codes");
    // default capability = publishable → additive CRMI profiles (shareable→publishable).
    expect((r.meta as { profile: string[] }).profile).toEqual([
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-shareablevalueset",
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-computablevalueset",
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-publishablevalueset",
    ]);
    expect(r.url).toBe(
      "http://hl7.org/fhir/us/cqfmeasures/crl/cms22/ValueSet/cms22-terminology-bp-screening-encounter-codes",
    );
    expect(r.name).toBe("Cms22TerminologyBpScreeningEncounterCodes");
    expect(r.title).toBe("CMS22 Demo");
    expect(r.status).toBe("draft");
    expect(r.experimental).toBe(true);
    expect(r.date).toBe("2026-06-04T15:30:00.000Z");
    expect(r.publisher).toBe("Smile Digital Health");
    expect(r.description).toBe("CMS22 Blood Pressure Control demonstration corpus");
    expect(r.compose).toEqual({
      include: [{ valueSet: ["http://example.org/vs/bp-screening-encounter"] }],
    });
    expect(resource!.relativePath).toBe(
      "ValueSet/cms22-terminology-bp-screening-encounter-codes.json",
    );
  });

  it("emits inline system+code body", () => {
    const t = term("Inline Codes", [
      { type: "TerminologySystem", system: "http://loinc.org", location: LOC },
      { type: "TerminologyCode", code: "85354-9", location: LOC },
      { type: "TerminologyCode", code: "8480-6", location: LOC },
    ]);
    const { resource } = emitValueSet(t, "Lib", METADATA, { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.compose).toEqual({
      include: [{ system: "http://loinc.org", concept: [{ code: "85354-9" }, { code: "8480-6" }] }],
    });
  });

  it("Δ-G2 — mixed body (multiple valueset is + multiple system+code) preserves ordering", () => {
    const t = term("Mixed", [
      {
        type: "TerminologyValueset",
        valuesetName: "http://example.org/vs/a",
        location: LOC,
      },
      { type: "TerminologySystem", system: "http://loinc.org", location: LOC },
      { type: "TerminologyCode", code: "1", location: LOC },
      {
        type: "TerminologyValueset",
        valuesetName: "http://example.org/vs/b",
        location: LOC,
      },
      { type: "TerminologySystem", system: "http://snomed.info/sct", location: LOC },
      { type: "TerminologyCode", code: "2", location: LOC },
      { type: "TerminologyCode", code: "3", location: LOC },
    ]);
    const { resource } = emitValueSet(t, "Lib", METADATA, { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.compose).toEqual({
      include: [
        { valueSet: ["http://example.org/vs/a"] },
        { system: "http://loinc.org", concept: [{ code: "1" }] },
        { valueSet: ["http://example.org/vs/b"] },
        { system: "http://snomed.info/sct", concept: [{ code: "2" }, { code: "3" }] },
      ],
    });
  });

  it("Δ1 — empty package.json description defaults to library name in emitted resource", () => {
    const m: CpgMetadata = { ...METADATA, description: "", title: "" };
    const t = term("Codes", [
      { type: "TerminologyValueset", valuesetName: "http://example.org/vs/x", location: LOC },
    ]);
    const { resource, errors } = emitValueSet(t, "My Library", m, { clock: FIXED_CLOCK });
    expect(errors).toEqual([]);
    const r = resource!.resource as Record<string, unknown>;
    expect(r.description).toBe("My Library");
    expect(r.title).toBe("My Library");
  });

  it("Δ6 — non-ASCII slug fallback warning", () => {
    const t = term("高血圧 Codes", [
      { type: "TerminologyValueset", valuesetName: "http://example.org/vs/x", location: LOC },
    ]);
    const { errors } = emitValueSet(t, "Lib", METADATA, { clock: FIXED_CLOCK });
    expect(errors.some((e) => e.kind === "non-ascii-slug-fallback")).toBe(true);
  });

  it("Δ13 — omits useContext / jurisdiction / contact from JSON when empty", () => {
    const m: CpgMetadata = { ...METADATA, contact: [], jurisdiction: [], useContext: [] };
    const t = term("Codes", [
      { type: "TerminologyValueset", valuesetName: "http://example.org/vs/x", location: LOC },
    ]);
    const { resource } = emitValueSet(t, "Lib", m, { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.contact).toBeUndefined();
    expect(r.jurisdiction).toBeUndefined();
    expect(r.useContext).toBeUndefined();
  });

  it("emits useContext / jurisdiction / contact when non-empty", () => {
    const m: CpgMetadata = {
      ...METADATA,
      contact: [{ system: "email", value: "ops@example.org" }],
      jurisdiction: [{ coding: [{ system: "urn:iso:std:iso:3166", code: "US" }] }],
      useContext: [
        {
          code: { system: "http://terminology.hl7.org/CodeSystem/usage-context-type", code: "task" },
          valueCodeableConcept: { coding: [{ system: "http://example.org/sys", code: "q" }] },
        },
      ],
    };
    const t = term("Codes", [
      { type: "TerminologyValueset", valuesetName: "http://example.org/vs/x", location: LOC },
    ]);
    const { resource } = emitValueSet(t, "Lib", m, { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.contact).toHaveLength(1);
    expect(r.jurisdiction).toHaveLength(1);
    expect(r.useContext).toHaveLength(1);
  });

  it("empty body → empty-terminology UnmatchedReference", () => {
    const t = term("Empty", []);
    const { resource, unmatched } = emitValueSet(t, "Lib", METADATA, { clock: FIXED_CLOCK });
    expect(resource).not.toBeNull();
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]!.kind).toBe("empty-terminology");
    const r = resource!.resource as Record<string, unknown>;
    expect(r.compose).toEqual({ include: [] });
  });
});

describe("fhir-emitter valueSet.emitValueSetsForLibrary (Δ5 collision)", () => {
  it("emits all terminologies when slugs are distinct", () => {
    const ts = [
      term("BP Codes", [
        { type: "TerminologyValueset", valuesetName: "http://example.org/vs/a", location: LOC },
      ]),
      term("Hba1c Codes", [
        { type: "TerminologyValueset", valuesetName: "http://example.org/vs/b", location: LOC },
      ]),
    ];
    const { resources, errors } = emitValueSetsForLibrary(ts, "Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    expect(errors).toEqual([]);
    expect(resources).toHaveLength(2);
  });

  it("round-2 invariant: emitted resource.id is at most 64 chars even when names are huge", () => {
    const ts = [
      term("X".repeat(80), [
        { type: "TerminologyValueset", valuesetName: "http://example.org/vs/a", location: LOC },
      ]),
    ];
    const { resources } = emitValueSetsForLibrary(ts, "Y".repeat(80), METADATA, { clock: FIXED_CLOCK });
    expect(resources).toHaveLength(1);
    const r = resources[0]!.resource as Record<string, unknown>;
    expect((r.id as string).length).toBeLessThanOrEqual(64);
  });

  it("round-2 invariant: emitted resource.name conforms to FHIR name regex", () => {
    const ts = [
      term("Codes", [{ type: "TerminologyValueset", valuesetName: "http://example.org/vs/a", location: LOC }]),
    ];
    const { resources } = emitValueSetsForLibrary(ts, "123 Lib", METADATA, { clock: FIXED_CLOCK });
    const r = resources[0]!.resource as Record<string, unknown>;
    expect(r.name).toMatch(/^[A-Z][A-Za-z0-9_]{0,254}$/);
  });

  it("round-2 invariant: canonical url has no double-slash between base and ValueSet", () => {
    const m: CpgMetadata = { ...METADATA, canonicalBase: "http://example.org/base" };
    const ts = [
      term("Codes", [{ type: "TerminologyValueset", valuesetName: "http://example.org/vs/a", location: LOC }]),
    ];
    const { resources } = emitValueSetsForLibrary(ts, "Lib", m, { clock: FIXED_CLOCK });
    const r = resources[0]!.resource as Record<string, unknown>;
    expect((r.url as string).indexOf("//ValueSet/")).toBe(-1);
  });

  it("Δ5 — errors on slug collision and skips colliding entries", () => {
    const ts = [
      term("BP Codes", [
        { type: "TerminologyValueset", valuesetName: "http://example.org/vs/a", location: LOC },
      ]),
      // Different CRL name, same slug after lowercase
      term("bp codes", [
        { type: "TerminologyValueset", valuesetName: "http://example.org/vs/b", location: LOC },
      ]),
    ];
    const { resources, errors } = emitValueSetsForLibrary(ts, "Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    expect(errors.some((e) => e.kind === "slug-collision")).toBe(true);
    // Both colliding entries dropped from the resources list; only non-colliding pass through.
    expect(resources).toHaveLength(0);
  });
});
