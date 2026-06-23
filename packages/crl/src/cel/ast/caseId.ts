import type { CELCase } from "./types";

/** Bounded explicit-id format (provenance spec §7 "bounded, like #135"): alnum start, then alnum/_/-, ≤ 128 chars.
 *  (Raised from 64 per T5 sur716-011 feedback — descriptive stable ids like
 *  "contralateral-reduction-mammaplasty-for-symmetry-after-mastectomy" exceed 64; still bounded.) */
export const CASE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** Reserved derived-id namespace — an EXPLICIT id matching this is rejected (it would shadow a derived ordinal). */
export const DERIVED_CASE_ID_RE = /^k\d+$/;

/**
 * PROVISIONAL effective case id (provenance spec §7).
 *
 * NOT a stable address: the derived ordinal is POSITION-DEPENDENT — inserting/reordering an un-id'd case shifts it,
 * which would silently re-point a stored provenance ref (the §8 failure mode). Use it only as a transient default for
 * cases that have NO provenance pointing at them. The durable invariant — *grammar-optional / provenance-mandatory*
 * (a case under provenance MUST carry an explicit, frozen `- id is "..."`) — is enforced at the provenance-emit step,
 * not here.
 *
 * @param sourceIndex 0-based position of the case among ALL cases in the `.cel`, in source order.
 */
export function effectiveCaseId(c: CELCase, sourceIndex: number): string {
  return c.caseId ?? `k${sourceIndex + 1}`;
}

/** Convenience: provisional effective ids for every case in source order. */
export function effectiveCaseIds(cases: CELCase[]): string[] {
  return cases.map((c, i) => effectiveCaseId(c, i));
}
