// Cross-pane reveal maps (vscode-free, unit-tested) — three-pane viewer C2b-2 (#156).
// Bridges the correspondence model (source↔CRL units, keyed by the refs the artifact clusters cite — often concept/
// activity keys) to the CRL-structure rows (the decision tree). A row is reachable by ANY of its keys: its own decision
// sub-node nodeKey OR a refKey (the concept/activity/decision it references). Clusters are a COVER not a partition, so a
// key can belong to multiple units → all maps are multi-valued. Pure; the renderer stays simple (gemini's separation).
import type { CorrespondenceModel, CrlDecisionStructure, CrlStructureNode } from "@smile-digital-health/crl";

export interface CrlRevealMaps {
  /** unitId → the correspondence keys it cites (deduped). */
  unitToKeys: Map<string, string[]>;
  /** a correspondence key → the structure ROW nodeKeys that bear it (own nodeKey or a refKey). */
  keyToRowNodeKeys: Map<string, string[]>;
  /** a correspondence key → the units that cite it (deduped). */
  keyToUnitIds: Map<string, string[]>;
  /** unitIds that have at least one source span (can be a CRL→source reveal target). */
  sourceBearingUnits: Set<string>;
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
  for (const d of structure) {
    // a decision root is itself addressable (decl-level refs are legal)
    push(keyToRowNodeKeys, d.nodeKey, d.nodeKey);
    walk(d.children, (n) => {
      for (const key of [n.nodeKey, ...n.refKeys]) push(keyToRowNodeKeys, key, n.nodeKey);
    });
  }

  return { unitToKeys, keyToRowNodeKeys, keyToUnitIds, sourceBearingUnits };
}

/** Source-unit reveal → the CRL row nodeKeys to highlight (deduped). */
export function rowNodeKeysForUnit(unitId: string, maps: CrlRevealMaps): string[] {
  const out: string[] = [];
  for (const key of maps.unitToKeys.get(unitId) ?? [])
    for (const rowKey of maps.keyToRowNodeKeys.get(key) ?? []) if (!out.includes(rowKey)) out.push(rowKey);
  return out;
}

/** CRL row click → the candidate SOURCE-BEARING units (a row is targetable by its own key or any refKey). */
export function unitsForRow(node: { nodeKey: string; refKeys: string[] }, maps: CrlRevealMaps): string[] {
  const out: string[] = [];
  for (const key of [node.nodeKey, ...node.refKeys])
    for (const unitId of maps.keyToUnitIds.get(key) ?? [])
      if (maps.sourceBearingUnits.has(unitId) && !out.includes(unitId)) out.push(unitId);
  return out;
}
