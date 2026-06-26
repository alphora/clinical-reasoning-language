// Three-pane synced viewer CORE (vscode-free, unit-tested) — roadmap #156, C1.
// buildViewerModel projects the T1 CorrespondenceModel into the data a three-pane synced viewer renders: ordered CYCLE
// STEPS (per unit: source spans, primary+secondary CRL viewport loci, CEL loci, unresolved side-reasons, findingIds)
// and a deduped MARKS overlay (the coverage map). No vscode types — serves the native shell (C2) + a future bespoke shell.
// Design authority + 2-round design-review log: .vibe-tools/discussions/114-viewer-model.md.
import type { AnchorSourceMeta, CorrespondenceModel } from "@smile-digital-health/crl";
import type { ZeroBasedRange } from "@smile-digital-health/crl/language-services";

export interface Loc {
  filePath: string;
  range: ZeroBasedRange;
}
export type MarkKind = "covered" | "orphan" | "uncovered" | "ignored";
export type RenderHint = "range" | "point";
export interface Mark {
  filePath: string;
  range: ZeroBasedRange;
  kind: MarkKind;
  /** stable dedup identity per pane: source/cel by file+range, CRL by nodeKey (point-anchors collide on range). */
  key: string;
  renderHint: RenderHint;
}
export interface UnresolvedRef {
  /** locus identity: source `itemId@start-end`, crl `nodeKey`, cel `file::caseId`. */
  ref?: string;
  reason: string;
}
export interface CycleStep {
  unitId: string;
  label: string;
  source: Loc[];
  primaryCrl?: Loc;
  secondaryCrl: Loc[];
  cel: Loc[];
  unresolved: { source: UnresolvedRef[]; crl: UnresolvedRef[]; cel: UnresolvedRef[] };
  findingIds: string[];
}
export interface ViewerModel {
  anchor: { filePath: string; text: string; meta: AnchorSourceMeta };
  policyId: string;
  policyVersion: string;
  steps: CycleStep[];
  marks: { source: Mark[]; crl: Mark[]; cel: Mark[] };
}

type Unit = CorrespondenceModel["units"][number];

const rangeKey = (r: ZeroBasedRange): string => `${r.startLine}:${r.startCol}:${r.endLine}:${r.endCol}`;
const cmpRange = (a: ZeroBasedRange, b: ZeroBasedRange): number =>
  a.startLine - b.startLine || a.startCol - b.startCol || a.endLine - b.endLine || a.endCol - b.endCol;
// Raw code-unit comparison — deterministic across runtimes (NOT localeCompare, which is ICU/locale-sensitive).
const cmpString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const resolvedSource = (u: Unit) => u.source.filter((s) => s.displayRange);
const resolvedCrl = (u: Unit) => u.crl.filter((c) => c.location);
const resolvedCel = (u: Unit) => u.cel.filter((c) => c.location);
/** primary CRL viewport = the first resolved decision-reached node, else the first resolved node in artifact order. */
const primaryCrlNode = (u: Unit) => {
  const r = resolvedCrl(u);
  return r.find((c) => c.decisionReached) ?? r[0];
};

/** group by `key` per pane; emit one mark per key, keeping the highest-precedence kind. */
function dedup(marks: Mark[], precedence: Partial<Record<MarkKind, number>>): Mark[] {
  const byKey = new Map<string, Mark>();
  for (const m of marks) {
    const cur = byKey.get(m.key);
    if (!cur || (precedence[m.kind] ?? 0) > (precedence[cur.kind] ?? 0)) byKey.set(m.key, m);
  }
  return [...byKey.values()];
}
const SOURCE_PREC: Partial<Record<MarkKind, number>> = { uncovered: 3, ignored: 2, covered: 1 };
const CRL_PREC: Partial<Record<MarkKind, number>> = { orphan: 2, covered: 1 };
const CEL_PREC: Partial<Record<MarkKind, number>> = { covered: 1 };

export function buildViewerModel(model: CorrespondenceModel): ViewerModel {
  const af = model.anchor.filePath;
  const units = model.units;
  const idx = new Map(units.map((u, i) => [u.id, i]));

  // ── steps: units with ≥1 resolved locus; all-unresolved units are excluded (the findings-panel owns them) ──
  const stepUnits = units.filter(
    (u) => resolvedSource(u).length > 0 || resolvedCrl(u).length > 0 || resolvedCel(u).length > 0,
  );

  // ── ordering: SEGREGATE — source-positioned units first (by primary source displayRange), then source-less units
  //    (by primary CRL loc filePath+range, then CEL); final total tiebreak = artifact cluster index ──
  // primary source position = the MIN display range among a unit's resolved spans (true top-to-bottom narrative order,
  // not first-authored — a unit's sourceRefs aren't guaranteed to be in document order).
  const primarySource = (u: Unit): ZeroBasedRange | undefined => {
    const rs = resolvedSource(u);
    if (rs.length === 0) return undefined;
    return rs.reduce((min, s) => (cmpRange(s.displayRange!, min) < 0 ? s.displayRange! : min), rs[0].displayRange!);
  };
  const sorted = [...stepUnits].sort((a, b) => {
    const sa = primarySource(a);
    const sb = primarySource(b);
    if (sa && sb) return cmpRange(sa, sb) || idx.get(a.id)! - idx.get(b.id)!;
    if (sa) return -1;
    if (sb) return 1;
    const ca = primaryCrlNode(a)?.location;
    const cb = primaryCrlNode(b)?.location;
    if (ca && cb) {
      const f = cmpString(ca.filePath, cb.filePath);
      if (f) return f;
      const r = cmpRange(ca.range, cb.range);
      if (r) return r;
    } else if (ca) return -1;
    else if (cb) return 1;
    const la = resolvedCel(a)[0]?.location;
    const lb = resolvedCel(b)[0]?.location;
    if (la && lb) {
      const f = cmpString(la.filePath, lb.filePath);
      if (f) return f;
      const r = cmpRange(la.range, lb.range);
      if (r) return r;
    }
    return idx.get(a.id)! - idx.get(b.id)!;
  });

  const steps: CycleStep[] = sorted.map((u) => {
    const rcrl = resolvedCrl(u);
    const primary = primaryCrlNode(u); // same selection the sorter uses — no drift
    const secondary = rcrl.filter((c) => c !== primary);
    return {
      unitId: u.id,
      label: u.label,
      source: resolvedSource(u).map((s) => ({ filePath: af, range: s.displayRange! })),
      primaryCrl: primary?.location ? { filePath: primary.location.filePath, range: primary.location.range } : undefined,
      secondaryCrl: secondary.map((c) => ({ filePath: c.location!.filePath, range: c.location!.range })),
      cel: resolvedCel(u).map((c) => ({ filePath: c.location!.filePath, range: c.location!.range })),
      unresolved: {
        source: u.source
          .filter((s) => s.unresolved !== undefined)
          .map((s) => ({ ref: `${s.itemId}@${s.byteRange.start}-${s.byteRange.end}`, reason: s.unresolved! })),
        crl: u.crl
          .filter((c) => c.unresolved !== undefined)
          .map((c) => ({ ref: c.nodeKey, reason: c.unresolved! })),
        cel: u.cel
          .filter((c) => c.unresolved !== undefined)
          .map((c) => ({ ref: `${c.file}::${c.caseId}`, reason: c.unresolved! })),
      },
      findingIds: u.findingIds,
    };
  });

  // ── marks (the always-on overlay) ──
  const sourceRaw: Mark[] = [];
  for (const u of units)
    for (const s of u.source)
      if (s.displayRange)
        sourceRaw.push({ filePath: af, range: s.displayRange, kind: "covered", key: `${af}:${rangeKey(s.displayRange)}`, renderHint: "range" });
  for (const g of model.ignoredSourceRanges)
    if (g.displayRange)
      sourceRaw.push({ filePath: af, range: g.displayRange, kind: "ignored", key: `${af}:${rangeKey(g.displayRange)}`, renderHint: "range" });
  // uncovered: gate on the finding KIND first, then its resolved source target (skip malformed — no displayRange).
  // DELIBERATELY untinted by validation mode: even in worklist mode (where uncovered-span re-grades to "warning" in the
  // findings panel) the SOURCE pane keeps the spatial "uncovered" overlay as the worklist indicator — it shows WHERE the
  // remaining attribution work is, which is exactly what an in-progress KE wants. (Scope-narrow per the panel-worklist slice.)
  for (const f of model.findings)
    if (f.finding.kind === "uncovered-span")
      for (const t of f.targets)
        if (t.pane === "source" && t.resolution === "resolved" && t.displayRange)
          sourceRaw.push({ filePath: af, range: t.displayRange, kind: "uncovered", key: `${af}:${rangeKey(t.displayRange)}`, renderHint: "range" });

  const crlRaw: Mark[] = [];
  for (const u of units)
    for (const c of u.crl)
      if (c.location)
        crlRaw.push({ filePath: c.location.filePath, range: c.location.range, kind: "covered", key: c.nodeKey, renderHint: "point" });
  for (const n of model.overReachNodes)
    if (n.location)
      crlRaw.push({ filePath: n.location.filePath, range: n.location.range, kind: "orphan", key: n.nodeKey, renderHint: "point" });

  const celRaw: Mark[] = [];
  for (const u of units)
    for (const c of u.cel)
      if (c.location)
        celRaw.push({ filePath: c.location.filePath, range: c.location.range, kind: "covered", key: `${c.file}::${c.caseId}`, renderHint: "range" });

  return {
    anchor: { filePath: af, text: model.anchor.text, meta: model.anchor.meta },
    policyId: model.policyId,
    policyVersion: model.policyVersion,
    steps,
    marks: {
      source: dedup(sourceRaw, SOURCE_PREC),
      crl: dedup(crlRaw, CRL_PREC),
      cel: dedup(celRaw, CEL_PREC),
    },
  };
}
