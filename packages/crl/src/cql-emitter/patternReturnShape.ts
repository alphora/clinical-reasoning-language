// Pattern return-shape classification — a LEAF data table (no emitter imports), shared by the CQL emitter
// (`emitCQL.ts`, which re-exports it for its existing consumers) and the boolean-totality classifier
// (`emit/booleanTotality.ts`). Extracted here (#189 Slice C boundary 2, 2a) to break the value-import cycle
// that would otherwise form once `emitCQL` imports `DefineLedger`/`classifyBooleanTotality` from
// `booleanTotality` while `booleanTotality` imported this table FROM `emitCQL`.
//
// CRLCommon library (v0.2.0+) returns the primitive list-shaped form for filter patterns. The boolean
// realization is composed at the call site by wrapping with `exists(...)`. The author's `(type, valuetype)`
// declaration drives whether the emitter wraps (boolean consumer) or calls directly (refinement consumer).
// Per the principle [[patterns-are-semantic]] + [[defined-as-is-semantic-composition]] + catalog v0.6.0.
//
// "list"     — function returns List<Resource>; emitter wraps with `exists(...)` for boolean consumers.
// "boolean"  — function returns Boolean (inherently a predicate); refinement consumers get a FIXME comment.
// "instance" — function returns Instance<Resource> (singleton — e.g. MostRecent/Last/Earliest/First); for
//              refinement consumers the emitter lifts to a singleton-list via `{...}`.
// "other"    — function returns Period/Quantity/Interval/DateTime; author's valuetype should match.
//
// The boolean-totality classifier reads this table to classify a catalog-pattern concept's totality
// (list/instance → intrinsically-total via `exists <call>`; boolean → requires-boundary comparator).

export type PatternReturnShape = "list" | "boolean" | "instance" | "other";

export const PATTERN_RETURN_SHAPE: Record<string, PatternReturnShape> = {
  // List-returning filter patterns (primitive form per v0.2.0 refactor).
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

  // Instance-returning selection patterns (singleton resource).
  MostRecent: "instance",
  Last: "instance",
  LastOf: "instance",
  Earliest: "instance",
  First: "instance",
  FirstOf: "instance",

  // Other-shape patterns (Period, Quantity, Interval).
  InpatientStay: "other",
  BeforeStartOf: "other",
  AfterStartOf: "other",
  BeforeEndOf: "other",
  AfterEndOf: "other",
  OnDayOf: "other",
  AgeAt: "other",
  // No `AgeInMonths` entry by design (#257 T2): the months compute fn only ever appears
  // NESTED inside a top-level comparator (`AtLeast`/`AtMost`/`Below` = "boolean"), never as
  // the top-level pattern, so it is never looked up here. If it ever were, the `?? "list"`
  // default would fail loudly (`exists CRLCommon.AgeInMonths()`), not miscompile.
  Calculate: "other",
  Lowest: "other",
  Highest: "other",
};
