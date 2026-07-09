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
