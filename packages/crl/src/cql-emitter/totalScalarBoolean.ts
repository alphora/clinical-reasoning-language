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
import type { Concept, ReferenceName, CompositionExpression, BranchCondition } from "../ast/types";
import { getRefName, getRefLibrary } from "../ast/types";
import { branchConditionConceptRefsStrict } from "../ast/branchCondition";

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

// #189 Slice 0c — the PER-ARM family switch (plan-panel disc 465, both arms — the round's central outcome). The
// qualified-ref totality verdict is decided by the CONSULTING ARM's FAMILY, threaded through the recursion, NOT
// chosen per consult-site (v1's per-site design was rejected as a consumption-context rule violating the charter's
// context-free §3/§4 — it left silent alias→boolean-comp / sem-*→boolean-comp mismatches). ONLY the boolean-
// composition arm's qualified operands consult the `family` resolver (the cross-library `DeclaredResultIndex`
// totality verdict, wired in step 3); EVERY legacy arm — the bare-ref alias and the sem-* composition — keeps the
// `legacy` resolver (inert `total:false` for a qualified ref). Because a concept's verdict is thereby a pure
// function of its OWN definition (which arm each of its refs enters), it is IDENTICAL at pivot / discharge / façade
// (banner A by construction), and any concept whose verdict CHANGES must transitively contain a
// `DefinedAsBooleanComposition` — a family absent from the legacy golden corpus, so a top-level sem-or `Numerator`
// is provably byte-invariant (banner I by containment). When `legacy === family` (the seam-refactor step and every
// same-library consult) the pair is byte-for-byte the pre-0c single-resolver behavior — see `uniformResolvers`.
export type Resolvers = {
  legacy: ReferenceResolver; //  the bare-ref alias arm + the sem-* composition arm (qualified → inert)
  family: ReferenceResolver; // the boolean-composition arm (qualified → cross-lib index totality verdict)
};

/** Both arms share ONE resolver — byte-for-byte the pre-0c single-resolver behavior. Used for the seam-refactor
 *  step (0c introduces the split but wires the real `family` resolver only in step 3) and for every consult over a
 *  purely same-library concept map (no cross-library operand can be proven total, so `legacy` suffices for both). */
export function uniformResolvers(resolve: ReferenceResolver): Resolvers {
  return { legacy: resolve, family: resolve };
}

/**
 * The INERT resolver from a same-layer name→Concept map (2b.3b.0): a bare ref resolves to the same-layer concept; a
 * qualified (cross-library) ref resolves to a NON-total terminal verdict — reproducing the pre-flip "a qualified
 * alias is not the same-layer flip" behavior byte-for-byte (`getRefLibrary(ref) !== null → false`). The lane-aware
 * cross-library verdict (via the `DeclaredResultIndex`) is wired as the `family` resolver at the boolean-composition
 * consult sites in 0c step 3.
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
  resolvers: Resolvers,
  visiting: ReadonlySet<string> = new Set(),
  memo: Map<string, boolean> = new Map(),
): boolean {
  if (concept === undefined || concept.name === undefined) return false;
  const cached = memo.get(concept.name);
  if (cached !== undefined) return cached;
  if (visiting.has(concept.name)) return false; // cycle guard — a self/mutually-referential alias is not total
  const result = computeTotality(concept, concept.name, resolvers, visiting, memo);
  memo.set(concept.name, result);
  return result;
}

function computeTotality(
  concept: Concept,
  name: string,
  resolvers: Resolvers,
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
        // (cross-library) alias → the LEGACY resolver's TERMINAL verdict (inert `false`). An alias is NOT a
        // boolean composition, so it never gains a cross-library totality proof — charter §4 no-magic (0c step 2).
        return refIsTotal(body.ref, "legacy", resolvers, nextVisiting, memo);
      }
      if (body.type === "DefinedAsComposition") {
        // #189 Slice C 2b.3b.1 — a boolean-declared `defined as` COMPOSITION is total IFF EVERY operand is total
        // (recurse same-layer; index verdict cross-lib), NOT a blanket form-admission (disc 449 gpt56#1: a blanket
        // admit marks `example-nested`'s `"A And B"` total while it emits truth-set → mixed RED; the recursion
        // keeps it non-total → all-non-total → byte-invariant). The pivot (`emitDefinedAs`) gates its boolean-lane
        // emit on this same predicate, so emit + discharge + façade agree by construction.
        return compositionAllOperandsTotal(body.expression, resolvers, nextVisiting, memo);
      }
      if (body.type === "DefinedAsBooleanComposition") {
        // #189 Slice 0b — a `defined as` BOOLEAN composition (`("A" and "B")`, the neutral
        // `BranchCondition` family) is a total scalar boolean IFF EVERY operand is a proven-total scalar
        // boolean (plan banner A/D). DELEGATE to the boolean-family walker, which recurses each operand
        // back through THIS shared predicate (`refIsTotal`) under the SAME `visiting` cycle guard and
        // `memo` — so the emit pivot, the discharge gate, and the façade all read ONE verdict and cannot
        // drift (the single-classifier lesson 0a-cql learned; module header). The `isScalarBoolean(concept)`
        // gate at the top of this arm has already required the composition PARENT be a coherent
        // `Scalar<boolean>`. A composition over a truth-set / non-total operand stays NON-total → the pivot
        // keeps it OFF the bare-boolean lane and emits a LOUD error (no fabricated terminal `Coalesce`,
        // charter §4 no-magic). This REPLACES the T1 inert `return false`; `emit/booleanTotality.ts` (the
        // whole-boundary obligation machine) already classified it composite/delegated.
        return branchCompositionAllOperandsTotal(body.expression, resolvers, nextVisiting, memo);
      }
      // #270 — `defined as exists` is a TOTAL scalar boolean (existence is never null; `exists(...)` never
      // returns null), on EVERY lane. Since #270 the case-feature INFERRED lane lowers it to a bare scalar
      // `exists(<X>)` (`emitCQL.emitExistsBridge`), exactly like the off/standard lane and an inferred-lane
      // `definition is exists` reduction (the reduction arm above returns `isScalarBoolean` for the same
      // reason). The `isScalarBoolean(concept)` gate at the top of this arm has already rejected a
      // non-scalar / non-boolean exists concept (the §4 shape-vs-form incoherence — a `shape is RecordSet`
      // + `defined as exists`), so reaching here means a coherent `Scalar<boolean>` existence determination.
      // This is the SINGLE totality verdict every consumer reads — the emit pivot, `refIsTotal` recursion
      // (alias-to-exists, composition-over-exists), the discharge, and the façade — so they cannot drift
      // (module header). A FOREIGN (cross-library) `defined as exists` reached as a BOOLEAN-COMPOSITION operand
      // is delivered by the `family` resolver's `DeclaredResultIndex` totality verdict (0c); every LEGACY arm
      // (bare-ref alias, sem-*) keeps the inert `sameLayerResolver` verdict (`total:false`) for a qualified ref.
      return true;
    }
    default:
      return false; // `coded from` retrieve etc. → not a boolean
  }
}

/** A composition/alias operand ref → total? A BARE ref recurses the predicate (same-layer, cycle-guarded via
 *  `visiting`); a QUALIFIED (cross-library) ref returns the terminal verdict of the CALLING ARM's resolver (never
 *  recursed). `family` selects that resolver: the boolean-composition arm consults the cross-lib index totality
 *  (`"boolean"`), every legacy arm consults the inert `"legacy"` resolver (0c per-arm switch, disc 465). The FULL
 *  `resolvers` pair is threaded into the recursion so a bare-ref referent's OWN arms each re-pick their family —
 *  the switch is per-ARM, not per-call-tree (a boolean comp over a same-lib sem-* comp recurses into the sem-*
 *  arm's LEGACY verdict, dissolving the transitive cross-lib edge to the existing `operand-not-total`). */
function refIsTotal(
  ref: ReferenceName,
  family: "legacy" | "boolean",
  resolvers: Resolvers,
  visiting: ReadonlySet<string>,
  memo: Map<string, boolean>,
): boolean {
  const res = (family === "boolean" ? resolvers.family : resolvers.legacy)(ref);
  if (res.kind === "total") return res.total;
  return emitsTotalScalarBoolean(res.concept, resolvers, visiting, memo);
}

/** #189 Slice 0c — is ONE boolean-composition operand a proven-total scalar boolean, under the SAME family-arm
 *  policy the flip gate uses (qualified → the cross-lib index verdict; bare → same-layer recursion)? Exported so the
 *  emit FAILURE path (`emitBooleanCompositionError`) names the genuinely non-total operand — NOT any qualified ref
 *  (0c makes a qualified operand provable, so the 0b "qualified ⇒ offender" rule mis-blames a proven-total foreign
 *  operand; disc 466 both arms). Fresh `visiting`/`memo`: a single-operand check is its own call tree. */
export function branchCompositionOperandTotal(ref: ReferenceName, resolvers: Resolvers): boolean {
  return refIsTotal(ref, "boolean", resolvers, new Set(), new Map());
}

/** Every operand of a boolean `defined as` composition is total — the composition-flip gate (§4.1/§4.2). Walks the
 *  set-op tree (`sem-or`/`sem-and`/`sem-not`/group) to its `CompositionRef` leaves; each leaf is checked via
 *  `refIsTotal`. An empty conjunction cannot occur (the grammar requires ≥2 terms / a ref). */
function compositionAllOperandsTotal(
  expr: CompositionExpression,
  resolvers: Resolvers,
  visiting: ReadonlySet<string>,
  memo: Map<string, boolean>,
): boolean {
  switch (expr.type) {
    case "CompositionRef":
      // LEGACY arm — a sem-* composition operand never gains a cross-library totality proof (banner I: this is one
      // of the two legacy arms whose qualified verdict stays inert, keeping the golden corpus byte-invariant).
      return refIsTotal(expr.ref, "legacy", resolvers, visiting, memo);
    case "CompositionGroup":
    case "SemNotExpression":
      return compositionAllOperandsTotal(expr.expression, resolvers, visiting, memo);
    case "SemAndExpression":
    case "SemOrExpression":
      return expr.terms.every((t) => compositionAllOperandsTotal(t, resolvers, visiting, memo));
  }
}

/** #189 Slice 0b — every operand of a `defined as` BOOLEAN composition (`("A" and "B")`, the neutral
 *  `BranchCondition` family — NOT the sem-* `CompositionExpression`) is a proven-total scalar boolean: the
 *  boolean-composition flip gate (plan banner A). Collects the concept-ref leaves with the SAME strict
 *  collector the totality CLASSIFIER (`emit/booleanTotality.ts`) uses — `branchConditionConceptRefsStrict`,
 *  which THROWS on an un-expanded `BranchConditionCriterionRef` (a criterion is a decision-guard construct,
 *  never a boolean-composition operand) — then checks each leaf via `refIsTotal`, so a bare-alias / sem-* /
 *  `defined as exists` operand recurses back through the shared `emitsTotalScalarBoolean` under the SAME
 *  `visiting` cycle guard and `memo` (mutual recursion legacy↔family, banner A). */
function branchCompositionAllOperandsTotal(
  expr: BranchCondition,
  resolvers: Resolvers,
  visiting: ReadonlySet<string>,
  memo: Map<string, boolean>,
): boolean {
  const refs = branchConditionConceptRefsStrict(expr, "totalScalarBoolean boolean-composition");
  // FAMILY arm — the ONLY arm 0c changes: a QUALIFIED (cross-library) operand consults the `family` resolver (the
  // `DeclaredResultIndex` lane-aware totality verdict), so a cross-lib boolean composition over a foreign total
  // boolean is provable. A bare operand still recurses same-layer through `emitsTotalScalarBoolean`.
  return refs.every((r) => refIsTotal(r.ref, "boolean", resolvers, visiting, memo));
}
