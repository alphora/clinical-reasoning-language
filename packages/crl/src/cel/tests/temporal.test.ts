import { describe, expect, it } from "vitest";

import { compareFhirTemporal, isValidFhirDate, isValidFhirTemporal } from "../temporal";

// REFACTOR:grounded (#320, review 556 round 2): independent date-domain and ordering examples.
// FHIR R4 admits partial dates, offset timestamps, leap seconds, and arbitrary fractional precision.
// Acceptance as input does not make every pair comparable by the current compatibility evaluator.
describe("FHIR R4 temporal validation", () => {
  // REFACTOR:grounded (#320, review 556 round 3): birth dates use the narrower FHIR date domain.
  it.each(["0001", "9999-12", "1970", "1970-01", "1970-01-01", "2000-02-29"])(
    "accepts date-only value %s including valid partial precision",
    (value) => expect(isValidFhirDate(value)).toBe(true),
  );

  it.each([
    "1970-13-45",
    "1970-02-29",
    "0000",
    "10000-01-01",
    "1970-01-01T00:00:00Z",
    "1970-01-01T01:00:00+01:00",
  ])("rejects invalid or timestamp-valued FHIR date %s", (value) =>
    expect(isValidFhirDate(value)).toBe(false),
  );
  it.each([
    "0001",
    "9999",
    "2026",
    "2026-02",
    "2026-02-28",
    "2000-02-29",
    "2024-02-29",
    "0001-01-01",
    "9999-12-31",
    "2026-02-01T13:00:00Z",
    "2026-02-01T13:00:00.000Z",
    "2026-02-01T13:00:00.1+00:00",
    "2026-02-01T13:00:00.123456789Z",
    "2026-02-01T13:00:00.1000Z",
    "2026-02-01T13:00:00+14:00",
    "2026-02-01T13:00:00-14:00",
    "2026-02-01T13:00:00+05:30",
    "2026-02-01T13:00:00-00:00",
    "2016-12-31T23:59:60Z",
    "2016-12-31T23:59:60.5Z",
    "0001-01-01T00:00:00Z",
    "9999-12-31T23:59:59.999Z",
  ])("accepts %s without depending on Date.parse normalization", (value) => {
    expect(isValidFhirTemporal(value)).toBe(true);
  });

  it.each([
    "",
    "junk",
    "2026-2-01",
    "2026-02-1",
    "0000",
    "0000-01-01",
    "10000",
    "+010000-01-01",
    "2026-00",
    "2026-13",
    "2026-01-00",
    "2026-01-32",
    "2026-04-31",
    "2026-02-30",
    "2026-02-29",
    "1900-02-29",
    "2026-02-01T13:00",
    "2026-02-01T13:00Z",
    "2026-02-01T13:00:00",
    "2026-02-01T24:00:00Z",
    "2026-02-01T13:60:00Z",
    "2026-02-01T13:00:61Z",
    "2026-02-01T13:00:00.Z",
    "2026-02-01T13:00:00,123Z",
    "2026-02-01T13:00:00z",
    "2026-02-01T13:00:00+14:01",
    "2026-02-01T13:00:00-14:01",
    "2026-02-01T13:00:00+15:00",
    "2026-02-01T13:00:00+00:60",
    "2026-02-01T13:00:00+0100",
    "2026-02-01T13:00:00+01",
    "2026-02-01Z",
    "2026-02T13:00:00Z",
    " 2026-02-01",
    "2026-02-01 ",
    "2026-02-01\n",
    "2026-02-01T13:00:00Z\n",
    "2026-02-01\n2026-03-01",
  ])("rejects %s", (value) => {
    expect(isValidFhirTemporal(value)).toBe(false);
    expect(compareFhirTemporal(value, "2026-01-01")).toBe("invalid");
    expect(compareFhirTemporal("2026-01-01", value)).toBe("invalid");
  });
});

describe("FHIR temporal compatibility comparison", () => {
  it("compares the review counterexample as 13:00 UTC after 12:00 UTC, despite opposite lexical ordering", () => {
    expect(compareFhirTemporal("2026-02-01T12:00:00-01:00", "2026-02-01T14:00:00+02:00")).toBe(
      "after",
    );
    expect(compareFhirTemporal("2026-02-01T14:00:00+02:00", "2026-02-01T12:00:00-01:00")).toBe(
      "before",
    );
  });

  it.each([
    ["2026-02-01T12:00:00-01:00", "2026-02-01T13:00:00Z"],
    ["2026-02-01T13:00:00Z", "2026-02-01T13:00:00+00:00"],
    ["2026-02-01T13:00:00Z", "2026-02-01T13:00:00.000Z"],
    ["2026-02-01T13:00:00-00:00", "2026-02-01T13:00:00.000+00:00"],
    ["2026-02-01T00:30:00+01:00", "2026-01-31T23:30:00Z"],
    ["2026-02-01T13:00:00.1Z", "2026-02-01T13:00:00.1000Z"],
  ])("recognizes equivalent complete timestamp spellings %s and %s", (a, b) => {
    expect(compareFhirTemporal(a, b)).toBe("equal");
    expect(compareFhirTemporal(b, a)).toBe("equal");
  });

  it("orders supported sub-second precision without rounding", () => {
    expect(compareFhirTemporal("2026-02-01T13:00:00.1Z", "2026-02-01T13:00:00.101Z")).toBe(
      "before",
    );
    expect(compareFhirTemporal("2026-02-01T13:00:00.101Z", "2026-02-01T13:00:00.01Z")).toBe(
      "after",
    );
  });

  it("does not reinterpret a year below100 as a year in the twentieth century", () => {
    expect(compareFhirTemporal("0001-01-01T00:00:00Z", "0099-01-01T00:00:00Z")).toBe("before");
    expect(compareFhirTemporal("0099-01-01T00:00:00Z", "0100-01-01T00:00:00Z")).toBe("before");
  });

  it.each([
    ["2025", "2026"],
    ["2026-01", "2026-02"],
    ["2026-01-01", "2026-01-02"],
    ["2025", "2026-01-01"],
    ["2026-01", "2026-02-01"],
    ["2026-01-31", "2026-02"],
  ])("orders calendar inputs using their known fields: %s and %s", (a, b) => {
    expect(compareFhirTemporal(a, b)).toBe("before");
    expect(compareFhirTemporal(b, a)).toBe("after");
  });

  it.each(["2026", "2026-01", "2026-01-01"])(
    "finds identical calendar precision equal: %s",
    (value) => {
      expect(compareFhirTemporal(value, value)).toBe("equal");
    },
  );

  it.each([
    ["2026", "2026-01"],
    ["2026", "2026-12-31"],
    ["2026-02", "2026-02-28"],
  ])("does not invent missing fields to order %s and %s", (a, b) => {
    expect(compareFhirTemporal(a, b)).toBe("indeterminate");
    expect(compareFhirTemporal(b, a)).toBe("indeterminate");
  });

  it.each(["2026", "2026-02", "2026-02-01", "2001-01-01"])(
    "does not invent midnight/timezone for calendar input %s",
    (calendar) => {
      expect(compareFhirTemporal(calendar, "2026-02-01T13:00:00Z")).toBe("indeterminate");
      expect(compareFhirTemporal("2026-02-01T13:00:00Z", calendar)).toBe("indeterminate");
    },
  );

  it.each(["2016-12-31T23:59:60Z", "2026-02-01T13:00:00.0001Z"])(
    "keeps legal but unrepresentable timestamp %s valid while refusing comparison",
    (value) => {
      expect(isValidFhirTemporal(value)).toBe(true);
      expect(compareFhirTemporal(value, "2026-02-01T13:00:00Z")).toBe("unsupported");
      expect(compareFhirTemporal("2026-02-01T13:00:00Z", value)).toBe("unsupported");
      expect(compareFhirTemporal(value, value)).toBe("unsupported");
    },
  );
});
