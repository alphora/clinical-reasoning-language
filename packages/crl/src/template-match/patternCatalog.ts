// #189 P2 (design D9) — THE PATTERN CATALOG: one entry per pattern, total and fail-closed.
//
// ⚠⚠ WHY ONE TABLE, AND WHY TOTAL. Two tables in two directories used to classify one catalog —
// `cql-emitter/patternReturnShape` (return shape) and `template-match/patternScope` (projection slot) — and
// both design arms called that a drift machine. The first merge kept them as two records in one file, with
// scope still an EXCEPTION list where absent meant "unrestricted". That reproduced the very gap D9 was
// written to close: `matches this` was added to the matcher with no classification and nothing noticed,
// because a table with a permissive default cannot report its own holes. So every pattern now carries an
// EXPLICIT entry, and `slot` is REQUIRED. The repetition of `slot: "any"` is the mechanism: adding a pattern
// forces a scope decision instead of inheriting one.
//
// ⭐ WHAT IS **NOT** HERE: STAGE KIND (producer / filter / selection / aggregate). It is not a per-pattern
// fact — it is a property of an OCCURRENCE, derived from `(return shape × concept signature × terminal
// position)` in the shared resolver. `"BMI" at least 30` is a PRODUCER in `Obese` because of what that
// concept publishes and where the stage sits. Storing it would mean one wrong value or a context-keyed table
// (the derivation, written badly) — and deriving it is what dissolves the long-standing contradiction over
// whether `AtLeast` is a producer or an aggregate. Both observations were right on different axes.
//
// REFACTOR:grounded — the catalog's own entries are re-derived from the target model. ⚠ The `REFACTOR:suspect`
// below refers to `emitCQL.ts`, NOT to this file; do not read it as a mark on the catalog.
//
// RULE ([[patterns-are-semantic]]): a catalog signature never constrains what the author may DECLARE — the
// emitter picks the pattern's REALIZATION FORM from the declared `(type, valuetype)`. But the emitter must
// NEVER INSERT A REDUCTION (`exists`, a singleton lift `{ }`, a `Coalesce`) to bridge a shape the author
// declared. A mismatch is an AUTHOR-TIME ERROR naming the fix ("declare the reduction"), not a bridge.
//
// ⚠ REFACTOR:suspect — the emitter DOES still bridge (`emitCQL.ts`, the declared-vs-patternShape block).
// That code is the PATIENT, not the rule. It cannot be removed until reduction NESTING lands, because
// without nesting an author has no way to SAY `exists ( <filter pattern> )`. Do not cite it as doctrine.

/**
 * What the catalog function yields.
 *
 * "list"     — List<Resource>.
 * "boolean"  — Boolean (inherently a predicate).
 * "instance" — Instance<Resource> (a singleton — MostRecent / Last / Earliest / First / the extremes).
 * "other"    — Period / Quantity / Interval / DateTime; the author's value type should match.
 *
 * The boolean-totality classifier reads this to classify a catalog-pattern concept's totality
 * (list/instance → intrinsically total via `exists <call>`; boolean → requires-boundary comparator).
 */
export type PatternReturnShape = "list" | "boolean" | "instance" | "other";

/** Which syntactic slot a pattern may occupy. */
export type PatternSlot =
  /** Legal anywhere a narrative is matched. */
  | "any"
  /** ONLY as a whole, standalone rep-level `value projection is` — never a definition, never a pipeline stage. */
  | "projection-only";

/**
 * What a projection READS — which decides what it can PRODUCE per invocation.
 *
 * ⚠⚠ THIS IS NOT THE ABSENCE RULE, and conflating the two kills the pause row. A projection is invoked ONCE
 * PER RETRIEVED RECORD (charter §3), so for EVERY projection **zero records ⇒ zero invocations ⇒ the arm
 * contributes NOTHING** — not `false`. That is what leaves a concept unestablished, and it is the only
 * reason an unanswered determination can pause.
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
   * The retrieved record's datum. Invoked per retrieved record, and CAN answer `false` — a record whose code
   * is not a member is a determinate no. A record carrying no datum answers `null`.
   */
  | "datum";

/**
 * Whether the pattern needs the representation's `coded from` set.
 *
 * ⚠ NOT a boolean, and the difference is a REGRESSION this replaces. `Exists` was marked "always requires
 * terminology", which rejected `- type is Patient.` + `- value projection is exists this.` — a LEGAL form,
 * because the charter decides `coded from` by MODEL INFO: it is required exactly when the resource has a
 * CODE-BASED RETRIEVE, and Patient has none (you retrieve the patient, never patients-with-code-X). A
 * per-pattern boolean duplicated a decision that belongs to the resource.
 */
export type TerminologyNeed =
  /** The set IS the pattern's comparand; without one it means nothing, whatever the resource. */
  | "always"
  /** The pattern is indifferent; the RESOURCE decides, per the charter's model-info rule. */
  | "when-coded-retrieve"
  /** Never relevant. */
  | "never";

/** How a representation's retrieve must be SHAPED for a projection to mean what it says. */
export type RetrieveShape =
  /** `[Resource: "VS"]` — the set narrows the retrieve. */
  | "terminology-filtered"
  /** `[Resource]` — the pattern must SEE non-members in order to judge them. */
  | "unfiltered";

/**
 * Whether a pattern may occupy a PIPELINE STAGE position, and what it does with the space handed to it.
 *
 * ⚠⚠ THE DEFAULT IS `{ grounded: false }`, AND THAT IS THE POINT. D9 made this catalog TOTAL over return
 * shapes, which removed the old silent default — but it also meant nothing distinguished the handful of
 * patterns whose STAGE behaviour has actually been verified from the ~40 that merely have a return shape. A
 * resolver deriving effect from return shape alone would cheerfully classify `ComponentOf`, `InpatientStay`
 * and `StartOf` as pipeline stages. This is the carrier that makes "fail closed" real rather than a wish.
 *
 * ⚠ `grounded: true` means VERIFIED AGAINST ITS REALIZATION — signature, what it reads, and whether a list
 * return preserves elements — not merely "it has a return shape". For a `realization: "crl-common"` pattern
 * that realization is the function in `CRLCommon.cql`; for a `"native"` one it is the CQL operator it lowers
 * to. Saying "verified against `CRLCommon.cql`" would leave a native reduction with nothing to verify
 * against, and the next grounding would copy a precedent the definition does not cover.
 */
export type PatternStage =
  /** Refused in a stage position. The default, and correct for anything unverified. */
  | { grounded: false }
  | {
      grounded: true;
      /**
       * `flow`     — takes the handed space (a `List<Resource>`) as its argument. SELECTION / FILTER.
       * `operands` — takes NAMED singleton operands only and computes a value from them; it does not consume
       *              the space, so a PRODUCER adds its result to what it was given.
       *
       * ⚠ Zero canonical args cannot stand in for this: `most recent this` is `MostRecent` with zero args and
       * reads the flow, while `exists this` / `matches this` also have zero args in their own slot.
       */
      reads: "flow" | "operands";
      /**
       * For a LIST-returning pattern: does the output preserve the handed elements (a FILTER), or transform
       * them (a MAP)?
       *
       * ⚠ MEASURED that return shape alone cannot answer this: `ComponentOf` is `"list"` and returns
       * `List<Quantity>` — it maps Observations to component quantities, preserving neither identity nor
       * type — while `BaselineAndFollowUp` is `"list"` and genuinely filters. Required on a grounded
       * list-returning pattern; meaningless otherwise.
       */
      preservesElements?: boolean;
    };

/**
 * How a pattern becomes target code.
 *
 * ⚠ REQUIRED, because `grounded` is a claim about a REALIZATION and the two realizations are verified
 * against different artifacts. Every pattern here but one is a call into `CRLCommon.cql`; a `"native"` one
 * lowers to a CQL operator and has no CRLCommon function at all. Without this field a consumer reasonably
 * assumes `entry.pattern` names a callable `CRLCommon` function — and for a native reduction it does not.
 */
export type PatternRealization = "crl-common" | "native";

export interface PatternEntry {
  returnShape: PatternReturnShape;
  /** REQUIRED. Explicit on every pattern, so adding one forces a scope decision. */
  slot: PatternSlot;
  /** REQUIRED. Absent grounding is a REFUSAL, never a permission — see `PatternStage`. */
  stage: PatternStage;
  /** REQUIRED. See `PatternRealization` — a catalog NAME is not always a callable function name. */
  realization: PatternRealization;
  /** Projection facts — present only for `projection-only` patterns, where they are load-bearing. */
  projection?: {
    reads: PatternReads;
    /** Operand count the pattern's own contract promises. A folded pipeline stage violates it. */
    arity: number;
    terminology: TerminologyNeed;
    retrieve: RetrieveShape;
  };
}

/** `slot: "any"`, and NOT grounded as a pipeline stage — the ordinary catalog pattern.
 *  ⚠ Grounding is opt-in and per-pattern: see `groundedStage` below and `PatternStage`. */
const any = (returnShape: PatternReturnShape): PatternEntry => ({
  returnShape,
  slot: "any",
  stage: { grounded: false },
  realization: "crl-common",
});

/**
 * `slot: "any"` AND verified as a pipeline stage against `CRLCommon.cql`.
 *
 * ⚠ Only the patterns the GOAL actually exercises are grounded so far — everything else is refused in a
 * stage position rather than guessed. Grounding one means reading its realization, not assuming from its
 * return shape.
 */
const groundedStage = (
  returnShape: PatternReturnShape,
  reads: "flow" | "operands",
  preservesElements?: boolean,
): PatternEntry => ({
  returnShape,
  slot: "any",
  stage: { grounded: true, reads, ...(preservesElements !== undefined ? { preservesElements } : {}) },
  realization: "crl-common",
});

/**
 * A grounded stage that lowers to a CQL OPERATOR rather than a `CRLCommon` function.
 *
 * ⚠ The separate constructor is the point: `groundedStage` promises a CRLCommon realization, and a caller
 * reaching for it to add a native reduction would silently make that promise. There is exactly one native
 * pattern today (`ExistsOverSpace`); a second should be a deliberate act, not an inherited default.
 */
const nativeStage = (returnShape: PatternReturnShape, reads: "flow" | "operands"): PatternEntry => ({
  returnShape,
  slot: "any",
  stage: { grounded: true, reads },
  realization: "native",
});

const CATALOG: Readonly<Record<string, PatternEntry>> = {
  // ── List-returning filter patterns (primitive form per CRLCommon v0.2.0) ──────────────────────────
  Has: any("list"),
  HasHistoryOf: any("list"),
  CurrentlyTaking: any("list"),
  HasAdverseReactionTo: any("list"),
  AsOf: any("list"),
  Within: any("list"),
  ComponentOf: any("list"),
  NotDoneWithReason: any("list"),
  BaselineAndFollowUp: any("list"),
  WasOrdered: any("list"),
  Justified: any("list"),
  Active: any("list"),
  IsVerified: any("list"),
  DocumentedAs: any("list"),
  During: any("list"),
  Overlaps: any("list"),
  OnDayOfOrAfter: any("list"),
  OnOrBefore: any("list"),
  SameDay: any("list"),
  BetweenAnchors: any("list"),
  WasPerformed: any("list"),

  // ── Inherently-boolean patterns (no meaningful list realization) ──────────────────────────────────
  Without: any("boolean"),
  With: any("boolean"),
  AtLeastApart: any("boolean"),
  AtMostApart: any("boolean"),
  AtLeastN: any("boolean"),
  Consecutive: any("boolean"),
  High: any("boolean"),
  Low: any("boolean"),
  Normal: any("boolean"),
  Abnormal: any("boolean"),
  // ⭐ GROUNDED, and its signature is the load-bearing fact: `AtLeast(rec Observation, target Quantity)`
  // (:587) takes a SINGLETON record, NOT a list — so it reads NAMED operands and does not consume the space.
  // That is why it can be a PRODUCER: its result joins the space it was handed rather than replacing it.
  AtLeast: groundedStage("boolean", "operands"),
  AtMost: any("boolean"),
  Between: any("boolean"),
  Exceeds: any("boolean"),
  Below: any("boolean"),

  // ── Instance-returning SELECTION patterns (a singleton resource) ──────────────────────────────────
  // GROUNDED: `MostRecent(X List<Observation>): Last(X)` (CRLCommon.cql:434) — takes the handed space.
  MostRecent: groundedStage("instance", "flow"),
  Last: any("instance"),
  LastOf: any("instance"),
  Earliest: any("instance"),
  First: any("instance"),
  FirstOf: any("instance"),
  // ⭐ #189 — these pick the record at one end of an ordering, exactly as MostRecent/Earliest do over time.
  // They returned a bare value until the catalog was corrected, which is why a `shape is Record` concept
  // could not publish the record its shape declares.
  // GROUNDED: `Highest(X List<Observation>): Last((X) O sort by (value as Quantity).value)` (:550) — the
  // handed space, ordered by value instead of by time. `Lowest` is its mirror.
  Lowest: groundedStage("instance", "flow"),
  Highest: groundedStage("instance", "flow"),

  // ── Other-shape patterns (Period, Quantity, Interval, DateTime) ───────────────────────────────────
  InpatientStay: any("other"),
  BeforeStartOf: any("other"),
  AfterStartOf: any("other"),
  BeforeEndOf: any("other"),
  AfterEndOf: any("other"),
  OnDayOf: any("other"),
  AgeAt: any("other"),
  // ⚠ NESTED-ONLY, and classified anyway. `StartOf` appears only inside `AgeAt(StartOf(X))` — but "never
  // looked up" is a claim about today's call sites, not an invariant, and a fail-closed table must not
  // depend on one.
  StartOf: any("other"),
  Calculate: any("other"),
  // #189 — a PRODUCER: computes a new Quantity (kg/m2) from two record operands. "other" because the value
  // it yields is neither a member of its input nor a boolean — the concept declares what it publishes.
  // GROUNDED: `BodyMassIndex(weight Observation, height Observation)` (:615) — two singleton operands,
  // yielding a Quantity. Named operands, so PRODUCER.
  BodyMassIndex: groundedStage("other", "operands"),
  // No `AgeInMonths` entry BY DESIGN (#257 T2): the months compute fn only ever appears NESTED inside a
  // top-level comparator (`AtLeast`/`AtMost`/`Below`), never as the top-level pattern.
  // ⚠ An older note claimed a `?? "list"` default made a stray lookup "fail loudly". It did not — it produced
  // `exists CRLCommon.AgeInMonths()` and deferred the failure to CQL compile. The default is GONE.

  // ── REP-LOCAL PROJECTIONS ─────────────────────────────────────────────────────────────────────────
  // Both are invoked once per retrieved record; both contribute NOTHING when zero records are retrieved.
  // They differ in what they can answer WHEN invoked, and in the retrieve shape that makes them honest.
  Exists: {
    returnShape: "boolean",
    slot: "projection-only",
    // A projection is never a stage — D10 rejects it in a pipeline outright.
    stage: { grounded: false },
    realization: "crl-common",
    projection: {
      reads: "records",
      arity: 0,
      // ⚠ NOT "always". Patient has no code-based retrieve, so `- type is Patient.` + `exists this` is
      // legal without a `coded from`; the RESOURCE decides (charter: `coded from` is model info).
      terminology: "when-coded-retrieve",
      // Filtering the retrieve and testing each code are EQUIVALENT for an existence question
      // (`exists([SR: VS])` = `exists(SR where code in VS)`), so this keeps the filtered retrieve.
      retrieve: "terminology-filtered",
    },
  },
  Matches: {
    returnShape: "boolean",
    slot: "projection-only",
    stage: { grounded: false },
    realization: "crl-common",
    projection: {
      reads: "datum",
      arity: 0,
      // The set IS the comparand — without one there is nothing to match against, on any resource.
      terminology: "always",
      // ⚠ It MUST see non-members: filter the retrieve and a wrong-code record vanishes into the same empty
      // set as no record at all, collapsing a determinate `false` into `unknown`.
      retrieve: "unfiltered",
    },
  },

  // ── THE CONCEPT-LEVEL EXISTENCE REDUCTION ─────────────────────────────────────────────────────────
  //
  // ⭐⭐ NOT A SPELLING OF `Exists` ABOVE, AND CONFLATING THE TWO WAS A LIVE DEFECT. Both are written
  // `exists this`, and that is where the resemblance ends:
  //
  //   · `Exists` is REP-LOCAL: it sits in ONE representation's `value projection is`, is invoked once per
  //     retrieved record, and therefore answers `true` or NOTHING — an existence arm cannot record a
  //     negative, which is what lets a determination pause.
  //   · `ExistsOverSpace` is CONCEPT-LEVEL: it is the third arm working on the collection the other two
  //     filled, so it reduces a space that is already there and absence is a CLOSED-WORLD `false`. It
  //     never pauses.
  //
  // Routing the structural `definition is exists this` through `Exists` refused 55 in-tree concepts as
  // "a rep-local projection cannot be a pipeline stage" — including the canonical
  // `type is Condition` + `value type is boolean` + `exists this`. MEASURED, not reasoned.
  //
  // ⚠ The SLOT is what separates them, and the matcher cannot see it: `matcher.ts` emits `Exists` for the
  // words `exists this` wherever they appear. The resolver, which only ever reads a `definition is`, does
  // the slot-keyed rename — see `DEFINITION_SLOT_RENAME` in `resolvePipeline.ts`. ⚠ `Matches` deliberately
  // does NOT get the same treatment: its comparand is the representation's own `coded from`, so it has no
  // concept-level counterpart and belongs nowhere but a projection.
  ExistsOverSpace: nativeStage("boolean", "flow"),
};

/** The catalog entry for `pattern`, or `undefined` if it is unclassified. */
export function patternEntry(pattern: string): PatternEntry | undefined {
  return Object.prototype.hasOwnProperty.call(CATALOG, pattern) ? CATALOG[pattern] : undefined;
}

/**
 * The return shape of `pattern`, or `undefined` if unclassified.
 *
 * ⚠ Prefer `requireReturnShape` at any site that must DECIDE behaviour. This nullable form exists for the
 * callers that legitimately ask "is this classified at all" — the totality audit, and the validator rule
 * that reports an unclassified stage as OUR catalog gap rather than an authoring error.
 */
export function patternReturnShape(pattern: string): PatternReturnShape | undefined {
  return patternEntry(pattern)?.returnShape;
}

/**
 * The return shape of `pattern`, THROWING if unclassified.
 *
 * ⚠⚠ THIS REPLACES `PATTERN_RETURN_SHAPE[p] ?? "list"`. That default silently classified any unknown pattern
 * as a FILTER — a wrong classification that compiles, which is the soft-compile trap in miniature. The
 * in-tree precedent for the correct behaviour already existed (`emit/booleanTotality.ts` fails closed on the
 * same lookup).
 *
 * Reaching this throw means a matcher emits a pattern the catalog does not know — OUR gap, never the
 * author's, and `patternCatalog.test.ts` is meant to catch it first.
 */
export function requireReturnShape(pattern: string, context: string): PatternReturnShape {
  const shape = patternReturnShape(pattern);
  if (shape === undefined) {
    throw new Error(
      `internal: pattern \`${pattern}\` has no catalog classification (${context}). ` +
        `A matcher emits it but the catalog does not classify it — add an entry to \`patternCatalog.ts\`. ` +
        `This is a catalog gap, not an authoring error.`,
    );
  }
  return shape;
}

/** The projection facts of `pattern`, or `undefined` if it is not a rep-local projection. */
export function patternProjection(pattern: string): NonNullable<PatternEntry["projection"]> | undefined {
  return patternEntry(pattern)?.projection;
}

/** Whether `pattern` is legal ONLY as a standalone rep-level `value projection is`. */
export function isProjectionOnly(pattern: string): boolean {
  return patternEntry(pattern)?.slot === "projection-only";
}

/**
 * ⭐ THE ONE READING OF "is this a selection" — the single context-free axis of stage effect.
 *
 * ⚠⚠ THIS FUNCTION IS THE SWITCH (design R7). `pipelineStageValidator` and `resolvePipeline.deriveEffect`
 * used to derive it separately from `returnShape === "instance"`; both now CALL this. A re-derived twin in
 * either caller is two readings again, just co-located.
 *
 * ⚠ IT MUST NOT REQUIRE GROUNDING, and that is not an oversight. The resolver refuses an ungrounded pattern
 * before it ever derives an effect, but the VALIDATOR must still answer this for the five ungrounded
 * instance-returning patterns in the catalog (`Last`, `LastOf`, `Earliest`, `First`, `FirstOf`) — otherwise
 * `pipeline-selection-after-selection` silently stops firing for all of them. Selection is context-free
 * BECAUSE it is: picking one member of a space is that whatever the concept publishes and whoever asks.
 */
export function isSelectionPattern(pattern: string): boolean {
  return patternReturnShape(pattern) === "instance";
}

/** Every classified pattern name — for the totality audit. */
export function classifiedPatterns(): readonly string[] {
  return Object.keys(CATALOG);
}
