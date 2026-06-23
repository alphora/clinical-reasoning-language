/**
 * Correspondence view-model (validation cockpit, slice 1 / T1) — the headless source↔CRL↔CEL graph the UI surfaces run
 * on. `buildCorrespondenceModel(artifact, .cel, anchor)` resolves the provenance artifact into per-cluster UNITS (source
 * spans ⊕ CRL nodes ⊕ CEL cases) with every §9 finding LOCATED across the panes, plus CRL over-reach, author-declared
 * ignored ranges, and a rollup. Designed complete for the three-pane viewer (C); the findings-panel (B) consumes a subset.
 *
 * Design authority + round-1/2 review log: .vibe-tools/discussions/111-correspondence-view-model.md.
 *
 * Invariants that fell out of review:
 *  - A validation cockpit MUST render an invalid/partial artifact — span resolution is DEFENSIVE (malformed offset →
 *    `unresolved`, never a throw), a CEL parse failure still yields artifact-renderable units, and only a genuinely
 *    unusable graph (no policy anchor) yields empty units.
 *  - Refs that resolve from the index are `ProvNodeRef` (over-reach nodes have no authoring `CrlNodeRef`); the rich
 *    cluster ref rides along as `authoringRef` when present.
 *  - No pre-built reverse-index — the contract guarantees STABLE KEYS (CRL `nodeKey`, CEL `file`+`caseId`, source
 *    `itemId`) so C can build its own membership without inventing equality.
 */
import { createHash } from "node:crypto";
import { basename } from "node:path";

import type { CELCase } from "../cel/ast/types";
import {
  toZeroBasedRange,
  type LsLocation,
  type ZeroBasedRange,
} from "../language-services/contracts";

import type {
  AdministrativeSubtype,
  AnchorSourceMeta,
  AuthoredKind,
  CelNodeRef,
  CrlNodeRef,
  DispositionClass,
  DrivesDeterminationEdge,
  LinkRequirement,
  NodeKind,
  Origin,
  Ownership,
  Role,
  RoleStatus,
  SupportsRef,
} from "./artifact";
import { byteRangeToDisplayRange, sliceUtf8Bytes } from "./canonicalize";
import { nodeKey, type ProvNodeRef } from "./indexer";
import { resolveProvenance } from "./validateFiles";
import type { ProvenanceFinding } from "./validators";

// ── contract ───────────────────────────────────────────────────────────────

export interface ByteRange {
  start: number;
  end: number;
}

export interface CorrespondenceModel {
  policyId: string;
  policyVersion: string;
  artifactPath: string;
  celPath: string;
  /** LEFT-pane source + document identity (the artifact's recorded anchorSource meta, for drift display). */
  anchor: { filePath: string; text: string; meta: AnchorSourceMeta };
  /** one per cluster — the unison-cycle elements. */
  units: CorrespondenceUnit[];
  /** §4 over-reach (CRL-only, validator-faithful); NOT "any node in no unit". */
  overReachNodes: ResolvedCrlNode[];
  /** author-declared ignored spans (no finding-stream equivalent → carried for the LEFT pane). `unresolved` when the offsets are malformed. */
  ignoredSourceRanges: {
    byteRange: ByteRange;
    displayRange?: ZeroBasedRange;
    reason: string;
    unresolved?: string;
  }[];
  findings: AttachedFinding[];
  rollup: Rollup;
  /** unified: artifact | cel-parse | cel-import | provenance-index. */
  diagnostics: CorrespondenceDiagnostic[];
}

export interface CorrespondenceUnit {
  id: string;
  label: string;
  /** full non-spatial Item context (authored items have no source span). */
  items: ResolvedItem[];
  source: ResolvedSourceSpan[];
  crl: ResolvedCrlNode[];
  cel: ResolvedCelNode[];
  /** STABLE ids into model.findings attached to this unit (deduped). */
  findingIds: string[];
}

export interface ResolvedItem {
  id: string;
  origin: Origin;
  text: string;
  role?: Role;
  roleStatus?: RoleStatus;
  linkRequirement?: LinkRequirement;
  rationale?: string;
  dispositionClass?: DispositionClass;
  administrativeSubtype?: AdministrativeSubtype;
  operationalConsequence?: string;
  drivesDetermination?: DrivesDeterminationEdge[];
  authoredKind?: AuthoredKind;
  supports?: SupportsRef;
}

export interface ResolvedSourceSpan {
  itemId: string;
  byteRange: ByteRange;
  displayRange?: ZeroBasedRange;
  text?: string;
  /** present (and displayRange/text absent) when the byte offsets are malformed — the model still builds. */
  unresolved?: string;
}

export interface ResolvedCrlNode {
  ref: ProvNodeRef;
  /** the rich cluster ref, when the node came from a cluster (over-reach nodes have none). */
  authoringRef?: CrlNodeRef;
  nodeKey: string;
  location?: LsLocation;
  unresolved?: string;
  nodeKind?: NodeKind;
  ownership?: Ownership;
  decisionReached: boolean;
}

export interface ResolvedCelNode {
  ref: CelNodeRef;
  /** normalized to the absolute path (graph.filePath). */
  file: string;
  caseId: string;
  explicitCaseId: boolean;
  location?: LsLocation;
  unresolved?: string;
}

export interface AttachedFinding {
  id: string;
  finding: ProvenanceFinding;
  /** every navigable locus across panes; never empty (locus-less findings get a pane:"anchor" target). */
  targets: FindingTarget[];
}

export interface FindingTarget {
  pane: "source" | "crl" | "cel" | "anchor";
  resolution: "resolved" | "unresolved" | "malformed";
  location?: LsLocation; // crl/cel
  displayRange?: ZeroBasedRange; // source
  byteRange?: ByteRange; // source (present even when displayRange fails)
  itemId?: string;
  ref?: ProvNodeRef;
  unitId?: string;
  reason?: string;
}

export interface Rollup {
  mustLinkDecisionsTotal: number;
  mustLinkDecisionsImplemented: number;
  errorCount: number;
  manualReviewCount: number;
  warningCount: number;
  pass: boolean;
  /** derived — symmetric over ALL finding kinds (the cockpit headline). */
  findingCountsByKind: Record<string, number>;
}

export interface CorrespondenceDiagnostic {
  source: "artifact" | "cel-parse" | "cel-import" | "provenance-index";
  kind: string;
  message: string;
  severity?: "error" | "warning";
  filePath?: string;
  range?: ZeroBasedRange;
  details?: unknown;
}

// ── builder ──────────────────────────────────────────────────────────────────

/** {line,col} (already 0-based, from byteRangeToDisplayRange) → ZeroBasedRange. Pure rename: NO line shift, NO widening. */
const toZbr = (dr: {
  start: { line: number; col: number };
  end: { line: number; col: number };
}): ZeroBasedRange => ({
  startLine: dr.start.line,
  startCol: dr.start.col,
  endLine: dr.end.line,
  endCol: dr.end.col,
});

const toRef = (r: { lib: string; kind: string; name: string; nodeId?: string }): ProvNodeRef => ({
  lib: r.lib,
  kind: r.kind,
  name: r.name,
  ...(r.nodeId !== undefined ? { nodeId: r.nodeId } : {}),
});

export function buildCorrespondenceModel(
  artifactPath: string,
  celPath: string,
  anchorPath: string,
): CorrespondenceModel {
  const r = resolveProvenance(artifactPath, celPath, anchorPath);
  const { artifact, anchor, graph, index, coverage, findings } = r;

  const itemsById = new Map(artifact.items.map((it) => [it.id, it]));

  // ── resolvers ──
  const resolveSpan = (itemId: string, br: ByteRange): ResolvedSourceSpan => {
    try {
      return {
        itemId,
        byteRange: br,
        displayRange: toZbr(byteRangeToDisplayRange(anchor.text, br)),
        text: sliceUtf8Bytes(anchor.text, br.start, br.end),
      };
    } catch (e) {
      return { itemId, byteRange: br, unresolved: e instanceof Error ? e.message : String(e) };
    }
  };

  const resolveCrl = (pref: ProvNodeRef, authoringRef?: CrlNodeRef): ResolvedCrlNode => {
    const res = index.resolveCrlNodeRef(pref);
    const unresolved = "unresolved" in res ? res.reason : undefined;
    return {
      ref: pref,
      ...(authoringRef ? { authoringRef } : {}),
      nodeKey: nodeKey(pref),
      ...(unresolved ? { unresolved } : { location: res as LsLocation }),
      nodeKind: index.nodeKindOf(pref),
      ownership: index.ownershipOf(pref),
      decisionReached: index.isDecisionReached(pref),
    };
  };

  // CEL: resolve against the FROZEN-id set (effective ordinals are provisional and must not be matched). file → abs.
  // T1 assumes ONE policy `.cel` (graph.cel) — there is no CEL→CEL import closure, so CelNodeRef.file denotes this file
  // and is normalized to graph.filePath. Revisit if multi-file CEL is ever introduced.
  const frozenCases = new Map<string, CELCase>();
  for (const s of graph.cel?.statements ?? []) {
    if (s.type === "CELCase" && s.caseId !== undefined) frozenCases.set(s.caseId, s);
  }
  const effectiveCaseIds = r.celCaseIds.get(graph.filePath) ?? new Set<string>();
  const resolveCel = (ref: CelNodeRef): ResolvedCelNode => {
    const c = frozenCases.get(ref.caseId);
    const base = { ref, file: graph.filePath, caseId: ref.caseId, explicitCaseId: c !== undefined };
    if (!c)
      return {
        ...base,
        unresolved: effectiveCaseIds.has(ref.caseId)
          ? `CEL case "${ref.caseId}" exists but is not frozen (no \`- id is\`) in ${basename(graph.filePath)}`
          : `no CEL case with id "${ref.caseId}" in ${basename(graph.filePath)}`,
      };
    return { ...base, location: { filePath: graph.filePath, range: toZeroBasedRange(c.location) } };
  };

  const resolveItem = (id: string): ResolvedItem | undefined => {
    const it = itemsById.get(id);
    if (!it) return undefined;
    return {
      id: it.id,
      origin: it.origin,
      text: it.text,
      role: it.role,
      roleStatus: it.roleStatus,
      linkRequirement: it.linkRequirement,
      rationale: it.rationale,
      dispositionClass: it.dispositionClass,
      administrativeSubtype: it.administrativeSubtype,
      operationalConsequence: it.operationalConsequence,
      drivesDetermination: it.drivesDetermination,
      authoredKind: it.authoredKind,
      supports: it.supports,
    };
  };

  // ── units ──
  const units: CorrespondenceUnit[] = artifact.clusters.map((cl) => {
    const items = cl.items.map(resolveItem).filter((x): x is ResolvedItem => x !== undefined);
    const source: ResolvedSourceSpan[] = [];
    for (const id of cl.items) {
      for (const sr of itemsById.get(id)?.sourceRefs ?? []) source.push(resolveSpan(id, sr));
    }
    return {
      id: cl.id,
      label: cl.label,
      items,
      source,
      crl: cl.crl.map((c) => resolveCrl(toRef(c), c)),
      cel: cl.cel.map(resolveCel),
      findingIds: [] as string[],
    };
  });
  const unitById = new Map(units.map((u) => [u.id, u]));
  const unitsByItem = new Map<string, CorrespondenceUnit[]>();
  for (const cl of artifact.clusters) {
    const u = unitById.get(cl.id);
    if (!u) continue;
    for (const id of cl.items) {
      const arr = unitsByItem.get(id) ?? [];
      arr.push(u);
      unitsByItem.set(id, arr);
    }
  }

  // ── over-reach (CRL-only; coverage.overReach is IndexedCrlNode[] whose .ref is ProvNodeRef) ──
  const overReachNodes = coverage.overReach.map((n) => resolveCrl(n.ref));

  // ── ignored ranges ──
  const ignoredSourceRanges = artifact.ignoredRanges.map((g) => {
    const byteRange = { start: g.start, end: g.end };
    try {
      return {
        byteRange,
        displayRange: toZbr(byteRangeToDisplayRange(anchor.text, g)),
        reason: g.reason,
      };
    } catch (e) {
      return {
        byteRange,
        reason: g.reason,
        unresolved: e instanceof Error ? e.message : String(e),
      };
    }
  });

  // ── findings → attached ──
  // id = kind + hash(locus) + per-locus occurrence ordinal. LOCUS-based (not the global array index), so the id is stable
  // across rebuilds of the same inputs; the occurrence suffix disambiguates two findings with an identical locus (e.g. two
  // cel-unresolved on one cluster — the finding carries no caseId). NOT a persistence key across validator-version changes.
  const locusOccurrence = new Map<string, number>();
  const fid = (f: ProvenanceFinding): string => {
    const locus = JSON.stringify([
      f.kind,
      f.itemId ?? null,
      f.cluster ?? null,
      f.ref ?? null,
      f.range ?? null,
    ]);
    const occ = locusOccurrence.get(locus) ?? 0;
    locusOccurrence.set(locus, occ + 1);
    const hash = createHash("sha1").update(locus).digest("hex").slice(0, 10);
    return `${f.kind}:${hash}${occ ? `:${occ}` : ""}`;
  };

  const addFindingToUnit = (u: CorrespondenceUnit, id: string): void => {
    if (!u.findingIds.includes(id)) u.findingIds.push(id);
  };

  const attached: AttachedFinding[] = findings.map((f) => {
    const id = fid(f);
    const targets: FindingTarget[] = [];

    // source via itemId → that item's source spans (PLURAL)
    if (f.itemId) {
      for (const sr of itemsById.get(f.itemId)?.sourceRefs ?? []) {
        const sp = resolveSpan(f.itemId, sr);
        targets.push({
          pane: "source",
          resolution: sp.unresolved ? "malformed" : "resolved",
          ...(sp.displayRange ? { displayRange: sp.displayRange } : {}),
          byteRange: sp.byteRange,
          itemId: f.itemId,
          ...(sp.unresolved ? { reason: sp.unresolved } : {}),
        });
      }
      for (const u of unitsByItem.get(f.itemId) ?? []) addFindingToUnit(u, id);
    }

    // source via range (span-based kinds: uncovered-span, malformed-range)
    if (f.range) {
      try {
        targets.push({
          pane: "source",
          resolution: "resolved",
          displayRange: toZbr(byteRangeToDisplayRange(anchor.text, f.range)),
          byteRange: f.range,
        });
      } catch (e) {
        targets.push({
          pane: "source",
          resolution: "malformed",
          byteRange: f.range,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // crl via ref
    if (f.ref) {
      const res = index.resolveCrlNodeRef(f.ref);
      if ("unresolved" in res)
        targets.push({ pane: "crl", resolution: "unresolved", ref: f.ref, reason: res.reason });
      else targets.push({ pane: "crl", resolution: "resolved", location: res, ref: f.ref });
    }

    // cluster → unit; for CEL-keyed findings, point at the SPECIFIC unresolved case(s), not every CEL mark
    if (f.cluster) {
      const u = unitById.get(f.cluster);
      if (u) {
        addFindingToUnit(u, id);
        if (f.kind === "cel-unresolved" || f.kind === "provenance-references-unfrozen-case") {
          // Target ONLY the unresolved case(s) — never fall back to lighting up every CEL mark (the finding fires
          // BECAUSE a ref didn't resolve, so the builder's frozen-set resolution agrees there's ≥1 unresolved mark).
          for (const c of u.cel.filter((c) => c.unresolved))
            targets.push({
              pane: "cel",
              resolution: "unresolved",
              ...(c.location ? { location: c.location } : {}),
              unitId: u.id,
              reason: c.unresolved,
            });
        }
      }
    }

    // locus-less (e.g. anchor-hash-drift) → never vanish; point at the anchor doc identity
    if (targets.length === 0)
      targets.push({
        pane: "anchor",
        resolution: "resolved",
        reason: `anchor source: ${anchor.filePath}`,
      });

    return { id, finding: f, targets };
  });

  // ── rollup ──
  const mustLink = artifact.items.filter((it) => it.linkRequirement === "must-link-decision");
  const missed = new Set(coverage.missedDecisions);
  const rollup: Rollup = {
    mustLinkDecisionsTotal: mustLink.length,
    mustLinkDecisionsImplemented: mustLink.filter((it) => !missed.has(it.id)).length,
    errorCount: r.errorCount,
    manualReviewCount: r.manualReviewCount,
    warningCount: r.warningCount,
    pass: r.pass,
    findingCountsByKind: findings.reduce<Record<string, number>>((m, f) => {
      m[f.kind] = (m[f.kind] ?? 0) + 1;
      return m;
    }, {}),
  };

  // ── diagnostics (unified) ──
  const diagnostics: CorrespondenceDiagnostic[] = [];
  for (const d of index.diagnostics)
    diagnostics.push({ source: "provenance-index", kind: d.kind, message: d.message });
  for (const e of graph.celParseErrors)
    diagnostics.push({
      source: "cel-parse",
      kind: e.kind ?? e.type,
      message: e.message,
      severity: "error",
      filePath: graph.filePath,
      ...(e.line !== undefined
        ? {
            range: toZeroBasedRange({
              start: { line: e.line, column: e.column ?? 0 },
              end: { line: e.line, column: e.column ?? 0 },
            }),
          }
        : {}),
      details: e,
    });
  for (const d of graph.diagnostics) {
    // CelImportDiagnostic is a discriminated union with NO uniform `message` field — build a readable one per kind + carry filePath.
    let message: string;
    let filePath: string | undefined;
    switch (d.kind) {
      case "project-root-not-found":
        message = `No project root (package.json) found upward from ${d.fromPath}`;
        filePath = d.fromPath;
        break;
      case "unresolved-covers":
        message = `Unresolved \`covers "${d.coversName}"\` in ${basename(d.filePath)}`;
        filePath = d.filePath;
        break;
      case "covers-missing-but-cases-present":
        message = `CEL has cases but no \`covers\` declaration (${basename(d.filePath)})`;
        filePath = d.filePath;
        break;
      case "crl-import":
        message = `CRL import: ${d.underlying.kind}`;
        break;
    }
    diagnostics.push({
      source: "cel-import",
      kind: d.kind,
      message,
      severity: d.severity === "warning" ? "warning" : "error",
      ...(filePath ? { filePath } : {}),
      details: d,
    });
  }

  return {
    policyId: artifact.policyId,
    policyVersion: artifact.policyVersion,
    artifactPath,
    celPath,
    anchor,
    units,
    overReachNodes,
    ignoredSourceRanges,
    findings: attached,
    rollup,
    diagnostics,
  };
}
