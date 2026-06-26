# Provenance Artifact — Design Specification

**Status:** design-complete (converged). **Serves:** the editor *validation cockpit* ([#156](https://github.com/alphora/clinical-reasoning-language/issues/156)). **Schema source:** KE recommendations ([#159](https://github.com/alphora/clinical-reasoning-language/issues/159)). **Reviewed:** SW design-review rounds 1 & 2 + KE consult.

The provenance artifact links the policy **narrative** ↔ **CRL** ↔ **CEL** so the agent's translation is auditable —
a three-pane synced view making coverage (missed criteria) and over-reach (invented logic) mechanically derivable.
Locked decision: **structured artifact (data), not a new language** (provenance is derived relational metadata;
reuse the CRE addressing).

---

## 1. Artifact
One file per encoding+version (sidecar; links **captured at authoring time**, never reconstructed post-hoc):
```jsonc
{ "schemaVersion": "1.0", "policyId": "RX501.147", "policyVersion": "2026-05-15",
  "anchorSource": {…/*§6*/}, "items": [/*§2*/], "ignoredRanges": [/*§4*/], "clusters": [/*§3*/] }
```

## 2. Items
```jsonc
{ "id":"n1", "origin":"source", "text":"Adults (18+) with moderate-to-severe Crohn's",
  "sourceRefs":[{"start":412,"end":489}],          // ARRAY; utf8-byte half-open
  "role":"criterion", "roleStatus":"reconciled",   // §2.1 — provisional | reconciled
  "linkRequirement":"must-link-decision",          // §2.2 (derived from role)
  "rationale":"…",                                 // required for non-decision roles; names the disposition class (§4)
  "drivesDetermination":[{"determination":"n2","polarity":"present-drives","expectedDisposition":"deny"}], // §2.4
  "authoredKind":"modeling-rationale", "supports":{"cluster":"c4","items":["n1"]} }   // origin:authored only (§2.3)
```
`origin:"source"`⇒≥1 `sourceRefs`; `origin:"authored"`⇒none.

### 2.1 `role` (per-CLAUSE) + the precedence LIFECYCLE
`criterion | determination | applicability | workflow-precondition | administrative | definition`.
- **Roles are assigned PROVISIONALLY by surface vocabulary, then RECONCILED.** The precedence rule —
  *decision-participation beats surface vocabulary* — is **not authoring-time foresight; it is enforced by the §9.2
  reconciliation loop**: when a provisionally-`applicability`/`administrative` span links to a node that is
  structurally part of the decision (§5 reachability), the validator forces re-classification to `criterion`/
  `determination` and sets `roleStatus:"reconciled"`. (This dissolves the round-2 circularity: role is an iterative
  fixpoint over linking, not a one-shot guess. Grounded in `sur716-011`'s state-mandate branches.)
- **Decision roles** = `{criterion, determination}` (criterion covers exclusions/contraindications).
- **`applicability` vs `workflow-precondition`:** route-elsewhere ⇒ `applicability` (rx501-147 self-administered →
  pharmacy; gender-reassignment → SUR717.001); submit/complete-then-pend ⇒ `workflow-precondition` (sur716-011 docs → pend).
- **`definition`** — meaning-bearing terminology constraining concept identity ("reconstructive"; "injury"=to-the-breast).
- **`administrative`** + optional subtypes `coding | pa-meta | background | disclaimer | versioning`.
- Non-decision roles require `rationale`. **Ambiguity calls:** "MA members only"→applicability (criterion if this
  policy denies non-MA); "PA required"→administrative (workflow-precondition if it specifies accompaniment; split if both);
  "not MN if X"→**split** (X=criterion, "not MN"=determination); same split for experimental/investigational/excluded-when-X.

### 2.2 `linkRequirement` (derived per role): `must-link-decision` (criterion, determination) | `may-link-concept` (definition) | `rationale-only` (applicability, workflow-precondition, administrative). (`no-link` reserved/unused for now.)

### 2.3 `authoredKind` (origin:authored): `modeling-rationale | clinical-assumption | derived-glue | implementation-artifact`. `supports` = `{cluster, items[]}`; the authored item must be a member of that cluster, and it suppresses over-reach ONLY for nodes in that same cluster (§4).

### 2.4 `drivesDetermination` (criterion items only) — a STRUCTURAL assertion, validator-checked (§9): `[{determination: itemId, polarity: "present-drives"|"absent-drives", expectedDisposition: "approve"|"deny"|…}]`. §9 verifies the criterion's linked CRL node is an **ancestor** (nodeId-prefix containment) of the determination's node — documentation alone is not faithfulness.

## 3. Clusters (COVER, not partition)
`{ id, label /*free-form, non-semantic*/, items[], crl:[NodeRef], cel:[NodeRef] }`. Items+nodes may repeat across clusters.

## 4. Node refs + coverage (TWO senses)
crl NodeRef: `{ lib, kind, name, nodeId?, nodeKind /*§5 derived*/, ownership /*§5*/, relation, status, relinkHints? }`.
cel NodeRef: `{ file, kind, caseId, relation, status }`.
- **status** (per-ref): `linked | provisional | needs-relink | intentionally-unlinked`.
- **relation** — crl: `implements-criterion | composes-criteria | implements-determination | recommends-disposition | defines-concept`; cel: `tests-branch | tests-otherwise | asserts-fact`.

**Counting:** only `status:"linked"` refs count. `provisional`/`needs-relink` are excluded-but-surfaced (a `must-link-decision` item whose only link is provisional **still reads as missed** — a provisional link is not proof). `intentionally-unlinked` is **illegal for `must-link-decision` items** (closes the escape hatch where a real criterion is silenced); for other roles it suppresses + requires rationale.

**(1) Decision-implementation coverage** — `decisionImplemented(item)` := ∃ a counted cluster containing `item` with a **CRL ref** of `relation ∈ {implements-criterion, implements-determination, recommends-disposition}` AND `nodeKind ∈ {leaf, decision-node}` AND `ownership:"policy-owned"`. (NOT generic cluster membership — a cluster with only CEL/definition/wrong-relation refs does NOT satisfy it.) *Missed₁* = a `must-link-decision` source item with no `decisionImplemented`. applicability/workflow-precondition MUST NOT decision-implement (forcing it = a phantom Deny).

**(2) Source-acknowledgement coverage** — every source span must be classified. **Denominator** = the canonical `anchor-source` text; the **union of all `origin:"source"` `sourceRefs` + `ignoredRanges` MUST cover it** (modulo a defined whitespace/boilerplate rule). `ignoredRanges: [{start,end,reason}]` (page numbers, headers/footers, etc.). *Missed₂* = any anchor-text span in neither a `sourceRefs` nor an `ignoredRange`. A non-decision span is acknowledged only with a role **+ a disposition-class rationale**: `route-elsewhere | pend | presumed-scope` (applicability/workflow-precondition) or `no-operational-disposition` (administrative/definition). Operational consequences ("requests without docs are denied/not reviewed") → metadata on the item; CRL still emits no clinical Deny.

**Over-reach** = `policy-owned` nodes of `nodeKind ∈ {leaf, decision-node}` in no counted cluster — EXCLUDE `inference`, `shared-reference`, and (default) `terminology`/`parameter`. Suppressed iff clustered with an `origin:authored` item whose `supports` names that cluster.

**Composite mis-tag invariant (state explicitly):** a real criterion mistagged as non-decision is caught by the *union* of three mechanisms, not one — (a) §9.2 structural flag (if it links to a decision node), (b) over-reach (the decision node it should implement is then unclustered → flagged), (c) §9.1 regex (if it carries MN language). The two-sense coverage alone does NOT catch mis-tags; **completeness reduces to classification-correctness**, protected by these three.

## 5. AST provenance indexer (net-new)
Walks the AST (declarations via the closure resolver `celSymbolsIndex` — NOT the isCrlProject-gated ProjectIndex, #147; decision sub-nodes via a shared static `decisionSpine` walker that reproduces the CRE `childId` scheme byte-for-byte, golden-tested for id-parity against the scenario view-model rather than refactoring it). Emits:
- `resolveCrlNodeRef({lib,kind,name,nodeId?}) → LsLocation | unresolved` (net-new).
- **`nodes`**: `Map<NodeKey, IndexedCrlNode{ref, declKind, nodeKind, ownership, location}>` — the inventory of every indexable node (declarations + every decision sub-node), the over-reach denominator. `NodeKey = JSON.stringify([lib,kind,name,nodeId??null])` (injective).
- **`decisionReachability`**: `Map<NodeKey → {reachedBy: Set<NodeKey>, edges:[{fromDecision, fromNodeId, relation: StructuralRelation, via?}]}>` — STATIC (a node is decision-reached iff structurally referenced anywhere in a decision subtree — `when`/`otherwise`/`action`/guard, transitively through `defined as` inference, `definition is` narrative refs, `use decision`, and a reached activity's terminology), independent of any CEL run; roots = the `coversTarget`'s decisions. `StructuralRelation` (when-condition|guard|recommend|use-decision|inference-operand|definition-narrative|activity-dependency) is distinct from the artifact's authoring-intent `relation`. (Distinct from the CRE runtime trace, which only walks *reached-for-given-facts* paths.)
- **nodeKind** (pure fn): Concept+`defined as`→inference; plain/`code is`/`coded from`/`definition is`→leaf; policy-owned Activity→leaf; Terminology→`terminology` / Parameter→`parameter` (distinct tags — both over-reach-excluded; NOT `leaf`, since a `leaf` is an over-reach *candidate*); Decision sub-node (and a whole-Decision ref)→decision-node; resolved-via-shared-lib→shared-reference (overrides — but the indexer's node inventory retains the intrinsic `declKind` alongside, so the override doesn't erase the semantic kind). decisionReachability also walks `definition is` narrative concept-refs (a concept used only there is still structurally reached).
- **ownership mapping (manifest-based; engine resolver authoritative):** `shared-reference` ⇔ the library is declared in the policy `package.json` `crl.sharedLibraries[]` (by library name) OR resolves from a package (origin `package`/node_modules); else `policy-owned`. (Supersedes the earlier "by resolved path" wording: the corpus vendors shared libs as local siblings, indistinguishable by `IndexedDeclaration.origin` — both `local` — so an explicit manifest is the signal; the package arm is forward-compat.) The indexer anchors on `coversTarget` as the policy and **warns** on any local library that is neither the covered policy nor manifest-declared (silent `policy-owned` default would cause false over-reach / false decision-implement).

## 6. anchor-source canonicalization (net-new tooling; CRL-tools capability, KELP-invoked)
Deterministic read-only canonical-TEXT rendering of the immutable `refined-source` (.docx). Metadata block: `{ path, derivedFrom, derivedFromHash, canonicalizer, canonicalizerVersion, textHash, offsetUnit:"utf8-byte", unicodeNormalization:"NFC", rangeConvention:"half-open" }` (sidecar `<name>.anchormeta.json` — never an inline header, which would live inside the offset space). Determinism contract (golden-tested): pinned extractor+version; document order; explicit headers/footers/footnotes/tracked-changes policy (v1: body + tables only — verified safe: the real refined-source `.docx` carry empty footnotes/headers; warn if an excluded part ever holds text); **`<w:t>` content taken verbatim (never whitespace-collapsed; `xml:space` ignored), runs/`<w:t>` concatenated with no separator**; fixed `\n` line-endings; **NFC before hash+offsets**, but otherwise **preserve visible characters — do NOT lossy-fold smart-quotes / nbsp / dashes** (ASCII-folding would shift offsets off the text a human sees); utf8-byte half-open. JS is UTF-16 → consumers MUST use `sliceUtf8Bytes` / `byteOffsetToDisplayRange` (col = UTF-16 code units; hard-error on a mid-char offset), never `text.slice`.

## 7. CEL case addressing
Add a stable `CELCase.caseId` to the grammar (bounded, like #135 — DONE, T4.2). Provenance addresses by `caseId` (name = display). Relink-on-rename rejected (no CEL rename provider). Fact ids deferred.

**Grammar-optional / provenance-mandatory (SETTLED).** `caseId` is optional in the grammar, but a case that is *referenced by provenance* MUST carry an **explicit, frozen** `- id is "..."`. The deterministic ordinal `k<index>` (`effectiveCaseId`, T4.2) is a PROVISIONAL fallback only — it is **position-dependent** (insert/reorder silently re-points it), so it must never be a durable provenance address.
- **Mechanism = author-time, NOT silent emit-time write.** The producer authoring an artifact authors the explicit `caseId` as part of authoring the case (refuse-emit: a provenance ref to a case lacking an explicit id is a validator finding — `provenance-references-unfrozen-case`, §9). The provenance emitter NEVER silently writes ids into a `.cel` as a side-effect.
- **No legacy migration.** CRL/CEL is unreleased — there are no field `.cel` to back-fill, so there is NO migration tool. Existing corpus `.cel` simply get explicit `- id is` authored in when they first carry provenance (it's authoring, not migration). The ordinal `effectiveCaseId` (T4.2) survives ONLY as a transient display fallback for un-provenanced cases (e.g. the scenario runner) — never a durable address.
- **§8 boundary (SETTLED):** freezing a case *identity* is **outside** §8's "no auto-migration" prohibition (which scopes to refined-/anchor-source *offset* relink across versions). Identity-minting is orthogonal to offset migration. The "no silent source mutation" spirit is honored by the author-time mechanism above.

## 8. Versioning + relink
`refined-source`/`anchor-source` immutable per version; offsets valid only within a version. New version → **diff-assisted relink**, NOT auto-migration; triggered by **content/hash mismatch**, never path/name-lookup-success (stale `nodeId` resolves to the wrong node). `relinkHints` (rename AND split/merge/branch-reshape) are **provenance-only, non-authoritative, non-covering** — never satisfy a link alone; missing/stale → manual `needs-relink`, never auto-accept. **Match rank: name → code/text → shape** (shape tiebreaker only — the K1 split changes shape while preserving the criterion).

## 9. Validators
- **Referential integrity** — refs resolve via the **engine's resolution path** (so shared-references resolve).
- **Content-hash drift** — `anchorSource.textHash` + per-item `text`-vs-bytes → `needs-relink` on mismatch.
- **Source-acknowledgement** — `sourceRefs ∪ ignoredRanges` covers the anchor text (§4-2).
- **linkRequirement** — each item satisfies its requirement (drives §4 sense-1).
- **drivesDetermination structural-faithfulness** — for each edge, assert the criterion's linked CRL node is an **ancestor** (nodeId-prefix containment) of the determination's linked node, with matching `polarity`/`expectedDisposition`. (This is the mechanism §2.4/§4 claim.) `drivesDetermination` is OPTIONAL per determination: a catch-all (`otherwise`) determination — the default disposition with no triggering criterion — legitimately has **no** driving edge, and the validator does NOT flag its absence. (Confirmed on rx501-147's otherwise-complement Deny; don't "fix" it by inventing a criterion.)
- **Authored-item discipline** — over-reach suppression requires the authored item ∈ the cluster + `supports` naming it.
- **§9.1 MN-keyword flag** — non-decision items carrying MN/coverage language → manual review. **Hard** (high-signal): medically necessary / not medically necessary / medical necessity / experimental / investigational / unproven / not covered / non-covered / excluded / exclusion / reasonable and necessary / medically appropriate / contraindicat* / criteria (are|not) met / does not meet criteria / (in)eligible for coverage / deny|denied / (not )certified. **Soft**: covered / coverage / authorized / prior authorization / benefit / eligible / criteria. Word-boundaried; match `not covered`/`non-covered` BEFORE bare `covered`. **UX calibration (cockpit #156):** soft matches are COMMON on legitimately-administrative text (routing notes, schedules, coding/benefit disclaimers — 4 of them on rx501-147, all genuinely non-criterial) → the cockpit renders soft (`warning`) findings LOW-PROMINENCE; hard (`manual-review`) is the high-signal tier that demands a look.
- **§9.2 structural flag** — any `applicability`/`administrative`/`workflow-precondition` item linked to a node that is **`decisionReachability`-reached (STATIC, §5 — not the CRE runtime trace)** → forces role reconciliation (§2.1) / manual review. Catches the no-keyword state-mandate case the regex misses.
Composite coverage of mis-tags = §9.2 ∪ over-reach ∪ §9.1 (§4).

## 10. Tooling deliverables (this repo)
AST provenance indexer + `resolveCrlNodeRef` + `decisionReachability` + nodeKind/ownership derivation; `anchor-source`
canonicalizer (KELP-invoked, golden-tested, UTF-8 helpers); CEL `caseId` grammar change + deterministic backfill; the
§9 validator set (incl. drivesDetermination ancestor check, the two-mechanism guardrail, source-ack union); two-sense
coverage derivation.

## 11. Status
KE items (#159) + SW rounds 1 & 2 folded. **Converged** (round-2: additive completeness only, no rejected directions).
Build-ready pending: the anchor-source canonicalizer prerequisite, and (held) Track A (#134). Optional light round-3
confirm of v0.3; otherwise → T4 build.
