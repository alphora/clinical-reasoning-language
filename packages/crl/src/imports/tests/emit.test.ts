import * as path from "path";

import { emitCQLImports, computeSplitPlan } from "../emit";
import { buildCRL } from "../../index";
import { lowerLocalCodes as lowerLocalCodesRaw } from "../../cql-emitter/lowerLocalCodes";

// #271 — lowering local `code is` now REQUIRES `crl.canonicalBase` (no urn
// fallback). Inline-AST callers below (no package.json) thread a fixed test base.
const TEST_CB = "http://example.org/crl/test";
const lowerLocalCodes: typeof lowerLocalCodesRaw = (ast, opts = {}) =>
  lowerLocalCodesRaw(ast, { canonicalBase: TEST_CB, ...opts });
import { DEFAULT_FHIRHELPERS_VERSION } from "../../cql-emitter/emitCQL";
import { loadFHIRHelpers } from "../../cql-emitter/catalog/loadCatalog";
import type { CRL } from "../../ast/types";

const FIXTURES = path.resolve(__dirname, "fixtures");

function parse(body: string): CRL {
  const r = buildCRL("# fixture\n" + body);
  if (!r.success || !r.result) throw new Error("parse failed: " + JSON.stringify(r.errors));
  return r.result;
}

function findLib(result: ReturnType<typeof emitCQLImports>, name: string): string | undefined {
  return result.cqlByLibrary.find((e) => e.libraryName === name)?.cql;
}

// #187 — the three shared catalog libraries are now ALWAYS appended to every
// policy's cqlByLibrary. The set-shape assertions below exercise the POLICY
// library split, so filter the fixed catalog names out; a dedicated test asserts
// the catalog injection itself.
const CATALOG_LIB_NAMES = new Set(["CRLCommon", "CaseFeatureCommon", "FHIRHelpers"]);
function policyLibNames(result: ReturnType<typeof emitCQLImports>): string[] {
  return result.cqlByLibrary
    .map((e) => e.libraryName)
    .filter((n) => !CATALOG_LIB_NAMES.has(n))
    .sort();
}

describe("emitCQLImports (per-CRL v2.1.0)", () => {
  it("emits one CQL per library in the cms22-split graph", () => {
    const root = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);

    // Every library in the include-walk closure gets its own CQL.
    // 4 layers: cms22 (interface) → inferred → asserted → concepts.
    // #227 — each name-keeping-root (`none`-path) library now emits under its
    // unified identity `S = pascalCaseNameForId(<name>)` (hyphen/space-free
    // PascalCase), so `CMS22 Inferred` → `CMS22Inferred` etc. `CMS22` is already
    // PascalCase, so it is unchanged.
    const names = policyLibNames(result);
    expect(names).toEqual(["CMS22", "CMS22Asserted", "CMS22Concepts", "CMS22Inferred"]);

    // The interface library (the unsuffixed file) emits as `library CMS22`
    // — simple identifier, unquoted (CQL convention for the public entry
    // point that the FHIR Measure resource references).
    const cms22 = findLib(result, "CMS22") ?? "";
    expect(cms22).toMatch(/library CMS22\n/);
    expect(cms22).not.toMatch(/library CMS22 version/);

    // The cms22 (interface) library has its IP concept + an include of
    // the inferred layer — rendered under the sibling's unified `S`.
    expect(cms22).toMatch(/define "Initial Population"/);
    expect(cms22).toMatch(/include CMS22Inferred/);

    // #227 — the space-carrying name renders under `S` (unquoted PascalCase id).
    const inferred = findLib(result, "CMS22Inferred") ?? "";
    expect(inferred).toMatch(/library CMS22Inferred\n/);

    // Cross-library qualified ref renders through `S`: `"CMS22 Asserted"."…"` →
    // `CMS22Asserted."Qualifying Encounter Source"`.
    expect(inferred).toMatch(/CMS22Asserted\."Qualifying Encounter Source"/);
    // And the includes header carries the dep under `S`.
    expect(inferred).toMatch(/include CMS22Asserted/);

    // Each emitted POLICY CQL declares its own FHIRHelpers + CRLCommon includes.
    // (The appended catalog libraries — CRLCommon/CaseFeatureCommon/FHIRHelpers —
    // are the include TARGETS, not includers, so exclude them here.)
    for (const entry of result.cqlByLibrary) {
      if (CATALOG_LIB_NAMES.has(entry.libraryName)) continue;
      expect(entry.cql).toMatch(/include FHIRHelpers/);
      expect(entry.cql).toMatch(/include CRLCommon/);
      expect(entry.cql).toMatch(/using FHIR version/);
    }

    // Terminology lives in the concepts library only.
    const term = findLib(result, "CMS22Concepts") ?? "";
    expect(term).toMatch(/valueset "Qualifying Encounters Valueset"/);
    // And the interface library does NOT inline the terminology.
    expect(cms22).not.toMatch(/valueset "Qualifying Encounters Valueset"/);

    // Asserted concepts live in their declaring library.
    const asserted = findLib(result, "CMS22Asserted") ?? "";
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

  it("auto-splits a multi-layer library into dependency-ordered source-typed layer libraries", () => {
    // R2 (layeredEmit): a SINGLE multi-layer library emits as separate
    // source-typed `<policyId>-RecordConcepts` / `-RecordSource` / `-Inferred`
    // CQL libraries (the fixture is hand-authored terminology + `coded from` +
    // `defined as`, i.e. the RECORD source family). Names use the policy id
    // (package.json `name`, "layered-basic-fixture").
    const root = path.join(
      __dirname,
      "..",
      "..",
      "cql-emitter",
      "tests",
      "fixtures",
      "layered-basic",
      "layered-basic.crl",
    );
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const names = policyLibNames(result);
    expect(names).toEqual([
      "LayeredBasicFixtureInferred",
      "LayeredBasicFixtureRecordConcepts",
      "LayeredBasicFixtureRecordSource",
    ]);
    const asserted = findLib(result, "LayeredBasicFixtureRecordSource") ?? "";
    // #186 — S is a simple identifier, emitted UNQUOTED in include + qualified refs.
    expect(asserted).toMatch(/include LayeredBasicFixtureRecordConcepts\b/);
    expect(asserted).toMatch(/LayeredBasicFixtureRecordConcepts\."Example Valueset A"/);
    const inferred = findLib(result, "LayeredBasicFixtureInferred") ?? "";
    expect(inferred).toMatch(/include LayeredBasicFixtureRecordSource\b/);
    expect(inferred).toMatch(/LayeredBasicFixtureRecordSource\."Asserted Concept A"/);
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
      /Library "Root" qualified-refs "Multi".*library that emit auto-splits/,
    );
  });

  it("fails loudly when an EXPLICIT `include` (no concept ref) targets an auto-split local library", () => {
    // Landmine (A): the split-library guard must fail-closed over the SAME ref
    // set that becomes the referrer's CQL `include`s (source `include`s +
    // concept-definition refs), NOT the narrower concept-definition-only set.
    // Root here `include "Shared"` but NEVER references Shared in a concept
    // definition or representation — the ONLY link is the source include line.
    // Pre-fix the guard walked concept-definition refs only, stayed silent, and
    // Root.cql emitted a DANGLING `include Shared` (Shared auto-splits; no
    // "Shared.cql" exists). The guard must now fire.
    const root = path.join(FIXTURES, "include-into-split", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toHaveLength(0);
    expect(result.errors?.[0]?.kind).toBe("emit-cross-library-ref-into-split-library");
    expect(result.errors?.[0]?.message).toMatch(
      /Library "Root" qualified-refs "Shared".*library that emit auto-splits/,
    );
  });

  it("scope-aware negative: an explicit include of a multi-layer PACKAGE does NOT trip the split guard", () => {
    // Landmine (A) SCOPE-AWARENESS: the guard resolves each include/ref name
    // against the referrer's scope and fires ONLY when it resolves to a LOCAL
    // split source. "SomePkg" is a multi-layer PACKAGE (it WOULD split if it
    // were a local sibling), but a package is emitted under its own name and is
    // never split in this consumer, so the ref must NOT fire. `include SomePkg`
    // in Root.cql legitimately resolves to the package's own CQL (not dangling).
    const root = path.join(FIXTURES, "include-package-ref", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const rootCql = findLib(result, "Root") ?? "";
    expect(rootCql).toMatch(/include SomePkg\b/);
    expect(rootCql).toMatch(/SomePkg\."Pkg C"/);
  });

  it("a cross-lib possible-representation ref does NOT emit a dangling `include` (representations don't lower to CQL)", () => {
    // Landmine (B), resolved EMPIRICALLY: a representation-only / `code is` +
    // `source representation … coded from "Other"."VS"` concept lowers to a
    // `// TODO: representations-only concept` placeholder — the representation's
    // terminology is NEVER referenced in the emitted CQL body. So a cross-lib
    // representation ref must NOT drive a per-library `include` (that emitted a
    // DANGLING `include Other`, and Other auto-splits so no "Other.cql" exists).
    // Representation refs stay in the emit CLOSURE (Other's layers still emit for
    // FHIR), just NOT in the include set.
    const root = path.join(FIXTURES, "repr-cross-lib", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const rootCql = findLib(result, "Root") ?? "";
    // The representation-only concept lowers to the TODO placeholder.
    expect(rootCql).toMatch(/define "Foo"/);
    expect(rootCql).toMatch(/representations-only concept/);
    // CRITICAL: NO dangling `include Other` (nor an include of any Other-derived
    // split layer) in the referrer's CQL.
    expect(rootCql).not.toMatch(/include Other\b/);
    expect(rootCql).not.toMatch(/include "Other/);
    // Closure PRESERVED: "Other" is still emitted (auto-split into policy-id
    // layer libraries) even though the referrer does not `include` it.
    const names = policyLibNames(result);
    expect(names).toContain("CrlReprFixtureRecordConcepts");
    expect(names).toContain("CrlReprFixtureRecordSource");
  });

  it("R2: source-name layer collision class is eliminated by policy-id naming (real `X Asserted` sibling no longer clashes)", () => {
    // PRE-R2 this fixture FAILED with `layered-name-collision`: the multi-layer
    // `library "X"` auto-split into `X Concepts` / `X Asserted` / `X Inferred`,
    // and the generated `X Asserted` clashed with the real sibling `library
    // "X Asserted"`. Under R2 the layer libraries are named from the POLICY ID
    // (`crl-test-fixture-RecordConcepts/-RecordSource/-Inferred`), so they can
    // NEVER collide with a source-derived sibling name — the whole collision
    // class is gone. The closure now emits cleanly; `Top`'s foreign ref to
    // "X Asserted" survives as a cross-library include on the Inferred layer.
    // (The `layered-name-collision` preflight remains correct for a genuine
    // policy-id-based clash; this fixture simply no longer triggers it.)
    const root = path.join(FIXTURES, "layered-name-collision", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    // #227 — the foreign `none` sibling `X Asserted` now emits under its unified
    // identity `XAsserted`, and the Inferred LAYER's foreign `include` renders
    // through it (the layered path threads the same raw→S rename map).
    const names = policyLibNames(result);
    expect(names).toEqual([
      "CrlTestFixtureInferred",
      "CrlTestFixtureRecordConcepts",
      "CrlTestFixtureRecordSource",
      "XAsserted",
    ]);
    const inferred = findLib(result, "CrlTestFixtureInferred") ?? "";
    expect(inferred).toMatch(/include XAsserted/);
  });

  it("a MIXED `code is` + NON-`defined as` definition (`coded from`) is a hard error", () => {
    // `code is` + `defined as` is now SUPPORTED (both-representation). A concept
    // carrying `code is` + a NON-`defined as` top-level definition (`coded from`
    // here; `definition is` likewise) is still out of scope: `lowerLocalCodes`
    // raises an explicit `emit-mixed-code-and-definition` hard error rather than
    // silently stubbing/dropping the local-code side.
    const root = path.join(FIXTURES, "mixed-code-defined-as", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toHaveLength(0);
    expect(result.errors?.[0]?.kind).toBe("emit-mixed-code-and-definition");
    expect(result.errors?.[0]?.message).toMatch(/Mixed Concept/);
  });

  it("R2: a `decision` + `code is` library INTERFACE-splits into source-typed layers + an Interface re-export library", () => {
    // rx501-147-shaped motivating case. A `decision` disqualifies the FULL
    // source-typed auto-split, but the library carries concept-level `code is`,
    // so R2 takes the `interface` split: the lowered local codes/codesystem land
    // in `<policyId>-LocalConcepts`, the retrieves in `<policyId>-LocalSource`,
    // and the decision/action-guard surface is re-published in a synthesized
    // `<policyId>-Interface` library (pre-qualified to each concept's OWN source
    // layer). The FHIR lane (next half) rewires PlanDef `library[]` onto the
    // Interface canonical. Names use the policy id (package.json "crl-test-fixture").
    const root = path.join(FIXTURES, "code-is-decision", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);

    const names = policyLibNames(result);
    expect(names).toEqual([
      "CrlTestFixtureInterface",
      "CrlTestFixtureLocalConcepts",
      "CrlTestFixtureLocalSource",
    ]);

    // Manifest (A→E contract): role + sourceLibraryName + includes.
    const conceptsEntry = result.cqlByLibrary.find(
      (e) => e.libraryName === "CrlTestFixtureLocalConcepts",
    );
    const sourceEntry = result.cqlByLibrary.find(
      (e) => e.libraryName === "CrlTestFixtureLocalSource",
    );
    const interfaceEntry = result.cqlByLibrary.find(
      (e) => e.libraryName === "CrlTestFixtureInterface",
    );
    expect(conceptsEntry?.role).toBe("concepts");
    expect(conceptsEntry?.sourceLibraryName).toBe("Code Is Decision");
    expect(conceptsEntry?.includes).toEqual([]);
    expect(sourceEntry?.role).toBe("layer");
    expect(sourceEntry?.includes).toEqual(["CrlTestFixtureLocalConcepts"]);
    expect(interfaceEntry?.role).toBe("interface");
    expect(interfaceEntry?.sourceLibraryName).toBe("Code Is Decision");
    expect(interfaceEntry?.includes).toEqual(["CrlTestFixtureLocalSource"]);

    // LocalConcepts library: ONE shared codesystem decl + BARE code names (NO
    // ` Code` suffix — codes live alone here, no co-resident concept to collide).
    const concepts = conceptsEntry?.cql ?? "";
    // R1/case-feature — the shared local codesystem DECL name is derived from the
    // POLICY ID (`crl-test-fixture`), title-cased: "Crl Test Fixture Local Codes".
    expect(concepts).toMatch(
      /codesystem "Crl Test Fixture Local Codes": 'http:\/\/example\.org\/crl\/code-is-decision\/CodeSystem\/crl-test-fixture-local'/,
    );
    expect(concepts.match(/^codesystem /gm)).toHaveLength(1);
    expect(concepts).toMatch(
      /code "Adult Patient": 'adult-18-or-older' from "Crl Test Fixture Local Codes"/,
    );
    expect(concepts).toMatch(
      /code "Active Crohns Disease": 'active-crohns-disease' from "Crl Test Fixture Local Codes"/,
    );
    expect(concepts).not.toMatch(/ Code"/);

    // LocalSource library: include of the LocalConcepts sibling + cross-library-
    // qualified retrieves, always `[Observation: …]` (local-source rule).
    const sourceCql = sourceEntry?.cql ?? "";
    // #186 — S emits UNQUOTED (simple identifier) in include + qualified refs.
    expect(sourceCql).toMatch(/include CrlTestFixtureLocalConcepts\b/);
    expect(sourceCql).toMatch(/\[Observation: CrlTestFixtureLocalConcepts\."Adult Patient"\]/);
    expect(sourceCql).toMatch(
      /\[Observation: CrlTestFixtureLocalConcepts\."Active Crohns Disease"\]/,
    );
    expect(sourceCql).not.toMatch(/^codesystem /m);

    // Interface library: ONE re-export — the decision `when` concept only
    // ("Active Crohns Disease"), pre-qualified to its OWN source layer
    // (LocalSource). "Adult Patient" is NOT referenced by the decision, so it is
    // NOT re-exported. Case-feature truth-set: a DIRECT `code is` condition (no
    // `defined as`) collapses the LocalSource retrieve to a boolean via
    // `…asTruths().satisfied()`, and the Interface layer includes CFH.
    const interfaceCql = interfaceEntry?.cql ?? "";
    expect(interfaceCql).toMatch(/include CrlTestFixtureLocalSource\b/);
    expect(interfaceCql).toMatch(/include CaseFeatureCommon called CFH/);
    expect(interfaceCql).toMatch(
      /define "Active Crohns Disease":\s*CrlTestFixtureLocalSource\."Active Crohns Disease"\.asTruths\(\)\.satisfied\(\)/,
    );
    expect(interfaceCql).not.toMatch(/define "Adult Patient"/);
    expect(interfaceCql).not.toMatch(/^codesystem /m);
  });

  it("case (a) — two SEED `code is` libraries (both `include`d) → emit-local-codesystem-urn-collision with the SEED-libraries message", () => {
    // Two DISTINCT local libraries ("Local One" / "Local-One"), both `code is`, both
    // EXPLICITLY `include`d from root → both SEED libraries reached by include-walking.
    // #198 (Option B) — Option B disambiguates only a cross-lib SIBLING, so two seeds
    // both keep the bare `<policyId>-local` domain and genuinely collide. The guard
    // must fail loudly with the SEED-specific message (message a), NOT the sibling-slug
    // wording.
    const root = path.join(FIXTURES, "local-codesystem-urn-collision", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toHaveLength(0);
    expect(result.errors?.[0]?.kind).toBe("emit-local-codesystem-urn-collision");
    const msg = result.errors?.[0]?.message ?? "";
    expect(msg).toMatch(/crl-test-fixture-local/);
    // Message (a) markers: names the SEED nature + the seed-specific remedies. It must
    // NOT use the sibling-slug wording (that would be the misleading pre-fix message).
    expect(msg).toMatch(/SEED libraries/);
    expect(msg).toMatch(/cannot be auto-disambiguated/);
    expect(msg).not.toMatch(/slugify to the same value/);
  });

  it("case (b) — two cross-lib SIBLINGS whose names slugify identically → emit-local-codesystem-urn-collision with the sibling-slug message", () => {
    // "Sib One" and "Sib-One" are BOTH cross-lib siblings (pulled in via the root
    // decision's `recommend activity`, NO `include`). Option B disambiguates each to
    // `<policyId>-<slug>`, but both slug to "sib-one" → the disambiguator itself
    // collides. This is the OTHER genuine collision case, and it gets its own tailored
    // message (rename one library so its slug differs) — NOT the SEED-libraries wording.
    const root = path.join(FIXTURES, "sibling-slug-collision", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toHaveLength(0);
    expect(result.errors?.[0]?.kind).toBe("emit-local-codesystem-urn-collision");
    const msg = result.errors?.[0]?.message ?? "";
    expect(msg).toMatch(/"Sib One" and "Sib-One"/);
    // Message (b) markers: names the slug collision + the rename remedy. It must NOT use
    // the SEED-libraries wording (they are siblings, not seeds).
    expect(msg).toMatch(/slugify to the same value/);
    expect(msg).toMatch(/Rename one library so its slug differs/);
    expect(msg).not.toMatch(/SEED libraries/);
  });

  it("author boundary — a cross-lib-REF `code is` sibling SUCCEEDS, but an explicit-INCLUDE second `code is` library FAILS", () => {
    // The refuse path is scoped to what Option B genuinely cannot disambiguate. A
    // second `code is` library reached via a cross-library reference (recommend/use
    // decision) is a disambiguable SIBLING → SUCCEEDS. The SAME two-`code is`-library
    // shape reached via an explicit `include` makes both SEED libraries → FAILS. Pin
    // both sides so the boundary can't silently drift.
    const sibling = emitCQLImports(
      path.resolve(__dirname, "..", "..", "fhir-emitter", "tests", "fixtures", "none-code-is-sibling", "main.crl"),
    );
    expect(sibling.success).toBe(true);

    const included = emitCQLImports(path.join(FIXTURES, "local-codesystem-urn-collision", "root.crl"));
    expect(included.success).toBe(false);
    expect(included.errors?.[0]?.kind).toBe("emit-local-codesystem-urn-collision");
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
    // #227 — the filename is derived from the unified identity `S`, so a
    // space-carrying name emits `CMS22Inferred.cql` (was `CMS22 Inferred.cql`);
    // header, id, url-tail and filename now agree.
    const inferred = result.cqlByLibrary.find((e) => e.libraryName === "CMS22Inferred");
    expect(inferred?.outputFilename).toBe("CMS22Inferred.cql");
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

  it('cross-library qualified Patient parameter ref REWRITES to bare `Patient` (NOT `Sib."Index Patient"`)', () => {
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

  it("computeSplitPlan: decision-bearing + `code is` library → `interface` (source-typed split + Interface)", () => {
    // R2 — a decision disqualifies the FULL split (isLayerSplittable=false), but
    // the concept-level `code is` (localCodesCount > 0) triggers the `interface`
    // split: the source-typed layers (LocalConcepts + LocalSource) PLUS the
    // synthesized `<policyId>-Interface` library (the decision `when` surface).
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

    // policyId === "Pol" (passed explicitly; a direct caller uses the source name).
    const plan = computeSplitPlan(lowered.ast, "Pol", "Pol", lowered.localCodes.length);
    expect(plan.kind).toBe("interface");
    expect(plan.emittedLibraryNames).toEqual([
      "PolLocalConcepts",
      "PolLocalSource",
      "PolInterface",
    ]);
    expect(plan.partition).toBeDefined();
    expect(plan.policyId).toBe("Pol");
  });

  it("F1: a NON-decision local-code, non-splittable library routes to `none` (statements preserved, not full-split)", () => {
    // F1 — a library with concept-level `code is` BUT no Decision, that also
    // carries an Activity (so it is NOT layer-splittable: the Activity is
    // unclassifiable). Pre-F1 the `interface` branch fired on `localCodesCount > 0`
    // alone and the FULL partition would SILENTLY DROP the Activity. F1 gates the
    // `interface` kind on `hasDecision`, so this must route to `none` (per-CRL),
    // which preserves ALL statements as one library.
    const src = parse(`library "Pol".

concept "Adult Patient":
- type is Observation.
- value type is boolean.
- code is \`adult\`.

activity "Refer":
- request CPGServiceRequest.
`);
    const lowered = lowerLocalCodes(src);
    expect(lowered.errors).toEqual([]);
    expect(lowered.localCodes.length).toBe(1);

    const plan = computeSplitPlan(lowered.ast, "Pol", "Pol", lowered.localCodes.length);
    expect(plan.kind).toBe("none");
    expect(plan.emittedLibraryNames).toEqual(["Pol"]);
    // F7 — `none` carries policyId so callers don't lean on a kind-load-bearing `!`.
    expect(plan.policyId).toBe("Pol");
  });

  it("#189 IMPL 3: a decision + `code is` library carrying a no-`code is` REDUCTION routes to `none`, NOT `interface` (panel R1 Claude #1)", () => {
    // A `ReductionDefinition` concept classifies NULL in the FULL partition, so the `interface` split's
    // `buildLayerAst` would SILENTLY DROP it (no sentinel, both lanes success, the concept missing — the
    // charter's Adequate-Step-Therapy shape). The interface plan must refuse this and fall to `none`,
    // where `emitConceptBody` fails loud. Mirrors the F1 Activity precedent above.
    const src = parse(`library "Pol".

concept "Adult Patient":
- type is Observation.
- value type is boolean.
- code is \`adult\`.

concept "Enough Trials":
- value type is boolean.
- definition is exists "Adult Patient".

activity "Refer":
- request CPGServiceRequest.

decision "Triage":
- when "Adult Patient" then recommend activity "Refer".
`);
    const lowered = lowerLocalCodes(src);
    expect(lowered.localCodes.length).toBe(1);
    const plan = computeSplitPlan(lowered.ast, "Pol", "Pol", lowered.localCodes.length);
    expect(plan.kind).toBe("none"); // the reduction forces the per-CRL path (NOT "interface")
    expect(plan.emittedLibraryNames).toEqual(["Pol"]);
  });

  it("#189 IMPL 3: a decision + `code is` library carrying a REPRESENTATION-bearing concept ALSO routes to `none` (the general null-classify guard; panel R2 gpt56 #1)", () => {
    // Not reduction-specific: a `source representation` concept classifies NULL too
    // (`classifyStatementLayer`), so the interface split would silently drop it. The guard expresses the
    // documented invariant (any null-classify CONCEPT ⇒ per-CRL path), so this must route to `none`.
    const src = parse(`library "Pol".

concept "Adult Patient":
- type is Observation.
- value type is boolean.
- code is \`adult\`.

concept "Height":
- value type is Quantity.
- source representation:
  - type is Observation.
  - value element is Observation.value.
  - value type is Quantity.

activity "Refer":
- request CPGServiceRequest.

decision "Triage":
- when "Adult Patient" then recommend activity "Refer".
`);
    const lowered = lowerLocalCodes(src);
    expect(lowered.localCodes.length).toBe(1);
    const plan = computeSplitPlan(lowered.ast, "Pol", "Pol", lowered.localCodes.length);
    expect(plan.kind).toBe("none"); // the representation concept keeps the library on the per-CRL path
  });

  it("#189 IMPL 3 end-to-end: a decision + `code is` + pure-reduction library FAILS emit with the sentinel (the reduction is NOT silently dropped; panel R1 Claude #1)", () => {
    const root = path.join(FIXTURES, "decision-localcode-reduction", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect((result.errors ?? []).some((e) => e.kind === "emit-reduction-not-active")).toBe(true);
    expect(result.cqlByLibrary).toHaveLength(0); // whole emit fails loud — no partial manifest (panel R2 gpt56 #3)
  });

  it("F1 end-to-end: a non-decision local-code + Activity library emits ONE library keeping every statement", () => {
    // The per-CRL (`none`) emit must keep the Activity-bearing local-code library
    // as a single CQL library named after the source (no source-typed fan-out,
    // no dropped Activity).
    const root = path.join(FIXTURES, "non-decision-localcode-activity", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    const names = policyLibNames(result);
    expect(names).toEqual(["Pol"]);
    const cql = findLib(result, "Pol") ?? "";
    // The lowered local code is present (the `code is` lowering still ran) AND the
    // concept define is present — both in the ONE per-CRL library.
    expect(cql).toMatch(/define "Adult Patient"/);
  });

  it("R2: source-name `<lib> Concepts` collision class is eliminated by policy-id naming (interface-split + real `Pol Concepts` sibling no longer clash)", () => {
    // PRE-R2 this fixture FAILED: the partial-split of "Pol" generated a `Pol
    // Concepts` sibling that clashed with the REAL `library "Pol Concepts"`.
    // Under R2 "Pol" takes the `interface` split and its layers are named from
    // the POLICY ID (`crl-test-fixture-LocalConcepts/-LocalSource/-Inferred/
    // -Interface`), so they can never collide with the source-derived `Pol
    // Concepts` sibling — the collision class is gone. The closure emits cleanly;
    // `From Sibling`'s foreign ref to "Pol Concepts" survives as a cross-library
    // include on the Inferred layer.
    const root = path.join(FIXTURES, "partial-concepts-name-collision", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    // #227 — the foreign `none` sibling `Pol Concepts` emits under `PolConcepts`.
    // The manifest `includes` field keeps the RAW ref name (`Pol Concepts`) — the
    // rename applies only to the RENDERED CQL `include`/qualified-ref text, not the
    // manifest's dependency-resolution keys.
    const names = policyLibNames(result);
    expect(names).toEqual([
      "CrlTestFixtureInferred",
      "CrlTestFixtureInterface",
      "CrlTestFixtureLocalConcepts",
      "CrlTestFixtureLocalSource",
      "PolConcepts",
    ]);
    const inferred = result.cqlByLibrary.find((e) => e.libraryName === "CrlTestFixtureInferred");
    expect(inferred?.includes).toContain("Pol Concepts");
  });

  it("#227: two `none` libraries whose names PascalCase to the SAME `S` collide in the CQL lane", () => {
    // "Guard One" and "Guard-One" both → `S = "GuardOne"`. Pre-#227 the `none` path
    // registered the RAW name (distinct), so this transformed-identity clobber slipped
    // past the CQL-lane preflight and would silently overwrite one `GuardOne.cql`.
    // #227 registers the emitted `S` in the preflight, so the collision fails loudly
    // BEFORE either file/library is emitted — matching the FHIR-lane id uniqueness.
    const root = path.join(FIXTURES, "none-s-collision", "root.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toHaveLength(0);
    const err = result.errors?.find((e) => e.kind === "layered-name-collision");
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/GuardOne/);
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

  it("#187: ALWAYS appends the three shared catalog libraries to cqlByLibrary", () => {
    // Every successful emit ships CRLCommon.cql + CaseFeatureCommon.cql +
    // FHIRHelpers.cql (4.0.1) regardless of the policy's shape.
    const root = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);

    const byName = new Map(result.cqlByLibrary.map((e) => [e.libraryName, e]));
    for (const [name, file] of [
      ["CRLCommon", "CRLCommon.cql"],
      ["CaseFeatureCommon", "CaseFeatureCommon.cql"],
      ["FHIRHelpers", "FHIRHelpers.cql"],
    ] as const) {
      const entry = byName.get(name);
      expect(entry).toBeDefined();
      expect(entry!.outputFilename).toBe(file);
      // Non-empty catalog source with the expected header identity.
      expect(entry!.cql.length).toBeGreaterThan(0);
      expect(entry!.cql).toMatch(new RegExp(`library ${name}`));
      // Well-formed manifest shape so the FHIR orchestrator never mis-routes them.
      expect(entry!.role).toBe("root");
      expect(entry!.sourceLibraryName).toBe(name);
      expect(entry!.includes).toEqual([]);
    }

    // FHIRHelpers is pinned to 4.0.1 (engine-bundled version).
    expect(byName.get("FHIRHelpers")!.cql).toMatch(/library FHIRHelpers version '4\.0\.1'/);
    // CaseFeatureCommon carries the truth-set helpers (renamed from CaseFeatureHelpers).
    expect(byName.get("CaseFeatureCommon")!.cql).toMatch(/define fluent function asTruths/);
  });

  it("#187: FHIRHelpers version does not drift across catalog header, loader, and emitted include pin", () => {
    // Single red test if ANY of the three FHIRHelpers version sources diverge:
    //   (1) the shipped catalog `FHIRHelpers.cql` header `library ... version '<v>'`,
    //   (2) the loader's declared `loadFHIRHelpers().version`,
    //   (3) the emitter's `include FHIRHelpers version '<v>'` pin
    //       (DEFAULT_FHIRHELPERS_VERSION, also stamped in every emitted layer).
    // All three must equal the engine's bundled FHIRHelpers version (4.0.1) so
    // emitted == engine == include == catalog source.
    const fh = loadFHIRHelpers();
    const headerMatch = fh.cql.match(/library FHIRHelpers version '([^']+)'/);
    expect(headerMatch).not.toBeNull();
    const catalogHeaderVersion = headerMatch![1];

    expect(catalogHeaderVersion).toBe("4.0.1");
    expect(fh.version).toBe(catalogHeaderVersion);
    expect(DEFAULT_FHIRHELPERS_VERSION).toBe(catalogHeaderVersion);

    // The emitted layer CQL pins the SAME version in its include line.
    const root = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const result = emitCQLImports(root);
    const policyCql = result.cqlByLibrary.find((e) => e.libraryName === "CMS22")!.cql;
    expect(policyCql).toContain(`include FHIRHelpers version '${DEFAULT_FHIRHELPERS_VERSION}'`);
  });
});

describe("#257 (age slice) — standalone Patient age posrep in the imports/interface lane", () => {
  it("a standalone age posrep in a decision-bearing (code-is) library rides the Inferred lane, not dropped to a null layer", () => {
    // Regression guard for the impl-round [critical]: pre-migration a standalone `definition is age
    // today` classified Inferred and emitted here; the migrated posrep form must NOT silently drop
    // (classify null) when the library also has a `code is` concept forcing the interface split.
    const root = path.join(FIXTURES, "standalone-age", "standalone-age.crl");
    const result = emitCQLImports(root);
    expect(result.success).toBe(true);
    // The age determination emits the generic computed call in SOME emitted library (the Inferred
    // layer) — proving "Adult" was classified + emitted, not dropped.
    const allCql = result.cqlByLibrary.map((e) => e.cql).join("\n\n");
    expect(allCql).toContain("CRLCommon.AtLeast(CRLCommon.AgeAt(), 18 'years')");
    // And a define for the age concept exists (the decision's `when "Adult"` resolves).
    expect(allCql).toMatch(/define "Adult":/);
  });
});
