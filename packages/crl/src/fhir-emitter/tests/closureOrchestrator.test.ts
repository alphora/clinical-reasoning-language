import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "@jest/globals";

import {
  applyActionInputProfileInvariant,
  applyInvariant1,
  applyUrlUniquenessInvariant,
  emitFhirDefClosure,
  emitFhirDefFromPath,
} from "../closureOrchestrator";
import { emitCQLImports } from "../../imports/emit";
import { localCodeSystemUrl } from "../../cql-emitter/lowerLocalCodes";
import { capSlugForSuffix, slugify } from "../slug";
import type { CpgMetadata, EmittedResource } from "../types";

const ROOT = join(__dirname, "..", "..", "..");
const FIXED_CLOCK = () => new Date("2026-06-05T15:30:00.000Z");

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

const FIXTURE = join(ROOT, "src/tests/fixtures/cpg-roundtrip/cc-screening-cognitive-support/cc-screening.crl");

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
    expect(byType.get("Library")).toBe(1);
    // 1 terminology = 1 ValueSet (after the v3.2 fixture extension)
    expect(byType.get("ValueSet")).toBe(1);
  });

  it("emits Library.content[0].attachment.url = `../../cql/<name>.cql` per plan v3.2 layout", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    const lib = result.resources.find((r) => r.resourceType === "Library");
    expect(lib).toBeDefined();
    const content = (lib!.resource as { content?: Array<{ url?: string }> }).content;
    expect(content?.[0]?.url).toBe(
      "../../cql/CRC Recommendation.cql",
    );
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
      expect((r.resource as Record<string, unknown>).version).toBe("0.0.0");
    }
  });

  it("Library.relatedArtifact[depends-on] includes the ValueSet canonical URL (Inv 2(b) coverage)", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    const lib = result.resources.find((r) => r.resourceType === "Library");
    const ra = (lib!.resource as { relatedArtifact?: Array<{ type?: string; resource?: string }> }).relatedArtifact;
    const dependsOnUrls = ra!.filter((e) => e.type === "depends-on").map((e) => e.resource);
    // The Coverage Concern VS canonical URL should be there
    expect(
      dependsOnUrls.some((u) => typeof u === "string" && u.includes("ValueSet/")),
    ).toBe(true);
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

const CODE_IS_BASIC = join(
  ROOT,
  "src/cql-emitter/tests/fixtures/code-is-basic/code-is-basic.crl",
);

// F4 — a decision-bearing fixture that `when`s on TWO eligible LocalSource-boolean
// concepts, so BOTH case-feature StructureDefinitions are emitted AND each
// when-action must carry the corresponding input.profile.
const CODE_IS_DECISION_TWO = join(
  ROOT,
  "src/fhir-emitter/tests/fixtures/code-is-decision-two/code-is-decision-two.crl",
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
    const libs = result.resources.filter((r) => r.resourceType === "Library");
    const byTitle = new Map(
      libs.map((l) => [(l.resource as { title?: string }).title, l.resource as Record<string, unknown>]),
    );
    // R2 — the Library title is the policy-id-based CQL library name.
    expect([...byTitle.keys()].sort()).toEqual([
      "code-is-basic-fixture-Inferred",
      "code-is-basic-fixture-LocalConcepts",
      "code-is-basic-fixture-LocalSource",
    ]);
    // Every content url resolves to its split CQL file (Inv 4 passes → no
    // library-content-url-unresolved error).
    for (const [title, res] of byTitle) {
      const content = (res as { content?: Array<{ url?: string }> }).content;
      expect(content?.[0]?.url).toBe(`../../cql/${title}.cql`);
    }
    expect(result.errors.some((e) => e.kind === "library-content-url-unresolved")).toBe(false);
    // The LocalSource layer depends-on the LocalConcepts layer it `include`s.
    const localSource = byTitle.get("code-is-basic-fixture-LocalSource")!;
    const localSourceDeps = ((localSource.relatedArtifact as Array<{ resource?: string }>) ?? []).map((e) => e.resource);
    expect(localSourceDeps).toContain(
      "http://example.org/crl/code-is-basic/Library/code-is-basic-fixture-localconcepts",
    );
    // R2: the LocalConcepts LAYER is `role:"concepts"` (Local family), so it owns
    // the local CodeSystem depends-on edge. The LocalSource/Inferred consuming
    // layers reach it transitively via their LocalConcepts-sibling dep above.
    const localConcepts = byTitle.get("code-is-basic-fixture-LocalConcepts")!;
    const localConceptsDeps = ((localConcepts.relatedArtifact as Array<{ resource?: string }>) ?? []).map((e) => e.resource);
    expect(localConceptsDeps).toContain(
      "http://example.org/crl/code-is-basic/CodeSystem/code-is-basic-fixture-local",
    );
  });

  it("byte-equality: the FHIR CodeSystem.url == the CQL `codesystem '<url>'` literal (anti-drift before slice A)", () => {
    // FHIR lane.
    const fhir = emitFhirDefFromPath(CODE_IS_BASIC, { clock: FIXED_CLOCK });
    const csUrl = (fhir.resources.find((r) => r.resourceType === "CodeSystem")!
      .resource as { url: string }).url;

    // The shared helper must agree with both lanes for the same library entry.
    // R1 — the local-domain slug is the fixture's POLICY ID (package name
    // "code-is-basic-fixture"), not the library name "Code Is Basic".
    expect(csUrl).toBe(localCodeSystemUrl("http://example.org/crl/code-is-basic", "code-is-basic-fixture"));

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
      resource: { resourceType: "PlanDefinition", url: "http://example.org/x/PlanDefinition/triage", action },
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
    const errors = applyActionInputProfileInvariant([planDefWithInput(SD_URL), sd(SD_URL)], new Set());
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
