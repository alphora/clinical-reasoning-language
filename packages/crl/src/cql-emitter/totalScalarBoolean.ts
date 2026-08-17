// #189 Slice C boundary 2, slice 2b.2 — the SHARED "does this concept's emitted Inferred define compute a total
// Scalar boolean?" predicate. ONE structural classifier consulted at every site that decides whether a
// determination re-exports/composes as a bare total boolean vs a truth-set List, so they cannot DRIFT (disc 444,
// both arms — the round's central outcome: my draft used AST-label checks `ReductionDefinition` at three sites,
// which go SILENT on the neighbor forms — comparator alias, chained alias, composition-over-flipped-alias).
//
// It mirrors the PER-ARM discharge gates `emitCQL.emittedDischargeAndType` computes (`emitCQL.ts:1221-1302`), so
// the ledger discharge, the façade mode, and the emit stay lock-step. The gates are NOT uniform — they mirror the
// discharge's own (deliberate, documented) asymmetry (disc 445 code review, both arms):
//   - REDUCTION → `isScalarBoolean` (shape Scalar + a single boolean value type): matches the most-recent
//     discharge gate (`emitCQL.ts:1229`) and the façade's `srcIsScalarBoolean` re-export gate; `exists`/`count`
//     are always boolean-declared so this admits them, and a non-Scalar-boolean reduction has no bare re-export
//     (it is hard-errored at the façade, `layeredEmit.ts:1150`).
//   - boolean COMPARATOR (`definition is` boolean pattern) → `declaredBoolean` (value types INCLUDE boolean):
//     matches the comparator discharge gate `declaredShapeOfConcept === "boolean"` (`emitCQL.ts:1293`) and the
//     emit's own `Coalesce(<cmp>, false)` gate.
//   - LIST pattern (`definition is` list pattern) → `isSingleBooleanValueType` (a single boolean value type, NO
//     shape check): matches the list discharge gate `isBooleanScalarConcept` (`emitCQL.ts:1026-1028, 1300`).
//   - INSTANCE / other pattern → NON-total (presence, nullable — `emitCQL.ts:1300`+; value-vs-presence is 2b.3).
//   - `defined as` bare-ref ALIAS → the alias must ITSELF declare boolean (`declaredBoolean`, charter §3–§4: the
//     concept's declared value type is authoritative and the emitter manufactures nothing — a `Quantity`-declared
//     alias to a boolean reduction must NOT re-export a bare boolean), then RECURSE through the same-layer
//     referent (validator ALLOWS alias chains, `cycleDetector.test.ts:119`, so `A→B→R` resolves), cycle-guarded.
//   - `defined as` COMPOSITION (2b.3b.1) → the boolean-declared parent is total IFF EVERY operand is total
//     (recurse same-layer via the resolver; cross-lib operand → the resolver's terminal index verdict), NOT a
//     blanket form-admission (a composition over a truth-set operand stays NON-total → the pivot keeps it on the
//     truth-set lane, byte-invariant). The pivot (`emitDefinedAs`) gates its boolean-lane emit on this same
//     predicate, so emit / discharge / façade agree by construction.
//   - both-rep RECENCY merge → TOTAL (2b.3b.1: `Coalesce(CFH.recencyAgeSelected(...), false)`); both-rep UNION
//     merge / `defined as exists` (same-layer) / `coded from` → NON-total.
//
// KNOWN residual (pre-existing, out of 2b.2 scope; disc 445): the EMIT's list/comparator gate is
// `declaredShapeOfConcept` (value types INCLUDE boolean), looser than the discharge/predicate's single-value-type
// gate — so an INCOHERENT multi-value-type-including-boolean concept (e.g. `value type is boolean, Quantity`) emits
// a total `exists`/`Coalesce` yet the discharge + this predicate report non-total, and its direct-guard façade
// would `.satisfied()` a Boolean. No corpus instance (goldens byte-invariant); the fix is an emitter hard-error on
// incoherent boolean declarations (a charter cleanup), not the alias flip.
//
// It is a FREE function taking a `resolve` callback because its two callers hold DIFFERENT concept maps in
// DIFFERENT phases: `emitCQL` at emit time (`this.conceptByName`, layer-isolated) and `layeredEmit`
// (`buildInterfaceReexports`) at synthesis time (`sourceConceptByName`, pre-split). Both pass their own resolver.

import { matchNarrative } from "../template-match";
import { PATTERN_RETURN_SHAPE } from "./patternReturnShape";
import type { Concept, ReferenceName, CompositionExpression } from "../ast/types";
import { getRefName, getRefLibrary } from "../ast/types";

// #189 Slice C 2b.3b.0 — the resolve SEAM, generalized from name-based to `ReferenceName`-based so the ONE shared
// predicate is the single totality source at every consult site (pivot / discharge / façade), incl. cross-library
// operands (crl-emit panel R4, disc 450). A BARE ref resolves to the same-layer Concept (recurse the predicate); a
// QUALIFIED (cross-library) ref resolves to a TERMINAL totality verdict — the predicate is layer-isolated and cannot
// see the foreign lowered concept, so the `DeclaredResultIndex` (built by running THIS predicate over each foreign
// library, lane-aware) answers. Because a cross-lib ref is TERMINAL (never recursed into), the predicate's recursion
// never crosses a library boundary, so the `visiting` cycle guard stays name-keyed (names are unique within a layer)
// — Claude R4's `{library,name}` concern applies only to a cross-lib-RECURSIVE predicate, which the terminal-verdict
// design avoids.
export type ReferentResolution =
  | { kind: "concept"; concept: Concept | undefined } // same-layer bare ref → recurse
  | { kind: "total"; total: boolean }; //               cross-library qualified ref → terminal verdict

export type ReferenceResolver = (ref: ReferenceName) => ReferentResolution;

/**
 * The INERT resolver from a same-layer name→Concept map (2b.3b.0): a bare ref resolves to the same-layer concept; a
 * qualified (cross-library) ref resolves to a NON-total terminal verdict — reproducing the pre-flip "a qualified
 * alias is not the same-layer flip" behavior byte-for-byte (`getRefLibrary(ref) !== null → false`). The lane-aware
 * cross-library verdict (via the `DeclaredResultIndex`) is wired at every consult site in 2b.3b.1.
 */
export function sameLayerResolver(byName: (name: string) => Concept | undefined): ReferenceResolver {
  return (ref) =>
    getRefLibrary(ref) === null
      ? { kind: "concept", concept: byName(getRefName(ref)) }
      : { kind: "total", total: false };
}

/** A single boolean value type (matches the discharge's `isBooleanScalarConcept`, `emitCQL.ts:1026`) — NO shape. */
function isSingleBooleanValueType(c: Concept): boolean {
  return (c.valueTypes?.length ?? 0) === 1 && c.valueTypes?.[0] === "boolean";
}

/** A Scalar boolean = declared `shape is Scalar` + a single boolean value type (matches the reduction discharge
 *  gate `emitCQL.ts:1229` and the façade's `srcIsScalarBoolean`). */
function isScalarBoolean(c: Concept): boolean {
  return c.shape === "Scalar" && isSingleBooleanValueType(c);
}

/** Declared-boolean by the emitter's own `declaredShapeOfConcept` rule (`valueTypes.includes("boolean")`) — the
 *  gate a boolean comparator's `Coalesce`-total discharge/emit keys on (`emitCQL.ts:1293`), and the gate an alias
 *  must satisfy on its OWN declaration to re-export a bare boolean (charter §3–§4). */
function declaredBoolean(c: Concept): boolean {
  return c.valueTypes?.includes("boolean") ?? false;
}

/**
 * True iff `concept`'s emitted Inferred define is a TOTAL Scalar boolean (a bare CQL Boolean that is null-safe at
 * its boundary), so it may re-export bare / compose as a boolean rather than lift to a truth-set. A cross-lib /
 * cross-layer referent (except via the resolver's TERMINAL verdict), an instance-pattern, a `code is` retrieve, a
 * both-rep UNION merge, and a `defined as exists` (same-layer) are all NON-total (return false) — the conservative
 * direction (an unrecognized cell stays on the unchanged truth-set path / stays loud, never a fabricated total). A
 * boolean-declared `defined as` COMPOSITION is total IFF every operand is total (2b.3b.1); a both-rep RECENCY merge
 * is total.
 *
 * `memo` is a per-CALL-TREE cache (default fresh), NOT module-global: the callers hold different concept maps in
 * different phases and twin-name ambiguity means the RESOLVER decides which "X", so a cache shared across top-level
 * calls would be unsound. It stores only FULLY-resolved subtree results; a cycle-guarded `false` is never cached (a
 * concept ON a cycle is genuinely non-total, so any result that transitively depended on it is still correct).
 */
export function emitsTotalScalarBoolean(
  concept: Concept | undefined,
  resolve: ReferenceResolver,
  visiting: ReadonlySet<string> = new Set(),
  memo: Map<string, boolean> = new Map(),
): boolean {
  if (concept === undefined || concept.name === undefined) return false;
  const cached = memo.get(concept.name);
  if (cached !== undefined) return cached;
  if (visiting.has(concept.name)) return false; // cycle guard — a self/mutually-referential alias is not total
  const result = computeTotality(concept, concept.name, resolve, visiting, memo);
  memo.set(concept.name, result);
  return result;
}

function computeTotality(
  concept: Concept,
  name: string,
  resolve: ReferenceResolver,
  visiting: ReadonlySet<string>,
  memo: Map<string, boolean>,
): boolean {
  // #189 Slice C 2b.3b.1 — a both-representation twin's totality is KINDED. A `"recency"` merge now emits a
  // TOTAL boolean (`Coalesce(CFH.recencyAgeSelected(...), false)`, `emitCQL.emitRecencyMerge`), so it is total —
  // gated on the twin declaring a SCALAR boolean (`isScalarBoolean`: `shape is Scalar` + a single `boolean` value
  // type), NOT merely `declaredBoolean` (includes-boolean). Cardinality is authoritative (charter §3): a Record /
  // RecordSet twin must publish records, never a manufactured scalar boolean (crl-emit code review 2b.3b.1i, both
  // arms — the recency emit + discharge assert the SAME invariant, so a malformed twin is a loud emit error, not a
  // predicate/emit drift). A `"union"` merge (and any future kind) still emits a truth-set List → NON-total; its
  // record-half flip rides 2b.4/#257. Checked before the definition switch (mirrors `emittedDischargeAndType:1219`).
  if (concept.__bothRepMerge === "recency") return isScalarBoolean(concept);
  if (concept.__bothRepMerge !== undefined) return false;
  const def = concept.definition;
  if (def === undefined) return false;
  switch (def.type) {
    case "ReductionDefinition":
      // A Scalar-boolean reduction (`exists`/`count`/boolean `most recent`) is a total boolean; a non-boolean or
      // non-Scalar reduction has no valid bare boolean re-export (hard-errored at the façade / stays loud).
      return isScalarBoolean(concept);
    case "DefinitionIsDefinition": {
      const call = matchNarrative(def.body);
      if (!call.known) return false; // unmatched narrative → compile-failing sentinel, never total
      const shape = PATTERN_RETURN_SHAPE[call.pattern];
      if (shape === "boolean") return declaredBoolean(concept); // comparator → `Coalesce(<cmp>, false)` total
      if (shape === "list") return isSingleBooleanValueType(concept); // list pattern → `exists <call>` total
      return false; // instance (presence, nullable) / other → NON-total
    }
    case "DefinedAsDefinition": {
      // The alias/composition must ITSELF declare a SCALAR boolean (`isScalarBoolean`: `shape is Scalar` + a single
      // `boolean` value type) — a non-scalar / non-boolean / multi-value-type concept must not re-export or compose
      // a bare scalar boolean regardless of its operands' totality (charter §3 cardinality is authoritative + §4
      // no-magic: the emitter manufactures nothing). Tightened from `declaredBoolean` (includes-boolean) in
      // 2b.3b.1i (crl-emit code review, both arms) so a `shape is Record` + `value type is boolean` alias/composition
      // cannot flip to the boolean lane.
      if (!isScalarBoolean(concept)) return false;
      const body = def.body;
      const nextVisiting = new Set(visiting).add(name);
      if (body.type === "DefinedAsBareRef") {
        // A same-layer BARE alias → recurse the referent (validator ALLOWS alias chains, `A→B→R`); a QUALIFIED
        // (cross-library) alias → the resolver's TERMINAL index verdict (inert `false` under `sameLayerResolver`).
        return refIsTotal(body.ref, resolve, nextVisiting, memo);
      }
      if (body.type === "DefinedAsComposition") {
        // #189 Slice C 2b.3b.1 — a boolean-declared `defined as` COMPOSITION is total IFF EVERY operand is total
        // (recurse same-layer; index verdict cross-lib), NOT a blanket form-admission (disc 449 gpt56#1: a blanket
        // admit marks `example-nested`'s `"A And B"` total while it emits truth-set → mixed RED; the recursion
        // keeps it non-total → all-non-total → byte-invariant). The pivot (`emitDefinedAs`) gates its boolean-lane
        // emit on this same predicate, so emit + discharge + façade agree by construction.
        return compositionAllOperandsTotal(body.expression, resolve, nextVisiting, memo);
      }
      // `defined as exists` in the SAME-LAYER (truth-set/case-feature) lane is non-total. A FOREIGN none/off-lane
      // `defined as exists` emits a total `exists(...)`, but that totality is delivered by the cross-library
      // resolver's lane-aware TERMINAL verdict, never by recursing this same-layer arm.
      return false;
    }
    default:
      return false; // `coded from` retrieve etc. → not a boolean
  }
}

/** A composition/alias operand ref → total? A BARE ref recurses the predicate (same-layer, cycle-guarded via
 *  `visiting`); a QUALIFIED (cross-library) ref returns the resolver's TERMINAL index verdict (never recursed). */
function refIsTotal(
  ref: ReferenceName,
  resolve: ReferenceResolver,
  visiting: ReadonlySet<string>,
  memo: Map<string, boolean>,
): boolean {
  const res = resolve(ref);
  if (res.kind === "total") return res.total;
  return emitsTotalScalarBoolean(res.concept, resolve, visiting, memo);
}

/** Every operand of a boolean `defined as` composition is total — the composition-flip gate (§4.1/§4.2). Walks the
 *  set-op tree (`sem-or`/`sem-and`/`sem-not`/group) to its `CompositionRef` leaves; each leaf is checked via
 *  `refIsTotal`. An empty conjunction cannot occur (the grammar requires ≥2 terms / a ref). */
function compositionAllOperandsTotal(
  expr: CompositionExpression,
  resolve: ReferenceResolver,
  visiting: ReadonlySet<string>,
  memo: Map<string, boolean>,
): boolean {
  switch (expr.type) {
    case "CompositionRef":
      return refIsTotal(expr.ref, resolve, visiting, memo);
    case "CompositionGroup":
    case "SemNotExpression":
      return compositionAllOperandsTotal(expr.expression, resolve, visiting, memo);
    case "SemAndExpression":
    case "SemOrExpression":
      return expr.terms.every((t) => compositionAllOperandsTotal(t, resolve, visiting, memo));
  }
}
