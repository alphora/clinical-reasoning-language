import * as path from "path";

import { emitCQLImports } from "../emit";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("emitCQLImports", () => {
  it("flat-inlines the cms22-split graph into a single CQL library", () => {
    const root = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    expect(result.cql).toBeDefined();
    const cql = result.cql ?? "";
    // Library identity derived from the root's `library` declaration.
    // CQL library names emit unquoted per CQL syntax.
    expect(cql).toMatch(/library CMS22 version '1\.0\.0'/);
    // FHIR usage emitted once.
    expect((cql.match(/using FHIR version/g) ?? []).length).toBe(1);
    // CRLPatterns shared dependency present.
    expect(cql).toMatch(/include CRLPatterns/);
    // Statements from each layer present in the flat-inlined output.
    expect(cql).toMatch(/valueset "Qualifying Encounters Valueset"/); // terminology layer
    expect(cql).toMatch(/define "Initial Population"/);                // interface layer
    expect(cql).toMatch(/define "Qualifying Encounter"/);              // inferred layer
    expect(cql).toMatch(/define "Qualifying Encounter Source"/);       // asserted layer
  });

  it("resolves cross-file `defined as` refs in the emitted CQL", () => {
    const root = path.join(FIXTURES, "cross-file-ref", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const cql = result.cql ?? "";
    // The root concept `defined as "Leaf Concept"` and the leaf's
    // declaration must both end up in the same library, so the ref
    // resolves at the CQL level.
    expect(cql).toMatch(/define "Root Concept"/);
    expect(cql).toMatch(/define "Leaf Concept"/);
  });

  it("falls back to GeneratedFromCRL when the root is anonymous and no library-name option given", () => {
    const root = path.join(FIXTURES, "anonymous-root", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const cql = result.cql ?? "";
    expect(cql).toMatch(/library GeneratedFromCRL/);
  });

  it("short-circuits on unresolved-include (no CQL produced)", () => {
    const root = path.join(FIXTURES, "unresolved", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cql).toBeUndefined();
    const unresolved = result.importDiagnostics.find((d) => d.kind === "unresolved-include");
    expect(unresolved).toBeDefined();
  });

  it("short-circuits on cycle (no CQL produced)", () => {
    const root = path.join(FIXTURES, "cycle", "A.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cql).toBeUndefined();
    const cycle = result.importDiagnostics.find((d) => d.kind === "cycle");
    expect(cycle).toBeDefined();
  });

  it("short-circuits on name-conflict (no CQL produced — would otherwise inline the wrong definition)", () => {
    const root = path.join(FIXTURES, "name-conflict", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cql).toBeUndefined();
  });

  it("emits cross-kind same-name without collision (concept BMI + terminology BMI)", () => {
    const root = path.join(FIXTURES, "cross-kind-same-name", "root.crl");
    const result = emitCQLImports(root);
    // The two share a name but different kinds; the existing emitter
    // disambiguates with a " ValueSet" suffix on the terminology.
    expect(result.success).toBe(true);
    const cql = result.cql ?? "";
    expect(cql).toMatch(/BMI/);
  });

  it("returns an error result (not throw) on missing explicit source path", () => {
    const root = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const result = emitCQLImports(root, [path.join(FIXTURES, "does-not-exist")]);
    expect(result.success).toBe(false);
    expect(result.cql).toBeUndefined();
    const diag = result.importDiagnostics.find(
      (d) => d.kind === "parse-failure" && d.severity === "error",
    );
    expect(diag).toBeDefined();
  });

  it("explicit EmitOptions.libraryName overrides the root's library name", () => {
    const root = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const result = emitCQLImports(root, [], { libraryName: "OverrideName" });
    expect(result.success).toBe(true);
    const cql = result.cql ?? "";
    expect(cql).toMatch(/library OverrideName/);
    expect(cql).not.toMatch(/library CMS22/);
  });

  it("source-path parse-failure warnings don't block emission (warnings only, no error)", () => {
    const root = path.join(FIXTURES, "source-path-parse-failure", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const cql = result.cql ?? "";
    expect(cql).toMatch(/library Root/);
  });
});
