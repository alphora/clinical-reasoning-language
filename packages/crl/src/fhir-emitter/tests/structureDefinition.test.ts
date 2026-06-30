import * as path from "path";

import { afterEach, describe, expect, it, jest } from "@jest/globals";

import {
  applyInvariant1,
  applyInvariant2,
  emitFhirDefClosure,
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
 * Case-feature StructureDefinition emit — eligibility boundary + diagnostics
 * (F3 of the impl-review fixes).
 *
 * The golden tests (`partial-split-fhir-golden`, `partial-split-author-vs-golden`)
 * pin the byte-for-byte happy paths (a LocalSource boolean decision concept →
 * exactly one StructureDefinition; a RecordSource concept skipped). These tests
 * pin the REMAINING boundary cases that have no golden:
 *   - an Inferred decision-surface concept is silently skipped,
 *   - a LocalSource NON-boolean decision concept fires `emit-casefeature-non-boolean`
 *     and sinks success,
 *   - the `emit-casefeature-missing-code` contradiction guard never emits an
 *     empty `code` (constructed-input, the can't-happen branch),
 *   - capped-id collisions are caught by Inv 1,
 *   - a dangling `cpg-featureExpression` reference is caught by Inv 2,
 *   - an empty interface-library suffix fails fast rather than emitting a
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
    expect(sd.id).toBe("code-is-decision-fixture-active-crohns-disease-casefeature");
    expect(sd.url).toBe(
      "http://example.org/crl/code-is-decision/StructureDefinition/code-is-decision-fixture-active-crohns-disease-casefeature",
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

  it("an Inferred decision-surface concept → silently skipped (no StructureDefinition, success stays true)", () => {
    const fixture = path.join(HERE, "fixtures", "casefeature-inferred", "casefeature-inferred.crl");
    const result = emitFhirDefFromPath(fixture, FIXED);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.resources.filter((r) => r.resourceType === "StructureDefinition")).toHaveLength(0);
  });

  it("a LocalSource NON-boolean decision concept → emit-casefeature-non-boolean + success false", () => {
    const fixture = path.join(HERE, "fixtures", "casefeature-non-boolean", "casefeature-non-boolean.crl");
    const result = emitFhirDefFromPath(fixture, FIXED);
    expect(result.success).toBe(false);
    const nonBool = result.errors.filter((e) => e.kind === "emit-casefeature-non-boolean");
    expect(nonBool).toHaveLength(1);
    expect(nonBool[0]!.message).toContain("CodeableConcept");
    // No profile emitted for the ineligible concept.
    expect(result.resources.filter((r) => r.resourceType === "StructureDefinition")).toHaveLength(0);
  });
});

/* ─── emit-casefeature-missing-code contradiction guard (constructed) ──── */

describe("case-feature emit — emit-casefeature-missing-code contradiction guard", () => {
  afterEach(() => jest.restoreAllMocks());

  it("a LocalSource surface concept absent from lowered.localCodes → emit-casefeature-missing-code, no empty-code profile", () => {
    const { resolveImports } = require("../../imports/index") as typeof import("../../imports/index");
    const { emitCQLImports } = require("../../imports/emit") as typeof import("../../imports/emit");
    const lowerMod = require("../../cql-emitter/lowerLocalCodes") as typeof import("../../cql-emitter/lowerLocalCodes");

    const fixture = path.join(HERE, "fixtures", "code-is-decision", "code-is-decision.crl");
    const graph = resolveImports(fixture);
    const cql = emitCQLImports(fixture);
    expect(cql.success).toBe(true);

    // Force the can't-happen contradiction: lowering succeeds (AST lowered to
    // LocalSource as normal) but its localCodes list DROPS the surface concept's
    // entry, so the orchestrator's codeByConcept has no code for a LocalSource
    // boolean surface concept. The guard must surface emit-casefeature-missing-code
    // rather than emit a profile with an empty `code`.
    const real = lowerMod.lowerLocalCodes;
    jest.spyOn(lowerMod, "lowerLocalCodes").mockImplementation((...args) => {
      const out = real(...(args as Parameters<typeof real>));
      return { ...out, localCodes: out.localCodes.filter((lc) => lc.concept !== "Active Crohns Disease") };
    });

    const result = emitFhirDefClosure(graph, METADATA, FIXED, cql.cqlByLibrary);
    const missing = result.errors.filter((e) => e.kind === "emit-casefeature-missing-code");
    expect(missing).toHaveLength(1);
    expect(missing[0]!.message).toContain("Active Crohns Disease");
    expect(result.success).toBe(false);
    // No case-feature profile with an empty code slipped through.
    expect(result.resources.filter((r) => r.resourceType === "StructureDefinition")).toHaveLength(0);
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
      "interface",
    );
    expect(errors).toEqual([]);
    const r = resource!.resource as Record<string, unknown>;
    expect(r.id).toBe(caseFeatureId(METADATA, "Adult Patient"));
    expect(r.url).toBe(caseFeatureCanonicalUrl(METADATA, "Adult Patient"));
    // F4 — per-concept description, NOT the package blurb.
    expect(r.description).toBe("Adult Patient case feature determination");
    expect(r.description).not.toBe(METADATA.description);

    const fe = (r.extension as Array<Record<string, unknown>>).find(
      (e) => e.url === CPG_FEATURE_EXPRESSION_EXT,
    )!;
    expect((fe.valueExpression as { reference: string }).reference).toBe(
      "http://example.org/crl/casefeature/Library/casefeature-fixture-interface",
    );
  });

  it("F1 — an empty interfaceLibrarySuffix throws (a root-pointing reference must never be emitted silently)", () => {
    expect(() =>
      emitCaseFeatureStructureDefinition("Adult Patient", "adult-18-or-older", METADATA, FIXED, ""),
    ).toThrow(/empty interfaceLibrarySuffix/);
  });
});

/* ─── Inv 1 — capped-id collision between two case-feature profiles ─────── */

describe("case-feature emit — capped-id collision is caught by Inv 1", () => {
  function sd(conceptName: string): EmittedResource {
    // Two distinct long concept names that cap to the SAME id under the
    // 64-char `-casefeature` cap → a relativePath collision Inv 1 must catch.
    const id = caseFeatureId(METADATA, conceptName);
    return {
      resourceType: "StructureDefinition",
      relativePath: `StructureDefinition/${id}.json`,
      resource: { resourceType: "StructureDefinition", id, url: caseFeatureCanonicalUrl(METADATA, conceptName) },
      sourceKind: "CaseFeature",
      sourceName: conceptName,
    };
  }

  it("two concepts whose capped ids collide → closure-resource-collision, both dropped", () => {
    const longA = "Adult Patient With A Very Long Determination Name That Exceeds The Cap Alpha";
    const longB = "Adult Patient With A Very Long Determination Name That Exceeds The Cap Beta";
    // Sanity: the two cap to the same id (the precondition for the collision).
    expect(caseFeatureId(METADATA, longA)).toBe(caseFeatureId(METADATA, longB));

    const inv1 = applyInvariant1([sd(longA), sd(longB)]);
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
