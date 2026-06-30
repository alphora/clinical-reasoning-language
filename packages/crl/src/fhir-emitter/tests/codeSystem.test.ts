import { describe, expect, it } from "@jest/globals";

import { localCodeSystemUrl } from "../../cql-emitter/lowerLocalCodes";
import { emitLocalCodeSystem, type LocalCodeConcept } from "../codeSystem";
import type { CpgMetadata } from "../types";

// Slice 4 — direct unit coverage of `emitLocalCodeSystem` (the concept-level
// `code is` → FHIR `CodeSystem` lane). The closure-level wiring is covered in
// closureOrchestrator.test.ts ("FHIR closure code-is coverage" block).

const FIXED_CLOCK = () => new Date("2026-06-04T15:30:00.000Z");

const METADATA: CpgMetadata = {
  version: "1.0.0",
  name: "code-is-basic",
  title: "Code Is Basic Demo",
  description: "Local code domain demonstration",
  publisher: "Smile Digital Health",
  contact: [],
  canonicalBase: "http://example.org/crl/code-is-basic",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

const CODES: LocalCodeConcept[] = [
  { concept: "Adult Patient", code: "adult-18-or-older" },
  { concept: "Active Crohns Disease", code: "active-crohns-disease" },
];

describe("fhir-emitter codeSystem.emitLocalCodeSystem", () => {
  it("emits a CRMI shareable+publishable local CodeSystem with the expected shape", () => {
    const { resource, errors, unmatched } = emitLocalCodeSystem(
      "Code Is Basic",
      CODES,
      METADATA,
      { clock: FIXED_CLOCK },
    );
    expect(errors).toEqual([]);
    expect(unmatched).toEqual([]);
    expect(resource).not.toBeNull();
    const r = resource!.resource as Record<string, unknown>;

    expect(r.resourceType).toBe("CodeSystem");
    // id: capped, `-local` suffix preserved.
    expect(r.id).toBe("code-is-basic-local");
    // url: the SHARED helper → byte-equal with the CQL lane.
    expect(r.url).toBe(localCodeSystemUrl(METADATA.canonicalBase, "Code Is Basic"));
    expect(r.url).toBe("http://example.org/crl/code-is-basic/CodeSystem/code-is-basic-local");
    // CRMI codesystem profiles: shareable + publishable (NO computable).
    expect((r.meta as { profile: string[] }).profile).toEqual([
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-shareablecodesystem",
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-publishablecodesystem",
    ]);
    expect(r.caseSensitive).toBe(true);
    expect(r.content).toBe("complete");
    // concept[] in declaration order, mapping concept name → display.
    expect(r.concept).toEqual([
      { code: "adult-18-or-older", display: "Adult Patient" },
      { code: "active-crohns-disease", display: "Active Crohns Disease" },
    ]);
    expect(r.version).toBe("1.0.0");
    expect(r.name).toBe("CodeIsBasicLocal");
    expect(r.title).toBe("Code Is Basic Demo");
    expect(r.status).toBe("draft");
    expect(r.description).toBe("Local code domain demonstration");
    expect(r.date).toBe("2026-06-04T15:30:00.000Z");
    // empty arrays omitted.
    expect(r.contact).toBeUndefined();
    expect(r.jurisdiction).toBeUndefined();
    expect(r.useContext).toBeUndefined();

    expect(resource!.relativePath).toBe("CodeSystem/code-is-basic-local.json");
    expect(resource!.sourceKind).toBe("LocalCodeSystem");
    expect(resource!.sourceName).toBe("Code Is Basic");
  });

  it("title uses metadata.title when present (pins D1 — no hardcoded libraryName)", () => {
    const { resource } = emitLocalCodeSystem("Code Is Basic", CODES, METADATA, {
      clock: FIXED_CLOCK,
    });
    expect((resource!.resource as { title?: string }).title).toBe("Code Is Basic Demo");
  });

  it("title falls back to the library name when metadata.title is empty", () => {
    const { resource } = emitLocalCodeSystem(
      "Code Is Basic",
      CODES,
      { ...METADATA, title: "" },
      { clock: FIXED_CLOCK },
    );
    expect((resource!.resource as { title?: string }).title).toBe("Code Is Basic");
  });

  it("empty codeConcepts → null resource, no error", () => {
    const { resource, errors } = emitLocalCodeSystem("Code Is Basic", [], METADATA, {
      clock: FIXED_CLOCK,
    });
    expect(resource).toBeNull();
    expect(errors).toEqual([]);
  });

  it("missing description (empty library name + empty metadata.description) → missing-description error, null resource", () => {
    const { resource, errors } = emitLocalCodeSystem(
      "",
      CODES,
      { ...METADATA, description: "" },
      { clock: FIXED_CLOCK },
    );
    expect(resource).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("missing-description");
  });

  it("non-ASCII library name → non-ascii-slug-fallback diagnostic AND a resource still emitted", () => {
    const { resource, errors } = emitLocalCodeSystem("高血圧 Codes", CODES, METADATA, {
      clock: FIXED_CLOCK,
    });
    expect(resource).not.toBeNull();
    expect(errors.some((e) => e.kind === "non-ascii-slug-fallback")).toBe(true);
  });

  it("duplicate code across two concepts → D5 emit-duplicate-local-code error, null resource", () => {
    const dupes: LocalCodeConcept[] = [
      { concept: "Adult Patient", code: "shared-code" },
      { concept: "Active Crohns Disease", code: "shared-code" },
    ];
    const { resource, errors } = emitLocalCodeSystem("Code Is Basic", dupes, METADATA, {
      clock: FIXED_CLOCK,
    });
    expect(resource).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("emit-duplicate-local-code");
    expect(errors[0]!.message).toMatch(/Adult Patient/);
    expect(errors[0]!.message).toMatch(/Active Crohns Disease/);
  });
});
