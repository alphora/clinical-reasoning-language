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
import { getRefName, getRefLibrary } from "../ast/types";

import { ageComputeFnForUnit } from "./agePredicate";
import { splitPipeline } from "./pipeline";
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

  // ⭐ PIPELINE (#189 G3): `<stage> then <stage> then …`, authored LEFT TO RIGHT so reading order IS
  // evaluation order. Each stage is matched INDIVIDUALLY against the ordinary vocabulary and the results are
  // folded, so composition costs one matcher per stage rather than one per PAIR — 16 comparators × 6
  // reductions would be 96 hand-written matchers for two-stage alone, before three-stage.
  //
  // ⚠⚠ REFACTOR:suspect (#189 P2) — THE FOLD BELOW IS THE PATIENT, AND ITS OLD COMMENT WAS FALSE.
  //
  // It claimed: "each later stage takes the accumulated call as its FIRST argument … That yields
  // OUTER-`MostRecent` — `most recent` reduces the concept's arms." MEASURED, it does the opposite:
  //
  //     body mass index of "A" and "B", then most recent this
  //         -->  MostRecent( BodyMassIndex(A, B) )
  //
  // `BodyMassIndex` returns a Quantity, so stage 2 reduces STAGE 1'S VALUE, not the concept's arms — the
  // recorded and answered arms are silently dropped, which is exactly what `policy.crl`'s own comment warns
  // the PREFIX spelling does, and the pipeline spelling exists to avoid. It does not even translate:
  // "Could not resolve call to operator MostRecent with signature (System.Quantity)".
  //
  // ⭐ THE RULE the fix restores: `this` in a stage ALWAYS denotes THE SPACE handed to it — the previous
  // stage's output — and NEVER a scalar. A PRODUCER's output is its input PLUS its constructed candidate,
  // so a reduction after a producer reduces `S0 ∪ {candidate}`, not the candidate alone. Until the
  // un-collapse lands, do NOT read this fold as intent (`tmp/DESIGN-P2-pipeline-uncollapse.md`).
  //
  // ⚠ A pipeline whose stages do not ALL match is unknown as a whole. Reporting a partial chain would claim
  // more than was understood, and half-matched logic that validates is the failure this work exists to remove.
  const stages = splitPipeline(els)?.map((stage) => stage.elements);
  if (stages !== undefined) {
    const calls: CanonicalPatternCall[] = [];
    for (const stage of stages) {
      const match = matchStage(stage, clause.location);
      if (match === null) return softCompileUnknown(clause);
      calls.push(match);
    }
    return calls.reduce((acc, next) => ({
      ...next,
      args: [nestedArg(acc), ...next.args],
    }));
  }

  const single = matchStage(els, clause.location);
  return single ?? softCompileUnknown(clause);
}

function matchStage(els: NarrativeElement[], loc: Location): CanonicalPatternCall | null {
  for (const pattern of PATTERNS) {
    const match = pattern(els, loc);
    if (match !== null) return match;
  }
  return null;
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
      return typeof e.value === "string"
        ? `"${e.value}"`
        : `"${e.value.libraryName}"."${e.value.name}"`;
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
  const library = getRefLibrary(e.value);
  return {
    type: "ConceptRefArg",
    value: getRefName(e.value),
    ...(library !== null ? { library } : {}),
    location: e.location,
  };
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

/**
 * A `Quantity` whose unit is YEARS. Now used ONLY by the four ANCHORED `age at start of <X>
 * <cmp> <Q>` matchers, which stay years-only (#257 T2 Q2: need-driven — no anchored-months
 * policy yet, and `AgeAt(StartOf(…))` computes whole YEARS). The age-TODAY matchers moved to
 * `ageComputeFnForUnit` (years OR months) — see their bodies.
 *
 * #215: `AgeAt(StartOf(…))` returns age in whole YEARS and the cross-type comparator overloads
 * (`<Op>(Integer, System.Quantity)`, CRLCommon.cql) are unit-BLIND (compare `.value` only), so a
 * non-year threshold would silently mean `ageYears <cmp> <n>`. Enforcing years AT THE MATCH means
 * a non-year anchored-age narrative does NOT match → it soft-compiles unknown → a LOUD sentinel,
 * never a silent unit-blind miscompile.
 */
function isYearQuantity(e: NarrativeElement | undefined): e is Quantity {
  return isQuantity(e) && (e.unit === "year" || e.unit === "years");
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

/**
 * `body mass index of <Weight> and <Height>` → BodyMassIndex(weight, height) — #189.
 *
 * The goal fixture's calculation, and the first PRODUCER pattern in the catalog beyond `Calculate`: it
 * computes a NEW value from its named operands rather than selecting or filtering an existing record.
 * Narrative order is (weight, height) and so is the canonical call — the two are NOT interchangeable and a
 * silent swap would invert the result, so keep them aligned.
 */
const bodyMassIndex: PatternMatcher = (els, loc) => {
  if (els.length !== 7) return null;
  if (!isWord(els[0], "body")) return null;
  if (!isWord(els[1], "mass")) return null;
  if (!isWord(els[2], "index")) return null;
  if (!isWord(els[3], "of")) return null;
  if (!isConceptRef(els[4])) return null;
  if (!isWord(els[5], "and")) return null;
  if (!isConceptRef(els[6])) return null;
  return makeCall("BodyMassIndex", [conceptRefArg(els[4]), conceptRefArg(els[6])], loc);
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

/** `<A> and <B> at least <Q> apart` → AtLeastApart(eventA, eventB, duration) — T07 / #93 */
const atLeastApart: PatternMatcher = (els, loc) => {
  if (els.length !== 7) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "and")) return null;
  if (!isConceptRef(els[2])) return null;
  if (!isWord(els[3], "at")) return null;
  if (!isWord(els[4], "least")) return null;
  if (!isQuantity(els[5])) return null;
  if (!isWord(els[6], "apart")) return null;
  return makeCall(
    "AtLeastApart",
    [conceptRefArg(els[0]), conceptRefArg(els[2]), quantityArg(els[5])],
    loc,
  );
};

/** `<A> and <B> at most <Q> apart` → AtMostApart(eventA, eventB, duration) — T07 / #93 */
const atMostApart: PatternMatcher = (els, loc) => {
  if (els.length !== 7) return null;
  if (!isConceptRef(els[0])) return null;
  if (!isWord(els[1], "and")) return null;
  if (!isConceptRef(els[2])) return null;
  if (!isWord(els[3], "at")) return null;
  if (!isWord(els[4], "most")) return null;
  if (!isQuantity(els[5])) return null;
  if (!isWord(els[6], "apart")) return null;
  return makeCall(
    "AtMostApart",
    [conceptRefArg(els[0]), conceptRefArg(els[2]), quantityArg(els[5])],
    loc,
  );
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

/** `has <X>` → Has(X). Issue #77 catalog↔matcher drift fix. */
const hasOf: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isWord(els[0], "has")) return null;
  if (!isConceptRef(els[1])) return null;
  return makeCall("Has", [conceptRefArg(els[1])], loc);
};

/** `has history of <X>` → HasHistoryOf(X). Issue #77. */
const hasHistoryOf: PatternMatcher = (els, loc) => {
  if (els.length !== 4) return null;
  if (!isWord(els[0], "has")) return null;
  if (!isWord(els[1], "history")) return null;
  if (!isWord(els[2], "of")) return null;
  if (!isConceptRef(els[3])) return null;
  return makeCall("HasHistoryOf", [conceptRefArg(els[3])], loc);
};

/** `has adverse reaction to <X>` → HasAdverseReactionTo(X). Issue #77 audit. */
const hasAdverseReactionTo: PatternMatcher = (els, loc) => {
  if (els.length !== 5) return null;
  if (!isWord(els[0], "has")) return null;
  if (!isWord(els[1], "adverse")) return null;
  if (!isWord(els[2], "reaction")) return null;
  if (!isWord(els[3], "to")) return null;
  if (!isConceptRef(els[4])) return null;
  return makeCall("HasAdverseReactionTo", [conceptRefArg(els[4])], loc);
};

/** `currently taking <med>` → CurrentlyTaking(med). Issue #77. */
const currentlyTaking: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isWord(els[0], "currently")) return null;
  if (!isWord(els[1], "taking")) return null;
  if (!isConceptRef(els[2])) return null;
  return makeCall("CurrentlyTaking", [conceptRefArg(els[2])], loc);
};

/** `age at <anchor>` → AgeAt(anchor). Issue #77 audit. */
const ageAt: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isWord(els[0], "age")) return null;
  if (!isWord(els[1], "at")) return null;
  if (!isConceptRef(els[2])) return null;
  return makeCall("AgeAt", [conceptRefArg(els[2])], loc);
};

/** `most recent <X>` → MostRecent(X) */
const mostRecent: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isWord(els[0], "most")) return null;
  if (!isWord(els[1], "recent")) return null;
  if (!isConceptRef(els[2])) return null;
  return makeCall("MostRecent", [conceptRefArg(els[2])], loc);
};

/** `most recent <X> active` → MostRecent(Active(X)) — T10 / #78 */
const mostRecentActive: PatternMatcher = (els, loc) => {
  if (els.length !== 4) return null;
  if (!isWord(els[0], "most")) return null;
  if (!isWord(els[1], "recent")) return null;
  if (!isConceptRef(els[2])) return null;
  if (!isWord(els[3], "active")) return null;
  const inner = makeCall("Active", [conceptRefArg(els[2])], loc);
  return makeCall("MostRecent", [nestedArg(inner)], loc);
};

/** `most recent <X> verified` → MostRecent(IsVerified(X)) — T10 / #78 */
const mostRecentVerified: PatternMatcher = (els, loc) => {
  if (els.length !== 4) return null;
  if (!isWord(els[0], "most")) return null;
  if (!isWord(els[1], "recent")) return null;
  if (!isConceptRef(els[2])) return null;
  if (!isWord(els[3], "verified")) return null;
  const inner = makeCall("IsVerified", [conceptRefArg(els[2])], loc);
  return makeCall("MostRecent", [nestedArg(inner)], loc);
};

/** `most recent <X> documented as <Y>` → MostRecent(DocumentedAs(X, Y)) — T10 / #78 */
const mostRecentDocumentedAs: PatternMatcher = (els, loc) => {
  if (els.length !== 6) return null;
  if (!isWord(els[0], "most")) return null;
  if (!isWord(els[1], "recent")) return null;
  if (!isConceptRef(els[2])) return null;
  if (!isWord(els[3], "documented")) return null;
  if (!isWord(els[4], "as")) return null;
  if (!isConceptRef(els[5])) return null;
  const inner = makeCall(
    "DocumentedAs",
    [conceptRefArg(els[2]), conceptRefArg(els[5])],
    loc,
  );
  return makeCall("MostRecent", [nestedArg(inner)], loc);
};

/** `last <X> active` → Last(Active(X)) — T10 / #78 */
const lastActive: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isWord(els[0], "last")) return null;
  if (!isConceptRef(els[1])) return null;
  if (!isWord(els[2], "active")) return null;
  const inner = makeCall("Active", [conceptRefArg(els[1])], loc);
  return makeCall("Last", [nestedArg(inner)], loc);
};

/** `last <X> verified` → Last(IsVerified(X)) — T10 / #78 */
const lastVerified: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isWord(els[0], "last")) return null;
  if (!isConceptRef(els[1])) return null;
  if (!isWord(els[2], "verified")) return null;
  const inner = makeCall("IsVerified", [conceptRefArg(els[1])], loc);
  return makeCall("Last", [nestedArg(inner)], loc);
};

/** `last <X> documented as <Y>` → Last(DocumentedAs(X, Y)) — T10 / #78 */
const lastDocumentedAs: PatternMatcher = (els, loc) => {
  if (els.length !== 5) return null;
  if (!isWord(els[0], "last")) return null;
  if (!isConceptRef(els[1])) return null;
  if (!isWord(els[2], "documented")) return null;
  if (!isWord(els[3], "as")) return null;
  if (!isConceptRef(els[4])) return null;
  const inner = makeCall(
    "DocumentedAs",
    [conceptRefArg(els[1]), conceptRefArg(els[4])],
    loc,
  );
  return makeCall("Last", [nestedArg(inner)], loc);
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

/** `most recent this` as a PIPELINE STAGE → MostRecent() with no args.
 *
 *  `most recent this` already exists as a folded `definition is` REDUCTION, so it never reached the narrative
 *  matcher before. Inside a pipeline it must, and it arrives with NO argument: `this` is the placeholder for
 *  the value flowing in from the previous stage, which `matchNarrative` injects when it folds the chain. */
const mostRecentThisStage: PatternMatcher = (els, loc) => {
  if (els.length !== 3) return null;
  if (!isWord(els[0], "most")) return null;
  if (!isWord(els[1], "recent")) return null;
  if (!isWord(els[2], "this")) return null;
  return makeCall("MostRecent", [], loc);
};

/** ⭐ `exists this` → Exists(this) — the EXISTENCE PROJECTION (#189, 2026-08-28).
 *
 *  A value-blind projection: it reads NO element, so a representation carrying it supplies only `type is`
 *  and (where the resource has a coded retrieve) `coded from`. That is what lets an existence rep stop
 *  asserting a value element it never reads — the old rule forced
 *  `value element is Condition.code.` + `value type is boolean.`, which claims that element yields a boolean.
 *  It yields a CodeableConcept, and existence reads neither.
 *
 *  ⚠ OVERLOADED ON THE REPRESENTATION'S `type is` (charter §3): over a coded resource it is existence of
 *  records matching `coded from`; over a supplied resource (Patient) it is existence of the resource itself.
 *  The projection knows its own carrier, so the author never names an element and can never name a wrong one.
 *
 *  ⚠ `exists this` also exists as a `definition is` REDUCTION with its own grammar production. This is the
 *  narrative spelling, for the PROJECTION arm — the construct was in the language but not on this arm.
 *  ⚠ `exists(this)` (parenthesised) does NOT parse in a projection; only the bare form reaches here. */
const existsThis: PatternMatcher = (els, loc) => {
  if (els.length !== 2) return null;
  if (!isWord(els[0], "exists")) return null;
  if (!isWord(els[1], "this")) return null;
  return makeCall("Exists", [], loc);
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

/** `last <X> within <Q> after end of <Y>` → Last(X, AfterEndOf(Q, Y))   — T08 / #98 */
const lastWithinAfterEndOf: PatternMatcher = (els, loc) => {
  if (els.length !== 8) return null;
  if (!isWord(els[0], "last")) return null;
  if (!isConceptRef(els[1])) return null;
  if (!isWord(els[2], "within")) return null;
  if (!isQuantity(els[3])) return null;
  const after = matchWords(els, 4, ["after", "end", "of"]);
  if (after === null) return null;
  if (!isConceptRef(els[after])) return null;
  const scope = makeCall(
    "AfterEndOf",
    [quantityArg(els[3]), conceptRefArg(els[after] as NConceptRef)],
    loc,
  );
  return makeCall("Last", [conceptRefArg(els[1]), nestedArg(scope)], loc);
};

/** `last <X> within <Q> after start of <Y>` → Last(X, AfterStartOf(Q, Y)) — T08 / #98 */
const lastWithinAfterStartOf: PatternMatcher = (els, loc) => {
  if (els.length !== 8) return null;
  if (!isWord(els[0], "last")) return null;
  if (!isConceptRef(els[1])) return null;
  if (!isWord(els[2], "within")) return null;
  if (!isQuantity(els[3])) return null;
  const after = matchWords(els, 4, ["after", "start", "of"]);
  if (after === null) return null;
  if (!isConceptRef(els[after])) return null;
  const scope = makeCall(
    "AfterStartOf",
    [quantityArg(els[3]), conceptRefArg(els[after] as NConceptRef)],
    loc,
  );
  return makeCall("Last", [conceptRefArg(els[1]), nestedArg(scope)], loc);
};

/** `last <X> within <Q> before end of <Y>` → Last(X, BeforeEndOf(Q, Y)) — T08 / #98 */
const lastWithinBeforeEndOf: PatternMatcher = (els, loc) => {
  if (els.length !== 8) return null;
  if (!isWord(els[0], "last")) return null;
  if (!isConceptRef(els[1])) return null;
  if (!isWord(els[2], "within")) return null;
  if (!isQuantity(els[3])) return null;
  const after = matchWords(els, 4, ["before", "end", "of"]);
  if (after === null) return null;
  if (!isConceptRef(els[after])) return null;
  const scope = makeCall(
    "BeforeEndOf",
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
  if (!isYearQuantity(els[after + 3])) return null; // #215: year-only (AgeAt(anchor) is Integer years; unit-blind overload)
  const startOf = makeCall("StartOf", [conceptRefArg(els[after] as NConceptRef)], loc);
  const ageAt = makeCall("AgeAt", [nestedArg(startOf)], loc);
  return makeCall("AtLeast", [nestedArg(ageAt), quantityArg(els[after + 3] as Quantity)], loc);
};

/**
 * ANCHORED UPPER-BOUND (#215) — the `age at start of <X>` counterparts of the age-today
 * upper bounds: `at most` (≤, AtMost), `under` / `younger than` (<, Below). Same
 * `AgeAt(StartOf(X))` (Integer years) feeding the same cross-type comparator overloads,
 * same year-only guard. Compute-only (never the both-rep recency lane — the collision
 * guard excludes a ONE-arg AgeAt).
 */
/** `age at start of <X> at most <Q>` → AtMost(AgeAt(StartOf(X)), Q) */
const ageAtStartOfAtMost: PatternMatcher = (els, loc) => {
  if (els.length !== 8) return null;
  const after = matchWords(els, 0, ["age", "at", "start", "of"]);
  if (after === null) return null;
  if (!isConceptRef(els[after])) return null;
  if (!isWord(els[after + 1], "at")) return null;
  if (!isWord(els[after + 2], "most")) return null;
  if (!isYearQuantity(els[after + 3])) return null;
  const startOf = makeCall("StartOf", [conceptRefArg(els[after] as NConceptRef)], loc);
  const ageAt = makeCall("AgeAt", [nestedArg(startOf)], loc);
  return makeCall("AtMost", [nestedArg(ageAt), quantityArg(els[after + 3] as Quantity)], loc);
};

/** `age at start of <X> under <Q>` → Below(AgeAt(StartOf(X)), Q) */
const ageAtStartOfUnder: PatternMatcher = (els, loc) => {
  if (els.length !== 7) return null;
  const after = matchWords(els, 0, ["age", "at", "start", "of"]);
  if (after === null) return null;
  if (!isConceptRef(els[after])) return null;
  if (!isWord(els[after + 1], "under")) return null;
  if (!isYearQuantity(els[after + 2])) return null;
  const startOf = makeCall("StartOf", [conceptRefArg(els[after] as NConceptRef)], loc);
  const ageAt = makeCall("AgeAt", [nestedArg(startOf)], loc);
  return makeCall("Below", [nestedArg(ageAt), quantityArg(els[after + 2] as Quantity)], loc);
};

/** `age at start of <X> younger than <Q>` → Below(AgeAt(StartOf(X)), Q) (synonym of under) */
const ageAtStartOfYoungerThan: PatternMatcher = (els, loc) => {
  if (els.length !== 8) return null;
  const after = matchWords(els, 0, ["age", "at", "start", "of"]);
  if (after === null) return null;
  if (!isConceptRef(els[after])) return null;
  if (!isWord(els[after + 1], "younger")) return null;
  if (!isWord(els[after + 2], "than")) return null;
  if (!isYearQuantity(els[after + 3])) return null;
  const startOf = makeCall("StartOf", [conceptRefArg(els[after] as NConceptRef)], loc);
  const ageAt = makeCall("AgeAt", [nestedArg(startOf)], loc);
  return makeCall("Below", [nestedArg(ageAt), quantityArg(els[after + 3] as Quantity)], loc);
};

/**
 * `age today at least <Q>` → AtLeast(<AgeAt()|AgeInMonths()>, Q).
 *
 * `today` is the ENGINE evaluation date (CQL `Today()`); the no-arg compute fn (in CRLCommon)
 * computes the patient's age at that date — `AgeAt()` in whole YEARS or `AgeInMonths()` in whole
 * MONTHS, SELECTED from the threshold's unit via `ageComputeFnForUnit` (#257 T2). The 5-element
 * template is distinct from the 3-element `age at <ConceptRef>` (`ageAt`) — that form has `at` at
 * els[1] and a ConceptRef at els[2], so `age today …` (bare word at els[1]) cannot be mis-consumed
 * by it, and the lengths differ anyway. The resulting Integer-returning compute fn feeds the
 * `AtLeast(Integer, System.Quantity)` unit-blind overload; the unit gate at the match (via the
 * compute-fn lookup) keeps the compared units aligned (#215). This is the SOLE choice of which fn
 * to emit — `sanctionedAgeTodayOp` only re-verifies the pairing.
 */
const ageTodayAtLeast: PatternMatcher = (els, loc) => {
  if (els.length !== 5) return null;
  if (!isWord(els[0], "age")) return null;
  if (!isWord(els[1], "today")) return null;
  if (!isWord(els[2], "at")) return null;
  if (!isWord(els[3], "least")) return null;
  const q = els[4];
  if (!isQuantity(q)) return null;
  const computeFn = ageComputeFnForUnit(q.unit);
  if (computeFn === null) return null; // #215/#257 T2: sanctioned age units only (years/months); day/week fail → LOUD
  return makeCall("AtLeast", [nestedArg(makeCall(computeFn, [], loc)), quantityArg(q)], loc);
};

/**
 * `age today at most <Q>` → AtMost(<AgeAt()|AgeInMonths()>, Q) — the INCLUSIVE upper bound (≤ N,
 * #215). Symmetric with `ageTodayAtLeast`; 5 elements `[age][today][at][most][Q]`. The unit-selected
 * Integer compute fn feeds the `AtMost(Integer, System.Quantity)` overload (CRLCommon.cql, #215).
 * NOTE the truncation equivalence taught in the kit: `at most 21` ≡ `under 22` because the compute
 * fn truncates to whole units (years OR months, #257 T2).
 */
const ageTodayAtMost: PatternMatcher = (els, loc) => {
  if (els.length !== 5) return null;
  if (!isWord(els[0], "age")) return null;
  if (!isWord(els[1], "today")) return null;
  if (!isWord(els[2], "at")) return null;
  if (!isWord(els[3], "most")) return null;
  const q = els[4];
  if (!isQuantity(q)) return null;
  const computeFn = ageComputeFnForUnit(q.unit);
  if (computeFn === null) return null; // #215/#257 T2: sanctioned age units only (years/months); day/week fail → LOUD
  return makeCall("AtMost", [nestedArg(makeCall(computeFn, [], loc)), quantityArg(q)], loc);
};

/**
 * `age today under <Q>` → Below(<AgeAt()|AgeInMonths()>, Q) — the EXCLUSIVE upper bound (< N,
 * #215). 4 elements `[age][today][under][Q]`. This is how pediatric policies read ("under 21",
 * "under 6 months"). `Below(Integer, System.Quantity)` overload (CRLCommon.cql, #215); the unit
 * selects the compute fn (#257 T2).
 */
const ageTodayUnder: PatternMatcher = (els, loc) => {
  if (els.length !== 4) return null;
  if (!isWord(els[0], "age")) return null;
  if (!isWord(els[1], "today")) return null;
  if (!isWord(els[2], "under")) return null;
  const q = els[3];
  if (!isQuantity(q)) return null;
  const computeFn = ageComputeFnForUnit(q.unit);
  if (computeFn === null) return null; // #215/#257 T2: sanctioned age units only (years/months); day/week fail → LOUD
  return makeCall("Below", [nestedArg(makeCall(computeFn, [], loc)), quantityArg(q)], loc);
};

/**
 * `age today younger than <Q>` → Below(<AgeAt()|AgeInMonths()>, Q) — SYNONYM of `under` (< N,
 * #215): one canonical semantic (`Below`) with two accepted spellings. 5 elements
 * `[age][today][younger][than][Q]`. Both spellings lower BYTE-IDENTICALLY; the unit selects the
 * compute fn (#257 T2).
 */
const ageTodayYoungerThan: PatternMatcher = (els, loc) => {
  if (els.length !== 5) return null;
  if (!isWord(els[0], "age")) return null;
  if (!isWord(els[1], "today")) return null;
  if (!isWord(els[2], "younger")) return null;
  if (!isWord(els[3], "than")) return null;
  const q = els[4];
  if (!isQuantity(q)) return null;
  const computeFn = ageComputeFnForUnit(q.unit);
  if (computeFn === null) return null; // #215/#257 T2: sanctioned age units only (years/months); day/week fail → LOUD
  return makeCall("Below", [nestedArg(makeCall(computeFn, [], loc)), quantityArg(q)], loc);
};

/** Bare ref alone: `<X>` → degenerate; treated as a 1-arg identity wrap. Not registered (single bare ref isn't a pattern call). */

// === Registration (order matters) ===

const PATTERNS: PatternMatcher[] = [
  // Longest / most specific first
  ageAtStartOfAtLeast,             // 8 elements
  ageAtStartOfAtMost,              // 8 (age at start of <X> at most <Q>; #215 anchored inclusive)
  ageAtStartOfYoungerThan,         // 8 (age at start of <X> younger than <Q>; #215 anchored exclusive synonym)
  ageAtStartOfUnder,               // 7 (age at start of <X> under <Q>; #215 anchored exclusive)
  ageTodayAtLeast,                 // 5 (age today at least <Q>; BEFORE 3-element ageAt)
  ageTodayAtMost,                  // 5 (age today at most <Q>; #215 inclusive upper bound)
  ageTodayYoungerThan,             // 5 (age today younger than <Q>; #215 exclusive, synonym of under)
  ageTodayUnder,                   // 4 (age today under <Q>; #215 exclusive upper bound)
  lastWithinBeforeStartOf,         // 8
  lastWithinAfterEndOf,            // 8 (T08 / #98)
  lastWithinAfterStartOf,          // 8 (T08 / #98)
  lastWithinBeforeEndOf,           // 8 (T08 / #98)
  onDayOfOrAfter,                  // 7
  atLeastApart,                    // 7 (T07 / #93)
  atMostApart,                     // 7 (T07 / #93)
  lastOnDayOf,                     // 6
  notDoneWithReason,               // 6+ (variable)
  mostRecentDocumentedAs,          // 6 (T10 / #78)
  hasAdverseReactionTo,            // 5 (issue #77 audit)
  withoutRecordOf,                 // 4
  withoutDocumentedDisjunction,    // 3 (with disjunction element)
  lastDocumentedAs,                // 5 (T10 / #78)
  onOrBefore,                      // 5
  sameDayAs,                       // 5
  between,                         // 5
  mostRecentActive,                // 4 (T10 / #78)
  mostRecentVerified,              // 4 (T10 / #78)
  activeDuring,                    // 4 (post-catalog-v0.7: `<X> active during <Y>`)
  documentedAs,                    // 4
  justifiedBy,                     // 4
  bodyMassIndex,                   // 7 (#189 — the goal fixture's calculation)
  componentOf,                     // 4
  atLeast,                         // 4
  atMost,                          // 4
  asOf,                            // 4
  hasHistoryOf,                    // 4 (issue #77)
  during,                          // 3
  overlaps,                        // 3
  below,                           // 3
  exceeds,                         // 3
  without,                         // 3 (last among 3-element patterns; less specific)
  lastActive,                      // 3 (T10 / #78 — BEFORE mostRecent/lastBare)
  lastVerified,                    // 3 (T10 / #78)
  mostRecent,                      // 3
  currentlyTaking,                 // 3 (issue #77)
  ageAt,                           // 3 (issue #77 audit; AFTER ageAtStartOfAtLeast since len differs)
  performed,                       // 2
  ordered,                         // 2
  active,                          // 2 (post-catalog-v0.7: `<X> active`)
  verified,                        // 2 (post-catalog-v0.7: `<X> verified`)
  valueClass,                      // 2 (post-catalog-v0.7: `<X> low|high|normal|abnormal`)
  earliest,                        // 2
  first,                           // 2
  lastBare,                        // 2 (after lastOnDayOf / lastWithinBeforeStartOf)
  mostRecentThisStage,             // 3 — `most recent this` as a pipeline stage
  existsThis,                      // 2 — the existence PROJECTION (value-blind)
  calculated,                      // 2
  lowest,                          // 2
  highest,                         // 2
  hasOf,                           // 2 (issue #77 audit; after specific has-* forms above)
];

// === #77 catalog↔matcher audit: still-deferred patterns ===
// The catalog defines these narrative forms; the matcher does not yet wire
// them. Each is deferred for a specific reason that needs operator alignment
// before adding (overlapping shape with an existing pattern, or design
// ambiguity in narrative). Adding any of these in isolation could make
// existing corpus parses regress, so they are gated behind a follow-up.
//
//   - `<X> with <Y>` → With                   — collides with the broader
//                                                "X with follow-up Y" form
//                                                (BaselineAndFollowUp) and
//                                                with bare-narrative "with"
//                                                ambiguity in real corpora.
//   - `<X> with follow-up <Y>` → BaselineAndFollowUp
//   - `<X> within <window>` → Within (top-level; embedded form already
//                                                works via lastWithinBeforeStartOf)
//   - `inpatient stay anchored on <X>[ including prelude]` → InpatientStay
//   - `<X> between <start> and <end>` → BetweenAnchors (collides shape-wise
//                                                with `Between(value, lo, hi)`;
//                                                dispatch needs operator call).
//   - `at least <n> <events>` → AtLeastN     — needs Integer-token support.
//   - `<n> consecutive <events>` → Consecutive — needs Integer-token support.
