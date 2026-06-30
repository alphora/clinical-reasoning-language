/**
 * Layered CQL emit — auto-split a single multi-layer CRL library into
 * dependency-ordered layer CQL libraries.
 *
 * SLICE 2 of the CRL CQL emit deliverable. A single CRL `library "X".` whose
 * concepts span more than one layer is emitted as SEPARATE per-layer libraries
 * (`X Concepts`, `X Asserted`, `X Inferred`), each `include`-ing the layer
 * below — reproducing the hand-split structure (cf. the cms22 golden) but from
 * ONE source file.
 *
 * The three layers (slice 2 scope — NO `code is`, NO interface/decision split):
 *   - Concepts : `terminology` statements (valueset/codesystem/code).
 *   - Asserted : concepts whose definition is `coded from` (a retrieve).
 *   - Inferred : concepts whose definition is `defined as` / `definition is`.
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

import type {
  CRL,
  Concept,
  CompositionExpression,
  ConceptDefinition,
  DefinedAsDefinition,
  DefinitionIsDefinition,
  NarrativeClause,
  NarrativeElement,
  ArgValue,
  ReferenceName,
  QualifiedReference,
  Statement,
} from "../ast/types";
import { getRefName, getRefLibrary } from "../ast/types";

import { emitCQLFromAST } from "./emitCQL";
import type { EmitResult, EmitOptions } from "./emitCQL";

/**
 * A partition VALUE — the bucket a statement is assigned to for emit. The FULL
 * partition produces the three canonical layers ("Concepts" / "Asserted" /
 * "Inferred"); a PARTIAL partition (slice 4c) produces other values ("Concepts"
 * / "Root"). The type is therefore a bare `string`: `classifyStatementLayer`
 * (the FULL classifier) still returns one of the three canonical values, but a
 * partition's own `classify` may map those onto a different value set.
 */
export type Layer = string;

/**
 * The three canonical layers the FULL split fans into, in dependency order
 * (low → high). Each layer may only reference layers EARLIER in this list.
 * `classifyStatementLayer` returns one of these (or null); the FULL_PARTITION's
 * `order` is exactly this list.
 */
export const LAYER_ORDER: readonly Layer[] = ["Concepts", "Asserted", "Inferred"] as const;

/**
 * A PARTITION generalizes the hardcoded 3-layer machinery into a pluggable
 * "how do I bucket statements, in what dependency order, under what emitted
 * library names" policy. `emitPartitioned` (the generalized emit loop) consumes
 * a partition; `emitLayered` is now a thin wrapper over `emitPartitioned(...,
 * FULL_PARTITION, ...)` and stays byte-identical.
 *
 *   - `classify(stmt)` → the partition VALUE for a statement, or `null` for an
 *     out-of-scope statement (Decision/Activity/Parameter — same exclusions as
 *     `classifyStatementLayer`). The FULL partition delegates straight to
 *     `classifyStatementLayer`; the PARTIAL partition collapses the three
 *     canonical values onto `"Concepts"` vs `"Root"`.
 *   - `order` — the partition values in dependency order (low → high). Drives
 *     emit ordering and the sibling-include ordering in `collectLayerIncludes`.
 *   - `libraryNameFor(lib, value)` — the emitted CQL library name for a given
 *     partition value of source library `lib`. FULL: `"<lib> <value>"`. PARTIAL:
 *     `"<lib>"` for the Root value (keeps the source name addressable) and
 *     `"<lib> Concepts"` for the Concepts value.
 */
export interface Partition {
  classify: (stmt: Statement) => Layer | null;
  order: readonly Layer[];
  libraryNameFor: (lib: string, value: Layer) => string;
}

/** The canonical 3-way full split (byte-identical to the pre-partition path). */
export const FULL_PARTITION: Partition = {
  classify: classifyStatementLayer,
  order: LAYER_ORDER,
  libraryNameFor: layerLibraryName,
};

/**
 * Slice 4c partial split — for a decision-bearing library with concept-level
 * `code is`. Everything that the FULL classifier calls "Concepts" (the
 * terminology / lowered local-code declarations) goes to the `"Concepts"`
 * sibling; EVERYTHING ELSE (asserted retrieves, inference, the decision/activity
 * statements that disqualify the FULL split) goes to the `"Root"` library, which
 * KEEPS THE SOURCE NAME `<lib>` so PlanDef/ActivityDef `library[]` refs (which
 * slug from the source name) still resolve.
 */
export const PARTIAL_PARTITION: Partition = {
  classify: (stmt) => (classifyStatementLayer(stmt) === "Concepts" ? "Concepts" : "Root"),
  order: ["Concepts", "Root"],
  libraryNameFor: (lib, v) => (v === "Root" ? lib : `${lib} Concepts`),
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
  /** True when EVERY emitted layer succeeded. */
  success: boolean;
  /** One entry per NON-EMPTY layer, in dependency order (Concepts → Inferred). */
  entries: LayeredEmitEntry[];
}

/** Slot-aware name→layer maps. A name may appear in BOTH (cross-kind same-name). */
interface NameLayerMaps {
  concept: Map<string, Layer>;
  terminology: Map<string, Layer>;
}

/**
 * Classify a single library statement into its primary layer, or `null` for
 * statement kinds out of scope for this slice (Decision / Activity / Parameter).
 *
 * Operates on the AST `Statement` shape directly — NOT on provenance nodes.
 * (`provenance/crlConceptLayer.ts` runs on provenance, a different input.)
 */
export function classifyStatementLayer(stmt: Statement): Layer | null {
  if (stmt.type === "Terminology") return "Concepts";
  if (stmt.type === "Concept") {
    // Slice 3 — concept-level `code is`-ONLY concepts are LOWERED upstream
    // (`lowerLocalCodes`, run before classification in both `emitCQLImports`
    // and `emitCQLFromAST`) into a synthetic Terminology + `CodedFromDefinition`
    // with `stmt.code` CLEARED. So by the time classification runs, an in-scope
    // local-coded concept already presents as an ordinary `CodedFromDefinition`
    // (Asserted) and classifies normally — no special case needed here.
    //
    // A concept that STILL carries `stmt.code` at this point is out of scope
    // for the layered split: it is a `code` + `possible representation:` concept
    // (the external-source-representation lane, NOT YET landed) — lowering
    // deliberately leaves those untouched so the split can't drop the
    // representation side. (A MIXED `code` + top-level `definition` concept is a
    // HARD ERROR raised by `lowerLocalCodes`; it never reaches classification.)
    // Returning null keeps the whole library on the unchanged per-CRL path.
    // (The cms22/cms69 corpus has no `code is`, so this changes nothing there.)
    if (stmt.code !== undefined) return null;
    if (stmt.representations && stmt.representations.length > 0) return null;
    // A concept may now be representation/code-only with no top-level
    // `definition` (ADR 0001 `code is`). Such a concept is not classifiable
    // into a slice-2 layer (out of scope, like Decision/Activity) — the
    // `isLayerSplittable` gate then keeps the library on the per-CRL path.
    if (!stmt.definition) return null;
    switch (stmt.definition.type) {
      case "CodedFromDefinition":
        return "Asserted";
      case "DefinedAsDefinition":
      case "DefinitionIsDefinition":
        return "Inferred";
    }
  }
  // Decision / Activity / Parameter: not layer-classified in this slice.
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
    // CRITICAL (slice 4c): classify via the PARTITION, not the bare
    // `classifyStatementLayer`. Under the partial split a concept that the FULL
    // classifier calls "Asserted"/"Inferred" is partition-value "Root"; the maps
    // must hold "Root" so a Root→Root ref compares equal in `requalifyRef` and
    // stays BARE. Using the FULL classifier here would leave "Asserted"/"Inferred"
    // in the maps, mismatch the current partition value "Root", and rewrite the
    // ref to a nonexistent `"<lib> Inferred"."X"` library.
    const layer = partition.classify(stmt);
    if (layer === null) continue;
    if (stmt.type === "Concept" && stmt.name) concept.set(stmt.name, layer);
    else if (stmt.type === "Terminology" && stmt.name) terminology.set(stmt.name, layer);
  }
  return { concept, terminology };
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

/** The qualified library identity for a layer of library `lib`, e.g. `"CMS22 Asserted"`. */
function layerLibraryName(lib: string, layer: Layer): string {
  return `${lib} ${layer}`;
}

/**
 * The generated layer-library names a multi-layer library `lib` (AST `ast`)
 * will emit — one per NON-EMPTY layer, in dependency order. The caller's
 * collision preflight (`imports/emit.ts`) compares these against the full
 * emitted-name set to catch a generated name clashing with a real sibling
 * library (e.g. a multi-layer `library "X"` plus a real `library "X Asserted"`).
 */
export function layerLibraryNamesFor(ast: CRL, lib: string): string[] {
  const present = layersPresent(ast);
  return LAYER_ORDER.filter((l) => present.has(l)).map((l) => layerLibraryName(lib, l));
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
      if (def.body.type === "DefinedAsBareRef") visit(def.body.ref);
      else visitCompositionRefs(def.body.expression, visit);
      return;
    case "DefinitionIsDefinition":
      visitNarrativeRefs(def.body, visit);
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
  partition: Partition,
): ReferenceName {
  const refLib = getRefLibrary(ref);
  // Genuinely-foreign qualifier → leave untouched.
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
    libraryName: partition.libraryNameFor(lib, targetLayer),
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
  partition: Partition,
): CompositionExpression {
  switch (expr.type) {
    case "CompositionRef":
      return { ...expr, ref: requalifyRef(expr.ref, "concept", currentLayer, maps, lib, partition) };
    case "CompositionGroup":
      return {
        ...expr,
        expression: requalifyComposition(expr.expression, currentLayer, maps, lib, partition),
      };
    case "SemNotExpression":
      return {
        ...expr,
        expression: requalifyComposition(expr.expression, currentLayer, maps, lib, partition),
      };
    case "SemAndExpression":
    case "SemOrExpression":
      return {
        ...expr,
        terms: expr.terms.map((t) => requalifyComposition(t, currentLayer, maps, lib, partition)),
      };
  }
}

/** Re-qualify an `ArgValue` (narrative arg-position concept refs). Concept slot. */
function requalifyArgValue(
  arg: ArgValue,
  currentLayer: Layer,
  maps: NameLayerMaps,
  lib: string,
  partition: Partition,
): ArgValue {
  switch (arg.type) {
    case "NConceptRef":
      return { ...arg, value: requalifyRef(arg.value, "concept", currentLayer, maps, lib, partition) };
    case "NDisjunction":
      return {
        ...arg,
        disjuncts: arg.disjuncts.map((d) => requalifyArgValue(d, currentLayer, maps, lib, partition)),
      };
    case "NConjunction":
      return {
        ...arg,
        conjuncts: arg.conjuncts.map((c) => requalifyArgValue(c, currentLayer, maps, lib, partition)),
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
  partition: Partition,
): NarrativeElement {
  switch (el.type) {
    case "NConceptRef":
      return { ...el, value: requalifyRef(el.value, "concept", currentLayer, maps, lib, partition) };
    case "NDisjunction":
      return {
        ...el,
        disjuncts: el.disjuncts.map((d) => requalifyArgValue(d, currentLayer, maps, lib, partition)),
      };
    case "NConjunction":
      return {
        ...el,
        conjuncts: el.conjuncts.map((c) => requalifyArgValue(c, currentLayer, maps, lib, partition)),
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
  partition: Partition,
): NarrativeClause {
  return {
    ...body,
    elements: body.elements.map((el) => requalifyNarrativeElement(el, currentLayer, maps, lib, partition)),
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
  partition: Partition,
): ConceptDefinition {
  switch (def.type) {
    case "CodedFromDefinition":
      return {
        ...def,
        terminologyName: requalifyRef(def.terminologyName, "terminology", currentLayer, maps, lib, partition),
      };
    case "DefinedAsDefinition": {
      const out: DefinedAsDefinition = { ...def };
      if (def.body.type === "DefinedAsBareRef") {
        out.body = {
          ...def.body,
          ref: requalifyRef(def.body.ref, "concept", currentLayer, maps, lib, partition),
        };
      } else {
        out.body = {
          ...def.body,
          expression: requalifyComposition(def.body.expression, currentLayer, maps, lib, partition),
        };
      }
      return out;
    }
    case "DefinitionIsDefinition": {
      const out: DefinitionIsDefinition = {
        ...def,
        body: requalifyNarrative(def.body, currentLayer, maps, lib, partition),
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
  partition: Partition,
): Concept {
  // A concept reaching here was layer-classified, which requires a definition;
  // the guard keeps the now-optional `definition` field type-safe (a
  // representation/code-only concept has none and is never requalified).
  if (!c.definition) return { ...c };
  return { ...c, definition: requalifyDefinition(c.definition, currentLayer, maps, lib, partition) };
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
  lib: string,
  partition: Partition,
): string[] {
  const referenced = new Set<string>();
  visitAllDefinitionRefs(requalifiedStatements, (ref) => {
    const refLib = getRefLibrary(ref);
    if (refLib !== null && refLib !== currentLibraryName) referenced.add(refLib);
  });
  // Dependency-order the sibling partition libraries (partition `order`, low →
  // high); append any genuinely-foreign libraries sorted for stability.
  const siblingOrder = partition.order.map((v) => partition.libraryNameFor(lib, v));
  const siblings = siblingOrder.filter((name) => referenced.has(name));
  const foreign = [...referenced].filter((name) => !siblingOrder.includes(name)).sort();
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
  partition: Partition,
): { synthetic: CRL; requalified: Statement[] } {
  const requalified: Statement[] = [];
  for (const stmt of ast.statements) {
    // Classify via the PARTITION (so a Root bucket sweeps up Concept AND the
    // Decision/Activity/Parameter statements `classifyStatementLayer` calls null).
    if (partition.classify(stmt) !== layer) continue;
    if (stmt.type === "Concept") {
      requalified.push(requalifyConcept(stmt, layer, maps, lib, partition));
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
  return emitPartitioned(ast, lib, FULL_PARTITION, baseOptions);
}

/**
 * The generalized partition-driven emit. `emitLayered` is the thin FULL_PARTITION
 * wrapper (byte-identical output); the slice-4c partial split passes
 * PARTIAL_PARTITION. For each NON-EMPTY partition value (in dependency `order`),
 * build a synthetic per-value CRL AST with cross-value refs requalified, then
 * emit it under `partition.libraryNameFor(lib, value)` with the includes the
 * requalified statements imply.
 */
export function emitPartitioned(
  ast: CRL,
  lib: string,
  partition: Partition,
  baseOptions: Omit<EmitOptions, "libraryName" | "crossLibraryIncludes"> = {},
): LayeredEmitResult {
  const maps = buildNameLayerMaps(ast, partition);
  // The DISTINCT partition values actually present (order-independent; the Set
  // mirrors the old `layersPresent` semantics but through `partition.classify`).
  const present = new Set<Layer>();
  for (const stmt of ast.statements) {
    const v = partition.classify(stmt);
    if (v !== null) present.add(v);
  }
  const entries: LayeredEmitEntry[] = [];
  let success = true;
  for (const value of partition.order) {
    if (!present.has(value)) continue;
    const libraryName = partition.libraryNameFor(lib, value);
    const { synthetic, requalified } = buildLayerAst(ast, value, maps, lib, partition);
    const crossLibraryIncludes = collectLayerIncludes(requalified, libraryName, lib, partition);
    const result = emitCQLFromAST(synthetic, {
      ...baseOptions,
      libraryName,
      crossLibraryIncludes,
    });
    if (!result.success) success = false;
    entries.push({ layer: value, libraryName, crossLibraryIncludes, result });
  }
  return { success, entries };
}
