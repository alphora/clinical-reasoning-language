import * as path from "path";

import { describe, expect, it } from "vitest";

import {
  applyInvariant1,
  applyInvariant2,
  emitFhirDefFromPath,
} from "../closureOrchestrator";
import {
  caseFeatureCanonicalUrl,
  caseFeatureId,
  emitCaseFeatureStructureDefinition,
} from "../structureDefinition";
import { CPG_FEATURE_EXPRESSION_EXT } from "../types";
import type { CpgMetadata, EmittedResource } from "../types";

/**
 * Case-feature StructureDefinition emit — eligibility boundary + diagnostics.
 *
 * The example FHIR goldens pin the byte-for-byte happy paths (a `code is` decision
 * concept → exactly one StructureDefinition; the recursive `defined as` closure
 * reaching a `code is` leaf). These tests pin the REMAINING boundary cases that
 * have no golden. Under the LOCALSOURCE-ALWAYS-BOOLEAN rule, every `code is`
 * concept (regardless of declared value type) is a boolean Observation
 * case-feature, so there is NO value-type gate and NO `emit-casefeature-non-boolean`
 * diagnostic:
 *   - an INFERRED decision condition reaches its `code is` leaf through the
 *     recursive collection (one SD for the leaf),
 *   - a NON-boolean `code is` decision concept STILL gets a boolean SD,
 *   - the `emit-casefeature-missing-code` defensive guard (F1) hard-errors when a
 *     DIRECT caller passes an empty/undefined code rather than emitting an
 *     empty-code patternCodeableConcept (unreachable from the orchestrated path),
 *   - capped-id collisions are caught by Inv 1,
 *   - a dangling `cpg-featureExpression` reference is caught by Inv 2,
 *   - an empty LocalSource-library suffix fails fast rather than emitting a
 *     root-pointing reference.
 */

const HERE = __dirname;
const FIXED = { date: new Date("2020-01-01T00:00:00.000Z") };

const METADATA: CpgMetadata = {
  version: "1.0.0",
  name: "casefeature-fixture",
  title: "Case Feature Fixture",
  description: "PACKAGE-level description (must NOT leak onto a per-concept profile)",
  publisher: "unknown",
  contact: [],
  canonicalBase: "http://example.org/crl/casefeature",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

/* ─── End-to-end eligibility boundary (real CRL closures) ──────────────── */

describe("case-feature emit — eligibility boundary (end-to-end)", () => {
  it("a LocalSource boolean decision concept → exactly one StructureDefinition (id/url/system/code)", () => {
    const fixture = path.join(HERE, "fixtures", "code-is-decision", "code-is-decision.crl");
    const result = emitFhirDefFromPath(fixture, FIXED);
    expect(result.success).toBe(true);

    const sds = result.resources.filter((r) => r.resourceType === "StructureDefinition");
    expect(sds).toHaveLength(1);
    const sd = sds[0]!.resource as Record<string, unknown>;
    expect(sd.id).toBe("code-is-decision-fixture-active-crohns-disease");
    expect(sd.url).toBe(
      "http://example.org/crl/code-is-decision/StructureDefinition/code-is-decision-fixture-active-crohns-disease",
    );

    // patternCodeableConcept system byte-equals the local CodeSystem url; code is
    // the lowered local code.
    const diff = sd.differential as { element: Array<Record<string, unknown>> };
    const codeEl = diff.element.find((e) => e.id === "Observation.code")!;
    const coding = (codeEl.patternCodeableConcept as { coding: Array<Record<string, unknown>> }).coding[0]!;
    expect(coding.system).toBe(
      "http://example.org/crl/code-is-decision/CodeSystem/code-is-decision-fixture-local",
    );
    expect(coding.code).toBe("active-crohns-disease");
  });

  it("an INFERRED decision condition (`defined as`) → its recursive `code is` leaf gets a StructureDefinition", () => {
    // condition "Derived" = `defined as "Base"`; "Base" is a LocalSource boolean
    // `code is` concept. The recursive collection reaches "Base" THROUGH the
    // inference, so exactly ONE SD (Base) is emitted — the deliverable's recursive
    // case-feature behavior (previously this skipped, emitting ZERO).
    const fixture = path.join(HERE, "fixtures", "casefeature-inferred", "casefeature-inferred.crl");
    const result = emitFhirDefFromPath(fixture, FIXED);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    const sds = result.resources.filter((r) => r.resourceType === "StructureDefinition");
    expect(sds).toHaveLength(1);
    expect((sds[0]!.resource as { id: string }).id).toBe("casefeature-inferred-fixture-base");
  });

  it("a NON-boolean `code is` decision concept STILL gets a boolean SD (LocalSource-always-boolean rule)", () => {
    // "Coded Determination" is a `code is` concept whose declared value type is
    // CodeableConcept — but the locked rule is that EVERY `code is` concept is a
    // boolean Observation case-feature regardless of declared value type. So it
    // emits exactly ONE SD (value[x] boolean), success stays true, and NO
    // `emit-casefeature-non-boolean` diagnostic fires (that kind was removed).
    const fixture = path.join(HERE, "fixtures", "casefeature-non-boolean", "casefeature-non-boolean.crl");
    const result = emitFhirDefFromPath(fixture, FIXED);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.errors.some((e) => e.kind === "emit-casefeature-non-boolean")).toBe(false);
    const sds = result.resources.filter((r) => r.resourceType === "StructureDefinition");
    expect(sds).toHaveLength(1);
    const sd = sds[0]!.resource as { differential: { element: Array<Record<string, unknown>> } };
    const valueEl = sd.differential.element.find((e) => e.id === "Observation.value[x]")!;
    expect(valueEl.type).toEqual([{ code: "boolean" }]);
  });

  it("two overlength divergent `code is` leaves → distinct hashed SD ids/urls that byte-equal their recursive action.input profiles (truncation-collision regression)", () => {
    // Regression for uniqueCapSlug (design review gpt55 Gi2): pre-fix both concepts'
    // composites bare-truncated to the SAME 64-char id → closure-resource-collision →
    // emit hard-failed. Assert the FULL closure path: distinct hashed SD urls, no
    // unresolved-action-input-profile, and each action.input.profile byte-equals its SD url.
    const fixture = path.join(HERE, "fixtures", "casefeature-truncation", "casefeature-truncation.crl");
    const result = emitFhirDefFromPath(fixture, FIXED);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);

    const sds = result.resources.filter((r) => r.resourceType === "StructureDefinition");
    expect(sds).toHaveLength(2);
    const sdUrls = sds.map((r) => (r.resource as { url: string }).url);
    const sdIds = sds.map((r) => (r.resource as { id: string }).id);
    // Distinct + each is a valid <=64 FHIR id ending in a 12-hex hash suffix.
    expect(new Set(sdUrls).size).toBe(2);
    for (const id of sdIds) {
      expect(id.length).toBeLessThanOrEqual(64);
      expect(id).toMatch(/-[0-9a-f]{12}$/);
    }

    // Every case-feature action.input.profile resolves to an emitted SD url, byte-equal.
    // Inputs sit on the when-action (any depth), so walk all PlanDefinition action trees.
    type Action = { input?: Array<{ profile?: string[] }>; action?: Action[] };
    const inputProfiles: string[] = [];
    const walk = (actions: Action[] | undefined): void => {
      for (const a of actions ?? []) {
        for (const i of a.input ?? []) inputProfiles.push(...(i.profile ?? []));
        walk(a.action);
      }
    };
    for (const r of result.resources.filter((r) => r.resourceType === "PlanDefinition")) {
      walk((r.resource as { action?: Action[] }).action);
    }
    expect(inputProfiles).toHaveLength(2);
    expect(new Set(inputProfiles)).toEqual(new Set(sdUrls));
    expect(result.errors.some((e) => e.kind === "unresolved-action-input-profile")).toBe(false);
  });
});

/* ─── Direct emit unit — happy path + empty-suffix fail-fast ───────────── */

describe("emitCaseFeatureStructureDefinition — direct unit", () => {
  it("emits the expected id/url/system/code/reference for a boolean concept", () => {
    const { resource, errors } = emitCaseFeatureStructureDefinition(
      "Adult Patient",
      "adult-18-or-older",
      METADATA,
      FIXED,
      "CasefeatureFixtureLocalSource",
    );
    expect(errors).toEqual([]);
    const r = resource!.resource as Record<string, unknown>;
    expect(r.id).toBe(caseFeatureId(METADATA, "Adult Patient"));
    expect(r.url).toBe(caseFeatureCanonicalUrl(METADATA, "Adult Patient"));
    // F4 — per-concept description, NOT the package blurb.
    expect(r.description).toBe("Adult Patient case feature determination");
    expect(r.description).not.toBe(METADATA.description);

    // The featureExpression references the LocalSource library (where the `code is`
    // define lives), NOT the Interface re-export.
    const fe = (r.extension as Array<Record<string, unknown>>).find(
      (e) => e.url === CPG_FEATURE_EXPRESSION_EXT,
    )!;
    expect((fe.valueExpression as { reference: string }).reference).toBe(
      "http://example.org/crl/casefeature/Library/CasefeatureFixtureLocalSource",
    );
  });

  it("an empty featureExpression-library suffix throws (a root-pointing reference must never be emitted silently)", () => {
    expect(() =>
      emitCaseFeatureStructureDefinition("Adult Patient", "adult-18-or-older", METADATA, FIXED, ""),
    ).toThrow(/empty featureExpressionLibrarySuffix/);
  });

  // F1 (impl-review) — defensive missing-code guard. Unreachable from the
  // orchestrated recursive-collection path (the collector only appends concepts
  // that HAVE a lowered local code), but a DIRECT caller passing an empty/
  // undefined code must hard-error with `emit-casefeature-missing-code` rather
  // than emit a malformed empty-code patternCodeableConcept.
  it("an empty code raises emit-casefeature-missing-code and emits no resource", () => {
    const { resource, errors } = emitCaseFeatureStructureDefinition(
      "Adult Patient",
      "",
      METADATA,
      FIXED,
      "CasefeatureFixtureLocalSource",
    );
    expect(resource).toBeNull();
    expect(errors.some((e) => e.kind === "emit-casefeature-missing-code")).toBe(true);
  });

  it("an undefined code raises emit-casefeature-missing-code and emits no resource", () => {
    const { resource, errors } = emitCaseFeatureStructureDefinition(
      "Adult Patient",
      undefined as unknown as string,
      METADATA,
      FIXED,
      "CasefeatureFixtureLocalSource",
    );
    expect(resource).toBeNull();
    expect(errors.some((e) => e.kind === "emit-casefeature-missing-code")).toBe(true);
  });
});

/* ─── Truncation-collision safety + the Inv 1 backstop ─────────────────── */

describe("case-feature emit — truncation-collision safety", () => {
  function sd(conceptName: string): EmittedResource {
    const id = caseFeatureId(METADATA, conceptName);
    return {
      resourceType: "StructureDefinition",
      relativePath: `StructureDefinition/${id}.json`,
      resource: { resourceType: "StructureDefinition", id, url: caseFeatureCanonicalUrl(METADATA, conceptName) },
      sourceKind: "CaseFeature",
      sourceName: conceptName,
    };
  }

  it("two long concepts differing only PAST the 64-char cap get DISTINCT ids + survive Inv 1", () => {
    // Pre-fix these two capped to the SAME id (the discriminating word — Alpha/Beta
    // — sits past the truncation boundary); uniqueCapSlug now hash-disambiguates.
    const longA = "Adult Patient With A Very Long Determination Name That Exceeds The Cap Alpha";
    const longB = "Adult Patient With A Very Long Determination Name That Exceeds The Cap Beta";
    const idA = caseFeatureId(METADATA, longA);
    const idB = caseFeatureId(METADATA, longB);
    // The whole point: distinct concepts → distinct ids AND distinct urls.
    expect(idA).not.toBe(idB);
    expect(caseFeatureCanonicalUrl(METADATA, longA)).not.toBe(caseFeatureCanonicalUrl(METADATA, longB));
    // Both still fit the FHIR id 64-char limit and end on the hash (no trailing hyphen).
    expect(idA.length).toBeLessThanOrEqual(64);
    expect(idB.length).toBeLessThanOrEqual(64);
    expect(idA.endsWith("-")).toBe(false);
    // No relativePath collision → Inv 1 emits both, no error.
    const inv1 = applyInvariant1([sd(longA), sd(longB)]);
    expect(inv1.errors).toHaveLength(0);
    expect(inv1.surviving.filter((r) => r.resourceType === "StructureDefinition")).toHaveLength(2);
  });

  it("the same concept name emits a stable id across calls (pure, order-independent)", () => {
    const name = "Adult Patient With A Very Long Determination Name That Exceeds The Cap Gamma";
    expect(caseFeatureId(METADATA, name)).toBe(caseFeatureId(METADATA, name));
  });

  // The Inv 1 backstop still guards the atomic-refuse path — and uniqueCapSlug
  // does NOT make caseFeatureId collision-proof: two DISTINCT names that already
  // slug to the same <=64 `raw` (lossy-NORMALIZATION, e.g. `"A/B"` vs `"AB"` — the
  // `/` is stripped) never reach the >64 hash branch, so they still derive the
  // SAME id. This is the exact class uniqueCapSlug deliberately leaves to Inv 1.
  // Drive the collision through the REAL caseFeatureId via `sd()` (design review
  // gpt55 Gi3/Gi5) — NOT a hand-built relativePath — so the test proves the actual
  // derivation path collides AND the backstop catches it.
  it("two concepts that lossy-normalize to the same id → closure-resource-collision, both dropped (backstop)", () => {
    // Precondition: the two DISTINCT names derive the SAME id through caseFeatureId.
    expect(caseFeatureId(METADATA, "A/B")).toBe(caseFeatureId(METADATA, "AB"));

    const inv1 = applyInvariant1([sd("A/B"), sd("AB")]);
    expect(inv1.errors.some((e) => e.kind === "closure-resource-collision")).toBe(true);
    expect(inv1.surviving.filter((r) => r.resourceType === "StructureDefinition")).toHaveLength(0);
  });
});

/* ─── Inv 2(c) — dangling cpg-featureExpression reference ──────────────── */

describe("case-feature emit — dangling featureExpression reference is caught by Inv 2", () => {
  function sdWithRef(reference: string): EmittedResource {
    return {
      resourceType: "StructureDefinition",
      relativePath: "StructureDefinition/x-casefeature.json",
      resource: {
        resourceType: "StructureDefinition",
        id: "x-casefeature",
        url: `${METADATA.canonicalBase}/StructureDefinition/x-casefeature`,
        extension: [{ url: CPG_FEATURE_EXPRESSION_EXT, valueExpression: { reference } }],
      },
      sourceKind: "CaseFeature",
      sourceName: "X",
    };
  }

  it("a featureExpression reference to a non-emitted Library → unresolved-feature-expression-reference", () => {
    const dangling = `${METADATA.canonicalBase}/Library/casefeature-fixture-interface`;
    const errors = applyInvariant2([sdWithRef(dangling)], new Set(), METADATA);
    expect(errors.some((e) => e.kind === "unresolved-feature-expression-reference")).toBe(true);
  });

  it("a featureExpression reference to an emitted Library → no error", () => {
    const target = `${METADATA.canonicalBase}/Library/casefeature-fixture-interface`;
    const lib: EmittedResource = {
      resourceType: "Library",
      relativePath: "Library/casefeature-fixture-interface.json",
      resource: { resourceType: "Library", id: "casefeature-fixture-interface", url: target },
      sourceKind: "Library",
      sourceName: "Interface",
    };
    const errors = applyInvariant2([sdWithRef(target), lib], new Set(), METADATA);
    expect(errors.some((e) => e.kind === "unresolved-feature-expression-reference")).toBe(false);
  });
});
