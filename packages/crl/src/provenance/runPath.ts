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
export function producedRuntimePathRefs(
  tree: MinimalViewNode[],
  root: { lib: string; decision: string },
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
    // never fabricate a mis-rooted/empty-decision ref. Keep walking so a deeper produced action is still recorded.
    let nextPathRefs = pathRefs;
    let nextGaps = gaps;
    if (isRow) {
      if (localId !== undefined && frame.decision !== undefined) {
        nextPathRefs = [...pathRefs, { lib: frame.lib, decision: frame.decision, nodeId: localId }];
      } else {
        nextGaps = [...gaps, node.nodeId];
      }
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

    // A produced action is a PATH TERMINUS — record the accumulated refs + gaps (never dropped; gapped ⇒ unmapped).
    if (node.kind === "action" && a?.produced === true) {
      results.push({ refs: nextPathRefs, gaps: nextGaps });
      // A produced action has no produced descendants; don't recurse children, so one produced action = one path.
      return;
    }

    for (const c of node.children ?? []) visit(c, stack, nextPathRefs, nextGaps);
  };

  const rootFrame: Frame = { lib: root.lib, decision: root.decision, prefix: "" };
  for (const n of tree) visit(n, [rootFrame], [], []);
  return results;
}
