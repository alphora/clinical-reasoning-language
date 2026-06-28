// "This node" cross-pane marker RE-ROOTING (#177 slice 4) — vscode-free + unit-tested, mirroring the failedCriterionPeek
// split (the cockpit SHELL stays the untested integration). The questionnaire's focused-question input is a RUNTIME
// (caller-inlined) nodeId, NOT directly joinable to a standalone CRL row (the same impedance the failed-criterion peek
// solves). This module re-roots ONE runtime nodeId to its standalone CRL row nodeKey + that row's source-bearing units,
// reusing the SAME `resolveFailedCriteria`/`runtimeNodePathRefs` join the peek uses (disc 159).
//
// The per-pane SEGMENT computation (nodeKey/unit → a pane's segment ids via `v.anchors`) stays in the shell — it needs the
// live per-render anchor maps. What's PURE and worth locking here: runtime nodeId → { nodeKey?, sourceUnits[] }. The tree
// and crl panes mark via the nodeKey (their anchors are keyed by structure nodeKey); the source pane marks via the units
// (degrading silently to NO source mark when the row has no source-bearing unit — the fcGaps fallback shape).
import { resolveFailedCriteria } from "./failedCriterionPeek";
import type { CrlRevealMaps } from "./crlRevealMaps";
import { unitsForRow } from "./crlRevealMaps";

/** The resolution of one runtime nodeId for the marker. `nodeKey` undefined ⇒ ungroundable (no tree/crl/source mark —
 *  silent degrade, like a failed-criterion gap). `sourceUnits` is empty when grounded but the row bears no source unit
 *  (tree+crl still mark; source degrades silently). */
export interface ResolvedThisNode {
  nodeKey?: string;
  sourceUnits: string[];
}

/**
 * Re-root a single runtime nodeId → its standalone CRL row nodeKey + source-bearing units.
 *
 * @param nodeId  the FOCUSED question's runtime (caller-inlined) nodeId.
 * @param root    the TOP-LEVEL covered decision `{lib, decision}` (cross-lib re-rooting happens inside the path walk).
 * @param tree    the scenario VM's inlined `tree` (the runtime path source).
 * @param index   the runtime-ref → row-nodeKey index (`buildRuntimeRefIndex(crlStructure)`).
 * @param maps    the cockpit's CrlRevealMaps (for `unitsForRow`); undefined → no source units (tree/crl still resolve).
 */
export function resolveThisNode(
  nodeId: string,
  root: { lib: string; decision: string },
  tree: Parameters<typeof resolveFailedCriteria>[2],
  index: Map<string, string>,
  maps: CrlRevealMaps | undefined,
): ResolvedThisNode {
  // Reuse the failed-criterion join verbatim (one criterion = one runtime nodeId). A gap → ungroundable → no mark.
  const [resolved] = resolveFailedCriteria([{ nodeId }], root, tree, index);
  if (!resolved || !resolved.grounded) return { sourceUnits: [] };
  const nodeKey = resolved.nodeKey;
  const sourceUnits = maps ? unitsForRow(nodeKey, maps) : [];
  return { nodeKey, sourceUnits };
}
