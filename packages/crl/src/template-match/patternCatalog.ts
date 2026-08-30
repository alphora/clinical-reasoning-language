// #189 P2 (design D9) — THE PATTERN CATALOG: one home for every per-pattern FACT, total and fail-closed.
//
// ⚠⚠ WHY ONE MODULE. Two tables in two directories classified one catalog: `cql-emitter/patternReturnShape`
// (return shape) and `template-match/patternScope` (projection slot). Both design arms independently called
// that a drift machine — each editable without the other, and a third table for stage-kind would have made
// it worse. They are merged here, in `template-match`, because the catalog is a LANGUAGE fact that the
// validator, the emitter and the CRE all read; `patternReturnShape` had already been extracted to a leaf for
// exactly that reason, and this finishes the job by putting it where the catalog lives.
//
// ⭐ WHAT IS **NOT** HERE: STAGE KIND (producer / filter / selection / aggregate). It is NOT a per-pattern
// fact — it is a property of an OCCURRENCE, derived from `(return shape × concept signature × terminal
// position)` in the shared resolver. `"BMI" at least 30` is a PRODUCER in `Obese` because of what that
// concept publishes and where the stage sits. Storing it per pattern would mean one wrong value or a
// context-keyed table (the derivation, written badly) — and it is what dissolves the long-standing
// contradiction between two design sections over whether `AtLeast` is a producer or an aggregate: both
// observed it correctly on different axes, and neither was "the kind".
//
// RULE ([[patterns-are-semantic]]): a catalog signature never constrains what the author may DECLARE — the
// emitter picks the pattern's REALIZATION FORM from the declared `(type, valuetype)`. But the emitter must
// NEVER INSERT A REDUCTION (`exists`, a singleton lift `{ }`, a `Coalesce`) to bridge a shape the author
// declared. A mismatch is an AUTHOR-TIME ERROR naming the fix ("declare the reduction"), not a bridge.
//
// ⚠ REFACTOR:suspect — the emitter DOES still bridge (`emitCQL.ts`, the declared-vs-patternShape block).
// That code is the PATIENT, not the rule. It cannot be removed until reduction NESTING lands, because
// without nesting an author has no way to SAY `exists ( <filter pattern> )`. Do not cite it as doctrine.

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// FACT 1 — RETURN SHAPE. What the catalog function yields.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
//
// "list"     — returns List<Resource>.
// "boolean"  — returns Boolean (inherently a predicate).
// "instance" — returns Instance<Resource> (a singleton — MostRecent / Last / Earliest / First / extremes).
// "other"    — returns Period / Quantity / Interval / DateTime; the author's value type should match.
//
// The boolean-totality classifier reads this to classify a catalog-pattern concept's totality
// (list/instance → intrinsically total via `exists <call>`; boolean → requires-boundary comparator).

export type PatternReturnShape = "list" | "boolean" | "instance" | "other";

const RETURN_SHAPE: Record<string, PatternReturnShape> = {
  // List-returning filter patterns (primitive form per CRLCommon v0.2.0).
  Has: "list",
  HasHistoryOf: "list",
  CurrentlyTaking: "list",
  HasAdverseReactionTo: "list",
  AsOf: "list",
  Within: "list",
  ComponentOf: "list",
  NotDoneWithReason: "list",
  BaselineAndFollowUp: "list",
  WasOrdered: "list",
  Justified: "list",
  Active: "list",
  IsVerified: "list",
  DocumentedAs: "list",
  During: "list",
  Overlaps: "list",
  OnDayOfOrAfter: "list",
  OnOrBefore: "list",
  SameDay: "list",
  BetweenAnchors: "list",
  WasPerformed: "list",

  // Inherently-boolean patterns (no meaningful list realization).
  Without: "boolean",
  With: "boolean",
  AtLeastApart: "boolean",
  AtMostApart: "boolean",
  AtLeastN: "boolean",
  Consecutive: "boolean",
  High: "boolean",
  Low: "boolean",
  Normal: "boolean",
  Abnormal: "boolean",
  AtLeast: "boolean",
  AtMost: "boolean",
  Between: "boolean",
  Exceeds: "boolean",
  Below: "boolean",
  // #189 — the existence projection. One boolean, always: existence is total by construction.
  Exists: "boolean",
  // #189 SR — the MEMBERSHIP projection. Boolean per retrieved record: in-set / not-in-set / (no datum) null.
  // ⚠ Was MISSING until the totality audit — added by the matcher without a classification, which is exactly
  // the gap `assertCatalogTotal` now prevents.
  Matches: "boolean",

  // Instance-returning selection patterns (a singleton resource).
  MostRecent: "instance",
  Last: "instance",
  LastOf: "instance",
  Earliest: "instance",
  First: "instance",
  FirstOf: "instance",
  // ⭐ #189 — SELECTIONS: they pick the record at one end of an ordering, exactly as MostRecent/Earliest do
  // over time. They returned a bare value until the catalog was corrected, which is why a `shape is Record`
  // concept could not publish the record its shape declares.
  Lowest: "instance",
  Highest: "instance",

  // Other-shape patterns (Period, Quantity, Interval, DateTime).
  InpatientStay: "other",
  BeforeStartOf: "other",
  AfterStartOf: "other",
  BeforeEndOf: "other",
  AfterEndOf: "other",
  OnDayOf: "other",
  AgeAt: "other",
  // ⚠ NESTED-ONLY, and classified anyway. `StartOf` appears only inside `AgeAt(StartOf(X))`, never as a
  // top-level pattern — but "never looked up" is a claim about today's call sites, not an invariant, and a
  // fail-closed table must not depend on one. Added by the totality audit alongside `Matches`.
  StartOf: "other",
  Calculate: "other",
  // #189 — a PRODUCER: computes a new Quantity (kg/m2) from two record operands. "other" because the value
  // it yields is neither a member of its input nor a boolean — the concept declares what it publishes.
  BodyMassIndex: "other",
  // No `AgeInMonths` entry BY DESIGN (#257 T2): the months compute fn only ever appears NESTED inside a
  // top-level comparator (`AtLeast`/`AtMost`/`Below`), never as the top-level pattern.
  // ⚠ The old note here claimed the `?? "list"` default made a stray lookup "fail loudly". It did not — it
  // silently produced `exists CRLCommon.AgeInMonths()` and deferred the failure to CQL compile. The default
  // is GONE; `patternReturnShape()` now fails at emit, where the diagnostic is useful.
};

/**
 * The return shape of `pattern`, or `undefined` if the catalog does not classify it.
 *
 * ⚠ Prefer `requireReturnShape` at any site that must decide behaviour. This nullable form exists for the
 * two callers that legitimately ask "is this classified at all" — the fail-closed check itself, and the
 * validator rule that reports an unclassified stage as OUR catalog gap rather than an authoring error.
 */
export function patternReturnShape(pattern: string): PatternReturnShape | undefined {
  return Object.prototype.hasOwnProperty.call(RETURN_SHAPE, pattern) ? RETURN_SHAPE[pattern] : undefined;
}

/**
 * The return shape of `pattern`, THROWING if unclassified.
 *
 * ⚠⚠ THIS REPLACES `PATTERN_RETURN_SHAPE[p] ?? "list"`. That default silently classified any unknown
 * pattern as a FILTER, which is the §2.10 trap in miniature: a wrong classification that compiles. Both
 * design arms flagged it independently, and the in-tree precedent for the correct behaviour already existed
 * (`emit/booleanTotality.ts` fails closed on the same lookup).
 *
 * Reaching this throw means a matcher emits a pattern the catalog does not know — OUR gap, never the
 * author's. `assertCatalogTotal` is meant to catch it in CI first.
 */
export function requireReturnShape(pattern: string, context: string): PatternReturnShape {
  const shape = patternReturnShape(pattern);
  if (shape === undefined) {
    throw new Error(
      `internal: pattern \`${pattern}\` has no return-shape classification (${context}). ` +
        `A matcher emits it but the catalog does not classify it — add an entry to \`patternCatalog.ts\`. ` +
        `This is a catalog gap, not an authoring error.`,
    );
  }
  return shape;
}

/** Every classified pattern name — for the totality audit. */
export function classifiedPatterns(): readonly string[] {
  return Object.keys(RETURN_SHAPE);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// FACT 2 — SLOT / READS / RETRIEVE. Where a pattern is legal and what it reads.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What a pattern READS — which decides what it can PRODUCE per invocation.
 *
 * ⚠⚠ THIS IS NOT THE ABSENCE RULE, and conflating the two kills the pause row. Every pattern in the scope
 * table is `projection-only`, and a projection is invoked ONCE PER RETRIEVED RECORD (charter §3). So for ALL
 * of them, **zero records ⇒ zero invocations ⇒ the arm contributes NOTHING** — not `false`. That is what
 * leaves a concept unestablished, and it is the only reason an unanswered determination can pause.
 *
 * The charter's "a records read means absence is `false`" is about the DERIVATION slot — `defined as
 * exists ("V")` over an empty set is a closed-world `false`. A rep-local `exists this` is a different
 * construct in a different slot and does NOT behave that way.
 */
export type PatternReads =
  /**
   * The records themselves. Invoked per retrieved record, so it can only ever answer `true` — there is no
   * record to invoke it on that would answer `false`. ⭐ A posrep projected by `exists this` therefore
   * contributes `true` or NOTHING, never `false`: an existence arm cannot record a negative.
   */
  | "records"
  /**
   * The retrieved record's datum. Invoked per retrieved record, and CAN answer `false` — a record whose
   * code is not a member is a determinate no. A record carrying no datum answers `null`.
   */
  | "datum";

/** Which syntactic slot a pattern may occupy. */
export type PatternSlot =
  /** Legal anywhere a narrative is matched — the default for the catalog. */
  | "any"
  /** ONLY as a whole, standalone rep-level `value projection is` — never a definition, never a pipeline stage. */
  | "projection-only";

export interface PatternScope {
  slot: PatternSlot;
  reads: PatternReads;
  /** Operand count the pattern's own contract promises. A folded pipeline stage violates it. */
  arity: number;
  /** Whether the pattern's meaning depends on the representation's `coded from` set. */
  requiresTerminology: boolean;
  /**
   * How the representation's retrieve must be SHAPED for this pattern to mean what it says.
   * `terminology-filtered` — `[Resource: "VS"]`; the set narrows the retrieve.
   * `unfiltered`           — `[Resource]`; the pattern must SEE non-members to judge them.
   */
  retrieve: "terminology-filtered" | "unfiltered";
}

/**
 * Patterns whose slot is narrower than "any". Absent = `any` (the catalog default).
 *
 * ⚠ This one is deliberately an EXCEPTION list, unlike the return-shape table: "legal anywhere" is the
 * honest default for a narrative pattern, and there is no behaviour that silently goes wrong when a pattern
 * is absent — a missing entry means no restriction, which is what an unrestricted pattern is. The
 * return-shape table cannot work that way, because there a missing entry meant a WRONG classification.
 */
const SCOPE: Readonly<Record<string, PatternScope>> = {
  // `exists this` — records read. Filtering the retrieve and testing each code are EQUIVALENT here
  // (`exists([SR: VS])` = `exists(SR where code in VS)`), so it keeps the filtered retrieve it has today.
  Exists: {
    slot: "projection-only",
    reads: "records",
    arity: 0,
    requiresTerminology: true,
    retrieve: "terminology-filtered",
  },
  // `matches this` — datum read. ⚠ It MUST see non-members: filter the retrieve and a wrong-code record
  // vanishes into the same empty set as no record at all, collapsing a determinate `false` into `unknown`.
  Matches: {
    slot: "projection-only",
    reads: "datum",
    arity: 0,
    requiresTerminology: true,
    retrieve: "unfiltered",
  },
};

/** The scope of `pattern`, or `undefined` when it carries the `any` default. */
export function patternScope(pattern: string): PatternScope | undefined {
  return Object.prototype.hasOwnProperty.call(SCOPE, pattern) ? SCOPE[pattern] : undefined;
}

/** Whether `pattern` is legal ONLY as a standalone rep-level `value projection is`. */
export function isProjectionOnly(pattern: string): boolean {
  return patternScope(pattern)?.slot === "projection-only";
}
