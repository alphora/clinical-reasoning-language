/**
 * Two-sense coverage derivation (provenance spec §4). Pure over a `ProvenanceArtifact` (T4.1) + the T4.3
 * `ProvenanceIndex` + the canonical anchor TEXT (the artifact carries only `anchorSource.textHash`, not the text):
 *  - Sense 1 — decision-implementation: `decisionImplemented` / Missed₁ (must-link-decision source items with no
 *    counted, policy-owned, decision-relation CRL link).
 *  - Sense 2 — source-acknowledgement: Missed₂ (anchor-text spans in neither a source `sourceRef` nor an `ignoredRange`,
 *    minus whitespace-only gaps — the complete default drop *because* §6 pre-strips page chrome from the anchor text).
 *  - Over-reach: policy-owned leaf / decision-sub-node in no counted cluster (one leg of §4's composite mis-tag invariant;
 *    the other legs — §9.2 structural + §9.1 MN-keyword — are the T4.5 validators).
 *
 * Authority: nodeKind/ownership come from the INDEX (§5-authoritative), resolved by `nodeKey`; only `status:"linked"`
 * refs count. A linked decision-relation ref that does NOT resolve in the index is surfaced (`unresolvedLinkedRefs`),
 * never silently read as "not implemented". Malformed offsets are surfaced (`malformedRanges`), never thrown.
 */
import type { ProvenanceArtifact, Cluster, Item } from "./artifact";
import { sliceUtf8Bytes } from "./canonicalize";
import type { IndexedCrlNode, ProvenanceIndex, ProvNodeRef } from "./indexer";
import { nodeKey } from "./indexer";

const DECISION_RELATIONS = new Set([
  "implements-criterion",
  "implements-determination",
  "recommends-disposition",
]);

export interface CoverageReport {
  /** Missed₁ — must-link-decision source item ids with no decisionImplemented. */
  missedDecisions: string[];
  /** Counted (linked) decision-relation refs (in ANY cluster) whose node is not in the index (stale / kind-mismatch) — surfaced, not swallowed. */
  unresolvedLinkedRefs: { cluster: string; ref: ProvNodeRef }[];
  /** Missed₂ — non-whitespace anchor-text spans covered by neither a source sourceRef nor an ignoredRange. */
  uncoveredSpans: { start: number; end: number; text: string }[];
  /** Source/ignored offsets that are out-of-range or off a UTF-8 boundary (surfaced rather than crashing the report). */
  malformedRanges: { start: number; end: number; reason: string }[];
  /** Policy-owned leaf / decision-sub-node in no counted cluster, not authored-suppressed. */
  overReach: IndexedCrlNode[];
}

const toRef = (r: { lib: string; kind: string; name: string; nodeId?: string }): ProvNodeRef => ({
  lib: r.lib,
  kind: r.kind,
  name: r.name,
  ...(r.nodeId !== undefined ? { nodeId: r.nodeId } : {}),
});

/** §4 sense-1: a COUNTED cluster containing the item with a linked, policy-owned, decision-relation CRL ref to a leaf/decision-node. */
export function decisionImplemented(
  item: Item,
  artifact: ProvenanceArtifact,
  index: ProvenanceIndex,
): boolean {
  for (const c of artifact.clusters) {
    if (!c.items.includes(item.id)) continue;
    for (const ref of c.crl) {
      if (ref.status !== "linked" || !DECISION_RELATIONS.has(ref.relation)) continue;
      const nk = index.nodeKindOf(ref);
      if ((nk === "leaf" || nk === "decision-node") && index.ownershipOf(ref) === "policy-owned")
        return true;
    }
  }
  return false;
}

/** A cluster carries an authored item (member) whose `supports` names that cluster (§2.3 / §4 over-reach suppression). */
function clusterAuthoredSupport(c: Cluster, itemsById: Map<string, Item>): boolean {
  return c.items.some((id) => {
    const it = itemsById.get(id);
    return it?.origin === "authored" && it.supports?.cluster === c.id;
  });
}

/** §4 over-reach: a policy-owned leaf / decision-SUB-node (not the bare decl) in no counted cluster, not authored-suppressed. */
export function isOverReach(
  node: IndexedCrlNode,
  artifact: ProvenanceArtifact,
  itemsById: Map<string, Item>,
): boolean {
  if (node.ownership !== "policy-owned") return false;
  const candidate =
    node.nodeKind === "leaf" ||
    (node.nodeKind === "decision-node" && node.ref.nodeId !== undefined);
  if (!candidate) return false; // bare whole-decision decl + inference/shared/terminology/parameter are not candidates
  const key = nodeKey(node.ref);
  for (const c of artifact.clusters) {
    for (const ref of c.crl) {
      if (nodeKey(toRef(ref)) !== key) continue;
      // escape (a) a linked ref, (c) an intentionally-unlinked ref, (b) authored-supports on a cluster containing it
      if (ref.status === "linked" || ref.status === "intentionally-unlinked") return false;
      if (clusterAuthoredSupport(c, itemsById)) return false;
    }
  }
  return true;
}

// ── Missed₂ range arithmetic (utf8-byte, half-open) ──

interface Range {
  start: number;
  end: number;
}

function mergeRanges(ranges: Range[]): Range[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Range[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const r = sorted[i];
    if (r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

function complement(merged: Range[], n: number): Range[] {
  const gaps: Range[] = [];
  let pos = 0;
  for (const r of merged) {
    if (r.start > pos) gaps.push({ start: pos, end: r.start });
    pos = Math.max(pos, r.end);
  }
  if (pos < n) gaps.push({ start: pos, end: n });
  return gaps;
}

export function deriveCoverage(
  artifact: ProvenanceArtifact,
  index: ProvenanceIndex,
  anchorText: string,
): CoverageReport {
  const itemsById = new Map(artifact.items.map((it) => [it.id, it]));

  // ── Sense 1: Missed₁ ──
  // (provisional/needs-relink links are "excluded-but-surfaced" per §4 — they're excluded here, automatically yielding
  //  Missed₁ for a provisional-only item; SURFACING them as such is the T4.5 linkRequirement validator's job.)
  const missedDecisions: string[] = [];
  for (const item of artifact.items) {
    if (item.origin !== "source") continue;
    if (
      item.linkRequirement === "must-link-decision" &&
      !decisionImplemented(item, artifact, index)
    ) {
      missedDecisions.push(item.id);
    }
  }

  // ── Unresolved linked decision-relation refs (ANY cluster, not just source-item clusters) — surfaced, deduped ──
  const unresolvedLinkedRefs: { cluster: string; ref: ProvNodeRef }[] = [];
  const seenUnresolved = new Set<string>();
  for (const c of artifact.clusters) {
    for (const ref of c.crl) {
      if (
        ref.status !== "linked" ||
        !DECISION_RELATIONS.has(ref.relation) ||
        index.nodeKindOf(ref) !== undefined
      )
        continue;
      const dk = c.id + " " + nodeKey(toRef(ref));
      if (seenUnresolved.has(dk)) continue;
      seenUnresolved.add(dk);
      unresolvedLinkedRefs.push({ cluster: c.id, ref: toRef(ref) });
    }
  }

  // ── Sense 2: Missed₂ (validate offsets → surface malformed; whitespace-only gaps dropped) ──
  const n = Buffer.byteLength(anchorText, "utf8");
  const malformedRanges: { start: number; end: number; reason: string }[] = [];
  const valid: Range[] = [];
  const addRange = (start: number, end: number, label: string): void => {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > n || start > end) {
      malformedRanges.push({
        start,
        end,
        reason: `${label}: out-of-range/invalid (text is ${n} bytes)`,
      });
      return;
    }
    try {
      sliceUtf8Bytes(anchorText, start, end); // throws on a non-boundary offset
    } catch {
      malformedRanges.push({ start, end, reason: `${label}: not on a UTF-8 character boundary` });
      return;
    }
    if (start === end) return; // zero-length range covers nothing; drop it (avoids splitting an adjacent uncovered span)
    valid.push({ start, end });
  };
  for (const item of artifact.items) {
    if (item.origin !== "source") continue;
    for (const r of item.sourceRefs ?? []) addRange(r.start, r.end, `sourceRef(${item.id})`);
  }
  for (const r of artifact.ignoredRanges) addRange(r.start, r.end, "ignoredRange");

  const uncoveredSpans: { start: number; end: number; text: string }[] = [];
  for (const g of complement(mergeRanges(valid), n)) {
    const text = sliceUtf8Bytes(anchorText, g.start, g.end); // gap endpoints are boundary-aligned (from validated ranges + 0/N)
    if (!/^\s*$/.test(text)) uncoveredSpans.push({ start: g.start, end: g.end, text });
  }

  // ── Over-reach ──
  const overReach: IndexedCrlNode[] = [];
  for (const node of index.nodes.values()) {
    if (isOverReach(node, artifact, itemsById)) overReach.push(node);
  }

  return { missedDecisions, unresolvedLinkedRefs, uncoveredSpans, malformedRanges, overReach };
}
