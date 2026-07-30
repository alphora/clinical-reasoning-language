// #215 — the SINGLE source of truth for "is this canonical call a sanctioned age
// predicate?", shared by the emit lowering gate (`ageTodayRecencyThreshold`) and the
// author-time validator (`AgePredicateValidator`). Keeping ONE definition prevents a
// validate/emit drift where the two disagree on the sanctioned op set — which would be
// WORSE than the divergence #215 closes (the validator would block legal content, or the
// emitter would silently miscompile what validated green).
import type { AgeRecencyOp, NarrativeClause } from "../ast/types";
import type { CanonicalPatternCall } from "./canonicalTypes";

/** The sanctioned age comparators, as canonical pattern names. Single source (the marker
 * type `AgeRecencyOp` in ast/types is the shape twin). */
export const AGE_PREDICATE_OPS: readonly AgeRecencyOp[] = ["AtLeast", "AtMost", "Below"];

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

/** A sanctioned age-TODAY call: `<op>(AgeAt() [no-arg], Quantity)`. Returns the op, else null.
 * The no-arg `AgeAt()` guard keeps a generic `<ConceptRef> at most <Q>` (same op name, but a
 * ConceptRef at arg[0]) OUT — the load-bearing collision guard shared with the emit gate. */
export function sanctionedAgeTodayOp(call: CanonicalPatternCall): AgeRecencyOp | null {
  const op = opOf(call);
  if (op === null) return null;
  const a0 = call.args[0];
  if (a0?.type !== "NestedPatternArg" || a0.pattern.pattern !== "AgeAt" || a0.pattern.args.length !== 0) {
    return null;
  }
  return op;
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
