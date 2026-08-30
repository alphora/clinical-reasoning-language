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

export interface PatternEntry {
  returnShape: PatternReturnShape;
  /** REQUIRED. Explicit on every pattern, so adding one forces a scope decision. */
  slot: PatternSlot;
  /** Projection facts — present only for `projection-only` patterns, where they are load-bearing. */
  projection?: {
    reads: PatternReads;
    /** Operand count the pattern's own contract promises. A folded pipeline stage violates it. */
    arity: number;
    terminology: TerminologyNeed;
    retrieve: RetrieveShape;
  };
}

/** `slot: "any"` with a return shape — the ordinary catalog pattern. */
const any = (returnShape: PatternReturnShape): PatternEntry => ({ returnShape, slot: "any" });

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
  AtLeast: any("boolean"),
  AtMost: any("boolean"),
  Between: any("boolean"),
  Exceeds: any("boolean"),
  Below: any("boolean"),

  // ── Instance-returning SELECTION patterns (a singleton resource) ──────────────────────────────────
  MostRecent: any("instance"),
  Last: any("instance"),
  LastOf: any("instance"),
  Earliest: any("instance"),
  First: any("instance"),
  FirstOf: any("instance"),
  // ⭐ #189 — these pick the record at one end of an ordering, exactly as MostRecent/Earliest do over time.
  // They returned a bare value until the catalog was corrected, which is why a `shape is Record` concept
  // could not publish the record its shape declares.
  Lowest: any("instance"),
  Highest: any("instance"),

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
  BodyMassIndex: any("other"),
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

/** Every classified pattern name — for the totality audit. */
export function classifiedPatterns(): readonly string[] {
  return Object.keys(CATALOG);
}
