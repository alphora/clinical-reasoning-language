/**
 * cc-screening cognitive-support round-trip test (per plan v3.2 §
 * ccScreeningRoundTrip.test.ts).
 *
 * Validates that the CRL fixture at
 * `src/tests/fixtures/cpg-roundtrip/cc-screening-cognitive-support/cc-screening.crl`
 * emits FHIR resources that match the expected reference shape in
 * `src/tests/fixtures/cpg-roundtrip/cc-screening-cognitive-support/expected-fhir/`
 * modulo the deliberate deviations documented in the fixture README:
 *   - no `version` field on emitted resources (project-wide rule);
 *   - no `executable` knowledgeCapability;
 *   - Drift A: Recommendation 1:1 vs example's 1:N — comparator
 *     checks resource count by profile type, NOT action content;
 *   - Drift B: Strategy emits 1 top-level action vs example's 2 —
 *     accepted because the example's no-recommendation target has
 *     an empty body (unparseable per CRL grammar);
 *   - Drift C: Input-wrapper actions absent — Homeostasis lane defers;
 *   - Drift D: library binding diverges — CRL emits one library per
 *     declaration.
 *
 * Round-trip comparator is LOOSE — verifies the high-level shape
 * (resource counts by profile, cross-resource canonical references
 * resolve, library binding consistency) rather than byte-equality.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCRL } from "../../index";
import type { Activity, Concept, Decision } from "../../ast/types";
import { emitDecisionPlanDefinitionsForLibrary } from "../decision";
import { emitRecommendationDefinitionsForLibrary } from "../recommendation";
import type { CpgMetadata } from "../types";

const ROOT = join(__dirname, "..", "..", "..");
const FIXTURE_DIR = join(ROOT, "src/tests/fixtures/cpg-roundtrip/cc-screening-cognitive-support");
const EXPECTED_FHIR = join(FIXTURE_DIR, "expected-fhir");
const FIXED_CLOCK = () => new Date("2026-06-04T15:30:00.000Z");

const METADATA: CpgMetadata = {
  version: "0.0.0",
  name: "cc-screening-cognitive-support",
  title: "CC Screening Cognitive Support",
  description: "Round-trip fixture",
  publisher: "Smile Digital Health",
  contact: [],
  canonicalBase: "http://example.org/sdh/demo",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

interface ExpectedSet {
  activityDefinitionCount: number;
  recommendationPlanDefCount: number;
  strategyPlanDefCount: number;
  subDecisionPlanDefCount: number;
  noRecommendationPlanDefCount: number;
}

function classifyExpectedFhir(): ExpectedSet {
  const planDefDir = join(EXPECTED_FHIR, "plandefinition");
  const planDefs = readdirSync(planDefDir).filter((f) => f.endsWith(".json"));
  let strategy = 0;
  let recommendation = 0;
  let noRec = 0;
  let subDecision = 0;
  for (const f of planDefs) {
    const r = JSON.parse(readFileSync(join(planDefDir, f), "utf-8"));
    const profiles: string[] = r.meta?.profile ?? [];
    if (profiles.some((p: string) => p.endsWith("/cpg-strategydefinition"))) strategy++;
    else if (profiles.some((p: string) => p.endsWith("/cpg-recommendationdefinition"))) recommendation++;
    else if (f.includes("no-recommendation")) noRec++;
    else subDecision++;
  }
  const actDir = join(EXPECTED_FHIR, "activitydefinition");
  const acts = readdirSync(actDir).filter((f) => f.endsWith(".json"));
  return {
    activityDefinitionCount: acts.length,
    recommendationPlanDefCount: recommendation,
    strategyPlanDefCount: strategy,
    subDecisionPlanDefCount: subDecision,
    noRecommendationPlanDefCount: noRec,
  };
}

interface ParsedCrl {
  libraryName: string;
  activities: Activity[];
  decisions: Decision[];
  concepts: Concept[];
}

function parseFixtureCrl(): ParsedCrl {
  const source = readFileSync(join(FIXTURE_DIR, "cc-screening.crl"), "utf-8");
  const result = buildCRL(source);
  if (!result.success || !result.result) {
    throw new Error(`Failed to parse cc-screening.crl: ${JSON.stringify(result.errors)}`);
  }
  const ast = result.result;
  return {
    libraryName: ast.libraryName ?? "Unknown",
    activities: ast.statements.filter((s): s is Activity => s.type === "Activity"),
    decisions: ast.statements.filter((s): s is Decision => s.type === "Decision"),
    concepts: ast.statements.filter((s): s is Concept => s.type === "Concept"),
  };
}

describe("cc-screening round-trip — emit vs expected (loose comparator)", () => {
  it("parses the fixture CRL cleanly", () => {
    const parsed = parseFixtureCrl();
    expect(parsed.activities.length).toBeGreaterThan(0);
    expect(parsed.decisions.length).toBeGreaterThan(0);
    expect(parsed.concepts.length).toBeGreaterThan(0);
  });

  it("emits exactly one Recommendation PlanDef per CRL activity (1:1 — Drift A)", () => {
    const parsed = parseFixtureCrl();
    const expected = classifyExpectedFhir();
    const { resources, errors, unmatched } = emitRecommendationDefinitionsForLibrary(
      parsed.activities, parsed.libraryName, METADATA, { clock: FIXED_CLOCK },
    );
    expect(errors).toEqual([]);
    expect(unmatched).toEqual([]);
    // CRL v0 1:1: 4 activities → 4 Recommendations.
    expect(resources.length).toBe(parsed.activities.length);
    // The example has MORE Recommendation-profile PlanDefs than CRL emits
    // because `cc-screening-no-recommendation-definition.json` ALSO claims
    // the cpg-recommendationdefinition profile (even though semantically
    // it's the "no recommendation applicable" sentinel for the Exclusion
    // branch). CRL v0 has no syntax for sentinel Recommendations, so this
    // example resource has no CRL counterpart. Drift A + B intersect here.
    expect(expected.recommendationPlanDefCount).toBeGreaterThanOrEqual(resources.length);
  });

  it("emits expected count of Strategy + Sub-decision PlanDefs", () => {
    const parsed = parseFixtureCrl();
    const expected = classifyExpectedFhir();
    const { resources, errors } = emitDecisionPlanDefinitionsForLibrary(
      parsed.decisions, parsed.activities, parsed.concepts, parsed.libraryName, METADATA, { clock: FIXED_CLOCK },
    );
    expect(errors).toEqual([]);
    const strategyCount = resources.filter((r) =>
      (r.resource as { meta: { profile: string[] } }).meta.profile.includes(
        "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition",
      ),
    ).length;
    const subCount = resources.length - strategyCount;
    expect(strategyCount).toBe(expected.strategyPlanDefCount);
    // Sub-decision count: example has decisiontree-definition (1).
    // CRL emits one sub-decision (`CRC Screening Decision`).
    expect(subCount).toBe(expected.subDecisionPlanDefCount);
  });

  it("every Decision's action.definitionCanonical resolves to either an emitted Recommendation or an emitted Sub-decision", () => {
    const parsed = parseFixtureCrl();
    const recResult = emitRecommendationDefinitionsForLibrary(
      parsed.activities, parsed.libraryName, METADATA, { clock: FIXED_CLOCK },
    );
    const decResult = emitDecisionPlanDefinitionsForLibrary(
      parsed.decisions, parsed.activities, parsed.concepts, parsed.libraryName, METADATA, { clock: FIXED_CLOCK },
    );
    const emittedUrls = new Set<string>([
      ...recResult.resources.map((r) => (r.resource as { url: string }).url),
      ...decResult.resources.map((r) => (r.resource as { url: string }).url),
    ]);

    function collectCanonicals(actions: Array<Record<string, unknown>>, out: string[]): void {
      for (const a of actions) {
        if (typeof a.definitionCanonical === "string") out.push(a.definitionCanonical);
        if (a.action) collectCanonicals(a.action as Array<Record<string, unknown>>, out);
      }
    }
    const refs: string[] = [];
    for (const r of decResult.resources) {
      collectCanonicals((r.resource as { action: Array<Record<string, unknown>> }).action, refs);
    }
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(emittedUrls.has(ref)).toBe(true);
    }
  });

  it("every emitted PlanDef carries `version` from package.json (CRMI shareable floor)", () => {
    const parsed = parseFixtureCrl();
    const rec = emitRecommendationDefinitionsForLibrary(
      parsed.activities, parsed.libraryName, METADATA, { clock: FIXED_CLOCK },
    );
    const dec = emitDecisionPlanDefinitionsForLibrary(
      parsed.decisions, parsed.activities, parsed.concepts, parsed.libraryName, METADATA, { clock: FIXED_CLOCK },
    );
    for (const r of [...rec.resources, ...dec.resources]) {
      expect((r.resource as Record<string, unknown>).version).toBe("0.0.0");
    }
  });
});
