// #189 SR — WHERE a canonical pattern is legal, and what it reads.
//
// ⚠ WHY THIS EXISTS. `matchNarrative` has ONE global pattern registry serving three different syntactic
// slots — a concept-level `definition is`, a rep-level `value projection is`, and each stage of a `, then`
// pipeline. Registering a matcher therefore makes its form legal in ALL of them, whether or not that was
// intended. Adding `matches this` (a REP-LOCAL membership projection) silently made two nonsense forms
// "known", both MEASURED:
//
//     definition is matches this.                        -> Matches()          — no representation to be local to
//     definition is most recent this, then matches this. -> Matches(<stage 1>) — the pipeline fold PREPENDS the
//                                                                               previous stage, so the promised
//                                                                               zero-arg call arrives with one
//
// The second is the dangerous one: the pattern's own contract says it takes no operand, and the fold gives it
// one anyway. A consumer reading `args[0]` would be reading a stage, not a comparand.
//
// ⭐ The descriptor is SHARED so validation and (later) lowering read ONE table rather than each switching on
// a pattern name. That is the whole point: the retrieve shape `matches this` requires is a semantic property
// of the pattern, and a future emit author must not be able to re-derive it differently.

/** What a pattern READS — which, per the charter's VOCABULARY section, decides how it reads ABSENCE. */
export type PatternReads =
  /** Records. Absence ANSWERS the question ("there are none"), so it is `false` and never pauses. */
  | "records"
  /** A datum. Absence leaves the question with no subject, so it is `unknown` and CAN pause. */
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
 * Patterns whose slot is narrower than "any". Absent = `any` (the catalog default) — this table is the
 * EXCEPTION list, not a registry of every pattern.
 */
export const PATTERN_SCOPE: Readonly<Record<string, PatternScope>> = {
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
  return Object.prototype.hasOwnProperty.call(PATTERN_SCOPE, pattern)
    ? PATTERN_SCOPE[pattern]
    : undefined;
}

/** Whether `pattern` is legal ONLY as a standalone rep-level `value projection is`. */
export function isProjectionOnly(pattern: string): boolean {
  return patternScope(pattern)?.slot === "projection-only";
}
