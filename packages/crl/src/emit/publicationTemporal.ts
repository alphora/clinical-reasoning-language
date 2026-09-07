// REFACTOR:grounded (#320, review 561): comparison bounds do not manufacture clinical validity.
import { compareFhirTemporal, type FhirTemporalComparison } from "../cel/temporal";

const MAX_OFFSET_MILLISECONDS = 14 * 60 * 60 * 1000;

/** All possible instants of an already validated year/month/day, with an exclusive upper bound. */
function calendarBounds(calendar: string): readonly [number, number] {
  const fields = calendar.split("-").map(Number);
  const start = new Date(0);
  // setUTCFullYear avoids Date.UTC's implicit 1900 offset for years below 100.
  start.setUTCFullYear(fields[0], (fields[1] ?? 1) - 1, fields[2] ?? 1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime());
  if (fields.length === 1) end.setUTCFullYear(fields[0] + 1);
  else if (fields.length === 2) end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + 1);
  // JS supports boundary comparison years 0/10000. These values never enter a resource.
  return [start.getTime() - MAX_OFFSET_MILLISECONDS, end.getTime() + MAX_OFFSET_MILLISECONDS];
}

/**
 * Publication-only extension to the compatibility comparator. A date may be demonstrably older
 * than an instant despite unknown time/zone. Overlapping precision remains indeterminate; unlike
 * equal-time selection, it cannot activate preferLocal. Legacy evaluator comparisons are unchanged.
 */
export function comparePublicationValidity(a: string, b: string): FhirTemporalComparison {
  const comparison = compareFhirTemporal(a, b);
  const leftCalendar = a.length <= 10;
  if (comparison !== "indeterminate" || leftCalendar === (b.length <= 10)) return comparison;
  const calendar = leftCalendar ? a : b;
  const instant = leftCalendar ? b : a;
  // The compatibility comparator validated both values; check exact instant support before parsing.
  if (compareFhirTemporal(instant, instant) === "unsupported") return "unsupported";
  const [lower, upper] = calendarBounds(calendar);
  const milliseconds = Date.parse(instant);
  if (milliseconds < lower) return leftCalendar ? "after" : "before";
  if (milliseconds >= upper) return leftCalendar ? "before" : "after";
  return "indeterminate";
}
