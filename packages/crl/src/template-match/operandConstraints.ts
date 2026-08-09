/**
 * Operand INPUT constraints for canonical patterns — concept-model redesign Todo 2, rule B.
 *
 * THE HEADLINE (do not violate): patterns are SEMANTIC — they carry NO return types
 * (inference-pattern catalog v0.6/0.7; memory `feedback_patterns-are-semantic`, disc 016).
 * This registry therefore constrains ONLY a pattern's OPERAND value types (an INPUT
 * requirement), NEVER its result. `most recent X` selects an instance by TIMESTAMP, so X must
 * have an instance stream — i.e. must NOT be a derived boolean; `X at least 30 'kg/m2'` compares
 * a magnitude, so X must be a `Quantity`. Neither reads nor asserts a return type. Rule B is
 * explicitly NOT "infer the pattern's return type and compare it to the declared value type" —
 * that is the return-type-authoritative model the catalog retired (disc 016's correction loop).
 *
 * DELIBERATELY NOT a full pattern-signature catalog (named `operandConstraints`, not
 * `patternSignatures`, per disc 397 gpt56 #4): it must not become a second, drifting authority
 * that re-encodes the catalog's pattern shapes. It carries operand INPUT constraints and nothing
 * else — seeded with only the two design-cited families, each corpus-confronted (disc 397).
 *
 * Keyed by the canonical `pattern` name produced by `matchNarrative` (template-match/matcher).
 * A registry self-validation test (validator/tests/useSiteType.test.ts) drives the matcher with a
 * representative narrative for every entry and asserts the constrained arg position is a real
 * concept-operand slot — so a matcher arg-order change can't silently disable a check.
 */

import type { ConceptValueType } from "../grammar/conceptValueTypes";

/** A required value-type shape for one operand position. */
export type OperandShape =
  // The operand must not be a DERIVED value of this type. Both `time-selection` and `refinement`
  // (below) use `not-derived boolean`: a DERIVED boolean (computed by `defined as` / `definition is`)
  // has no event INSTANCES — it is a bare truth. A *coded / sourced* boolean (asserted, its instances
  // carry event dates and `.status` etc.) is validly selectable AND refinable, so this is derivation-
  // aware, NOT a blanket "not boolean". The validator checks whether the operand's value is inferred.
  // (Todo-4 impl review, disc 404 Q1: a coded boolean's define is a RETRIEVE LIST regardless of value
  // type — `WasPerformed([Observation: …])` is valid CQL — so blanket rejection would false-positive
  // and contradict the shipped disc-400 time-selection carve-out. Part 2's composition-leaf check IS
  // blanket, but that lane keys on `declaredShape`, not the define; it lives in the validator, not
  // here.)
  | { rel: "not-derived"; valueType: ConceptValueType }
  // The operand MUST declare this value type. Value-comparison uses `is Quantity`: a magnitude
  // comparison is only meaningful over a Quantity operand.
  | { rel: "is"; valueType: ConceptValueType };

/**
 * The diagnostic family a constraint belongs to. `time-selection` and `refinement` share the same
 * SHAPE (`not-derived boolean`) but produce DIFFERENT diagnostics + rule codes, so the family — not
 * the shape's `rel` — selects the message. `refinement` additionally stays SILENT on an untyped
 * operand (those positions are ubiquitous; A.10 owns the untyped case).
 */
export type OperandFamily = "time-selection" | "value-comparison" | "refinement";

export interface OperandConstraint {
  /** 0-based index into `CanonicalPatternCall.args` (the matcher emits the concept operand first). */
  position: number;
  shape: OperandShape;
  /** Which diagnostic + rule code this position produces (see `OperandFamily`). */
  family: OperandFamily;
  /** What this operand position IS, for the teaching diagnostic (e.g. "the selected concept"). */
  role: string;
}

const NOT_DERIVED_BOOLEAN: OperandShape = { rel: "not-derived", valueType: "boolean" };
const IS_QUANTITY: OperandShape = { rel: "is", valueType: "Quantity" };

// Time-selection — selects an instance by timestamp. A DERIVED BOOLEAN has no instance stream
// (refinement 1's actual bug: `most recent "Mammogram"` over a `defined as exists` boolean). Any
// value-bearing operand is fine — `most recent "BMI"` where BMI is a Quantity is valid
// (cms69-strategy / cms22-strategy). So the constraint is NOT-derived-boolean, not must-be-dateTime.
const timeSelection: readonly OperandConstraint[] = [
  { position: 0, shape: NOT_DERIVED_BOOLEAN, family: "time-selection", role: "the selected concept" },
];

// Value comparison — compares a magnitude. The compared operand must be a Quantity. (Unit
// checking — `Quantity<U>` — is deliberately out of scope; catalog work, later.)
const valueComparison: readonly OperandConstraint[] = [
  { position: 0, shape: IS_QUANTITY, family: "value-comparison", role: "the compared value" },
];

// Refinement predicate — narrows a resource INSTANCE stream by a clinical field (`.status`,
// `.reasonCode`, …). Its SUBJECT (arg 0) is the event being refined, so it must have an instance
// stream — not a DERIVED boolean (concept-model redesign Todo 4). A CODED boolean subject is ALLOWED:
// its define is a `[Observation: …]` retrieve list, so the value type does not disqualify it (whether
// a particular predicate's RESOURCE signature accepts it — Observation vs Condition — is a separate,
// non-value-type concern rule B does not police; disc 404 R2 Q4). `WithoutRecordOf` and `Has` are
// DELIBERATELY NOT registered: they consume a DERIVED boolean by design (closed-world negation over a
// truth), so constraining them would be a false positive (disc 403 [imp] #4).
const refinementSubject: readonly OperandConstraint[] = [
  { position: 0, shape: NOT_DERIVED_BOOLEAN, family: "refinement", role: "the refined event" },
];

const anchor = (position: number, role: string): OperandConstraint => ({
  position,
  shape: NOT_DERIVED_BOOLEAN,
  family: "refinement",
  role,
});

/**
 * The seeded operand constraints. Constrained positions are NOT all arg 0 (disc 403 [imp] #3): a
 * temporal-anchor operand can be non-zero (the window patterns carry the anchor at arg 1, after the
 * duration Quantity), and `ComponentOf` / `SameDay` / the two-event temporals constrain BOTH concept
 * operands. The registry self-validation drives the matcher with a representative narrative per entry
 * and asserts each constrained position is a real concept-operand slot at THAT pattern (reaching into
 * a nested scope call for the nested-only anchors), so a matcher arg-order change can't silently
 * disable a check. `OnOrBefore` arg 0 is intentionally UNCONSTRAINED — `CRLCommon` gives it a Boolean
 * overload (`OnOrBefore(X Boolean, anchor DateTime)`), so a boolean subject there is legal.
 *
 * SEEDED, NOT EXHAUSTIVE (disc 404 R2 Q2 / R3 P3). Covered here: time-selection, value-comparison, the
 * refinement predicates + their reason operands, temporal anchors (incl. windows + two-event
 * temporals), and `DocumentedAs`. NOT yet covered (tracked in #266, distinct families needing their
 * own message design): value-selection (`Lowest`/`Highest`), the value-class predicates
 * (`Low`/`High`/`Normal`/`Abnormal` — Quantity), `Calculate` (Quantity), age (`AgeAt` / nested
 * `StartOf`), and the Has-history predicates (`HasHistoryOf` / `HasAdverseReactionTo` /
 * `CurrentlyTaking`). Bare `Has` / `WithoutRecordOf` stay EXCLUDED by design (they consume a truth).
 */
export const OPERAND_CONSTRAINTS: Readonly<Record<string, readonly OperandConstraint[]>> = {
  // Time-selection (selected concept — arg 0).
  MostRecent: timeSelection,
  Last: timeSelection,
  Earliest: timeSelection,
  First: timeSelection,
  // Value-comparison (compared value — arg 0).
  AtLeast: valueComparison,
  AtMost: valueComparison,
  Below: valueComparison,
  Exceeds: valueComparison,
  Between: valueComparison,
  // Refinement predicates — the refined event (arg 0) must be an instance stream, not a derived
  // boolean. `During`/`Active` also anchor over a period at arg 1 (see the anchor block); the reason /
  // classification operands (`Justified`/`NotDoneWithReason`/`DocumentedAs` arg 1) are resource lists
  // too (`CRLCommon` — `List<Condition>` / `List<Observation>`), so they carry the same constraint.
  WasPerformed: refinementSubject,
  WasOrdered: refinementSubject,
  IsVerified: refinementSubject,
  NotDoneWithReason: [anchor(0, "the not-done action"), anchor(1, "the reason")],
  Justified: [anchor(0, "the justified action"), anchor(1, "the justification reason")],
  DocumentedAs: [anchor(0, "the documented event"), anchor(1, "the classification")],
  AtLeastApart: [anchor(0, "the first event"), anchor(1, "the second event")], // arg 2 is a Quantity
  AtMostApart: [anchor(0, "the first event"), anchor(1, "the second event")],
  During: [anchor(0, "the timed event"), anchor(1, "the period")],
  Active: [anchor(0, "the active event"), anchor(1, "the active-during period")],
  // Temporal anchors — the anchor event supplies the day / window / comparison boundary, so it too
  // must be an instance stream (a derived boolean has no timestamp). `OnDayOf`/`AsOf` carry the
  // anchor at arg 0; the window patterns carry it at arg 1 (after the duration Quantity); the
  // two-event / event+anchor temporals constrain both concept slots.
  OnDayOf: [anchor(0, "the day-anchor event")],
  AsOf: [anchor(0, "the as-of anchor event"), anchor(1, "the as-of subject")],
  SameDay: [anchor(0, "the first same-day event"), anchor(1, "the second same-day event")],
  Overlaps: [anchor(0, "the first overlapping event"), anchor(1, "the second overlapping event")],
  OnDayOfOrAfter: [anchor(0, "the subject event"), anchor(1, "the day anchor")],
  OnOrBefore: [anchor(1, "the on-or-before anchor")], // arg 0 has a Boolean overload — do not constrain
  BeforeStartOf: [anchor(1, "the window-anchor event")],
  AfterStartOf: [anchor(1, "the window-anchor event")],
  BeforeEndOf: [anchor(1, "the window-anchor event")],
  AfterEndOf: [anchor(1, "the window-anchor event")],
  // `ComponentOf(panel, discriminator)` — both concept operands select over resource instances /
  // codings; neither is a derived boolean (disc 403 [imp] #3, "BOTH args of ComponentOf").
  ComponentOf: [anchor(0, "the panel"), anchor(1, "the component discriminator")],
};

/** Human phrase for what an operand at this constraint demands (teaching diagnostics + the warning). */
export function operandExpectation(constraint: OperandConstraint): string {
  switch (constraint.family) {
    case "value-comparison":
      return `\`${constraint.shape.valueType}\`-valued`;
    case "time-selection":
      return `not a derived \`${constraint.shape.valueType}\` (a computed value has no event date to select over)`;
    case "refinement":
      return (
        `an event instance stream, not a derived \`${constraint.shape.valueType}\` ` +
        `(a computed truth has no instances to filter or anchor over)`
      );
  }
}
