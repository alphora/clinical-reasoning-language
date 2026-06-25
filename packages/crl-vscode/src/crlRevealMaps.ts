// Cross-pane reveal maps (vscode-free, unit-tested) — three-pane viewer C2b-2 (#156).
// Bridges the correspondence model (source↔CRL units, keyed by the refs the artifact clusters cite — often concept/
// activity keys) to the CRL-structure rows (the decision tree). A row is reachable by ANY of its keys: its own decision
// sub-node nodeKey OR a refKey (the concept/activity/decision it references). Clusters are a COVER not a partition, so a
// key can belong to multiple units → all maps are multi-valued. Pure; the renderer stays simple (gemini's separation).
import {
  buildConceptContainment,
  type CorrespondenceModel,
  type CrlConceptNode,
  type CrlDecisionStructure,
  type CrlStructureNode,
} from "@smile-digital-health/crl";

interface RowMeta {
  nodeKey: string;
  nodeId: string; // "" for a decision root
  kind: string; // "when" | "otherwise" | "action" | "decision" (root)
  decision: string;
  lib: string;
  refKeys: string[]; // the leaf keys this row references (for reverse click resolution)
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
  /** unitId → the frozen caseIds it cites (deduped, UNFILTERED — a source-less unit can still own a case). */
  unitToCaseIds: Map<string, string[]>;
  /** frozen caseId → the units that cite it (deduped). */
  caseIdToUnits: Map<string, string[]>;
  // ── concept layer (#166 Slice 2) ──
  /** concept nodeKey → its node (the addressable concept inventory; first-wins on a duplicate lib/name decl). */
  conceptByKey: Map<string, CrlConceptNode>;
  /** concept key → its transitive CONTAINER concept keys (ancestors; resolves a sub-concept UP to the driving `when`). */
  containersOf: Map<string, string[]>;
  /** concept key → its transitive contained concept keys (descendants; resolves a `when` concept DOWN to sub-concepts). */
  containedBy: Map<string, string[]>;
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
  conceptLayer: CrlConceptNode[] = [],
): CrlRevealMaps {
  const unitToKeys = new Map<string, string[]>();
  const keyToUnitIds = new Map<string, string[]>();
  const sourceBearingUnits = new Set<string>();
  const unitToCaseIds = new Map<string, string[]>();
  const caseIdToUnits = new Map<string, string[]>();
  for (const u of correspondence.units) {
    // "source-bearing" = has a RESOLVED span (a displayRange) — the source pane only renders/cycles those, so a unit
    // with only malformed source refs can't be a CRL→source reveal target.
    if (u.source.some((s) => s.displayRange)) sourceBearingUnits.add(u.id);
    for (const c of u.crl) {
      if (c.unresolved) continue; // an unresolved cluster ref must not bridge by string equality → clean no-op
      push(unitToKeys, u.id, c.nodeKey);
      push(keyToUnitIds, c.nodeKey, u.id);
    }
    for (const cn of u.cel ?? []) {
      if (cn.unresolved) continue; // skip an unresolved cel ref (no anchorable frozen case)
      push(unitToCaseIds, u.id, cn.caseId);
      push(caseIdToUnits, cn.caseId, u.id);
    }
  }

  const keyToRowNodeKeys = new Map<string, string[]>();
  const nodeByKey = new Map<string, RowMeta>();
  for (const d of structure) {
    // a decision root is itself addressable (decl-level refs are legal)
    push(keyToRowNodeKeys, d.nodeKey, d.nodeKey);
    nodeByKey.set(d.nodeKey, { nodeKey: d.nodeKey, nodeId: "", kind: "decision", decision: d.decision, lib: d.lib, refKeys: [] });
    walk(d.children, (n) => {
      for (const key of [n.nodeKey, ...n.refKeys]) push(keyToRowNodeKeys, key, n.nodeKey);
      nodeByKey.set(n.nodeKey, { nodeKey: n.nodeKey, nodeId: n.nodeId, kind: n.kind, decision: n.decision, lib: n.lib, refKeys: n.refKeys });
    });
  }

  const conceptByKey = new Map<string, CrlConceptNode>();
  for (const c of conceptLayer) if (!conceptByKey.has(c.nodeKey)) conceptByKey.set(c.nodeKey, c); // first-wins on dup decl
  const { containersOf, containedBy } = buildConceptContainment(conceptLayer); // precomputed once (closures are pure)

  return {
    unitToKeys,
    keyToRowNodeKeys,
    keyToUnitIds,
    sourceBearingUnits,
    nodeByKey,
    unitToCaseIds,
    caseIdToUnits,
    conceptByKey,
    containersOf,
    containedBy,
  };
}

/** Source-unit reveal → the CEL caseIds to highlight (the unit's cited frozen cases). */
export function caseIdsForUnit(unitId: string, maps: CrlRevealMaps): string[] {
  return maps.unitToCaseIds.get(unitId) ?? [];
}

/** CRL-node reveal → the CEL caseIds to highlight: the node's units (UNFILTERED — a case may attach via a source-less
 *  unit) → their caseIds. (No branch-scoping: a case is coarser than a branch.) */
export function caseIdsForNode(nodeKey: string, maps: CrlRevealMaps): string[] {
  const meta = maps.nodeByKey.get(nodeKey);
  if (!meta) return [];
  const out: string[] = [];
  for (const key of [meta.nodeKey, ...meta.refKeys])
    for (const unitId of maps.keyToUnitIds.get(key) ?? [])
      for (const caseId of maps.unitToCaseIds.get(unitId) ?? []) if (!out.includes(caseId)) out.push(caseId);
  return out;
}

/** CEL-case reveal/click → the units citing it (all; the caller filters source-bearing for the source pane, or maps each
 *  to its CRL rows via rowNodeKeysForUnit for the crl pane). */
export function unitsForCase(caseId: string, maps: CrlRevealMaps): string[] {
  return maps.caseIdToUnits.get(caseId) ?? [];
}

/**
 * Fact-level peek (C2c-2): a key derived from a CEL fact's RESOLVED concept → its source units (source-bearing) / CRL
 * rows. (The key isn't on the fact; it's `nodeKey(...)` built from the fact's `defined by` concept target.) Deliberately
 * thin `Map.get` wrappers — NO branch-scoping (unlike `rowNodeKeysForUnit`/`unitsForRow`, whose heuristics are for
 * row/unit clicks and would wrongly narrow a concept peek). The concept key is a precise leaf identity; every row/unit
 * that references it corresponds. The CALLER gates clickability on the fact's resolved kind === "concept" first — these
 * key maps hold MIXED keys (decision roots, activities), so a key hit alone does not mean the fact is a concept.
 */
export function unitsForConcept(conceptKey: string, maps: CrlRevealMaps): string[] {
  return (maps.keyToUnitIds.get(conceptKey) ?? []).filter((u) => maps.sourceBearingUnits.has(u));
}

export function rowsForConcept(conceptKey: string, maps: CrlRevealMaps): string[] {
  return maps.keyToRowNodeKeys.get(conceptKey) ?? [];
}

// ── concept-NODE correspondence (#166 Slice 2) — concepts are first-class addressable nodes; these resolve the
// "applicable concept(s) + decision(s)" both ways. Returns RAW (deduped) keys; the cockpit (Slice 3) unions with the
// direct-row path and applies branch-scoping ONCE. Concept-specific helpers gate on conceptByKey (non-concept → []).

/** A source unit → the concept NODES it cites (its keys that ARE inventoried concepts). The applicable concepts (direct). */
export function conceptNodesForUnit(unitId: string, maps: CrlRevealMaps): string[] {
  return (maps.unitToKeys.get(unitId) ?? []).filter((k) => maps.conceptByKey.has(k));
}

/** A concept node → the units citing it (raw; the caller filters source-bearing for the source pane). */
export function unitsForConceptNode(conceptKey: string, maps: CrlRevealMaps): string[] {
  return maps.keyToUnitIds.get(conceptKey) ?? [];
}

/** A concept → the decision ROW nodeKeys it drives: rows referencing it DIRECTLY (a `when`/guard) UNION rows referencing
 *  any concept that transitively CONTAINS it (the #166 nested-concept → driving-`when` resolution). Direct first, deduped.
 *  Returns RAW (un-scoped) rows — the cockpit (Slice 3) unions with the direct-unit path + applies branch-scoping ONCE.
 *  [] for a non-concept key. */
export function rowNodeKeysForConcept(conceptKey: string, maps: CrlRevealMaps): string[] {
  if (!maps.conceptByKey.has(conceptKey)) return [];
  const out: string[] = [];
  for (const k of [conceptKey, ...(maps.containersOf.get(conceptKey) ?? [])])
    for (const row of maps.keyToRowNodeKeys.get(k) ?? []) if (!out.includes(row)) out.push(row);
  return out;
}

/** A decision row → the concept NODES it surfaces: the concepts it references directly (its refKeys that are concepts)
 *  UNION their transitively-contained sub-concepts (the #166 `when` concept → its nested sub-concepts). Two passes (ALL
 *  direct first, then descendants) → stable direct-first order; deduped; descendants gated on conceptByKey (a closure may
 *  carry a dangling, non-inventoried key — see conceptContainment). */
export function conceptNodesForRow(rowNodeKey: string, maps: CrlRevealMaps): string[] {
  const meta = maps.nodeByKey.get(rowNodeKey);
  if (!meta) return [];
  const direct = meta.refKeys.filter((k) => maps.conceptByKey.has(k));
  const out: string[] = [];
  for (const k of direct) if (!out.includes(k)) out.push(k);
  for (const k of direct)
    for (const sub of maps.containedBy.get(k) ?? []) if (maps.conceptByKey.has(sub) && !out.includes(sub)) out.push(sub);
  return out;
}

/** Reverse fact-highlight (C2c-2b): the concept keys a SELECTED source unit cites — to look up the CEL fact spans that
 *  reference them. (All cited keys; non-concept keys simply miss the concept-keyed fact-anchor map → no over-highlight.) */
export function conceptKeysForUnit(unitId: string, maps: CrlRevealMaps): string[] {
  return maps.unitToKeys.get(unitId) ?? [];
}

/** Reverse fact-highlight (C2c-2b): the keys a SELECTED CRL row references (its own nodeKey + refKeys — concepts it
 *  branches on / guards on / its target). Same set `caseIdsForNode` uses; non-concept keys miss the fact-anchor map. */
export function conceptKeysForNode(nodeKey: string, maps: CrlRevealMaps): string[] {
  const meta = maps.nodeByKey.get(nodeKey);
  return meta ? [meta.nodeKey, ...meta.refKeys] : [];
}

/**
 * Source-unit reveal → the CRL row nodeKeys to highlight, CONTEXT-SCOPED. A unit cites a set of leaf keys; a shared leaf
 * (e.g. an activity `Approve` recommended in several branches) would otherwise light up EVERY branch's action. So when the
 * unit also matches a branch condition (a `when`/`otherwise` row), keep only the action rows UNDER a matched branch —
 * collapsing out-of-context matches (disc 117). With no branch context (the unit cites only actions), fall back to all.
 */
/** Branch-scope a RAW matched-row set (disc 117): keep branches + decision roots always; keep an action only when one of
 *  the matched branches is its ancestor; with NO branch context, return the raw set as-is (best effort). The input is the
 *  un-scoped `matched` set — each caller builds its own (rowNodeKeysForUnit: direct; rowNodeKeysForUnitWithConcepts:
 *  direct + concept containment) and the scope is applied ONCE over the merged set. References only `matched` + `maps`. */
function scopeRows(matched: Set<string>, maps: CrlRevealMaps): string[] {
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

export function rowNodeKeysForUnit(unitId: string, maps: CrlRevealMaps): string[] {
  const matched = new Set<string>();
  for (const key of maps.unitToKeys.get(unitId) ?? [])
    for (const rowKey of maps.keyToRowNodeKeys.get(key) ?? []) matched.add(rowKey);
  return scopeRows(matched, maps);
}

/** #166 Slice 3b — a source unit → the CRL decision rows it drives, DIRECT *and* via concept containment, branch-scoped
 *  ONCE. A non-concept key (an activity) resolves to its rows directly; a concept key goes through rowNodeKeysForConcept
 *  (its own rows + the nested → driving-`when` containment). Both seed ONE `matched` set scoped once — so a containment-
 *  added `when` becomes branch context and a shared action is NOT re-introduced across branches (the Slice-2 guard case).
 *  Used for the unit→crl HIGHLIGHT only; the engine SELECTION stays direct (rowNodeKeysForUnit) so it round-trips. */
export function rowNodeKeysForUnitWithConcepts(unitId: string, maps: CrlRevealMaps): string[] {
  const matched = new Set<string>();
  for (const key of maps.unitToKeys.get(unitId) ?? []) {
    if (maps.conceptByKey.has(key)) {
      for (const row of rowNodeKeysForConcept(key, maps)) matched.add(row); // concept: direct + containment
    } else {
      for (const row of maps.keyToRowNodeKeys.get(key) ?? []) matched.add(row); // non-concept (activity): direct
    }
  }
  return scopeRows(matched, maps);
}

/** #166 Slice 3b — the CRL anchors a concept PEEK highlights: the concept's OWN row + the decision rows it drives (direct
 *  rowsForConcept ∪ containment rowNodeKeysForConcept). The direct rowsForConcept term keeps a concept that HAS a CRL row
 *  but is NOT an inventoried concept-layer node (∉ conceptByKey ⇒ rowNodeKeysForConcept → []) still highlighting its rows.
 *  Shared by the CEL fact peek (peekConcept) AND the CRL concept-row peek (peekConceptNode) so the two can't drift. */
export function conceptCrlAnchors(conceptKey: string, maps: CrlRevealMaps): string[] {
  const out = [conceptKey];
  for (const row of rowsForConcept(conceptKey, maps)) if (!out.includes(row)) out.push(row);
  for (const row of rowNodeKeysForConcept(conceptKey, maps)) if (!out.includes(row)) out.push(row);
  return out;
}

/**
 * CRL row click → candidate SOURCE-BEARING units, branch-scoped. A row is targetable by its own key or any refKey; a
 * shared activity key would otherwise return units from EVERY branch. So when >1 unit matches, prefer those whose own
 * branch condition (a when/otherwise they cite) is in the CLICKED row's branch — the symmetric counterpart to
 * rowNodeKeysForUnit. Falls back to all matches when scoping finds none (genuine ambiguity → the caller quick-picks).
 */
export function unitsForRow(nodeKey: string, maps: CrlRevealMaps): string[] {
  return rowUnits(nodeKey, maps, true);
}

/**
 * The at-rest KEY counterpart (#163): the units a CRL row corresponds to, branch-scoped EXACTLY like `unitsForRow` but
 * WITHOUT the source-bearing filter — a unit with no source span still has a number to display on the row. Same fallback
 * (no in-branch match → all matched units, so a genuinely-ambiguous shared row over-numbers rather than under-numbers).
 */
export function unitsForRowAll(nodeKey: string, maps: CrlRevealMaps): string[] {
  return rowUnits(nodeKey, maps, false);
}

/** Shared core for unitsForRow / unitsForRowAll. The source-bearing predicate is fused into raw collection (so the
 *  `raw.length <= 1` early-out is computed on the right set), then branch-scoping prefers in-branch units. */
function rowUnits(nodeKey: string, maps: CrlRevealMaps, requireSourceBearing: boolean): string[] {
  const meta = maps.nodeByKey.get(nodeKey);
  if (!meta) return [];
  const raw: string[] = [];
  for (const key of [meta.nodeKey, ...meta.refKeys])
    for (const unitId of maps.keyToUnitIds.get(key) ?? [])
      if ((!requireSourceBearing || maps.sourceBearingUnits.has(unitId)) && !raw.includes(unitId)) raw.push(unitId);
  if (raw.length <= 1) return raw;

  const inBranch = raw.filter((unitId) =>
    (maps.unitToKeys.get(unitId) ?? []).some((k) =>
      (maps.keyToRowNodeKeys.get(k) ?? []).some((rowKey) => {
        const r = maps.nodeByKey.get(rowKey);
        return (
          r !== undefined &&
          (r.kind === "when" || r.kind === "otherwise") &&
          r.decision === meta.decision &&
          r.lib === meta.lib &&
          isUnder(r.nodeId, meta.nodeId)
        );
      }),
    ),
  );
  return inBranch.length >= 1 ? inBranch : raw;
}

/** At-rest key (#163): a CRL row → its corresponding units' NUMBERS (branch-scoped via unitsForRowAll), filtered to
 *  numbered units (a CRL ref with no renderable locus isn't in `unitNumber`), sorted ascending + deduped. */
export function unitNumbersForRow(nodeKey: string, maps: CrlRevealMaps, unitNumber: Map<string, number>): number[] {
  return toSortedNumbers(unitsForRowAll(nodeKey, maps), unitNumber);
}

/** At-rest key (#163): a CEL case → its units' NUMBERS (unscoped — a case is coarser than a branch), sorted + deduped. */
export function unitNumbersForCase(caseId: string, maps: CrlRevealMaps, unitNumber: Map<string, number>): number[] {
  return toSortedNumbers(unitsForCase(caseId, maps), unitNumber);
}

function toSortedNumbers(unitIds: string[], unitNumber: Map<string, number>): number[] {
  const nums = new Set<number>();
  for (const u of unitIds) {
    const n = unitNumber.get(u);
    if (n !== undefined) nums.add(n);
  }
  return [...nums].sort((a, b) => a - b);
}
