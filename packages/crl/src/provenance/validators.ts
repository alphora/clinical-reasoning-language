/**
 * §9 provenance validator set (the capstone). Pure: `validateProvenance(artifact, index, anchorText, opts?)` runs every
 * §9 check + completes §4's composite mis-tag invariant (§9.2 ∪ over-reach ∪ §9.1), returning findings. Consumes the
 * artifact (T4.1), the T4.3 index, the T4.4 coverage, and the canonical anchor text.
 *
 * Severity ≠ kind: drift is kind `anchor-hash-drift`/`item-text-drift` (the "needs-relink" outcome), not a severity.
 */
import { createHash } from "node:crypto";

import type { AuthoredKind, ProvenanceArtifact, Role } from "./artifact";
import { sliceUtf8Bytes } from "./canonicalize";
import { deriveCoverage } from "./coverage";
import { classifyDerivedFrom, DERIVED_FROM_GATE_ENFORCED } from "./derivedFromPolicy";
import type { IndexedCrlNode, ProvenanceIndex, ProvNodeRef } from "./indexer";
import { nodeKey } from "./indexer";

export type Severity = "error" | "warning" | "manual-review";

/**
 * The provenance-validation lens. "final" (DEFAULT) gates a completed artifact (every finding at native severity);
 * "worklist" reads an in-progress scaffold's attribution backlog as "remaining work" (error→warning re-grade). Shared
 * alias so the validator, the file resolvers, and the cockpit/correspondence builders all name the same union once.
 */
export type ProvenanceValidationMode = "worklist" | "final";

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
  | "over-reach"
  // ── #250 derivedFrom carrier-path gate (Todo B: the pure LEXICAL half). NOT in ATTRIBUTION_KINDS → integrity-class,
  //    reported at native severity in BOTH worklist + final (a broken source trail is not "remaining work"). The
  //    resolve/hash checks (`derived-from-unresolved` / `-hash-mismatch`) + the sidecar cross-check land in later slices.
  | "derived-from-absolute"
  | "derived-from-malformed"
  // ── cockpit correspondence (#170): the FINAL-mode gate that the cockpit lights exactly each case's run path. NOT in
  //    ATTRIBUTION_KINDS → never softened; constructed in validateProvenanceFiles (outside validateProvenance) at
  //    class "integrity" + severity "error". Green now guarantees a correct cockpit, not just referential integrity.
  | "cockpit-correspondence"
  // ── judge-lens waivers (FINAL mode only): an escape hatch suppressing a finding, surfaced for the Judge to
  //    adjudicate its earned-ness. All four are class "integrity" + severity "manual-review" (uniform — the
  //    weighting lives in the message + the kit rubric, never in the severity). See the WAIVER_KINDS block below.
  | "waiver-authored"
  | "waiver-ignored-span"
  | "waiver-intentional-unlink"
  | "waiver-disposition-class";

/**
 * The COVERAGE-backlog kinds — un-attributed work the KE has yet to do (a CRL node in no cluster, an unacknowledged
 * anchor span, a must-link source not yet linked to its decision). These are the ONLY kinds softened in worklist mode
 * (an in-progress scaffold's backlog is "remaining work," not errors). Everything else is integrity (always as-is).
 */
export const ATTRIBUTION_KINDS: ReadonlySet<ProvenanceFindingKind> = new Set<ProvenanceFindingKind>(
  ["over-reach", "uncovered-span", "missed-decision"],
);

/**
 * The WAIVER kinds — every escape hatch that SUPPRESSES a finding, surfaced ONLY in "final" mode for the Judge to
 * adjudicate (mirrors ATTRIBUTION_KINDS so the CLI/MCP can count + present them as a distinct bucket). A waiver is the
 * "judge-lens": surface-then-adjudicate is auditable, so severity is UNIFORM manual-review and the weighting lives in
 * the finding MESSAGE + the authoring_kit `judgeLens` rubric — never demoted to warning, never skipped. WAIVER_KINDS is
 * DISJOINT from ATTRIBUTION_KINDS (so the post-pass never softens a waiver) and never error (so it's never re-graded).
 */
export const WAIVER_KINDS: ReadonlySet<ProvenanceFindingKind> = new Set<ProvenanceFindingKind>([
  "waiver-authored",
  "waiver-ignored-span",
  "waiver-intentional-unlink",
  "waiver-disposition-class",
]);

export interface ProvenanceFinding {
  kind: ProvenanceFindingKind;
  severity: Severity;
  /**
   * Mode-INDEPENDENT classification (set on EVERY finding). "attribution" = a coverage-backlog kind (see
   * ATTRIBUTION_KINDS) → softenable in worklist mode. "integrity" is the coarse "not coverage-backlog / always reported
   * as-is" bucket (drift, mistag, mn-keyword, malformed-item, referential, …) — the judge-lens may sub-classify later.
   */
  class: "attribution" | "integrity";
  /**
   * WAIVER findings ONLY (judge-lens, final mode); undefined on every non-waiver finding. "scrutinize" = a waiver the
   * Judge must actively adjudicate (an authored clinical-assumption/derived-glue, an MN-flagged ignored span, any
   * intentional-unlink, a "not my decision" disposition); "routine" = an expected rubber-stamp waiver (page chrome, a
   * no-operational admin/definition span). The weighting already lives in the message + the kit rubric — this just makes
   * it machine-readable so the count + a future panel can separate the few that matter from the routine majority.
   */
  scrutiny?: "routine" | "scrutinize";
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
  mode?: ProvenanceValidationMode;
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

  // ── #250 (Todo B) derivedFrom carrier-path — PURE LEXICAL check on `artifact.anchorSource.derivedFrom`. It must be a
  //    carrier-relative POSIX path so the source document resolves on any clone; absolute/drive/scheme-bound is dead off the
  //    authoring machine (the #250 defect), and a `\`-separated or blank/NUL value is not a usable path. `classifyDerivedFrom`
  //    returns exactly one class so this emits at most one finding (malformed takes precedence over absolute). RESOLUTION
  //    (the file exists + its bytes match `derivedFromHash`) is Todo C (fs layer). Severity is gated on DERIVED_FROM_GATE_ENFORCED:
  //    a NON-BLOCKING `warning` until the bundled #250 delivery (H) ships the producer fix (A) + normalizer (E), then a hard
  //    `error` — so a corpus never hard-fails before its repair tool ships, even from an interim develop release.
  const dfClass = classifyDerivedFrom(artifact.anchorSource.derivedFrom);
  const dfSeverity: Severity = DERIVED_FROM_GATE_ENFORCED ? "error" : "warning";
  if (dfClass === "malformed") {
    findings.push({
      kind: "derived-from-malformed",
      severity: dfSeverity,
      message: `anchorSource.derivedFrom ${JSON.stringify(artifact.anchorSource.derivedFrom)} is not a usable carrier-relative path — it must be a non-blank, POSIX-separated (\`/\`) path relative to the directory of the file carrying this record (#250).`,
    });
  } else if (dfClass === "absolute") {
    findings.push({
      kind: "derived-from-absolute",
      severity: dfSeverity,
      message: `anchorSource.derivedFrom ${JSON.stringify(artifact.anchorSource.derivedFrom)} is an absolute/drive/scheme-bound path; it must be carrier-relative (POSIX \`/\`, relative to the directory of the file carrying this record) so the source resolves on any clone — an absolute path is dead off the authoring machine (#250).`,
    });
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

  const mode = opts?.mode ?? "final";

  // ── judge-lens WAIVERS (FINAL mode only) ── surface every escape hatch that SUPPRESSES a finding so the Judge can
  // adjudicate its earned-ness (worklist mode is the in-progress backlog view — a waiver there is just noise, so skip
  // the whole block). All four push at severity "manual-review", class "integrity" (WAIVER_KINDS ∉ ATTRIBUTION_KINDS →
  // the post-pass never softens them; manual-review is never re-graded). The WEIGHTING is in the message, not severity.
  if (mode === "final") {
    // A node is an over-reach CANDIDATE iff it mirrors isOverReach's candidate clause: a policy-owned leaf, or a
    // decision-SUB-node (decision-node with a nodeId). Shared by waiver-authored + waiver-intentional-unlink.
    const isCandidate = (node: IndexedCrlNode): boolean =>
      node.ownership === "policy-owned" &&
      (node.nodeKind === "leaf" ||
        (node.nodeKind === "decision-node" && node.ref.nodeId !== undefined));
    // Candidate index nodes keyed by nodeKey — the over-reach denominator a waiver may be escaping.
    const candidateByKey = new Map<string, IndexedCrlNode>();
    for (const node of index.nodes.values()) {
      if (isCandidate(node)) candidateByKey.set(nodeKey(node.ref), node);
    }
    // A candidate's nodeKey is LINKED/INTENTIONALLY-UNLINKED somewhere — those refs escape over-reach on their own
    // (coverage.ts:88), so an authored support is NOT the suppressor for them. Used to scope waiver-authored's blast
    // radius to the nodes whose ONLY escape is the authored support.
    const escapedByRefStatus = new Set<string>();
    for (const cl of artifact.clusters) {
      for (const r of cl.crl) {
        if (r.status === "linked" || r.status === "intentionally-unlinked")
          escapedByRefStatus.add(nodeKey(toRef(r)));
      }
    }

    // V7-malformed authored items (bad cluster / non-member) — don't stack a manual-review waiver on top of an error
    // for the same broken item (the V7 error is the priority signal).
    const v7MalformedItems = new Set<string>();
    for (const item of artifact.items) {
      if (item.origin !== "authored" || !item.supports) continue;
      const c = artifact.clusters.find((cl) => cl.id === item.supports!.cluster);
      if (!c || !c.items.includes(item.id)) v7MalformedItems.add(item.id);
    }

    // Whether ANY anchor-hash-drift finding fired — the offsets/preview a waiver-ignored-span would show are stale, so
    // the drift is the priority signal and we SKIP waiver-ignored-span entirely (its suppression is noted at its loop).
    const driftPresent = findings.some((f) => f.kind === "anchor-hash-drift");

    // ── (1) waiver-authored ── per authored item with a `supports` that ACTUALLY suppresses over-reach (its cluster is
    //    real AND holds ≥1 over-reach candidate whose only escape is this authored support — the blast radius).
    const authoredHighScrutiny = (k: AuthoredKind | undefined): boolean =>
      k === "clinical-assumption" || k === "derived-glue"; // clinical logic with no source span
    const authoredScrutinyNote = (k: AuthoredKind | undefined): string =>
      authoredHighScrutiny(k)
        ? "HIGHEST-SCRUTINY: clinical logic with no source span — confirm it is earned, not invented"
        : "routine: an implementation/modeling note, not clinical logic";
    for (const item of artifact.items) {
      if (item.origin !== "authored" || !item.supports) continue;
      if (v7MalformedItems.has(item.id)) continue; // V7 error already owns this broken item
      const c = artifact.clusters.find((cl) => cl.id === item.supports!.cluster);
      if (!c) continue; // unreachable (V7-malformed already filtered), but keep the guard explicit
      // Blast radius: candidate nodes referenced by this cluster's crl whose only over-reach escape is this support.
      const suppressed: IndexedCrlNode[] = [];
      const seenSuppressed = new Set<string>();
      for (const r of c.crl) {
        const key = nodeKey(toRef(r));
        if (escapedByRefStatus.has(key)) continue; // a linked/intentionally-unlinked ref escapes on its own
        const node = candidateByKey.get(key);
        if (node && !seenSuppressed.has(key)) {
          seenSuppressed.add(key);
          suppressed.push(node);
        }
      }
      if (suppressed.length === 0) continue; // suppresses no real over-reach → not a waiver, nothing to adjudicate
      const radius = suppressed
        .map((n) => `"${n.ref.name}"${n.ref.nodeId ? "#" + n.ref.nodeId : ""}`)
        .join(", ");
      findings.push({
        kind: "waiver-authored",
        severity: "manual-review",
        scrutiny: authoredHighScrutiny(item.authoredKind) ? "scrutinize" : "routine",
        message:
          `authored item "${item.id}" (${item.authoredKind ?? "unspecified"}) supports cluster "${c.id}" and ` +
          `is an authored escape for the over-reach of ${suppressed.length} candidate node(s): ${radius}. ${authoredScrutinyNote(item.authoredKind)}.`,
        itemId: item.id,
        cluster: c.id,
      });
    }

    // ── (2) waiver-ignored-span ── per IgnoredRange (it suppresses an uncovered-span / Missed₂). SKIP the whole loop
    //    under anchor-hash-drift: the offsets/preview would be stale, and the drift is the priority signal.
    if (!driftPresent) {
      // Only a VALID ignored range actually suppresses coverage — a malformed/zero-length one covers nothing (coverage
      // drops it to malformedRanges), so don't claim "suppresses an uncovered-span" for it: the malformed-range error
      // already owns it, and we'd otherwise quote garbled/empty text.
      const malformedKeys = new Set(coverage.malformedRanges.map((m) => `${m.start} ${m.end}`));
      for (const ig of artifact.ignoredRanges) {
        if (ig.start >= ig.end) continue; // zero-/negative-length: suppresses nothing
        if (malformedKeys.has(`${ig.start} ${ig.end}`)) continue; // out-of-range/non-boundary: malformed-range owns it
        let preview: string;
        try {
          preview = sliceUtf8Bytes(anchorText, ig.start, ig.end);
        } catch {
          continue; // non-boundary slice → malformed (already flagged); never emit a suppression claim for it
        }
        const truncated = preview.length > 80 ? preview.slice(0, 80) + "…" : preview;
        const mnHard = mnKeyword(preview) === "hard";
        const mnNote = mnHard
          ? " ⚠ contains medical-necessity language — likely a coverage criterion, scrutinize"
          : "";
        findings.push({
          kind: "waiver-ignored-span",
          severity: "manual-review",
          scrutiny: mnHard ? "scrutinize" : "routine", // chrome (headers/footers) is routine; MN-language is not
          message:
            `ignoredRange [${ig.start},${ig.end}) ("${ig.reason}") suppresses an uncovered-span (Missed₂). ` +
            `Text: "${truncated}".${mnNote}`,
          range: { start: ig.start, end: ig.end },
        });
      }
    }

    // ── (3) waiver-intentional-unlink ── per CrlNodeRef status:"intentionally-unlinked" that is LEGAL (not already an
    //    illegal-intentional-unlink — i.e. not a must-link-decision item's decision-relation ref) AND actually
    //    suppresses an over-reach candidate. This is an OVER-REACH escape (coverage.ts:88), NOT Missed₁ — say so.
    // Key by cluster+node, NOT node alone: an illegal unlink in cluster A must not hide a LEGAL intentionally-unlinked
    // waiver for the same node in cluster B (illegality is per-item-per-cluster, V5:320-330).
    const illegalUnlinks = new Set(
      findings
        .filter((f) => f.kind === "illegal-intentional-unlink" && f.ref)
        .map((f) => `${f.cluster ?? ""} ${nodeKey(f.ref!)}`),
    );
    for (const c of artifact.clusters) {
      for (const ref of c.crl) {
        if (ref.status !== "intentionally-unlinked") continue;
        const key = nodeKey(toRef(ref));
        if (illegalUnlinks.has(`${c.id} ${key}`)) continue; // V5 illegal error owns THIS cluster's ref — don't stack
        const node = candidateByKey.get(key);
        if (!node) continue; // names no over-reach candidate → suppresses nothing to adjudicate
        findings.push({
          kind: "waiver-intentional-unlink",
          severity: "manual-review",
          scrutiny: "scrutinize", // deliberately leaving a policy-owned node unlinked is always worth confirming
          message:
            `cluster "${c.id}" intentionally-unlinks over-reach candidate "${ref.name}"${ref.nodeId ? "#" + ref.nodeId : ""} ` +
            `(an over-reach escape, NOT a Missed₁ decision gap). Confirm the omission is deliberate.`,
          cluster: c.id,
          ref: toRef(ref),
        });
      }
    }

    // ── (4) waiver-disposition-class ── per origin:"source" item carrying a dispositionClass: the three "not my
    //    decision" classes assert out-of-scope (scrutinize); no-operational-disposition is routine admin/definition
    //    (DO emit, marked routine). This is the laundering V9 misses — a genuine criterion tagged non-decision-role +
    //    dispositionClass can evade missed-decision/V9/over-reach.
    const mnFired = new Set(
      findings.filter((f) => f.kind === "mn-keyword-hard").map((f) => f.itemId),
    );
    for (const item of artifact.items) {
      if (item.origin !== "source" || !item.dispositionClass) continue;
      const mnAlsoFired = mnFired.has(item.id);
      const routine = item.dispositionClass === "no-operational-disposition";
      const mnNote = mnAlsoFired
        ? " (V8 mn-keyword ALSO fired on this item — the coverage language strengthens the concern)"
        : "";
      findings.push({
        kind: "waiver-disposition-class",
        severity: "manual-review",
        // no-operational = routine; the three "not my decision" classes = scrutinize. A no-operational item that ALSO
        // tripped V8 mn-keyword is NOT routine — the MN language is the laundering smell the message already strengthens.
        scrutiny: routine && !mnAlsoFired ? "routine" : "scrutinize",
        message:
          `source item "${item.id}" (role ${item.role ?? "unspecified"}, dispositionClass ${item.dispositionClass}) ` +
          (routine
            ? "is acknowledged as routine admin/definition — confirm it carries no decision content"
            : 'asserts "not my decision" — confirm this span is genuinely out-of-decision-scope, not a criterion acknowledged away') +
          `.${mnNote}`,
        itemId: item.id,
      });
    }
  }

  // ── post-pass: stamp `class` (mode-INDEPENDENT) + worklist re-grade ──
  // `class` is set on EVERY finding regardless of mode. In "worklist" mode ONLY, attribution-class findings re-grade
  // error→warning (non-blocking); integrity-class severity is untouched in both modes. No 4th Severity is introduced —
  // "warning" is an existing bucket. (Waiver findings are integrity + manual-review → untouched by both passes.)
  return findings.map((f): ProvenanceFinding => {
    const cls: ProvenanceFinding["class"] = ATTRIBUTION_KINDS.has(f.kind)
      ? "attribution"
      : "integrity";
    // Re-grade ONLY a hard error→warning (the stated invariant); leave a native manual-review/warning attribution finding
    // untouched, so a future attribution kind that isn't error-severity can't be silently demoted.
    const severity =
      mode === "worklist" && cls === "attribution" && f.severity === "error"
        ? "warning"
        : f.severity;
    return { ...f, class: cls, severity };
  });
}
