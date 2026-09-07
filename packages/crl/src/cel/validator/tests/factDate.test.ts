import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCEL } from "../../index";
import type { CELValidationResult } from "../types";
import { validateCEL } from "../validator";

// REFACTOR:grounded (#320, review 556): the first authoring tool must expose the same invalid
// temporal input as emission/evaluation. These tests assert diagnostics, not a recency policy.
function validateDates(
  caseLines?: string,
  factDateLines = "",
  patientFields = "",
): CELValidationResult {
  const parsed = buildCEL(`library "Dates".
    fact "P":
    - defined by "Patient".
    ${patientFields}
    fact "F":
    - defined by "Observation".
    ${factDateLines}
    ${caseLines === undefined ? "" : `case "C":\n- subject is "P".\n${caseLines}`}`);
  expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
  return validateCEL({
    filePath: "/virtual/dates.cel",
    cel: parsed.result,
    celParseErrors: [],
    diagnostics: [],
  });
}

afterEach(() => vi.useRealTimers());

describe("CEL author-time date diagnostics", () => {
  // REFACTOR:grounded (#320, review 556 round 3): subject birthday errors surface at author time.
  it.each(["1970-13-45", "1970-01-01T00:00:00Z", "0000", "10000-01-01"])(
    "rejects invalid subject birthday %s despite a case override",
    (birthday) => {
      const result = validateDates(
        '- fact is "P" on 2026-02-01.',
        "",
        `- birth date is "${birthday}".\n- date is "2026-01-01".`,
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          kind: "invalid-date",
          message: expect.stringContaining("birth date"),
        }),
      );
      expect([...new Set(result.errors.map((e) => e.kind))]).toEqual(["invalid-date"]);
    },
  );

  it.each(["1970", "1970-01", "1970-01-01"])(
    "accepts valid partial/full subject birthday %s",
    (birthday) => {
      expect(validateDates('- fact is "F".', "", `- birth date is "${birthday}".`).errors).toEqual(
        [],
      );
    },
  );

  it("reports duplicate birthday declarations even without a case", () => {
    expect(
      validateDates(undefined, "", '- birth date is "1970-01-01".\n- birth date is "1971-01-01".')
        .errors,
    ).toEqual([
      expect.objectContaining({
        kind: "duplicate-date",
        message: "Fact \"P\" has more than one 'birth date is' field.",
      }),
    ]);
  });
  it.each(["at anchor", 'at "Reveiw"'])("reports missing %s despite a fact-body date", (clause) => {
    const result = validateDates(`- fact is "F" ${clause}.`, '- date is "2026-01-01".');
    expect(result.errors).toEqual([
      expect.objectContaining({
        kind: "missing-anchor",
        severity: "error",
        filePath: "/virtual/dates.cel",
        location: expect.any(Object),
      }),
    ]);
  });

  it.each(["anchor is", 'anchor "Review" is'])("reports duplicate %s", (prefix) => {
    expect(validateDates(`- ${prefix} 2026-01-01.\n- ${prefix} 2026-01-02.`).errors).toEqual([
      expect.objectContaining({ kind: "duplicate-anchor", severity: "error" }),
    ]);
  });

  it.each([
    "- anchor is 2026-02-30.",
    '- fact is "F" on 2026-02-30.',
    '- anchor is 2026-01-01.\n- fact is "F" at anchor + 0.5 months.',
    "- anchor is now - 1.5 years.",
  ])("reports an invalid date or unsupported calendar offset", (lines) => {
    expect(validateDates(lines).errors).toEqual([
      expect.objectContaining({ kind: "invalid-date", severity: "error" }),
    ]);
  });

  it.each([undefined, '- fact is "F".', '- fact is "F" on 2026-04-01.'])(
    "reports duplicate date declarations once, including unreferenced and overridden facts",
    (lines) => {
      const result = validateDates(lines, '- date is "2026-01-01".\n- date is "2026-02-01".');
      expect(result.errors).toEqual([
        expect.objectContaining({
          kind: "duplicate-date",
          severity: "error",
          message: "Fact \"F\" has more than one 'date is' field.",
        }),
      ]);
    },
  );

  it("does not multiply a duplicate fact-date finding for repeated uses", () => {
    const result = validateDates(
      '- fact is "F".\n- fact is "F" on 2026-04-01.',
      '- date is "2026-01-01".\n- date is "2026-02-01".',
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].kind).toBe("duplicate-date");
  });

  // REFACTOR:grounded (#320, review 556 round 2): invalid body dates are author-facing errors
  // regardless of use or override. Date/dateTime validation never silently normalizes the source.
  it.each([undefined, '- fact is "F".', '- fact is "F" on 2026-03-01.'])(
    "reports an invalid fact-body date with absent, ordinary, or overridden use",
    (lines) => {
      const result = validateDates(lines, '- date is "2026-02-30".');
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          kind: "invalid-date",
          severity: "error",
          location: expect.any(Object),
        }),
      );
      expect([...new Set(result.errors.map((e) => e.kind))]).toEqual(["invalid-date"]);
    },
  );

  it.each(["0000", "10000-01-01", "2026-02-01T13:00:00", "2026-02-01T13:00:00+14:01"])(
    "rejects malformed body date/dateTime %s at declaration",
    (date) => {
      expect(validateDates(undefined, `- date is "${date}".`).errors).toEqual([
        expect.objectContaining({ kind: "invalid-date", severity: "error" }),
      ]);
    },
  );

  it.each([
    "0001",
    "9999-12",
    "2026-02-01T13:00:00Z",
    "2026-02-01T13:00:00+05:30",
    "2016-12-31T23:59:60Z",
    "2026-02-01T13:00:00.0001Z",
  ])("accepts valid body temporal value %s without requiring CRE comparability", (date) =>
    expect(validateDates('- fact is "F".', `- date is "${date}".`).errors).toEqual([]),
  );

  it.each(["2001-01-01T00:00:00.000Z", "2026-09-06T12:34:56.789Z"])(
    "accepts ordinary fixed, undated, and authored now forms with clock %s",
    (clock) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(clock));
      // REFACTOR:grounded (#320, review 556): reuse the template across cases so each temporal
      // spelling creates a distinct resource identity; repeated instances in one case would collide.
      const result = validateDates(`- anchor is 2026-01-01.
        - fact is "F".
        case "Fixed":
        - subject is "P".
        - fact is "F" on 2026-02-01.
        case "Calendar":
        - subject is "P".
        - anchor is 2026-01-01.
        - fact is "F" at anchor + 1 month.
        case "Session":
        - subject is "P".
        - anchor "Session" is now - 2 milliseconds.
        - fact is "F" at "Session" + 2 days.`);
      expect(result.errors).toEqual([]);
    },
  );
});
