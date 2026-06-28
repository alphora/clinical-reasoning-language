/**
 * Shared "run path" primitives — the ONE definition of "what a CEL case's run path is", consumed by BOTH the
 * provenance↔cockpit correspondence check (correspondenceCheck.ts) AND the disposition-path scaffold generator
 * (generate.ts). Moved verbatim out of correspondenceCheck.ts (#174 disc 149): a second copy in generate.ts would
 * let the two drift, so the round-trip (generate a disposition-path scaffold → the FINAL gate verifies it) would no
 * longer be honest. The util imports nothing from either consumer (no cycle).
 *
 * A case's run path is: collectProduced (the produced-action ViewNodes in the scenario tree) → for each, the inclusive
 * `/`-prefix ancestor chain of its decision-local nodeId. ViewNode is DUCK-TYPED here (the scenario VM contract) so
 * this module's only `cre` coupling stays structural.
 *
 * #175 (disc 151, Fork B) adds the CHAIN-AWARE decomposer: a same-lib `use decision` is INLINED by the CRE under the
 * caller's nodeId (deep `.../action[0]/.../action[0]` ids that span multiple decisions), but provenance/structure
 * address each decision STANDALONE. `producedRuntimePathRefs` re-roots a deep inlined run-path into the ordered list of
 * standalone-local `RuntimePathRef`s (one per delegation frame) so the consumer can join each to a standalone structure
 * row. See `producedRuntimePathRefs` for the full contract.
 */

/** The inclusive `/`-prefix ancestor chain of a decision-local nodeId (`a/b/c` → [a, a/b, a/b/c]). */
export function ancestorChain(nodeId: string): string[] {
  const segs = nodeId.split("/");
  return segs.map((_, i) => segs.slice(0, i + 1).join("/"));
}

/** Walk a ViewNode tree (recursing children) collecting the PRODUCED action nodes. ViewNode is duck-typed here (the
 *  scenario VM contract) to keep this module's only `cre` coupling structural.
 *
 *  Widened for #175: a use-decision action node also carries `actionKind` / `expanded` / `target` (the boundary info
 *  the decomposer re-roots on). These mirror the real VM `ActionView` (viewModel.ts:127-136 — `actionKind`, `expanded`,
 *  and `target: ConceptView { name, libraryName? }`), so a `sv.tree` satisfies this structural duck-type unchanged. */
export interface MinimalViewNode {
  nodeId: string;
  kind: string;
  action?: {
    produced?: boolean;
    /** "use-decision" | "recommend-activity" on a real ActionView; only "use-decision" is load-bearing here. */
    actionKind?: string;
    /** use-decision only: true when a BARE same-lib target was recursed in place (its sub-tree inlined as `children`). */
    expanded?: boolean;
    /** The delegation target (a use-decision's `decisionName`, projected to a ConceptView). `name` is the sub-decision;
     *  `libraryName` is set only for a QUALIFIED cross-lib target. */
    target?: { name: string; libraryName?: string };
  };
  children?: MinimalViewNode[];
}

export function collectProduced(nodes: MinimalViewNode[], out: MinimalViewNode[]): void {
  for (const n of nodes) {
    if (n.kind === "action" && n.action?.produced === true) out.push(n);
    if (n.children) collectProduced(n.children, out);
  }
}

/**
 * A standalone-local run-path reference: a row of a SPECIFIC decision, addressed by that decision's OWN nodeId (not the
 * caller-inlined deep id). `lib` is present from day one (disc 151 refinement 9, forward-compat with #172 cross-lib):
 * for a same-lib chain it is the current frame's lib; for a qualified target it would record the resolved sub's lib.
 */
export interface RuntimePathRef {
  lib: string;
  decision: string;
  nodeId: string;
}

/**
 * One produced action's normalized run path: the grounded standalone refs in order, plus the raw deep nodeIds that could
 * NOT be re-rooted (the residual-unmapped signal, disc 151 refinement 5).
 *
 * `refs` is the ordered, grounded standalone path (delegation chain → each sub's path → terminal recommend). `gaps` is
 * EMPTY on every real-VM path (the normal case). A NON-EMPTY `gaps` means the decomposer hit a node it could not ground
 * (a mis-prefixed nodeId, or an `expanded` boundary with no `target.name`) — the CONSUMER (todo-2) MUST then route this
 * produced action to `unmapped-runtime-node` REGARDLESS of whether the grounded refs happen to all resolve. This makes
 * the honesty invariant MACHINE-CHECKABLE rather than prose: a short/mis-rooted path can never masquerade as a clean one.
 */
export interface ProducedRunPath {
  /** Grounded standalone refs, ordered. */
  refs: RuntimePathRef[];
  /** Raw deep nodeIds on this path that could NOT be re-rooted. Empty on every real-VM path; non-empty ⇒ unmapped. */
  gaps: string[];
}

/** A delegation frame on the decomposer's stack: which decision is "in scope" for the inlined rows, and the caller-local
 *  prefix (the use-decision boundary node's nodeId) that opened it. Root frame prefix = "". A frame with `decision`
 *  undefined is the UNGROUNDED sentinel: opened by an `expanded` boundary whose `target.name` was absent — every node
 *  under it contributes to `gaps` and emits NO ref (no decision to root against), so nothing is fabricated. */
interface Frame {
  lib: string;
  /** undefined ⇒ ungrounded frame (no decision identity → descendants gap, never emit a ref). */
  decision: string | undefined;
  /** The caller-local nodeId of the use-decision boundary that opened this frame ("" for the root). */
  prefix: string;
}

/** Strip a frame prefix off a deep inlined nodeId, yielding the standalone-local id within that frame's decision.
 *  `stripPrefix("a/b/c", "a")` → "b/c"; `stripPrefix("a/b", "")` → "a/b". Returns undefined when `id` is NOT under
 *  `prefix` (a structural impossibility on a real path — surfaced rather than silently coerced). */
function stripPrefix(id: string, prefix: string): string | undefined {
  if (prefix === "") return id;
  if (id === prefix) return "";
  if (id.startsWith(prefix + "/")) return id.slice(prefix.length + 1);
  return undefined;
}

/**
 * The #175 chain-aware decomposer (disc 151, Fork B). For each PRODUCED action in the scenario tree, return the ordered
 * list of standalone-local `RuntimePathRef`s along its root-to-produced path, RE-ROOTED at each `expanded` use-decision
 * boundary into the sub-decision's own frame.
 *
 * ALGORITHM (a frame-stack VM walk — NOT string parsing; the deep nodeId carries no boundary marker, so the boundary is
 * recoverable ONLY from the VM node where `actionKind === "use-decision" && expanded === true`):
 *   - Carry a stack of frames `{ lib, decision, prefix }` down the recursion (top = innermost). The root frame is
 *     `{ ...root, prefix: "" }`. A frame is PUSHED only when descending into an `expanded` boundary's inlined children,
 *     and is naturally "popped" when that recursion branch returns (each branch holds its own stack copy — no explicit
 *     pop / prefix-mismatch unwind). The node's standalone-local id = `stripPrefix(node.nodeId, frame.prefix)`.
 *   - Emit a ref `{ lib, decision, nodeId: localId }` for every WHEN / OTHERWISE / ACTION row on the path under the
 *     current frame — including a use-decision boundary's OWN action row (it is a real standalone row of the CALLING
 *     decision, disc 151 refinement 2).
 *   - At an `expanded: true` use-decision node with `target.name` PRESENT: emit its boundary action row under the CURRENT
 *     frame, THEN PUSH a new frame `{ lib: target.libraryName ?? frame.lib, decision: target.name, prefix: <boundary
 *     nodeId> }` for the inlined children. The terminal recommend, two frames down, emits under the deepest sub.
 *   - At an `expanded: true` boundary with `target.name` ABSENT (structurally impossible on a real VM — but we DO NOT
 *     fabricate a `decision: ""` ref): emit the boundary's own row under the current frame, then recurse the inlined
 *     children in an UNGROUNDED frame (decision undefined) where every descendant adds its raw nodeId to `gaps` and emits
 *     NO ref. The deeper produced action is still recorded, with non-empty `gaps` → observably unmapped.
 *   - The `refs` for one produced action = the ordered concatenation of every frame's refs (the caller's delegation
 *     chain + each sub's path + the terminal recommend).
 *
 * The three leaf-causes (disc 151 refinement 6) need NO special branch here: a QUALIFIED, UNRESOLVED, or CYCLIC-re-entry
 * use-decision is `expanded !== true` and a LEAF (no inlined children). It is on a produced path only if it is itself
 * produced (it never is — a use-decision is never `produced`) or an ancestor of a deeper produced action (it cannot be —
 * it has no children). So such a boundary contributes ONLY its own standalone action row under the current frame and we
 * never push a frame / re-root into the non-inlined target. (The outer expansion of a cycle is `expanded:true` and
 * recurses normally; the inner re-entry leaf is handled by this same no-push path.)
 *
 * RESIDUAL-UNMAPPED CONTRACT (disc 151 refinement 5 — CRITICAL, MACHINE-CHECKABLE): this primitive NORMALIZES the path
 * into standalone refs; it does NOT validate them against the structure index. It returns every ref it CAN ground, NEVER
 * fabricates a mis-rooted/empty-decision ref, and NEVER silently drops a produced action. Any node it cannot ground (a
 * mis-prefixed nodeId, or an `expanded` boundary with no `target.name`) adds its raw deep nodeId to the path's `gaps`
 * instead of an inventing ref. So a SHORT/mis-rooted path is no longer indistinguishable from a clean one — `gaps` is the
 * explicit per-path unmapped signal. The CONSUMER (correspondenceCheck / generate) routes a produced action to
 * `unmapped-runtime-node` iff `gaps` is non-empty OR any grounded ref misses `idToKey`. On every real VM, `gaps` is empty
 * and the consumer's `idToKey` join is the only gate (the same-lib chain's rows all exist standalone after todo-2).
 *
 * BACK-COMPAT: a tree with NO `expanded` use-decision boundary never pushes a frame, so every node stays in the root
 * frame with prefix "" and `localId === node.nodeId`. The `refs` for a produced action are then exactly its inclusive
 * `ancestorChain` (each as `{ root.lib, root.decision, id }`) with empty `gaps` — the new primitive reduces to today's
 * flat chain when there are no boundaries (asserted by a back-compat unit test).
 */
/**
 * The predicate-parameterized CORE of the chain-aware decomposer (#173 T1, disc 158 §"Decomposer generalization").
 *
 * It is the frame-stack VM walk extracted VERBATIM from the old `producedRuntimePathRefs` body — keyed on TREE POSITION,
 * never on `produced`. It accumulates frames + grounded refs + gaps top-down, and when it reaches a node satisfying
 * `stop(node)` it emits the accumulated `{ refs, gaps }` path TO that node INCLUSIVE and STOPS (does NOT recurse the
 * matched node's children — a stop-node is a path terminus, exactly as a produced action was). Every other mechanism —
 * the `expanded`-boundary frame push, the `target.libraryName ?? frame.lib` cross-lib re-root, the `stripPrefix`
 * ungrounded-sentinel + the residual-unmapped (`gaps`) honesty contract — transfers unchanged because all of it is keyed
 * on the boundary/prefix structure of the tree, not on what makes a node a terminus.
 *
 * Returns one `ProducedRunPath` per stop-node found, in DFS order. The two public entrypoints differ ONLY in `stop`:
 *   - `producedRuntimePathRefs`  → `stop = n.kind === "action" && n.action?.produced === true`.
 *   - `runtimeNodePathRefs`      → `stop = n.nodeId === targetNodeId`.
 */
function decomposePaths(
  tree: MinimalViewNode[],
  root: { lib: string; decision: string },
  stop: (node: MinimalViewNode) => boolean,
): ProducedRunPath[] {
  const results: ProducedRunPath[] = [];

  // DFS carrying the live frame stack (top = innermost frame), the accumulated grounded refs, and the accumulated gaps.
  const visit = (
    node: MinimalViewNode,
    stack: Frame[],
    pathRefs: RuntimePathRef[],
    gaps: string[],
  ): void => {
    const frame = stack[stack.length - 1];
    const isRow = node.kind === "when" || node.kind === "otherwise" || node.kind === "action";
    const localId = frame.decision === undefined ? undefined : stripPrefix(node.nodeId, frame.prefix);

    // Ground this node, or record a gap. A row whose id is not under the current frame's prefix — OR any node inside an
    // UNGROUNDED frame (frame.decision === undefined) — cannot be grounded: add its raw nodeId to `gaps` (emit no ref),
    // never fabricate a mis-rooted/empty-decision ref. Keep walking so a deeper stop-node is still recorded.
    let nextPathRefs = pathRefs;
    let nextGaps = gaps;
    if (isRow) {
      if (localId !== undefined && frame.decision !== undefined) {
        nextPathRefs = [...pathRefs, { lib: frame.lib, decision: frame.decision, nodeId: localId }];
      } else {
        nextGaps = [...gaps, node.nodeId];
      }
    }

    // A node satisfying `stop` is a PATH TERMINUS — record the accumulated refs + gaps TO it inclusive (the row, if any,
    // was already grounded/gapped above) and STOP. This is checked BEFORE the expanded-boundary push so a stop-node that
    // happens to be an expanded use-decision boundary still terminates the path AT it (does not descend its sub-tree).
    if (stop(node)) {
      results.push({ refs: nextPathRefs, gaps: nextGaps });
      return;
    }

    const a = node.action;
    const isExpandedBoundary =
      node.kind === "action" && a?.actionKind === "use-decision" && a.expanded === true;

    if (isExpandedBoundary) {
      // PUSH a frame for the inlined children, rooted at THIS boundary node's caller-local nodeId. The boundary's own
      // action row was already emitted above under the CURRENT frame (it belongs to the calling decision). With a present
      // `target.name` the child frame is grounded; ABSENT name → an UNGROUNDED sentinel frame (decision undefined): we do
      // NOT fabricate `decision: ""` — descendants gap instead. An ungrounded PARENT stays ungrounded (no resurrection).
      const target = a?.target;
      const grounded = frame.decision !== undefined && !!target?.name;
      const childFrame: Frame = grounded
        ? { lib: target!.libraryName ?? frame.lib, decision: target!.name, prefix: node.nodeId }
        : { lib: frame.lib, decision: undefined, prefix: node.nodeId };
      const childStack = [...stack, childFrame];
      for (const c of node.children ?? []) visit(c, childStack, nextPathRefs, nextGaps);
      return;
    }

    for (const c of node.children ?? []) visit(c, stack, nextPathRefs, nextGaps);
  };

  const rootFrame: Frame = { lib: root.lib, decision: root.decision, prefix: "" };
  for (const n of tree) visit(n, [rootFrame], [], []);
  return results;
}

/**
 * The #175 chain-aware decomposer for PRODUCED actions — now a thin wrapper over the predicate-parameterized
 * `decomposePaths` core (#173 T1). Output is BYTE-IDENTICAL to the prior hand-rolled implementation: the `produced`
 * predicate selects exactly the same termini, the core's stop-before-push order matches the old code (a produced action
 * is never an expanded boundary, so the ordering choice is moot for this predicate but harmless), and the frame /
 * re-root / gaps machinery is the same code. The #170/#174/#175 regression tests pin this byte-for-byte.
 */
export function producedRuntimePathRefs(
  tree: MinimalViewNode[],
  root: { lib: string; decision: string },
): ProducedRunPath[] {
  return decomposePaths(tree, root, (n) => n.kind === "action" && n.action?.produced === true);
}

/**
 * GENERALIZED decomposer (#173 T1, disc 158): re-root an ARBITRARY inlined runtime nodeId to its standalone
 * `(lib, decision, nodeId)` provenance ref(s). Decomposes the root-to-`targetNodeId` path the SAME way
 * `producedRuntimePathRefs` decomposes a produced path — through the `decomposePaths` core with the predicate
 * `n.nodeId === targetNodeId` — re-rooting at every `expanded` use-decision boundary into the sub-decision's own frame.
 * The target's own standalone row is the LAST ref on the returned path (the row was grounded as the walk reached it).
 *
 * RETURN CONTRACT (disc 158 §T1 honesty):
 *   - `targetNodeId` NOT present anywhere in the tree → `undefined`. A clear NOT-FOUND signal the consumer routes like
 *     `unmapped` — distinct from an empty `{ refs: [], gaps: [] }` (which would look groundable / on-path). The consumer
 *     MUST treat `undefined` as not-found, never as a clean empty path.
 *   - FOUND on a fully grounded path → `{ refs, gaps: [] }` (the standalone re-rooted refs, target's own row last).
 *   - FOUND but on an ungrounded / cross-frame path (a mis-prefixed id, or under an `expanded` boundary with no
 *     `target.name`) → `{ refs, gaps }` with NON-EMPTY `gaps` and NO fabricated ref — exactly the producedRuntimePathRefs
 *     honesty contract. The consumer routes a non-empty `gaps` to unmapped, never lights a fabricated row.
 *
 * If `targetNodeId` appears more than once in the tree (e.g. the SAME inlined sub reached via two parent branches, where
 * the deep ids actually differ; or a genuinely repeated id), the FIRST DFS match is returned — the path a single reveal
 * peeks. (A produced terminus is unique per produced action; an arbitrary node match takes the first occurrence.)
 */
export function runtimeNodePathRefs(
  tree: MinimalViewNode[],
  targetNodeId: string,
  root: { lib: string; decision: string },
): ProducedRunPath | undefined {
  const paths = decomposePaths(tree, root, (n) => n.nodeId === targetNodeId);
  return paths.length === 0 ? undefined : paths[0];
}
