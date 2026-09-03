import { describe, it, expect } from "vitest";

import { classify, extractResults } from "../runProducer";

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
