/**
 * Template-match engine — walks a NarrativeClause's element stream and
 * matches it against catalog patterns to produce a CanonicalPatternCall.
 *
 * Strategy: try patterns in declaration order; longer/more-specific templates
 * are declared first so they win on overlap (e.g. `<X> on or before <Y>` is
 * tried before any 2-element pattern that starts with `<X> on`).
 *
 * Unknown narrative produces a soft-compile placeholder:
 *   { pattern: "<unmatched-narrative-text>", args: [], known: false }
 *
 * Adding a new pattern: append a PatternMatcher to the PATTERNS array.
 * The matcher takes the element stream and returns either a CanonicalPatternCall
 * or null (meaning try the next pattern).
 */

import type {
  NarrativeClause,
  NarrativeElement,
  NConceptRef,
  NWord,
  Quantity,
  NDisjunction,
  NConjunction,
  Location,
} from "../ast/types";

import type {
  CanonicalArg,
  CanonicalPatternCall,
  ConceptRefArg,
  QuantityArg,
  EnumArg,
  DisjunctionArg,
  ConjunctionArg,
  NestedPatternArg,
} from "./canonicalTypes";

/** Match a NarrativeClause to a single canonical pattern call. */
export function matchNarrative(clause: NarrativeClause): CanonicalPatternCall {
  const els = clause.elements;
  for (const pattern of PATTERNS) {
    const match = pattern(els, clause.location);
    if (match !== null) return match;
  }
  // Soft-compile fallback: unknown pattern. The text is the joined narrative.
  return softCompileUnknown(clause);
}

function softCompileUnknown(clause: NarrativeClause): CanonicalPatternCall {
  const text = clause.elements
    .map((e) => narrativeElementText(e))
    .join(" ");
  return {
    type: "CanonicalPatternCall",
    pattern: text,
    args: [],
    known: false,
    location: clause.location,
  };
}

function narrativeElementText(e: NarrativeElement): string {
  switch (e.type) {
    case "NConceptRef":
      return `"${e.value}"`;
    case "NWord":
      return e.value;
    case "Quantity":
      return `${e.value} ${e.unit}`;
    case "NDisjunction":
      return `(${e.disjuncts.map(argValueText).join(" or ")})`;
    case "NConjunction":
      return `(${e.conjuncts.map(argValueText).join(" and ")})`;
  }
}

function argValueText(v: NarrativeElement): string {
  return narrativeElementText(v);
}

// === Helper builders ===

function conceptRefArg(e: NConceptRef): ConceptRefArg {
  return { type: "ConceptRefArg", value: e.value, location: e.location };
}

function quantityArg(e: Quantity): QuantityArg {
  return { type: "QuantityArg", value: e.value, unit: e.unit, location: e.location };
}

function enumArg(e: NWord): EnumArg {
  return { type: "EnumArg", value: e.value, location: e.location };
}

function disjunctionArg(e: NDisjunction): DisjunctionArg {
  return {
    type: "DisjunctionArg",
    disjuncts: e.disjuncts.map(narrativeElementToArg).filter((a): a is CanonicalArg => a !== null),
    location: e.location,
  };
}

function conjunctionArg(e: NConjunction): ConjunctionArg {
  return {
    type: "ConjunctionArg",
    conjuncts: e.conjuncts.map(narrativeElementToArg).filter((a): a is CanonicalArg => a !== null),
    location: e.location,
  };
}

function narrativeElementToArg(e: NarrativeElement): CanonicalArg | null {
  switch (e.type) {
    case "NConceptRef":
      return conceptRefArg(e);
    case "Quantity":
      return quantityArg(e);
    case "NDisjunction":
      return disjunctionArg(e);
    case "NConjunction":
      return conjunctionArg(e);
    case "NWord":
      return null; // bare words aren't args by themselves
  }
}

function makeCall(
  pattern: string,
  args: CanonicalArg[],
  location: Location,
): CanonicalPatternCall {
  return { type: "CanonicalPatternCall", pattern, args, known: true, location };
}

function nestedArg(pattern: CanonicalPatternCall): NestedPatternArg {
  return { type: "NestedPatternArg", pattern, location: pattern.location };
}

// === Element-shape helpers ===

function isWord(e: NarrativeElement | undefined, ...allowed: string[]): boolean {
  return !!e && e.type === "NWord" && (allowed.length === 0 || allowed.includes(e.value));
}

function isConceptRef(e: NarrativeElement | undefined): e is NConceptRef {
  return !!e && e.type === "NConceptRef";
}

function isQuantity(e: NarrativeElement | undefined): e is Quantity {
  return !!e && e.type === "Quantity";
}

function isDisjunction(e: NarrativeElement | undefined): e is NDisjunction {
  return !!e && e.type === "NDisjunction";
}

function isConjunction(e: NarrativeElement | undefined): e is NConjunction {
  return !!e && e.type === "NConjunction";
}

/** Match a sequence of word tokens starting at index i. Returns next index or null. */
function matchWords(els: NarrativeElement[], i: number, words: string[]): number | null {
  for (const w of words) {
    if (!isWord(els[i], w)) return null;
    i++;
  }
  return i;
}

// === Pattern matchers ===
// Order matters: longer / more-specific templates first.

type PatternMatcher = (
  els: NarrativeElement[],
  loc: Location,
) => CanonicalPatternCall | null;

/** `<X> not done with reason <reason>` → NotDoneWithReason(action, reason) */
const notDoneWithReason: PatternMatcher = (els, loc) => {
  if (els.length < 6) return null;
  if (!isConceptRef(els[0])) return null;
  const after = matchWords(els, 1, ["not", "done", "with", "reason"]);
  if (after === null) return null;
  if (after >= els.length) return null;
  const reason = els[after];
  let reasonArg: CanonicalArg | null = null;
  if (isConceptRef(reason)) reasonArg = conceptRefArg(reason);
  else if (isDisjunction(reason)) reasonArg = disjunctionArg(reason);
  else if (isConjunction(reason)) reasonArg = conjunctionArg(reason);
  if (!reasonArg) return null;
  if (after + 1 !== els.length) return null;
  return makeCall("NotDoneWithReason", [conceptRefArg(els[0] as NConceptRef), reasonArg], loc);
};

/** `<X> documented as <Y>` → DocumentedAs(X, classification) */
const documentedAs: PatternMatcher = (els, loc) => {
  if (els.length !== 4) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "documented")) return null;
  if (!isWord(els[2], "as")) return null;
  if (!isConceptRef(els[3])) return null;
  return makeCall("DocumentedAs", [conceptRefArg(els[0]), conceptRefArg(els[3])], loc);
};

/** `<X> justified by <Y>` → Justified(action, reason) */
const justifiedBy: PatternMatcher = (els, loc) => {
  if (els.length !== 4) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "justified")) return null;
  if (!isWord(els[2], "by")) return null;
  const reason = els[3];
  let reasonArg: CanonicalArg | null = null;
  if (isConceptRef(reason)) reasonArg = conceptRefArg(reason);
  else if (isDisjunction(reason)) reasonArg = disjunctionArg(reason);
  if (!reasonArg) return null;
  return makeCall("Justified", [conceptRefArg(els[0]), reasonArg], loc);
};

/** `<X> on or before <Y>` → OnOrBefore(X, anchor) */
const onOrBefore: PatternMatcher = (els, loc) => {
  if (els.length !== 5) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "on")) return null;
  if (!isWord(els[2], "or")) return null;
  if (!isWord(els[3], "before")) return null;
  if (!isConceptRef(els[4])) return null;
  return makeCall("OnOrBefore", [conceptRefArg(els[0]), conceptRefArg(els[4])], loc);
};

/** `<X> on day of or after <Y>` → OnDayOfOrAfter(X, anchor) */
const onDayOfOrAfter: PatternMatcher = (els, loc) => {
  if (els.length !== 7) return null;
  if (!isConceptRef(els[0])) return null;
  const after = matchWords(els, 1, ["on", "day", "of", "or", "after"]);
  if (after === null) return null;
  if (!isConceptRef(els[after])) return null;
  return makeCall("OnDayOfOrAfter", [conceptRefArg(els[0]), conceptRefArg(els[after] as NConceptRef)], loc);
};

/** `<X> same day as <Y>` → SameDay(eventA, eventB) */
const sameDayAs: PatternMatcher = (els, loc) => {
  if (els.length !== 5) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "same")) return null;
  if (!isWord(els[2], "day")) return null;
  if (!isWord(els[3], "as")) return null;
  if (!isConceptRef(els[4])) return null;
  return makeCall("SameDay", [conceptRefArg(els[0]), conceptRefArg(els[4])], loc);
};

/** `<X> component of <Y>` → ComponentOf(panel, discriminator) — note arg order is (panel, discriminator), narrative is (discriminator, panel) */
const componentOf: PatternMatcher = (els, loc) => {
  if (els.length !== 4) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "component")) return null;
  if (!isWord(els[2], "of")) return null;
  if (!isConceptRef(els[3])) return null;
  // Narrative: <discriminator> component of <panel>
  // Canonical: ComponentOf(panel, discriminator)
  return makeCall("ComponentOf", [conceptRefArg(els[3]), conceptRefArg(els[0])], loc);
};

/** `<X> active during <Y>` → Active(X, [during: Y]) */
const activeDuring: PatternMatcher = (els, loc) => {
  if (els.length !== 4) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "active")) return null;
  if (!isWord(els[2], "during")) return null;
  if (!isConceptRef(els[3])) return null;
  return makeCall("Active", [conceptRefArg(els[0]), conceptRefArg(els[3])], loc);
};

/** `<X> during <Y>` → During(event, period) */
const during: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "during")) return null;
  if (!isConceptRef(els[2])) return null;
  return makeCall("During", [conceptRefArg(els[0]), conceptRefArg(els[2])], loc);
};

/** `<X> overlaps <Y>` → Overlaps(eventA, eventB) */
const overlaps: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "overlaps")) return null;
  if (!isConceptRef(els[2])) return null;
  return makeCall("Overlaps", [conceptRefArg(els[0]), conceptRefArg(els[2])], loc);
};

/** `<X> at least <Q>` → AtLeast(value, target: Quantity) */
const atLeast: PatternMatcher = (els, loc) => {
  if (els.length !== 4) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "at")) return null;
  if (!isWord(els[2], "least")) return null;
  if (!isQuantity(els[3])) return null;
  return makeCall("AtLeast", [conceptRefArg(els[0]), quantityArg(els[3])], loc);
};

/** `<X> at most <Q>` → AtMost(value, target) */
const atMost: PatternMatcher = (els, loc) => {
  if (els.length !== 4) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "at")) return null;
  if (!isWord(els[2], "most")) return null;
  if (!isQuantity(els[3])) return null;
  return makeCall("AtMost", [conceptRefArg(els[0]), quantityArg(els[3])], loc);
};

/** `<X> below <Q>` → Below(value, target) */
const below: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "below")) return null;
  if (!isQuantity(els[2])) return null;
  return makeCall("Below", [conceptRefArg(els[0]), quantityArg(els[2])], loc);
};

/** `<X> exceeds <Q>` → Exceeds(value, target) */
const exceeds: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "exceeds")) return null;
  if (!isQuantity(els[2])) return null;
  return makeCall("Exceeds", [conceptRefArg(els[0]), quantityArg(els[2])], loc);
};

/** `<X> between <lo> and <hi>` → Between(value, lo, hi) */
const between: PatternMatcher = (els, loc) => {
  if (els.length !== 5) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "between")) return null;
  if (!isQuantity(els[2])) return null;
  if (!isWord(els[3], "and")) return null;
  if (!isQuantity(els[4])) return null;
  return makeCall(
    "Between",
    [conceptRefArg(els[0]), quantityArg(els[2]), quantityArg(els[4])],
    loc,
  );
};

/** `<X> verified` → IsVerified(X) */
const verified: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "verified")) return null;
  return makeCall("IsVerified", [conceptRefArg(els[0])], loc);
};

/** `<X> active` → Active(X) */
const active: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "active")) return null;
  return makeCall("Active", [conceptRefArg(els[0])], loc);
};

/** `<X> low|high|normal|abnormal` → Low|High|Normal|Abnormal(X) */
const valueClass: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isConceptRef(els[0])) return null;
  const classifier = els[1];
  if (!isWord(classifier, "low", "high", "normal", "abnormal")) return null;
  const name = (classifier as NWord).value;
  const cap = name[0].toUpperCase() + name.slice(1);
  return makeCall(cap, [conceptRefArg(els[0])], loc);
};

/** `most recent <X>` → MostRecent(X) */
const mostRecent: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isWord(els[0], "most")) return null;
  if (!isWord(els[1], "recent")) return null;
  if (!isConceptRef(els[2])) return null;
  return makeCall("MostRecent", [conceptRefArg(els[2])], loc);
};

/** `earliest <X>` → Earliest(X) */
const earliest: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isWord(els[0], "earliest")) return null;
  if (!isConceptRef(els[1])) return null;
  return makeCall("Earliest", [conceptRefArg(els[1])], loc);
};

/** `first <X>` → First(X) */
const first: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isWord(els[0], "first")) return null;
  if (!isConceptRef(els[1])) return null;
  return makeCall("First", [conceptRefArg(els[1])], loc);
};

/** `last <X>` → Last(X) — only matches when not followed by a scope */
const lastBare: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isWord(els[0], "last")) return null;
  if (!isConceptRef(els[1])) return null;
  return makeCall("Last", [conceptRefArg(els[1])], loc);
};

/** `calculated <X>` → Calculate(X) */
const calculated: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isWord(els[0], "calculated")) return null;
  if (!isConceptRef(els[1])) return null;
  return makeCall("Calculate", [conceptRefArg(els[1])], loc);
};

/** `lowest <X>` → Lowest(X) */
const lowest: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isWord(els[0], "lowest")) return null;
  if (!isConceptRef(els[1])) return null;
  return makeCall("Lowest", [conceptRefArg(els[1])], loc);
};

/** `highest <X>` → Highest(X) */
const highest: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isWord(els[0], "highest")) return null;
  if (!isConceptRef(els[1])) return null;
  return makeCall("Highest", [conceptRefArg(els[1])], loc);
};

/** `<X> performed` → WasPerformed(X) */
const performed: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "performed")) return null;
  return makeCall("WasPerformed", [conceptRefArg(els[0])], loc);
};

/** `<X> ordered` → WasOrdered(X) */
const ordered: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "ordered")) return null;
  return makeCall("WasOrdered", [conceptRefArg(els[0])], loc);
};

/** `without <kind> <X>` → Without(kind, X) */
const without: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isWord(els[0], "without")) return null;
  if (!isWord(els[1])) return null;
  if (!isConceptRef(els[2])) return null;
  return makeCall("Without", [enumArg(els[1] as NWord), conceptRefArg(els[2])], loc);
};

/** `without record of <X>` → Without(record-of, X) */
const withoutRecordOf: PatternMatcher = (els, loc) => {
  if (els.length !== 4) return null;
  if (!isWord(els[0], "without")) return null;
  if (!isWord(els[1], "record")) return null;
  if (!isWord(els[2], "of")) return null;
  if (!isConceptRef(els[3])) return null;
  return makeCall(
    "Without",
    [
      { type: "EnumArg", value: "record-of", location: loc },
      conceptRefArg(els[3]),
    ],
    loc,
  );
};

/** `without documented (A or B)` → Without(documented, Disjunction(A, B)) */
const withoutDocumentedDisjunction: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isWord(els[0], "without")) return null;
  if (!isWord(els[1], "documented")) return null;
  if (!isDisjunction(els[2])) return null;
  return makeCall(
    "Without",
    [
      { type: "EnumArg", value: "documented", location: loc },
      disjunctionArg(els[2]),
    ],
    loc,
  );
};

/** `<X> as of <Y>` → AsOf(anchor: Y, X) — note narrative order is X-then-anchor */
const asOf: PatternMatcher = (els, loc) => {
  if (els.length !== 4) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "as")) return null;
  if (!isWord(els[2], "of")) return null;
  if (!isConceptRef(els[3])) return null;
  return makeCall("AsOf", [conceptRefArg(els[3]), conceptRefArg(els[0])], loc);
};

/** `last <X> on day of <Y>` → Last(X, OnDayOf(Y)) */
const lastOnDayOf: PatternMatcher = (els, loc) => {
  if (els.length !== 6) return null;
  if (!isWord(els[0], "last")) return null;
  if (!isConceptRef(els[1])) return null;
  const after = matchWords(els, 2, ["on", "day", "of"]);
  if (after === null) return null;
  if (!isConceptRef(els[after])) return null;
  const scope = makeCall("OnDayOf", [conceptRefArg(els[after] as NConceptRef)], loc);
  return makeCall("Last", [conceptRefArg(els[1]), nestedArg(scope)], loc);
};

/** `last <X> within <Q> before start of <Y>` → Last(X, BeforeStartOf(Q, Y)) */
const lastWithinBeforeStartOf: PatternMatcher = (els, loc) => {
  if (els.length !== 8) return null;
  if (!isWord(els[0], "last")) return null;
  if (!isConceptRef(els[1])) return null;
  if (!isWord(els[2], "within")) return null;
  if (!isQuantity(els[3])) return null;
  const after = matchWords(els, 4, ["before", "start", "of"]);
  if (after === null) return null;
  if (!isConceptRef(els[after])) return null;
  const scope = makeCall(
    "BeforeStartOf",
    [quantityArg(els[3]), conceptRefArg(els[after] as NConceptRef)],
    loc,
  );
  return makeCall("Last", [conceptRefArg(els[1]), nestedArg(scope)], loc);
};

/** `age at start of <X> at least <Q>` → AtLeast(AgeAt(StartOf(X)), Q) */
const ageAtStartOfAtLeast: PatternMatcher = (els, loc) => {
  if (els.length !== 8) return null;
  const after = matchWords(els, 0, ["age", "at", "start", "of"]);
  if (after === null) return null;
  if (!isConceptRef(els[after])) return null;
  if (!isWord(els[after + 1], "at")) return null;
  if (!isWord(els[after + 2], "least")) return null;
  if (!isQuantity(els[after + 3])) return null;
  const startOf = makeCall("StartOf", [conceptRefArg(els[after] as NConceptRef)], loc);
  const ageAt = makeCall("AgeAt", [nestedArg(startOf)], loc);
  return makeCall("AtLeast", [nestedArg(ageAt), quantityArg(els[after + 3] as Quantity)], loc);
};

/** Bare ref alone: `<X>` → degenerate; treated as a 1-arg identity wrap. Not registered (single bare ref isn't a pattern call). */

// === Registration (order matters) ===

const PATTERNS: PatternMatcher[] = [
  // Longest / most specific first
  ageAtStartOfAtLeast,             // 8 elements
  lastWithinBeforeStartOf,         // 8
  onDayOfOrAfter,                  // 7
  lastOnDayOf,                     // 6
  notDoneWithReason,               // 6+ (variable)
  withoutRecordOf,                 // 4
  withoutDocumentedDisjunction,    // 3 (with disjunction element)
  onOrBefore,                      // 5
  sameDayAs,                       // 5
  between,                         // 5
  activeDuring,                    // 4 (post-catalog-v0.7: `<X> active during <Y>`)
  documentedAs,                    // 4
  justifiedBy,                     // 4
  componentOf,                     // 4
  atLeast,                         // 4
  atMost,                          // 4
  asOf,                            // 4
  during,                          // 3
  overlaps,                        // 3
  below,                           // 3
  exceeds,                         // 3
  without,                         // 3 (last among 3-element patterns; less specific)
  mostRecent,                      // 3
  performed,                       // 2
  ordered,                         // 2
  active,                          // 2 (post-catalog-v0.7: `<X> active`)
  verified,                        // 2 (post-catalog-v0.7: `<X> verified`)
  valueClass,                      // 2 (post-catalog-v0.7: `<X> low|high|normal|abnormal`)
  earliest,                        // 2
  first,                           // 2
  lastBare,                        // 2 (after lastOnDayOf / lastWithinBeforeStartOf)
  calculated,                      // 2
  lowest,                          // 2
  highest,                         // 2
];
