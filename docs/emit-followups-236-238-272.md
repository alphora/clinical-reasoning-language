# Emit follow-ups assessment + plan — issues #236, #238, PR #272

**STATUS:** captured assessment + plan (2026-08-12). This is a **working-state capture to be refined**, NOT
yet a design-of-record. It exists so the full reasoning remains available across sessions — deliberately
detailed, not a lossy handoff. The durable *design principle* in §0 will graduate into the charter/design doc
once refined; the *plans* here are the starting point for that refinement.

**Where this sits:** the #189 grammar+validation slice is CLOSED (validate-only; see
`project_emit189-cel-boolean-value` + disc 415). The emit FLIP and the emit cluster
(`project_cel-emit-consistency-cluster` — #255/#110/#253/#214) are the next major arc. The two KEs are
**holding their vsix install until emit works** (they confirm CRL updates by emitting + running `$apply`; a
validate-only slice gives them nothing to test). The three items below were surfaced by the operator as the
things to weigh before diving into the emit cluster. Operator guidance: *"we can do any of it as a fast
follow-on; sequence as makes sense."*

---

## §0. DURABLE PRINCIPLE (operator-established, 2026-08-12) — the emitted CQL is a COMPILATION ARTIFACT

The load-bearing framing that governs how we treat all emit-quality input (including PR #272 / Bryn's review):

> **CRL is the source of truth; the emitted CQL is a regenerated compilation artifact, not hand-maintained
> source.** Therefore:
> - **OURS (drives CRL/emit design):** the emitted CQL must be **correct, loadable, and
>   representation-consistent** — it round-trips against the CEL it is tested with (the emit-cluster goal) — and
>   **readable *enough to verify*** via `$apply`.
> - **THEIRS (the CQL/CQF consumer's lens, e.g. Bryn):** whether the CQL reads as though a **skilled KE
>   hand-wrote it**. A legitimate concern for someone who lives in CQL, but **NOT a CRL-emit design driver**.
>   Chasing CQL aesthetics at the cost of the declarative model optimizes an artifact nobody is supposed to
>   maintain.

**Triage lens that falls out of this:** *"Does it make emit more correct / loadable / consistent?" → include.
"Does it mainly make the CQL prettier / more idiomatic-for-a-CQL-author?" → note it as the consumer's concern
and deprioritize.* Reuse of **correct shared functions** (e.g. FHIRCommon `toInterval`) counts as *ours*
(avoids reinventing + re-bugging), even though it also happens to look more idiomatic — the merit is the
correctness/robustness, not the aesthetics.

This refines the existing CRL doctrine (`feedback_declarative-not-implementation`,
`feedback_grammar-is-source-of-truth`): vocabularies/emit are declarative intent + a compilation target, not
implementation primitives a human curates.

---

## §1. Issue #238 — concept clause ordering — **ALREADY FIXED in-tree (unreleased)**

**The ask (KE, measured on installed vsix 4.92.13):** a `concept`'s clauses had to appear in a fixed sequence
(`type is` → `value type is` → `meta is` → `code is`); any other order was a parse error, AND the diagnostic
named the *following* line ("no viable alternative at input '-type is'") instead of the misplaced clause — so
an author stares at a correct line. The KE briefly concluded `meta is` was *unsupported* rather than
*misplaced* and started designing around its absence. Preferred fix: accept clauses in any order, validate
required/duplicate semantically. Fallback: at least make the diagnostic name the misplaced clause.

**Finding — this is DONE in the working tree** (`packages/crl/src/ast/tests/concept-body-order-independence.test.ts`,
"disc 402 / T4 STEP 1"):
- The fixed line sequence was **removed** — the concept body is now **order-independent**.
- **Cardinality (at most one of each singleton line) is enforced by the BUILDER, FAIL-CLOSED** (a duplicate
  makes `buildCRL` fail so it never reaches emit) — not positionally. This is a stronger guarantee than the old
  sequence gave (a validator-only check couldn't give it, because `emit_cql` does not run the validator).
- The test covers exactly the KE's case: `code` then `meta` then `value type` (append-`meta`-after-`code`), a
  fully scrambled body (code/meta first, type last), `@tag` meta placed first, repeated `meta` keeping source
  order, and duplicate-detection for every singleton.
- Consequence: the misleading "blames the next line" parse error is **gone** (reordering no longer parse-errors
  at all); the only diagnostics now are the builder's fail-closed cardinality errors.
- The "document the ordering rule in concept-layer docs" ask is **moot** — there is no ordering rule anymore.

**Comments on #238:** none.

**Action:** near-zero. (a) locally confirm the cardinality/duplicate diagnostic reads well; (b) **draft a
closing comment** for the issue — "fixed as of disc 402; the concept body is order-independent with
builder-enforced cardinality; lands in the KE's next vsix (currently held pending the emit work)"; (c) operator
posts/closes (OUTWARD-FACING — hold the GitHub post for operator OK). Ships with the deferred vsix; no code
change needed.

---

## §2. Issue #236 — criterion inline-expansion multiplies the emitted DNF (51×) — **REAL must-fix, self-contained emit-mechanics**

**The report (operator/KE):** adopting the kit's `decision-composition` invariant on a real Medi-Cal PA policy
grew its emitted PlanDefinition **51× — 130 KB → 6.7 MB, 2,543 → 121,909 lines**. Nothing is broken
(`$apply` passes **51/51** on the real cqf engine, no `compound-guard-expansion-overflow`). It is a
**cost/scaling report with a proposed remedy**, not a defect.

**Mechanism:** four `defined as` composites over *distinct* criteria were re-grounded into named `criterion`
guards per the kit's clause-2 invariant (correctly — the `Inferred` CQL library + FHIR `Library` **disappeared
entirely**, proving the composites really were hiding the criteria; the visibility is wanted and stays). But
the emitter **inline-expands** each `criterion` into the parent's DNF: a `when` gated by `or` lowers to K DNF
arms with the entire downstream subtree deep-cloned under each; an `and`-of-`or` guard multiplies the arm count
cartesianly. Three `or`-bearing criteria nested inside conjunctions:

| criterion | arms | multiplies |
|---|---|---|
| entry gate (4 request types) | 4 | the entire repeat sub-tree |
| complication list | 6 | the complication branch |
| qualifying BMI — `A or (B and <7-way list>)` | 8 | every documentation-gated branch |

`4 × (6×8 + 8 + 1) + 10 ≈ 238` predicted vs **244 measured** → the model is right. Pure conjunctions cost
nothing; it is specifically **`or` nested inside `and`** that multiplies. Every policy with an `or` sub-term
inside a conjunction pays this, and they get bigger from here.

**Proposed remedy (author-invisible; no logic / truth-function / decision-shape change):** **lower a
`criterion` ONCE as a referenced definition** and have guard sites reference it, instead of inline-expanding it
into the parent DNF. Converts **multiplication → addition**: `4 + 6 + 8` + a parent tree of ~8 actions ≈
**~30 actions instead of 244** (order-of-magnitude estimate from structure, not measured). **It preserves the
invariant's property:** each atom stays a first-class `condition[]`, just one level down, reachable by
following the reference — categorically different from `defined as`, where the atoms are *gone* from the
shipped artifact. A downstream reader can still see which criterion failed.

**Why this is in our scope (not a semantic change):** the kit's "BYTE-IDENTICAL to hand-inlining" guarantee is
about **lowering**, not logic; the author's concern is logical structure (atom set, truth function, decision
shape — all unchanged). How it *materializes* is emit mechanics, which the kit's own `boundary` already assigns
to the emitter ("the numeric emit MATERIALIZATION caps … owned by the EMITTER as resource bounds"). No change
to how authors model.

**Two unknowns to SCOPE FIRST (before any code):**
1. **Is the blowup `first:`-specific?** The reporter observes: `branch-guards` lowers `or` as DNF arms under
   `first:` (needs *ordered* arms), but as **one `cqf-applicabilityBehavior:"any"` group** under `all:`/flat. If
   so, the full expansion may be specific to `first:` and the grouping machinery partly exists already — the
   problem is narrower than it looks. VERIFY against the emitter.
2. **Does referenced-definition lowering partly exist already?** Operator comment: *"I think this applies to
   referenced decisions too (this might be implemented already)."* CHECK whether decisions/`use decision`
   already lower to referenced definitions we can mirror.

**Coupling (operator comment, kit 1.12):** the kit's `decision-composition` rule names #236 **load-bearing** and
records the dependency in-rule — the kit's recommended shape (named `criterion` / compound `or`-guard) is what
*drives* the construct whose inline-expansion this measures, and its tractability at scale **depends on this
landing**. KEs following the kit hit this on real policies **now**. So kit + fix move together.

**After the fix, two kit statements flip (they currently trail the mechanics):**
- `criterion`: *"NOT an emit-arm reducer (it expands, so it does not shrink the DNF)"* → becomes a reducer.
- `branch-guards`: *"NEVER reach for a `criterion` expecting relief — it inline-expands and does nothing for
  the arm count"* → now it *does* provide relief.
  (⇒ another kit schemaVersion bump + hash re-pin + eventual vsix, batched.)

**Why not `use decision`:** the escape hatch exists but is *closed* here — none of these criteria is
shared/source-delegated, and fabricating a determination to buy arm relief is exactly the coupling
`chaining-necessity` forbids. This proposal fills that gap.

**Comments on #236:** (1) "applies to referenced decisions too (maybe implemented already)"; (2) the kit-1.12
cross-link recording the dependency (no code change requested in the comment).

**Effort:** medium. Investigation-first (the two unknowns), then referenced-definition lowering in the decision
emitter + the 2 kit updates + tests. Self-contained; high KE value (real policies are 6.7 MB today).

---

## §3. PR #272 — "Review of CRLCommon" — **design-level emit-quality; mostly INPUT for the flip, not a merge**

**What it is:** a proposal (+1049/−101 on `packages/crl/src/cql-emitter/catalog/CRLCommon.cql`) that: (1) uses
shared libraries incl. FHIRCommon; (2) replaces "temporal functions" with "temporal accessors" emitting CQL
**timing phrases** instead of functions; (3) fixes several CRLCommon function bugs; (4) adds **fluent
functions**; (5) adds **item-level** functions. ~40 new fluent functions: `relevantInterval`, `authorDateTime`,
`ComponentOf`/`SystolicOf`/`DiastolicOf`, `EarliestOf`, `Exceeds`, `anyAtLeast`/`allAtLeast`/`anyAtMost`/
`allAtMost`/`anyBetween`/`allBetween`/`anyExceeds`/`allExceed`/`anyBelow`/`allBelow`, `isOrdered`,
`isPerformed`, `isJustified`, `isNotDoneWithReason`, `isDocumentedAs`, `within`, `componentOf`, etc.

**Bryn Rhodes' review comment (his 4 concerns, least→greatest) + my ON-MERIT verdicts (per §0):**

| # | Bryn's concern | Merit verdict (§0 lens) | How we include it |
|---|---|---|---|
| 1 | Not using shared libs (FHIRCommon/USCoreCommon), **esp. `toInterval()`** | **HIGH — but for correctness/robustness, not aesthetics.** Reinventing interval extraction is a real bug surface. | Emit-flip requirement: runtime layers on FHIRCommon. Caveat: artifact dependency packaging. |
| 2 | Prefix functions, not **fluent** | **Merit, but almost purely aesthetic** ("looks hand-written"). | **Near-zero priority for us** under §0. Optional readability nicety only. |
| 3 | **List-level vs item-level** (emitter is all list-level; risk of two ways to say one thing) | **Partial / needs-experience — Bryn himself hedges.** CRL's list-level, query-free emit is coherent with its declarative pattern model. | **Push back:** keep list-level PRIMARY; add item-level *surgically* only where genuinely needed. His pull toward item-level is exactly the aesthetic §0 says not to chase. |
| 4 | **Functions duplicating language features — timing phrases + the anchor/window sub-grammar** (his biggest) | **Split.** Emit target → native timing phrases has merit **where more correct/robust/engine-optimizable** (not for looks). The *authoring* anchor/window sub-grammar critique is a **separate CRL-design question**. | Emit-flip: prefer native timing phrases when they're more correct. The sub-grammar critique = design input for the **#189-deferred window predicates**, not now. |
| — | Overarching: "emitted CQL should read as though a skilled KE hand-wrote it" | **Downgraded from north-star to nice-to-have** (operator, §0). Never overrides the declarative model. | Note it; do not let it drive design. |

**Answering the operator's "maybe we've already addressed the related things":** **No — the parts that orbit
our work are the *deferred* ones, not the shipped ones.** Concern #4 (timing/anchor-window) and the
value-comparison functions (`Exceeds`/`anyAtLeast`/`between`) **are** the #189-**deferred** consuming predicates
(window / threshold / count / sum — "temporal windows largest"; `project_emit189` §C). We shipped the `count …
at least N` *grammar* (validate-only, IMPL 1) but **not** the emit of these predicates nor temporal windows.
So #272 is essentially a proposal for **how their emitted CQL should look when we build that** — a north-star
input to the emit flip, not a standalone now-task.

**What actually applies NOW (cherry-pick candidates — squarely *ours* per §0):** the discrete **correctness
FIXMEs** in the diff, e.g. `Last()`/`First()` called on an **unsorted retrieve** (returns whatever order), and
an `includePrelude` overload that returns `E.period` on **both** branches. These fix emit correctness
regardless of the larger direction — worth extracting if they map to functions the current emitter actually
uses. (Verify each against what the emitter emits before pulling.)

**Comments on #272:** 1 issue comment (Bryn, above). 0 formal reviews, 0 inline threads.

**Action = a TRIAGE (not a merge):** read the full 1049-line diff under the §0 lens and sort into — (a)
discrete correctness fixes to cherry-pick now; (b) meritorious *direction* to fold into the emit-flip design
(FHIRCommon reuse for correctness; native timing phrases where more robust); (c) the temporal/threshold overlap
to carry into the #189-deferred window work; (d) explicitly-deprioritized aesthetics (fluent style,
hand-written-ness). Produce the triage as a doc/decision for the operator. **Effort:** medium to assess; action
ranges from small (cherry-pick fixes) to large-and-later (adopt the direction at the flip).

---

## §4. RECOMMENDED SEQUENCE (starting point; to be refined)

1. **#238 — close it out.** Verify the cardinality diagnostic locally; draft the closing comment; **hold the
   GitHub post for operator OK** (outward-facing). Cheap; clears real KE friction; grammar-adjacent to the slice.
2. **#272 — triage pass** under the §0 lens (correctness-ours / aesthetics-theirs). Produces: cherry-pick list,
   emit-flip design principles to record, the deferred-temporal overlap note. Doing it before #236 settles the
   emit *direction* first — but it is **independent enough to reorder** (the one real ordering judgment call).
3. **#236 — the must-fix build.** Scope the two unknowns (is it `first:`-only? does referenced-definition
   lowering partly exist?) FIRST, then referenced-definition lowering in the decision emitter + the 2 kit
   updates + tests. High KE value.
4. **Then the emit cluster** (`project_cel-emit-consistency-cluster` — the reconciliation pass first, then
   #255/#110/#253/#214) — the CEL/`$apply`-consistency arc that unblocks the KEs' testing.

**Net:** #238 quick-close → #272 triage (this lens) → #236 build → emit cluster. Nothing is strictly blocking;
the operator explicitly allowed reordering / fast-follow-ons.

---

## §5. Cross-refs
- `project_emit189-cel-boolean-value` — the closed slice + emit design of record (`docs/emit-consistency-189-design.md`).
- `project_cel-emit-consistency-cluster` — the emit cluster + the reconciliation-pass discipline.
- `docs/CRL-NORTH-STAR.md` §4 (emit principles) — where the §0 principle graduates once refined.
- disc 415 — the #189 slice panel logs (through R4 full-slice).
- Kit `decision-composition` (schemaVersion ≥1.12) — records the #236 dependency in-rule.
