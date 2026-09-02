/**
 * Layered CQL emit — auto-split a single multi-layer CRL library into
 * dependency-ordered layer CQL libraries.
 *
 * SLICE 2 of the CRL CQL emit deliverable. A single CRL `library "X".` whose
 * concepts span more than one layer is emitted as SEPARATE per-layer libraries
 * (`X Concepts`, `X Asserted`, `X Inferences`), each `include`-ing the layer
 * below — reproducing the hand-split structure (cf. the cms22 golden) but from
 * ONE source file.
 *
 * The three layers (slice 2 scope — NO `code is`, NO interface/decision split):
 *   - Concepts : `terminology` statements (valueset/codesystem/code).
 *   - Asserted : concepts whose definition is `coded from` (a retrieve).
 *   - Inferences : concepts whose definition is `defined as` / `definition is`.
 *
 * Mechanism:
 *   1. Classify each statement → its primary layer; build slot-aware
 *      name→layer maps (separate concept-name and terminology-name maps so a
 *      legal cross-kind same-name — `terminology "X"` + `concept "X"` — does
 *      not collapse).
 *   2. For each non-empty layer L, build a SYNTHETIC CRL AST containing only
 *      L's statements, with every concept/terminology reference whose target's
 *      primary layer differs from L RE-QUALIFIED to `"<Lib> <L_target>"."Name"`.
 *      Self-qualified refs to the ORIGINAL library name are treated as local
 *      and re-qualified the same way; genuinely-foreign qualified refs (to some
 *      OTHER library) are left untouched. This pre-qualification means the
 *      EXISTING crossLibraryOf/include path in emitCQL.ts handles the
 *      cross-layer reference unchanged.
 *   3. Emit L via the existing `emitCQLFromAST` with `libraryName: "<Lib> <L>"`
 *      and `crossLibraryIncludes` derived from the REQUALIFIED synthetic
 *      statements — one source of truth: every qualified-ref library that is
 *      not L itself (sibling lower layers AND genuinely-foreign libraries).
 *
 * GATE (in `imports/emit.ts`): the layered path fires only when the library
 * spans >1 layer AND every statement is layer-classifiable (Concept /
 * Terminology). A library carrying a Decision / Activity / Parameter is OUT OF
 * SCOPE for this slice and stays on the unchanged per-CRL path — silently
 * dropping those statements is not acceptable, so the gate refuses rather than
 * splits. See `isLayerSplittable`.
 *
 * The caller is ALSO responsible for the cross-library-into-split-library
 * guard: if any OTHER library in the emit closure qualified-refs a library
 * that this module splits, the original library name no longer exists and that
 * referrer would dangle. The caller errors loudly (referrer-rewriting is the
 * deferred routing slice). See `librariesReferencedBy`.
 */

import { assumedShapePreMigration } from "../grammar/conceptShapes";
import { buildInlineAnswerSetMap } from "../fhir-emitter/inlineAnswerSet";
import type { InlineAnswerSet } from "../fhir-emitter/inlineAnswerSet";
import { isRecordBooleanGuardSource, resolveRecordBooleanGuardCarrier } from "../emit/recordBooleanGuard";
import type {
  CRL,
  Concept,
  CompositionExpression,
  ConceptDefinition,
  DefinedAsDefinition,
  DefinitionIsDefinition,
  ReductionDefinition,
  NarrativeClause,
  NarrativeElement,
  ArgValue,
  ReferenceName,
  QualifiedReference,
  Statement,
  WhenBlockBody,
  BlockBody,
  BlockMember,
  ActionStatement,
  InterfaceSourceLayer,
  BranchCondition,
} from "../ast/types";
import {
  getRefName,
  getRefLibrary,
  isQualifiedRef,
  normalizeLocalRef,
} from "../ast/types";
import { buildCriterionIndex, guardConceptClosure } from "../ast/criterionIndex";
import { narrativeReferenceRoles, spanKey } from "../template-match/referenceRoles";
import type { RefRole } from "../template-match/referenceRoles";
import { guardDefineNameCollisions, synthesizeGuardCriteria } from "../ast/guardDefines";
import { branchConditionConceptRefsStrict } from "../ast/branchCondition";
import { pascalCaseNameForId } from "../fhir-emitter/slug";

import type { CRLError } from "../types/errors";

import { emitCQLFromAST } from "./emitCQL";
import type { EmitResult, EmitOptions } from "./emitCQL";
import {
  emitsBareReExportableScalarBoolean,
  sameLayerResolver,
  uniformResolvers,
} from "./totalScalarBoolean";
import type { Resolvers } from "./totalScalarBoolean";
import { isPureQuestionConcept } from "../template-match/recencyValueConcept";
import { makeTotalityFamilyResolver } from "../emit/declaredResultIndex";
import type { CrossLibraryTotality } from "../emit/declaredResultIndex";

/**
 * A partition VALUE — the bucket a statement is assigned to for emit. The FULL
 * partition produces the six SOURCE-TYPED layers (R2-mechanism): two concept
 * layers (LocalConcepts / ExternalConcepts), two source layers (LocalPrimitives /
 * ExternalPrimitives), the Inferences layer, and the synthesized Interface layer. The
 * type is a bare `string`: `classifyStatementLayer` (the FULL classifier)
 * returns one of these (or null), but a partition's own `classify` may map them
 * onto a different value set.
 */
export type Layer = string;

/**
 * The SIX source-typed layers the FULL split fans into, in dependency order
 * (low → high). Each layer may only reference layers EARLIER in this list.
 * `classifyStatementLayer` returns one of these (or null); the FULL_PARTITION's
 * `order` is exactly this list.
 *
 * R2-mechanism source-typing — the layer set is split by SOURCE FAMILY:
 *   - `LocalConcepts`  : a SYNTHETIC local terminology (lowered `code is`) — its
 *                        `TerminologySystem.name` is set by `lowerLocalCodes`.
 *   - `ExternalConcepts` : a hand-authored terminology (no synthetic name).
 *   - `LocalPrimitives`    : a concept whose retrieve is the SYNTHETIC local-source
 *                        retrieve (`CodedFromDefinition.retrieveResourceType` set).
 *   - `ExternalPrimitives`   : a hand-authored `coded from` concept (retrieve type unset).
 *   - `Inferences`       : a top-level `defined as` / `definition is` concept.
 *   - `Interface`      : the SYNTHESIZED re-export concepts (decision/action-guard
 *                        surface), pre-qualified to each concept's OWN source layer.
 *
 * CROSS-FAMILY INVARIANT: a `Local*` library never `include`s a `Record*` one
 * (asserted by `collectLayerIncludes`). For the deliverable this can't arise —
 * a lowered concept's `coded from` bare-refs its OWN synthetic local terminology
 * (same family) — but the assertion catches the deferred both-representation
 * case loudly instead of emitting a silent cross-family include.
 */
export const LAYER_ORDER: readonly Layer[] = [
  "LocalConcepts",
  "ExternalConcepts",
  "LocalPrimitives",
  "ExternalPrimitives",
  "Inferences",
  "Interface",
] as const;

/**
 * A PARTITION generalizes the hardcoded layer machinery into a pluggable
 * "how do I bucket statements, in what dependency order, under what emitted
 * library names" policy. `emitPartitioned` (the generalized emit loop) consumes
 * a partition; `emitLayered` is a thin wrapper over `emitPartitioned(...,
 * FULL_PARTITION, ...)`.
 *
 *   - `classify(stmt)` → the partition VALUE for a statement, or `null` for an
 *     out-of-scope statement (Decision/Activity/Parameter — same exclusions as
 *     `classifyStatementLayer`). The FULL partition delegates straight to
 *     `classifyStatementLayer`.
 *   - `order` — the partition values in dependency order (low → high). Drives
 *     emit ordering and the sibling-include ordering in `collectLayerIncludes`.
 *   - `libraryNameFor(policyId, value)` — the emitted CQL library name for a
 *     given partition value. R2-mechanism: the FULL split names libraries
 *     `<policyId>-<PascalLayer>` (e.g. `rx501-145-medical-policy-LocalConcepts`).
 *     The base is the POLICY ID (threaded R1 from package.json `name`), NOT the
 *     source CRL library name — the source name stays the addressable identity
 *     for self-ref detection in `requalifyRef` (`lib`), while emitted names key
 *     off the policy id so they byte-match the FHIR lane's policy-id-based ids.
 */
export interface Partition {
  classify: (stmt: Statement) => Layer | null;
  order: readonly Layer[];
  libraryNameFor: (policyId: string, value: Layer) => string;
}

/** The source-typed FULL split (R2-mechanism). */
export const FULL_PARTITION: Partition = {
  classify: classifyStatementLayer,
  order: LAYER_ORDER,
  libraryNameFor: layerLibraryName,
};

/** Which declaration slot a reference resolves against. */
type RefSlot = "concept" | "terminology";

/**
 * One emitted layer library. `layer` is the layer it represents; `libraryName`
 * is the qualified `"<Lib> <Layer>"` identity; `crossLibraryIncludes` is the
 * set of lower-layer (+ foreign) library names it `include`s (dependency order).
 */
export interface LayeredEmitEntry {
  layer: Layer;
  libraryName: string;
  crossLibraryIncludes: string[];
  result: EmitResult;
}

export interface LayeredEmitResult {
  /** True when EVERY emitted layer succeeded AND no synthesis-level error fired. */
  success: boolean;
  /** One entry per NON-EMPTY layer, in dependency order (Concepts → Inferences). */
  entries: LayeredEmitEntry[];
  /**
   * Synthesis-level errors NOT attached to any single emitted layer entry — e.g.
   * F3's `emit-decision-concept-not-source-typed` (raised while building the
   * Interface re-exports, before any layer emits). When non-empty, `success` is
   * false; the caller surfaces these alongside the per-entry `result.errors`.
   */
  errors?: CRLError[];
}

/** Slot-aware name→layer maps. A name may appear in BOTH (cross-kind same-name). */
interface NameLayerMaps {
  concept: Map<string, Layer>;
  terminology: Map<string, Layer>;
}

/**
 * Classify a single library statement into its SOURCE-TYPED primary layer
 * (R2-mechanism), or `null` for statement kinds out of scope for the split
 * (Decision / Activity / Parameter).
 *
 * This is the SINGLE source of truth for the 6-way split: `layersPresent`,
 * `isLayerSplittable`, and `layerLibraryNamesFor` call it directly (the FULL
 * partition delegates to it), so the layer set shifts with it in one place.
 *
 * DISCRIMINATORS — these REUSE the synthetic-emitter-only signals that
 * `lowerLocalCodes` already sets; there is NO separate `__local` flag (the
 * signals have no hand-authored lookalikes — verified firsthand in
 * `lowerLocalCodes` + the `ast/builder.ts` terminology constructor + the
 * `code-is-decision-vs` hand-authored coded-from fixture):
 *
 *   - `Terminology` whose `TerminologySystem.name` is SET → `LocalConcepts`;
 *     absent → `ExternalConcepts`. `TerminologySystem.name` is set ONLY by
 *     `lowerLocalCodes` (the shared local-domain codesystem decl name); the CRL
 *     builder never sets it (`ast/builder.ts` constructs `TerminologySystem`
 *     with no `name`).
 *   - `Concept` whose `CodedFromDefinition.retrieveResourceType !== undefined`
 *     → `LocalPrimitives`; `=== undefined` → `ExternalPrimitives`. `retrieveResourceType`
 *     is set ONLY by `lowerLocalCodes` (forced `"Observation"`); hand-authored
 *     `coded from` always leaves it undefined — EVEN WHEN `type is Observation`
 *     — so we do NOT key off `conceptType === "Observation"`.
 *   - top-level `defined as` / `definition is` → `Inferences`.
 *   - a SYNTHESIZED Interface re-export (`Concept.__interfaceReexport`) →
 *     `Interface`.
 *
 * CO-INVARIANT (R2): `lowerLocalCodes` sets `TerminologySystem.name` (on the
 * synthetic terminology) AND `retrieveResourceType` (on the synthetic
 * `CodedFromDefinition`) in the SAME loop iteration for one `code is` concept —
 * they CANNOT diverge per-concept. A future edit to lowering MUST keep both or
 * neither: keeping only the terminology name would yield a LocalConcepts code
 * with a ExternalPrimitives retrieve (a cross-family include); keeping only the
 * retrieve type the inverse. This co-invariant is NOT left implicit — the
 * synthesis site in `lowerLocalCodes` (F7) asserts both signals are set together
 * and THROWS if they desync, so a future one-sided edit fails loudly there.
 *
 * Operates on the AST `Statement` shape directly — NOT on provenance nodes.
 * (`provenance/crlConceptLayer.ts` runs on provenance, a different input.)
 */
export function classifyStatementLayer(stmt: Statement): Layer | null {
  if (stmt.type === "Terminology") {
    // A synthetic local-domain codesystem decl name on the system line marks a
    // lowered `code is` terminology (LocalConcepts); a hand-authored terminology
    // has no such name (ExternalConcepts).
    const hasSyntheticDomainName = stmt.body.some(
      (line) => line.type === "TerminologySystem" && line.name !== undefined,
    );
    return hasSyntheticDomainName ? "LocalConcepts" : "ExternalConcepts";
  }
  if (stmt.type === "Concept") {
    // A SYNTHESIZED Interface re-export (decision/action-guard surface) is its
    // own layer. Its body is pre-qualified; classify it before the code/
    // definition checks (it carries a synthetic `defined as` bare-ref).
    if (stmt.__interfaceReexport) return "Interface";
    // Concept-level `code is`-ONLY concepts are LOWERED upstream
    // (`lowerLocalCodes`, run before classification in both `emitCQLImports`
    // and `emitCQLFromAST`) into a synthetic Terminology + `CodedFromDefinition`
    // with `stmt.code` CLEARED. So by classification time an in-scope
    // local-coded concept presents as an ordinary `CodedFromDefinition` whose
    // `retrieveResourceType` is set → LocalPrimitives.
    //
    // A concept that STILL carries `stmt.code` is out of scope (a `code` +
    // `possible representation:` concept — the external-source-representation
    // lane, NOT YET landed; lowering deliberately leaves those untouched so the
    // split can't drop the representation side). A MIXED `code` + top-level
    // `definition` concept is a HARD ERROR in `lowerLocalCodes`; it never reaches
    // classification. Returning null keeps the whole library on the per-CRL path.
    if (stmt.code !== undefined) return null;
    if (stmt.representations && stmt.representations.length > 0) return null;
    // A representation/code-only concept with no top-level `definition` (ADR
    // 0001) is unclassifiable (out of scope, like Decision/Activity) — the
    // `isLayerSplittable` gate then keeps the library on the per-CRL path.
    if (!stmt.definition) return null;
    switch (stmt.definition.type) {
      case "CodedFromDefinition":
        // SOURCE-TYPED: synthetic local-source retrieve (lowered `code is`) vs a
        // hand-authored `coded from` (external record source).
        return stmt.definition.retrieveResourceType !== undefined
          ? "LocalPrimitives"
          : "ExternalPrimitives";
      case "DefinedAsDefinition":
      case "DefinitionIsDefinition":
        return "Inferences";
      case "ReductionDefinition":
        // #189 Slice-C boundary 1 — a reduction over a `shape is RecordSet` operand is a TOTAL
        // determination (`exists`/`Count`/`most recent`), so it classifies INTO the Inferences layer
        // exactly like a `defined as`. Its records operand (the `<X> Records` twin) classifies
        // LocalPrimitives; `requalifyDefinition`'s ReductionDefinition arm requalifies the target ref
        // across that boundary, and `emitConceptBody` renders the qualified operand (resolving its
        // shape via `conceptShapesByName`, since the Inferences layer's own `conceptByName` cannot see
        // the twin). Flipping this null→"Inferences" ALSO opens the `interface` route
        // (`imports/emit.ts` `hasUnclassifiableConcept` narrows), so the façade totality marker
        // (`buildInterfaceReexports`) and the FHIR case-feature gate (`closureOrchestrator`) are now
        // load-bearing, not optional.
        return "Inferences";
    }
  }
  // #236 — a `criterion` is a decision-facing boolean define: co-locate it with the decision's
  // boolean surface (the Interface layer), where it references the concept re-exports + sibling
  // criterion defines BARE. Classifying it also lets a criterion-bearing library split (a criterion
  // no longer forces the per-CRL path). Its referenced concept re-exports are surfaced into Interface
  // by `interfaceSurface` (from the criterion's recursive atom closure).
  if (stmt.type === "Criterion") return "Interface";
  // Decision / Activity / Parameter: not layer-classified.
  return null;
}

/**
 * Build slot-aware name→layer maps for the library. A `coded from` reference
 * resolves against the TERMINOLOGY map; a concept reference (defined-as,
 * composition, narrative) resolves against the CONCEPT map. Keeping them
 * separate means a legal `terminology "X"` + `concept "X"` in one library does
 * NOT collapse into a single ambiguous entry.
 */
function buildNameLayerMaps(ast: CRL, partition: Partition): NameLayerMaps {
  const concept = new Map<string, Layer>();
  const terminology = new Map<string, Layer>();
  for (const stmt of ast.statements) {
    // R2 — EXCLUDE the synthesized Interface re-exports from the name maps. An
    // Interface re-export is a `define "X"` whose body is PRE-QUALIFIED to X's
    // OWN source layer (`<policyId>-LocalPrimitives."X"` etc.), so the re-qualifier
    // is never consulted for it. Registering it would map name "X" to layer
    // "Interface" and SELF-COLLIDE with the source-layer concept "X" it
    // re-exports (the maps key on name), corrupting cross-layer resolution.
    if (stmt.type === "Concept" && stmt.__interfaceReexport) continue;
    // CRITICAL (slice 4c): classify via the PARTITION, not the bare
    // `classifyStatementLayer`. Under a non-FULL partition a concept that the
    // FULL classifier calls "Inferences" may be a different partition value; the
    // maps must hold the PARTITION value so a same-value ref compares equal in
    // `requalifyRef` and stays BARE.
    const layer = partition.classify(stmt);
    if (layer === null) continue;
    if (stmt.type === "Concept" && stmt.name) {
      // BOTH-REPRESENTATION (`code is` + `defined as`): `lowerLocalCodes` splits
      // the concept into a LocalPrimitives retrieve twin + an Inferences fold-in twin,
      // BOTH carrying the same name. The single concept→layer map would otherwise
      // be order-dependent. The PUBLIC meaning of the name is the Inferences
      // determination (its define folds in the LocalPrimitives retrieve), so a ref to
      // the name (an Interface re-export, or a nested `defined as` operand) must
      // resolve to Inferences — make Inferences win deterministically over its twin.
      const prior = concept.get(stmt.name);
      if (prior === "Inferences" && layer !== "Inferences") continue;
      concept.set(stmt.name, layer);
    } else if (stmt.type === "Terminology" && stmt.name) {
      terminology.set(stmt.name, layer);
    }
  }
  return { concept, terminology };
}

/**
 * #189 Slice-C boundary 1 — the pre-split `concept name → declared shape` map
 * (`EmitOptions.conceptShapesByName`). Built from the ast (post-`lowerLocalCodes`,
 * so the records twins are present) BEFORE the per-layer split, so a reduction's
 * cross-layer records operand can be shape-checked by the layer emitter whose own
 * `conceptByName` holds only that layer's statements. Keyed by BARE name (boundary 1
 * single-rep reductions synthesize distinct twin names, e.g. `"X Records"`); a
 * both-representation same-name pair (out of boundary-1 scope) resolves RecordSet-wins
 * so a reduction operand ref to the retrieve twin reads `RecordSet`, never the Inferences
 * fold. Synthetic Interface re-exports are EXCLUDED (mirrors `buildNameLayerMaps`),
 * so a `define "X"` façade never shadows the real "X"'s shape.
 */
export function buildConceptShapeMap(ast: CRL): Map<string, Concept["shape"]> {
  const shapes = new Map<string, Concept["shape"]>();
  for (const stmt of ast.statements) {
    if (stmt.type !== "Concept" || !stmt.name || stmt.__interfaceReexport) continue;
    if (shapes.get(stmt.name) === "RecordSet" && assumedShapePreMigration(stmt.shape) !== "RecordSet") continue;
    shapes.set(stmt.name, assumedShapePreMigration(stmt.shape));
  }
  return shapes;
}

/** The set of DISTINCT layers the library's classifiable statements span. */
export function layersPresent(ast: CRL): Set<Layer> {
  const present = new Set<Layer>();
  for (const stmt of ast.statements) {
    const layer = classifyStatementLayer(stmt);
    if (layer !== null) present.add(layer);
  }
  return present;
}

/**
 * True when the library is eligible for the layered split: it spans MORE THAN
 * ONE layer AND every statement is layer-classifiable (Concept / Terminology).
 *
 * A multi-layer library that ALSO contains a Decision / Activity / Parameter is
 * out of scope for this slice; splitting it would silently drop those
 * statements, so this returns false and the caller keeps the unchanged
 * per-CRL path (which emits all statements as a single library, as today).
 */
export function isLayerSplittable(ast: CRL): boolean {
  let classifiable = 0;
  for (const stmt of ast.statements) {
    if (classifyStatementLayer(stmt) === null) {
      // An unclassifiable statement (Decision/Activity/Parameter) disqualifies
      // the whole library from the layered path for this slice.
      return false;
    }
    classifiable++;
  }
  if (classifiable === 0) return false;
  return layersPresent(ast).size > 1;
}

/**
 * The emitted layered-library identity `S` for a source-typed layer (#186).
 *
 * S is the SINGLE hyphen-free identifier used EVERYWHERE the clinical-reasoning
 * engine correlates the layered library: this is the CQL `library` header, so it
 * cascades (via `requalifyRef` / the emitter's `include` / `cqlQualifiedRef`
 * machinery) to every `include` target and every qualified ref
 * (`S."X".asTruths()` / `S."N"`). The FHIR lane derives the SAME S from
 * `(policyId, layer)` by calling THIS function, so the FHIR `Library` id /
 * url-tail / `name` and every reference-to-a-library byte-match the CQL side.
 *
 * Pre-#186 this returned the hyphenated `<policyId>-<PascalLayer>` (e.g.
 * `example-semand-Interface`), which disagreed with the FHIR lowercase id
 * (`example-semand-interface`) and the FHIR PascalCase `name`
 * (`ExampleSemandInterface`) — three forms cqf's `Library.name` resolution could
 * not reconcile (`Could not load source`). Now it returns the cap-safe PascalCase
 * form `pascalCaseNameForId("<policyId>-<layer>")` (e.g. `ExampleSemandInterface`)
 * — one string, FHIR-`id`- AND FHIR-`name`-valid, hyphen-free.
 */
export function layerLibraryName(policyId: string, layer: Layer): string {
  return pascalCaseNameForId(`${policyId}-${layer}`);
}

/**
 * The generated layer-library names a multi-layer library will emit — one per
 * NON-EMPTY layer, in dependency order — based on the POLICY ID (R2). The
 * caller's collision preflight (`imports/emit.ts`) compares these against the
 * full emitted-name set to catch a generated name clashing with a real sibling
 * library. Interface re-exports are SYNTHESIZED at emit time (not in `ast`), so
 * the caller passes the interface concept names to include the Interface layer.
 */
export function layerLibraryNamesFor(
  ast: CRL,
  policyId: string,
  interfaceConcepts: readonly string[] = [],
): string[] {
  const present = layersPresent(ast);
  if (interfaceConcepts.length > 0) present.add("Interface");
  return LAYER_ORDER.filter((l) => present.has(l)).map((l) => layerLibraryName(policyId, l));
}

/* ───────────────────────── shared ref-walker ─────────────────────────── */
//
// ONE walker over a concept's definition that visits EVERY `ReferenceName`
// position. Both the dangling-ref guard (`librariesReferencedBy`) and the
// per-layer include collector (`collectLayerIncludes`) delegate to this so
// there is a single source of truth for which ref positions exist — they
// cannot drift. `requalifyDefinition` covers the SAME positions as a transform
// (it mirrors this structure rather than reusing it, since it rebuilds nodes).
//
// NOTE: `CodedFromDefinition` carries ONLY `terminologyName` in this AST
// version — there is no `where` clause field (a `CompositionExpression`) to
// recurse. If a `coded from … where` clause is ever added, recurse it here
// (concept slot) and in `requalifyDefinition`.
//
// NOTE: representation terminology refs (`Concept.representations[]`) are NOT
// walked here: fix 2 (`classifyStatementLayer`) rejects any representation-
// bearing concept from the layered path, so such a concept never reaches a
// synthetic layer AST and these refs are unreachable on this path.

/** Visit every `ReferenceName` in a composition expression tree. */
function visitCompositionRefs(
  expr: CompositionExpression,
  visit: (ref: ReferenceName) => void,
): void {
  switch (expr.type) {
    case "CompositionRef":
      visit(expr.ref);
      return;
    case "CompositionGroup":
    case "SemNotExpression":
      visitCompositionRefs(expr.expression, visit);
      return;
    case "SemAndExpression":
    case "SemOrExpression":
      expr.terms.forEach((t) => visitCompositionRefs(t, visit));
      return;
  }
}

/** Visit every `ReferenceName` in a narrative arg-value. */
function visitArgValueRefs(arg: ArgValue, visit: (ref: ReferenceName) => void): void {
  switch (arg.type) {
    case "NConceptRef":
      visit(arg.value);
      return;
    case "NDisjunction":
      arg.disjuncts.forEach((d) => visitArgValueRefs(d, visit));
      return;
    case "NConjunction":
      arg.conjuncts.forEach((c) => visitArgValueRefs(c, visit));
      return;
    case "Quantity":
      return;
  }
}

/** Visit every `ReferenceName` in a `definition is` narrative clause. */
function visitNarrativeRefs(body: NarrativeClause, visit: (ref: ReferenceName) => void): void {
  for (const el of body.elements) {
    if (el.type === "NConceptRef") visit(el.value);
    else if (el.type === "NDisjunction") el.disjuncts.forEach((d) => visitArgValueRefs(d, visit));
    else if (el.type === "NConjunction") el.conjuncts.forEach((c) => visitArgValueRefs(c, visit));
  }
}

/**
 * The shared ref-walker: visit EVERY `ReferenceName` position in a concept's
 * definition. `librariesReferencedBy` and `collectLayerIncludes` both use this.
 */
function visitDefinitionRefs(
  def: ConceptDefinition,
  visit: (ref: ReferenceName) => void,
): void {
  switch (def.type) {
    case "CodedFromDefinition":
      visit(def.terminologyName);
      return;
    case "DefinedAsDefinition":
      // Bare ref and `exists ("X")` both reference one concept — visit it for
      // library-dependency computation. Only a composition carries an expression.
      if (def.body.type === "DefinedAsBareRef" || def.body.type === "DefinedAsExists")
        visit(def.body.ref);
      else if (def.body.type === "DefinedAsBooleanComposition")
        for (const r of branchConditionConceptRefsStrict(def.body.expression, "layeredEmit deps"))
          visit(r.ref);
      else visitCompositionRefs(def.body.expression, visit);
      return;
    case "DefinitionIsDefinition":
      visitNarrativeRefs(def.body, visit);
      return;
    case "ReductionDefinition":
      // #189: a NAMED reduction operand contributes its concept ref for library-dependency
      // computation, like `exists ("X")`; `this` (ThisRecords) contributes none.
      if (def.reduction.target.type === "ReductionConceptRef") visit(def.reduction.target.ref);
      return;
  }
}

/** Visit every definition ref across all concept statements of a CRL AST. */
function visitAllDefinitionRefs(
  statements: Statement[],
  visit: (ref: ReferenceName) => void,
): void {
  for (const stmt of statements) {
    if (stmt.type !== "Concept") continue;
    const def = stmt.definition;
    if (!def) continue; // representation/code-only concept: no refs to walk
    visitDefinitionRefs(def, visit);
  }
}

/**
 * The set of OTHER (foreign) library names a CRL AST qualified-refs — i.e.
 * library qualifiers on its references that are neither bare nor self. Used by
 * the caller to detect a referrer that points INTO a library this module is
 * about to split (the dangling-ref guard).
 */
export function librariesReferencedBy(ast: CRL, selfLib: string): Set<string> {
  const out = new Set<string>();
  visitAllDefinitionRefs(ast.statements, (ref) => {
    const lib = getRefLibrary(ref);
    if (lib !== null && lib !== selfLib) out.add(lib);
  });
  return out;
}

/**
 * Re-qualify a single reference for emission INSIDE layer `currentLayer`.
 *
 * Resolution is SLOT-AWARE: a terminology ref consults the terminology map; a
 * concept ref the concept map.
 *
 *   - BARE ref, or SELF-qualified ref (qualifier === the original library name):
 *     treated as local. Looked up in the slot map; if the target's layer !=
 *     currentLayer it is rewritten to `"<lib> <targetLayer>"."Name"`. Same-layer
 *     targets stay BARE.
 *   - GENUINELY-FOREIGN qualified ref (qualifier is some OTHER library): left
 *     exactly as-is — it targets an external library, not a local layer leaf.
 *   - Unknown local name (not in the slot map): left as-is (e.g. a name this
 *     slice doesn't model; the emitter's own unresolved handling applies).
 *
 * Returns a NEW node when rewriting; otherwise returns the original ref. The
 * source AST is never mutated.
 */
function requalifyRef(
  ref: ReferenceName,
  slot: RefSlot,
  currentLayer: Layer,
  maps: NameLayerMaps,
  lib: string,
  policyId: string,
  partition: Partition,
): ReferenceName {
  const refLib = getRefLibrary(ref);
  // Genuinely-foreign qualifier → leave untouched. (`lib` is the SOURCE library
  // name — the self-ref identity; `policyId` is the emitted-name base.)
  if (refLib !== null && refLib !== lib) return ref;
  const name = getRefName(ref);
  const slotMap = slot === "terminology" ? maps.terminology : maps.concept;
  const targetLayer = slotMap.get(name);
  // KNOWN same-PARTITION-VALUE target → emit bare (drop any self-qualifier).
  // CRITICAL (slice 4c): compare partition VALUES (`targetLayer === currentLayer`),
  // NOT emitted library names. Under the partial split Root maps to `<lib>` and
  // Concepts to `<lib> Concepts`; a Root→Root ref must compare equal on the value
  // `"Root"` and stay bare. Comparing `libraryNameFor(...)` names would be wrong
  // (and pointless) here.
  if (targetLayer === currentLayer) {
    // A self-qualified ref to a SAME-VALUE target must still drop its (now
    // wrong) "<lib>" qualifier — the emitted library is `libraryNameFor(lib,
    // value)`, so a `"<lib>"."Name"` qualifier would dangle (full split) or be
    // redundant (partial Root, where the emitted name IS `<lib>`). Return bare.
    if (refLib === lib) return name;
    return ref;
  }
  // UNKNOWN local target (not in the slot map) → preserve the ORIGINAL ref
  // unchanged. Do NOT strip a self-qualifier to bare here: the original
  // library `lib` no longer exists post-split, so a surviving `"<lib>"."X"`
  // surfaces as the emitter's informative "unknown library <lib>" error
  // rather than a silently-bare unresolved name. (Stripping was the old bug.)
  if (targetLayer === undefined) {
    return ref;
  }
  const qualified: QualifiedReference = {
    type: "QualifiedReference",
    libraryName: partition.libraryNameFor(policyId, targetLayer),
    name,
    // Reuse the original ref's location when available; refs carried as bare
    // strings have no location, so synthesize a zero span. emitCQL never reads
    // a QualifiedReference's location (only getRefName/getRefLibrary), so the
    // exact value is immaterial to the emitted CQL.
    location:
      typeof ref === "string"
        ? { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
        : ref.location,
  };
  return qualified;
}

/**
 * Clone a composition expression, re-qualifying every CompositionRef whose
 * target is in another layer. Structure-preserving deep clone (we never mutate
 * the shared source AST). Composition refs resolve against the CONCEPT slot.
 */
function requalifyComposition(
  expr: CompositionExpression,
  currentLayer: Layer,
  maps: NameLayerMaps,
  lib: string,
  policyId: string,
  partition: Partition,
): CompositionExpression {
  switch (expr.type) {
    case "CompositionRef":
      return { ...expr, ref: requalifyRef(expr.ref, "concept", currentLayer, maps, lib, policyId, partition) };
    case "CompositionGroup":
      return {
        ...expr,
        expression: requalifyComposition(expr.expression, currentLayer, maps, lib, policyId, partition),
      };
    case "SemNotExpression":
      return {
        ...expr,
        expression: requalifyComposition(expr.expression, currentLayer, maps, lib, policyId, partition),
      };
    case "SemAndExpression":
    case "SemOrExpression":
      return {
        ...expr,
        terms: expr.terms.map((t) => requalifyComposition(t, currentLayer, maps, lib, policyId, partition)),
      };
  }
}

// T1: requalify a `defined as` BOOLEAN composition (`("A" and "B")`) across a layer boundary. Mirrors
// `requalifyComposition` but over the reused `BranchCondition` family (decisions are out of scope for
// layering, so this is its only requalification site). Criterion refs are illegal at the `defined as` site
// (never classified there) — a `BranchConditionCriterionRef` here is a hard error.
function requalifyBranchCondition(
  bc: BranchCondition,
  currentLayer: Layer,
  maps: NameLayerMaps,
  lib: string,
  policyId: string,
  partition: Partition,
): BranchCondition {
  switch (bc.type) {
    case "BranchConditionRef":
      return { ...bc, ref: requalifyRef(bc.ref, "concept", currentLayer, maps, lib, policyId, partition) };
    case "BranchConditionNot":
      return bc.operand
        ? { ...bc, operand: requalifyBranchCondition(bc.operand, currentLayer, maps, lib, policyId, partition) }
        : bc;
    case "BranchConditionAnd":
    case "BranchConditionOr":
      return {
        ...bc,
        operands: bc.operands.map((o) =>
          requalifyBranchCondition(o, currentLayer, maps, lib, policyId, partition),
        ),
      };
    case "BranchConditionCriterionRef":
      throw new Error(
        "criterion ref in a `defined as` boolean composition — criterion refs are illegal at the concept " +
          "attachment point (they are never classified there)",
      );
  }
}

/** Re-qualify an `ArgValue` (narrative arg-position concept refs). Concept slot. */
function requalifyArgValue(
  arg: ArgValue,
  currentLayer: Layer,
  maps: NameLayerMaps,
  lib: string,
  policyId: string,
  partition: Partition,
): ArgValue {
  switch (arg.type) {
    case "NConceptRef":
      return { ...arg, value: requalifyRef(arg.value, "concept", currentLayer, maps, lib, policyId, partition) };
    case "NDisjunction":
      return {
        ...arg,
        disjuncts: arg.disjuncts.map((d) => requalifyArgValue(d, currentLayer, maps, lib, policyId, partition)),
      };
    case "NConjunction":
      return {
        ...arg,
        conjuncts: arg.conjuncts.map((c) => requalifyArgValue(c, currentLayer, maps, lib, policyId, partition)),
      };
    case "Quantity":
      return arg;
  }
}

/** Re-qualify a single narrative element (`definition is` body). Concept slot. */
function requalifyNarrativeElement(
  el: NarrativeElement,
  currentLayer: Layer,
  maps: NameLayerMaps,
  lib: string,
  policyId: string,
  partition: Partition,
  roles: ReadonlyMap<string, RefRole>,
): NarrativeElement {
  switch (el.type) {
    case "NConceptRef": {
      // ⭐ The SLOT depends on the pattern this ref lands in — see `terminologyRefSpans`.
      const slot: RefSlot = roles.get(spanKey(el.location)) === "terminology" ? "terminology" : "concept";
      return { ...el, value: requalifyRef(el.value, slot, currentLayer, maps, lib, policyId, partition) };
    }
    case "NDisjunction":
      return {
        ...el,
        disjuncts: el.disjuncts.map((d) => requalifyArgValue(d, currentLayer, maps, lib, policyId, partition)),
      };
    case "NConjunction":
      return {
        ...el,
        conjuncts: el.conjuncts.map((c) => requalifyArgValue(c, currentLayer, maps, lib, policyId, partition)),
      };
    case "NWord":
    case "Quantity":
      return el;
  }
}

function requalifyNarrative(
  body: NarrativeClause,
  currentLayer: Layer,
  maps: NameLayerMaps,
  lib: string,
  policyId: string,
  partition: Partition,
): NarrativeClause {
  // ⚠ ONE authority, shared with the reference resolver, and it RECURSES through folded pipelines.
  const roles = narrativeReferenceRoles(body);
  return {
    ...body,
    elements: body.elements.map((el) =>
      requalifyNarrativeElement(el, currentLayer, maps, lib, policyId, partition, roles),
    ),
  };
}

/**
 * Clone a concept's definition, re-qualifying every cross-layer reference it
 * carries. Covers all three definition kinds:
 *   - CodedFromDefinition  : the `coded from "Valueset"` terminology ref
 *     (TERMINOLOGY slot — Asserted concept → Concepts-layer valueset).
 *   - DefinedAsDefinition  : bare ref OR composition tree (CONCEPT slot).
 *   - DefinitionIsDefinition: narrative concept refs (CONCEPT slot).
 */
function requalifyDefinition(
  def: ConceptDefinition,
  currentLayer: Layer,
  maps: NameLayerMaps,
  lib: string,
  policyId: string,
  partition: Partition,
): ConceptDefinition {
  switch (def.type) {
    case "CodedFromDefinition":
      return {
        ...def,
        terminologyName: requalifyRef(def.terminologyName, "terminology", currentLayer, maps, lib, policyId, partition),
      };
    case "DefinedAsDefinition": {
      const out: DefinedAsDefinition = { ...def };
      // Bare ref and `exists ("X")` both carry a single concept `ref` that must be
      // requalified across layers; only a composition carries an `expression`.
      if (def.body.type === "DefinedAsBareRef" || def.body.type === "DefinedAsExists") {
        out.body = {
          ...def.body,
          ref: requalifyRef(def.body.ref, "concept", currentLayer, maps, lib, policyId, partition),
        };
      } else if (def.body.type === "DefinedAsBooleanComposition") {
        out.body = {
          ...def.body,
          expression: requalifyBranchCondition(
            def.body.expression,
            currentLayer,
            maps,
            lib,
            policyId,
            partition,
          ),
        };
      } else {
        out.body = {
          ...def.body,
          expression: requalifyComposition(def.body.expression, currentLayer, maps, lib, policyId, partition),
        };
      }
      return out;
    }
    case "DefinitionIsDefinition": {
      const out: DefinitionIsDefinition = {
        ...def,
        body: requalifyNarrative(def.body, currentLayer, maps, lib, policyId, partition),
      };
      return out;
    }
    case "ReductionDefinition": {
      // #189 Slice-C boundary 1 — requalify the reduction's operand ref across the layer boundary,
      // exactly like a `defined as` bare ref. A NAMED operand (`ReductionConceptRef`, e.g. the lowered
      // `<X> Records` twin) resolves against the CONCEPT slot → a cross-layer target rewrites to
      // `<policyId>-LocalPrimitives."X Records"`; a same-layer target stays bare.
      const target = def.reduction.target;
      if (target.type === "ThisRecords") {
        // INVARIANT: `lowerLocalCodes` retargets every `this` reduction to a named records twin
        // BEFORE layered emit, so a `ThisRecords` reaching requalification means an un-lowered
        // reduction was routed layered. That is only reachable via the validator-free
        // `emitCQLFromAST` entry with a no-`code is` `exists this` (which lowering leaves untouched) —
        // fail loud naming the invariant rather than silently dropping the operand.
        throw new Error(
          `internal invariant violated: a \`ReductionDefinition\` with a \`this\` (ThisRecords) target ` +
            `reached layered requalification. \`lowerLocalCodes\` must retarget \`this\` to a named ` +
            `records twin before the layered split; a bare \`exists this\` with no \`code is\` (only ` +
            `reachable via the validator-free emitCQLFromAST entry) is not emittable in the layered lane.`,
        );
      }
      const out: ReductionDefinition = {
        ...def,
        reduction: {
          ...def.reduction,
          target: {
            ...target,
            ref: requalifyRef(target.ref, "concept", currentLayer, maps, lib, policyId, partition),
          },
        },
      };
      return out;
    }
  }
}

/** Clone a concept with its definition re-qualified for `currentLayer`. */
function requalifyConcept(
  c: Concept,
  currentLayer: Layer,
  maps: NameLayerMaps,
  lib: string,
  policyId: string,
  partition: Partition,
): Concept {
  // A concept reaching here was layer-classified, which requires a definition;
  // the guard keeps the now-optional `definition` field type-safe (a
  // representation/code-only concept has none and is never requalified).
  // (A synthesized Interface re-export carries a PRE-QUALIFIED `defined as`
  // bare-ref; `requalifyRef` leaves its genuinely-foreign `<policyId>-<layer>`
  // qualifier untouched, so re-qualifying it here is a safe no-op.)
  if (!c.definition) return { ...c };
  return { ...c, definition: requalifyDefinition(c.definition, currentLayer, maps, lib, policyId, partition) };
}

/**
 * Collect the set of OTHER library names the REQUALIFIED statements of a layer
 * reference — the layer's `crossLibraryIncludes`. Single source of truth: this
 * walks the already-requalified synthetic statements and collects every
 * qualified-ref library that is not the current layer's own library. That
 * covers BOTH sibling lower layers (`"<Lib> Concepts"` etc.) AND
 * genuinely-foreign libraries (`"Shared"`). Sibling layers are emitted in
 * dependency order; foreign libraries follow in stable (sorted) order.
 */
function collectLayerIncludes(
  requalifiedStatements: Statement[],
  currentLibraryName: string,
  currentLayer: Layer,
  policyId: string,
  partition: Partition,
): string[] {
  const referenced = new Set<string>();
  visitAllDefinitionRefs(requalifiedStatements, (ref) => {
    const refLib = getRefLibrary(ref);
    if (refLib !== null && refLib !== currentLibraryName) referenced.add(refLib);
  });

  // Both-representation SELF fold-in include. An Inferences twin folds in its OWN
  // LocalPrimitives retrieve (`LocalPrimitives."X"…`) via the `__bothRepFoldInLocalPrimitives`
  // marker — a synthetic emit-string reference, NOT an AST `DefinitionRef`, so the
  // ref-walk above cannot see it. When the twin's inference references OTHER
  // LocalPrimitives operands (the `union` case) the include rides in on those; but a
  // `recency` twin (patient-age) has a narrative body with NO concept operands, so
  // the self fold-in is the ONLY LocalPrimitives reference. Add the LocalPrimitives sibling
  // explicitly whenever a fold-in marker is present in this layer.
  //
  // Guard on `partition.order.includes("LocalPrimitives")`: a custom/partial partition
  // WITHOUT a LocalPrimitives value must not get a bogus `libraryNameFor(...,"LocalPrimitives")`
  // include (the fold-in only arises in a split that HAS a LocalPrimitives layer).
  if (partition.order.includes("LocalPrimitives")) {
    const localSourceLib = partition.libraryNameFor(policyId, "LocalPrimitives");
    if (localSourceLib !== currentLibraryName) {
      for (const stmt of requalifiedStatements) {
        if (stmt.type === "Concept" && stmt.__bothRepFoldInLocalPrimitives !== undefined) {
          referenced.add(localSourceLib);
          break;
        }
      }
    }
  }
  // #189 Piece 1 (disc 506) — the same problem for the EXTERNAL side. A `"recency-value"` merge twin
  // references its ExternalPrimitives `"<X> Source"` retrieve (in BOTH the merge value select AND the
  // member-existence fold) via a synthesized emit-string, NOT an AST `DefinitionRef`, so the ref-walk cannot
  // see it. Whenever a recency-value merge twin is in this layer, the ExternalPrimitives sibling IS referenced
  // (the merge reads it, and any fold over that referent sits in the same layer) — add it explicitly. Inferences
  // is a `neutral` family layer, so the cross-family Local⇎Record assertion below does not fire on this include.
  if (partition.order.includes("ExternalPrimitives")) {
    const externalSourceLib = partition.libraryNameFor(policyId, "ExternalPrimitives");
    if (externalSourceLib !== currentLibraryName) {
      for (const stmt of requalifiedStatements) {
        if (stmt.type === "Concept" && stmt.__bothRepMerge === "recency-value") {
          referenced.add(externalSourceLib);
          break;
        }
      }
    }
  }
  // Dependency-order the sibling partition libraries (partition `order`, low →
  // high); append any genuinely-foreign libraries sorted for stability.
  const siblingOrder = partition.order.map((v) => partition.libraryNameFor(policyId, v));
  const siblings = siblingOrder.filter((name) => referenced.has(name));
  const foreign = [...referenced].filter((name) => !siblingOrder.includes(name)).sort();

  // R2 cross-family include assertion (Claude's catch): a `Local*` library must
  // NEVER `include` a `Record*` library (and vice-versa). The two source families
  // are independent emit closures; a cross-family include would mean a lowered
  // `code is` concept's retrieve pointing at a hand-authored terminology (or the
  // inverse) — the DEFERRED both-representation case. For the deliverable this
  // cannot arise (a lowered concept's `coded from` bare-refs its OWN synthetic
  // local terminology — same family, LocalPrimitives→LocalConcepts), so this guards a
  // future both-representation regression LOUDLY instead of emitting a silent
  // cross-family CQL `include`. Mirrors the `computeSplitPlan` D5 invariant-throw:
  // truly-unreachable on valid deliverable input, so a structured soft-error
  // channel would be the wrong shape.
  const familyOf = (layer: Layer): "local" | "external" | "neutral" =>
    layer.startsWith("Local") ? "local" : layer.startsWith("External") ? "external" : "neutral";
  const currentFamily = familyOf(currentLayer);
  if (currentFamily !== "neutral") {
    // Reverse-map each SIBLING include name back to its partition value to read
    // its family. Only siblings (this source's own layer libraries) can be
    // cross-family-checked; genuinely-foreign libraries are external closures.
    const siblingNameToLayer = new Map<string, Layer>(
      partition.order.map((v) => [partition.libraryNameFor(policyId, v), v]),
    );
    for (const name of siblings) {
      const sibLayer = siblingNameToLayer.get(name);
      if (sibLayer === undefined) continue;
      const sibFamily = familyOf(sibLayer);
      if (sibFamily !== "neutral" && sibFamily !== currentFamily) {
        throw new Error(
          `internal invariant violated: layer library "${currentLibraryName}" ` +
            `(${currentFamily} family) would \`include\` cross-family sibling ` +
            `"${name}" (${sibFamily} family). A Local* library must never include an ` +
            `External* library (or vice-versa) — this signals the deferred ` +
            `both-representation case reached the layered emit path.`,
        );
      }
    }
  }
  return [...siblings, ...foreign];
}

/**
 * Build the synthetic per-layer CRL AST: only this layer's statements, each
 * re-qualified so cross-layer refs become qualified refs the existing emitter
 * resolves via `include`.
 */
function buildLayerAst(
  ast: CRL,
  layer: Layer,
  maps: NameLayerMaps,
  lib: string,
  policyId: string,
  partition: Partition,
): { synthetic: CRL; requalified: Statement[] } {
  const requalified: Statement[] = [];
  for (const stmt of ast.statements) {
    // Classify via the PARTITION (so a Root bucket sweeps up Concept AND the
    // Decision/Activity/Parameter statements `classifyStatementLayer` calls null).
    if (partition.classify(stmt) !== layer) continue;
    if (stmt.type === "Concept") {
      requalified.push(requalifyConcept(stmt, layer, maps, lib, policyId, partition));
    } else {
      // Terminology / Decision / Activity / Parameter — no concept-definition
      // refs the re-qualifier rewrites; carry through as-is. (Decision/Activity
      // refs are handled by the emitter's own cross-library resolution, which
      // sees the Root library still named `<lib>` and resolves bare/self refs.)
      requalified.push(stmt);
    }
  }
  const synthetic: CRL = {
    type: "CRL",
    ...(ast.header ? { header: ast.header } : {}),
    library: ast.library,
    includes: [],
    statements: requalified,
    location: ast.location,
  };
  return { synthetic, requalified };
}

/**
 * R2 Interface synthesis — the decision/action-guard surface re-published as a
 * dedicated `<policyId>-Interface` library.
 *
 * The INTERFACE CONCEPTS are exactly the concepts a decision's branches/actions
 * reference: every operand of `WhenBlock.condition` (via `branchConditionRefs`)
 * + `ActionGuard.conceptName` across every `Decision` in the source. For each
 * (deduped, in stable first-seen order) the
 * synthesis emits ONE re-export `Concept` whose body is a `defined as` bare-ref
 * PRE-QUALIFIED to the concept's OWN source layer:
 *   - `code is` concept  → `<policyId>-LocalPrimitives."X"`
 *   - `coded from`       → `<policyId>-ExternalPrimitives."X"`
 *   - `defined as`       → `<policyId>-Inferences."X"`
 *
 * "Pre-qualified" means the re-qualifier is never consulted for the body: the
 * `<policyId>-<layer>` qualifier is genuinely-foreign vs the SOURCE library name
 * (`lib`), so `requalifyRef` leaves it untouched. The synthetic concepts carry
 * `__interfaceReexport` so `classifyStatementLayer` files them under `Interface`
 * and `buildNameLayerMaps` EXCLUDES them (no self-collision with the source-layer
 * concept of the same name).
 *
 * A WhenBlock/ActionGuard ref to a concept NOT classifiable into a source layer
 * (an unknown name, or one not in {LocalPrimitives, ExternalPrimitives, Inferences}) is a
 * HARD ERROR (F3): it cannot be source-typed, so no re-export is synthesizable.
 * Pre-F3 it was SILENTLY SKIPPED — but if EVERY interface concept is skipped the
 * Interface layer is empty, no `role:"interface"` manifest entry is produced, and
 * the FHIR `decision-root-library-missing` guard silently DEMOTES the whole
 * decision. Surfacing it as a structured `emit-decision-concept-not-source-typed`
 * error makes a missing re-export a clear failure, never a silent decision drop.
 */
export function interfaceConceptNames(ast: CRL): string[] {
  return interfaceSurface(ast).map((e) => e.name);
}

/**
 * One entry of the INTERFACE SURFACE — a decision/action-guard-referenced concept
 * paired with the SOURCE layer it classifies into (LocalPrimitives / ExternalPrimitives /
 * Inferences), or `undefined` when the name does not classify into any source layer
 * (unknown name, or out of the source-layer set). The `sourceLayer` is read from
 * `buildNameLayerMaps(ast, FULL_PARTITION).concept` — the SAME map that drives the
 * Interface re-export synthesis (`buildInterfaceReexports`) — so a downstream
 * consumer (e.g. the FHIR case-feature StructureDefinition emit) can never drift
 * from which concepts the Interface actually re-exports.
 *
 * Names are deduped in stable first-seen order; a QUALIFIED ref (`"OtherLib"."X"`)
 * is SKIPPED (F5 — v0-unsupported cross-library concept ref), matching the
 * re-export synthesis. This is the SINGLE source of truth for "which decision
 * concepts exist, and what source layer each is"; `interfaceConceptNames`
 * delegates to it (names only).
 *
 * NOTE: pass the LOWERED ast (post-`lowerLocalCodes`). A raw `code is` concept
 * still carries `stmt.code`, so `classifyStatementLayer` returns `null` (out of
 * scope) and its `sourceLayer` would be `undefined`; the lowered form presents as
 * a `CodedFromDefinition` → `LocalPrimitives`.
 */
export function interfaceSurface(ast: CRL): { name: string; sourceLayer: Layer | undefined }[] {
  const maps = buildNameLayerMaps(ast, FULL_PARTITION);
  // #236 — a guard atom may reference a `criterion`. The Interface re-export surface must
  // include the concepts a criterion body references (recursively), so the emitted criterion
  // define's bare `"Cov"` leaf resolves to an Interface re-export rather than
  // dangling at `$apply`. Use the criterion INDEX (memoized, LINEAR) — NOT the materializing
  // expansion walk, which would overflow the atom cap on a doubling-DAG criterion and SILENTLY
  // DROP those re-exports (harmless before, but now that the CQL overflow gate is retired the
  // omission would ship). Criteria survive lowering unchanged, so this index (from the lowered
  // `ast`) matches the FHIR lane's.
  const criterionIndex = buildCriterionIndex(ast.statements);
  const out: { name: string; sourceLayer: Layer | undefined }[] = [];
  const seen = new Set<string>();
  const add = (ref: ReferenceName): void => {
    // F5 — NORMALIZE a self-qualified ref (`ThisLib."X"` inside `ThisLib`) to bare `X`
    // FIRST: it IS local and MUST get an Interface re-export, else the emitted decision's
    // `text/cql-identifier` (positive) or negated `text/cql-expression` (`unless`, #224
    // iii.1) condition references a define the Interface never published → dangles at
    // `$apply`. Only a GENUINELY FOREIGN qualified ref (`OtherLib."X"`, still qualified
    // after normalization — cross-library, v0-unsupported) is skipped: stripping it to
    // bare would mis-look-up a same-named LOCAL concept. Parity with the FHIR lane's
    // `normalizeLocalRef` (decision.ts) + `collectCaseFeatures` (closureOrchestrator.ts).
    const normalized = normalizeLocalRef(ref, ast.library.name);
    if (isQualifiedRef(normalized)) return;
    const name = getRefName(normalized);
    if (!seen.has(name)) {
      seen.add(name);
      out.push({ name, sourceLayer: maps.concept.get(name) });
    }
  };
  const walkBlock = (body: WhenBlockBody | BlockBody): void => {
    if (body.type === "BlockBody") {
      for (const member of body.statements) walkMember(member);
    } else {
      walkAction(body);
    }
  };
  const walkMember = (member: BlockMember): void => {
    if (member.type === "WhenBlock") {
      // Direct concept atoms + each guard criterion's recursive atom closure — LINEAR via the
      // index (a doubling-DAG criterion is bounded, never re-walked or atom-capped).
      for (const atom of guardConceptClosure(member.condition, criterionIndex)) add(atom.ref);
      walkBlock(member.body);
    } else if (member.type === "OtherwiseBlock") {
      walkBlock(member.body);
    } else {
      walkAction(member);
    }
  };
  const walkAction = (action: ActionStatement): void => {
    if (action.guard) add(action.guard.conceptName);
  };
  for (const stmt of ast.statements) {
    if (stmt.type !== "Decision") continue;
    for (const branch of stmt.body.statements) walkMember(branch);
  }
  return out;
}

/**
 * The PUBLIC-determination twin of a both-representation same-name pair (§4.7 winner rule): an untagged authored
 * concept or the `public-determination` twin is the public meaning; a `source-impl`/`records-impl` retrieve half is
 * not. Mirrors `declaredResultIndex.ts` `isPublicCandidate` (minus the interface-façade check — the synthetic
 * re-exports are not yet in this AST when `buildInterfaceReexports` runs).
 */
function isPublicTwin(c: Concept): boolean {
  const role = c.__loweringRole;
  return role === undefined || role === "public-determination";
}

/**
 * Synthesize the Interface re-export `Concept`s for the interface concept names.
 * Each is marked `__interfaceReexport` and pre-qualified to its source layer.
 * Names whose source layer is not a re-exportable source layer are skipped.
 */
function buildInterfaceReexports(
  ast: CRL,
  policyId: string,
  maps: NameLayerMaps,
  totalitySvc?: CrossLibraryTotality,
): { reexports: Concept[]; errors: CRLError[] } {
  const reexports: Concept[] = [];
  const errors: CRLError[] = [];
  // #189 Slice C 2b.3b.1 — twin-selection WINNER RULE (§4.7). A both-representation lowering emits TWO same-named
  // twins: a `source-impl`/`records-impl` retrieve half + the `public-determination` twin (e.g. the age RECENCY
  // twin). The façade's totality predicate + re-export mode must key on the PUBLIC determination — the recency twin
  // reads TOTAL, the source-impl half does not — so a non-public twin must never overwrite a public one. Do it
  // deterministically (prefer public) rather than relying on the lowering's append order (the twin happens to be
  // appended last today, but that is not a contract, and the predicate's totality read is now load-bearing).
  const sourceConceptByName = new Map<string, Concept>();
  for (const stmt of ast.statements) {
    if (stmt.type !== "Concept" || !stmt.name) continue;
    const existing = sourceConceptByName.get(stmt.name);
    // A non-public twin never overwrites a public one. Two DISTINCT public candidates for one name (the rule would
    // silently revert to append order) is unreachable today: `lowerLocalCodes` tags exactly one public concept per
    // name (a `source-impl`/`records-impl` half + one `public-determination` twin, or a single untagged authored
    // concept). If a future lowering can emit two public same-name twins, this needs a real tiebreak.
    if (existing !== undefined && isPublicTwin(existing) && !isPublicTwin(stmt)) continue;
    sourceConceptByName.set(stmt.name, stmt);
  }
  // #189 Slice 0c — the `{legacy, family}` totality pair the façade's re-export-mode gate reads. The façade runs
  // PRE-SPLIT, so a bare operand resolves same-layer over the full pre-split source (all layers visible) and there
  // are NO rendered-layer tokens (requalification happens at split) — hence no `isRenderedLayerToken`. A genuinely
  // FOREIGN operand's totality comes from the cross-library index (family arm), so a source concept that is a
  // boolean composition over a foreign total boolean re-exports BARE (`total-boolean`) rather than `.satisfied()`.
  // Absent a service (direct callers) both arms are same-layer → byte-invariant.
  const srcSameLayer = sameLayerResolver((n) => sourceConceptByName.get(n));
  const srcTotalityResolvers: Resolvers =
    totalitySvc === undefined
      ? uniformResolvers(srcSameLayer)
      : {
          legacy: srcSameLayer,
          family: makeTotalityFamilyResolver({
            sameLayer: srcSameLayer,
            index: totalitySvc.index,
            fromIdentity: totalitySvc.fromIdentity,
            ...(totalitySvc.resolveRawLibrary !== undefined
              ? { resolveRawLibrary: totalitySvc.resolveRawLibrary }
              : {}),
          }),
        };
  for (const name of interfaceConceptNames(ast)) {
    const rawSourceLayer = maps.concept.get(name);
    // Only a concept that classified into a re-exportable SOURCE layer can be
    // re-exported (its target library is `<policyId>-<sourceLayer>`). F3 — a
    // decision concept that is NOT source-typed (unknown, or out of {LocalPrimitives,
    // ExternalPrimitives, Inferences}) is a HARD ERROR, not a silent skip: skipping it
    // could empty the Interface and silently demote the decision downstream.
    // Fix 4 — narrow to the closed `InterfaceSourceLayer` union here (the `Layer`
    // alias is bare `string`, so the negative guard below would NOT narrow it);
    // the positive membership test gives the typed `sourceLayer` the assignment
    // to `__interfaceSourceLayer` requires.
    const sourceLayer: InterfaceSourceLayer | undefined =
      rawSourceLayer === "LocalPrimitives" ||
      rawSourceLayer === "ExternalPrimitives" ||
      rawSourceLayer === "Inferences"
        ? rawSourceLayer
        : undefined;
    if (sourceLayer === undefined) {
      const src = sourceConceptByName.get(name);
      errors.push({
        type: "Validation",
        kind: "emit-decision-concept-not-source-typed",
        message:
          `decision references concept "${name}" which is not a source-typed ` +
          `determination (LocalPrimitives/ExternalPrimitives/Inferences) and cannot be ` +
          `re-exported into the Interface layer.`,
        ...(src?.location ? { line: src.location.start.line, column: src.location.start.column } : {}),
      });
      continue;
    }
    const src = sourceConceptByName.get(name);
    // ⭐ #189 null/pause T5 step 2b — REFACTOR:grounded. A `__pureQuestion` source on the LocalPrimitives arm is
    // UNREACHABLE from the compiler (the lowering renames a question's retrieve to `"<X> Records"`, so the bare
    // name only ever resolves to Inferences), but `emitCQLFromAST`/`emitPartitioned` are validator-free public
    // entries a caller can feed a hand-built AST. Left alone that shape emits `.asTruths().satisfied()` — the
    // collapse that denies an unanswered question — while the ledger below enrols it `sanctioned-three-state`.
    // A metadata/text disagreement about the PAUSE is the one thing this slice exists to remove, so refuse it
    // LOUD rather than ship it (charter §0a: legal-but-unbuilt fails loudly; a silent wrong verdict never).
    // ⚠ TWO shapes reach here, and the SECOND is the likelier one. `__pureQuestion` catches a marked concept
    // that somehow kept the LocalPrimitives name; `isPureQuestionConcept` catches an UN-LOWERED question — a raw
    // parse handed straight to the exported `emitLayered`/`emitPartitioned`, which never ran the lowering, so the
    // name still resolves to LocalPrimitives and carries no marker at all. That one is not exotic, and left alone
    // it silently collapses the question under `success: true`.
    if (
      sourceLayer === "LocalPrimitives" &&
      (src?.__pureQuestion === true || (src !== undefined && isPureQuestionConcept(src)))
    ) {
      errors.push({
        type: "Validation",
        kind: "emit-question-facade-not-lowered",
        message:
          `decision references pure-question concept "${name}", whose Interface facade would re-export from ` +
          `LocalPrimitives. A pure question is lowered to a \`"${name} Records"\` retrieve plus a three-state ` +
          `determination \`"${name}"\` in Inferences, so its facade must source from Inferences and re-export ` +
          `BARE. Re-exporting from LocalPrimitives would emit the \`asTruths().satisfied()\` collapse, which ` +
          `folds "no answer record" and "answered false" into one \`false\` and denies where the tree must ` +
          `PAUSE and ask. Emit this policy through \`lowerLocalCodes\` (the normal path) rather than handing ` +
          `\`emitCQLFromAST\` an un-lowered question.`,
        ...(src?.location ? { line: src.location.start.line, column: src.location.start.column } : {}),
      });
      continue;
    }
    // #189 Slice-C boundary 1 — TOTALITY mode for an Inferences re-export. A REDUCTION that publishes a
    // Scalar boolean (`exists`/`Count`/a `Coalesce`-guarded `most recent`) is a TOTAL boolean, so the
    // façade re-exports it BARE (a plain CQL Boolean has no `.satisfied()`); a `defined as` truth-set
    // determination stays `.satisfied()`.
    const srcIsReduction = src?.definition?.type === "ReductionDefinition";
    const srcIsScalarBoolean =
      src !== undefined && assumedShapePreMigration(src.shape) === "Scalar" && src.valueTypes.length === 1 && src.valueTypes[0] === "boolean";
    // HARD ERROR (impl-panel round 1, both arms — critical B): a REDUCTION Inferences source that is NOT a
    // Scalar boolean (a `shape is Record` `most recent this`, or a non-boolean scalar reduction) has NO
    // valid boolean Interface collapse — `.satisfied()` on a record / non-boolean is a category error, and
    // a bare re-export would publish a non-boolean as a decision guard surface. The old else-branch silently
    // marked it `"truth-set"` → the façade emitted `Inferences."X".satisfied()` on a record (ill-typed CQL,
    // shipped under success:true). Reachable validator-clean via the record-shaped-guard cell (still a
    // warning until T7) AND permanently via the validator-free `emitCQLFromAST`/MCP entry. Refuse LOUD here,
    // mirroring the F3 not-source-typed guard above, rather than emit ill-typed CQL. Only a Scalar-boolean
    // reduction re-exports as a total boolean; a non-boolean *Scalar* most-recent is already loud at emit
    // (the B2a value-read guard throws), so this specifically closes the Record / non-boolean-scalar hole.
    // ⭐⭐ #189 — THE RECORD-BOOLEAN GUARD. A `shape is Record` + `value type is boolean` merge publishes ONE
    // RECORD WHOSE VALUE IS A BOOLEAN, so it has a third façade form the rule below never considered: not
    // `.satisfied()` (a category error on a record, correctly refused) and not a bare re-export (which would
    // publish a record as a boolean), but a VALUE READ — three-state `true` / `false` / `null`.
    //
    // ⭐ THE CHARTER RULES IT (§3, "`shape is Record` and `value type is boolean` are NOT in tension"): *"The
    // guard reads the VALUE; the featureExpression targets the RECORD. Same concept."* That is the goal's
    // `Obese`, the canonical question-that-is-also-a-condition, in all three authoring options.
    //
    // ⚠ AND IT RESTORES EMITTER/VALIDATOR COHERENCE, which is independent of the goal. `useSiteTypeValidator`
    // was narrowed on 2026-08-28 to warn only on `RecordSet`, with the reasoning quoted above — so a
    // Record-boolean guard validates CLEAN today while this emitter hard-errors it. The refusal below
    // (2026-08-17) simply predates that ruling.
    //
    // ⚠ THE GATE IS CARRIER-PROVEN, NOT "Record + boolean" — see `isRecordBooleanGuardSource`. A
    // `type is Condition` + boolean Record classifies and lowers, and reading `.value` off it would be the
    // same category error by the carrier axis. The hard error below stays for everything this does not admit.
    const isRecordBooleanGuard = sourceLayer === "Inferences" && srcIsReduction && isRecordBooleanGuardSource(src);
    if (!isRecordBooleanGuard && sourceLayer === "Inferences" && srcIsReduction && !srcIsScalarBoolean) {
      errors.push({
        type: "Validation",
        kind: "emit-reduction-nonboolean-interface",
        message:
          `decision references reduction concept "${name}", which publishes a ${src?.shape ?? "?"} ` +
          `(value type ${src && src.valueTypes.length > 0 ? src.valueTypes.join(", ") : "(none)"}) rather ` +
          `than a boolean this layer can read. A Scalar-boolean reduction re-exports BARE; a ` +
          `\`shape is Record\` + \`value type is boolean\` merge whose resource has a PROVEN boolean carrier ` +
          `re-exports as a VALUE READ (the guard reads the value, the featureExpression targets the record — ` +
          `charter §3). This concept is neither: \`.satisfied()\` on it is a category error and a bare ` +
          `re-export would publish a non-boolean as a decision guard surface. If the shape looks right, the ` +
          `missing piece is the carrier — a resource with no modeled boolean value element (a Condition's ` +
          `truth is EXISTENCE, not a value) cannot be value-read, and an unruled carrier is never guessed.`,
        ...(src?.location ? { line: src.location.start.line, column: src.location.start.column } : {}),
      });
      continue;
    }
    // #189 Slice C 2b.2 — a total-boolean re-export is granted to ANY source whose Inferences define emits a total
    // Scalar boolean (a Scalar-boolean reduction, a boolean comparator, a boolean list-pattern, OR a bare-ref
    // alias transitively resolving to one — `emitsTotalScalarBoolean`), NOT only a direct `ReductionDefinition`
    // (disc 444 #1/#2). Consistent BY CONSTRUCTION with the emit flip + the ledger discharge, which consult the
    // SAME predicate — so the façade cannot `.satisfied()` a bare Boolean (an alias/comparator source) nor
    // bare-re-export a truth-set. The non-boolean-reduction HARD ERROR above still fires for a DIRECT reduction
    // guard; an alias to a non-boolean reduction is caught loud at emit (its referent trips the retained guard).
    // ⭐ #189 O3 — mode selection asks BARE-RE-EXPORTABILITY, not TOTALITY. A three-state recency merge is
    // re-exportable bare (that is what propagates its null) but is NOT total; routing it by totality would
    // send it to the `.asTruths().satisfied()` collapse and re-manufacture the `false` O3 removed.
    const srcEmitsTotalBoolean = emitsBareReExportableScalarBoolean(src, srcTotalityResolvers);
    const targetLib = layerLibraryName(policyId, sourceLayer);
    const qualified: QualifiedReference = {
      type: "QualifiedReference",
      libraryName: targetLib,
      name,
      location: src?.location ?? ast.location,
    };
    const reexport: Concept = {
      type: "Concept",
      name,
      ...(src?.conceptType !== undefined ? { conceptType: src.conceptType } : {}),
      valueTypes: src?.valueTypes ?? [],
      shape: src?.shape ?? "Scalar", // #189: mirror the source concept's declared shape (Scalar default)
      definition: {
        type: "DefinedAsDefinition",
        body: { type: "DefinedAsBareRef", ref: qualified, location: qualified.location },
        location: qualified.location,
      },
      representations: [],
      location: src?.location ?? ast.location,
      __interfaceReexport: true,
      // #189 Slice C 2a — the decision/action-guard façade; the ledger enrollment manufactures a `composite`
      // obligation delegating to the re-exported source define (never inheriting an authored obligation).
      __loweringRole: "interface-facade",
      // The source layer this re-export re-publishes from — read by the
      // case-feature Interface emit to pick the define body (`…satisfied()` /
      // `…asTruths().satisfied()` / legacy plain re-export). See emitCQL.ts.
      __interfaceSourceLayer: sourceLayer,
      // #189 Slice-C boundary 1 — totality mode (Inferences source only): a total-boolean reduction
      // re-exports BARE, a truth-set determination collapses with `.satisfied()`.
      ...(sourceLayer === "Inferences"
        ? {
            // ⭐ #189 — THREE modes now. A RECORD-BOOLEAN guard reads the selected record's value
            // (three-state); a total-boolean reduction re-exports BARE; a truth-set collapses.
            __interfaceReexportMode: (isRecordBooleanGuard
              ? "record-boolean-value"
              : srcEmitsTotalBoolean
                ? "total-boolean"
                : "truth-set") as "total-boolean" | "truth-set" | "record-boolean-value",
            // The PROVEN carrier, resolved at synthesis because the Interface emitter's `conceptByName` is
            // layer-isolated and cannot see the source concept — the same reason the mode is decided here.
            ...(isRecordBooleanGuard
              ? { __recordBooleanCarrier: resolveRecordBooleanGuardCarrier(src) ?? undefined }
              : {}),
          }
        : {}),
      // #189 null/pause — a PURE QUESTION re-exports as the THREE-STATE `answeredValue()` read instead of the
      // `asTruths().satisfied()` collapse, which folds "no answer record" and "answered false" into the same
      // `false` and so denies where the tree must pause and ask. Decided HERE at synthesis because the
      // Interface emitter's `conceptByName` is layer-isolated and cannot see the source concept's definition —
      // the same reason `__interfaceReexportMode` is decided here.
      // ⭐ #189 null/pause — REFACTOR:grounded. A PURE QUESTION's facade must NOT collapse. `asTruths().satisfied()` folds "no
      // answer record" and "answered false" into the same `false`, so an unanswered question is
      // indistinguishable from a "no" and the decision DENIES where it must PAUSE and ask.
      //
      // T5 step 2b moved the READ from here to a first-class Inferences twin (`__pureQuestionRead`), so a
      // question now re-exports from `Inferences` BARE — bare is what propagates the null — rather than
      // applying `.answeredValue()` at the facade. Bare-ness comes from `emitsBareReExportableScalarBoolean`
      // above (which admits the twin); this marker corrects the LEDGER, exactly as `__interfaceThreeStateMerge`
      // does for the merge family, so the facade enrolls `sanctioned-three-state` and not a false `total`.
      //
      // ⚠ There is NO LocalPrimitives arm for a question any more, and there must not be one. `lowerLocalCodes`
      // publishes a question's records under `"<X> Records"` and its determination under `"<X>"`, so the NAME
      // `"<X>"` resolves to Inferences unconditionally — LocalPrimitives holds no concept by that name at all.
      // A `__pureQuestion` concept arriving here on the LocalPrimitives arm therefore did NOT come from the
      // lowering, and its facade would emit the `.asTruths().satisfied()` collapse while this marker enrolled it
      // as `sanctioned-three-state` — metadata claiming a pause over text that denies. The
      // `emit-question-facade-not-lowered` guard above refuses that outright rather than shipping it.
      ...(sourceLayer === "Inferences" && src?.__pureQuestionRead === true
        ? { __pureQuestion: true as const }
        : {}),
      // ⭐ #189 O3 — an Inferences source that is a both-rep RECENCY MERGE is deliberately THREE-STATE (no
      // outer `Coalesce`), because a determination NO arm establishes is UNKNOWN. The re-export TEXT is
      // unchanged — bare `Inferences."X"` is exactly what propagates the null — so this marker corrects the
      // LEDGER only: without it the façade enrolls `total("facade-delegated")` over a three-state operand and
      // the whole-boundary proof fails ("composite is not provably total"). MEASURED on dme101-030 before it
      // was added. Decided HERE for the same reason `__pureQuestion` is: the Interface emitter is
      // layer-isolated and cannot see the source concept's markers.
      ...(sourceLayer === "Inferences" && src?.__bothRepMerge === "recency"
        ? { __interfaceThreeStateMerge: true as const }
        : {}),
    };
    reexports.push(reexport);
  }
  return { reexports, errors };
}

/**
 * Emit a multi-layer CRL library as separate dependency-ordered layer CQL
 * libraries. The CALLER (imports/emit.ts) has already determined the library
 * is layer-splittable (via `isLayerSplittable`); this function does the split
 * + per-layer emit.
 *
 * @param ast            the single source library AST (multi-layer, all
 *                       statements Concept/Terminology).
 * @param lib            the library's base name (the qualifier prefix).
 * @param baseOptions    emit options shared by every layer. `libraryName` and
 *                       `crossLibraryIncludes` are set PER LAYER and override
 *                       any value here.
 */
export function emitLayered(
  ast: CRL,
  lib: string,
  baseOptions: Omit<EmitOptions, "libraryName" | "crossLibraryIncludes"> = {},
): LayeredEmitResult {
  // Direct callers (CLI/tests without a policy id) emit under the SOURCE name.
  return emitPartitioned(ast, lib, lib, FULL_PARTITION, baseOptions);
}

/**
 * The generalized partition-driven emit. `emitLayered` is the thin FULL_PARTITION
 * wrapper. For each NON-EMPTY partition value (in dependency `order`), build a
 * synthetic per-value CRL AST with cross-value refs requalified, then emit it
 * under `partition.libraryNameFor(policyId, value)` with the includes the
 * requalified statements imply.
 *
 * R2: `lib` is the SOURCE library name (the self-ref identity used to detect
 * local vs genuinely-foreign refs); `policyId` is the EMITTED-name base (the
 * policy id threaded from package.json `name`). For the FULL partition the
 * Interface re-exports are synthesized here and injected into the working AST so
 * the `Interface` layer materializes them; the source AST is never mutated.
 */
export function emitPartitioned(
  ast: CRL,
  lib: string,
  policyId: string,
  partition: Partition,
  baseOptions: Omit<EmitOptions, "libraryName" | "crossLibraryIncludes"> = {},
): LayeredEmitResult {
  const maps = buildNameLayerMaps(ast, partition);
  // #189 Slice-C boundary 1 — the cross-layer reduction-operand shape map, computed
  // ONCE from the pre-split ast (all concepts + records twins visible) and threaded
  // to every layer emitter below. INERT until the layered reduction emit consumes it
  // (build steps 2–4); today no layer routes a reduction, so it changes no output.
  const conceptShapesByName = buildConceptShapeMap(ast);
  // ⭐ #189 — same construction, same reason: the predicate's layer cannot see the subject's declaration.
  // ⚠ PREFER WHAT THE CALLER THREADED. `lowerLocalCodes` CLEARS `Concept.code`, and these ids key on it,
  // so rebuilding here — from an ast that is already lowered on the orchestrated path — yields an EMPTY map
  // and every `in qualifying` fails to resolve. The orchestrator builds it from the RAW entry ast
  // (`imports/emit.ts`), exactly as it does the authored totality obligations, and for the same reason.
  // The local build is the fallback for a direct caller whose ast is still authored.
  const inlineAnswerSetsByName =
    baseOptions.inlineAnswerSetsByName ??
    buildInlineAnswerSetMap(ast, baseOptions.localDomainId ?? policyId, baseOptions.canonicalBase ?? "");
  // R2 — synthesize the Interface re-exports (FULL split only). They are appended
  // to a WORKING AST so the existing classify/sweep/emit loop materializes the
  // `Interface` layer with no special casing. `buildNameLayerMaps` already
  // EXCLUDES `__interfaceReexport` concepts, and it was computed from the ORIGINAL
  // `ast` above, so the synthetics never pollute the name maps.
  const reexportResult =
    partition === FULL_PARTITION
      ? buildInterfaceReexports(ast, policyId, maps, baseOptions.crossLibraryTotality)
      : { reexports: [] as Concept[], errors: [] as CRLError[] };
  // F3 — a non-source-typed decision concept is a hard error; abort BEFORE
  // emitting any layer (a partial emit with a silently-empty Interface is exactly
  // what this guards). Surface via the result-level `errors`.
  if (reexportResult.errors.length > 0) {
    return { success: false, entries: [], errors: reexportResult.errors };
  }
  const reexports = reexportResult.reexports;
  // ⭐ #189 — the SYNTHETIC GUARD CRITERIA join the re-exports on the working AST. A `Decision` classifies to
  // NO layer (deliberately — the Interface layer re-exports its surface instead), so a guard define emitted
  // from the decision statement would reach no library at all while the FHIR lane still wrote its `not
  // <define>` reference: a DANGLING condition, which `$apply` treats as not-applicable and which reproduces
  // the exact pause-killer the named-define form removes. Modelled as `Criterion`, they route to `Interface`
  // through the existing `classifyStatementLayer` — the same library the FHIR lane qualifies against.
  const guardCollisions = guardDefineNameCollisions(ast);
  if (guardCollisions.length > 0) {
    return { success: false, entries: [], errors: guardCollisions };
  }
  const guardCriteria = synthesizeGuardCriteria(ast);
  const appended: Statement[] = [...reexports, ...guardCriteria];
  const workingAst: CRL =
    appended.length > 0 ? { ...ast, statements: [...ast.statements, ...appended] } : ast;

  // The DISTINCT partition values actually present (order-independent).
  const present = new Set<Layer>();
  for (const stmt of workingAst.statements) {
    const v = partition.classify(stmt);
    if (v !== null) present.add(v);
  }
  // Case-feature truth-set gate (the LOCKED case-feature model). The truth-set
  // shape (`.asTruths()`/`.satisfied()`/CFH) is the LocalPrimitives/`code is` family's
  // CQL realization; a measure split (`coded from`/ExternalPrimitives, NO LocalPrimitives
  // layer — e.g. cms22/cms69) keeps its LEGACY CQL byte-for-byte. So enable
  // truth-set mode for the Inferences/Interface layers ONLY when a LocalPrimitives layer
  // is present in this split. The sibling layer library names are passed so the
  // Inferences/Interface Emitter classifies a requalified composition ref's target
  // layer exactly (LocalPrimitives leaf → `.asTruths()`; Inferences operand → bare).
  const isCaseFeatureSplit = present.has("LocalPrimitives");
  const localSourceLibrary = partition.libraryNameFor(policyId, "LocalPrimitives");
  const inferredLibrary = partition.libraryNameFor(policyId, "Inferences");
  // Fix 2 — the ExternalPrimitives sibling library name, threaded ONLY when a
  // ExternalPrimitives layer is actually present, so the Inferences/Interface emit can
  // detect a ExternalPrimitives operand woven into a truth-set composition (the future
  // `code is` + `coded from` weave) and hard-error. Undefined for the deliverable
  // (`code is` only → no ExternalPrimitives layer).
  const recordSourceLibrary = present.has("ExternalPrimitives")
    ? partition.libraryNameFor(policyId, "ExternalPrimitives")
    : undefined;

  // #189 Slice 0c — the set of THIS source's synthesized layer library names, so a per-layer boolean-composition
  // consult can classify a rendered-layer (same-source cross-LAYER) qualifier as same-source BEFORE the cross-lib
  // totality resolver (else it scope-misses and is misdiagnosed cross-library; disc 464 / plan §4). Augmented onto
  // the per-layer `crossLibraryTotality` below.
  const renderedLayerNames = new Set<string>();
  for (const value of partition.order) {
    if (present.has(value)) renderedLayerNames.add(partition.libraryNameFor(policyId, value));
  }

  const entries: LayeredEmitEntry[] = [];
  let success = true;
  for (const value of partition.order) {
    if (!present.has(value)) continue;
    const libraryName = partition.libraryNameFor(policyId, value);
    const { synthetic, requalified } = buildLayerAst(workingAst, value, maps, lib, policyId, partition);
    const crossLibraryIncludes = collectLayerIncludes(requalified, libraryName, value, policyId, partition);
    // Per-layer case-feature mode: ONLY the Inferences + Interface layers emit the
    // truth-set shape (NOT LocalConcepts/LocalPrimitives). `kind` keys the emit:
    // `"inferred"` (set-op truth-sets) vs `"interface"` (`…satisfied()`).
    const caseFeature =
      isCaseFeatureSplit && (value === "Inferences" || value === "Interface")
        ? {
            kind: (value === "Inferences" ? "inferred" : "interface") as "inferred" | "interface",
            localSourceLibrary,
            inferredLibrary,
            ...(recordSourceLibrary !== undefined ? { recordSourceLibrary } : {}),
          }
        : undefined;
    const result = emitCQLFromAST(synthetic, {
      ...baseOptions,
      libraryName,
      crossLibraryIncludes,
      conceptShapesByName,
      inlineAnswerSetsByName,
      // #189 Slice 0c — augment the source-bound totality service with THIS source's rendered-layer names, so the
      // per-layer pivot/discharge classify a cross-layer operand as same-source (not misread as cross-library).
      ...(baseOptions.crossLibraryTotality !== undefined
        ? { crossLibraryTotality: { ...baseOptions.crossLibraryTotality, renderedLayerNames } }
        : {}),
      ...(caseFeature ? { caseFeature } : {}),
    });
    if (!result.success) success = false;
    entries.push({ layer: value, libraryName, crossLibraryIncludes, result });
  }
  return { success, entries };
}
