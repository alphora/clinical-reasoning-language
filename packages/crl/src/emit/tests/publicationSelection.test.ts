// REFACTOR:grounded (#320, reviewed 557): authored record selection counterexamples, not legacy goldens.
import { describe, expect, it } from "vitest";

import {
  selectPublicationCandidate,
  type PublicationCandidate,
  type PublicationSelectionFailureCode,
  type PublicationSelectionOptions,
} from "../publicationSelection";

const options: PublicationSelectionOptions = {
  conceptId: "Example@1::Qualifies",
  equalTime: "error",
};
const preferLocal: PublicationSelectionOptions = { ...options, equalTime: "preferLocal" };
const oldTime = "2026-09-06T10:00:00Z";
const newTime = "2026-09-06T11:00:00Z";

function candidate(
  key: string,
  validity?: string,
  arm: PublicationCandidate<unknown>["arm"] = "source",
  resource: unknown = { valueBoolean: true },
): PublicationCandidate<unknown> {
  return {
    key,
    contributorId: `${arm}-contributor`,
    arm,
    resource,
    validity,
    ...(arm === "inferred" ? {} : { retrievedInputIdentity: `dataset::Observation/${key}` }),
  };
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length === 0) return [[]];
  return items.flatMap((item, index) =>
    permutations(items.filter((_, other) => other !== index)).map((rest) => [item, ...rest]),
  );
}

function selectsInEveryOrder(
  items: readonly PublicationCandidate<unknown>[],
  winner: PublicationCandidate<unknown>,
  policy = options,
): void {
  for (const order of permutations(items)) {
    const result = selectPublicationCandidate(Object.freeze(order), policy);
    expect(result.state).toBe("selected");
    if (result.state !== "selected") throw new Error("Expected selected publication");
    expect(result.candidate).toBe(winner);
    expect(result.candidate.resource).toBe(winner.resource);
  }
}

function failsInEveryOrder(
  items: readonly PublicationCandidate<unknown>[],
  code: PublicationSelectionFailureCode,
  policy = options,
): void {
  const expected = selectPublicationCandidate(items, policy);
  expect(expected.state).toBe("failed");
  if (expected.state !== "failed") throw new Error("Expected failed publication");
  expect(expected.diagnostic.code).toBe(code);
  expect(expected.diagnostic.conceptId).toBe(options.conceptId);
  for (const order of permutations(items)) {
    expect(selectPublicationCandidate(Object.freeze(order), policy)).toEqual(expected);
  }
}

describe("selectPublicationCandidate: candidate/value preservation", () => {
  it("publishes missing from an empty collection", () => {
    expect(selectPublicationCandidate([], options)).toEqual({ state: "missing" });
  });

  // @kit publication-selection:single-undated
  it.each([
    ["known false", Object.freeze({ resourceType: "Observation", valueBoolean: false })],
    [
      "unknown",
      Object.freeze({ resourceType: "Observation", dataAbsentReason: { text: "unknown" } }),
    ],
  ])("selects one undated %s record without replacing it", (_, resource) => {
    const only = Object.freeze(candidate("only", undefined, "local", resource));
    selectsInEveryOrder([only], only);
  });

  it.each(["2026-12-31T23:59:60Z", "2026-09-06T11:00:00.0001Z"])(
    "accepts a single valid timestamp that the comparator cannot order: %s",
    (validity) => {
      const only = candidate("only", validity);
      selectsInEveryOrder([only], only);
      expect(only.validity).toBe(validity);
    },
  );

  it("never inspects the supplied resource to discover a value or timestamp", () => {
    const opaque = new Proxy(
      {},
      {
        get: () => {
          throw new Error("Resource must be opaque");
        },
      },
    );
    const newest = Object.freeze(candidate("new", newTime, "inferred", opaque));
    selectsInEveryOrder([candidate("old", oldTime), newest], newest);
  });

  it.each([false, undefined])("does not drop a newer false/unknown value (%s)", (value) => {
    const record = value === undefined ? { resourceType: "Observation" } : { valueBoolean: value };
    const newest = candidate("new", newTime, "local", record);
    selectsInEveryOrder([candidate("old", oldTime), newest], newest);
  });

  it("allows an idless inferred resource with its own stable candidate key", () => {
    const computed = candidate("derived-key", newTime, "inferred", { valueBoolean: false });
    selectsInEveryOrder([candidate("source", oldTime), computed], computed);
  });
});

describe("selectPublicationCandidate: demonstrable recency", () => {
  it.each(["local", "source"] as const)("allows a newer %s contribution to win", (arm) => {
    const newest = candidate("new", newTime, arm);
    const older = candidate("old", oldTime, arm === "local" ? "source" : "local");
    selectsInEveryOrder([newest, older], newest, preferLocal);
  });

  it("orders actual instants across offsets instead of lexical timestamp spellings", () => {
    const older = candidate("z-lexically-larger", "2026-09-06T10:00:00Z");
    const newest = candidate("a-lexically-smaller", "2026-09-06T07:00:00-04:00", "local");
    selectsInEveryOrder([older, newest], newest);
  });

  it("ignores old ties when a unique newest row dominates them", () => {
    const newest = candidate("newest", newTime, "source");
    selectsInEveryOrder(
      [
        candidate("old-local", oldTime, "local"),
        candidate("old-inferred", oldTime, "inferred"),
        newest,
      ],
      newest,
    );
  });

  it("ignores old incomparable precision when a unique newest year dominates both rows", () => {
    const newest = candidate("newest", "2027");
    selectsInEveryOrder([candidate("year", "2026"), candidate("month", "2026-09"), newest], newest);
  });

  // @kit publication-selection:local-tie-only
  it("does not let an older local answer override a strictly newer source", () => {
    const newerSource = candidate("source", newTime, "source", { valueBoolean: true });
    selectsInEveryOrder(
      [candidate("local", oldTime, "local", { valueBoolean: false }), newerSource],
      newerSource,
      preferLocal,
    );
  });
});

describe("selectPublicationCandidate: authored equal-time selection", () => {
  // @kit publication-selection:equal-time-error
  it.each([true, false])(
    "does not merge equal-time records merely because values agree/disagree (%s)",
    (otherValue) => {
      failsInEveryOrder(
        [
          candidate("a", newTime, "local", { valueBoolean: true }),
          candidate("z", newTime, "inferred", { valueBoolean: otherValue }),
        ],
        "publication-ambiguous-selection",
      );
    },
  );

  // @kit publication-selection:local-tie-only
  it.each([true, false])(
    "honors authored local preference for matching or conflicting same-QR values (%s)",
    (computedValue) => {
      const local = candidate("own-answer", newTime, "local", { valueBoolean: false });
      const inferred = candidate("calculation", newTime, "inferred", {
        valueBoolean: computedValue,
      });
      selectsInEveryOrder([local, inferred], local, preferLocal);
    },
  );

  it("recognizes equal instants with different offset spellings", () => {
    const local = candidate("local", "2026-09-06T07:00:00-04:00", "local");
    const source = candidate("source", newTime);
    failsInEveryOrder([local, source], "publication-ambiguous-selection");
    selectsInEveryOrder([local, source], local, preferLocal);
  });

  // @kit publication-selection:local-tie-only
  it("fails when multiple local candidates share the maximal time", () => {
    failsInEveryOrder(
      [
        candidate("a", newTime, "local"),
        candidate("z", newTime, "local"),
        candidate("older", oldTime),
      ],
      "publication-ambiguous-selection",
      preferLocal,
    );
  });

  it("does not make preferLocal resolve a tie with no maximal local", () => {
    failsInEveryOrder(
      [
        candidate("source", newTime),
        candidate("computed", newTime, "inferred"),
        candidate("old-local", oldTime, "local"),
      ],
      "publication-ambiguous-selection",
      preferLocal,
    );
  });

  it("uses contributor arm, then reports the persisted computation versus answer local/local tie", () => {
    const sharedCode = { coding: [{ system: "local-domain", code: "qualifies" }] };
    const computed = candidate("computed", newTime, "inferred", {
      code: sharedCode,
      valueBoolean: true,
      lineage: "computed from an operand",
    });
    const answer = candidate("answer", newTime, "local", {
      code: sharedCode,
      valueBoolean: false,
      lineage: "intentional answer",
    });
    selectsInEveryOrder([computed, answer], answer, preferLocal);

    // The unchanged computed resource enters a local retrieve contributor in the next dataset.
    // Codes and lineage cannot silently preserve inferred priority across that boundary.
    const persisted = {
      ...computed,
      key: "persisted-computation",
      contributorId: "local-contributor",
      arm: "local" as const,
      retrievedInputIdentity: "dataset::Observation/persisted-computation",
    };
    failsInEveryOrder([persisted, answer], "publication-ambiguous-selection", preferLocal);
    expect(persisted.resource).toBe(computed.resource);
  });
});

describe("selectPublicationCandidate: unavailable order and malformed data", () => {
  // @kit publication-selection:incomparable-validity
  it.each([
    ["2026", "2026-09", "indeterminate"],
    ["2026-09-06", newTime, "indeterminate"],
    ["2026-12-31T23:59:60Z", "2027-01-01T00:00:00Z", "unsupported"],
    ["2026-09-06T11:00:00.0001Z", newTime, "unsupported"],
  ])("does not treat %s versus %s as an equal-time tie", (a, b, comparison) => {
    const rows = [candidate("local", a, "local"), candidate("source", b)];
    failsInEveryOrder(rows, "publication-incomparable-validity", preferLocal);
    const result = selectPublicationCandidate(rows, preferLocal);
    if (result.state !== "failed") throw new Error("Expected failure");
    expect(result.diagnostic.comparisons?.map((pair) => pair.comparison)).toEqual([comparison]);
    expect(result.diagnostic.message).toContain(comparison === "unsupported" ? "unsupported comparison" : "overlapping precision");
  });

  // @kit publication-selection:invalid-input
  it.each(["2026-02-30", "2026-13", "2026-09-06T10:00:00", "", "2026\n"])(
    "rejects malformed supplied validity %j even alongside an otherwise newest row",
    (invalid) => {
      const bad = candidate("malformed", invalid);
      failsInEveryOrder([bad, candidate("newest", newTime)], "publication-invalid-validity");
      failsInEveryOrder([bad], "publication-invalid-validity");
    },
  );
});

describe("selectPublicationCandidate: undated multi-candidate input", () => {
  // @kit publication-selection:undated-competition
  it("names the undated identity when a dated and undated candidate compete", () => {
    const undated = candidate("undated", undefined, "local");
    const dated = candidate("dated", newTime);
    failsInEveryOrder([undated, dated], "publication-undated-input", preferLocal);
    const result = selectPublicationCandidate([dated, undated], preferLocal);
    if (result.state !== "failed") throw new Error("Expected undated failure");
    expect(result.diagnostic.candidates).toMatchObject([
      { key: undated.key, retrievedInputIdentity: undated.retrievedInputIdentity },
    ]);
    expect(result.diagnostic.candidates).toHaveLength(1);
  });

  // @kit publication-selection:undated-competition
  it("rejects two undated candidates and selects after their validity is corrected", () => {
    const first = candidate("first", undefined, "local");
    const second = candidate("second", undefined, "inferred");
    failsInEveryOrder([first, second], "publication-undated-input", preferLocal);
    const correctedFirst = { ...first, validity: oldTime };
    const correctedSecond = { ...second, validity: newTime };
    selectsInEveryOrder([correctedFirst, correctedSecond], correctedSecond, preferLocal);
  });

  // @kit publication-selection:undated-competition
  it("a new dated answer cannot repair an undated input, but correcting that validity can", () => {
    const undated = candidate("undated", undefined);
    const existing = candidate("existing", oldTime, "local");
    const answer = candidate("new-answer", newTime, "local", { valueBoolean: false });
    failsInEveryOrder([undated, existing], "publication-undated-input", preferLocal);
    failsInEveryOrder([undated, existing, answer], "publication-undated-input", preferLocal);
    const corrected = { ...undated, validity: oldTime };
    selectsInEveryOrder([corrected, existing, answer], answer, preferLocal);
    expect(corrected.resource).toBe(undated.resource);
  });
});

describe("selectPublicationCandidate: explicit identity boundary", () => {
  it.each(["local", "source"] as const)(
    "requires retrieved identity for %s even if it would lose",
    (arm) => {
      const unidentified = {
        ...candidate("no-id", oldTime, arm),
        retrievedInputIdentity: undefined,
      };
      failsInEveryOrder([unidentified], "publication-missing-input-identity");
      failsInEveryOrder(
        [unidentified, candidate("newest", newTime)],
        "publication-missing-input-identity",
      );
    },
  );

  it("rejects an empty retrieved identity", () => {
    const unidentified = { ...candidate("empty-id"), retrievedInputIdentity: "" };
    failsInEveryOrder([unidentified], "publication-missing-input-identity");
  });

  // @kit publication-selection:invalid-input
  it.each([true, false])(
    "rejects repeated contributor/input identity including identical payload copies (%s)",
    (otherValue) => {
      const first = candidate("first", oldTime, "local", { valueBoolean: true });
      const second = {
        ...candidate("second", oldTime, "local", { valueBoolean: otherValue }),
        retrievedInputIdentity: first.retrievedInputIdentity,
      };
      failsInEveryOrder(
        [first, second, candidate("newest", newTime)],
        "publication-duplicate-input",
      );
    },
  );

  it("rejects a repeated object occurrence instead of exempting it by identity", () => {
    const repeated = candidate("same", newTime, "inferred");
    failsInEveryOrder([repeated, repeated], "publication-duplicate-input");
  });

  it("rejects repeated inferred candidate keys even with different validity and resources", () => {
    failsInEveryOrder(
      [
        candidate("same-key", oldTime, "inferred", { valueBoolean: true }),
        candidate("same-key", newTime, "inferred", { valueBoolean: false }),
      ],
      "publication-duplicate-input",
    );
  });

  it("keeps the same retrieved input in different contributors as distinct candidates", () => {
    const first = candidate("first-contribution", oldTime);
    const second = {
      ...candidate("second-contribution", newTime),
      contributorId: "other-contributor",
      retrievedInputIdentity: first.retrievedInputIdentity,
    };
    selectsInEveryOrder([first, second], second);
  });

  it("does not merge same-input different-contributor equal-time records", () => {
    const first = candidate("first-contribution", newTime);
    const second = {
      ...candidate("second-contribution", newTime),
      contributorId: "other-contributor",
      retrievedInputIdentity: first.retrievedInputIdentity,
    };
    failsInEveryOrder([first, second], "publication-ambiguous-selection");
  });
});
