import * as path from "path";

import { emitCQLImports } from "../emit";

const FIXTURES = path.resolve(__dirname, "fixtures");

function findLib(
  result: ReturnType<typeof emitCQLImports>,
  name: string,
): string | undefined {
  return result.cqlByLibrary.find((e) => e.libraryName === name)?.cql;
}

describe("emitCQLImports (per-CRL v2.1.0)", () => {
  it("emits one CQL per library in the cms22-split graph", () => {
    const root = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);

    // Every library in the include-walk closure gets its own CQL.
    // 4 layers: cms22 (interface) → inferred → asserted → terminology.
    const names = result.cqlByLibrary.map((e) => e.libraryName).sort();
    expect(names).toEqual([
      "CMS22",
      "CMS22 Asserted",
      "CMS22 Inferred",
      "CMS22 Terminology",
    ]);

    // The interface library (the unsuffixed file) emits as `library CMS22`
    // — simple identifier, unquoted (CQL convention for the public entry
    // point that the FHIR Measure resource references).
    const cms22 = findLib(result, "CMS22") ?? "";
    expect(cms22).toMatch(/library CMS22\n/);
    expect(cms22).not.toMatch(/library CMS22 version/);

    // The cms22 (interface) library has its IP concept + an include of
    // the inferred layer.
    expect(cms22).toMatch(/define "Initial Population"/);
    expect(cms22).toMatch(/include "CMS22 Inferred"/);

    // Library names with spaces emit as quoted CQL identifiers.
    const inferred = findLib(result, "CMS22 Inferred") ?? "";
    expect(inferred).toMatch(/library "CMS22 Inferred"\n/);

    // Cross-library qualified ref `"CMS22 Asserted"."Qualifying Encounter Source"`
    // emits as native CQL `"CMS22 Asserted"."Qualifying Encounter Source"`.
    expect(inferred).toMatch(
      /"CMS22 Asserted"\."Qualifying Encounter Source"/,
    );
    // And the includes header carries the dep.
    expect(inferred).toMatch(/include "CMS22 Asserted"/);

    // Each emitted CQL declares its own FHIRHelpers + CRLPatterns includes.
    for (const entry of result.cqlByLibrary) {
      expect(entry.cql).toMatch(/include FHIRHelpers/);
      expect(entry.cql).toMatch(/include CRLPatterns/);
      expect(entry.cql).toMatch(/using FHIR version/);
    }

    // Terminology lives in the terminology library only.
    const term = findLib(result, "CMS22 Terminology") ?? "";
    expect(term).toMatch(/valueset "Qualifying Encounters Valueset"/);
    // And the interface library does NOT inline the terminology.
    expect(cms22).not.toMatch(/valueset "Qualifying Encounters Valueset"/);

    // Asserted concepts live in their declaring library.
    const asserted = findLib(result, "CMS22 Asserted") ?? "";
    expect(asserted).toMatch(/define "Qualifying Encounter Source"/);
  });

  it("renders cross-file qualified refs as native CQL qualified refs", () => {
    const root = path.join(FIXTURES, "cross-file-ref", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const rootCql = findLib(result, "Root") ?? "";
    const leafCql = findLib(result, "Leaf") ?? "";
    // Root.cql defines Root Concept with a qualified ref into Leaf.
    expect(rootCql).toMatch(/define "Root Concept"/);
    expect(rootCql).toMatch(/Leaf\."Leaf Concept"/);
    expect(rootCql).toMatch(/include Leaf/);
    // Leaf.cql contains the leaf declaration.
    expect(leafCql).toMatch(/define "Leaf Concept"/);
  });

  it("short-circuits on unresolved-include (no CQL produced)", () => {
    const root = path.join(FIXTURES, "unresolved", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toHaveLength(0);
    const unresolved = result.importDiagnostics.find((d) => d.kind === "unresolved-include");
    expect(unresolved).toBeDefined();
  });

  it("short-circuits on cycle (no CQL produced)", () => {
    const root = path.join(FIXTURES, "cycle", "A.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toHaveLength(0);
    const cycle = result.importDiagnostics.find((d) => d.kind === "cycle");
    expect(cycle).toBeDefined();
  });

  it("v2.1.0: cross-library same-name does NOT short-circuit emit (per-CRL emit makes it benign)", () => {
    const root = path.join(FIXTURES, "name-conflict", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    // 3 CQLs: root + A + B. A and B each declare their own concept "X" in
    // their own CQL namespace; no collision.
    const names = result.cqlByLibrary.map((e) => e.libraryName).sort();
    expect(names).toContain("Root");
    expect(names).toContain("A");
    expect(names).toContain("B");
    const aCql = findLib(result, "A") ?? "";
    const bCql = findLib(result, "B") ?? "";
    expect(aCql).toMatch(/define "X"/);
    expect(bCql).toMatch(/define "X"/);
  });

  it("emits cross-kind same-name without collision (concept BMI + terminology BMI)", () => {
    const root = path.join(FIXTURES, "cross-kind-same-name", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    // Under per-CRL emit, A.cql gets the BMI concept and B.cql gets the
    // BMI valueset. Each lives in its own library; no in-CQL collision.
    const aCql = findLib(result, "A") ?? "";
    const bCql = findLib(result, "B") ?? "";
    expect(aCql).toMatch(/define "BMI"/);
    expect(bCql).toMatch(/valueset "BMI"/);
  });

  it("local parse-failure warnings don't block emission", () => {
    const root = path.join(FIXTURES, "source-path-parse-failure", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const rootCql = findLib(result, "Root") ?? "";
    expect(rootCql).toMatch(/library Root\n/);
  });

  it("each emit carries an output filename derived from its library name", () => {
    const root = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const cms22 = result.cqlByLibrary.find((e) => e.libraryName === "CMS22");
    expect(cms22?.outputFilename).toBe("CMS22.cql");
    // Spaces preserved (CQL translator expects exact match).
    const inferred = result.cqlByLibrary.find((e) => e.libraryName === "CMS22 Inferred");
    expect(inferred?.outputFilename).toBe("CMS22 Inferred.cql");
  });
});
