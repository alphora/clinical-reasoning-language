// Failed-criterion PEEK model (#173 T3, disc 158 §"Reveal model" / §"Gap / honesty fallback"; impl disc 159) —
// vscode-free + unit-tested, mirroring the crlRevealMaps / celPaneHtml split (the cockpit SHELL stays the untested
// integration). Two pure pieces the cockpit shell wires:
//
//   - `buildRuntimeRefIndex(structure)` — the RUNTIME-ref → CRL-row-nodeKey join. A PURE map straight off the
//     CrlStructure spine (`${lib}\0${decision}\0${nodeId}` → that row's nodeKey), NOT via keyToRowNodeKeys: a failed
//     criterion is a runtime/structure join, not a provenance-unit join (disc 158 §"Reveal model").
//   - `resolveFailedCriteria(criteria, root, index)` — re-root each T2 FailedCriterionNode's RUNTIME (caller-inlined)
//     nodeId to its standalone CRL row via `runtimeNodePathRefs`, then look the terminal standalone ref up in the index.
//     Honest about gaps: an un-rootable / partially-grounded / index-missing criterion is returned `grounded:false`
//     (NO faked nodeKey) so the shell falls back to "Open CRL source at criterion" using the node's own source — never
//     silently dropped, never a fabricated row (disc 158 §Gap).
//
// The cross-lib subtlety (verified against runPath.ts, disc 159 review): `runtimeNodePathRefs` takes a SINGLE
// top-level root `{lib, decision}` and re-roots cross-lib `use decision` frames INTERNALLY (its `expanded`-boundary
// push). The criterion's runtime nodeId is the caller-INLINED deep id, so the root MUST be the top-level covered
// decision — NOT the criterion's own library. The terminal ref `refs.at(-1)` already carries the re-rooted sub's
// (lib, decision, localId).
import { runtimeNodePathRefs, type RuntimePathRef } from "@smile-digital-health/crl/provenance";

/** The structural fields this module reads off a CrlDecisionStructure node — duck-typed so the module needs no `crl`
 *  value import (the shell passes the real `CrlDecisionStructure[]`). Mirrors crlStructure.ts's CrlStructureNode. */
export interface RefIndexNode {
  nodeKey: string;
  nodeId: string;
  decision: string;
  lib: string;
  children: RefIndexNode[];
}
export interface RefIndexDecision {
  children: RefIndexNode[];
}

/** A T2 failed-criterion node (the subset this module re-roots). `nodeId` is the RUNTIME (caller-inlined) id. */
export interface CriterionInput {
  nodeId: string;
}

/** Re-rooting outcome for one failed criterion. `grounded` ⇒ `nodeKey` is the standalone CRL row to highlight.
 *  `!grounded` ⇒ the criterion could not be re-rooted to a CRL row (undefined path / non-empty gaps / a grounded
 *  ref that misses the index) — the shell uses the GAP fallback (open the node's own source), never a faked row. */
export type ResolvedCriterion<C extends CriterionInput> =
  | { criterion: C; grounded: true; nodeKey: string }
  | { criterion: C; grounded: false };

/** The runtime-ref → CRL-row-nodeKey join key. A NUL separator can't appear in a lib/decision name or a `/`-delimited
 *  nodeId, so the three components never collide. Exported for the shell's lookup to use the SAME composer. */
export function runtimeRefKey(lib: string, decision: string, nodeId: string): string {
  return `${lib}\0${decision}\0${nodeId}`;
}

/**
 * Build the runtime-ref → row-nodeKey index by walking the CrlStructure spine. PURE: every spine node already carries
 * its standalone `(lib, decision, nodeId)` AND the matching indexer `nodeKey` (crlStructure.ts keeps them in lockstep),
 * so this is a straight re-key — no keyToRowNodeKeys, no provenance-unit join. A `RuntimePathRef` produced by
 * `runtimeNodePathRefs` looks up directly: `index.get(runtimeRefKey(ref.lib, ref.decision, ref.nodeId))`.
 */
export function buildRuntimeRefIndex(structure: RefIndexDecision[]): Map<string, string> {
  const index = new Map<string, string>();
  const walk = (nodes: RefIndexNode[]): void => {
    for (const n of nodes) {
      index.set(runtimeRefKey(n.lib, n.decision, n.nodeId), n.nodeKey);
      walk(n.children);
    }
  };
  for (const d of structure) walk(d.children);
  return index;
}

/** Resolve one criterion's terminal standalone row nodeKey, or undefined when it can't be HONESTLY grounded.
 *  A criterion is grounded iff `runtimeNodePathRefs` returns a path with NO gaps AND EVERY ref on the path resolves
 *  in the index (the whole-path honesty contract — a partially broken delegation chain must not light its terminus). */
function groundedNodeKey(
  nodeId: string,
  root: { lib: string; decision: string },
  tree: Parameters<typeof runtimeNodePathRefs>[0],
  index: Map<string, string>,
): string | undefined {
  const path = runtimeNodePathRefs(tree, nodeId, root);
  // undefined ⇒ not found anywhere; non-empty gaps ⇒ an ungroundable frame on the path (disc 158 §Gap). Either → gap.
  if (!path || path.gaps.length > 0 || path.refs.length === 0) return undefined;
  // Whole-path validation: every grounded ref must exist in the structure index, not just the terminal one — a path
  // whose ancestor frame fails to join is unmapped even if the last row happens to resolve (gpt55-9 / Claude-9).
  let terminal: string | undefined;
  for (const ref of path.refs as RuntimePathRef[]) {
    const key = index.get(runtimeRefKey(ref.lib, ref.decision, ref.nodeId));
    if (key === undefined) return undefined;
    terminal = key;
  }
  return terminal;
}

/**
 * Re-root each failed criterion to its standalone CRL row. `root` is the TOP-LEVEL covered decision `{lib, decision}`
 * (cross-lib re-rooting happens inside `runtimeNodePathRefs`); `tree` is the scenario VM's inlined `tree`. Returns one
 * `ResolvedCriterion` per input, in order, deduped by runtime nodeId (a SET, disc 158 §"Reveal model"). The shell
 * highlights the `grounded` ones and lists the gaps with an open-source affordance.
 */
export function resolveFailedCriteria<C extends CriterionInput>(
  criteria: C[],
  root: { lib: string; decision: string },
  tree: Parameters<typeof runtimeNodePathRefs>[0],
  index: Map<string, string>,
): ResolvedCriterion<C>[] {
  const out: ResolvedCriterion<C>[] = [];
  const seen = new Set<string>();
  for (const c of criteria) {
    if (seen.has(c.nodeId)) continue;
    seen.add(c.nodeId);
    const nodeKey = groundedNodeKey(c.nodeId, root, tree, index);
    out.push(nodeKey !== undefined ? { criterion: c, grounded: true, nodeKey } : { criterion: c, grounded: false });
  }
  return out;
}
