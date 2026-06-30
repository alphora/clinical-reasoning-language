/**
 * Corpus integration probe — exercises the parse → emit pipeline against
 * real CRL fixtures (cms22-strategy + cms69-strategy). Validates that
 * real Activity AST shapes (with mixed `terminologyReference` / `free-text`
 * `with` cases, `do not perform` variant, `because` rationale, missing
 * `because` defaulting) all flow through emitActivityDefinition correctly.
 *
 * This is NOT a closure-walk probe — the closure-level resolver wiring
 * is a Todo 4 responsibility (CLI/MCP surface). This probe uses a
 * stub resolver that returns the bare terminology name.
 *
 * Per round-2 disposition (Claude sub-agent Q12 / gpt55 I4 / Gemini I4).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "@jest/globals";

import { buildCRL } from "../../index";
import type { Activity, Concept, Decision } from "../../ast/types";
import { emitActivityDefinition, type TerminologyResolver } from "../activity";
import { emitDecisionPlanDefinitionsForLibrary } from "../decision";
import { emitRecommendationDefinitionsForLibrary } from "../recommendation";
import type { CpgMetadata } from "../types";

const ROOT = join(__dirname, "..", "..", "..");
const FIXED_CLOCK = () => new Date("2026-06-04T15:30:00.000Z");

const METADATA: CpgMetadata = {
  version: "1.0.0",
  name: "cms-corpus-probe",
  title: "CMS Corpus Probe",
  description: "Corpus integration probe metadata",
  publisher: "Smile Digital Health",
  contact: [],
  canonicalBase: "http://hl7.org/fhir/us/cqfmeasures/crl/probe",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

// Stub resolver — returns the bare term name as the CQL identifier.
const STUB_RESOLVER: TerminologyResolver = (ref) =>
  typeof ref === "string" ? ref : `${ref.libraryName}.${ref.name}`;

interface CorpusFixture {
  libraryName: string;
  activities: Activity[];
  decisions: Decision[];
  concepts: Concept[];
}

function loadCorpusFixture(relPath: string): CorpusFixture {
  const source = readFileSync(join(ROOT, relPath), "utf-8");
  const result = buildCRL(source);
  if (!result.success || !result.result) {
    throw new Error(`Failed to parse ${relPath}: ${JSON.stringify(result.errors)}`);
  }
  const ast = result.result;
  const activities = ast.statements.filter((s): s is Activity => s.type === "Activity");
  const decisions = ast.statements.filter((s): s is Decision => s.type === "Decision");
  const concepts = ast.statements.filter((s): s is Concept => s.type === "Concept");
  return { libraryName: ast.libraryName ?? "Unknown Library", activities, decisions, concepts };
}

function loadFixtureActivities(relPath: string): { libraryName: string; activities: Activity[] } {
  const source = readFileSync(join(ROOT, relPath), "utf-8");
  const result = buildCRL(source);
  if (!result.success || !result.result) {
    throw new Error(`Failed to parse ${relPath}: ${JSON.stringify(result.errors)}`);
  }
  const ast = result.result;
  const activities = ast.statements.filter((s): s is Activity => s.type === "Activity");
  return { libraryName: ast.libraryName ?? "Unknown Library", activities };
}

describe("corpus probe — cms22-strategy.crl", () => {
  it("emits every activity in cms22-strategy.crl with the expected diagnostic mix", () => {
    const { libraryName, activities } = loadFixtureActivities(
      "src/tests/fixtures/corpus/cms22/cms22-strategy.crl",
    );
    expect(activities.length).toBeGreaterThan(0);

    let resourceCount = 0;
    let unmatchedWithTextCount = 0;
    let unmatchedOther = 0;
    let doNotPerformCount = 0;
    let errors = 0;

    for (const a of activities) {
      const { resource, errors: errs, unmatched } = emitActivityDefinition(
        a,
        libraryName,
        METADATA,
        STUB_RESOLVER,
        { clock: FIXED_CLOCK },
      );
      if (resource) {
        resourceCount++;
        const r = resource.resource as Record<string, unknown>;
        if (r.doNotPerform === true) doNotPerformCount++;
      }
      for (const u of unmatched) {
        if (u.kind === "unsupported-with-text") unmatchedWithTextCount++;
        else unmatchedOther++;
      }
      errors += errs.length;
    }

    // Every activity in the corpus produces a resource (none are skipped).
    expect(resourceCount).toBe(activities.length);
    // No emitter errors expected for the clean corpus.
    expect(errors).toBe(0);
    // The "Contraindicated Antihypertensive" do-not-perform card was removed
    // when the contraindication moved to a per-action `unless` guard (the med
    // is simply not offered when contraindicated — see discussion 082), so the
    // strategy corpus no longer carries a do-not-perform activity.
    // TODO: restore do-not-perform emit coverage with a dedicated example in a
    // context where suppression is genuinely the recommendation.
    expect(doNotPerformCount).toBe(0);
    // Corpus has free-text `with` cases (CPGCommunicationRequest activities
    // "Confirm Continued Control" + "Document Provisional Hypertension").
    expect(unmatchedWithTextCount).toBeGreaterThanOrEqual(2);
    // No OTHER unmatched references in the clean post-`8295898` corpus.
    expect(unmatchedOther).toBe(0);
  });
});

describe("corpus probe — cms69-strategy.crl", () => {
  it("emits every activity in cms69-strategy.crl with the expected diagnostic mix", () => {
    const { libraryName, activities } = loadFixtureActivities(
      "src/tests/fixtures/corpus/cms69/cms69-strategy.crl",
    );
    expect(activities.length).toBeGreaterThan(0);

    let resourceCount = 0;
    let unmatchedWithTextCount = 0;
    let unmatchedOther = 0;
    let errors = 0;

    for (const a of activities) {
      const { resource, errors: errs, unmatched } = emitActivityDefinition(
        a,
        libraryName,
        METADATA,
        STUB_RESOLVER,
        { clock: FIXED_CLOCK },
      );
      if (resource) resourceCount++;
      for (const u of unmatched) {
        if (u.kind === "unsupported-with-text") unmatchedWithTextCount++;
        else unmatchedOther++;
      }
      errors += errs.length;
    }

    expect(resourceCount).toBe(activities.length);
    expect(errors).toBe(0);
    // Exact count (toBe, not toBeGreaterThanOrEqual): the cms69 strategy
    // is a semantic regression lock — a new free-text `with` is a
    // modeling change that should make this test fail loudly so the
    // operator decides whether to accept it. Contrast cms22 above, where
    // the floor-style assertion tolerates the corpus growing in shape.
    expect(unmatchedWithTextCount).toBe(1);
    expect(unmatchedOther).toBe(0);
  });
});

/* ─── Todo 3 corpus probes — Recommendation + Decision emit ─────── */

describe("corpus probe — cms22-strategy Recommendation + Decision emit", () => {
  it("emits one Recommendation PlanDef per activity + Strategy + Sub-decision PlanDefs", () => {
    const fixture = loadCorpusFixture(
      "src/tests/fixtures/corpus/cms22/cms22-strategy.crl",
    );

    // Recommendations: one per activity.
    const rec = emitRecommendationDefinitionsForLibrary(
      fixture.activities, fixture.libraryName, METADATA, { clock: FIXED_CLOCK },
    );
    expect(rec.errors).toEqual([]);
    expect(rec.unmatched).toEqual([]);
    expect(rec.resources.length).toBe(fixture.activities.length);
    for (const r of rec.resources) {
      expect((r.resource as { resourceType: string }).resourceType).toBe("PlanDefinition");
      const meta = (r.resource as { meta: { profile: string[] } }).meta;
      expect(meta.profile).toContain("http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recommendationdefinition");
    }

    // Decisions: 1 Strategy (root) + 1 Sub-decision per cms22.
    const dec = emitDecisionPlanDefinitionsForLibrary(
      fixture.decisions, fixture.activities, fixture.concepts, fixture.libraryName, METADATA, { clock: FIXED_CLOCK },
    );
    expect(dec.errors).toEqual([]);
    expect(dec.resources.length).toBe(fixture.decisions.length);

    const profiles = dec.resources.map((r) => (r.resource as { meta: { profile: string[] } }).meta.profile);
    const strategyCount = profiles.filter((p) => p.includes("http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition")).length;
    const subOnlyCount = profiles.filter((p) => !p.includes("http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition")).length;
    expect(strategyCount).toBe(1);
    expect(subOnlyCount).toBe(fixture.decisions.length - 1);
  });
});

describe("corpus probe — cms69-strategy Recommendation + Decision emit", () => {
  it("emits Recommendations + 1 Strategy + N-1 Sub-decisions for cms69", () => {
    const fixture = loadCorpusFixture(
      "src/tests/fixtures/corpus/cms69/cms69-strategy.crl",
    );

    const rec = emitRecommendationDefinitionsForLibrary(
      fixture.activities, fixture.libraryName, METADATA, { clock: FIXED_CLOCK },
    );
    expect(rec.errors).toEqual([]);
    expect(rec.resources.length).toBe(fixture.activities.length);

    const dec = emitDecisionPlanDefinitionsForLibrary(
      fixture.decisions, fixture.activities, fixture.concepts, fixture.libraryName, METADATA, { clock: FIXED_CLOCK },
    );
    expect(dec.errors).toEqual([]);
    expect(dec.resources.length).toBe(fixture.decisions.length);

    const strategyCount = dec.resources.filter((r) =>
      (r.resource as { meta: { profile: string[] } }).meta.profile.includes(
        "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition",
      ),
    ).length;
    expect(strategyCount).toBe(1);
  });
});
