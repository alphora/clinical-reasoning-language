import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "@jest/globals";

import {
  applyActionInputProfileInvariant,
  applyInvariant1,
  applyLibraryIdentityInvariant,
  applyUrlUniquenessInvariant,
  emitFhirDefClosure,
  emitFhirDefFromPath,
} from "../closureOrchestrator";
import { emitCQLImports } from "../../imports/emit";
import { localCodeSystemUrl } from "../../cql-emitter/lowerLocalCodes";
import { capSlugForSuffix, slugify } from "../slug";
import { CPG_FEATURE_EXPRESSION_EXT } from "../types";
import type { CpgMetadata, EmittedResource } from "../types";

const ROOT = join(__dirname, "..", "..", "..");
const FIXED_CLOCK = () => new Date("2026-06-05T15:30:00.000Z");

// #187 — the two shared catalog Library resources (CRLCommon + CaseFeatureCommon)
// are ALWAYS emitted alongside a non-empty policy package. Tests that assert
// POLICY resource sets/counts/versions filter them out; a dedicated test asserts
// the catalog Library emit itself.
const CATALOG_LIB_TITLES = new Set(["CRLCommon", "CaseFeatureCommon"]);
const CATALOG_LIB_IDS = new Set(["CRLCommon", "CaseFeatureCommon"]);

const METADATA: CpgMetadata = {
  version: "1.0.0",
  name: "cc-screening-cognitive-support",
  title: "CC Screening",
  description: "Round-trip fixture",
  publisher: "Smile Digital Health",
  contact: [],
  canonicalBase: "http://example.org/sdh/demo",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

const FIXTURE = join(
  ROOT,
  "src/tests/fixtures/cpg-roundtrip/cc-screening-cognitive-support/cc-screening.crl",
);

describe("closureOrchestrator — emitFhirDefFromPath (cc-screening end-to-end)", () => {
  it("emits the expected resource set for the cc-screening fixture", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });

    // Resource counts
    const byType = new Map<string, number>();
    for (const r of result.resources) {
      byType.set(r.resourceType, (byType.get(r.resourceType) ?? 0) + 1);
    }

    // 4 activities → 4 ActivityDef + 4 Recommendation PlanDef
    expect(byType.get("ActivityDefinition")).toBe(4);
    // 2 decisions: 1 Strategy + 1 Sub-decision
    // Plus 4 Recommendation PlanDefs (1 per activity)
    expect(byType.get("PlanDefinition")).toBe(2 + 4);
    // 1 policy Library + 2 always-emitted shared catalog Libraries (#187).
    expect(byType.get("Library")).toBe(1 + 2);
    // 1 terminology = 1 ValueSet (after the v3.2 fixture extension)
    expect(byType.get("ValueSet")).toBe(1);
  });

  it("emits Library.content[0].attachment.url = `../../cql/<name>.cql` per plan v3.2 layout", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    const lib = result.resources.find((r) => r.resourceType === "Library");
    expect(lib).toBeDefined();
    const content = (lib!.resource as { content?: Array<{ url?: string }> }).content;
    expect(content?.[0]?.url).toBe("../../cql/CRC Recommendation.cql");
  });

  it("populates sourceKind + sourceName on every emitted resource (attribution for Inv 1)", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    for (const r of result.resources) {
      expect(r.sourceKind).toBeDefined();
      expect(r.sourceName).toBeDefined();
    }
  });

  it("every emitted resource carries `version` from package.json (CRMI shareable floor)", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    for (const r of result.resources) {
      // #187 — catalog Libraries carry their fixed catalog CQL-header version, not
      // the package version.
      if (
        r.resourceType === "Library" &&
        CATALOG_LIB_IDS.has((r.resource as { id?: string }).id ?? "")
      ) {
        continue;
      }
      expect((r.resource as Record<string, unknown>).version).toBe("0.0.0");
    }
  });

  it("#187: ONLY the catalog Libraries carry the catalog CQL-header version; all other Libraries carry the package version", () => {
    // Version-exemption guard: CRLCommon → 0.2.0 and CaseFeatureCommon → 1.0.0
    // (their fixed CQL-header versions), while EVERY other emitted Library carries
    // the package version (cc-screening package.json version = 0.0.0). A future
    // helper accidentally taking the package version — or a policy layer
    // accidentally taking a catalog version — flips this test.
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    const EXPECTED_CATALOG_VERSION: Record<string, string> = {
      CRLCommon: "0.2.0",
      CaseFeatureCommon: "1.0.0",
    };
    let sawCRLCommon = false;
    let sawCaseFeatureCommon = false;
    for (const r of result.resources) {
      if (r.resourceType !== "Library") continue;
      const id = (r.resource as { id?: string }).id ?? "";
      const version = (r.resource as { version?: string }).version;
      if (id in EXPECTED_CATALOG_VERSION) {
        expect(version).toBe(EXPECTED_CATALOG_VERSION[id]);
        if (id === "CRLCommon") sawCRLCommon = true;
        if (id === "CaseFeatureCommon") sawCaseFeatureCommon = true;
      } else {
        // policy layer Library → package version
        expect(version).toBe("0.0.0");
      }
    }
    // Both catalog Libraries were actually present (not a vacuous pass).
    expect(sawCRLCommon).toBe(true);
    expect(sawCaseFeatureCommon).toBe(true);
  });

  it("Library.relatedArtifact[depends-on] includes the ValueSet canonical URL (Inv 2(b) coverage)", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    const lib = result.resources.find((r) => r.resourceType === "Library");
    const ra = (lib!.resource as { relatedArtifact?: Array<{ type?: string; resource?: string }> })
      .relatedArtifact;
    const dependsOnUrls = ra!.filter((e) => e.type === "depends-on").map((e) => e.resource);
    // The Coverage Concern VS canonical URL should be there
    expect(dependsOnUrls.some((u) => typeof u === "string" && u.includes("ValueSet/"))).toBe(true);
  });

  it("every PlanDef.action.definitionCanonical resolves to an emitted resource (Inv 3)", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    const emittedUrls = new Set(
      result.resources
        .map((r) => (r.resource as { url?: string }).url)
        .filter((u): u is string => typeof u === "string"),
    );

    function collectCanonicals(actions: Array<Record<string, unknown>>): string[] {
      const out: string[] = [];
      for (const a of actions) {
        if (typeof a.definitionCanonical === "string") out.push(a.definitionCanonical);
        if (Array.isArray(a.action)) {
          out.push(...collectCanonicals(a.action as Array<Record<string, unknown>>));
        }
      }
      return out;
    }

    let totalRefs = 0;
    for (const r of result.resources) {
      if (r.resourceType !== "PlanDefinition") continue;
      const actions = (r.resource as { action?: Array<Record<string, unknown>> }).action;
      if (!Array.isArray(actions)) continue;
      const refs = collectCanonicals(actions);
      totalRefs += refs.length;
      for (const ref of refs) {
        expect(emittedUrls.has(ref)).toBe(true);
      }
    }
    expect(totalRefs).toBeGreaterThan(0);
  });

  it("success = true on clean cc-screening emit (no errors, no unmatched)", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    expect(result.errors).toEqual([]);
    // The cc-screening corpus has no free-text `with` (only terminology refs)
    // after the v3.2 fixture extension; unmatched should be empty.
    expect(result.unmatched).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("cc-screening fixture has exactly 10 concepts (regression guard against duplicate-name reintroduction)", () => {
    // Body-only swap of "Has Coverage Concern" must keep concept count at 10.
    const src = readFileSync(FIXTURE, "utf-8");
    // Match top-level `concept "Name":` declarations (not inside nested CRL structures)
    const conceptDecls = src.match(/^concept\s+"[^"]+"\s*:/gm) ?? [];
    expect(conceptDecls.length).toBe(10);
  });
});

/* ─── C2 — malformed crl.dispositions must SINK success (not silently degrade) ─ */

const MALFORMED_DISPOSITIONS = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/malformed-dispositions/malformed-dispositions.crl",
);

describe("closureOrchestrator — malformed crl.dispositions (C2 regression)", () => {
  // The critical bug (now fixed): an error-severity `crl.dispositions` problem
  // used to silently degrade the emit to `configured:false` — dropping every PA
  // determination dynamicValue — while STILL reporting `success:true`. The fix
  // (emitFhirDefFromPath) withholds the config on any error-severity
  // DispositionConfigError, folds those into `disposition-config` CRLErrors, and
  // sinks `success`. This fixture's config is malformed ONLY by an invalid `mode`
  // ("bogus" → unknown-mode, severity:"error"); its `options` are otherwise valid
  // and DEFINE a `not-certify.Deny` leaf — so a regression that failed to withhold
  // would emit a determination reasonCode/label contentString (assertion c).
  it("sinks success:false, folds a disposition-config error, and emits NO determination outcome", () => {
    const result = emitFhirDefFromPath(MALFORMED_DISPOSITIONS, { clock: FIXED_CLOCK });

    // (a) success is sunk by the error-severity config problem.
    expect(result.success).toBe(false);

    // (b) the error surfaces as a `disposition-config` CRLError anchored at package.json.
    const dispErrors = result.errors.filter((e) => e.kind === "disposition-config");
    expect(dispErrors.length).toBeGreaterThanOrEqual(1);
    expect(dispErrors.some((e) => (e.message ?? "").includes("crl.dispositions.mode"))).toBe(true);

    // (c) NO emitted ActivityDefinition carries a determination outcome: the config
    // was withheld, so there is no `reasonCode` dynamicValue and no
    // `payload.contentString` carrying the disposition LABEL ("Deny"). (A plain
    // CommunicationRequest activity may still route its `with` narrative to
    // `payload.contentString` — that narrative is "Denied.", NOT the "Deny" label —
    // so we assert against the determination markers specifically.)
    const activityDefs = result.resources.filter((r) => r.resourceType === "ActivityDefinition");
    // Non-vacuity: the determination activity IS emitted (as a plain
    // CommunicationRequest, config withheld) — so the loop below actually runs.
    expect(activityDefs.length).toBeGreaterThanOrEqual(1);
    for (const ad of activityDefs) {
      const dvs =
        (ad.resource as { dynamicValue?: Array<{ path?: string; expression?: { expression?: string } }> })
          .dynamicValue ?? [];
      // No determination markers at all: no reasonCode, no note, and no payload carrying the WITHHELD label.
      expect(dvs.some((dv) => dv.path === "reasonCode")).toBe(false);
      expect(dvs.some((dv) => dv.path === "note.text")).toBe(false);
      expect(
        dvs.some((dv) => dv.path === "payload.contentString" && dv.expression?.expression === "'Deny'"),
      ).toBe(false);
    }
    // Round-2 (gpt55) hardening: pin the EXACT plain-CommunicationRequest shape of the withheld determination —
    // its ONLY dynamicValue is the `with` narrative → `payload.contentString = 'Denied.'` (NOT the label, no
    // note, no reasonCode). Had the malformed config NOT been withheld, this AD would instead carry
    // payload='Deny' (label) + note.text + reasonCode.
    const denyAd = activityDefs.find(
      (r) => (r.resource as { id?: string }).id?.endsWith("not-certify-deny") ?? false,
    );
    expect(denyAd).toBeDefined();
    expect((denyAd!.resource as { dynamicValue?: unknown }).dynamicValue).toEqual([
      { path: "payload.contentString", expression: { language: "text/cql-expression", expression: "'Denied.'" } },
    ]);
  });
});

describe("closureOrchestrator — direct API (emitFhirDefClosure)", () => {
  it("returns 0-resources gracefully when the closure is empty", () => {
    // Synthesize an empty ResolvedGraph
    const result = emitFhirDefClosure(
      {
        rootPath: "/tmp/empty",
        resolvedLibraries: [],
        localLibraries: [],
        namespace: { byPath: new Map(), byLibraryName: new Map() },
        diagnostics: [],
      },
      METADATA,
      { clock: FIXED_CLOCK },
    );
    expect(result.resources).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

/* ─── Slice 4 — concept-level `code is` → FHIR CodeSystem coverage ───── */

const CODE_IS_BASIC = join(ROOT, "src/cql-emitter/tests/fixtures/code-is-basic/code-is-basic.crl");

// F4 — a decision-bearing fixture that `when`s on TWO eligible LocalSource-boolean
// concepts, so BOTH case-feature StructureDefinitions are emitted AND each
// when-action must carry the corresponding input.profile.
const CODE_IS_DECISION_TWO = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/code-is-decision-two/code-is-decision-two.crl",
);

// #198 — a TWO-`code is`-library fixture (mirror of the repro-198 oracle): the
// entry library `main.crl` chains `use decision "Two Lib Sub"."Sub Determination"`
// into a vendored sibling `sub.crl` that ALSO declares concept-level `code is`.
// Pre-#198 both minted a per-policy local CodeSystem at `<policyId>-local` +
// `Library/<policyId>` → a canonical-url collision (`closure-resource-*-collision`).
// Option B disambiguates ONLY the cross-lib sibling.
const CODE_IS_TWO_LIBRARIES = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/code-is-two-libraries/main.crl",
);

// #196 — a two-library fixture: Root's decision `recommend`s an activity that
// lives in a SIBLING "Shared" disposition library via the cross-library qualified
// ref `"Shared"."Shared Deny"`. Proves the FHIR activityResolver resolves ACROSS
// the library boundary (previously it returned null for any qualified cross-lib
// activity ref, cascading the decision to decision-cascade-suppressed).
const CROSS_LIB_ACTIVITY_ROOT = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/cross-lib-activity/root.crl",
);

// #186 follow-up NEGATIVE — a STANDALONE activities-only library (the emit entry IS
// the activities-only lib, so there is no decision root to rebind onto). NOT
// suppressed — keeps its own CQL + FHIR Library (self-bound).
const ACTIVITIES_ONLY_STANDALONE = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/activities-only-standalone/dispositions.crl",
);

// #201 — an activities-only 'Shared' lib in a closure with TWO decision libs (Main =
// root recommends Shared AND delegates to Other; Other ALSO recommends Shared).
// Suppression keys on the graph-root (Main), so Shared binds to Main's Interface.
const ACTIVITIES_ONLY_TWO_DECISIONS = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/activities-only-two-decisions/main.crl",
);

// #201 — the harder shape: Main (graph-root) ONLY delegates (`use decision`) to Other
// and NEVER recommends Shared; the delegated Other is the sole recommender. Shared must
// still bind to the GRAPH-ROOT (Main) Interface — the rebind-onto-a-non-recommender-root
// path. Distinguishes graph-root keying from any recommender-based rule.
const ACTIVITIES_ONLY_SUB_ONLY = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/activities-only-sub-only-recommend/main.crl",
);

// #186 follow-up — a suppressed activities-only 'Shared' lib whose sole consumer
// (Root) is NONE-KIND (coded from, no `code is`, no Interface). Exercises
// suffixForSource's name-keeping-Root fallback (critical (c) — no throw).
const ACTIVITIES_ONLY_NONEKIND_CONSUMER = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/activities-only-nonekind-consumer/root.crl",
);

// #196 negative — Root recommends `"Shared"."Nonexistent Activity"`: the Shared
// library is real and in the closure, but has NO activity by that name, so the
// resolver's `index.activities` guard misses → returns null (fail-closed).
const CROSS_LIB_ACTIVITY_MISSING = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/cross-lib-activity-missing/root.crl",
);

// #196 collision — two sibling libraries each define an activity `Deny`, both
// recommended. `recommendationIdForLib` is policy-id-scoped, so they collapse onto
// one AD/Recommendation URL → a closure collision invariant must fire (fail-closed).
const CROSS_LIB_ACTIVITY_COLLISION = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/cross-lib-activity-collision/root.crl",
);

// #196 — the `use decision` cross-library edge (the mirror of the `recommend
// activity` edge above). Root's decision DELEGATES to a decision in a sibling
// `Shared` library via `use decision "Shared"."Sub Triage"` with NO explicit
// `include "Shared"`. `Shared` is NON-split (a decision-bearing library with no
// concept-level `code is`), so it stays one `Shared` CQL library. Proves the
// decisionResolver resolves ACROSS the library boundary to Shared's Decision
// PlanDefinition, and the CQL-closure walk (`collectCqlEmitRefs` walking Decision
// refs) pulls Shared's CQL in so its FHIR Library does not dangle at Inv 4.
const CROSS_LIB_DECISION_ROOT = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/cross-lib-decision/root.crl",
);

// #196 boundary — the split-library case for the `use decision` edge. Here the
// SHARED library is AUTO-SPLIT (concept-level `code is` + a decision → `interface`
// split), so `Shared`'s SOURCE name no longer exists as an emitted CQL library.
// A cross-lib `use decision` into it RESOLVES anyway, because the reference is a
// POLICY-ID-scoped Decision PlanDefinition canonical URL — it does not depend on
// the dissolved CQL library name. The split-library guard
// (`emit-cross-library-ref-into-split-library`) must therefore NOT fire on this
// decision edge (it walks concept-definition refs only, which is correct — only
// concept/terminology refs emit as literal CQL `"X"."Y"` that a split dissolves).
const CROSS_LIB_DECISION_SPLIT_ROOT = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/cross-lib-decision-split/root.crl",
);

describe("closureOrchestrator — FHIR closure code-is coverage (T2)", () => {
  it("emits EXACTLY ONE local CodeSystem under canonicalBase carrying the fixture's codes", () => {
    const result = emitFhirDefFromPath(CODE_IS_BASIC, { clock: FIXED_CLOCK });
    const codeSystems = result.resources.filter((r) => r.resourceType === "CodeSystem");
    expect(codeSystems).toHaveLength(1);
    const cs = codeSystems[0]!.resource as Record<string, unknown>;
    expect(cs.url).toBe(
      "http://example.org/crl/code-is-basic/CodeSystem/code-is-basic-fixture-local",
    );
    // The two `code is`-only concepts → concept[] (the `defined as` concept is NOT a local code).
    expect(cs.concept).toEqual([
      { code: "adult-18-or-older", display: "Adult Patient" },
      { code: "active-crohns-disease", display: "Active Crohns Disease" },
    ]);
  });

  it("emits one FHIR Library PER emitted CQL layer, content urls resolving to the split files (R2 source-typed)", () => {
    // R2 — `code-is-basic` is the FULL-split case (decision-LESS, multi-layer,
    // `code is`): the CQL lane now emits 3 SOURCE-TYPED layer files
    // (LocalConcepts → LocalSource → Inferred), so the FHIR lane emits 3 Libraries
    // matching them (one FHIR Library per manifest entry), NOT one un-split "Code
    // Is Basic" Library pointing at a CQL file the split never wrote.
    const result = emitFhirDefFromPath(CODE_IS_BASIC, { clock: FIXED_CLOCK });
    // #187 — exclude the always-emitted shared catalog Libraries
    // (CRLCommon/CaseFeatureCommon); this test asserts the POLICY layer Libraries.
    const libs = result.resources.filter(
      (r) =>
        r.resourceType === "Library" &&
        !CATALOG_LIB_TITLES.has((r.resource as { title?: string }).title ?? ""),
    );
    const byTitle = new Map(
      libs.map((l) => [
        (l.resource as { title?: string }).title,
        l.resource as Record<string, unknown>,
      ]),
    );
    // #186 — the Library title is the unified hyphen-free `S` (== id == name ==
    // url-tail == the CQL library name), the cap-safe PascalCase of `<policyId>-<layer>`.
    expect([...byTitle.keys()].sort()).toEqual([
      "CodeIsBasicFixtureInferred",
      "CodeIsBasicFixtureLocalConcepts",
      "CodeIsBasicFixtureLocalSource",
    ]);
    // Every content url resolves to its split CQL file (Inv 4 passes → no
    // library-content-url-unresolved error).
    for (const [title, res] of byTitle) {
      const content = (res as { content?: Array<{ url?: string }> }).content;
      expect(content?.[0]?.url).toBe(`../../cql/${title}.cql`);
    }
    expect(result.errors.some((e) => e.kind === "library-content-url-unresolved")).toBe(false);
    // The LocalSource layer depends-on the LocalConcepts layer it `include`s.
    const localSource = byTitle.get("CodeIsBasicFixtureLocalSource")!;
    const localSourceDeps = (
      (localSource.relatedArtifact as Array<{ resource?: string }>) ?? []
    ).map((e) => e.resource);
    expect(localSourceDeps).toContain(
      "http://example.org/crl/code-is-basic/Library/CodeIsBasicFixtureLocalConcepts",
    );
    // R2: the LocalConcepts LAYER is `role:"concepts"` (Local family), so it owns
    // the local CodeSystem depends-on edge. The LocalSource/Inferred consuming
    // layers reach it transitively via their LocalConcepts-sibling dep above.
    const localConcepts = byTitle.get("CodeIsBasicFixtureLocalConcepts")!;
    const localConceptsDeps = (
      (localConcepts.relatedArtifact as Array<{ resource?: string }>) ?? []
    ).map((e) => e.resource);
    expect(localConceptsDeps).toContain(
      "http://example.org/crl/code-is-basic/CodeSystem/code-is-basic-fixture-local",
    );
  });

  it("byte-equality: the FHIR CodeSystem.url == the CQL `codesystem '<url>'` literal (anti-drift before slice A)", () => {
    // FHIR lane.
    const fhir = emitFhirDefFromPath(CODE_IS_BASIC, { clock: FIXED_CLOCK });
    const csUrl = (
      fhir.resources.find((r) => r.resourceType === "CodeSystem")!.resource as { url: string }
    ).url;

    // The shared helper must agree with both lanes for the same library entry.
    // R1 — the local-domain slug is the fixture's POLICY ID (package name
    // "code-is-basic-fixture"), not the library name "Code Is Basic".
    expect(csUrl).toBe(
      localCodeSystemUrl("http://example.org/crl/code-is-basic", "code-is-basic-fixture"),
    );

    // CQL lane — the emitted CQL must carry a `codesystem '<csUrl>'` literal
    // byte-equal with the FHIR CodeSystem.url.
    const cql = emitCQLImports(CODE_IS_BASIC);
    expect(cql.success).toBe(true);
    const allCql = cql.cqlByLibrary.map((e) => e.cql).join("\n");
    expect(allCql).toContain(`'${csUrl}'`);
    // Slice 4b — the N per-concept "<Concept> System" codesystem decls collapsed
    // into ONE shared domain decl carrying the same URL. R1/case-feature — the
    // decl name is derived from the POLICY ID ("code-is-basic-fixture"),
    // title-cased: "Code Is Basic Fixture Local Codes".
    expect(allCql).toContain(`codesystem "Code Is Basic Fixture Local Codes": '${csUrl}'`);
  });

  it("F4 — two eligible LocalSource-boolean concepts → BOTH case-feature SDs emitted AND each when-action carries its input.profile (silent-omission guard)", () => {
    const result = emitFhirDefFromPath(CODE_IS_DECISION_TWO, { clock: FIXED_CLOCK });
    expect(result.success).toBe(true);

    // (a) BOTH case-feature StructureDefinitions are emitted.
    const sds = result.resources.filter((r) => r.resourceType === "StructureDefinition");
    const sdUrlByConcept = new Map<string, string>();
    for (const r of sds) {
      sdUrlByConcept.set(r.sourceName!, (r.resource as { url: string }).url);
    }
    expect([...sdUrlByConcept.keys()].sort()).toEqual(["Active Crohns Disease", "Adult Patient"]);

    // (b) Each concept's when-action carries the corresponding input.profile. The
    // outer `when "Adult Patient"` action and the nested `when "Active Crohns
    // Disease"` action each get their own input pointing at their own SD.
    const planDef = result.resources.find(
      (r) => r.resourceType === "PlanDefinition" && r.sourceKind === "Decision",
    )!;
    const topActions = (planDef.resource as { action: Array<Record<string, unknown>> }).action;
    const adultAction = topActions[0]!;
    const adultInput = (adultAction.input as Array<{ profile: string[] }>)[0]!;
    expect(adultInput.profile).toEqual([sdUrlByConcept.get("Adult Patient")]);

    const crohnsAction = (adultAction.action as Array<Record<string, unknown>>)[0]!;
    const crohnsInput = (crohnsAction.input as Array<{ profile: string[] }>)[0]!;
    expect(crohnsInput.profile).toEqual([sdUrlByConcept.get("Active Crohns Disease")]);

    // And Inv 5 sees both input profiles resolve to an emitted SD → no
    // unresolved-action-input-profile error.
    expect(result.errors.some((e) => e.kind === "unresolved-action-input-profile")).toBe(false);
  });
});

/* ─── #198 — two `code is` libraries under one policy id (Option B) ──── */

describe("closureOrchestrator — two `code is` libraries disambiguate their local domains (#198)", () => {
  // policyId = package name "code-is-two-lib-fixture"; canonicalBase from crl.canonicalBase.
  const BASE = "http://example.org/crl/code-is-two-lib";
  // PRIMARY (the entry / closure-seed library "Two Lib Main") keeps the clean
  // `<policyId>-local`; the cross-lib SIBLING ("Two Lib Sub", slug "two-lib-sub")
  // is disambiguated to `<policyId>-<librarySlug>-local`.
  const PRIMARY_CS_URL = `${BASE}/CodeSystem/code-is-two-lib-fixture-local`;
  const SIBLING_CS_URL = `${BASE}/CodeSystem/code-is-two-lib-fixture-two-lib-sub-local`;

  it("emits TWO distinct local CodeSystems (primary clean, sibling suffixed), each carrying ITS OWN code, with no collision/unresolved errors", () => {
    const result = emitFhirDefFromPath(CODE_IS_TWO_LIBRARIES, { clock: FIXED_CLOCK });

    // The whole two-`code is`-library emit SUCCEEDS (pre-#198 this failed with
    // closure-resource-collision on the shared `<policyId>-local` / `Library/<policyId>`).
    expect(result.success).toBe(true);
    for (const kind of [
      "emit-local-codesystem-urn-collision",
      "closure-resource-collision",
      "closure-resource-url-collision",
      "unresolved-library-reference",
      "decision-root-library-missing",
    ]) {
      expect(result.errors.some((e) => e.kind === kind)).toBe(false);
    }

    // TWO local CodeSystems, at the primary + disambiguated-sibling urls, each
    // carrying EXACTLY its own library's local code.
    const codeSystems = result.resources.filter((r) => r.resourceType === "CodeSystem");
    const csByUrl = new Map(
      codeSystems.map((r) => [(r.resource as { url: string }).url, r.resource as Record<string, unknown>]),
    );
    expect([...csByUrl.keys()].sort()).toEqual([PRIMARY_CS_URL, SIBLING_CS_URL].sort());
    // id == url-tail for each (the FHIR `id` is the disambiguated local-domain slug).
    expect((csByUrl.get(PRIMARY_CS_URL)!.id as string)).toBe("code-is-two-lib-fixture-local");
    expect((csByUrl.get(SIBLING_CS_URL)!.id as string)).toBe(
      "code-is-two-lib-fixture-two-lib-sub-local",
    );
    expect(csByUrl.get(PRIMARY_CS_URL)!.concept).toEqual([
      { code: "feature-main", display: "Feature Main" },
    ]);
    expect(csByUrl.get(SIBLING_CS_URL)!.concept).toEqual([
      { code: "feature-sub", display: "Feature Sub" },
    ]);
  });

  it("the sibling's case-feature SD `system`, its CodeSystem.url, and the CQL `codesystem '<url>'` decl all byte-equal the DISAMBIGUATED sibling url", () => {
    const result = emitFhirDefFromPath(CODE_IS_TWO_LIBRARIES, { clock: FIXED_CLOCK });

    // (a) Each concept's case-feature SD `patternCodeableConcept.coding.system`
    // points at ITS OWN library's local CodeSystem — Feature Sub → the sibling url,
    // Feature Main → the primary url (no cross-wiring to the shared policy domain).
    const systemByConcept = new Map<string, string>();
    for (const r of result.resources.filter((x) => x.resourceType === "StructureDefinition")) {
      const diff = (r.resource as { differential: { element: Array<Record<string, unknown>> } })
        .differential.element;
      const codeEl = diff.find((e) => e.id === "Observation.code")!;
      const system = (
        codeEl.patternCodeableConcept as { coding: Array<{ system: string }> }
      ).coding[0]!.system;
      systemByConcept.set(r.sourceName!, system);
    }
    expect(systemByConcept.get("Feature Main")).toBe(PRIMARY_CS_URL);
    expect(systemByConcept.get("Feature Sub")).toBe(SIBLING_CS_URL);

    // (b) The CQL lane emits the sibling's `codesystem '<url>'` decl with the SAME
    // disambiguated url — cross-lane byte-equality (#186 "one identity everywhere").
    const cql = emitCQLImports(CODE_IS_TWO_LIBRARIES);
    expect(cql.success).toBe(true);
    // The sibling's terminology-owning CQL library (its LocalConcepts layer) carries
    // the disambiguated codesystem literal; the primary's carries the clean one.
    const subConcepts = cql.cqlByLibrary.find(
      (e) => e.sourceLibraryName === "Two Lib Sub" && e.layer === "LocalConcepts",
    )!;
    const mainConcepts = cql.cqlByLibrary.find(
      (e) => e.sourceLibraryName === "Two Lib Main" && e.layer === "LocalConcepts",
    )!;
    expect(subConcepts.cql).toContain(`'${SIBLING_CS_URL}'`);
    expect(subConcepts.cql).not.toContain(`'${PRIMARY_CS_URL}'`);
    expect(mainConcepts.cql).toContain(`'${PRIMARY_CS_URL}'`);
  });

  it("the primary keeps clean `<policyId>-<Layer>` Library identities; the sibling's layer Libraries are `<policyId>-<librarySlug>-<Layer>` and their content/depends-on all resolve", () => {
    const result = emitFhirDefFromPath(CODE_IS_TWO_LIBRARIES, { clock: FIXED_CLOCK });

    const policyLibIds = result.resources
      .filter(
        (r) =>
          r.resourceType === "Library" && !CATALOG_LIB_IDS.has((r.resource as { id: string }).id),
      )
      .map((r) => (r.resource as { id: string }).id)
      .sort();
    // Primary (Two Lib Main) → clean `CodeIsTwoLibFixture<Layer>`; sibling
    // (Two Lib Sub) → disambiguated `CodeIsTwoLibFixtureTwoLibSub<Layer>`.
    expect(policyLibIds).toEqual([
      "CodeIsTwoLibFixtureInterface",
      "CodeIsTwoLibFixtureLocalConcepts",
      "CodeIsTwoLibFixtureLocalSource",
      "CodeIsTwoLibFixtureTwoLibSubInterface",
      "CodeIsTwoLibFixtureTwoLibSubLocalConcepts",
      "CodeIsTwoLibFixtureTwoLibSubLocalSource",
    ]);

    // The sibling's LocalConcepts Library depends-on ITS OWN (disambiguated) local
    // CodeSystem — no dangling reference (Inv 0/1/4 all pass → success above).
    const subLocalConcepts = result.resources.find(
      (r) =>
        r.resourceType === "Library" &&
        (r.resource as { id: string }).id === "CodeIsTwoLibFixtureTwoLibSubLocalConcepts",
    )!;
    const deps = ((subLocalConcepts.resource as { relatedArtifact?: Array<{ resource?: string }> })
      .relatedArtifact ?? []).map((a) => a.resource);
    expect(deps).toContain(SIBLING_CS_URL);
    expect(result.errors.some((e) => e.kind === "library-content-url-unresolved")).toBe(false);
  });
});

/* ─── #198 C1 — a `none` cross-lib `code is` sibling's base Library ──── */

// C1 — the main policy (`code is` + a decision that cross-lib `recommend`s an
// activity in the sibling) pulls in `sib.crl`, a `code is` + activity library with
// NO decision → `computeSplitPlan === "none"`. Pre-C1 its base Library kept the bare
// `<policyId>` id while its CodeSystem was already disambiguated
// (`<policyId>-sib-local`) — inconsistent + latently colliding. Option B C1 gives the
// `none` sibling's base Library the disambiguated unified identity.
const NONE_CODE_IS_SIBLING = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/none-code-is-sibling/main.crl",
);

describe("closureOrchestrator — a `none` cross-lib `code is` sibling's base Library is disambiguated (#198 C1)", () => {
  const BASE = "http://example.org/crl/none-sibling";
  // policyId = package name "none-sibling-fixture"; the sibling library "Sib" (slug
  // "sib") disambiguates to `<policyId>-sib`. Its base Library gets the unified
  // PascalCase identity `pascalCaseNameForId(none-sibling-fixture-sib)`.
  const SIB_BASE_LIB_ID = "NoneSiblingFixtureSib";
  const SIB_BASE_LIB_URL = `${BASE}/Library/${SIB_BASE_LIB_ID}`;
  const SIB_CS_URL = `${BASE}/CodeSystem/none-sibling-fixture-sib-local`;
  const BARE_LIB_URL = `${BASE}/Library/none-sibling-fixture`;

  it("emits the sibling's base Library at the DISAMBIGUATED unified identity (id==name==url-tail), never the bare `<policyId>`", () => {
    const result = emitFhirDefFromPath(NONE_CODE_IS_SIBLING, { clock: FIXED_CLOCK });
    expect(result.success).toBe(true);
    // No collision / dangling errors.
    for (const kind of [
      "closure-resource-collision",
      "closure-resource-url-collision",
      "unresolved-library-reference",
      "library-content-url-unresolved",
      "library-identity-disagreement",
    ]) {
      expect(result.errors.some((e) => e.kind === kind)).toBe(false);
    }

    // The sibling's base Library exists at the disambiguated id, with id==name==url-tail.
    const sibLib = result.resources.find(
      (r) => r.resourceType === "Library" && (r.resource as { id?: string }).id === SIB_BASE_LIB_ID,
    );
    expect(sibLib).toBeDefined();
    const res = sibLib!.resource as { id: string; name: string; url: string; content?: Array<{ url?: string }> };
    expect(res.id).toBe(SIB_BASE_LIB_ID);
    expect(res.name).toBe(SIB_BASE_LIB_ID);
    expect(res.url).toBe(SIB_BASE_LIB_URL);
    // Its content still points at the source-named CQL file (unchanged: `Sib.cql`).
    expect(res.content?.[0]?.url).toBe("../../cql/Sib.cql");

    // The bare `<policyId>` Library id is NEVER emitted (the pre-C1 collision surface).
    expect(
      result.resources.some(
        (r) => r.resourceType === "Library" && (r.resource as { url?: string }).url === BARE_LIB_URL,
      ),
    ).toBe(false);
  });

  it("the sibling's base Library depends-on ITS OWN disambiguated CodeSystem, and every reference to the base Library agrees", () => {
    const result = emitFhirDefFromPath(NONE_CODE_IS_SIBLING, { clock: FIXED_CLOCK });

    // (a) The base Library depends-on the disambiguated sibling CodeSystem.
    const sibLib = result.resources.find(
      (r) => r.resourceType === "Library" && (r.resource as { id?: string }).id === SIB_BASE_LIB_ID,
    )!;
    const deps = ((sibLib.resource as { relatedArtifact?: Array<{ resource?: string }> }).relatedArtifact ?? []).map(
      (a) => a.resource,
    );
    expect(deps).toContain(SIB_CS_URL);

    // (b) The sibling's ActivityDefinition + Recommendation PlanDefinition `library[]`
    // both reference the DISAMBIGUATED base Library url (referent-agreement) — pre-C1
    // they pointed at the bare `<policyId>` url.
    const ad = result.resources.find(
      (r) => r.resourceType === "ActivityDefinition" && r.sourceName === "Approve",
    )!;
    expect((ad.resource as { library?: string[] }).library).toEqual([SIB_BASE_LIB_URL]);
    const rec = result.resources.find(
      (r) => r.resourceType === "PlanDefinition" && r.sourceKind === "Recommendation" && r.sourceName === "Approve",
    )!;
    expect((rec.resource as { library?: string[] }).library).toEqual([SIB_BASE_LIB_URL]);
  });
});

/* ─── #196 — cross-library ACTIVITY resolution at FHIR emit ──────────── */

describe("closureOrchestrator — cross-library activity recommend (#196)", () => {
  // The canonical recommendation URL the resolver must produce for Shared's
  // `Shared Deny` activity: `<canonicalBase>/PlanDefinition/<policyId>-shared-deny-recommendation`.
  // `recommendationIdForLib` is POLICY-id-scoped (package name = policy id), so the
  // referrer (Root's decision) and the target library's own Recommendation emit
  // land on byte-identical URLs.
  const EXPECTED_SHARED_DENY_REC_URL =
    "http://example.org/crl/cross-lib-activity/PlanDefinition/cross-lib-activity-fixture-shared-deny-recommendation";

  function collectCanonicals(actions: Array<Record<string, unknown>>): string[] {
    const out: string[] = [];
    for (const a of actions) {
      if (typeof a.definitionCanonical === "string") out.push(a.definitionCanonical);
      if (Array.isArray(a.action)) {
        out.push(...collectCanonicals(a.action as Array<Record<string, unknown>>));
      }
    }
    return out;
  }

  it("a decision's cross-library `recommend activity \"Shared\".\"Shared Deny\"` resolves to Shared's Recommendation PD — no unresolved/cascade error", () => {
    const result = emitFhirDefFromPath(CROSS_LIB_ACTIVITY_ROOT, { clock: FIXED_CLOCK });

    // (0) The cross-boundary ref is RESOLVED: pre-#196 it surfaced as an
    // `unresolved-activity` UnmatchedReference which then cascaded the decision to
    // `decision-cascade-suppressed`. Both must now be absent.
    expect(result.unmatched.some((u) => u.kind === "unresolved-activity")).toBe(false);
    expect(result.errors.some((e) => e.kind === "decision-cascade-suppressed")).toBe(false);
    expect(result.errors.some((e) => e.kind === "unresolved-definition-target")).toBe(false);
    // The whole two-library emit succeeds. The fixture carries NO `include "Shared"`
    // (the cross-lib `recommend` pulls Shared into both closures on its own), so
    // there must be NO `redundant-local-include` import warning either — de-masking
    // the pre-#196 crutch that told authors to add the very include they'd be warned
    // to delete.
    expect(
      result.importDiagnostics.some((d) => d.kind === "redundant-local-include"),
    ).toBe(false);
    expect(result.success).toBe(true);

    // (1) Shared's ActivityDefinition IS in the emitted closure (the target of the
    // cross-library recommend).
    const sharedAd = result.resources.find(
      (r) => r.resourceType === "ActivityDefinition" && r.sourceName === "Shared Deny",
    );
    expect(sharedAd).toBeDefined();

    // (2) Shared's Recommendation PlanDefinition IS emitted, at the expected
    // policy-id-scoped canonical URL.
    const sharedRec = result.resources.find(
      (r) => r.resourceType === "PlanDefinition" && r.sourceKind === "Recommendation" && r.sourceName === "Shared Deny",
    );
    expect(sharedRec).toBeDefined();
    expect((sharedRec!.resource as { url?: string }).url).toBe(EXPECTED_SHARED_DENY_REC_URL);

    // (3) Root's Decision PlanDefinition emitted (NOT suppressed) and its
    // action.definitionCanonical points ACROSS the boundary at Shared's
    // Recommendation PD URL.
    const decisionPd = result.resources.find(
      (r) => r.resourceType === "PlanDefinition" && r.sourceKind === "Decision" && r.sourceName === "Triage Crohns",
    );
    expect(decisionPd).toBeDefined();
    const actions = (decisionPd!.resource as { action?: Array<Record<string, unknown>> }).action ?? [];
    const canonicals = collectCanonicals(actions);
    expect(canonicals).toContain(EXPECTED_SHARED_DENY_REC_URL);
    // And it byte-equals the URL the TARGET library's own Recommendation PD carries
    // (the cross-boundary agreement the resolver guarantees).
    expect(canonicals).toContain((sharedRec!.resource as { url?: string }).url);

    // (4) Inv 3 sees that definitionCanonical resolve to an emitted resource — no
    // dangling definition-target across the library boundary.
    const emittedUrls = new Set(
      result.resources
        .map((r) => (r.resource as { url?: string }).url)
        .filter((u): u is string => typeof u === "string"),
    );
    expect(emittedUrls.has(EXPECTED_SHARED_DENY_REC_URL)).toBe(true);

    // (5) #186 follow-up — Shared is an ACTIVITIES-ONLY library (only `activity`
    // blocks → its CQL would be a defines-free shell). Consumed by exactly one
    // decision library (Root), its empty CQL + hollow Library are SUPPRESSED; instead
    // its AD + recommendation PD REBIND onto the consumer's Interface Library. This
    // SUPERSEDES the #196 approach of emitting an empty Shared.cql to satisfy a
    // dangling Library — there is no longer a Shared Library to dangle. Proof:
    //   - NO `Shared` FHIR Library is emitted;
    //   - Shared's AD + recommendation PD `library[]` point at Root's Interface Library
    //     (read off the emitted resource, not a hardcoded URL — the bind target must be
    //     an ACTUALLY-emitted Library); and
    //   - Inv 4 still does not fire (no Library referencing a missing Shared.cql).
    const sharedLib = result.resources.find(
      (r) => r.resourceType === "Library" && (r.resource as { title?: string }).title === "Shared",
    );
    expect(sharedLib).toBeUndefined();
    const rootInterfaceLib = result.resources.find(
      (r) => r.resourceType === "Library" && ((r.resource as { name?: string }).name ?? "").endsWith("Interface"),
    );
    expect(rootInterfaceLib).toBeDefined();
    const rootInterfaceUrl = (rootInterfaceLib!.resource as { url?: string }).url;
    expect((sharedAd!.resource as { library?: string[] }).library).toEqual([rootInterfaceUrl]);
    expect((sharedRec!.resource as { library?: string[] }).library).toEqual([rootInterfaceUrl]);
    expect(result.errors.some((e) => e.kind === "library-content-url-unresolved")).toBe(false);
  });

  it("de-mask (#186 suppression): Shared is an activities-only lib consumed by ONE decision lib — its empty CQL is SUPPRESSED (absent from the manifest) and a rebind is recorded", () => {
    // Direct proof at the CQL lane (the SINGLE source of the suppression decision):
    // `emitCQLImports` drops Shared from `cqlByLibrary` (no empty shell CQL) and
    // records the rebind the FHIR lane consumes verbatim. Under #196 this asserted
    // Shared WAS in the manifest (to back a dangling Library); #186 removes both.
    const cql = emitCQLImports(CROSS_LIB_ACTIVITY_ROOT);
    expect(cql.success).toBe(true);
    expect(cql.cqlByLibrary.some((e) => e.libraryName === "Shared")).toBe(false);
    expect(cql.suppressedActivityBindings).toEqual([
      { suppressedLibraryName: "Shared", consumerLibraryName: "Root" },
    ]);
  });

  it("NEGATIVE (#186 fallback): a STANDALONE activities-only library (no decision sibling) is NOT suppressed — keeps its own CQL + FHIR Library, self-bound", () => {
    // Suppression requires a decision-bearing ROOT to rebind onto. When the emit entry
    // IS the activities-only library (no decision root), the pre-#186 behavior is
    // preserved: it keeps its own (defines-free) CQL + a FHIR Library, and its
    // ActivityDefinition binds to that own Library — an activities-only library used
    // alone still needs a policy-scoped `library[]` scope for its inline dynamicValues.
    const cql = emitCQLImports(ACTIVITIES_ONLY_STANDALONE);
    expect(cql.success).toBe(true);
    expect(cql.suppressedActivityBindings).toEqual([]);
    expect(cql.cqlByLibrary.some((e) => e.libraryName === "Dispositions")).toBe(true);

    const result = emitFhirDefFromPath(ACTIVITIES_ONLY_STANDALONE, { clock: FIXED_CLOCK });
    expect(result.success).toBe(true);
    const ownLib = result.resources.find(
      (r) => r.resourceType === "Library" && (r.resource as { title?: string }).title === "Dispositions",
    );
    expect(ownLib).toBeDefined();
    const denyAd = result.resources.find(
      (r) => r.resourceType === "ActivityDefinition" && r.sourceName === "Deny",
    );
    expect(denyAd).toBeDefined();
    expect((denyAd!.resource as { library?: string[] }).library).toEqual([
      (ownLib!.resource as { url?: string }).url,
    ]);
  });

  it("#201 chained/multi-decision: an activities-only lib recommended by the root AND a delegated sub-decision binds to the ROOT decision's Interface", () => {
    // The #201 repro shape: Main (the entry/root) recommends "Shared" AND delegates via
    // `use decision` to Other, which ALSO recommends "Shared" — two recommender
    // libraries. Suppression keys on the ROOT decision (not a recommender count), so
    // Shared is suppressed and its AD binds to the SAME Interface the root decision PD
    // uses (Main's), NOT the delegated Other's. A regression to the old exactly-one-
    // decision gate would leave Shared un-suppressed (the original #201 bug).
    const cql = emitCQLImports(ACTIVITIES_ONLY_TWO_DECISIONS);
    expect(cql.success).toBe(true);
    expect(cql.suppressedActivityBindings).toEqual([
      { suppressedLibraryName: "Shared", consumerLibraryName: "Main" },
    ]);
    expect(cql.cqlByLibrary.some((e) => e.libraryName === "Shared")).toBe(false);

    const result = emitFhirDefFromPath(ACTIVITIES_ONLY_TWO_DECISIONS, { clock: FIXED_CLOCK });
    expect(result.success).toBe(true);
    expect(
      result.resources.some(
        (r) => r.resourceType === "Library" && (r.resource as { title?: string }).title === "Shared",
      ),
    ).toBe(false);
    // The shared Deny AD binds to the ROOT (Main) decision's Interface — the same
    // library[] the root decision PlanDefinition resolves to.
    const mainDecisionPd = result.resources.find(
      (r) => r.resourceType === "PlanDefinition" && r.sourceKind === "Decision" && r.sourceName === "Main Decision",
    );
    expect(mainDecisionPd).toBeDefined();
    const rootInterface = (mainDecisionPd!.resource as { library?: string[] }).library;
    const denyAd = result.resources.find(
      (r) => r.resourceType === "ActivityDefinition" && r.sourceName === "Deny",
    );
    expect(denyAd).toBeDefined();
    expect((denyAd!.resource as { library?: string[] }).library).toEqual(rootInterface);
  });

  it("#201 graph-root (sub-only recommender): Shared is recommended ONLY by a delegated sub-decision, yet binds to the graph-root (Main) Interface", () => {
    // Main is the graph-root (zero incoming `use decision` edges) but never recommends
    // Shared — only the delegated Other does. Suppression keys on the graph root, so
    // Shared still rebinds onto Main's Interface (the same library[] the root decision PD
    // resolves to). A recommender-based rule would have bound it to Other instead.
    const cql = emitCQLImports(ACTIVITIES_ONLY_SUB_ONLY);
    expect(cql.success).toBe(true);
    expect(cql.suppressedActivityBindings).toEqual([
      { suppressedLibraryName: "Shared", consumerLibraryName: "Main" },
    ]);

    const result = emitFhirDefFromPath(ACTIVITIES_ONLY_SUB_ONLY, { clock: FIXED_CLOCK });
    expect(result.success).toBe(true);
    expect(
      result.resources.some(
        (r) => r.resourceType === "Library" && (r.resource as { title?: string }).title === "Shared",
      ),
    ).toBe(false);
    const mainDecisionPd = result.resources.find(
      (r) => r.resourceType === "PlanDefinition" && r.sourceKind === "Decision" && r.sourceName === "Main Decision",
    );
    expect(mainDecisionPd).toBeDefined();
    const denyAd = result.resources.find(
      (r) => r.resourceType === "ActivityDefinition" && r.sourceName === "Deny",
    );
    expect(denyAd).toBeDefined();
    expect((denyAd!.resource as { library?: string[] }).library).toEqual(
      (mainDecisionPd!.resource as { library?: string[] }).library,
    );
  });

  it("#186 suppression onto a NONE-KIND consumer: Shared rebinds to the consumer's name-keeping Root Library (suffixForSource fallback, no throw)", () => {
    // Critical (c) coverage: the sole consumer (Root) is none-kind (coded from, no
    // `code is`, so no Interface). suffixForSource falls through interface → name-
    // keeping-Root → binds the suppressed Shared AD onto Root's base Library. No throw
    // (the round-1 hazard was a bare `.find(interface)` deref), and the bind target is
    // an actually-emitted Library.
    const cql = emitCQLImports(ACTIVITIES_ONLY_NONEKIND_CONSUMER);
    expect(cql.success).toBe(true);
    expect(cql.suppressedActivityBindings).toEqual([
      { suppressedLibraryName: "Shared", consumerLibraryName: "Root" },
    ]);

    const result = emitFhirDefFromPath(ACTIVITIES_ONLY_NONEKIND_CONSUMER, { clock: FIXED_CLOCK });
    expect(result.success).toBe(true);
    expect(
      result.resources.some(
        (r) => r.resourceType === "Library" && (r.resource as { title?: string }).title === "Shared",
      ),
    ).toBe(false);
    // Root is none-kind → ONE name-keeping base Library (no Interface).
    const rootLib = result.resources.find(
      (r) => r.resourceType === "Library" && (r.resource as { name?: string }).name === "Root",
    );
    expect(rootLib).toBeDefined();
    const denyAd = result.resources.find(
      (r) => r.resourceType === "ActivityDefinition" && r.sourceName === "Deny",
    );
    expect(denyAd).toBeDefined();
    expect((denyAd!.resource as { library?: string[] }).library).toEqual([
      (rootLib!.resource as { url?: string }).url,
    ]);
  });

  it("NEGATIVE — a qualified `recommend activity \"Shared\".\"Nonexistent Activity\"` fails CLOSED (unresolved-activity, no silent resolve)", () => {
    // The Shared library resolves and enters the closure, but has no activity by
    // that name, so the activityResolver's `index.activities.get("Shared")?.has(...)`
    // guard misses and it returns null rather than fabricating a recommendation URL.
    const result = emitFhirDefFromPath(CROSS_LIB_ACTIVITY_MISSING, { clock: FIXED_CLOCK });

    // Fail-closed: the missing activity surfaces as an `unresolved-activity`
    // UnmatchedReference which cascades the decision to `decision-cascade-suppressed`.
    expect(result.unmatched.some((u) => u.kind === "unresolved-activity")).toBe(true);
    expect(result.errors.some((e) => e.kind === "decision-cascade-suppressed")).toBe(true);
    expect(result.success).toBe(false);

    // Non-fabrication guard: NO Recommendation PlanDefinition was minted for the
    // non-existent `Nonexistent Activity` (the resolver did not invent a URL).
    const fabricated = result.resources.some(
      (r) => r.resourceType === "PlanDefinition" && r.sourceName === "Nonexistent Activity",
    );
    expect(fabricated).toBe(false);
  });

  it("COLLISION — two libraries each defining an activity of the SAME name, both recommended → closure collision fires (policy-id-scoped uniqueness)", () => {
    // `recommendationIdForLib(metadata, "Deny")` is scoped to the POLICY id (not the
    // library name), so SharedA."Deny" and SharedB."Deny" both emit an
    // ActivityDefinition + Recommendation PlanDefinition at the SAME url/id. This
    // documents that whole-closure activity-name uniqueness is REQUIRED: the
    // duplicate must trip a closure collision invariant (Inv 0 url-collision / Inv 1
    // id/path-collision) and sink success — never silently pick a winner.
    const result = emitFhirDefFromPath(CROSS_LIB_ACTIVITY_COLLISION, { clock: FIXED_CLOCK });

    expect(result.success).toBe(false);
    const collisionKinds = new Set(result.errors.map((e) => e.kind));
    expect(
      collisionKinds.has("closure-resource-url-collision") ||
        collisionKinds.has("closure-resource-collision"),
    ).toBe(true);

    // HARDENING — the collision must specifically concern the duplicated `Deny`
    // activity's Recommendation PlanDefinition URL (the policy-id-scoped
    // `<base>/PlanDefinition/<policyId>-deny-recommendation` both libraries
    // collapse onto), NOT merely "some collision" elsewhere in the closure. Assert
    // a url-collision error whose message names that exact recommendation URL and
    // attributes it to the `Deny` recommendation from BOTH shared libraries.
    const DENY_REC_URL =
      "http://example.org/crl/cross-lib-activity-collision/PlanDefinition/cross-lib-activity-collision-fixture-deny-recommendation";
    const denyRecCollision = result.errors.find(
      (e) =>
        e.kind === "closure-resource-url-collision" &&
        e.message.includes(DENY_REC_URL),
    );
    expect(denyRecCollision).toBeDefined();
    // Both colliders are the `Deny` recommendation (the ONE duplicated name), so
    // the message names `Recommendation "Deny"` on both sides of the `vs`.
    expect(denyRecCollision!.message.match(/Recommendation "Deny"/g)?.length).toBe(2);

    // The duplicated `Deny` ActivityDefinition URL likewise collides.
    const DENY_AD_URL =
      "http://example.org/crl/cross-lib-activity-collision/ActivityDefinition/cross-lib-activity-collision-fixture-deny";
    expect(
      result.errors.some(
        (e) => e.kind === "closure-resource-url-collision" && e.message.includes(DENY_AD_URL),
      ),
    ).toBe(true);
  });
});

/* ─── #196 — cross-library USE DECISION resolution at FHIR emit ──────── */

describe("closureOrchestrator — cross-library use decision (#196)", () => {
  // Shared's `Sub Triage` decision emits a Decision PlanDefinition at this
  // policy-id-scoped canonical URL; Root's `use decision "Shared"."Sub Triage"`
  // must resolve to the byte-identical URL.
  const EXPECTED_SUB_TRIAGE_PD_URL =
    "http://example.org/crl/cross-lib-decision/PlanDefinition/cross-lib-decision-fixture-sub-triage";

  function collectCanonicals(actions: Array<Record<string, unknown>>): string[] {
    const out: string[] = [];
    for (const a of actions) {
      if (typeof a.definitionCanonical === "string") out.push(a.definitionCanonical);
      if (Array.isArray(a.action)) {
        out.push(...collectCanonicals(a.action as Array<Record<string, unknown>>));
      }
    }
    return out;
  }

  it("a decision's cross-library `use decision \"Shared\".\"Sub Triage\"` resolves to Shared's Decision PD — separate files, NO include, no dangle", () => {
    const result = emitFhirDefFromPath(CROSS_LIB_DECISION_ROOT, { clock: FIXED_CLOCK });

    // (0) The whole two-library emit succeeds with the cross-boundary delegation
    // resolved: no unresolved-decision, no cascade suppression, no dangling
    // definition-target across the library boundary.
    expect(result.unmatched.some((u) => u.kind === "unresolved-decision")).toBe(false);
    expect(result.errors.some((e) => e.kind === "decision-cascade-suppressed")).toBe(false);
    expect(result.errors.some((e) => e.kind === "unresolved-definition-target")).toBe(false);
    // The split-library guard must NOT fire — Root refs Shared via a DECISION edge,
    // not a concept ref, so there is no dangling CQL `"Shared"."X"` to guard.
    expect(
      result.errors.some((e) => e.kind === "emit-cross-library-ref-into-split-library"),
    ).toBe(false);
    // No `include "Shared"` in root.crl → NO `redundant-local-include` warning: the
    // cross-lib `use decision` pulls Shared into both closures on its own.
    expect(
      result.importDiagnostics.some((d) => d.kind === "redundant-local-include"),
    ).toBe(false);
    expect(result.success).toBe(true);

    // (1) Shared's Decision PlanDefinition IS emitted, at the policy-id-scoped URL.
    const subPd = result.resources.find(
      (r) =>
        r.resourceType === "PlanDefinition" &&
        r.sourceKind === "Decision" &&
        r.sourceName === "Sub Triage",
    );
    expect(subPd).toBeDefined();
    expect((subPd!.resource as { url?: string }).url).toBe(EXPECTED_SUB_TRIAGE_PD_URL);

    // (2) Root's Decision PlanDefinition emitted (NOT suppressed) and its
    // action.definitionCanonical points ACROSS the boundary at Shared's Decision PD.
    const rootPd = result.resources.find(
      (r) =>
        r.resourceType === "PlanDefinition" &&
        r.sourceKind === "Decision" &&
        r.sourceName === "Triage Crohns",
    );
    expect(rootPd).toBeDefined();
    const canonicals = collectCanonicals(
      (rootPd!.resource as { action?: Array<Record<string, unknown>> }).action ?? [],
    );
    expect(canonicals).toContain(EXPECTED_SUB_TRIAGE_PD_URL);
    // And it byte-equals the URL the target library's own Decision PD carries.
    expect(canonicals).toContain((subPd!.resource as { url?: string }).url);

    // (3) Inv 3 sees that definitionCanonical resolve to an emitted resource.
    const emittedUrls = new Set(
      result.resources
        .map((r) => (r.resource as { url?: string }).url)
        .filter((u): u is string => typeof u === "string"),
    );
    expect(emittedUrls.has(EXPECTED_SUB_TRIAGE_PD_URL)).toBe(true);

    // (4) THE CQL-CLOSURE FIX: the cross-lib `use decision` alone pulls Shared into
    // the CQL emit closure, so Shared's FHIR Library is emitted with a content url
    // pointing at Shared.cql AND Inv 4 does NOT fire (the content url resolves to an
    // emitted CQL manifest entry — pre-fix Shared was in the FHIR closure but not
    // the CQL manifest, dangling at `library-content-url-unresolved`).
    const sharedLib = result.resources.find(
      (r) => r.resourceType === "Library" && (r.resource as { title?: string }).title === "Shared",
    );
    expect(sharedLib).toBeDefined();
    const sharedContent = (sharedLib!.resource as { content?: Array<{ url?: string }> }).content;
    expect(sharedContent?.[0]?.url).toBe("../../cql/Shared.cql");
    expect(result.errors.some((e) => e.kind === "library-content-url-unresolved")).toBe(false);
  });

  it("de-mask (CQL closure): Shared's CQL is in the CQL manifest via the cross-lib `use decision` ALONE — no `include \"Shared\"`", () => {
    const cql = emitCQLImports(CROSS_LIB_DECISION_ROOT);
    expect(cql.success).toBe(true);
    expect(cql.cqlByLibrary.some((e) => e.libraryName === "Shared")).toBe(true);
  });

  it("BOUNDARY — cross-library `use decision` INTO an AUTO-SPLIT library resolves via the policy-id-scoped Decision PD (guard does NOT wrongly fire)", () => {
    // Shared is auto-split (`interface`: concept-level `code is` + a decision), so
    // its SOURCE name dissolves into policy-id-named layer libraries. The cross-lib
    // `use decision "Shared"."Sub Triage"` still resolves — the reference is a
    // policy-id-scoped Decision PlanDefinition canonical, independent of the
    // dissolved CQL library name. INVESTIGATION VERDICT: decision/activity edges
    // into a split library RESOLVE (they never emit as a literal CQL `"X"."Y"`), so
    // the split-library guard MUST NOT fire on them — only concept/terminology refs
    // (which `librariesReferencedBy` correctly walks) dangle across a split.
    const result = emitFhirDefFromPath(CROSS_LIB_DECISION_SPLIT_ROOT, { clock: FIXED_CLOCK });

    // The guard did NOT wrongly fire on the decision edge.
    expect(
      result.errors.some((e) => e.kind === "emit-cross-library-ref-into-split-library"),
    ).toBe(false);
    // Clean resolution: success, no unresolved/cascade/dangle.
    expect(result.unmatched.some((u) => u.kind === "unresolved-decision")).toBe(false);
    expect(result.errors.some((e) => e.kind === "decision-cascade-suppressed")).toBe(false);
    expect(result.errors.some((e) => e.kind === "unresolved-definition-target")).toBe(false);
    expect(result.errors.some((e) => e.kind === "library-content-url-unresolved")).toBe(false);
    expect(result.success).toBe(true);

    // THE CQL-LANE LANDMINE (an FHIR-only check misses it): the referrer's emitted CQL must NOT carry a dangling
    // `include Shared` for the cross-lib `use decision`. Shared dissolved into split layers, so `Shared` is not an
    // emitted CQL library — a decision/activity edge is FHIR-level and must not add a CQL `include` (the
    // per-library `include` walker excludes decision refs; only the emit CLOSURE walks them). Shared's CQL is
    // still emitted, as its split layers, so its FHIR Library resolves.
    const cqlImports = emitCQLImports(CROSS_LIB_DECISION_SPLIT_ROOT);
    expect(cqlImports.success).toBe(true);
    const rootCql = cqlImports.cqlByLibrary.find((e) => e.libraryName === "Root");
    expect(rootCql).toBeDefined();
    expect(rootCql!.cql).not.toContain("include Shared");
    expect(
      cqlImports.cqlByLibrary.some((e) => e.libraryName.startsWith("CrossLibDecisionSplitFixture")),
    ).toBe(true);

    const EXPECTED_SPLIT_SUB_PD_URL =
      "http://example.org/crl/cross-lib-decision-split/PlanDefinition/cross-lib-decision-split-fixture-sub-triage";

    // Shared IS split: its source-name CQL library `Shared` no longer exists — the
    // policy-id-named layer libraries do (proof the split actually happened).
    const layerLibs = result.resources.filter(
      (r) =>
        r.resourceType === "Library" &&
        typeof (r.resource as { name?: string }).name === "string" &&
        (r.resource as { name: string }).name.startsWith("CrossLibDecisionSplitFixture"),
    );
    expect(layerLibs.length).toBeGreaterThan(0);
    expect(
      result.resources.some(
        (r) => r.resourceType === "Library" && (r.resource as { title?: string }).title === "Shared",
      ),
    ).toBe(false);

    // The split library's `Sub Triage` decision still emits its Decision PD, and
    // Root's action.definitionCanonical points across the boundary at it.
    const subPd = result.resources.find(
      (r) =>
        r.resourceType === "PlanDefinition" &&
        r.sourceKind === "Decision" &&
        r.sourceName === "Sub Triage",
    );
    expect(subPd).toBeDefined();
    expect((subPd!.resource as { url?: string }).url).toBe(EXPECTED_SPLIT_SUB_PD_URL);

    const rootPd = result.resources.find(
      (r) =>
        r.resourceType === "PlanDefinition" &&
        r.sourceKind === "Decision" &&
        r.sourceName === "Triage Crohns",
    );
    expect(rootPd).toBeDefined();
    const canonicals = collectCanonicals(
      (rootPd!.resource as { action?: Array<Record<string, unknown>> }).action ?? [],
    );
    expect(canonicals).toContain(EXPECTED_SPLIT_SUB_PD_URL);
  });
});

describe("applyUrlUniquenessInvariant — Inv 0 (T3)", () => {
  function res(url: string, relativePath: string): EmittedResource {
    return {
      resourceType: "CodeSystem",
      relativePath,
      resource: { resourceType: "CodeSystem", url },
      sourceKind: "LocalCodeSystem",
      sourceName: relativePath,
    };
  }

  it("two resources sharing a url but with DISTINCT relativePaths → closure-resource-url-collision (Inv 1 won't catch this)", () => {
    const errors = applyUrlUniquenessInvariant([
      res("http://example.org/crl/x/CodeSystem/shared-local", "CodeSystem/a.json"),
      res("http://example.org/crl/x/CodeSystem/shared-local", "CodeSystem/b.json"),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("closure-resource-url-collision");
    expect(errors[0]!.message).toContain("shared-local");
  });

  it("distinct urls → no error", () => {
    const errors = applyUrlUniquenessInvariant([
      res("http://example.org/crl/x/CodeSystem/a-local", "CodeSystem/a.json"),
      res("http://example.org/crl/x/CodeSystem/b-local", "CodeSystem/b.json"),
    ]);
    expect(errors).toEqual([]);
  });
});

describe("closureOrchestrator — truncation id-collision boundary (T4)", () => {
  // Mirror codeSystem.ts' id derivation: capSlugForSuffix(slugify(name), "-local").
  const idFor = (name: string): string => capSlugForSuffix(slugify(name), "-local");

  it("two library names differing only past the slug cap collide on the capped CodeSystem id", () => {
    // capSlugForSuffix caps the base to 64 - len("-local") = 58 chars, so two
    // names that diverge only after ~58 slug chars produce the SAME capped id.
    const prefix = "a".repeat(60);
    expect(idFor(prefix + "xxxxx")).toBe(idFor(prefix + "yyyyy"));
  });

  it("CodeSystems whose ids collide share a relativePath → Inv 1 closure-resource-collision", () => {
    const prefix = "a".repeat(60);
    const id = idFor(prefix + "xxxxx");
    const relativePath = `CodeSystem/${id}.json`;
    const make = (sourceName: string): EmittedResource => ({
      resourceType: "CodeSystem",
      relativePath,
      resource: { resourceType: "CodeSystem", url: `http://example.org/x/${sourceName}` },
      sourceKind: "LocalCodeSystem",
      sourceName,
    });
    const inv1 = applyInvariant1([make("LibA"), make("LibB")]);
    // both colliders dropped
    expect(inv1.surviving).toHaveLength(0);
    expect(inv1.errors).toHaveLength(1);
    expect(inv1.errors[0]!.kind).toBe("closure-resource-collision");
  });
});

/* ─── Inv 5 — action-input-profile referential integrity (DTR `input`) ─ */

describe("applyActionInputProfileInvariant — Inv 5", () => {
  const SD_URL = "http://example.org/x/StructureDefinition/foo-casefeature";

  function planDefWithInput(profile: string, nested = false): EmittedResource {
    const input = [{ type: "Observation", profile: [profile] }];
    const action = nested
      ? [{ title: "outer", action: [{ title: "inner", input }] }]
      : [{ title: "outer", input }];
    return {
      resourceType: "PlanDefinition",
      relativePath: "PlanDefinition/triage.json",
      resource: {
        resourceType: "PlanDefinition",
        url: "http://example.org/x/PlanDefinition/triage",
        action,
      },
      sourceKind: "Decision",
      sourceName: "Triage",
    };
  }

  function sd(url: string): EmittedResource {
    return {
      resourceType: "StructureDefinition",
      relativePath: "StructureDefinition/foo.json",
      resource: { resourceType: "StructureDefinition", url },
      sourceKind: "CaseFeature",
      sourceName: "Foo",
    };
  }

  it("an input profile that resolves to an emitted StructureDefinition → no error", () => {
    const errors = applyActionInputProfileInvariant(
      [planDefWithInput(SD_URL), sd(SD_URL)],
      new Set(),
    );
    expect(errors).toEqual([]);
  });

  it("an input profile pointing at a NON-emitted SD → unresolved-action-input-profile", () => {
    const errors = applyActionInputProfileInvariant([planDefWithInput(SD_URL)], new Set());
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("unresolved-action-input-profile");
  });

  it("an input profile whose url IS emitted but is NOT a StructureDefinition → still fires (SD-specific)", () => {
    // A PlanDefinition exists at the same url, but an input profile MUST address a
    // StructureDefinition specifically — confirm the non-SD url does not satisfy it.
    const planDef = planDefWithInput("http://example.org/x/PlanDefinition/triage");
    const errors = applyActionInputProfileInvariant([planDef], new Set());
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("unresolved-action-input-profile");
  });

  it("walks NESTED action inputs too", () => {
    const errors = applyActionInputProfileInvariant([planDefWithInput(SD_URL, true)], new Set());
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("unresolved-action-input-profile");
  });

  it("an input profile pointing at an Inv-1-DROPPED SD is flagged with the downstream-collision annotation", () => {
    // Simulate the SD having been dropped by Inv 1: it is absent from the surviving
    // set but its relativePath is in droppedPaths.
    const errors = applyActionInputProfileInvariant(
      [planDefWithInput(SD_URL)],
      new Set(["StructureDefinition/foo-casefeature.json"]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("unresolved-action-input-profile");
    expect(errors[0]!.message).toContain("downstream of collision");
  });
});

/* ─── Inv 6 — Library identity agreement (#186) ──────────────────────────── */

describe("applyLibraryIdentityInvariant (Inv 6 — #186 identity agreement)", () => {
  const BASE = "http://example.org/crl/pol";
  const METADATA = { canonicalBase: BASE } as CpgMetadata;

  const lib = (id: string, name: string, url: string): EmittedResource => ({
    resourceType: "Library",
    relativePath: `Library/${id}.json`,
    resource: { resourceType: "Library", id, name, url },
    sourceKind: "Library",
    sourceName: id,
  });
  const S = "PolInterface";
  const goodLib = lib(S, S, `${BASE}/Library/${S}`);

  const planDefWithLibrary = (libUrl: string): EmittedResource => ({
    resourceType: "PlanDefinition",
    relativePath: "PlanDefinition/pol-cover.json",
    resource: { resourceType: "PlanDefinition", id: "pol-cover", library: [libUrl] },
    sourceKind: "Decision",
    sourceName: "Cover",
  });
  const libWithDependsOn = (id: string, depUrl: string): EmittedResource => ({
    resourceType: "Library",
    relativePath: `Library/${id}.json`,
    resource: {
      resourceType: "Library",
      id,
      name: id,
      url: `${BASE}/Library/${id}`,
      relatedArtifact: [{ type: "depends-on", resource: depUrl }],
    },
    sourceKind: "Library",
    sourceName: id,
  });
  const sdWithFeatureExpr = (refUrl: string): EmittedResource => ({
    resourceType: "StructureDefinition",
    relativePath: "StructureDefinition/pol-cf.json",
    resource: {
      resourceType: "StructureDefinition",
      id: "pol-cf",
      extension: [
        { url: CPG_FEATURE_EXPRESSION_EXT, valueExpression: { reference: refUrl } },
      ],
    },
    sourceKind: "StructureDefinition",
    sourceName: "pol-cf",
  });

  it("(a) a layered Library whose id != name → identity-disagreement error", () => {
    // id=S but name drifted (e.g. a regressed emitter reverting to pascalCaseName(slug)).
    const bad = lib(S, "PolInterfaceDrift", `${BASE}/Library/${S}`);
    const errors = applyLibraryIdentityInvariant([bad], METADATA, new Set([S]));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("library-identity-disagreement");
    expect(errors[0]!.message).toContain("disagreeing identifiers");
  });

  it("(a') a layered Library whose url-tail != id/name → identity-disagreement error", () => {
    const bad = lib(S, S, `${BASE}/Library/pol-interface`); // url-tail drifted
    const errors = applyLibraryIdentityInvariant([bad], METADATA, new Set([S]));
    expect(errors.some((e) => e.kind === "library-identity-disagreement")).toBe(true);
  });

  it("(b) a library[] referent whose url-tail != the target layered Library.name → error", () => {
    // The layered Library self-agrees (id==name==tail==S); the PlanDefinition
    // points at it by url, but its Library.name would NOT equal the url-tail if a
    // mismatch existed. Build the mismatch directly: a target Library whose name
    // drifts from its url-tail, referenced by a PlanDefinition.
    const driftedTarget = lib(S, "PolInterfaceDrift", `${BASE}/Library/${S}`);
    const errors = applyLibraryIdentityInvariant(
      [driftedTarget, planDefWithLibrary(`${BASE}/Library/${S}`)],
      METADATA,
      new Set([S]),
    );
    // Both the self-check (a) AND the referent-check (b) fire on the drift.
    expect(errors.filter((e) => e.kind === "library-identity-disagreement").length).toBeGreaterThanOrEqual(2);
    expect(errors.some((e) => /library\[\]/.test(e.message ?? ""))).toBe(true);
  });

  it("(b') a depends-on referent to a drifted layered Library → error", () => {
    const driftedTarget = lib(S, "Drift", `${BASE}/Library/${S}`);
    const referrer = libWithDependsOn("PolInferred", `${BASE}/Library/${S}`);
    const errors = applyLibraryIdentityInvariant(
      [driftedTarget, referrer],
      METADATA,
      new Set([S, "PolInferred"]),
    );
    expect(errors.some((e) => /depends-on/.test(e.message ?? ""))).toBe(true);
  });

  it("(b'') a featureExpression referent to a drifted layered Library → error", () => {
    const driftedTarget = lib(S, "Drift", `${BASE}/Library/${S}`);
    const errors = applyLibraryIdentityInvariant(
      [driftedTarget, sdWithFeatureExpr(`${BASE}/Library/${S}`)],
      METADATA,
      new Set([S]),
    );
    expect(errors.some((e) => /featureExpression/.test(e.message ?? ""))).toBe(true);
  });

  it("all-agreeing layered resources → NO error", () => {
    const errors = applyLibraryIdentityInvariant(
      [goodLib, planDefWithLibrary(`${BASE}/Library/${S}`)],
      METADATA,
      new Set([S]),
    );
    expect(errors).toEqual([]);
  });

  it("(c) empty layeredIdentities → no-op even on a drifted Library (the cms/Root exemption)", () => {
    const bad = lib("cms22", "Cms22Strategy", `${BASE}/Library/cms22`); // pre-existing cms drift
    const errors = applyLibraryIdentityInvariant([bad], METADATA, new Set());
    expect(errors).toEqual([]);
  });

  it("a Library NOT in layeredIdentities is exempt (non-layered Root name intentionally differs)", () => {
    const root = lib("cms22", "Cms22Strategy", `${BASE}/Library/cms22`);
    const errors = applyLibraryIdentityInvariant([root, goodLib], METADATA, new Set([S]));
    expect(errors).toEqual([]); // only S is enforced; the Root is skipped
  });
});
