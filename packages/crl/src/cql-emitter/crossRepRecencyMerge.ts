// #189 B2 — the general cross-representation recency VALUE merge (pure emit-fragment assembler).
//
// ⚠ NO LONGER INERT — flip F landed. `emitCQL.ts:3268` calls this from the live both-rep VALUE merge. The
// paragraph below describes how it is wired, not a future.
//
// ⚠⚠ TWO ARMS ONLY, AND THAT IS A CEILING, NOT A CHOICE. `CrossRepRecencyMergeArms` has slots for LOCAL and
// SOURCE and no third, so a value-publishing concept cannot union a DERIVATION arm alongside them. The
// charter's model is `own ∪ derivation ∪ record` reduced once (goal `fixtures/obesity/policy.crl`: "THREE,
// not two — the local code is an arm like any other"), and the RECORD path implements it N-ary via
// `renderSpaceTerms(terms: readonly RecordUnionTerm[])`. This path does not. Today the gap is GUARDED, not
// silent — `code is` + a top-level `definition` is a hard `emit-mixed-code-and-definition` — so the
// unbuildable case is refused rather than mis-emitted. If a three-arm VALUE concept is ever wanted, this
// signature is what has to change; do not add a third arm by threading another pair through the call site.
//
// The atomic flip F wired it — supplying a both-rep concept's
// [local-exact, source] value-read + recency fragments (from the effective-representation descriptors, B1) and the
// newest-record select defines (the #236 concept-owned-DAG precedent — value + timestamp read from ONE bound
// select, not two independent `Last(...)`). This module ONLY assembles the two-tier selection structure; it invents
// no policy of its own.
//
// The tie-break POLICY lives in exactly ONE place — `CaseFeatureCommon.recencyLocalWins` (engine-pinned, disc 498)
// — so age and this general merge cannot drift. This assembler wraps a `recencyLocalWins` call in the value-presence
// tier; it never re-implements the timestamp comparison.
//
// Design (disc 498; charter §2 local-is-canonical): a two-tier selection producing the SELECTED value (or null):
//   1. value-presence: source value null → LOCAL (possibly null — the LOAD-BEARING null return B3's `is not null`
//      interface reads: both-absent → null → interface false); local value null (source present) → SOURCE (the
//      additive/defaulting model — a source-only datum defaults the concept, disc 496 remote-only cell).
//   2. both present → `recencyLocalWins(localTs, sourceTs)` — LOCAL on any indeterminacy (null / precision mismatch
//      / equal), SOURCE only when strictly newer.
// Value selection is TYPED at the call site (CQL has no generics): the caller passes CQL fragments already typed to
// the concept's datum type (e.g. CodeableConcept), so no per-type overload is needed here.

/** The four CQL read fragments + the CaseFeatureCommon alias the merge is assembled from. Each is a raw CQL
 *  expression string the caller (F) produces from the concept's descriptors; `localTs`/`sourceTs` must read
 *  `System.DateTime` (the caller normalizes per recency-element type, or fails closed on a non-dateTime recency —
 *  design deferred to F, matching age's `(effective as FHIR.dateTime).value` precedent). */
export type CrossRepRecencyMergeArms = {
  /** LOCAL arm value read, typed to the concept's datum type (e.g. `<LocalNewest>.value`). */
  localValue: string;
  /** LOCAL arm recency timestamp (`System.DateTime`, e.g. `(<LocalNewest>.effective as FHIR.dateTime).value`). */
  localTs: string;
  /** SOURCE arm value read, SAME datum type (e.g. `<SourceNewest>.code`). SEPARATE axis from the local read. */
  sourceValue: string;
  /** SOURCE arm recency timestamp (`System.DateTime`, e.g. `<SourceNewest>.authoredOn.value`). */
  sourceTs: string;
  /** The `include CaseFeatureCommon called <alias>` alias (goldens use `CFH`). Defaults to `CFH`. */
  cfhAlias?: string;
};

/**
 * Assemble the general cross-rep recency value-merge CQL expression — the SELECTED value (or null). Pure over the
 * fragment strings; the tie-break is delegated to `<CFH>.recencyLocalWins`. Parenthesizes every injected fragment
 * so a compound read (e.g. a cast) composes without precedence surprises.
 */
export function crossRepRecencyMergeExpr(arms: CrossRepRecencyMergeArms): string {
  const cfh = arms.cfhAlias ?? "CFH";
  const lv = `(${arms.localValue})`;
  const sv = `(${arms.sourceValue})`;
  return (
    `if ${sv} is null then ${lv} ` +
    `else if ${lv} is null then ${sv} ` +
    `else if ${cfh}.recencyLocalWins(${arms.localTs}, ${arms.sourceTs}) then ${lv} ` +
    `else ${sv}`
  );
}
