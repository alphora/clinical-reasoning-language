import { describe, it, expect } from "vitest";

import { emitValueSet } from "../valueSet";
import type { Terminology } from "../../ast/types";
import type { CpgMetadata } from "../types";

/**
 * #189 piece 3 — a PURE single-reference terminology (`valueset is <url>`) emits a self-contained membership STUB
 * at the DECLARED canonical. FHIR requirement (verified against ecQM QICore external VSs): `url` = the declared
 * canonical verbatim, `id` = its LAST path segment (the OID / slug tail), so the resource resolves by the canonical
 * the CQL `valueset` decl already binds. Stub convention: one per-VS code under `reference-vs-stub` + expansion +
 * `experimental=true`. A URN / non-canonical reference falls back to the pre-existing slug emission.
 */
const META: CpgMetadata = {
  name: "test-policy",
  canonicalBase: "http://example.org/crl/test",
  version: "1.0.0",
  status: "active",
  experimental: false,
  publisher: "Test",
  title: "Test",
  description: "Test",
  contact: [],
  jurisdiction: [],
  useContext: [],
};

const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } };

function refTerminology(name: string, url: string): Terminology {
  return {
    type: "Terminology",
    name,
    body: [{ type: "TerminologyValueset", valuesetName: url, location: loc }],
    location: loc,
  };
}

describe("#189 piece 3 — reference-VS stub emit", () => {
  it("an OID canonical → id = the OID (url tail), url = declared, experimental=true, self-contained stub", () => {
    const url = "http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.1577";
    const { resource, errors } = emitValueSet(refTerminology("Pharmacologic Therapy", url), "Lib", META);
    expect(errors.filter((e) => e.type === "Validation" && e.kind !== "non-ascii-slug-fallback")).toEqual([]);
    const r = resource!.resource as Record<string, unknown>;
    expect(r.id).toBe("2.16.840.1.113883.3.526.1577"); // FHIR id = url tail (dots legal)
    expect(r.url).toBe(url); // canonical = declared, byte-identical to the CQL `valueset` decl
    expect(r.experimental).toBe(true);
    expect(resource!.relativePath).toBe("ValueSet/2.16.840.1.113883.3.526.1577.json");
    // self-contained: enumerated compose + a pre-computed expansion, NO `{valueSet:[url]}` pointer.
    const compose = r.compose as { include: Array<{ system?: string; concept?: Array<{ code: string }>; valueSet?: unknown }> };
    expect(compose.include[0].valueSet).toBeUndefined();
    expect(compose.include[0].system).toBe("http://example.org/crl/test/CodeSystem/reference-vs-stub");
    expect(compose.include[0].concept).toEqual([{ code: "2.16.840.1.113883.3.526.1577" }]);
    expect((r.expansion as { contains: unknown[] }).contains).toEqual([
      { system: "http://example.org/crl/test/CodeSystem/reference-vs-stub", code: "2.16.840.1.113883.3.526.1577" },
    ]);
  });

  it("a slug canonical (dme101-030 style) → id = the slug tail, url = declared", () => {
    const url = "http://example.org/hcsc/dme101-030/ValueSet/covered-devices";
    const { resource } = emitValueSet(refTerminology("Covered Devices", url), "Lib", META);
    const r = resource!.resource as Record<string, unknown>;
    expect(r.id).toBe("covered-devices");
    expect(r.url).toBe(url);
    expect(r.experimental).toBe(true);
  });

  it("a URN / non-canonical reference falls back to the slug emission (no stub, no hard error)", () => {
    const { resource, errors } = emitValueSet(refTerminology("Placeholder", "urn:example:placeholder"), "Lib", META);
    expect(errors.filter((e) => e.type === "Validation")).toEqual([]);
    const r = resource!.resource as Record<string, unknown>;
    // id stays the library-slug valueSetId; url stays under canonicalBase; experimental inherits metadata (false).
    expect(r.url).toBe("http://example.org/crl/test/ValueSet/test-policy-placeholder");
    expect(r.experimental).toBe(false);
  });
});
