/**
 * Per-concept `defined as` OPERATOR tree (Option-3 questionnaire render). Where `ConceptShapeNode`
 * (`conceptShape.ts`) is the FLAT, operator-free projection the emitter's `$apply action.input` mirrors,
 * this is the OPERATOR-PRESERVING projection: it keeps the `sem-or` / `sem-and` / `sem-not` structure the
 * MV Questionnaire renders as `ANY OF` / `ALL OF` boxes with `or` / `and` connectives.
 *
 * Design authority: `.vibe-tools/discussions/199-…-optree-model-plan.md` (converged, 1 round). Key decisions:
 *   - Model per-concept LOCAL structure only — a `ref` is an EDGE (name/lib + static flags), NOT an inlined
 *     subtree. Cycle-break + diamond-dedup happen at TRAVERSAL time (`collectDefExprLeafKeys`), exactly like
 *     the shared `walkInferenceOrder`. Baking a path-dependent expansion into the model would corrupt a
 *     shared concept reused from a different path (gpt55 impl review, disc 199 [critical] 3).
 *   - `CompositionGroup` is UNWRAPPED (precedence only; the box comes from the sem-node inside).
 *   - DRIFT GUARD: the traversal's pre-order `leafEligible` keys MUST equal `codeIsLeavesPreorder` of the
 *     concept's `ConceptShapeNode` (own-first, operands left-to-right, cycle/diamond collapsed) — the
 *     load-bearing invariant that keeps the two projections of the same `defined as` in lockstep.
 *   - Cross-library + location-less operands mirror `conceptShape`: cross-lib is a retained STUB (not recursed,
 *     `leafEligible:false`); a leaf-eligible-but-unaddressable concept FAILS LOUD (never a stub); a NON-eligible
 *     location-less INTERMEDIATE is FLATTENED THROUGH (its `defined as` body inlined, cycle-guarded) so its
 *     eligible descendants survive — exactly like `conceptShape`'s attach-to-nearest-real-ancestor.
 *   - The fail-loud is REFERENCE-triggered (fires when an eligible-absent concept is an operand of some `defined
 *     as`), matching `conceptShape`'s onEnter guard — NOT a completeness check over `leafEligibleByLib`. An
 *     eligible concept absent from the layer AND never referenced is silently absent from both indexes (a
 *     synthetic-only case; the parser always assigns locations, so every real concept is in the layer).
 *   - Todo 3 (render) traverses `DefExpr` DIRECTLY (the index + entries are public) — no `walkDefExpr` helper is
 *     built here; only the leaf collector (`collectDefExprLeafKeys`, the drift guard) is needed at the model layer.
 */
import {
  type CompositionExpression,
  type Concept,
  type DefinedAsBareRef,
  type DefinedAsComposition,
  getRefLibrary,
  getRefName,
  isQualifiedRef,
  normalizeLocalRef,
  type ReferenceName,
} from "../ast/types";

import { classifyConcept, type CrlConceptNode } from "./crlConceptLayer";
import type { LibInfo } from "./indexer";

/** A `defined as` operand reference — an EDGE to another concept, resolved to its static properties. Path-
 *  dependent facts (cycle vs expanded) are NOT here; they are determined at traversal time. NOTE for consumers:
 *  a STUB ref (cross-lib, or a location-less non-eligible with no body) populates ONLY `name`/`lib`/`crossLib` +
 *  `leafEligible:false`; `nodeKey`/`hasCodeIs`/`isInferred`/`hasDefinedAs` are `undefined` — treat as UNKNOWN, not `false`. */
export interface DefRef {
  name: string;
  /** The operand's library (the current library for a bare ref; the qualifier for a cross-lib ref). */
  lib: string;
  /** Still library-qualified after same-library normalization → unsupported cross-library operand (v0). */
  crossLib: boolean;
  /** The concept-declaration nodeKey (the index + cross-pane join key). ABSENT for a cross-library ref and
   *  for a location-less (non-eligible) concept — never synthesized (mirrors `conceptShape`). */
  nodeKey?: string;
  hasCodeIs?: boolean;
  /** Lowers into the emitter's `localCodes` → an `action.input` leaf. `false` for a cross-lib stub. */
  leafEligible?: boolean;
  isInferred?: boolean;
  /** `definitionKind === "defined-as"` → the target has its own operand structure (follow the edge to expand). */
  hasDefinedAs?: boolean;
}

/** The LOCAL operator structure of ONE concept's `defined as` body. A `ref` leaf is an edge (see `DefRef`). */
export type DefExpr =
  | { kind: "or" | "and"; operands: DefExpr[] } // n-ary sem-or / sem-and (CompositionGroup unwrapped)
  | { kind: "not"; operand: DefExpr } // sem-not (unary)
  | { kind: "ref"; ref: DefRef };

/** Render caps for the operator-tree expansion — SHARED by both projections (the MV Questionnaire's `buildQExpr` and
 *  the MV Tree's outline) so they stay in lockstep. The DAG-blowup vector is NAMED-COMPOSITE HOPS (a shared/cyclic
 *  composite re-expanded positionally at each reference), so `DEF_MAX_EXPR_DEPTH` counts those hops — NOT inline
 *  `or`/`and`/`not` nesting (a finite authoring-scale tree; deep inline degrades to a wide scrolling chart, never a
 *  clip, because the Tree computes width from actual node extents). */
export const DEF_EXPR_CAP = 10; // operands per box/level before a `+N more` stub
export const DEF_MAX_EXPR_DEPTH = 4; // named-composite expansion HOPS before a `…` stub

/** The POSITIONAL render structure of a `defined as` body — the shared, ANSWER-FREE projection both MV panes build on
 *  (the Questionnaire enriches leaves with a case answer + value-type; the Tree lays them out as an outline). Positional
 *  (a shared concept appears at each written position — only a `visiting` cycle-guard, NOT the leaf collector's
 *  `visited` diamond dedup) is the WHOLE POINT: it preserves the authored boolean structure. */
export type DefStructExpr =
  | { kind: "or" | "and"; operands: DefStructExpr[] }
  | { kind: "not"; operand: DefStructExpr } // operand ALWAYS present — dropping it would vanish a `$apply`-asked criterion
  | {
      kind: "leaf";
      name: string;
      lib: string;
      /** The concept-declaration nodeKey (peek + cross-pane join; always present — a location-less ref is `external`). */
      nodeKey: string;
      isSource: boolean; // has a local `code is`. Stub `hasCodeIs === undefined` ⇒ default true (don't spuriously grey).
      isInferred: boolean;
      /** A named-composite / both-rep operand's OWN `defined as` body, nested (the operand is a leaf AND expandable). */
      composite?: DefStructExpr;
    }
  // #233: a first-class CRITERION BOUNDARY node — a named collapsible box at EVERY criterion reference (sole,
  // compound conjunct, or nested inside another criterion's body), mirroring the questionnaire's `QExpr.criterion`.
  // INVARIANT: `buildDefStruct` NEVER emits this kind (a `defined as` body has no criteria); ONLY the guard producer
  // (`branchConditionToDefStruct`, guardOutline.ts) does. So every `buildDefStruct`-fed consumer's `criterion` arm is
  // UNREACHABLE (e.g. the Questionnaire's `enrich` throws in its arm; only the Flow guard-outline path renders it).
  | {
      kind: "criterion";
      name: string;
      lib: string;
      /** CANONICAL body fingerprint — the criterion's body expanded ONCE from hop 0, occurrence-INDEPENDENT.
       *  The verdict-staleness identity key (same for every occurrence of one (lib,name)). NOT the in-situ body hash. */
      bodyHash: string;
      /** IN-SITU render fact: THIS occurrence's rendered operand dropped content to a `…` stub (position-dependent —
       *  a deep occurrence can elide where a shallow one doesn't). Render-only; identity elision is separate (see canonical map). */
      elided?: true;
      /** The criterion's body outline at THIS position (may be a `more` stub if the in-situ expansion tripped a cap). */
      operand: DefStructExpr;
    }
  | { kind: "external"; name: string; lib: string } // cross-lib OR location-less local ref — unaddressable, not evaluated
  | { kind: "more"; count: number }; // count>0 ⇒ width truncation (`+N more`); count 0 ⇒ a depth-cap `…` stub

/** Resolve a concept's operator-tree entry by (lib, name) — the frame-aware edge-follow used to expand a named composite. */
export type ResolveDefExprEntry = (lib: string, name: string) => DefExprEntry | undefined;

/**
 * Build the shared POSITIONAL render structure of a `defined as` body. Identical structure logic to the Questionnaire's
 * former inline `buildQExpr` MINUS the answer/value-type binding — so ONE builder feeds BOTH panes (lockstep by
 * construction, no drift test needed). Width-capped by `DEF_EXPR_CAP`, hop-capped by `DEF_MAX_EXPR_DEPTH`; positional
 * (only a `visiting` cycle-guard). A cross-lib / location-less ref → an `external` stub; a named-composite operand →
 * its own body nested as `composite` (depth cap → a `…` `more` stub).
 */
export function buildDefStruct(
  e: DefExpr,
  resolve: ResolveDefExprEntry,
  visiting: ReadonlySet<string>,
  depth: number,
): DefStructExpr {
  switch (e.kind) {
    case "or":
    case "and": {
      const operands = e.operands.slice(0, DEF_EXPR_CAP).map((o) => buildDefStruct(o, resolve, visiting, depth));
      if (e.operands.length > DEF_EXPR_CAP) operands.push({ kind: "more", count: e.operands.length - DEF_EXPR_CAP });
      return { kind: e.kind, operands };
    }
    case "not":
      return { kind: "not", operand: buildDefStruct(e.operand, resolve, visiting, depth) };
    case "ref": {
      const r = e.ref;
      // Cross-lib OR location-less local stub (no nodeKey) → unaddressable → an `external` stub (never an answerable leaf).
      if (r.crossLib || r.nodeKey === undefined) return { kind: "external", name: r.name, lib: r.lib };
      const leaf: Extract<DefStructExpr, { kind: "leaf" }> = {
        kind: "leaf",
        name: r.name,
        lib: r.lib,
        nodeKey: r.nodeKey,
        isSource: r.hasCodeIs ?? true, // stub flags undefined ⇒ UNKNOWN; default Source (don't spuriously grey)
        isInferred: r.isInferred ?? false,
      };
      // A named-composite (or both-rep) operand is ALSO expandable → nest its OWN body. Positional: cycle-guard only;
      // a diamond re-expands. Depth cap → a `…` stub.
      if (r.hasDefinedAs && !visiting.has(r.nodeKey)) {
        const entry = resolve(r.lib, r.name);
        if (entry?.body) {
          leaf.composite =
            depth >= DEF_MAX_EXPR_DEPTH
              ? { kind: "more", count: 0 }
              : buildDefStruct(entry.body, resolve, new Set(visiting).add(r.nodeKey), depth + 1);
        }
      }
      return leaf;
    }
  }
}

/** A concept's own identity/flags + its `defined as` body operator structure (`body` undefined ⇒ not `defined as`). */
export interface DefExprEntry {
  nodeKey: string;
  lib: string;
  name: string;
  hasCodeIs: boolean;
  leafEligible: boolean;
  isInferred: boolean;
  hasDefinedAs: boolean;
  body?: DefExpr;
}

/** concept nodeKey → its operator-tree entry. */
export type DefExprIndex = Map<string, DefExprEntry>;

/**
 * Build the operator-tree index for a resolved policy. Signature mirrors `buildConceptShapeIndex` (same
 * shared inputs, keyed by nodeKey first-wins) so the two indexes are provably built from ONE set of inputs.
 *
 * @param libs              collected libraries (`collectLibs(graph).libs`) — the raw `Concept` ASTs.
 * @param conceptLayer      `buildCrlConceptLayer(graph)` — the nodeKey + flags join authority.
 * @param leafEligibleByLib libName → concept names that lower into `localCodes` (`leafEligibleConcepts`,
 *                          fail-closed), passed IN so this module keeps no `cql-emitter` dependency.
 */
export function buildDefExprIndex(
  libs: ReadonlyMap<string, LibInfo>,
  conceptLayer: CrlConceptNode[],
  leafEligibleByLib: ReadonlyMap<string, ReadonlySet<string>>,
): DefExprIndex {
  // Per-lib name → CrlConceptNode (flags + nodeKey; first-wins, mirroring conceptByKey / conceptShape).
  const nodeByLibName = new Map<string, Map<string, CrlConceptNode>>();
  for (const c of conceptLayer) {
    let m = nodeByLibName.get(c.lib);
    if (!m) nodeByLibName.set(c.lib, (m = new Map()));
    if (!m.has(c.name)) m.set(c.name, c);
  }
  // Per-lib name → raw Concept AST (the source of `defined as` bodies).
  const astByLibName = new Map<string, Map<string, Concept>>();
  for (const [lib, info] of libs) {
    const m = new Map<string, Concept>();
    for (const s of info.entry.ast.statements) {
      if (s.type === "Concept" && s.name && !m.has(s.name)) m.set(s.name, s);
    }
    astByLibName.set(lib, m);
  }

  // Build a `defined as` operand ref → a `ref` edge, EXCEPT a location-less non-eligible intermediate, which is
  // FLATTENED THROUGH (its `defined as` body inlined) to mirror `conceptShape`'s omit-and-attach-to-nearest-real-
  // ancestor (`conceptShape.ts:145,160-169`) — else its eligible descendants would be dropped (a drift). `path` is
  // the set of concept names being inlined on the current build path (guards a location-less inline cycle).
  const buildRef = (ref: ReferenceName, lib: string, path: ReadonlySet<string>): DefExpr => {
    const normalized = normalizeLocalRef(ref, lib);
    if (isQualifiedRef(normalized)) {
      // Still qualified after same-library normalization → a genuine cross-library operand (unsupported v0).
      return { kind: "ref", ref: { name: getRefName(normalized), lib: getRefLibrary(normalized) ?? lib, crossLib: true, leafEligible: false } };
    }
    const name = getRefName(normalized);
    const cn = nodeByLibName.get(lib)?.get(name);
    const eligible = leafEligibleByLib.get(lib)?.has(name) ?? false;
    if (cn) {
      return {
        kind: "ref",
        ref: {
          name,
          lib,
          crossLib: false,
          nodeKey: cn.nodeKey,
          hasCodeIs: cn.hasLocalCode,
          leafEligible: eligible,
          isInferred: classifyConcept(cn).layer === "inferred",
          hasDefinedAs: cn.definitionKind === "defined-as",
        },
      };
    }
    // Location-less (absent from the concept layer; the layer skips `!location`). A LEAF-ELIGIBLE one would be emitted
    // as an `action.input` by the emitter's location-blind lowering, so a silent stub would UNDER-claim a `$apply`
    // question — the one dangerous drift direction. Fail LOUD (matches conceptShape.ts:139-144).
    if (eligible) {
      throw new Error(
        `internal invariant violated: concept "${lib}"."${name}" is leaf-eligible (lowers into localCodes) ` +
          `but has no concept-layer node — a location-less eligible leaf would drift from \`$apply\`.`,
      );
    }
    // Non-eligible location-less: flatten THROUGH its `defined as` body (its descendants must survive), guarding a
    // location-less inline cycle. No body (or a cycle) → a benign stub (no nodeKey, not a leaf, not recursed).
    const ast = astByLibName.get(lib)?.get(name);
    if (ast?.definition?.type === "DefinedAsDefinition" && !path.has(name)) {
      return buildBody(ast.definition.body, lib, new Set(path).add(name));
    }
    return { kind: "ref", ref: { name, lib, crossLib: false, leafEligible: false, hasDefinedAs: false } };
  };

  // Build the LOCAL DefExpr for a composition expression (CompositionGroup unwrapped; operand order preserved).
  const buildExpr = (expr: CompositionExpression, lib: string, path: ReadonlySet<string>): DefExpr => {
    switch (expr.type) {
      case "SemOrExpression":
        return { kind: "or", operands: expr.terms.map((t) => buildExpr(t, lib, path)) };
      case "SemAndExpression":
        return { kind: "and", operands: expr.terms.map((t) => buildExpr(t, lib, path)) };
      case "SemNotExpression":
        return { kind: "not", operand: buildExpr(expr.expression, lib, path) };
      case "CompositionGroup":
        return buildExpr(expr.expression, lib, path); // precedence-only → unwrap
      case "CompositionRef":
        return buildRef(expr.ref, lib, path);
      default: {
        const _exhaustive: never = expr;
        return _exhaustive;
      }
    }
  };

  function buildBody(body: DefinedAsBareRef | DefinedAsComposition, lib: string, path: ReadonlySet<string>): DefExpr {
    return body.type === "DefinedAsBareRef" ? buildRef(body.ref, lib, path) : buildExpr(body.expression, lib, path);
  }

  const index: DefExprIndex = new Map();
  for (const c of conceptLayer) {
    if (index.has(c.nodeKey)) continue; // first-wins, mirroring conceptShape
    const ast = astByLibName.get(c.lib)?.get(c.name);
    const body =
      ast?.definition?.type === "DefinedAsDefinition" ? buildBody(ast.definition.body, c.lib, new Set()) : undefined;
    index.set(c.nodeKey, {
      nodeKey: c.nodeKey,
      lib: c.lib,
      name: c.name,
      hasCodeIs: c.hasLocalCode,
      leafEligible: leafEligibleByLib.get(c.lib)?.has(c.name) ?? false,
      isInferred: classifyConcept(c).layer === "inferred",
      hasDefinedAs: c.definitionKind === "defined-as",
      body,
    });
  }
  return index;
}

/**
 * The pre-order `leafEligible` nodeKeys reachable from `rootKey`, following the operator tree's ref edges —
 * the operator-tree analog of `codeIsLeavesPreorder(ConceptShapeNode)`. MUST equal it (sequence). Mirrors
 * `walkInferenceOrder` EXACTLY: own leaf FIRST (both-rep concepts list themselves before operands), operands
 * LEFT-TO-RIGHT (the sem-operators are transparent to leaf ORDER — a `not` operand is still traversed, like
 * `flattenDefinedAsBody`), a `visiting` path-set breaks cycles, a `visited` set collapses diamonds (first-wins),
 * and a cross-library / location-less ref is observed but NOT recursed.
 */
export function collectDefExprLeafKeys(rootKey: string, index: DefExprIndex): string[] {
  const out: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visitExpr = (e: DefExpr): void => {
    switch (e.kind) {
      case "or":
      case "and":
        for (const o of e.operands) visitExpr(o);
        return;
      case "not":
        visitExpr(e.operand);
        return;
      case "ref":
        // cross-lib / location-less (no nodeKey) → not recursed; else follow the edge into its concept.
        if (!e.ref.crossLib && e.ref.nodeKey !== undefined) visitConcept(e.ref.nodeKey);
        return;
    }
  };

  const visitConcept = (key: string): void => {
    if (visiting.has(key) || visited.has(key)) return; // cycle guard / diamond memo
    const entry = index.get(key);
    if (!entry) return; // not in the index → contributes nothing. Render-safe: a well-formed index (buildDefExprIndex)
    // only ever hands a ref a nodeKey for a concept it indexed, so this is unreachable there; a malformed caller-built
    // index degrades gracefully rather than throwing (a render must never crash the pane).
    visiting.add(key);
    if (entry.leafEligible) out.push(key); // own-first
    if (entry.body) visitExpr(entry.body);
    visiting.delete(key);
    visited.add(key);
  };

  visitConcept(rootKey);
  return out;
}
