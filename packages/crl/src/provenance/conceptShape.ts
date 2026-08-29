/**
 * Per-concept SHAPE index (#187 Todo 1b) — a root-relative `defined as` subtree per concept, built on the
 * neutral single-authority walk (`ast/inferenceWalk`, Todo 1a). Both Medical-Validation panes consume this
 * so their question/tree surface CANNOT drift from what the emitted PlanDefinition asks under `$apply`:
 * a node's pre-order `leafEligible` projection (`codeIsLeavesPreorder`) equals the emitter's
 * `collectCodeIsConceptsInInferenceOrder` for any same-library decision `when` (the load-bearing invariant).
 *
 * Design authority: `.vibe-tools/discussions/189-mv-panes-todo1b-concept-shape-plan.md`. Key decisions:
 *   - Two flags, deliberately distinct: `hasCodeIs` (raw local `code is` → Source / non-grey display) vs
 *     `leafEligible` (the emitter's LOWERED selector → emits an `action.input` leaf). They DIFFER for a
 *     representation-bearing `code is` concept (Source, but NOT a lowered leaf).
 *   - The subtree walks the RAW `defined as` bodies (defined-as-only, via the shared walk) — NOT the concept
 *     layer's `definitionRefs` (which mix `definition is` edges). This parallels the emitter's own adapter.
 *   - Cross-library operands are OMITTED (the emitter skips them in v0); a name absent from the concept
 *     layer (location-less) is OMITTED (not addressable — never synthesize a nodeKey).
 *   - PURE: `leafEligibleByLib` is computed by the caller (the cockpit, via `leafEligibleConcepts`) and
 *     passed in, so this module keeps no `cql-emitter` dependency.
 */
import { walkInferenceOrder } from "../ast/inferenceWalk";
import { conceptRefsOfDefinition } from "../ast/conceptDependencies";
import type { Concept } from "../ast/types";

import { classifyConcept, type CrlConceptNode } from "./crlConceptLayer";
import type { LibInfo } from "./indexer";

/** One node of a concept's root-relative definition subtree. */
export interface ConceptShapeNode {
  /** The concept-declaration nodeKey (the cross-pane join key; from `CrlConceptNode.nodeKey`). */
  nodeKey: string;
  /** Has a local `- code is` (raw). Drives Source vs non-Source (grey-bg) display. */
  hasCodeIs: boolean;
  /** Lowers into the emitter's `localCodes` → emits an `action.input` leaf. `hasCodeIs && !leafEligible`
   *  for a representation-bearing `code is` concept (Source display, but not an emitted leaf). */
  leafEligible: boolean;
  /** `classifyConcept().layer === "inferred"` (`defined as` OR `definition is`) — the inferred marker
   *  (the Tree pane's purple dot / the questionnaire's inferred styling). */
  isInferred: boolean;
  /** `definitionKind === "defined-as"` — syntactically expandable (has structured operand children). */
  hasDefinedAs: boolean;
  /** The `defined as` operand concepts, in inference order (pre-order, left-to-right), diamond/cycle
   *  collapsed by the shared walk (first-wins). Empty for a leaf or a `definition is` inferred concept. */
  children: ConceptShapeNode[];
}

/** concept nodeKey → its root-relative shape subtree. */
export type ConceptShapeIndex = Map<string, ConceptShapeNode>;

/**
 * The pre-order `leafEligible` nodeKeys of a shape subtree — the `$apply` `action.input` projection. MUST
 * equal `collectCodeIsConceptsInInferenceOrder(when, ...)` (mapped name→nodeKey) for any same-library `when`
 * whose library lowers cleanly. Pre-order = own leaf first, then children (a both-rep concept lists itself
 * before its operands); the subtree is already dedup'd by the walk, so no second dedup is needed here.
 */
export function codeIsLeavesPreorder(node: ConceptShapeNode): string[] {
  const out: string[] = [];
  const visit = (n: ConceptShapeNode): void => {
    if (n.leafEligible) out.push(n.nodeKey);
    for (const c of n.children) visit(c);
  };
  visit(node);
  return out;
}

/**
 * Build the concept-shape index for a resolved policy.
 *
 * PERF: one `walkInferenceOrder` per concept (`conceptLayer.length` walks) — strictly more than the emitter,
 * which walks only per decision `when`. On a deep `defined as` chain this is O(N²) in the chain depth. Fine
 * for real policies (dozens of concepts, shallow trees); if a large deep closure ever makes it hot, share a
 * memo of already-materialized subtrees across roots (the diamond memo is per-walk today).
 *
 * @param libs              the collected libraries (`collectLibs(graph).libs`) — the raw Concept ASTs source.
 *                          Passed IN (not re-collected) so its lib set + opts match the `conceptLayer` the
 *                          caller built, and to avoid a redundant `collectLibs` pass.
 * @param conceptLayer      `buildCrlConceptLayer(graph)` output — the join authority for nodeKey + flags. An
 *                          empty layer (no policy anchor) yields an empty index.
 * @param leafEligibleByLib libName → the set of concept names that lower into `localCodes` (from
 *                          `leafEligibleConcepts(libAst)`, fail-closed on lowering errors). Passed IN so this
 *                          builder stays pure (no `cql-emitter` dependency).
 */
export function buildConceptShapeIndex(
  libs: ReadonlyMap<string, LibInfo>,
  conceptLayer: CrlConceptNode[],
  leafEligibleByLib: ReadonlyMap<string, ReadonlySet<string>>,
): ConceptShapeIndex {
  // Per-lib name → CrlConceptNode (the join authority for flags + nodeKey; first-wins, mirroring conceptByKey).
  const nodeByLibName = new Map<string, Map<string, CrlConceptNode>>();
  for (const c of conceptLayer) {
    let m = nodeByLibName.get(c.lib);
    if (!m) {
      m = new Map();
      nodeByLibName.set(c.lib, m);
    }
    if (!m.has(c.name)) m.set(c.name, c);
  }

  // Per-lib name → raw Concept AST (the source of `defined as` operand bodies for the walk).
  const astByLibName = new Map<string, Map<string, Concept>>();
  for (const [lib, info] of libs) {
    const m = new Map<string, Concept>();
    for (const s of info.entry.ast.statements) {
      if (s.type === "Concept" && s.name && !m.has(s.name)) m.set(s.name, s);
    }
    astByLibName.set(lib, m);
  }

  const buildSubtree = (root: CrlConceptNode): ConceptShapeNode => {
    const lib = root.lib;
    const eligible = leafEligibleByLib.get(lib) ?? new Set<string>();
    const nodeByName = nodeByLibName.get(lib) ?? new Map<string, CrlConceptNode>();
    const astByName = astByLibName.get(lib) ?? new Map<string, Concept>();

    // Stack-based materialization from the shared walk's pre/post-order hooks. `null` marks an OMITTED node
    // (a name absent from the concept layer — location-less, not addressable); a real node's children attach
    // to the nearest REAL ancestor, so a (degenerate) omitted intermediate flattens through rather than
    // orphaning its descendants. The root is always a concept-layer node, so `built` is always set.
    const stack: (ConceptShapeNode | null)[] = [];
    let built: ConceptShapeNode | undefined;

    walkInferenceOrder(root.name, lib, {
      // A presence sentinel, NOT a real code value: only `code !== undefined` is consumed (`leafEligible`
      // below), and the gate compares nodeKeys/names, never the code. `leafEligible` = "lowers into localCodes".
      codeOf: (name) => (eligible.has(name) ? "•" : undefined),
      // ⚠ The SAME edge function the emitter uses (`ast/conceptDependencies`), not a byte-copy of it. This
      // used to re-implement the `DefinedAsDefinition`-only guard, and when the emitter's walk widened to
      // follow narrative and named-reduction edges this side did not — so the MV panes would have omitted
      // inputs `$apply` surfaces, which is precisely the drift the equivalence contract above exists to stop.
      // One function, two callers; a re-implementation that "byte-matches" only matches until it doesn't.
      operandsOf: (name) => conceptRefsOfDefinition(astByName.get(name)?.definition),
      onEnter: (name, code) => {
        const cn = nodeByName.get(name);
        if (!cn) {
          // A name the walk entered but the concept layer has no node for — a location-less concept (the layer
          // skips `!location`). If it is LEAF-ELIGIBLE, the emitter's location-blind lowering WOULD emit it as
          // an `action.input`, so silently omitting it would UNDER-claim a question `$apply` asks — the one
          // dangerous drift direction. Fail LOUD (unreachable from real files — the parser always assigns a
          // location — so this is a synthetic-AST / internal-invariant guard, matching lowerLocalCodes' bar).
          if (code !== undefined) {
            throw new Error(
              `internal invariant violated: concept "${lib}"."${name}" is leaf-eligible (lowers into localCodes) ` +
                `but has no concept-layer node — a location-less eligible leaf would drift from \`$apply\`.`,
            );
          }
          stack.push(null); // a non-eligible location-less intermediate → omit; the balancing onExit discards it.
          return;
        }
        stack.push({
          nodeKey: cn.nodeKey,
          hasCodeIs: cn.hasLocalCode,
          leafEligible: code !== undefined,
          isInferred: classifyConcept(cn).layer === "inferred",
          hasDefinedAs: cn.definitionKind === "defined-as",
          children: [],
        });
      },
      onExit: () => {
        const node = stack.pop();
        if (!node) return; // omitted
        // Attach to the nearest REAL ancestor still on the stack (skipping omitted placeholders).
        let parent: ConceptShapeNode | null = null;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i]) {
            parent = stack[i];
            break;
          }
        }
        if (parent) parent.children.push(node);
        else built = node; // the root
      },
      // onCrossLib: intentionally omitted — a cross-library operand is skipped (emitter-faithful, v0). A
      // retained cross-lib stub is a render nicety deferred to Todo 3/4 (which owns its nodeKey identity).
    });

    // `root.name` is a bare concept-layer name, so the walk never early-returns on a qualified root and the
    // root is a real node → `built` is set. Assert it rather than casting a possible `undefined` into the index.
    if (!built)
      throw new Error(
        `internal invariant violated: concept shape root not built for "${lib}"."${root.name}".`,
      );
    return built;
  };

  const index: ConceptShapeIndex = new Map();
  for (const c of conceptLayer) {
    if (!index.has(c.nodeKey)) index.set(c.nodeKey, buildSubtree(c));
  }
  return index;
}
