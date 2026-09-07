import type {
  CELCase,
  CELFact,
  CELFactRefField,
  CELAtClause,
  CELDurationOffset,
  Location,
} from "./ast/types";
import { isValidFhirDate, isValidFhirTemporal } from "./temporal";

// REFACTOR:grounded (#320, discussion 555): authored case dates override reusable fact dates;
// missing dates stay missing, while an unresolvable authored clause is an error, never a fallback.
export interface FactDateDiagnostic {
  kind: "invalid-date" | "missing-anchor" | "duplicate-anchor" | "duplicate-date";
  message: string;
  location: Location;
  factName?: string;
}

interface AnchorValue {
  instant: Date;
  precision: "date" | "instant";
}

export interface CaseAnchors {
  ambient?: AnchorValue;
  named: Map<string, AnchorValue>;
  diagnostics: FactDateDiagnostic[];
}

export type FactDateResult =
  | { kind: "resolved"; date: string }
  | { kind: "missing" }
  | { kind: "error"; diagnostic: FactDateDiagnostic };

function fixedDate(value: string): AnchorValue | undefined {
  // REFACTOR:grounded (#320, review 556 round 2): fixed clauses require a complete valid date;
  // the shared FHIR validator checks the calendar before Date is used for arithmetic.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValidFhirTemporal(value)) return undefined;
  const instant = new Date(`${value}T00:00:00.000Z`);
  return { instant, precision: "date" };
}

// REFACTOR:grounded (#320, review 556): scale the parsed duration's canonical decimal exactly.
// Floating multiplication makes e.g. 1.001 seconds look like 1000.9999999999999ms. An epsilon
// would also admit some real sub-ms deltas, so use integer rational arithmetic instead.
function elapsedMilliseconds(value: number, millisecondsPerUnit: number): number | undefined {
  const [coefficient, exponent = "0"] = value.toString().split("e");
  const fractionalDigits = coefficient.split(".")[1]?.length ?? 0;
  const power = Number(exponent) - fractionalDigits;
  const numerator = BigInt(coefficient.replace(".", "")) * BigInt(millisecondsPerUnit);
  let scaled: bigint;
  if (power >= 0) scaled = numerator * 10n ** BigInt(power);
  else {
    const denominator = 10n ** BigInt(-power);
    if (numerator % denominator !== 0n) return undefined;
    scaled = numerator / denominator;
  }
  const milliseconds = Number(scaled);
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
}

function offsetAnchor(base: AnchorValue, offset?: CELDurationOffset): AnchorValue | undefined {
  // REFACTOR:grounded (#320, review 556): never serialize an expanded ISO year as a four-digit FHIR date.
  if (
    !Number.isFinite(base.instant.getTime()) ||
    base.instant.getUTCFullYear() < 1 ||
    base.instant.getUTCFullYear() > 9999
  )
    return undefined;
  if (!offset) return base;
  if (!Number.isFinite(offset.value) || offset.value < 0) return undefined;
  const value = offset.value * (offset.sign === "+" ? 1 : -1);
  const unit = offset.unit.replace(/s$/, "");
  const instant = new Date(base.instant.getTime());
  const elapsed: Record<string, number> = {
    week: 604800000,
    day: 86400000,
    hour: 3600000,
    minute: 60000,
    second: 1000,
    millisecond: 1,
  };
  if (unit === "month" || unit === "year") {
    // REFACTOR:grounded (#320, review 556): an undecided fractional calendar offset must
    // fail explicitly, rather than JavaScript silently truncating it to an integer.
    if (!Number.isInteger(value)) return undefined;
    // REFACTOR:suspect (#320): retain existing UTC calendar rollover for compatibility.
    // Integer month-end policy needs a separate authored temporal contract.
    if (unit === "month") instant.setUTCMonth(instant.getUTCMonth() + value);
    else instant.setUTCFullYear(instant.getUTCFullYear() + value);
  } else if (elapsed[unit] !== undefined) {
    const milliseconds = elapsedMilliseconds(value, elapsed[unit]);
    // REFACTOR:grounded (#320, review 556): Date would silently clip a sub-millisecond offset.
    if (milliseconds === undefined) return undefined;
    instant.setTime(instant.getTime() + milliseconds);
  } else return undefined;
  if (
    !Number.isFinite(instant.getTime()) ||
    instant.getUTCFullYear() < 1 ||
    instant.getUTCFullYear() > 9999
  )
    return undefined;
  const subDay =
    ["hour", "minute", "second", "millisecond"].includes(unit) ||
    ((unit === "day" || unit === "week") && !Number.isInteger(value));
  return { instant, precision: base.precision === "instant" || subDay ? "instant" : "date" };
}

function formatAnchor(value: AnchorValue): string {
  const iso = value.instant.toISOString();
  return value.precision === "date" ? iso.slice(0, 10) : iso;
}

/** The caller captures one clock per run/emit. Only an explicitly authored `now` consumes it. */
export function buildCaseAnchors(c: CELCase, now: Date): CaseAnchors {
  const out: CaseAnchors = { named: new Map(), diagnostics: [] };
  const seen = new Set<string | undefined>();
  for (const field of c.body) {
    if (field.type !== "CELAnchorField") continue;
    const label = field.name === undefined ? "ambient anchor" : `anchor "${field.name}"`;
    if (seen.has(field.name)) {
      out.diagnostics.push({
        kind: "duplicate-anchor",
        message: `Duplicate ${label} in case "${c.name}".`,
        location: field.location,
      });
      continue;
    }
    seen.add(field.name);
    const expr = field.expr;
    const value =
      expr.type === "CELFixedDateAnchor"
        ? fixedDate(expr.date)
        : Number.isFinite(now.getTime())
          ? offsetAnchor({ instant: new Date(now.getTime()), precision: "instant" }, expr.offset)
          : undefined;
    if (!value) {
      out.diagnostics.push({
        kind: "invalid-date",
        message: `Cannot resolve ${label} in case "${c.name}": invalid date or offset.`,
        location: field.location,
      });
    } else if (field.name === undefined) out.ambient = value;
    else out.named.set(field.name, value);
  }
  return out;
}

function resolveAtClause(at: CELAtClause, anchors: CaseAnchors): FactDateResult {
  if (at.type === "CELAtAbsoluteDate") {
    return fixedDate(at.date)
      ? { kind: "resolved", date: at.date }
      : {
          kind: "error",
          diagnostic: {
            kind: "invalid-date",
            message: `Invalid authored date "${at.date}".`,
            location: at.location,
          },
        };
  }
  const base = at.type === "CELAtAnchor" ? anchors.ambient : anchors.named.get(at.anchorName);
  if (!base)
    return {
      kind: "error",
      diagnostic: {
        kind: "missing-anchor",
        message:
          at.type === "CELAtAnchor"
            ? "No resolved ambient anchor for authored fact date."
            : `No resolved anchor "${at.anchorName}" for authored fact date.`,
        location: at.location,
      },
    };
  const value = offsetAnchor(base, at.offset);
  return value
    ? { kind: "resolved", date: formatAnchor(value) }
    : {
        kind: "error",
        diagnostic: {
          kind: "invalid-date",
          message: "Invalid authored fact date offset.",
          location: at.location,
        },
      };
}

/** REFACTOR:grounded (#320, review 556): invalid/duplicate dates stay errors even with a case override. */
export function factDateDeclarationDiagnostic(
  fact: CELFact | undefined,
): FactDateDiagnostic | undefined {
  if (!fact) return undefined;
  let seen = false;
  for (const field of fact.body) {
    if (field.type !== "CELDateField") continue;
    if (seen)
      return {
        kind: "duplicate-date",
        message: `Fact "${fact.name}" has more than one 'date is' field.`,
        location: field.location,
        factName: fact.name,
      };
    seen = true;
  }
  // REFACTOR:grounded (#320, review 556 round 2): date-is is FHIR temporal input, not arbitrary text.
  // Check the declaration even when unused or overridden, while preserving every accepted authored byte.
  const date = fact.body.find((field) => field.type === "CELDateField");
  if (date && !isValidFhirTemporal(date.value))
    return {
      kind: "invalid-date",
      message: `Fact "${fact.name}" has invalid FHIR date/dateTime '${date.value}'.`,
      location: date.location,
      factName: fact.name,
    };
  // REFACTOR:grounded (#320, review 556 round 3): Patient.birthDate is FHIR date, not dateTime.
  // Validate at the shared declaration boundary so subject references cannot bypass this check.
  const birthDates = fact.body.filter((field) => field.type === "CELBirthDateField");
  if (birthDates.length > 1)
    return {
      kind: "duplicate-date",
      message: `Fact "${fact.name}" has more than one 'birth date is' field.`,
      location: birthDates[1].location,
      factName: fact.name,
    };
  const birthDate = birthDates[0];
  if (birthDate && !isValidFhirDate(birthDate.value))
    return {
      kind: "invalid-date",
      message: `Fact "${fact.name}" has invalid FHIR birth date '${birthDate.value}'; use YYYY, YYYY-MM, or YYYY-MM-DD.`,
      location: birthDate.location,
      factName: fact.name,
    };
  return undefined;
}

export function resolveFactDate(
  ref: CELFactRefField | undefined,
  fact: CELFact | undefined,
  anchors: CaseAnchors,
): FactDateResult {
  // REFACTOR:grounded (#320, review 556): an override cannot conceal an invalid declaration.
  const declarationError = factDateDeclarationDiagnostic(fact);
  if (declarationError) return { kind: "error", diagnostic: declarationError };
  if (ref?.at) {
    const result = resolveAtClause(ref.at, anchors);
    return result.kind === "error"
      ? { kind: "error", diagnostic: { ...result.diagnostic, factName: ref.factName } }
      : result;
  }
  // REFACTOR:grounded (#320, review 556 round 2): valid authored temporal values retain their spelling.
  // Validation alone does not promise comparison support or establish a final recency selection policy.
  const bodyDate = fact?.body.find((field) => field.type === "CELDateField")?.value;
  return bodyDate === undefined ? { kind: "missing" } : { kind: "resolved", date: bodyDate };
}

/** Validate before either lane creates candidates/resources, including clauses on skipped fact refs. */
export function resolveCaseFactDates(
  c: CELCase,
  facts: Map<string, CELFact>,
  now: Date,
): {
  anchors: CaseAnchors;
  dates: Map<CELFactRefField, string | undefined>;
  diagnostics: FactDateDiagnostic[];
} {
  const anchors = buildCaseAnchors(c, now);
  const dates = new Map<CELFactRefField, string | undefined>();
  const diagnostics = [...anchors.diagnostics];
  for (const ref of c.body) {
    // REFACTOR:grounded (#320, review 556): subject and ambient encounter references also
    // use fact declarations; skipping their date emission must not hide invalid/duplicate authoring.
    if (ref.type === "CELSubjectField" || ref.type === "CELEncounterField") {
      const declarationError = factDateDeclarationDiagnostic(facts.get(ref.factName));
      if (declarationError) diagnostics.push(declarationError);
      continue;
    }
    if (ref.type !== "CELFactRefField") continue;
    const result = resolveFactDate(ref, facts.get(ref.factName), anchors);
    if (result.kind === "error") diagnostics.push(result.diagnostic);
    else dates.set(ref, result.kind === "resolved" ? result.date : undefined);
  }
  return { anchors, dates, diagnostics };
}
