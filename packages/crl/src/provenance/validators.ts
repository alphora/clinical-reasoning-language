/**
 * §9 provenance validator set (the capstone). Pure: `validateProvenance(artifact, index, anchorText, opts?)` runs every
 * §9 check + completes §4's composite mis-tag invariant (§9.2 ∪ over-reach ∪ §9.1), returning findings. Consumes the
 * artifact (T4.1), the T4.3 index, the T4.4 coverage, and the canonical anchor text.
 *
 * Severity ≠ kind: drift is kind `anchor-hash-drift`/`item-text-drift` (the "needs-relink" outcome), not a severity.
 */
import { createHash } from "node:crypto";

import type { ProvenanceArtifact, Role } from "./artifact";
import { sliceUtf8Bytes } from "./canonicalize";
import { deriveCoverage } from "./coverage";
import type { ProvenanceIndex, ProvNodeRef } from "./indexer";

export type Severity = "error" | "warning" | "manual-review";

export type ProvenanceFindingKind =
  | "unresolved-ref"
  | "cel-unresolved"
  | "provenance-references-unfrozen-case"
  | "nodekind-mismatch"
  | "ownership-mismatch"
  | "anchor-hash-drift"
  | "item-text-drift"
  | "uncovered-span"
  | "malformed-range"
  | "missed-decision"
  | "illegal-intentional-unlink"
  | "missing-rationale"
  | "missing-disposition-class"
  | "drives-determination-bad-source"
  | "drives-determination-bad-target"
  | "drives-determination-malformed-edge"
  | "drives-determination-unverifiable"
  | "drives-determination-violation"
  | "authored-supports-malformed"
  | "mn-keyword-hard"
  | "mn-keyword-soft"
  | "structural-mistag"
  | "over-reach";

/**
 * The COVERAGE-backlog kinds — un-attributed work the KE has yet to do (a CRL node in no cluster, an unacknowledged
 * anchor span, a must-link source not yet linked to its decision). These are the ONLY kinds softened in worklist mode
 * (an in-progress scaffold's backlog is "remaining work," not errors). Everything else is integrity (always as-is).
 */
export const ATTRIBUTION_KINDS: ReadonlySet<ProvenanceFindingKind> = new Set<ProvenanceFindingKind>(
  ["over-reach", "uncovered-span", "missed-decision"],
);

export interface ProvenanceFinding {
  kind: ProvenanceFindingKind;
  severity: Severity;
  /**
   * Mode-INDEPENDENT classification (set on EVERY finding). "attribution" = a coverage-backlog kind (see
   * ATTRIBUTION_KINDS) → softenable in worklist mode. "integrity" is the coarse "not coverage-backlog / always reported
   * as-is" bucket (drift, mistag, mn-keyword, malformed-item, referential, …) — the judge-lens may sub-classify later.
   */
  class: "attribution" | "integrity";
  message: string;
  itemId?: string;
  cluster?: string;
  ref?: ProvNodeRef;
  range?: { start: number; end: number };
}

export interface ValidateOpts {
  /** Effective caseIds per .cel file (T4.2 effectiveCaseIds), keyed by the CelNodeRef.file. Absent → CEL ref existence not validated. */
  celCaseIds?: Map<string, Set<string>>;
  /**
   * EXPLICIT (frozen) caseIds per .cel file — cases that carry an authored `- id is "..."`. Absent → the freeze check
   * is skipped. A provenance ref to a case NOT in this set is referencing an unfrozen/provisional id (spec §7
   * grammar-optional/provenance-mandatory) → `provenance-references-unfrozen-case`.
   */
  frozenCaseIds?: Map<string, Set<string>>;
  /**
   * "final" (DEFAULT) = strict: report every finding at its native severity (the completed-artifact gate). "worklist" =
   * in-progress authoring: re-grade attribution-class findings from "error" to "warning" (non-blocking) — the KE's
   * coverage backlog is "remaining work," not a wall of red. Integrity-class severity is UNCHANGED in both modes.
   */
  mode?: "worklist" | "final";
}

const DECISION_RELATIONS = new Set([
  "implements-criterion",
  "implements-determination",
  "recommends-disposition",
]);
const NON_DECISION_ROLES = new Set<Role>([
  "applicability",
  "workflow-precondition",
  "administrative",
  "definition",
]);
const STRUCTURAL_ROLES = new Set<Role>([
  "applicability",
  "administrative",
  "workflow-precondition",
]);

const toRef = (r: { lib: string; kind: string; name: string; nodeId?: string }): ProvNodeRef => ({
  lib: r.lib,
  kind: r.kind,
  name: r.name,
  ...(r.nodeId !== undefined ? { nodeId: r.nodeId } : {}),
});

/** §9.1 MN/coverage keyword lists (word-boundaried, case-insensitive). HARD is tested before SOFT (HARD wins, no double-report). */
const MN_HARD: RegExp[] = [
  /\bnot medically necessary\b/i,
  /\bmedically necessary\b/i,
  /\bmedical necessity\b/i,
  /\bexperimental\b/i,
  /\binvestigational\b/i,
  /\bunproven\b/i,
  /\bnot covered\b/i,
  /\bnon-covered\b/i,
  /\bexcluded\b/i,
  /\bexclusion\b/i,
  /\breasonable and necessary\b/i,
  /\bmedically appropriate\b/i,
  /\bcontraindicat\w*\b/i,
  /\bcriteria\s+(?:are\s+)?(?:not\s+)?met\b/i,
  /\bdoes not meet criteria\b/i,
  /\b(?:in)?eligible for coverage\b/i,
  /\b(?:deny|denied)\b/i,
  /\b(?:not\s+)?certified\b/i,
];
const MN_SOFT: RegExp[] = [
  /\bcovered\b/i,
  /\bcoverage\b/i,
  /\bauthorized\b/i,
  /\bprior authorization\b/i,
  /\bbenefits?\b/i,
  /\beligible\b/i,
  /\bcriteria\b/i,
];

function mnKeyword(text: string): "hard" | "soft" | null {
  if (MN_HARD.some((re) => re.test(text))) return "hard";
  if (MN_SOFT.some((re) => re.test(text))) return "soft";
  return null;
}

/** Segment-aware STRICT ancestry on the `/`-delimited childId path (so `when[1]` is NOT an ancestor of `when[12]`). */
export function isStrictAncestor(ancestorNodeId: string, descNodeId: string): boolean {
  const a = ancestorNodeId.split("/");
  const d = descNodeId.split("/");
  return a.length < d.length && a.every((seg, i) => seg === d[i]);
}

export function validateProvenance(
  artifact: ProvenanceArtifact,
  index: ProvenanceIndex,
  anchorText: string,
  opts?: ValidateOpts,
): ProvenanceFinding[] {
  // Built without `class` (each push fills kind/severity/loci); a single post-pass fills `class` from the kind and
  // applies the worklist re-grade. Keeping the push sites class-free avoids repeating the same derivation 20+ times.
  const findings: Omit<ProvenanceFinding, "class">[] = [];
  const itemsById = new Map(artifact.items.map((it) => [it.id, it]));
  const coverage = deriveCoverage(artifact, index, anchorText);
  const clustersWith = (itemId: string) =>
    artifact.clusters.filter((c) => c.items.includes(itemId));

  // ── V1 referential integrity (CRL) + V2 stored-vs-index agreement (V2 gated on V1 resolving) ──
  for (const c of artifact.clusters) {
    for (const ref of c.crl) {
      const nk = index.nodeKindOf(ref);
      if (nk === undefined) {
        findings.push({
          kind: "unresolved-ref",
          severity: "error",
          message: `CRL ref ${ref.lib}."${ref.name}"${ref.nodeId ? "#" + ref.nodeId : ""} does not resolve in the index.`,
          cluster: c.id,
          ref: toRef(ref),
        });
        continue;
      }
      if (ref.nodeKind !== nk)
        findings.push({
          kind: "nodekind-mismatch",
          severity: "error",
          message: `stored nodeKind "${ref.nodeKind}" ≠ index "${nk}" for "${ref.name}".`,
          cluster: c.id,
          ref: toRef(ref),
        });
      const own = index.ownershipOf(ref);
      if (ref.ownership !== own)
        findings.push({
          kind: "ownership-mismatch",
          severity: "error",
          message: `stored ownership "${ref.ownership}" ≠ index "${own}" for "${ref.name}".`,
          cluster: c.id,
          ref: toRef(ref),
        });
    }
    // CEL referential integrity (file-aware; only when caseIds provided)
    if (opts?.celCaseIds) {
      for (const cr of c.cel) {
        const set = opts.celCaseIds.get(cr.file);
        if (!set || !set.has(cr.caseId))
          findings.push({
            kind: "cel-unresolved",
            severity: "error",
            message: `CEL ref ${cr.file}#${cr.caseId} does not resolve.`,
            cluster: c.id,
          });
      }
    }
    // Freeze check (spec §7): a provenance ref to a case that lacks an explicit/frozen caseId is referencing a
    // provisional, position-dependent id — durable authoring requires the case be frozen first.
    if (opts?.frozenCaseIds) {
      for (const cr of c.cel) {
        const frozen = opts.frozenCaseIds.get(cr.file);
        if (!frozen?.has(cr.caseId))
          findings.push({
            kind: "provenance-references-unfrozen-case",
            severity: "error",
            message: `CEL ref ${cr.file}#${cr.caseId} targets a case without an explicit (frozen) id — add a \`- id is "..."\` to that case before referencing it (§7).`,
            cluster: c.id,
          });
      }
    }
  }

  // ── V3 content-hash drift (whole-anchor gates per-item) ──
  const computed =
    "sha256:" + createHash("sha256").update(Buffer.from(anchorText, "utf8")).digest("hex");
  const hashOk = computed === artifact.anchorSource.textHash;
  if (!hashOk) {
    findings.push({
      kind: "anchor-hash-drift",
      severity: "error",
      message: `anchor text hash ${computed} ≠ artifact textHash ${artifact.anchorSource.textHash}; offsets are stale (needs-relink).`,
    });
  } else {
    for (const item of artifact.items) {
      if (item.origin !== "source" || !item.sourceRefs?.length) continue;
      let joined = "";
      let ok = true;
      for (const r of item.sourceRefs) {
        try {
          joined += sliceUtf8Bytes(anchorText, r.start, r.end);
        } catch {
          ok = false; // malformed offset — surfaced by V4 (coverage.malformedRanges); skip the text check here
          break;
        }
      }
      if (ok && joined.normalize("NFC") !== item.text.normalize("NFC")) {
        findings.push({
          kind: "item-text-drift",
          severity: "error",
          message: `item "${item.id}" text ≠ its anchor-source bytes (needs-relink).`,
          itemId: item.id,
        });
      }
    }
  }

  // ── V4 source-acknowledgement (reuse coverage) ──
  for (const span of coverage.uncoveredSpans) {
    findings.push({
      kind: "uncovered-span",
      severity: "error",
      message: `anchor-source span [${span.start},${span.end}) is unacknowledged (no sourceRef/ignoredRange): "${span.text.slice(0, 60)}"`,
      range: { start: span.start, end: span.end },
    });
  }
  for (const m of coverage.malformedRanges) {
    findings.push({
      kind: "malformed-range",
      severity: "error",
      message: `${m.reason}`,
      range: { start: m.start, end: m.end },
    });
  }

  // ── V5 linkRequirement ──
  const missed = new Set(coverage.missedDecisions);
  for (const item of artifact.items) {
    if (item.origin !== "source") continue;
    if (item.linkRequirement === "must-link-decision") {
      if (missed.has(item.id))
        findings.push({
          kind: "missed-decision",
          severity: "error",
          message: `must-link-decision item "${item.id}" has no counted decision implementation (Missed₁).`,
          itemId: item.id,
        });
      for (const c of clustersWith(item.id)) {
        for (const ref of c.crl) {
          if (ref.status === "intentionally-unlinked" && DECISION_RELATIONS.has(ref.relation)) {
            findings.push({
              kind: "illegal-intentional-unlink",
              severity: "error",
              message: `must-link-decision item "${item.id}" has an intentionally-unlinked decision ref — illegal (silences a real criterion).`,
              itemId: item.id,
              cluster: c.id,
              ref: toRef(ref),
            });
          }
        }
      }
    }
    if (item.role && NON_DECISION_ROLES.has(item.role)) {
      if (!item.rationale?.trim())
        findings.push({
          kind: "missing-rationale",
          severity: "error",
          message: `non-decision item "${item.id}" (${item.role}) requires a rationale (§2.1).`,
          itemId: item.id,
        });
      if (!item.dispositionClass)
        findings.push({
          kind: "missing-disposition-class",
          severity: "error",
          message: `non-decision item "${item.id}" (${item.role}) requires a dispositionClass for acknowledgement (§4-2).`,
          itemId: item.id,
        });
    }
  }

  // ── V6 drivesDetermination ancestor-faithfulness ──
  const linkedNodesWithId = (
    itemId: string,
    relations: string[],
  ): { lib: string; name: string; nodeId: string }[] => {
    const out: { lib: string; name: string; nodeId: string }[] = [];
    for (const c of clustersWith(itemId)) {
      for (const ref of c.crl) {
        // require resolution in the index too — a stale/typo nodeId must NOT participate in a false ancestor pass (V1 flags it separately).
        if (
          ref.status === "linked" &&
          relations.includes(ref.relation) &&
          ref.nodeId !== undefined &&
          index.nodeKindOf(ref) !== undefined
        ) {
          out.push({ lib: ref.lib, name: ref.name, nodeId: ref.nodeId });
        }
      }
    }
    return out;
  };
  for (const item of artifact.items) {
    if (!item.drivesDetermination?.length) continue;
    if (item.role !== "criterion") {
      findings.push({
        kind: "drives-determination-bad-source",
        severity: "error",
        message: `item "${item.id}" carries drivesDetermination but is not role:"criterion".`,
        itemId: item.id,
      });
      continue; // a non-criterion source is malformed; don't pile on per-edge findings
    }
    const critNodes = linkedNodesWithId(item.id, ["implements-criterion"]);
    for (const edge of item.drivesDetermination) {
      if (
        (edge.polarity !== "present-drives" && edge.polarity !== "absent-drives") ||
        !edge.expectedDisposition
      ) {
        findings.push({
          kind: "drives-determination-malformed-edge",
          severity: "error",
          message: `drivesDetermination edge on "${item.id}" has a malformed polarity/expectedDisposition.`,
          itemId: item.id,
        });
        continue;
      }
      const det = itemsById.get(edge.determination);
      if (!det || det.role !== "determination") {
        findings.push({
          kind: "drives-determination-bad-target",
          severity: "error",
          message: `drivesDetermination on "${item.id}" targets "${edge.determination}", which is not a role:"determination" item.`,
          itemId: item.id,
        });
        continue;
      }
      const detNodes = linkedNodesWithId(edge.determination, [
        "implements-determination",
        "recommends-disposition",
      ]);
      if (critNodes.length === 0 || detNodes.length === 0) {
        findings.push({
          kind: "drives-determination-unverifiable",
          severity: "manual-review",
          message: `drivesDetermination "${item.id}"→"${edge.determination}" cannot be checked: an endpoint lacks a linked decision sub-node (nodeId).`,
          itemId: item.id,
        });
        continue;
      }
      const ok = critNodes.some((cn) =>
        detNodes.some(
          (dn) =>
            cn.lib === dn.lib && cn.name === dn.name && isStrictAncestor(cn.nodeId, dn.nodeId),
        ),
      );
      if (!ok) {
        findings.push({
          kind: "drives-determination-violation",
          severity: "error",
          message: `drivesDetermination "${item.id}"→"${edge.determination}": the criterion's node is not an ancestor of the determination's node (documentation ≠ faithfulness).`,
          itemId: item.id,
        });
      }
    }
  }

  // ── V7 authored-item discipline ──
  for (const item of artifact.items) {
    if (item.origin !== "authored" || !item.supports) continue;
    const c = artifact.clusters.find((cl) => cl.id === item.supports!.cluster);
    if (!c)
      findings.push({
        kind: "authored-supports-malformed",
        severity: "error",
        message: `authored item "${item.id}" supports cluster "${item.supports.cluster}", which does not exist.`,
        itemId: item.id,
      });
    else if (!c.items.includes(item.id))
      findings.push({
        kind: "authored-supports-malformed",
        severity: "error",
        message: `authored item "${item.id}" must be a member of the cluster it supports (§2.3).`,
        itemId: item.id,
        cluster: c.id,
      });
  }

  // ── V8 §9.1 MN-keyword ──
  for (const item of artifact.items) {
    if (item.origin !== "source" || !item.role || !NON_DECISION_ROLES.has(item.role)) continue;
    const m = mnKeyword(item.text);
    if (m === "hard")
      findings.push({
        kind: "mn-keyword-hard",
        severity: "manual-review",
        message: `non-decision item "${item.id}" (${item.role}) carries MN/coverage language — reconcile its role (§9.1).`,
        itemId: item.id,
      });
    else if (m === "soft")
      findings.push({
        kind: "mn-keyword-soft",
        severity: "warning",
        message: `non-decision item "${item.id}" (${item.role}) carries soft coverage language — review (§9.1).`,
        itemId: item.id,
      });
  }

  // ── V9 §9.2 structural flag ──
  for (const item of artifact.items) {
    if (item.origin !== "source" || !item.role || !STRUCTURAL_ROLES.has(item.role)) continue;
    let flagged = false;
    for (const c of clustersWith(item.id)) {
      for (const ref of c.crl) {
        if (index.isDecisionReached(ref)) {
          findings.push({
            kind: "structural-mistag",
            severity: "manual-review",
            message: `${item.role} item "${item.id}" is linked to a decision-reached node — reconcile its role to criterion/determination (§9.2).`,
            itemId: item.id,
            cluster: c.id,
            ref: toRef(ref),
          });
          flagged = true;
          break;
        }
      }
      if (flagged) break;
    }
  }

  // ── Composite: over-reach (the third mis-tag leg) ── (a CRL node, identified by `ref`; its location resolves via the index)
  for (const node of coverage.overReach) {
    findings.push({
      kind: "over-reach",
      severity: "error",
      message: `policy-owned ${node.nodeKind} "${node.ref.name}"${node.ref.nodeId ? "#" + node.ref.nodeId : ""} is in no counted cluster (invented logic / over-reach).`,
      ref: node.ref,
    });
  }

  // ── post-pass: stamp `class` (mode-INDEPENDENT) + worklist re-grade ──
  // `class` is set on EVERY finding regardless of mode. In "worklist" mode ONLY, attribution-class findings re-grade
  // error→warning (non-blocking); integrity-class severity is untouched in both modes. No 4th Severity is introduced —
  // "warning" is an existing bucket.
  const mode = opts?.mode ?? "final";
  return findings.map((f): ProvenanceFinding => {
    const cls: ProvenanceFinding["class"] = ATTRIBUTION_KINDS.has(f.kind)
      ? "attribution"
      : "integrity";
    // Re-grade ONLY a hard error→warning (the stated invariant); leave a native manual-review/warning attribution finding
    // untouched, so a future attribution kind that isn't error-severity can't be silently demoted.
    const severity =
      mode === "worklist" && cls === "attribution" && f.severity === "error" ? "warning" : f.severity;
    return { ...f, class: cls, severity };
  });
}
