// REFACTOR:grounded (#320, review 556): validate FHIR R4 temporal input before comparing it.
// Primary value-domain reference: https://hl7.org/fhir/R4/datatypes.html#dateTime
// Valid data and supported CRE comparison are distinct. No missing timezone or calendar field is invented.

export type FhirTemporalComparison =
  | "before"
  | "after"
  | "equal"
  | "indeterminate"
  | "unsupported"
  | "invalid";

type ParsedTemporal =
  | { kind: "calendar"; fields: readonly number[] }
  | { kind: "instant"; milliseconds: number | undefined };

// The regex establishes spelling/field presence only; calendar and range checks below are mandatory.
const FHIR_TEMPORAL =
  /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2}))?)?)?$/;

function parseFhirTemporal(value: string): ParsedTemporal | undefined {
  const match = FHIR_TEMPORAL.exec(value);
  // JavaScript's $ can match before a final newline; FHIR primitive values cannot contain that suffix.
  if (!match || match[0] !== value) return undefined;
  const year = Number(match[1]);
  if (year < 1 || year > 9999) return undefined;
  const month = match[2] === undefined ? undefined : Number(match[2]);
  const day = match[3] === undefined ? undefined : Number(match[3]);
  if (month === undefined) return { kind: "calendar", fields: [year] };
  if (month < 1 || month > 12) return undefined;
  if (day === undefined) return { kind: "calendar", fields: [year, month] };
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return undefined;
  if (match[4] === undefined) return { kind: "calendar", fields: [year, month, day] };

  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 60) return undefined;
  const fraction = (match[7] ?? "").replace(/0+$/, "");
  const timezone = match[8];
  let offsetMinutes = 0;
  if (timezone !== "Z") {
    const offsetHour = Number(timezone.slice(1, 3));
    const offsetMinute = Number(timezone.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0))
      return undefined;
    offsetMinutes = (timezone[0] === "+" ? 1 : -1) * (offsetHour * 60 + offsetMinute);
  }

  // Leap seconds and genuine sub-millisecond values are legal input. The current CRE numeric clock
  // cannot represent them faithfully; retain their validity while refusing comparison, without rounding.
  if (second === 60 || fraction.length > 3) return { kind: "instant", milliseconds: undefined };
  const milliseconds = Number(fraction.padEnd(3, "0"));
  // Calendar validity was established above. setUTCFullYear avoids Date.UTC's 1900 offset for years 00..99.
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  utc.setUTCHours(hour, minute, second, milliseconds);
  return { kind: "instant", milliseconds: utc.getTime() - offsetMinutes * 60000 };
}

/** Validate the FHIR R4 date/dateTime value domain without changing the authored bytes. */
export function isValidFhirTemporal(value: string): boolean {
  return parseFhirTemporal(value) !== undefined;
}

/** REFACTOR:grounded (#320, review 556 round 3): FHIR date excludes the time/zone of dateTime. */
export function isValidFhirDate(value: string): boolean {
  return parseFhirTemporal(value)?.kind === "calendar";
}

/**
 * Compare supported temporal values, never raw lexical timezone spellings. This is a compatibility
 * evaluator, not #320's final publication/selection contract: it refuses uncertain/unsupported ordering.
 */
export function compareFhirTemporal(a: string, b: string): FhirTemporalComparison {
  const left = parseFhirTemporal(a);
  const right = parseFhirTemporal(b);
  if (!left || !right) return "invalid";
  if (left.kind !== right.kind) return "indeterminate";
  if (left.kind === "calendar" && right.kind === "calendar") {
    for (let i = 0; i < Math.min(left.fields.length, right.fields.length); i++) {
      if (left.fields[i] < right.fields[i]) return "before";
      if (left.fields[i] > right.fields[i]) return "after";
    }
    return left.fields.length === right.fields.length ? "equal" : "indeterminate";
  }
  if (left.kind === "instant" && right.kind === "instant") {
    if (left.milliseconds === undefined || right.milliseconds === undefined) return "unsupported";
    if (left.milliseconds < right.milliseconds) return "before";
    if (left.milliseconds > right.milliseconds) return "after";
    return "equal";
  }
  return "indeterminate";
}
