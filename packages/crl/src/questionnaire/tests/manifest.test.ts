import { describe, it, expect } from "vitest";

import {
  caseState,
  producerManifestName,
  resolveCaseArtifacts,
  type ProducerManifest,
} from "../manifest";
import { questionnaireArtifactId, isProducerOwnedId } from "../../index";

const M = (cases: ProducerManifest["cases"]): ProducerManifest => ({
  schemaVersion: 1,
  celLibrary: "Probe Cases",
  generatedAt: "2026-01-01T00:00:00.000Z",
  provenance: { crlVersion: "0.0.0-test" },
  cases,
});

describe("the manifest is the binding authority, not the directory", () => {
  it("⭐ binds ONLY a generated case", () => {
    const dir = "patient/abc-123";
    const m = M([
      {
        caseName: "a case",
        compartmentDir: dir,
        state: "generated",
        artifacts: [
          {
            id: questionnaireArtifactId("Probe Cases", "a case", "questionnaire"),
            path: `${dir}/questionnaire/x.json`,
            sha256: "0".repeat(64),
            resourceType: "Questionnaire",
          },
        ],
      },
    ]);
    const bound = resolveCaseArtifacts(m, dir);
    expect(bound?.caseName).toBe("a case");
    expect(bound?.artifacts?.every((a) => isProducerOwnedId(a.id))).toBe(true);
  });

  it("⚠ a legitimately question-less case is SUCCESS with a state, not a silent absence", () => {
    // The distinction a glob structurally cannot make: "the policy asked nothing" vs "the producer
    // failed" vs "the producer never ran". All three look like an empty directory on disk.
    const dir = "patient/none-1";
    const m = M([
      {
        caseName: "no questions",
        compartmentDir: dir,
        state: "no-questionnaire",
        reason: "no-applicable-case-feature-inputs",
      },
    ]);
    expect(resolveCaseArtifacts(m, dir)).toBeUndefined();
    expect(caseState(m, dir)).toBe("no-questionnaire");
  });

  it("⚠ `populate-degraded` is distinguishable from `failed` — the repeats debt must not read as broken", () => {
    const dir = "patient/recency-1";
    const m = M([
      {
        caseName: "a later answer overrides an earlier one",
        compartmentDir: dir,
        state: "populate-degraded",
        expectedDisposition: "not-certify.Unmet",
        actualDisposition: "not-certify.Unmet",
        reason: "populate: multiple values for a non repeating group",
      },
    ]);
    expect(caseState(m, dir)).toBe("populate-degraded");
    // The disposition was still CORRECT — that is the whole point of the separate state.
    const e = m.cases[0];
    expect(e.actualDisposition).toBe(e.expectedDisposition);
  });

  it("⚠ `not-run` is expressible — a batch killed on timeout must not look like ineligible", () => {
    const m = M([
      { caseName: "hung", compartmentDir: "patient/h", state: "timeout", reason: "batch wall timeout" },
      { caseName: "after", compartmentDir: "patient/a", state: "not-run", reason: "batch died at 'hung'" },
    ]);
    expect(caseState(m, "patient/a")).toBe("not-run");
  });

  it("⭐ an unknown compartment is `not-in-manifest`, never an empty success", () => {
    expect(caseState(M([]), "patient/never")).toBe("not-in-manifest");
    expect(caseState(undefined, "patient/never")).toBe("not-in-manifest");
  });

  it("⭐ the manifest is PER CEL LIBRARY — one shared file would lose other libraries' ownership", () => {
    expect(producerManifestName("probe-cases")).toBe("questionnaire-manifest-probe-cases.json");
    expect(producerManifestName("other-cases")).not.toBe(producerManifestName("probe-cases"));
  });
});
