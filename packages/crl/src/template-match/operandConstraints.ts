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
  // The operand must not be a DERIVED value of this type — i.e. a stream-less computed fact.
  // Time-selection uses `not-derived boolean`: a DERIVED boolean has no instance stream to select
  // the most-recent/earliest over (design refinement 1). A *coded* boolean (with a `code is` /
  // `source representation`, hence an instance stream) is validly selectable — so this is
  // derivation-aware, NOT a blanket "not boolean" (the validator checks the operand's stream).
  | { rel: "not-derived"; valueType: ConceptValueType }
  // The operand MUST declare this value type. Value-comparison uses `is Quantity`: a magnitude
  // comparison is only meaningful over a Quantity operand.
  | { rel: "is"; valueType: ConceptValueType };

export interface OperandConstraint {
  /** 0-based index into `CanonicalPatternCall.args` (the matcher emits the concept operand first). */
  position: number;
  shape: OperandShape;
  /** What this operand position IS, for the teaching diagnostic (e.g. "the selected concept"). */
  role: string;
}

const NOT_DERIVED_BOOLEAN: OperandShape = { rel: "not-derived", valueType: "boolean" };
const IS_QUANTITY: OperandShape = { rel: "is", valueType: "Quantity" };

// Time-selection — selects an instance by timestamp. A DERIVED BOOLEAN has no instance stream
// (refinement 1's actual bug: `most recent "Mammogram"` over a `defined as exists` boolean). Any
// value-bearing operand is fine — `most recent "BMI"` where BMI is a Quantity is valid
// (cms69-strategy / cms22-strategy). So the constraint is NOT-boolean, not must-be-dateTime.
const timeSelection: readonly OperandConstraint[] = [
  { position: 0, shape: NOT_DERIVED_BOOLEAN, role: "the selected concept" },
];

// Value comparison — compares a magnitude. The compared operand must be a Quantity. (Unit
// checking — `Quantity<U>` — is deliberately out of scope; catalog work, later.)
const valueComparison: readonly OperandConstraint[] = [
  { position: 0, shape: IS_QUANTITY, role: "the compared value" },
];

/**
 * The seeded operand constraints. Every constrained position is arg 0 — the selected/compared
 * concept operand — because the matcher always emits the concept operand first (the Quantity
 * threshold, scope, anchor, etc. follow it). See the matcher's `makeCall` sites.
 */
export const OPERAND_CONSTRAINTS: Readonly<Record<string, readonly OperandConstraint[]>> = {
  MostRecent: timeSelection,
  Last: timeSelection,
  Earliest: timeSelection,
  First: timeSelection,
  AtLeast: valueComparison,
  AtMost: valueComparison,
  Below: valueComparison,
  Exceeds: valueComparison,
  Between: valueComparison,
};

/** Human phrase for what an operand shape demands (teaching diagnostics + the untyped warning). */
export function operandShapeDescription(shape: OperandShape): string {
  return shape.rel === "is"
    ? `\`${shape.valueType}\`-valued`
    : `not a derived \`${shape.valueType}\` (it needs an instance stream to select over)`;
}
