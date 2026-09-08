import { afterEach, describe, expect, it, vi } from "vitest";

import type { CELCase, CELFact, CELFactRefField } from "../ast/types";
import { buildCaseAnchors, resolveCaseFactDates, resolveFactDate } from "../factDate";
import { buildCEL } from "../index";

// REFACTOR:grounded (#320, discussion 555): expected dates come from authored calendar examples,
// independently of implementation calculations. This suite resolves input; it does not prove recency ordering.
const now = new Date("2026-09-06T12:34:56.789Z");
function fixture(
  lines: string,
  bodyDate?: string | string[],
  patientFields = "",
): {
  c: CELCase;
  facts: Map<string, CELFact>;
  refs: CELFactRefField[];
} {
  const parsed = buildCEL(`library "Dates".
    fact "F":
    - defined by "Observation".
    ${
      bodyDate === undefined
        ? ""
        : [bodyDate]
            .flat()
            .map((date) => `- date is "${date}".`)
            .join("\n")
    }
    fact "P":
    - defined by "Patient".
    ${patientFields}
    case "C":
    - subject is "P".
    ${lines}`);
  expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
  const facts = new Map<string, CELFact>();
  let c: CELCase | undefined;
  for (const s of parsed.result!.statements) {
    if (s.type === "CELFact") facts.set(s.name, s);
    else c = s;
  }
  return {
    c: c!,
    facts,
    refs: c!.body.filter((b): b is CELFactRefField => b.type === "CELFactRefField"),
  };
}

function resolved(lines: string, bodyDate?: string): (string | undefined)[] {
  const { c, facts, refs } = fixture(lines, bodyDate);
  const result = resolveCaseFactDates(c, facts, now);
  expect(result.diagnostics).toEqual([]);
  return refs.map((ref) => result.dates.get(ref));
}

afterEach(() => vi.unstubAllEnvs());

describe("authored CEL fact date resolution", () => {
  // REFACTOR:grounded (#320, review 556 round 3): subjects pass through the shared declaration gate.
  it.each(["1970-13-45", "1970-01-01T00:00:00Z", "0000-01-01"])(
    "rejects invalid subject birthday %s even with a valid date-is and case override",
    (birthday) => {
      const { c, facts, refs } = fixture(
        '- fact is "P" on 2026-02-01.',
        undefined,
        `- birth date is "${birthday}".\n- date is "2026-01-01".`,
      );
      const result = resolveCaseFactDates(c, facts, now);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ kind: "invalid-date", factName: "P" }),
      );
      expect(result.dates.has(refs[0])).toBe(false);
    },
  );

  it.each(["1970", "1970-01", "1970-01-01"])(
    "accepts partial/full birthday %s without making it the fact's effective date",
    (birthday) => {
      const { c, facts, refs } = fixture(
        '- fact is "P".',
        undefined,
        `- birth date is "${birthday}".`,
      );
      const result = resolveCaseFactDates(c, facts, now);
      expect(result.diagnostics).toEqual([]);
      expect(result.dates.get(refs[0])).toBeUndefined();
    },
  );

  it("rejects duplicate subject birth-date declarations", () => {
    const { c, facts } = fixture(
      '- fact is "F".',
      undefined,
      '- birth date is "1970-01-01".\n- birth date is "1971-01-01".',
    );
    expect(resolveCaseFactDates(c, facts, now).diagnostics).toEqual([
      expect.objectContaining({
        kind: "duplicate-date",
        factName: "P",
        message: "Fact \"P\" has more than one 'birth date is' field.",
      }),
    ]);
  });
  // @kit cel-cases:fact-date-override
  it("gives the reference's absolute date precedence over reusable body data", () => {
    expect(resolved('- fact is "F" on 2026-02-05.', "2026-01-01")).toEqual(["2026-02-05"]);
  });

  it("falls back to a valid body date only when no clause was authored", () => {
    expect(resolved('- fact is "F".', "2026-01-01")).toEqual(["2026-01-01"]);
  });

  // REFACTOR:grounded (#320, review 556 round 2): keep valid authored spelling; reject invalid bodies
  // before an at/on override can conceal them. Validity does not imply CRE comparison support.
  it.each([
    "2026",
    "2026-02",
    "2026-02-01T13:00:00+01:00",
    "2016-12-31T23:59:60Z",
    "2026-02-01T13:00:00.0001Z",
  ])("preserves accepted fact-body temporal bytes %s", (date) =>
    expect(resolved('- fact is "F".', date)).toEqual([date]),
  );

  it.each([
    "unvalidated-body-text",
    "2026-02-30",
    "0000-01-01",
    "10000-01-01",
    "2026-02-01T13:00:00+14:01",
  ])("rejects invalid fact-body date %s even with a valid case override", (date) => {
    const { c, facts, refs } = fixture('- fact is "F" on 2026-03-01.', date);
    const result = resolveCaseFactDates(c, facts, now);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ kind: "invalid-date", factName: "F" }),
    ]);
    expect(result.dates.has(refs[0])).toBe(false);
  });

  it("rejects an invalid fact-body date on an ordinary reference", () => {
    const { c, facts } = fixture('- fact is "F".', "2026-02-30");
    expect(resolveCaseFactDates(c, facts, now).diagnostics[0].kind).toBe("invalid-date");
  });

  // @kit cel-cases:undated-not-now
  it("leaves an undated fact missing even with a now anchor and an injected clock", () => {
    const { c, facts, refs } = fixture('- anchor is now.\n- fact is "F".');
    const anchors = buildCaseAnchors(c, now);
    expect(resolveFactDate(refs[0], facts.get("F"), anchors)).toEqual({ kind: "missing" });
  });

  it("formats date anchors and day/week offsets in UTC in a non-UTC timezone", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(
      resolved(`- anchor is 2026-01-01.
      - fact is "F" at anchor.
      - fact is "F" at anchor + 2 days.
      - fact is "F" at anchor - 1 week.`),
    ).toEqual(["2026-01-01", "2026-01-03", "2025-12-25"]);
  });

  it("keeps ambient and named anchors independent", () => {
    expect(
      resolved(`- anchor is 2026-01-01.
      - anchor "Surgery" is 2026-02-05.
      - fact is "F" at "Surgery" - 2 days.
      - fact is "F" at anchor.`),
    ).toEqual(["2026-02-03", "2026-01-01"]);
  });

  it("resolves calendar offsets away from the separately undecided month-end boundary", () => {
    expect(
      resolved(`- anchor is 2026-02-05.
      - fact is "F" at anchor + 1 month.
      - fact is "F" at anchor - 1 year.`),
    ).toEqual(["2026-03-05", "2025-02-05"]);
  });

  // REFACTOR:grounded (#320, review 556): fractional calendar values must not be silently rounded.
  it("rejects an unrepresentable sub-millisecond offset without rounding it", () => {
    const { c, facts } = fixture(
      '- anchor is 2026-02-05.\n- fact is "F" at anchor + 0.0001 second.',
    );
    expect(resolveCaseFactDates(c, facts, now).diagnostics).toEqual([
      expect.objectContaining({ kind: "invalid-date", factName: "F" }),
    ]);
    expect(resolved('- anchor is 2026-02-05.\n- fact is "F" at anchor + 0.001 second.')).toEqual([
      "2026-02-05T00:00:00.001Z",
    ]);
  });

  // REFACTOR:grounded (#320, review 556): decimal scaling is exact, including Number.toString exponents.
  it("accepts millisecond-valued decimal offsets without floating-point truncation", () => {
    expect(
      resolved(`- anchor is 2026-01-02.
      - fact is "F" at anchor + 1.001 seconds.
      - fact is "F" at anchor + 0.001 seconds.
      - fact is "F" at anchor - 1.001 seconds.
      - fact is "F" at anchor + 0.000000625 days.`),
    ).toEqual([
      "2026-01-02T00:00:01.001Z",
      "2026-01-02T00:00:00.001Z",
      "2026-01-01T23:59:58.999Z",
      "2026-01-02T00:00:00.054Z",
    ]);
  });

  it.each([
    "0.0000001 seconds",
    "0.000000125 days",
    "0.001 milliseconds",
    "1000000000000000000000 milliseconds",
  ])("rejects sub-ms or out-of-range canonical decimal offsets %s", (offset) => {
    const { c, facts } = fixture(`- anchor is 2026-01-02.\n- fact is "F" at anchor + ${offset}.`);
    expect(resolveCaseFactDates(c, facts, now).diagnostics).toEqual([
      expect.objectContaining({ kind: "invalid-date" }),
    ]);
  });

  it.each(["0.5 months", "1.5 months", "0.5 years", "1.5 years"])(
    "rejects the unsupported calendar offset %s",
    (offset) => {
      const { c, facts } = fixture(`- anchor is 2026-02-05.\n- fact is "F" at anchor + ${offset}.`);
      expect(resolveCaseFactDates(c, facts, now).diagnostics).toEqual([
        expect.objectContaining({ kind: "invalid-date", factName: "F" }),
      ]);
    },
  );

  it("rejects fractional calendar offsets on an authored now anchor", () => {
    const { c, facts } = fixture('- anchor is now - 0.5 years.\n- fact is "F".');
    expect(resolveCaseFactDates(c, facts, now).diagnostics[0].kind).toBe("invalid-date");
  });

  it.each(["", " on 2026-04-01"])(
    "rejects duplicate fact dates even with a reference override '%s'",
    (clause) => {
      const { c, facts, refs } = fixture(`- fact is "F"${clause}.`, ["2026-01-01", "2026-02-01"]);
      const result = resolveCaseFactDates(c, facts, now);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ kind: "duplicate-date", factName: "F" }),
      ]);
      expect(result.dates.has(refs[0])).toBe(false);
    },
  );

  it.each(["subject", "encounter"])("checks duplicate dates on a %s reference", (kind) => {
    const { c, facts } = fixture(`- ${kind} is "F".`, ["2026-01-01", "2026-02-01"]);
    expect(resolveCaseFactDates(c, facts, now).diagnostics[0].kind).toBe("duplicate-date");
  });

  it.each(["at anchor", 'at "Missing"'])(
    "reports %s without falling through to a body date",
    (clause) => {
      const { c, facts, refs } = fixture(`- fact is "F" ${clause}.`, "2026-01-01");
      const result = resolveCaseFactDates(c, facts, now);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ kind: "missing-anchor", factName: "F" }),
      ]);
      expect(result.dates.has(refs[0])).toBe(false);
      expect(resolveFactDate(refs[0], facts.get("F"), result.anchors).kind).toBe("error");
    },
  );

  it.each(["anchor is", 'anchor "Surgery" is'])("diagnoses duplicate %s declarations", (prefix) => {
    const { c, facts } = fixture(
      `- ${prefix} 2026-01-01.\n- ${prefix} 2026-01-02.\n- fact is "F".`,
    );
    expect(resolveCaseFactDates(c, facts, now).diagnostics).toEqual([
      expect.objectContaining({ kind: "duplicate-anchor" }),
    ]);
  });

  it.each(["2026-02-30", "2026-13-01"])(
    "rejects invalid fixed anchor %s even when unused",
    (date) => {
      const { c, facts } = fixture(`- anchor is ${date}.\n- fact is "F".`, "2026-01-01");
      expect(resolveCaseFactDates(c, facts, now).diagnostics).toEqual([
        expect.objectContaining({ kind: "invalid-date" }),
      ]);
    },
  );

  it("rejects an invalid absolute clause instead of normalizing it to another day", () => {
    const { c, facts } = fixture('- fact is "F" on 2026-02-30.', "2026-01-01");
    expect(resolveCaseFactDates(c, facts, now).diagnostics[0].kind).toBe("invalid-date");
  });

  // REFACTOR:grounded (#320, review 556): reject dates outside FHIR's four-digit positive-year range.
  it.each([
    '- fact is "F" on 0000-01-01.',
    '- anchor is 0000-01-01.\n- fact is "F".',
    '- anchor is 9999-01-01.\n- fact is "F" at anchor + 1 year.',
    '- anchor is 0001-01-01.\n- fact is "F" at anchor - 1 year.',
  ])("rejects zero or expanded years instead of emitting a malformed date", (lines) => {
    const { c, facts } = fixture(lines);
    expect(resolveCaseFactDates(c, facts, now).diagnostics).toEqual([
      expect.objectContaining({ kind: "invalid-date" }),
    ]);
  });

  it("accepts the supported lower and upper fixed-year boundaries", () => {
    expect(resolved('- fact is "F" on 0001-01-01.\n- fact is "F" on 9999-12-31.')).toEqual([
      "0001-01-01",
      "9999-12-31",
    ]);
  });

  it("rejects an authored now anchor whose injected clock is outside the year range", () => {
    const { c, facts } = fixture('- anchor is now.\n- fact is "F".');
    expect(
      resolveCaseFactDates(c, facts, new Date("0000-01-01T00:00:00.000Z")).diagnostics,
    ).toEqual([expect.objectContaining({ kind: "invalid-date" })]);
  });

  it("uses one injected now for named and ambient anchors and retains milliseconds", () => {
    expect(
      resolved(`- anchor is now.
      - anchor "Before" is now - 1 millisecond.
      - fact is "F" at anchor.
      - fact is "F" at "Before".
      - fact is "F" at anchor + 1 day.`),
    ).toEqual(["2026-09-06T12:34:56.789Z", "2026-09-06T12:34:56.788Z", "2026-09-07T12:34:56.789Z"]);
  });

  it("retains sub-day offset precision on date-only anchors", () => {
    expect(
      resolved(`- anchor is 2026-01-02.
      - fact is "F" at anchor - 12 hours.
      - fact is "F" at anchor + 5 minutes.
      - fact is "F" at anchor + 1.5 seconds.
      - fact is "F" at anchor + 2 milliseconds.`),
    ).toEqual([
      "2026-01-01T12:00:00.000Z",
      "2026-01-02T00:05:00.000Z",
      "2026-01-02T00:00:01.500Z",
      "2026-01-02T00:00:00.002Z",
    ]);
  });

  it("retains every reference date without mutating the reusable fact or injected clock", () => {
    const { c, facts, refs } = fixture(
      '- fact is "F" on 2026-01-01.\n- fact is "F" on 2026-02-01.',
      "2025-01-01",
    );
    const before = JSON.stringify([...facts.values()]);
    const result = resolveCaseFactDates(c, facts, now);
    expect(result.dates.size).toBe(2);
    expect(refs.map((r) => result.dates.get(r))).toEqual(["2026-01-01", "2026-02-01"]);
    expect(JSON.stringify([...facts.values()])).toBe(before);
    expect(now.toISOString()).toBe("2026-09-06T12:34:56.789Z");
  });

  it("rejects an invalid injected now only when now was authored", () => {
    const authored = fixture('- anchor is now.\n- fact is "F" at anchor.');
    expect(
      resolveCaseFactDates(authored.c, authored.facts, new Date(NaN)).diagnostics[0].kind,
    ).toBe("invalid-date");
    const undated = fixture('- fact is "F".');
    expect(resolveCaseFactDates(undated.c, undated.facts, new Date(NaN)).diagnostics).toEqual([]);
  });
});
