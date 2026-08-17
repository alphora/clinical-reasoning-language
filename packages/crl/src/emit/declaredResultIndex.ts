// #189 Slice C boundary 2, slice 2b.3a — the pre-emit, cross-library DECLARED-RESULT index.
//
// A PROJECTION of the LOWERED closure (all resolved+lowered library ASTs, post-`lowerLocalCodes`): for a
// cross-library authored operand ref, what is the TARGET concept's declared `ResultType`? This is the datum the
// `defined as` composition emit needs when it composes over a foreign concept — the per-library emitter cannot see
// another library's declaration (the `emitCQL.ts` "TRAP FOR THE FUTURE INTERFACE SLICE"). It carries the EXISTING
// `grammar/resultType.ts` `ResultType` (design section 7 F5) so validate + emit share ONE result-type model.
//
// SCOPE (2b.3a): this slice builds the `ResultType` (operand-COMPATIBILITY) half + the scope-resolved resolver, and
// is UNCONSUMED (byte-invariant precursor — a purely-additive new module, zero existing-file changes, the strongest
// byte-invariance control; mirrors the 2b.0 discipline of proving the infra in isolation). The generalized
// `emitsTotalScalarBoolean` resolve seam + the lane-aware TOTALITY verdict (does the foreign concept's emitted
// define compute a total boolean?) ride slice 2b.3b: the verdict is byte-COUPLED to the shared-predicate flip, and
// the seam refactor is co-located there (as 2b.3b's byte-invariant first sub-step) so the cross-lib recursion it
// enables — and its `{library,name}` cycle guard + per-resolver memo — are reviewed beside the logic that exercises
// them (crl-emit panel R4, disc 450; 2b.3a code review, disc 451).
//
// ADDITIVE, NOT a replacement for `conceptShapesByName` (`layeredEmit.ts` `buildConceptShapeMap`): that map is
// CARDINALITY (`Concept["shape"]`), RecordSet-wins, per-library, bare-name — tuned for the cross-lib reduction-RECORDS
// operand. This index is `ResultType` (value-type-derived), PUBLIC-determination-wins, keyed by a STABLE source
// identity. One map cannot serve both (different winner rule + axis; disc 446/439). Also SEPARATE from the POST-emit
// `CloseIndex` (`emit/closeIndex.ts`), which keeps its 2b.4 gate-proof purpose.
//
// ⚠ CONSUMER CONTRACT for 2b.3b: the resolver's key-space is the AUTHORED cross-library ref (verified `requalifyRef`
// leaves a genuinely-foreign qualifier authored, `layeredEmit.ts:594-597`). It does NOT model a RENDERED-layer
// qualifier (a same-source cross-LAYER operand, e.g. an Inferred composition over a pure-`code is` LocalSource
// concept, is rendered-qualified post-`requalifyRef`). EVERY 2b.3b consult site — including the discharge gate
// (`emitCQL.ts:1248`), which runs over post-`requalifyRef` layer ASTs — MUST classify a rendered-layer qualifier
// itself BEFORE consulting this resolver, or a rendered token will miss (or, without the scope resolver, be
// mis-read as a source name). Plan section 4.6(ii) covers the case-feature leaf; the discharge consult is the one to
// not forget.

import type { Concept, ReferenceName } from "../ast/types";
import type { ResultType } from "../grammar/resultType";
import { conceptResultType } from "../grammar/resultType";

/** One source library's LOWERED concepts, keyed by its STABLE source identity (`sourceIdentity` — the registry
 *  `filePath` in production, NOT the display library name, which collides for `local-package-same-name`). */
export type LibraryConcepts = {
  sourceIdentity: string;
  concepts: readonly Concept[];
};

/** A discriminated lookup result (mirrors `closeIndex.ts` `RouteResult`). `indeterminate` (the concept exists but
 *  declares 0 or >1 value types, so `conceptResultType` yields no comparable type) is DISTINCT from `miss` (no such
 *  public concept) and `ambiguous` (>1 distinct public candidate) — 2b.3b emits different diagnostics per kind
 *  (`emit-declared-result-unresolved` vs `-ambiguous`), so the index must not flatten them. */
export type DeclaredLookup =
  | { kind: "hit"; result: ResultType }
  | { kind: "indeterminate" }
  | { kind: "ambiguous" }
  | { kind: "miss" };

/** The pre-emit cross-library declared-result index. */
export type DeclaredResultIndex = {
  lookup(sourceIdentity: string, name: string): DeclaredLookup;
};

/** Convenience projection for a pure operand-COMPATIBILITY consumer that treats every non-hit uniformly. */
export function resultTypeOf(l: DeclaredLookup): ResultType | undefined {
  return l.kind === "hit" ? l.result : undefined;
}

/** Collision-free composite key over a stable identity + a name (both may contain spaces — concept and rendered
 *  layer names do). Mirrors `closeIndex.ts:32`. */
function keyOf(sourceIdentity: string, name: string): string {
  return JSON.stringify([sourceIdentity, name]);
}

/**
 * A PUBLIC-determination candidate for the index: an untagged authored concept (an ordinary concept, incl. a
 * foreign reduction/comparator, is public — `booleanTotality.ts:378-385`) OR the synthesized `public-determination`
 * twin (which wins its same-name `source-impl` twin). An Interface re-export façade (`__interfaceReexport` /
 * `__loweringRole === "interface-facade"`) and an implementation twin (`source-impl` / `records-impl`) are NEVER the
 * public meaning a cross-library ref denotes.
 */
function isPublicCandidate(c: Concept): boolean {
  if (c.__interfaceReexport === true) return false;
  const role = c.__loweringRole;
  return role === undefined || role === "public-determination";
}

/**
 * Build the index from the lowered closure. The winner rule (public-determination-wins) is applied by EXCLUDING
 * non-public candidates up front, so a both-representation same-name twin pair (a `source-impl` retrieve + its
 * `public-determination` determination, same name — `lowerLocalCodes.ts`) collapses to the one public entry. Two
 * DISTINCT public candidates for one `{sourceIdentity, name}` (should not occur — a name collision within a source
 * library) → recorded AMBIGUOUS (fail-safe, never a wrong pick).
 */
export function buildDeclaredResultIndex(
  libraries: readonly LibraryConcepts[],
): DeclaredResultIndex {
  const hits = new Map<string, ResultType>();
  const indeterminate = new Set<string>();
  const present = new Set<string>();
  const ambiguous = new Set<string>();
  for (const lib of libraries) {
    for (const c of lib.concepts) {
      if (!isPublicCandidate(c)) continue;
      const k = keyOf(lib.sourceIdentity, c.name);
      if (present.has(k)) {
        ambiguous.add(k);
        continue;
      }
      present.add(k);
      const rt = conceptResultType(c.shape, c.valueTypes, c.conceptType);
      if (rt === undefined) indeterminate.add(k);
      else hits.set(k, rt);
    }
  }
  return {
    lookup(sourceIdentity, name) {
      const k = keyOf(sourceIdentity, name);
      if (ambiguous.has(k)) return { kind: "ambiguous" };
      const rt = hits.get(k);
      if (rt !== undefined) return { kind: "hit", result: rt };
      if (indeterminate.has(k)) return { kind: "indeterminate" };
      return { kind: "miss" };
    },
  };
}

/**
 * Resolve a raw qualified ref's LIBRARY token to a STABLE source identity (the registry `filePath`) using the
 * referrer's scope (`lookupKnownLibrary` — the `local-package-same-name` disambiguation returns the entry whose
 * `filePath` is the identity). Returns `undefined` when the token is not a known library in the referrer's scope.
 * Mirrors the `closeIndex.ts` `resolveRawLibrary` seam; the production closure builds it from `buildLibraryScopes`
 * (wired when the resolver is consumed, slice 2b.3b).
 */
export type ResolveRawLibrary = (fromIdentity: string, rawLibraryName: string) => string | undefined;

/**
 * A per-referrer resolver: given the emitting library's STABLE identity and an authored ref, return the referent's
 * declared-result `DeclaredLookup`. Bound per SOURCE library (a synthesized layer has no scope entry; its layers
 * share the source library's scope). A bare ref denotes a concept in the referrer's OWN source library.
 */
export type DeclaredResultResolver = (fromIdentity: string, ref: ReferenceName) => DeclaredLookup;

export function makeDeclaredResultResolver(
  index: DeclaredResultIndex,
  resolveRawLibrary?: ResolveRawLibrary,
): DeclaredResultResolver {
  return (fromIdentity, ref) => {
    if (typeof ref !== "string") {
      // (c) A raw qualified authored ref: the referrer's SCOPE is authoritative and consulted FIRST — a raw token
      // can coincide with an unrelated library (`local-package-same-name`), so a direct token hit would mis-resolve.
      const scoped = resolveRawLibrary?.(fromIdentity, ref.libraryName);
      if (scoped !== undefined) return index.lookup(scoped, ref.name);
      // A scope miss WITH a resolver armed means the ref is unresolvable in the referrer's scope — do NOT fall
      // through to a raw token hit (it would resolve a never-imported library, or a rendered-layer token that
      // collides with a genuine source name). Only the no-resolver default treats the token AS a source identity
      // (correct when a ref names its target source directly, and there is no scope to consult).
      if (resolveRawLibrary === undefined) return index.lookup(ref.libraryName, ref.name);
      return { kind: "miss" };
    }
    // A bare ref → a concept in the referrer's own source library.
    return index.lookup(fromIdentity, ref);
  };
}
