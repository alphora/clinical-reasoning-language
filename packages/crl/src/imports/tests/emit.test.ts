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
    // 4 layers: cms22 (interface) → inferred → asserted → concepts.
    const names = result.cqlByLibrary.map((e) => e.libraryName).sort();
    expect(names).toEqual([
      "CMS22",
      "CMS22 Asserted",
      "CMS22 Concepts",
      "CMS22 Inferred",
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

    // Each emitted CQL declares its own FHIRHelpers + CRLCommon includes.
    for (const entry of result.cqlByLibrary) {
      expect(entry.cql).toMatch(/include FHIRHelpers/);
      expect(entry.cql).toMatch(/include CRLCommon/);
      expect(entry.cql).toMatch(/using FHIR version/);
    }

    // Terminology lives in the concepts library only.
    const term = findLib(result, "CMS22 Concepts") ?? "";
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

  it("auto-splits a multi-layer library into dependency-ordered layer libraries", () => {
    // Slice 2 (layeredEmit): a SINGLE multi-layer library emits as separate
    // `<Lib> Concepts` / `<Lib> Asserted` / `<Lib> Inferred` CQL libraries.
    const root = path.join(
      __dirname,
      "..",
      "..",
      "cql-emitter",
      "tests",
      "fixtures",
      "layered-basic.crl",
    );
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const names = result.cqlByLibrary.map((e) => e.libraryName).sort();
    expect(names).toEqual([
      "Layered Basic Asserted",
      "Layered Basic Concepts",
      "Layered Basic Inferred",
    ]);
    const asserted = findLib(result, "Layered Basic Asserted") ?? "";
    expect(asserted).toMatch(/include "Layered Basic Concepts"/);
    expect(asserted).toMatch(/"Layered Basic Concepts"\."Example Valueset A"/);
    const inferred = findLib(result, "Layered Basic Inferred") ?? "";
    expect(inferred).toMatch(/include "Layered Basic Asserted"/);
    expect(inferred).toMatch(/"Layered Basic Asserted"\."Asserted Concept A"/);
  });

  it("fails loudly when a library qualified-refs an auto-split (multi-layer) library", () => {
    // Cross-library referrer re-qualification is the DEFERRED routing slice.
    // Until then, a ref INTO a library that emit splits must error, not dangle.
    const root = path.join(FIXTURES, "ref-into-split", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toHaveLength(0);
    expect(result.errors?.[0]?.kind).toBe("emit-cross-library-ref-into-split-library");
    // Match the real message: the referrer + the split target are both named.
    expect(result.errors?.[0]?.message).toMatch(
      /Library "Root" qualified-refs "Multi".*multi-layer library that emit auto-splits/,
    );
  });

  it("fails loudly when a generated layer name collides with a real sibling library (fix 3)", () => {
    // A multi-layer `library "X"` auto-splits into `X Concepts` / `X Asserted`
    // / `X Inferred`. A separate real `library "X Asserted"` in the closure
    // would clash with the generated `X Asserted` name (same CQL id/filename).
    // The preflight must error with kind `layered-name-collision`.
    const root = path.join(FIXTURES, "layered-name-collision", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toHaveLength(0);
    expect(result.errors?.[0]?.kind).toBe("layered-name-collision");
    expect(result.errors?.[0]?.message).toMatch(/"X Asserted"/);
  });

  it("a MIXED `code is` + `defined as` library stays per-CRL (NOT split) (fix 2)", () => {
    // A multi-layer library carrying a concept with BOTH `code is` and
    // `defined as` is out of scope for the layered split; it stays on the
    // unchanged per-CRL path and emits as a SINGLE `library "Mixed"` CQL.
    const root = path.join(FIXTURES, "mixed-code-defined-as", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const names = result.cqlByLibrary.map((e) => e.libraryName).sort();
    // Single library — NOT split into Mixed Concepts/Asserted/Inferred.
    expect(names).toEqual(["Mixed"]);
    const cql = findLib(result, "Mixed") ?? "";
    expect(cql).toMatch(/library Mixed\n/);
    expect(cql).not.toMatch(/library "Mixed (Concepts|Asserted|Inferred)"/);
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

  // v2.2 Todo 3 (issue #59) — cross-library parameter refs.
  it("cross-library qualified Period parameter ref emits target lib's `parameter` line + caller's `Sib.\"Measurement Period\"` qualified ref", () => {
    const root = path.join(FIXTURES, "cross-lib-parameter-period", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const sibCql = findLib(result, "Sib") ?? "";
    const rootCql = findLib(result, "Root") ?? "";
    // Sib library emits the parameter declaration (AST-derived; no default).
    expect(sibCql).toMatch(/parameter "Measurement Period" Interval<DateTime>/);
    expect(sibCql).not.toMatch(/default Interval\[/);
    // Root library emits the qualified ref as `Sib."Measurement Period"`.
    expect(rootCql).toMatch(/Sib\."Measurement Period"/);
  });

  it("cross-library qualified Patient parameter ref REWRITES to bare `Patient` (NOT `Sib.\"Index Patient\"`)", () => {
    const root = path.join(FIXTURES, "cross-lib-parameter-patient", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const sibCql = findLib(result, "Sib") ?? "";
    const rootCql = findLib(result, "Root") ?? "";
    // Sib has only `context Patient` — no parameter line for "Index Patient".
    expect(sibCql).toMatch(/context Patient/);
    expect(sibCql).not.toMatch(/parameter "Index Patient"/);
    // Root's narrative ref `"Sib"."Index Patient"` collapses to bare `Patient`
    // identifier in emitted CQL per operator's rule + CQL spec.
    expect(rootCql).toMatch(/CRLCommon\.WasPerformed\([^)]*Patient\)/);
    expect(rootCql).not.toMatch(/Sib\."Index Patient"/);
  });
});
