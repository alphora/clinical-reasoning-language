import { describe, it, expect } from "vitest";

import {
  classify,
  extractResults,
  normalizePersistedPair,
  pairIsConsistent,
} from "../runProducer";

/** The real envelope shape an `$apply` run returns, reduced. */
const PARAMS = {
  resourceType: "Parameters",
  parameter: [
    {
      name: "return",
      resource: {
        resourceType: "Bundle",
        entry: [
          { resource: { resourceType: "RequestGroup", contained: [{ resourceType: "OperationOutcome" }] } },
          { resource: { resourceType: "Questionnaire", id: "q1", item: [] } },
          { resource: { resourceType: "QuestionnaireResponse", id: "qr1" } },
        ],
      },
    },
  ],
};

describe("extracting results from the engine envelope", () => {
  it("⭐ finds Q and QR nested under Parameters -> Bundle -> entry", () => {
    const r = extractResults(PARAMS);
    expect(r.questionnaire?.id).toBe("q1");
    expect(r.questionnaireResponse?.id).toBe("qr1");
  });

  it("⭐ also finds a CONTAINED Questionnaire — which form it takes is engine-version dependent", () => {
    const contained = {
      resourceType: "Parameters",
      parameter: [
        {
          name: "return",
          resource: {
            resourceType: "Bundle",
            entry: [
              { resource: { resourceType: "RequestGroup", contained: [{ resourceType: "Questionnaire", id: "qc" }] } },
            ],
          },
        },
      ],
    };
    expect(extractResults(contained).questionnaire?.id).toBe("qc");
  });
});

describe("every case gets exactly one terminal state", () => {
  const q = { questionnaire: { resourceType: "Questionnaire", id: "q" } };

  it("⭐ a clean run with a questionnaire is `generated`", () => {
    expect(classify(q, "", false, 0).state).toBe("generated");
  });

  it("⚠ the `repeats` populate error is its OWN state, never `failed`", () => {
    // ANY re-answered question (`most recent this` recency arbitration) trips this while the disposition
    // stays correct. Folding it into `failed` makes every recency case read as broken, KEs learn to
    // ignore the failure column, and that is how the one real failure ships unnoticed.
    const stderr = "ERROR ... multiple values for a non repeating group";
    expect(classify(q, stderr, false, 0).state).toBe("populate-degraded");
  });

  it("⭐ no questionnaire on a clean run is SUCCESS with a state, not a failure", () => {
    const r = classify({}, "", false, 0);
    expect(r.state).toBe("no-questionnaire");
    expect(r.reason).toBeTruthy();
  });

  it("⚠ a timeout is `timeout`, distinct from a non-zero exit", () => {
    expect(classify({}, "", true, null).state).toBe("timeout");
    expect(classify({}, "", false, 1).state).toBe("failed");
  });

  it("⚠ every non-generated state carries a reason", () => {
    for (const c of [
      classify({}, "", true, null),
      classify({}, "", false, 1),
      classify({}, "", false, 0),
      classify(q, "multiple values for a non repeating group", false, 0),
    ]) {
      expect(c.state).not.toBe("generated");
      expect(c.reason).toBeTruthy();
    }
  });
});

describe("the persisted pair carries its own identity and resolves to itself", () => {
  const Q = {
    resourceType: "Questionnaire",
    id: "coverage-determination",
    url: "http://x/Questionnaire/coverage-determination",
  };
  const QR = {
    resourceType: "QuestionnaireResponse",
    id: "qr1",
    // The engine's real shape: a VERSIONED canonical embedding the run timestamp.
    questionnaire: "http://x/Questionnaire/coverage-determination|1.0.0-abc123-2026-09-03-03.22.02",
  };

  it("⚠ every case's Questionnaire arrives with the SAME id — give it its own", () => {
    // Measured: the engine stamps the PlanDefinition's id on every case's form while the CONTENT differs
    // per case (each holds only what its path reached). N distinct resources, one identity.
    const a = normalizePersistedPair(Q, QR, "case-aaa");
    const b = normalizePersistedPair(Q, QR, "case-bbb");
    expect(a.questionnaire?.id).not.toBe(b.questionnaire?.id);
    expect(String(a.questionnaire?.id)).toContain("case-aaa");
    expect(String(a.questionnaire?.id).length).toBeLessThanOrEqual(64); // FHIR id cap
  });

  it("⚠ the RESPONSE's reference is rewritten in the same pass", () => {
    // Restamping the Questionnaire and leaving the response pointing at the old canonical yields a pair
    // that is individually valid and jointly broken — and nothing validates the link at write time.
    const { questionnaire, questionnaireResponse } = normalizePersistedPair(Q, QR, "case-aaa");
    expect(questionnaireResponse?.questionnaire).toBe(questionnaire?.url);
    expect(pairIsConsistent(questionnaire, questionnaireResponse)).toBe(true);
  });

  it("⚠ the RUN TIMESTAMP is gone — a committed artifact must not churn per run", () => {
    const first = normalizePersistedPair(Q, QR, "case-aaa");
    const second = normalizePersistedPair(Q, QR, "case-aaa");
    expect(first.questionnaireResponse?.questionnaire).toBe(second.questionnaireResponse?.questionnaire);
    expect(String(first.questionnaireResponse?.questionnaire)).not.toMatch(/\d{4}-\d{2}-\d{2}-\d{2}\./);
  });

  it("⭐ an inconsistent pair is detectable", () => {
    expect(pairIsConsistent(Q, QR)).toBe(false); // as the engine emits it
    expect(pairIsConsistent(Q, undefined)).toBe(true); // nothing to disagree with
  });
});
