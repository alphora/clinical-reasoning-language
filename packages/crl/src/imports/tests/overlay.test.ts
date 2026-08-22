import * as path from "path";

import { resolveImports } from "../index";
import { validateCRLImports } from "../validate";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("overlay support (Chunk B prep)", () => {
  it("uses overlay text instead of on-disk content for the root file", () => {
    const rootPath = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const overlays = new Map<string, string>([
      [
        rootPath,
        `# Overlay-overridden cms22\nlibrary "OverlayCMS22".\n\nconcept "Overlay Concept":\n- type is Encounter.\n- coded from "CMS22 Concepts"."Qualifying Encounters Valueset".\n`,
      ],
    ]);
    const graph = resolveImports(rootPath, { overlays });
    // Root library name comes from the OVERLAY, not the disk file.
    const root = graph.resolvedLibraries[graph.resolvedLibraries.length - 1];
    expect(root.name).toBe("OverlayCMS22");
    // Disk siblings are still discovered (CMS22 Concepts lives on disk).
    // They land in localLibraries when not include-walked from this overlay root.
    const knownLibNames = [
      ...graph.resolvedLibraries.map((e) => e.name),
      ...graph.localLibraries.map((e) => e.name),
    ];
    expect(knownLibNames).toContain("CMS22 Concepts");
  });

  it("validateCRLImports threads overlays through to the resolver", () => {
    const rootPath = path.join(FIXTURES, "cms22-split", "cms22.crl");
    // Overlay introduces an unresolved bare ref the disk content doesn't have.
    const overlays = new Map<string, string>([
      [
        rootPath,
        `# Test\nlibrary "CMS22".\n\nconcept "Initial Population":\n- type is Encounter.\n- defined as "Nonexistent Local Concept".\n`,
      ],
    ]);
    const result = validateCRLImports(rootPath, { overlays });
    const err = result.validationErrors.find(
      (e) => e.kind === "unresolved-reference" && /Nonexistent Local Concept/.test(e.message),
    );
    expect(err).toBeDefined();
  });

  it("uses overlay text for a NON-root file in the project (live sibling edits)", () => {
    const rootPath = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const inferredPath = path.join(FIXTURES, "cms22-split", "cms22-inferences.crl");
    // Overlay rewrites the inferred sibling to declare a renamed concept.
    const overlays = new Map<string, string>([
      [
        inferredPath,
        `# Overlay inferred\nlibrary "CMS22 Inferences".\ninclude "CMS22 Asserted".\n\nconcept "Renamed Encounter":\n- type is Encounter.\n- definition is "CMS22 Asserted"."Qualifying Encounter Source" performed.\n`,
      ],
    ]);
    const result = validateCRLImports(rootPath, { overlays });
    // The on-disk cms22.crl interface references "CMS22 Inferences"."Qualifying Encounter"
    // which no longer exists in the overlay sibling. Expect qualified-ref-unresolved.
    const err = result.validationErrors.find(
      (e) => e.kind === "qualified-ref-unresolved" && /Qualifying Encounter/.test(e.message),
    );
    expect(err).toBeDefined();
  });
});
