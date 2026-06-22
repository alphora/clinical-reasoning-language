/**
 * Provenance artifact schema (docs/provenance-spec.md §1–§8).
 *
 * One sidecar per encoding+version linking policy NARRATIVE ↔ CRL ↔ CEL so the agent's translation is auditable:
 * coverage (missed criteria) and over-reach (invented logic) become mechanically derivable. This module is the
 * typed data model only — the derivations (§4 coverage) and checks (§9 validators) live in sibling modules.
 *
 * Note on invariants the TYPES intentionally do NOT encode (they are validator-enforced, not structural — keeping
 * the model permissive so a partially-authored artifact is still representable for incremental tooling):
 *  - origin:"source" ⇒ ≥1 sourceRefs; origin:"authored" ⇒ none (§2).
 *  - non-decision roles require `rationale` (+ a disposition-class for acknowledgement) (§2.1, §4-2).
 *  - `drivesDetermination` only on criterion items; `authoredKind`/`supports` only on authored items.
 *  - intentionally-unlinked is illegal for must-link-decision items (§4).
 *  - the §9 drivesDetermination ancestor check needs `nodeId` on BOTH endpoints; an edge with a missing `nodeId`
 *    is unverifiable → that is itself a validator finding, never a skip / non-null-assert (T4.5).
 */
import type { AnchorMeta } from "./canonicalize";

// ── §2 items ────────────────────────────────────────────────────────────────

export type Origin = "source" | "authored";

/** utf8-byte, half-open [start, end) — offsets into the canonical anchor-source text (§6). */
export interface SourceRef {
  start: number;
  end: number;
}

/** §2.1 per-clause role. Decision roles = {criterion, determination} (criterion covers exclusions/contraindications). */
export type Role =
  | "criterion"
  | "determination"
  | "applicability"
  | "workflow-precondition"
  | "administrative"
  | "definition";

/** §2.1 — assigned PROVISIONALLY by surface vocabulary, then RECONCILED by the §9.2 loop (decision-participation wins). */
export type RoleStatus = "provisional" | "reconciled";

/** §2.2 — derived from role. (`no-link` reserved/unused for now.) */
export type LinkRequirement = "must-link-decision" | "may-link-concept" | "rationale-only" | "no-link";

/** §2.1 optional refinement of an `administrative` item. */
export type AdministrativeSubtype = "coding" | "pa-meta" | "background" | "disclaimer" | "versioning";

/**
 * §4-2 disposition-class rationale that ACKNOWLEDGES a non-decision source span without emitting a clinical Deny.
 * route-elsewhere | pend | presumed-scope ⇒ applicability/workflow-precondition; no-operational-disposition ⇒ admin/definition.
 */
export type DispositionClass = "route-elsewhere" | "pend" | "presumed-scope" | "no-operational-disposition";

/** §2.4 — STRUCTURAL assertion (validator-checked, §9): the criterion's CRL node must be an ANCESTOR of the determination's. */
export interface DrivesDeterminationEdge {
  determination: string; // determination item id
  polarity: "present-drives" | "absent-drives";
  expectedDisposition: ExpectedDisposition;
}

export type KnownExpectedDisposition = "approve" | "deny";
/**
 * approve | deny and other coded outcomes (A4/pended/…); kept open per the kit's coded-outcome boundary.
 * Consumed by EQUALITY in §9 (drivesDetermination matching), never by exhaustive switch — the open union is
 * intentional and does not need a compiler-forced default.
 */
export type ExpectedDisposition = KnownExpectedDisposition | (string & {});

/** §2.3 origin:authored taxonomy. */
export type AuthoredKind = "modeling-rationale" | "clinical-assumption" | "derived-glue" | "implementation-artifact";

/** §2.3 — the authored item must be a member of `cluster`; it suppresses over-reach ONLY for nodes in that cluster (§4). */
export interface SupportsRef {
  cluster: string;
  items: string[];
}

export interface Item {
  id: string;
  origin: Origin;
  text: string;
  /** §2 ARRAY; origin:"source" ⇒ ≥1, origin:"authored" ⇒ omitted. */
  sourceRefs?: SourceRef[];
  // ── origin:"source" fields ──
  role?: Role;
  roleStatus?: RoleStatus;
  linkRequirement?: LinkRequirement;
  /** free-text justification, required for non-decision roles (§2). Elaborates the structured `dispositionClass`. */
  rationale?: string;
  /** §4-2 the structured acknowledgement class for a non-decision span (the machine-readable counterpart of `rationale`). */
  dispositionClass?: DispositionClass;
  administrativeSubtype?: AdministrativeSubtype;
  /** §4-2 operational consequence metadata ("requests without docs are denied/not reviewed") — informational; CRL still emits no clinical Deny. */
  operationalConsequence?: string;
  /** criterion items only (§2.4). */
  drivesDetermination?: DrivesDeterminationEdge[];
  // ── origin:"authored" fields (§2.3) ──
  authoredKind?: AuthoredKind;
  supports?: SupportsRef;
}

// ── §4 node refs ─────────────────────────────────────────────────────────────

/** Per-ref link status. Only `linked` counts (§4). `intentionally-unlinked` is illegal for must-link-decision items. */
export type RefStatus = "linked" | "provisional" | "needs-relink" | "intentionally-unlinked";

export type CrlRelation =
  | "implements-criterion"
  | "composes-criteria"
  | "implements-determination"
  | "recommends-disposition"
  | "defines-concept";

export type CelRelation = "tests-branch" | "tests-otherwise" | "asserts-fact";

/** §5 derived. over-reach EXCLUDES composition, shared-reference, terminology, parameter. */
export type NodeKind = "leaf" | "composition" | "decision-node" | "shared-reference" | "terminology" | "parameter";

/** §5 — engine-resolution authoritative. shared-reference ⇔ resolves to a vendored/shared library; else policy-owned. */
export type Ownership = "policy-owned" | "shared-reference";

/** §8 match rank: name → code/text → shape (shape is a tiebreaker only). */
export type MatchRank = "name" | "code/text" | "shape";

/**
 * §8 — provenance-only, NON-authoritative, NON-covering relink hint. Discriminated by `kind` so the cardinality
 * matches the reshape (rename 1:1, split 1:N, merge N:1, branch-reshape N:N) — a hint never satisfies a link alone.
 */
export type RelinkHint =
  | { kind: "rename"; matchedBy?: MatchRank; from?: string; to?: string; note?: string }
  | { kind: "split"; matchedBy?: MatchRank; from?: string; to?: string[]; note?: string }
  | { kind: "merge"; matchedBy?: MatchRank; from?: string[]; to?: string; note?: string }
  | { kind: "branch-reshape"; matchedBy?: MatchRank; from?: string | string[]; to?: string | string[]; note?: string };

export interface CrlNodeRef {
  lib: string;
  kind: string;
  name: string;
  /** optional: declaration-level refs have none; only decision sub-nodes carry a `childId` path. Load-bearing for §9 ancestor check. */
  nodeId?: string;
  nodeKind: NodeKind;
  ownership: Ownership;
  relation: CrlRelation;
  status: RefStatus;
  relinkHints?: RelinkHint[];
}

export interface CelNodeRef {
  file: string;
  kind: string;
  caseId: string;
  relation: CelRelation;
  status: RefStatus;
}

// ── §3 clusters (COVER, not partition — items + nodes may repeat) ─────────────

export interface Cluster {
  id: string;
  /** free-form, non-semantic. */
  label: string;
  items: string[];
  crl: CrlNodeRef[];
  cel: CelNodeRef[];
}

// ── §4-2 / §1 envelope ───────────────────────────────────────────────────────

/** §4-2 — a source span deliberately not modeled (page numbers, headers/footers, …). utf8-byte half-open. */
export interface IgnoredRange {
  start: number;
  end: number;
  reason: string;
}

/**
 * §6 anchor-source metadata recorded in the artifact. Derived from the canonicalizer's `AnchorMeta` (so the field set
 * cannot silently drift) MINUS `warnings` — warnings live in the `<name>.anchormeta.json` sidecar, not the provenance
 * artifact. Offsets in `sourceRefs`/`ignoredRanges` are valid only against the text whose `textHash` matches — drift
 * → needs-relink (§9).
 */
export type AnchorSourceMeta = Omit<AnchorMeta, "warnings">;

/** §1 — the provenance artifact (one file per encoding+version; links captured at authoring time, never reconstructed). */
export interface ProvenanceArtifact {
  schemaVersion: "1.0"; // pinned; a future schema introduces a versioned union rather than widening this
  policyId: string;
  policyVersion: string;
  anchorSource: AnchorSourceMeta;
  items: Item[];
  ignoredRanges: IgnoredRange[];
  clusters: Cluster[];
}

export const PROVENANCE_SCHEMA_VERSION = "1.0";
