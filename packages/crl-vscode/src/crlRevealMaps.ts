// Cross-pane reveal maps (vscode-free, unit-tested) — three-pane viewer C2b-2 (#156).
// Bridges the correspondence model (source↔CRL units, keyed by the refs the artifact clusters cite — often concept/
// activity keys) to the CRL-structure rows (the decision tree). A row is reachable by ANY of its keys: its own decision
// sub-node nodeKey OR a refKey (the concept/activity/decision it references). Clusters are a COVER not a partition, so a
// key can belong to multiple units → all maps are multi-valued. Pure; the renderer stays simple (gemini's separation).
import type { CorrespondenceModel, CrlDecisionStructure, CrlStructureNode } from "@smile-digital-health/crl";

interface RowMeta {
  nodeKey: string;
  nodeId: string; // "" for a decision root
  kind: string; // "when" | "otherwise" | "action" | "decision" (root)
  decision: string;
  lib: string;
}

export interface CrlRevealMaps {
  /** unitId → the correspondence keys it cites (deduped). */
  unitToKeys: Map<string, string[]>;
  /** a correspondence key → the structure ROW nodeKeys that bear it (own nodeKey or a refKey). */
  keyToRowNodeKeys: Map<string, string[]>;
  /** a correspondence key → the units that cite it (deduped). */
  keyToUnitIds: Map<string, string[]>;
  /** unitIds that have at least one source span (can be a CRL→source reveal target). */
  sourceBearingUnits: Set<string>;
  /** row nodeKey → its tree metadata (for context-scoping a reveal to a branch). */
  nodeByKey: Map<string, RowMeta>;
}

/** Segment-aware descendant test on the `/`-delimited nodeId path (a row IS itself its own context). */
function isUnder(ancestorNodeId: string, descNodeId: string): boolean {
  return descNodeId === ancestorNodeId || descNodeId.startsWith(`${ancestorNodeId}/`);
}

function push(map: Map<string, string[]>, key: string, val: string): void {
  const arr = map.get(key);
  if (arr) {
    if (!arr.includes(val)) arr.push(val);
  } else map.set(key, [val]);
}

function walk(nodes: CrlStructureNode[], visit: (n: CrlStructureNode) => void): void {
  for (const n of nodes) {
    visit(n);
    walk(n.children, visit);
  }
}

export function buildCrlRevealMaps(
  correspondence: CorrespondenceModel,
  structure: CrlDecisionStructure[],
): CrlRevealMaps {
  const unitToKeys = new Map<string, string[]>();
  const keyToUnitIds = new Map<string, string[]>();
  const sourceBearingUnits = new Set<string>();
  for (const u of correspondence.units) {
    // "source-bearing" = has a RESOLVED span (a displayRange) — the source pane only renders/cycles those, so a unit
    // with only malformed source refs can't be a CRL→source reveal target.
    if (u.source.some((s) => s.displayRange)) sourceBearingUnits.add(u.id);
    for (const c of u.crl) {
      if (c.unresolved) continue; // an unresolved cluster ref must not bridge by string equality → clean no-op
      push(unitToKeys, u.id, c.nodeKey);
      push(keyToUnitIds, c.nodeKey, u.id);
    }
  }

  const keyToRowNodeKeys = new Map<string, string[]>();
  const nodeByKey = new Map<string, RowMeta>();
  for (const d of structure) {
    // a decision root is itself addressable (decl-level refs are legal)
    push(keyToRowNodeKeys, d.nodeKey, d.nodeKey);
    nodeByKey.set(d.nodeKey, { nodeKey: d.nodeKey, nodeId: "", kind: "decision", decision: d.decision, lib: d.lib });
    walk(d.children, (n) => {
      for (const key of [n.nodeKey, ...n.refKeys]) push(keyToRowNodeKeys, key, n.nodeKey);
      nodeByKey.set(n.nodeKey, { nodeKey: n.nodeKey, nodeId: n.nodeId, kind: n.kind, decision: n.decision, lib: n.lib });
    });
  }

  return { unitToKeys, keyToRowNodeKeys, keyToUnitIds, sourceBearingUnits, nodeByKey };
}

/**
 * Source-unit reveal → the CRL row nodeKeys to highlight, CONTEXT-SCOPED. A unit cites a set of leaf keys; a shared leaf
 * (e.g. an activity `Approve` recommended in several branches) would otherwise light up EVERY branch's action. So when the
 * unit also matches a branch condition (a `when`/`otherwise` row), keep only the action rows UNDER a matched branch —
 * collapsing out-of-context matches (disc 117). With no branch context (the unit cites only actions), fall back to all.
 */
export function rowNodeKeysForUnit(unitId: string, maps: CrlRevealMaps): string[] {
  const matched = new Set<string>();
  for (const key of maps.unitToKeys.get(unitId) ?? [])
    for (const rowKey of maps.keyToRowNodeKeys.get(key) ?? []) matched.add(rowKey);

  const rows = [...matched].map((k) => maps.nodeByKey.get(k)).filter((r): r is RowMeta => r !== undefined);
  const branches = rows.filter((r) => r.kind === "when" || r.kind === "otherwise");
  if (branches.length === 0) return [...matched]; // no branch context to disambiguate → best effort

  const keep: string[] = [];
  for (const r of rows) {
    if (r.kind !== "action") {
      keep.push(r.nodeKey); // branches + decision roots
    } else if (branches.some((b) => b.decision === r.decision && b.lib === r.lib && isUnder(b.nodeId, r.nodeId))) {
      keep.push(r.nodeKey); // an action only when one of the matched branches is its ancestor
    }
  }
  return keep;
}

/** CRL row click → the candidate SOURCE-BEARING units (a row is targetable by its own key or any refKey). */
export function unitsForRow(node: { nodeKey: string; refKeys: string[] }, maps: CrlRevealMaps): string[] {
  const out: string[] = [];
  for (const key of [node.nodeKey, ...node.refKeys])
    for (const unitId of maps.keyToUnitIds.get(key) ?? [])
      if (maps.sourceBearingUnits.has(unitId) && !out.includes(unitId)) out.push(unitId);
  return out;
}
