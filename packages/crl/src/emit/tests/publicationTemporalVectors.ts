// Independently stated boundary expectations shared by pure and emitted execution tests.
import type { FhirTemporalComparison } from "../../cel/temporal";

export const publicationTemporalVectors: readonly (readonly [string, string, string, FhirTemporalComparison])[] = [
  ["bleph", "2026-01-01", "2026-09-06T10:58:56-04:00", "before"],
  ["lower-before", "2026-01-01", "2025-12-31T09:59:59.999Z", "after"],
  ["lower-at", "2026-01-01", "2025-12-31T10:00:00Z", "indeterminate"],
  ["upper-before", "2026-01-01", "2026-01-02T13:59:59.999Z", "indeterminate"],
  ["upper-at", "2026-01-01", "2026-01-02T14:00:00Z", "before"],
  ["offset-at", "2026-01-01", "2026-01-03T04:00:00+14:00", "before"],
  ["same-day", "2026-01-01", "2026-01-01T16:00:00Z", "indeterminate"],
  ["month-after", "2026-01", "2026-02-01T14:00:00Z", "before"],
  ["month-overlap", "2026-01", "2026-02-01T13:59:59.999Z", "indeterminate"],
  ["year-after", "2025", "2026-01-01T14:00:00Z", "before"],
  ["year-overlap", "2025", "2026-01-01T13:59:59.999Z", "indeterminate"],
  ["leap-month", "2024-02", "2024-03-01T14:00:00Z", "before"],
  ["leap-day", "2024-02-29", "2024-03-01T13:59:59.999Z", "indeterminate"],
  ["max-year-before", "9999", "9998-01-01T00:00:00Z", "after"],
  ["max-year-overlap", "9999", "9999-12-31T23:59:59.999-14:00", "indeterminate"],
  ["max-month-overlap", "9999-12", "9999-12-31T23:59:59.999-14:00", "indeterminate"],
  ["max-day-overlap", "9999-12-31", "9999-12-31T23:59:59.999-14:00", "indeterminate"],
  ["min-year-overlap", "0001", "0001-01-01T00:00:00+14:00", "indeterminate"],
  ["min-month-overlap", "0001-01", "0001-01-01T00:00:00+14:00", "indeterminate"],
  ["min-day-overlap", "0001-01-01", "0001-01-01T00:00:00+14:00", "indeterminate"],
  ["min-day-after", "0001-01-01", "0001-01-02T14:00:00Z", "before"],
  ["mixed-leap-second", "2025", "2026-12-31T23:59:60Z", "unsupported"],
  ["mixed-sub-ms", "2025", "2026-09-06T11:00:00.0001Z", "unsupported"],
];
