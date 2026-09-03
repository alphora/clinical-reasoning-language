import { describe, it, expect } from "vitest";

import {
  RESULT_USE_CASES,
  USE_CASE_RESOURCE_TYPES,
  caseResultsDir,
  caseResultsGlob,
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
      expect(resultsRoot().startsWith("tests/results/")).toBe(true);
      // The lane + compartment segments are what make this loadable as a repository, not decoration.
      expect(resultsRoot().endsWith("/fhir")).toBe(true);
      expect(caseResultsDir("abc-123")).toContain("/fhir/patient/");
      expect(resultsRoot().startsWith("tests/data/")).toBe(false);
      expect(caseResultsDir("abc-123")).not.toContain("tests/data");
    }
  });

  it("⭐ a case joins its data and its results by ONE identity — the compartment id", () => {
    // The CEL emitter's `compartmentDir` carries a `patient/` prefix; results key on the bare id, so the
    // same case is addressable in both trees without a second identity to keep in sync.
    const compartmentDir = "patient/probe-cases-a-case-abc123def456";
    const id = compartmentIdOf(compartmentDir);
    expect(id).toBe("probe-cases-a-case-abc123def456");
    expect(caseResultsDir(id)).toBe(
      "tests/results/fhir/patient/probe-cases-a-case-abc123def456",
    );
  });

  it("⭐ the RESOURCE TYPE discriminates the use case — no use-case path segment", () => {
    expect(caseResultsTypeDir("c1", "Questionnaire")).toBe(
      "tests/results/fhir/patient/c1/questionnaire",
    );
    expect(caseResultsTypeDir("c1", "MeasureReport")).toBe(
      "tests/results/fhir/patient/c1/measurereport",
    );
  });

  it("⚠ the type segment is LOWERCASE, matching the CEL emitter's own convention", () => {
    const d = caseResultsTypeDir("c1", "QuestionnaireResponse");
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

describe("the results glob and the producer's output path cannot drift", () => {
  it("⭐⭐ the CONSUMER's glob matches the PRODUCER's path for the same case", () => {
    // ⚠ THE GATE THAT WAS MISSING BEFORE. The MV pane hard-coded a path, the emitter's layout moved at
    // `0e7641da`, both sides kept compiling and the pane matched nothing for months. Relating the two
    // ends is the only formulation that catches it; asserting either one alone proves nothing.
    const id = "probe-cases-a-case-abc123def456";
    const glob = caseResultsGlob(id);
    for (const type of ["Questionnaire", "QuestionnaireResponse"]) {
      const produced = `${caseResultsTypeDir(id, type)}/some-id.json`;
      // The glob is `**/<dir>/{a,b}/*.json`; the produced path must sit under exactly that directory.
      const dir = caseResultsDir(id);
      expect(glob).toContain(dir);
      expect(produced.startsWith(`${dir}/`)).toBe(true);
      expect(glob).toContain(type.toLowerCase());
    }
  });

  it("⚠ the glob is anchored on the results tree, never the data tree", () => {
    const glob = caseResultsGlob("c1");
    expect(glob).toContain("tests/results/fhir/patient/");
    expect(glob).not.toContain("tests/data/");
  });
});
