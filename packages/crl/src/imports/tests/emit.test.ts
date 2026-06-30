import * as path from "path";

import { emitCQLImports, computeSplitPlan } from "../emit";
import { buildCRL } from "../../index";
import { lowerLocalCodes } from "../../cql-emitter/lowerLocalCodes";
import type { CRL } from "../../ast/types";

const FIXTURES = path.resolve(__dirname, "fixtures");

function parse(body: string): CRL {
  const r = buildCRL("# fixture\n" + body);
  if (!r.success || !r.result) throw new Error("parse failed: " + JSON.stringify(r.errors));
  return r.result;
}

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

  it("a MIXED `code is` + `defined as` concept is a hard error (slice 3)", () => {
    // Slice 3 — a concept carrying BOTH a local `code is` and a top-level
    // `definition` (`defined as`/`definition is`/`coded from`) is out of scope:
    // `lowerLocalCodes` raises an explicit `emit-mixed-code-and-definition`
    // hard error rather than silently stubbing/dropping the local-code side.
    // (Under slice 2 this case fell onto the per-CRL stub path; slice 3 makes
    // it loud.)
    const root = path.join(FIXTURES, "mixed-code-defined-as", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toHaveLength(0);
    expect(result.errors?.[0]?.kind).toBe("emit-mixed-code-and-definition");
    expect(result.errors?.[0]?.message).toMatch(/Mixed Concept/);
  });

  it("slice 4c: a `decision` + `code is` library PARTIAL-splits into `<Lib> Concepts` + `<Lib>` (root)", () => {
    // rx501-147-shaped motivating case. A `decision` disqualifies the FULL
    // 3-way layered auto-split, but the library carries concept-level `code is`,
    // so slice 4c PARTIAL-splits it: the terminology/codes move to a sibling
    // `<Lib> Concepts` library, and the retrieves/context stay in the ROOT
    // library which KEEPS the source name `<Lib>` (so PlanDef `library[]` refs
    // still resolve). With the codes now in a separate library, detectCollisions
    // sees no same-library collision → the ` Code` suffix DROPS (bare code names).
    const root = path.join(FIXTURES, "code-is-decision", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);

    // TWO emitted libraries — the Concepts sibling + the Root (source-named).
    const names = result.cqlByLibrary.map((e) => e.libraryName).sort();
    expect(names).toEqual(["Code Is Decision", "Code Is Decision Concepts"]);

    // Manifest (A→E contract): role + sourceLibraryName + includes.
    const conceptsEntry = result.cqlByLibrary.find(
      (e) => e.libraryName === "Code Is Decision Concepts",
    );
    const rootEntry = result.cqlByLibrary.find((e) => e.libraryName === "Code Is Decision");
    expect(conceptsEntry?.role).toBe("concepts");
    expect(conceptsEntry?.sourceLibraryName).toBe("Code Is Decision");
    expect(conceptsEntry?.includes).toEqual([]);
    expect(rootEntry?.role).toBe("root");
    expect(rootEntry?.sourceLibraryName).toBe("Code Is Decision");
    expect(rootEntry?.includes).toEqual(["Code Is Decision Concepts"]);

    // Concepts library: ONE shared codesystem decl + BARE code names (NO ` Code`
    // suffix — codes live alone here, no co-resident concept to collide with).
    const concepts = conceptsEntry?.cql ?? "";
    expect(concepts).toMatch(
      /codesystem "Code Is Decision Local Codes": 'urn:crl:codesystem:code-is-decision-local'/,
    );
    expect(concepts.match(/^codesystem /gm)).toHaveLength(1);
    expect(concepts).toMatch(
      /code "Adult Patient": 'adult-18-or-older' from "Code Is Decision Local Codes"/,
    );
    expect(concepts).toMatch(
      /code "Active Crohns Disease": 'active-crohns-disease' from "Code Is Decision Local Codes"/,
    );
    expect(concepts).not.toMatch(/ Code"/);

    // Root library: include of the Concepts sibling + cross-library-qualified
    // retrieves (NOT inline same-library refs).
    const rootCql = rootEntry?.cql ?? "";
    expect(rootCql).toMatch(/include "Code Is Decision Concepts"/);
    expect(rootCql).toMatch(
      /\[Observation: "Code Is Decision Concepts"\."Adult Patient"\]/,
    );
    // Local-source `code is` retrieves are ALWAYS `[Observation: …]` regardless
    // of the concept's `type is Condition` (the `type is` is retained on the AST
    // for the Phase-2/3 inferred transform, not on the local-source retrieve).
    expect(rootCql).toMatch(
      /\[Observation: "Code Is Decision Concepts"\."Active Crohns Disease"\]/,
    );
    // No codesystem/code declarations leaked into the root.
    expect(rootCql).not.toMatch(/^codesystem /m);
  });

  it("cross-library local-codesystem URN collision → emit-local-codesystem-urn-collision (slice 3)", () => {
    // Two DISTINCT local libraries ("Local One" / "Local-One") whose names slug
    // to the SAME `urn:crl:codesystem:local-one-local`, both using `code is`.
    // The preflight must fail loudly rather than emit a silently-shared domain.
    const root = path.join(FIXTURES, "local-codesystem-urn-collision", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toHaveLength(0);
    expect(result.errors?.[0]?.kind).toBe("emit-local-codesystem-urn-collision");
    expect(result.errors?.[0]?.message).toMatch(/local-one-local/);
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

  // ── Slice 4c — the shared split-plan ────────────────────────────────────────

  it("computeSplitPlan: decision-bearing + `code is` library → `partial` with [lib, `<lib> Concepts`]", () => {
    // A decision disqualifies the FULL split (isLayerSplittable=false), but the
    // concept-level `code is` (localCodesCount > 0) triggers the PARTIAL split.
    const src = parse(`library "Pol".

concept "Adult Patient":
- type is Observation.
- value type is boolean.
- code is \`adult\`.

activity "Refer":
- request CPGServiceRequest.

decision "Triage":
- when "Adult Patient" then recommend activity "Refer".
`);
    const lowered = lowerLocalCodes(src);
    expect(lowered.errors).toEqual([]);
    expect(lowered.localCodes.length).toBe(1);

    const plan = computeSplitPlan(lowered.ast, "Pol", lowered.localCodes.length);
    expect(plan.kind).toBe("partial");
    expect(plan.emittedLibraryNames).toEqual(["Pol", "Pol Concepts"]);
    expect(plan.partition).toBeDefined();
  });

  it("the collision preflight registers BOTH `<lib>` and `<lib> Concepts` for a partial split (sibling-name clash → fail)", () => {
    // A partial-split library "Pol" PLUS a REAL sibling `library "Pol Concepts"`
    // in the same closure: the preflight now registers the generated `Pol
    // Concepts` name, so it collides with the real one and fails loudly (before,
    // only `Pol` was registered for the non-splittable entry and the real
    // sibling silently clobbered the generated one).
    const root = path.join(FIXTURES, "partial-concepts-name-collision", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toHaveLength(0);
    expect(result.errors?.[0]?.kind).toBe("layered-name-collision");
    expect(result.errors?.[0]?.message).toMatch(/Pol Concepts/);
  });

  it("idempotency: re-lowering an already-lowered synthetic Concepts AST is a no-op", () => {
    // `emitPartitioned` builds a synthetic per-value AST and calls
    // `emitCQLFromAST`, which re-runs `lowerLocalCodes`. The synthetic Concepts
    // AST holds the lowered SYNTHETIC TERMINOLOGIES (no `Concept.code` left to
    // lower), so a second lowering pass must be a no-op (=== the input, empty
    // localCodes). Confirm by lowering twice and checking the second is inert.
    const src = parse(`library "Pol".

concept "Adult Patient":
- type is Observation.
- value type is boolean.
- code is \`adult\`.

activity "Refer":
- request CPGServiceRequest.

decision "Triage":
- when "Adult Patient" then recommend activity "Refer".
`);
    const first = lowerLocalCodes(src);
    expect(first.localCodes.length).toBe(1);
    expect(first.ast).not.toBe(src); // first pass DID lower

    // Re-lower the already-lowered AST: the lowered concept now carries a
    // CodedFromDefinition (no `code`), and the synthetic terminology has no
    // `Concept.code` — so nothing is lowerable.
    const second = lowerLocalCodes(first.ast);
    expect(second.errors).toEqual([]);
    expect(second.localCodes).toEqual([]);
    expect(second.ast).toBe(first.ast); // identity-preserved no-op
  });
});
