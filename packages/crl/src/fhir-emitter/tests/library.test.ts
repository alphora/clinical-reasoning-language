import { describe, expect, it } from "@jest/globals";

import { emitLibrariesForClosure, emitLibrary } from "../library";
import type { CpgMetadata } from "../types";

const METADATA: CpgMetadata = {
  version: "1.0.0",
  name: "cms22",
  title: "CMS22 Demo",
  description: "CMS22 Blood Pressure Control demonstration corpus",
  publisher: "Smile Digital Health",
  contact: [],
  canonicalBase: "http://hl7.org/fhir/us/cqfmeasures/crl/cms22",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

const FIXED_CLOCK = () => new Date("2026-06-04T15:30:00.000Z");

const VS_ANTI = "http://hl7.org/fhir/us/cqfmeasures/crl/cms22/ValueSet/cms22-concepts-antihypertensive-medications-vs";
const VS_BP = "http://hl7.org/fhir/us/cqfmeasures/crl/cms22/ValueSet/cms22-concepts-blood-pressure-panels-vs";

describe("library — emitLibrary", () => {
  it("emits a base FHIR R4 Library with correct shape", () => {
    const { resource, errors, unmatched } = emitLibrary(
      "CMS22 Asserted",
      METADATA,
      [VS_ANTI, VS_BP],
      "cms22-asserted.cql",
      { clock: FIXED_CLOCK },
    );
    expect(errors).toEqual([]);
    expect(unmatched).toEqual([]);
    expect(resource).not.toBeNull();
    const r = resource!.resource as Record<string, unknown>;
    expect(r.resourceType).toBe("Library");
    expect(r.id).toBe("cms22-asserted");
    expect(r.url).toBe("http://hl7.org/fhir/us/cqfmeasures/crl/cms22/Library/cms22-asserted");
    // version sourced from package.json (CRMI requires `version` 1..1 at the
    // shareable floor on emitted FHIR; npm package is authoritative).
    expect(r.version).toBe("1.0.0");
    expect(r.name).toBe("Cms22Asserted");
    // v2.1 round-2: title is the per-Library name, not the package-level metadata.title.
    expect(r.title).toBe("CMS22 Asserted");
    expect(r.status).toBe("draft");
    expect(r.experimental).toBe(true);
    expect(r.date).toBe("2026-06-04T15:30:00.000Z");
    expect(r.publisher).toBe("Smile Digital Health");
    expect(r.description).toBe("CMS22 Blood Pressure Control demonstration corpus");
    expect(r.type).toEqual({
      coding: [{ system: "http://terminology.hl7.org/CodeSystem/library-type", code: "logic-library" }],
    });
    expect(resource!.relativePath).toBe("Library/cms22-asserted.json");
  });

  it("Library claims additive CRMI library profiles (default publishable)", () => {
    const { resource } = emitLibrary("CMS22 Asserted", METADATA, [], "cms22-asserted.cql", { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect((r.meta as { profile: string[] }).profile).toEqual([
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-shareablelibrary",
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-computablelibrary",
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-publishablelibrary",
    ]);
  });

  it("relatedArtifact emits depends-on per ValueSet canonical, deduped + order-preserved", () => {
    const { resource } = emitLibrary(
      "Lib",
      METADATA,
      [VS_ANTI, VS_BP, VS_ANTI, VS_BP, VS_ANTI],
      "lib.cql",
      { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    const related = r.relatedArtifact as Array<{ type: string; resource: string }>;
    expect(related).toEqual([
      { type: "depends-on", resource: VS_ANTI },
      { type: "depends-on", resource: VS_BP },
    ]);
  });

  it("relatedArtifact field is omitted when empty (Δ13 omit-empty pattern)", () => {
    const { resource } = emitLibrary("Lib", METADATA, [], "lib.cql", { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.relatedArtifact).toBeUndefined();
  });

  it("content[0] references the sibling .cql file via attachment.url", () => {
    const { resource } = emitLibrary("Lib", METADATA, [], "lib.cql", { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.content).toEqual([
      { contentType: "text/cql", url: "lib.cql" },
    ]);
  });

  it("description defaults to library name when metadata's description is empty", () => {
    const m: CpgMetadata = { ...METADATA, description: "", title: "" };
    const { resource } = emitLibrary("My Library", m, [], "my-library.cql", { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.description).toBe("My Library");
    expect(r.title).toBe("My Library");
  });

  it("round-2 gpt55 I3: cqlFileName preserves the caller's exact filename (incl. spaces from CRL→CQL emit)", () => {
    // The CRL→CQL emit lane uses raw library names like "CMS22 Asserted.cql"
    // (with spaces). emitLibrary doesn't slug the filename — the caller
    // threads whatever the import-emit produced. This test pins the
    // pass-through contract.
    const { resource } = emitLibrary(
      "CMS22 Asserted",
      METADATA,
      [],
      "CMS22 Asserted.cql",
      { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    expect(r.content).toEqual([
      { contentType: "text/cql", url: "CMS22 Asserted.cql" },
    ]);
  });

  it("non-ASCII library name emits non-ascii-slug-fallback warning", () => {
    const { errors } = emitLibrary("高血圧 Lib", METADATA, [], "lib.cql", { clock: FIXED_CLOCK });
    expect(errors.some((e) => e.kind === "non-ascii-slug-fallback")).toBe(true);
  });

  it("invariant: id is at most 64 chars even for huge library names", () => {
    const longName = "X".repeat(80);
    const { resource } = emitLibrary(longName, METADATA, [], "x.cql", { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect((r.id as string).length).toBeLessThanOrEqual(64);
  });

  it("invariant: name conforms to FHIR name regex", () => {
    const { resource } = emitLibrary("123 Lib", METADATA, [], "x.cql", { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.name).toMatch(/^[A-Z][A-Za-z0-9_]{0,254}$/);
  });

  it("invariant: url has no double-slash between base and Library", () => {
    const m: CpgMetadata = { ...METADATA, canonicalBase: "http://example.org/base" };
    const { resource } = emitLibrary("Lib", m, [], "lib.cql", { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect((r.url as string).indexOf("//Library/")).toBe(-1);
  });
});

describe("library — emitLibrariesForClosure (Δ5 collision)", () => {
  it("emits all libraries when slugs are distinct", () => {
    const { resources, errors } = emitLibrariesForClosure(
      [
        { libraryName: "CMS22 Asserted", dependsOnCanonicals: [], cqlFileName: "cms22-asserted.cql" },
        { libraryName: "CMS22 Inferred", dependsOnCanonicals: [VS_ANTI], cqlFileName: "cms22-inferred.cql" },
      ],
      METADATA,
      { clock: FIXED_CLOCK },
    );
    expect(errors).toEqual([]);
    expect(resources).toHaveLength(2);
  });

  it("errors on slug collision and skips colliding entries", () => {
    const { resources, errors } = emitLibrariesForClosure(
      [
        { libraryName: "CMS22 Asserted", dependsOnCanonicals: [], cqlFileName: "cms22-asserted.cql" },
        { libraryName: "cms22 asserted", dependsOnCanonicals: [], cqlFileName: "cms22-asserted-2.cql" },
      ],
      METADATA,
      { clock: FIXED_CLOCK },
    );
    expect(errors.some((e) => e.kind === "slug-collision")).toBe(true);
    expect(resources).toHaveLength(0);
  });
});
