import { describe, expect, it } from "@jest/globals";

import type { Activity, ActivityType } from "../../ast/types";
import { activityDefinitionCanonicalUrl } from "../activity";
import { libraryCanonicalUrl } from "../library";
import {
  emitRecommendationDefinition,
  emitRecommendationDefinitionsForLibrary,
  recommendationDefinitionCanonicalUrl,
} from "../recommendation";
import type { CpgMetadata } from "../types";

const LOC = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } as const;
const FIXED_CLOCK = () => new Date("2026-06-04T15:30:00.000Z");

const METADATA: CpgMetadata = {
  version: "1.0.0",
  name: "lib",
  title: "Lib",
  description: "Test library",
  publisher: "Smile Digital Health",
  contact: [],
  canonicalBase: "http://example.org/sdh/demo",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

function activity(name: string, activityType: ActivityType = "CPGServiceRequest" as ActivityType): Activity {
  return {
    type: "Activity",
    name,
    body: {
      type: "ActivityBody",
      request: { type: "ActivityRequest", activityType, location: LOC },
      location: LOC,
    },
    location: LOC,
  };
}

describe("recommendation — emitRecommendationDefinition", () => {
  it("emits a Recommendation PlanDef with the expected v3.2 shape", () => {
    const a = activity("Colonoscopy");
    const { resource, errors, unmatched } = emitRecommendationDefinition(a, "Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    expect(errors).toEqual([]);
    expect(unmatched).toEqual([]);
    expect(resource).not.toBeNull();
    const r = resource!.resource as Record<string, unknown>;
    expect(r.resourceType).toBe("PlanDefinition");
    expect(r.id).toBe("lib-colonoscopy-recommendation");
    expect((r.meta as { profile: string[] }).profile).toEqual([
      "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recommendationdefinition",
      "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-publishableplandefinition",
    ]);
    expect(r.url).toBe("http://example.org/sdh/demo/PlanDefinition/lib-colonoscopy-recommendation");
    expect(r.title).toBe("Colonoscopy");
    expect(r.description).toBe("Colonoscopy");
    expect((r.type as { coding: Array<{ system: string; code: string }> }).coding).toEqual([
      { system: "http://terminology.hl7.org/CodeSystem/plan-definition-type", code: "eca-rule" },
    ]);
  });

  it("emits 3 knowledgeCapability extensions (NOT executable) + structured level", () => {
    const { resource } = emitRecommendationDefinition(activity("X"), "Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    const r = resource!.resource as Record<string, unknown>;
    const extensions = r.extension as Array<{ url: string; valueCode: string }>;
    const capabilityCodes = extensions
      .filter((e) => e.url.endsWith("/cpg-knowledgeCapability"))
      .map((e) => e.valueCode);
    expect(capabilityCodes).toEqual(["shareable", "computable", "publishable"]);
    expect(capabilityCodes).not.toContain("executable");
    const levelExts = extensions.filter((e) => e.url.endsWith("/cpg-knowledgeRepresentationLevel"));
    expect(levelExts).toEqual([
      { url: "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-knowledgeRepresentationLevel", valueCode: "structured" },
    ]);
  });

  it("does NOT emit a `version` field (no-version rule)", () => {
    const { resource } = emitRecommendationDefinition(activity("X"), "Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.version).toBeUndefined();
  });

  it("wrapping action has groupingBehavior=logical-group + NO selectionBehavior + NO condition", () => {
    const { resource } = emitRecommendationDefinition(activity("X"), "Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    const r = resource!.resource as Record<string, unknown>;
    const actions = r.action as Array<Record<string, unknown>>;
    expect(actions).toHaveLength(1);
    const wrap = actions[0]!;
    expect(wrap.groupingBehavior).toBe("logical-group");
    expect(wrap.selectionBehavior).toBeUndefined();
    expect(wrap.condition).toBeUndefined();
    expect((wrap.type as { coding: Array<{ system: string; code: string }> }).coding).toEqual([
      { system: "http://terminology.hl7.org/CodeSystem/action-type", code: "create" },
    ]);
    expect((wrap.code as Array<{ coding: Array<{ system: string; code: string }> }>)[0]!.coding).toEqual([
      { system: "http://hl7.org/fhir/uv/cpg/CodeSystem/cpg-common-process-cs", code: "guideline-based-care" },
    ]);
  });

  it("definitionCanonical byte-equals activityDefinitionCanonicalUrl (cross-Todo invariant)", () => {
    const { resource } = emitRecommendationDefinition(activity("X"), "Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    const r = resource!.resource as Record<string, unknown>;
    const wrap = (r.action as Array<Record<string, unknown>>)[0]!;
    expect(wrap.definitionCanonical).toBe(activityDefinitionCanonicalUrl(METADATA.canonicalBase, "Lib", "X"));
  });

  it("library[] byte-equals libraryCanonicalUrl", () => {
    const { resource } = emitRecommendationDefinition(activity("X"), "Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    const r = resource!.resource as Record<string, unknown>;
    expect((r.library as string[])[0]).toBe(libraryCanonicalUrl(METADATA.canonicalBase, "Lib"));
  });

  it("recommendationDefinitionCanonicalUrl byte-equals emitted url", () => {
    const { resource } = emitRecommendationDefinition(activity("X"), "Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.url).toBe(recommendationDefinitionCanonicalUrl(METADATA.canonicalBase, "Lib", "X"));
  });

  it("slug rule: pre-cap base then append `-recommendation`; id ≤ 64", () => {
    const longLib = "a".repeat(40);
    const longAct = "b".repeat(40);
    const { resource } = emitRecommendationDefinition(activity(longAct), longLib, METADATA, {
      clock: FIXED_CLOCK,
    });
    const r = resource!.resource as Record<string, unknown>;
    expect((r.id as string).length).toBeLessThanOrEqual(64);
    expect((r.id as string).endsWith("-recommendation")).toBe(true);
  });

  it("boundary: when base + suffix would exceed 64, base is truncated to leave room for full suffix", () => {
    // base = 40 + 1 + 40 = 81 chars after slugify
    // PRECAP_LEN = 64 - 15 = 49
    // Truncated base = 49 chars (or less after trailing-hyphen trim)
    // Combined id = 49 + 15 = 64 chars max
    const baseLib = "x".repeat(40);
    const baseAct = "y".repeat(40);
    const { resource } = emitRecommendationDefinition(activity(baseAct), baseLib, METADATA, {
      clock: FIXED_CLOCK,
    });
    const r = resource!.resource as Record<string, unknown>;
    const id = r.id as string;
    expect(id.endsWith("-recommendation")).toBe(true);
    expect(id.length).toBeLessThanOrEqual(64);
  });

  it("non-ASCII activity name emits non-ascii-slug-fallback warning", () => {
    const { errors } = emitRecommendationDefinition(activity("高血圧"), "Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    expect(errors.some((e) => e.kind === "non-ascii-slug-fallback")).toBe(true);
  });

  it("invariant: url has no double-slash between base and PlanDefinition", () => {
    const m: CpgMetadata = { ...METADATA, canonicalBase: "http://example.org/base" };
    const { resource } = emitRecommendationDefinition(activity("X"), "Lib", m, { clock: FIXED_CLOCK });
    const r = resource!.resource as Record<string, unknown>;
    expect((r.url as string).indexOf("//PlanDefinition/")).toBe(-1);
  });

  it("invariant: name conforms to FHIR name regex", () => {
    const { resource } = emitRecommendationDefinition(activity("X"), "123 Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    const r = resource!.resource as Record<string, unknown>;
    expect(r.name).toMatch(/^[A-Z][A-Za-z0-9_]{0,254}$/);
  });
});

describe("recommendation — emitRecommendationDefinitionsForLibrary", () => {
  it("emits one Recommendation per activity when names are distinct", () => {
    const acts = [activity("A"), activity("B"), activity("C")];
    const { resources, errors } = emitRecommendationDefinitionsForLibrary(acts, "Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    expect(errors).toEqual([]);
    expect(resources).toHaveLength(3);
  });

  it("detects intra-Recommendation slug collision and skips both colliders", () => {
    const acts = [activity("Foo Bar"), activity("foo bar")];
    const { resources, errors } = emitRecommendationDefinitionsForLibrary(acts, "Lib", METADATA, {
      clock: FIXED_CLOCK,
    });
    expect(errors.some((e) => e.kind === "slug-collision")).toBe(true);
    expect(resources).toHaveLength(0);
  });
});
