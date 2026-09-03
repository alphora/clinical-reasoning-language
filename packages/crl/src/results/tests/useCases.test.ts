import { describe, it, expect } from "vitest";

import {
  RESULT_USE_CASES,
  USE_CASE_RESOURCE_TYPES,
  caseResultsDir,
  caseResultsTypeDir,
  compartmentIdOf,
  isResultUseCase,
  resultsRoot,
} from "../useCases";

/**
 * ⭐⭐ RESULTS ARE NOT CASE DATA, and the layout is what enforces it.
 *
 * CEL emits the FACTS a case states and owns `tests/data/fhir/patient/<compartmentId>/`. Results are what
 * an ENGINE produced over the emitted definitions — a different producer, inputs and lifecycle. They live
 * in their own tree, which is why no ownership marker, no selective pruning and no bundler-exclusion rule
 * is needed: nothing else writes there.
 */
describe("the results layout keeps engine output out of the case's data", () => {
  it("⭐ results never land under the CEL emitter's tree", () => {
    for (const uc of RESULT_USE_CASES) {
      expect(resultsRoot(uc).startsWith("tests/results/")).toBe(true);
      expect(resultsRoot(uc).startsWith("tests/data/")).toBe(false);
      expect(caseResultsDir(uc, "abc-123")).not.toContain("tests/data");
    }
  });

  it("⭐ a case joins its data and its results by ONE identity — the compartment id", () => {
    // The CEL emitter's `compartmentDir` carries a `patient/` prefix; results key on the bare id, so the
    // same case is addressable in both trees without a second identity to keep in sync.
    const compartmentDir = "patient/probe-cases-a-case-abc123def456";
    const id = compartmentIdOf(compartmentDir);
    expect(id).toBe("probe-cases-a-case-abc123def456");
    expect(caseResultsDir("prior-auth", id)).toBe(
      "tests/results/prior-auth/probe-cases-a-case-abc123def456",
    );
  });

  it("⭐ the layout scales to N use cases without a new convention each time", () => {
    expect(caseResultsTypeDir("prior-auth", "c1", "Questionnaire")).toBe(
      "tests/results/prior-auth/c1/questionnaire",
    );
    expect(caseResultsTypeDir("measure", "c1", "MeasureReport")).toBe(
      "tests/results/measure/c1/measurereport",
    );
  });

  it("⚠ the type segment is LOWERCASE, matching the CEL emitter's own convention", () => {
    const d = caseResultsTypeDir("prior-auth", "c1", "QuestionnaireResponse");
    expect(d.endsWith("/questionnaireresponse")).toBe(true);
  });

  it("⭐ each use case declares the resource types it may emit", () => {
    expect(USE_CASE_RESOURCE_TYPES["prior-auth"]).toContain("Questionnaire");
    expect(USE_CASE_RESOURCE_TYPES["prior-auth"]).toContain("QuestionnaireResponse");
    expect(USE_CASE_RESOURCE_TYPES.measure).toContain("MeasureReport");
    // A use case must not silently inherit another's types.
    expect(USE_CASE_RESOURCE_TYPES.measure).not.toContain("Questionnaire");
  });

  it("⭐ an unknown use case is rejected, not coerced", () => {
    expect(isResultUseCase("prior-auth")).toBe(true);
    expect(isResultUseCase("measure")).toBe(true);
    expect(isResultUseCase("cds")).toBe(false);
    expect(isResultUseCase("")).toBe(false);
  });
});
