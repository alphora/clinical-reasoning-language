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
// qualifier (a same-source cross-LAYER operand, e.g. an Inferences composition over a pure-`code is` LocalPrimitives
// concept, is rendered-qualified post-`requalifyRef`). EVERY 2b.3b consult site — including the discharge gate
// (`emitCQL.ts:1248`), which runs over post-`requalifyRef` layer ASTs — MUST classify a rendered-layer qualifier
// itself BEFORE consulting this resolver, or a rendered token will miss (or, without the scope resolver, be
// mis-read as a source name). Plan section 4.6(ii) covers the case-feature leaf; the discharge consult is the one to
// not forget.

import type { Concept, ReferenceName } from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import type { ResultType } from "../grammar/resultType";
import { conceptResultType } from "../grammar/resultType";
import { emitsTotalScalarBoolean, sameLayerResolver, uniformResolvers } from "../cql-emitter/totalScalarBoolean";
import type { ReferenceResolver, ReferentResolution } from "../cql-emitter/totalScalarBoolean";

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

/**
 * #189 Slice 0c — a SEPARATELY-KINDED totality lookup (NOT `total` glued onto `DeclaredLookup.hit` — disc 465 gpt56
 * #4 / Claude #5). Answers "does the foreign concept's OWN emitted define compute a TOTAL scalar boolean?" — the
 * datum a cross-library `defined as` BOOLEAN composition operand needs to prove total. A `total` verdict is claimed
 * ONLY for a coherent concept (its `ResultType` is a `hit`); an `indeterminate` (0 or >1 value types — an incoherent
 * declaration whose real emit the shared predicate does not faithfully model, `totalScalarBoolean.ts` KNOWN residual)
 * / `ambiguous` (name collision) / `miss` retain their DISTINCT cause. The boolean-composition operand gate maps
 * every non-`total:true` arm to `operand-not-total`, but the index preserves the cause for tests/diagnostics.
 *
 * ⚠ No `cycle` kind. The projection runs `emitsTotalScalarBoolean` with a `uniformResolvers` pair (both arms
 * same-layer), so a QUALIFIED operand is TERMINAL-inert and the projection NEVER recurses across a library boundary
 * — a cross-library reference cycle is structurally unreachable here (it degrades to a conservative non-total, the
 * documented chained-cross-lib case below). An INTRA-library alias cycle is caught by the predicate's own
 * name-keyed cycle guard (→ non-total), faithfully matching emit (which returns non-total on the same cycle). A
 * distinct `cycle` outcome would be dead code in this Option-(a) projection; the topological Option-(b) projection
 * that could produce one is deferred (see `buildDeclaredResultIndex`).
 */
export type TotalityLookup =
  | { kind: "total"; total: boolean }
  | { kind: "indeterminate" }
  | { kind: "ambiguous" }
  | { kind: "miss" };

/** The pre-emit cross-library declared-result index. */
export type DeclaredResultIndex = {
  lookup(sourceIdentity: string, name: string): DeclaredLookup;
  /** #189 Slice 0c — the lane-aware totality projection (see `TotalityLookup`). */
  lookupTotality(sourceIdentity: string, name: string): TotalityLookup;
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
 * The façade's twin WINNER predicate (`layeredEmit.ts:1148` `isPublicTwin`, `:1172-1182`): a `public-determination`
 * or untagged concept is the public meaning; a `source-impl`/`records-impl` retrieve half is not. Used to build the
 * totality-recursion `byName` map with the SAME prefer-public rule the façade's `sourceConceptByName` uses — a
 * non-public twin must NEVER overwrite a public one, so a bare operand's recursion resolves the same referent the
 * façade would, INDEPENDENT of the lowering's append order (which `layeredEmit.ts:1173-1175` explicitly says is not
 * a contract). Distinct from `isPublicCandidate` (the KEY filter, which also excludes `__interfaceReexport`): the
 * recursion map INCLUDES an impl-only twin under its name so a bare ref to it still resolves.
 */
function isPublicTwin(c: Concept): boolean {
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
  const totality = new Map<string, boolean>(); // #189 Slice 0c — parallel to `hits` (set iff `hits` is set for k)
  const indeterminate = new Set<string>();
  const present = new Set<string>();
  const ambiguous = new Set<string>();
  for (const lib of libraries) {
    // #189 Slice 0c — the same-layer resolver the totality projection runs the shared predicate under: over ALL of
    // this library's lowered concepts (last-wins, mirroring `emitCQL.indexNames` / the façade's `sourceConceptByName`),
    // NOT only public candidates — a public determination's bare-ref alias / composition operand recurses to any
    // same-library concept exactly as at emit time. `uniformResolvers` keeps a QUALIFIED operand terminal-inert, so
    // the projection == the FAÇADE's pre-split `srcEmitsTotalBoolean` computation (`layeredEmit.ts:1249`) for a
    // NON-chained concept and never crosses a library boundary. A foreign boolean comp with its OWN cross-lib operand
    // therefore projects NON-total (Option-(a) conservative-loud: a root referencing it gets a LOUD `operand-not-total`
    // even though the foreign lib really emits it total — never a silent wrong emit; the topological Option-(b)
    // projection that would match emit exactly is deferred, per disc 465 §1).
    const byName = new Map<string, Concept>();
    for (const c of lib.concepts) {
      if (c.name === undefined) continue;
      const existing = byName.get(c.name);
      // Prefer-public winner rule — byte-for-byte the façade's `sourceConceptByName` (`layeredEmit.ts:1176`): a
      // non-public twin never overwrites a public one, so the totality recursion is append-order-INDEPENDENT.
      if (existing !== undefined && isPublicTwin(existing) && !isPublicTwin(c)) continue;
      byName.set(c.name, c);
    }
    const totalityResolvers = uniformResolvers(sameLayerResolver((n) => byName.get(n)));
    // A per-LIBRARY memo (Claude review #4): the resolver pair is fixed and concept names are unique within a
    // library, so a fully-resolved subtree verdict is reused across public concepts (shared alias/composition
    // subtrees are walked once). `visiting` stays fresh per top-level call (the cycle guard for that call tree).
    const libMemo = new Map<string, boolean>();
    for (const c of lib.concepts) {
      if (!isPublicCandidate(c)) continue;
      const k = keyOf(lib.sourceIdentity, c.name);
      if (present.has(k)) {
        ambiguous.add(k);
        continue;
      }
      present.add(k);
      const rt = conceptResultType(c.shape, c.valueTypes, c.conceptType);
      if (rt === undefined) {
        indeterminate.add(k);
        continue;
      }
      hits.set(k, rt);
      // Totality is claimed ONLY for a coherent (ResultType-hit) concept: the "index ≡ emit" guarantee is scoped to
      // validator-clean declarations — an incoherent multi-value-type-including-boolean concept's real emit can emit
      // a total `exists`/`Coalesce` while the shared predicate reports non-total (`totalScalarBoolean.ts` KNOWN
      // residual), so its key stays `indeterminate` and never yields a totality verdict.
      try {
        totality.set(k, emitsTotalScalarBoolean(c, totalityResolvers, new Set(), libMemo));
      } catch {
        // A malformed boolean comp (a criterion operand — validator-rejected, T2) makes the strict collector THROW.
        // Fail CLOSED to `indeterminate` rather than crash `emitCQLImports` for the whole closure (Claude review #3):
        // demote the key (drop the ResultType hit too, so `lookup` + `lookupTotality` agree it has no usable verdict).
        hits.delete(k);
        indeterminate.add(k);
      }
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
    lookupTotality(sourceIdentity, name) {
      const k = keyOf(sourceIdentity, name);
      if (ambiguous.has(k)) return { kind: "ambiguous" };
      const t = totality.get(k); // `false` is a valid verdict → test `!== undefined`, not truthiness
      if (t !== undefined) return { kind: "total", total: t };
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

/**
 * #189 Slice 0c — the `family` half of the `emitsTotalScalarBoolean` `{legacy, family}` resolver pair (per-arm
 * switch, disc 465): the qualified-operand totality policy for the BOOLEAN-COMPOSITION arm ONLY. Bound per referrer
 * (`fromIdentity` fixed). Resolves an operand ref to a `ReferentResolution`:
 *
 *  - **bare ref** → `sameLayer(ref)` (identical to the `legacy` resolver): recurse SAME-LAYER so an intra-layer
 *    boolean-composition chain propagates the family resolver through the recursion (a same-library `Z = (Y and R)`
 *    over a same-library `Y = ("Lib"."X" and Q)` must read Y's REAL family-armed verdict, not the index's
 *    conservative uniform projection of Y).
 *  - **rendered-layer qualifier** (`"<policy>-LocalPrimitives"."X"`, classified via `isRenderedLayerToken`) → a
 *    same-SOURCE cross-LAYER operand: X is in this source's pre-split concepts, so a SAME-SOURCE index lookup
 *    (terminal, on the PUBLIC meaning — `lookupTotality` keys the public candidate, the same concept a cross-layer
 *    ref denotes). Classified POSITIVELY BEFORE the cross-lib resolver, else it scope-misses and is misdiagnosed as
 *    cross-library (the disc-464 trap; plan §4).
 *
 *    ⚠ TWO-SPELLINGS EQUIVALENCE (disc 466 Claude ask-3): this rendered (post-split) path reads the UNIFORM index
 *    projection for X, while the pre-split FAÇADE spelling of the same dependency (a bare ref) recurses with the
 *    family arm. Those agree because a rendered-layer qualifier only ever names a LocalPrimitives / ExternalPrimitives
 *    operand — a `code is` / `coded from` RETRIEVE or a comparator, never a `defined as` boolean composition (a
 *    boolean comp classifies Inferences, so a same-source boolean-comp operand co-resides in the Inferences layer and
 *    stays BARE, taking the recursion branch above). A retrieve/comparator's totality never depends on the family
 *    arm (it has no cross-lib operand of its own), so its uniform projection == its family verdict. The divergent
 *    cell (a cross-LAYER operand whose own totality needs the family arm) is therefore unreachable; were it ever
 *    reachable it would fail LOUD (`operand-not-total`), never emit wrong CQL.
 *  - **genuinely-foreign qualifier** → the cross-library index totality verdict. Scope-first (`local-package-same-
 *    name`); a scope miss with a resolver armed → non-total (loud downstream), never a raw-token hit.
 *
 * Every terminal (non-`total:true`) index arm collapses to `total:false` — the boolean-composition gate then emits
 * the SAME `operand-not-total` it emits for a truth-set operand (the index preserves the distinct cause for
 * diagnostics; `lookupTotality`). This resolver is the `family` arm; the `legacy` arm stays `sameLayerResolver`
 * (qualified → inert), so a bare-ref alias / sem-* composition never gains a cross-library proof (banner I).
 */
/**
 * #189 Slice 0c — the per-source cross-library totality service, threaded through `EmitOptions.crossLibraryTotality`
 * to the boolean-composition consult sites (emit pivot + ledger discharge, and — via `emitPartitioned` — the
 * pre-split Interface façade). `fromIdentity` is THIS source library's stable identity (the referrer of every
 * operand ref emitted from it). `renderedLayerNames` (populated ONLY on the layered lane, per layer emit) is the set
 * of THIS source's synthesized layer library names, used to classify a rendered-layer (same-source cross-LAYER)
 * qualifier as same-source BEFORE the cross-library resolver (else it scope-misses and is misdiagnosed cross-library).
 */
export type CrossLibraryTotality = {
  index: DeclaredResultIndex;
  fromIdentity: string;
  resolveRawLibrary?: ResolveRawLibrary;
  renderedLayerNames?: ReadonlySet<string>;
};

export function makeTotalityFamilyResolver(args: {
  sameLayer: ReferenceResolver;
  index: DeclaredResultIndex;
  fromIdentity: string;
  resolveRawLibrary?: ResolveRawLibrary;
  isRenderedLayerToken?: (libraryName: string) => boolean;
}): ReferenceResolver {
  const { sameLayer, index, fromIdentity, resolveRawLibrary, isRenderedLayerToken } = args;
  const terminal = (t: TotalityLookup): ReferentResolution => ({
    kind: "total",
    total: t.kind === "total" ? t.total : false,
  });
  return (ref) => {
    const lib = getRefLibrary(ref);
    if (lib === null) return sameLayer(ref);
    const name = getRefName(ref);
    if (isRenderedLayerToken?.(lib) === true) return terminal(index.lookupTotality(fromIdentity, name));
    const scoped = resolveRawLibrary?.(fromIdentity, lib);
    if (scoped !== undefined) return terminal(index.lookupTotality(scoped, name));
    if (resolveRawLibrary === undefined) return terminal(index.lookupTotality(lib, name));
    return { kind: "total", total: false };
  };
}
