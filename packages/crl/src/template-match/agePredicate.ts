// #215 — the SINGLE source of truth for "is this canonical call a sanctioned age
// predicate?", shared by the emit lowering (`resolveRecencyProjection` / `resolveAgeConcept`
// in recencyProjectionOverride.ts) and the author-time validator (`AgePredicateValidator`).
// Keeping ONE definition prevents a validate/emit drift where the two disagree on the
// sanctioned op set — which would be WORSE than the divergence #215 closes (the validator
// would block legal content, or the emitter would silently miscompile what validated green).
import type { AgeComputeFn, AgeRecencyOp, NarrativeClause } from "../ast/types";
import type { CanonicalPatternCall } from "./canonicalTypes";

/** The sanctioned age comparators, as canonical pattern names. Single source (the marker
 * type `AgeRecencyOp` in ast/types is the shape twin). */
export const AGE_PREDICATE_OPS: readonly AgeRecencyOp[] = ["AtLeast", "AtMost", "Below"];

/** The sanctioned age-today UNITS → the no-arg CRLCommon compute fn that computes age in that
 * unit (#257 T2). The compute fn MUST match the threshold's unit — `AgeAt()` is whole YEARS,
 * `AgeInMonths()` is whole MONTHS — because the comparator overloads `<Op>(Integer, Quantity)`
 * are unit-BLIND (`.value` only, CRLCommon.cql), so `AgeAt() >= 6 'months'` would silently mean
 * `ageYears >= 6` (#215). This table is the SINGLE choice point: the matcher calls
 * `ageComputeFnForUnit` to pick which fn a sanctioned `age today <cmp> <Q>` emits, and
 * `sanctionedAgeTodayOp` re-checks the pairing off the matched call — never a second choice. A
 * non-{year,month} unit (day/week) is absent → the match fails → a LOUD sentinel, never a silent
 * unit-blind miscompile. Anchored `age at start of` stays YEARS-ONLY (need-driven; see the four
 * `ageAtStartOf*` matchers' `isYearQuantity` guard). */
const AGE_UNIT_COMPUTE_FN: Readonly<Record<string, AgeComputeFn>> = {
  year: "AgeAt",
  years: "AgeAt",
  month: "AgeInMonths",
  months: "AgeInMonths",
};

/** The compute fn for a sanctioned age-today unit, or null for an unsanctioned unit. */
export function ageComputeFnForUnit(unit: string): AgeComputeFn | null {
  return AGE_UNIT_COMPUTE_FN[unit] ?? null;
}

/** True iff `unit` is a sanctioned age-today unit (years or months). */
export function isSanctionedAgeUnit(unit: string): boolean {
  return ageComputeFnForUnit(unit) !== null;
}

function firstWords(c: NarrativeClause, ...words: string[]): boolean {
  const e = c.elements;
  if (e.length < words.length) return false;
  return words.every((w, i) => e[i].type === "NWord" && (e[i] as { value: string }).value === w);
}

/** `age today …` — the live-today predicate prefix. ALWAYS a predicate attempt (there is
 * no bare `age today` calculation), so a prefix screen cannot false-positive a legal form. */
export function isAgeTodayPrefix(c: NarrativeClause): boolean {
  return firstWords(c, "age", "today");
}

/** `age at start of …` — the anchored predicate prefix. ALSO always a predicate attempt:
 * the only bare age calculation is the 3-element `age at <ConceptRef>` (`ageAt`), which does
 * NOT share this 4-word prefix — so screening `age at start of` cannot false-positive it. */
export function isAgeAtStartOfPrefix(c: NarrativeClause): boolean {
  return firstWords(c, "age", "at", "start", "of");
}

function opOf(call: CanonicalPatternCall): AgeRecencyOp | null {
  if (!call.known) return null;
  if (!AGE_PREDICATE_OPS.includes(call.pattern as AgeRecencyOp)) return null;
  if (call.args.length !== 2) return null;
  return call.pattern as AgeRecencyOp;
}

/** A sanctioned age-TODAY predicate, resolved from the matched canonical call: the comparator op
 * PLUS the no-arg compute fn (`AgeAt` years / `AgeInMonths` months) the matcher chose. Carrying the
 * compute fn here — read off the matched call, not re-derived from the unit — makes the matcher the
 * SOLE choice point, so the recency emit cannot pick a different fn than the standalone lower (#257
 * T2, Q1). */
export interface SanctionedAgeToday {
  op: AgeRecencyOp;
  computeFn: AgeComputeFn;
}

/** Classify a sanctioned age-TODAY call: `<op>(<AgeAt()|AgeInMonths()> [no-arg], <Quantity>)`.
 * Returns `{op, computeFn}`, else null. Guards, all load-bearing (shared with the emit gate):
 *   - arg[0] is a NO-ARG compute fn in the sanctioned set — keeps a generic `<ConceptRef> at most
 *     <Q>` (same op name, a ConceptRef at arg[0]) OUT, and the anchored `AgeAt(StartOf(…))` (1-arg)
 *     OUT (`sanctionedAgeAnchoredOp` owns that);
 *   - the compute fn MATCHES the threshold's unit family (`AgeAt`↔years, `AgeInMonths`↔months) —
 *     rejects an inconsistent `AgeAt() + months` / `AgeInMonths() + years` that would miscompile
 *     through the unit-blind comparator overload (#215). The matcher only ever produces a matched
 *     pair, but this classifier is the shared defensive gate, so it closes the hole structurally. */
export function sanctionedAgeTodayOp(call: CanonicalPatternCall): SanctionedAgeToday | null {
  const op = opOf(call);
  if (op === null) return null;
  const a0 = call.args[0];
  if (a0?.type !== "NestedPatternArg" || a0.pattern.args.length !== 0) return null;
  const computeFn = a0.pattern.pattern;
  if (computeFn !== "AgeAt" && computeFn !== "AgeInMonths") return null;
  const a1 = call.args[1];
  if (a1?.type !== "QuantityArg" || ageComputeFnForUnit(a1.unit) !== computeFn) return null;
  return { op, computeFn };
}

/** A sanctioned ANCHORED call: `<op>(AgeAt(StartOf(<ref>)), Quantity)`. Returns the op, else null. */
export function sanctionedAgeAnchoredOp(call: CanonicalPatternCall): AgeRecencyOp | null {
  const op = opOf(call);
  if (op === null) return null;
  const a0 = call.args[0];
  if (a0?.type !== "NestedPatternArg" || a0.pattern.pattern !== "AgeAt" || a0.pattern.args.length !== 1) {
    return null;
  }
  const inner = a0.pattern.args[0];
  if (inner?.type !== "NestedPatternArg" || inner.pattern.pattern !== "StartOf") return null;
  return op;
}
