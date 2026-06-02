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
    // Library name from root's `library "CMS22".`; no version emitted
    // (npm packaging IS the version system).
    expect(cql).toMatch(/library CMS22\n/);
    expect(cql).not.toMatch(/library CMS22 version/);
    expect((cql.match(/using FHIR version/g) ?? []).length).toBe(1);
    expect(cql).toMatch(/include CRLPatterns/);
    expect(cql).toMatch(/valueset "Qualifying Encounters Valueset"/);
    expect(cql).toMatch(/define "Initial Population"/);
    expect(cql).toMatch(/define "Qualifying Encounter"/);
    expect(cql).toMatch(/define "Qualifying Encounter Source"/);
  });

  it("resolves cross-file `defined as` refs in the emitted CQL", () => {
    const root = path.join(FIXTURES, "cross-file-ref", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const cql = result.cql ?? "";
    expect(cql).toMatch(/define "Root Concept"/);
    expect(cql).toMatch(/define "Leaf Concept"/);
  });

  // The anonymous-root fixture and its tests are gone in v2.1.0 — every CRL
  // file must declare a `library "Foo".` line, so the "anonymous" mode the
  // fixture exercised is no longer expressible.
  it.skip("REMOVED v2.1.0: falls back to GeneratedFromCRL when the root is anonymous", () => {
    // Anonymous-root mode no longer exists.
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

  it("short-circuits on name-conflict (no CQL produced)", () => {
    const root = path.join(FIXTURES, "name-conflict", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cql).toBeUndefined();
  });

  it("emits cross-kind same-name without collision (concept BMI + terminology BMI)", () => {
    const root = path.join(FIXTURES, "cross-kind-same-name", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const cql = result.cql ?? "";
    expect(cql).toMatch(/BMI/);
  });

  it("explicit EmitOptions.libraryName overrides the root's library name", () => {
    const root = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const result = emitCQLImports(root, { libraryName: "OverrideName" });
    expect(result.success).toBe(true);
    const cql = result.cql ?? "";
    expect(cql).toMatch(/library OverrideName/);
    expect(cql).not.toMatch(/library CMS22/);
  });

  it("local parse-failure warnings don't block emission", () => {
    const root = path.join(FIXTURES, "source-path-parse-failure", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const cql = result.cql ?? "";
    expect(cql).toMatch(/library Root/);
  });
});
