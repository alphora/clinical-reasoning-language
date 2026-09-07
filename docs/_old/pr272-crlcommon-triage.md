# PR #272 "Review of CRLCommon" — triage under the compilation-artifact lens

**STATUS:** triage / assessment (2026-08-12, **revised after the crl-emit panel round — disc 416**). NOT a merge
and NOT a design-of-record. Sorts Bryn Rhodes' +1049/−101 proposal under the §0 compilation-artifact principle
(`feedback_emitted-cql-is-compilation-artifact`) into: (A) correctness fixes that are lane-independent and
landable now, (B) correctness coupled to a dependency decision **or** to the CEL-emit contract, (C) emit-flip
*direction*, (D) deprioritized aesthetics. The PR stays OPEN as design input; we cherry-pick, we do not merge
the library wholesale.

> **Panel round (disc 416):** `ask_gpt56` (crl-emit) returned 4 [critical] + 5 [important]; the
> `vibe-reviewer-crl-emit` (Fable) arm returned 5 [important] + 2 [nit], with a unique **lane-attribution**
> analysis (it read the CEL FHIR emitter, which neither the first draft nor gpt56 did). Both arms independently
> reached the two biggest conclusions — split bug #1 into bucket A, and move the NotDoneWithReason reason-axis
> to B. Every point was verified against the code before adoption; no point was rejected. This revision folds
> them in.

---

## §0. What was verified (so none of this is theoretical) — three evidence tiers

The §0 lens requires checking every claimed bug against **what the emitter actually emits** before calling it
ours. "A catalog row exists" is NOT that proof (some rows are matcher-deferred). The real chain, at the code
level:

1. **CRLCommon.cql ships verbatim into every emitted policy's `cql/` folder** — `loadCatalog.ts` ("always ships
   [these] into every policy's `cql/` output"). A bug in a function reaches the consumer as-is.
2. **The emitter maps canonical pattern names 1:1 onto `CRLCommon.<name>` calls** — `functionNameFor`
   (`emitCQL.ts:248-256`) is an identity map with exactly two overrides (`Last→LastOf`, `First→FirstOf`), and
   the call is emitted at `emitCQL.ts:1885` (`return \`CRLCommon.${fn}(${args})\``). *(There is no `matcher.ts`
   — both panel arms cited one; verified absent, mechanism is the two emitCQL sites above.)*
3. **The bug bodies are all present in in-tree v0.2.0** (`CRLCommon.cql:101, 221-225, 237-252, 271-273, 422-440,
   590-598`).

Grade reach by tier (do not overclaim — this replaces the first draft's blanket "catalog row ⇒ reachable"):

- **Tier 1 — shipped AND called in current goldens** (strongest): `Between` (`cms22/Cms22Inferred.cql:64,73,76`
  — note **`Between(…, 120, 129)`**, a *live* instance of the half-open bug excluding a systolic of 129 from the
  120–129 band), `WasOrdered` (`:150,153,169,180,186,195`), `Justified` (`:192`; `cms69` `:70,80,90,105,…`),
  `NotDoneWithReason` (`cms22:276-301`), `ComponentOf` (`cms22:28,31,46,49,103,106`), `During`/`SameDay`/`LastOf`
  (`cms22:18,202,40,97`).
- **Tier 2 — matcher-reachable, not in current goldens.**
- **Tier 3 — present in the library/catalog but matcher-deferred** (`inference-pattern-catalog.md:253-254,
  287-288` `<!-- #99 deferred -->`): top-level `Within`, `BetweenAnchors`, and others. A bad body here can still
  make the library **unloadable** even uncalled (loadability is ours), but it cannot produce a runtime wrong
  answer until something emits a call. Keep the two claims distinct.

Conclusion: the correctness defects are **real and shipped**, Tier-1 for the ones that matter. But *which lane*
each bug bites is a separate question the first draft never asked — and the answer (next section) moves work
between buckets.

---

## §0a. LANE ATTRIBUTION — the CEL-emit contract (new; the round's key finding)

Per the charter (`CRL-NORTH-STAR.md` §2/§4) the **canonical production round-trip is CEL-emitted FHIR ↔ emitted
CQL**. So a correctness fix only helps the local lane if the CEL emitter actually *writes* the field the CQL
predicate reads. Checked against `emitFhir.ts`:

- **Dates are emitted as the DateTime choice** — `Observation.effectiveDateTime`, `Procedure.performedDateTime`,
  `ServiceRequest`/`MedicationRequest.authoredOn` (`emitFhir.ts:356-366`). So **bug #1's `as Period` NULL-drop
  breaks the canonical production lane today**, not merely real-world charts. This *raises* #1's urgency.
- **Condition carries `recordedDate`, never `onset`** (`emitFhir.ts:358`). Every onset-reading function
  (`During(Condition)`, `Active(over)`, `AsOf`, `OnOrBefore`, `HasHistoryOf`, `Overlaps(Condition)`) matches
  **nothing** against CEL output — and `onset.toInterval()` of an absent element is still null, so `toInterval`
  does **not** fix this. This is a three-axis (value/path) round-trip mismatch: *CEL writes `recordedDate`, CQL
  reads `onset` — pick one.* It is a bucket-B/C item in its own right.
- **Positive facts get NO `status`** — the CEL emitter writes a status only for `intent==="absent"`
  (→ `entered-in-error` / `doNotPerform`) or `"negative"` (→ `stopped`) (`emitFhir.ts:554-571`). Therefore
  `WasOrdered`'s `R.status in {…}` conjunct and `IsVerified(Observation)`'s `O.status in {…}` filter
  **null-drop every CEL-emitted positive record**, before *and* after the bucket-A widenings. Two consequences:
  1. A bucket-A "$apply smoke over any fixture" can be **vacuous** for exactly these functions — the CEL fixture
     never reaches the changed code path.
  2. **The accepted value-sets in CRLCommon and the default fields/statuses the CEL emitter writes are two halves
     of ONE contract** and must be co-designed. That contract is the emit-consistency cluster's job
     (`project_cel-emit-consistency-cluster`). This is why bucket A is smaller and more cluster-coupled than the
     first draft drew it.
- **not-done maps to `statusReason`** (`emitFhir.ts:610`) while the fixed CQL reads `reasonCode`, and CEL's
  refusal shape is `doNotPerform: true` with no `status` (`:559-565`) while the fixed predicate wants
  `status='revoked'`. So `NotDoneWithReason` never matches CEL output even after the PR's "fix." (Side issue:
  `ServiceRequest.statusReason` is not an R4 element — CEL is writing an invalid field; file separately.)

**The reframe:** bucket A = fixes that are correct **and non-vacuous independent of the CEL contract**;
everything whose *benefit* is gated on CEL writing a field moves to B (cluster-coupled).

---

## §1. Bug inventory (severity, tier, lane, dependency)

| # | Defect (PR REVIEW n) | What breaks | Reach | Bucket (revised) |
|---|---|---|---|---|
| 1 | **`X as Period` choice-cast** | DateTime-recorded times cast to `Period` → NULL → drop out of every temporal filter. **Bites the canonical CEL lane** (dates are DateTime). | Tier 1 (`During`/`SameDay`/`LastOf`-scope in cms22/69). | **A** via a **local normalizer** (see §2); **B** = swap to `FHIRCommon.toInterval` include. |
| 2 | **Unsorted `Last()`/`First()`** | selection returns retrieve-order, not the intended extreme. **But** `MostRecent`/`Earliest` are catalog-*temporal* (`catalog:648,669`) while `Last`/`First` are catalog-*positional*, "not necessarily temporal" (`catalog:657`, anti-example `:654`). | Tier 1 (`LastOf` cms22). | **Split:** `MostRecent`/`Earliest` → sort = correctness (A/B per dep); `Last`/`First` → **design question** (what sequence orders them?), not a chronological fix. |
| 3 | **`Between` half-open** | upper bound silently excluded from every stated range. | Tier 1 — **live** at `cms22:64` (`120,129`). | **A** — pure `< hi`→`<= hi`, lane-independent. |
| 4 | **`Justified` `singleton from`** | runtime **throw** when >1 reasonCode. | Tier 1 (`cms22:192`). | **A** — existential; a throw-fix is always correct regardless of lane/matching. |
| 5 | **`WasOrdered` intent-narrow** | misses 4 order intents. | Tier 1. | **A-safe to land, benefit gated on CEL status** (§0a) → co-design with the cluster. |
| 6 | **`IsVerified` confirmed-only** | drops records; **diverges from our OWN catalog** — `catalog:627` specifies `{null, confirmed, unconfirmed, provisional, differential}`, i.e. **absent must pass**. | Tier 1/2. | **A** as *conform-to-catalog* (absent-passes is the lane-critical part — CEL writes no verificationStatus on positives). Honor the Observation-`status` vs Condition-`verificationStatus` split. |
| 7 | **`NotDoneWithReason` ignores `reason`** | reason never read; `completed` counted not-done. | Tier 1 (`cms22:276-301`). | **Split:** status-list correction → **A**; `reasonCode` matching → **B** (CEL writes `statusReason`+`doNotPerform`, §0a). |
| 8 | **`ComponentOf(panel, List<Obs>)` discriminator** | matches only if patient independently has a standalone obs of the code. | Tier 1 (`cms22:28,…`). | **B** — emitter retarget to a `System.Code` overload, and it is **representation-aware** (which representation's code/system: local-canonical vs source). |
| 9 | **`InpatientStay(includePrelude)`** inert flag | flag has no effect. | Tier 3 (matcher-deferred). | **C** — the intended prelude semantic is a catalog question. |
| 10 | **Window-from-anchor anchor-collapse** | multi-encounter anchor → one visit. (`AgeAt(List<Encounter>)` shares this.) | Tier 1/2. | **C** — per-anchor pattern shape; addressed by the timing-phrase direction (§4). |

---

## §2. BUCKET A — lane-independent correctness fixes, landable now

Do the **whole set**, not a subset (`feedback_dont-narrow-scope`). All are local edits to `CRLCommon.cql`, no new
`include`, no emitter change — *except* they must respect the §0a contract (below).

- **#3 `Between` inclusive** — `< hi`→`<= hi`, all four overloads. (`Normal`/`Abnormal` stay half-open — a
  reference-range convention, not the same bug.) Fully lane-independent.
- **#4 `Justified` existential** — `singleton from` → `exists (A.reasonCode RC …)`, all six overloads. Fixes a
  runtime throw; always correct.
- **#6 `IsVerified` — conform to `catalog:627`** — accept `{null, confirmed, unconfirmed, provisional,
  differential}` for Condition (`verificationStatus`, absent passes) and the widened set for Observation
  (`status`). **Absent-passes is lane-critical**: CEL writes no verificationStatus on positive Conditions, so
  the current `~ "Confirmed"` null-drops them. Zero-dep (inline the code set; do NOT need the PR's FHIRCommon
  delegation for this).
- **#7 `NotDoneWithReason` — status-list correction ONLY** — drop `'completed'` from the not-done sets. The
  `reasonCode`-matching half moves to B (it disagrees with CEL's `statusReason`/`doNotPerform` shape, §0a).
- **#1 `as Period` — via a single LOCAL normalizer** (see below).
- **#5 `WasOrdered` intent widen** — safe to land (breaks nothing), but its *benefit* is gated on CEL writing a
  `status` (§0a); flag it as co-design with the cluster rather than a clean win.

**Bug #1 the dependency-free way — vendoring, not reinvention.** The first draft offered only "adopt FHIRCommon"
vs "hand-roll (re-bugs)". There is a third option both arms surfaced: define **one** local
`toInterval(choice)` in CRLCommon — ideally a **verbatim, attributed copy** of FHIRCommon's body (a
pinned-source comment) — covering `dateTime`/`instant` (point interval), `Period` (via `FHIRHelpers.ToInterval`),
and `Timing` (explicitly supported or explicitly null), route **all** the `as Period` call-sites through it, and
unit-test each choice arm. §0's "don't reinvent" warning targets reinvention of *semantics*; a verbatim copy
carries only copy-drift risk, small for a stable normalizer and **fully reversible at the flip** (swap the local
body for the `include`). This lands the highest-impact fix on the canonical lane now instead of parking it
behind a packaging decision. (Note: the `as Period` → `.toInterval()` change does NOT rescue `Condition`, which
CEL emits as `recordedDate` with no `onset` — that is the §0a path mismatch, a B/C item.)

**Bucket A landing caveats** (stronger than the first draft's "$apply smoke"):
- Each edit touches a shipped library → `CRLCommon` version bump + regenerate + golden check.
- **Targeted boundary tests, not a generic smoke:** upper endpoint (129); multiple `reasonCode`s; each order
  intent; absent/each verification status; each not-done status; and a **false-positive ordering-reason** case.
- **Lane-aware fixtures:** because CEL omits `status` on positives (§0a), a fixture must actually exercise the
  changed path or the test is vacuous — several of these fixes cannot be validated on today's CEL output until
  the cluster gives positives a status. Record that explicitly.

---

## §3. BUCKET B — coupled to the FHIRCommon/USCoreCommon dependency, OR to the CEL-emit contract

**Dependency-coupled:**
- **#1 swap to `FHIRCommon.toInterval` include** (replacing the vendored local body) — the clean end-state.
  Conditions to satisfy **before the flip depends on it** (neither the PR nor §0 has verified these):
  - The claim that `toInterval` "normalizes the whole choice type" is an **unverified external-API claim** — check
    the actual `2.0.0` body for `Timing`/`instant`.
  - **Model-info compatibility:** `hl7.fhir.us.cql.USCoreCommon` may be authored against the **USCore modelinfo**,
    not the FHIR model — if so, `List<FHIR.Observation>.chronologically()`/`.resulted()`/`.systolic()` may not
    type-resolve from a `using FHIR` library at all. Compile-check with `tmp/cqf-fhir-cr-cli-4.7.0.jar` (the
    local recipe) before committing.
  - **Packaging:** ship-whole (`loadCatalog.ts`) means emitting FHIRCommon/USCoreCommon **source + their
    terminology declarations** into every policy and resolving them through the `$apply` harness; `2.0.0-cibuild`
    is a moving target.
  - Recommendation: **prefer verified FHIRCommon reuse at the flip IF a pinned, packaged dependency passes
    translation + `$apply`; otherwise keep the vendored local normalizer.** That is stronger than "hand-roll from
    intuition" without making adoption axiomatic.
- **#2 sort** — `MostRecent`/`Earliest` want a chronological sort; the clean form is `USCoreCommon.
  chronologically()` (same dependency caveats), or a local `sort by start of …toInterval()` (which re-drags in
  #1's normalizer — so **`EarliestOf` is NOT dependency-free**, correcting anyone tempted to cherry-pick it).
  `Last`/`First` are a **design question**, not this fix.

**CEL-contract-coupled (the emit-consistency cluster owns these):**
- **The accepted-value-set ↔ CEL-emitted-field/status contract** (§0a) — `WasOrdered`/`IsVerified(Obs)` status,
  the Condition `onset` vs `recordedDate` path, positive-fact status defaults. These are the round-trip's real
  substance and cannot be closed inside CRLCommon alone.
- **#7 reason axis** — align CQL `reasonCode` read with CEL `statusReason`/`doNotPerform` write (+ the invalid
  `ServiceRequest.statusReason` bug).
- **#8 `ComponentOf` Code retarget** — representation-aware lowering (which representation's code/system);
  needs round-trip tests for local-only, source-only/additive, and multi-representation component coding.

---

## §4. BUCKET C — emit-flip DIRECTION to record

Answering the operator's "have we already addressed the related things": **No — the orbiting parts are the
#189-*deferred* ones.** Concern #4 (timing phrases + anchor/window sub-grammar) and the value-comparison surface
are the deferred consuming predicates (window/threshold/count/sum — `project_emit189` §C). We shipped the
`count … at least N` *grammar* validate-only; **no** emit for these or temporal windows. So #272 is largely
*how the emitted CQL should look when we build that* — flip input.

Record as flip principles (on merit per §0):

- **Native timing phrases over named temporal functions (Bryn #4)** — MERIT **where more correct/robust**, not
  for looks. The PR's v0.6.0 time accessors (`relevantInterval()`, `authorDateTime()`) + native timing phrases
  (a) dissolve the anchor-collapse scope error (#10) by keeping the anchor a per-encounter correlation and
  (b) cover the whole generative timing grammar. Strong *direction* for the window-predicate emit; large change,
  belongs with the #189-deferred window work, designed deliberately.
- **The correlation case (Bryn's strongest #3 argument) is answered by the correlated-query emit form, NOT by
  item-level named predicates.** Timing accessors alone correlate by *time*; they do not establish
  `Observation.encounter` membership. The emitter can lower a list-level CRL construct into
  `(X) R with (Encounters) E such that <accessor> <timing-phrase> …` — encounter *scope* still needs the deferred
  language design to define *which relationship* constitutes it. Name the `with … such that` form explicitly as
  the answer; the accessors are necessary but not sufficient. The PR's own v0.6.0 reversal (removing the 18
  item-predicates it added in v0.5.0) concedes item-level named predicates are not the route.
- **The authoring anchor/window sub-grammar critique** is a **separate CRL-design question** feeding the
  #189-deferred window *language*, not an emit-target question. Don't conflate.
- **`anyXxx`/`allXxx` explicit quantifiers — REJECT as written / needs redesign** (not merely aesthetic naming).
  The PR's `all` form `not exists ((values) V where not (P(V)))` + "vacuously true on empty list" **conflicts
  with closed-world null-totality** (`CRL-NORTH-STAR.md` §3/§4: absence = empty/false; every boolean total; null
  handled per operand before `not`). A null operand under the double-negation leaks a wrong `true`. If explicit
  quantifiers are wanted, they must be totalized ("non-empty AND every operand comparable AND satisfies"). The
  *naming* is deprioritized (D); the *implementation as written* is unsafe (reject).
- **Fluent invocation surface (Bryn #2)** — **near-zero priority** (§0). ~40 fluent siblings are a maintenance
  surface for an artifact nobody hand-maintains; skip unless free.
- **List-level vs item-level (Bryn #3)** — **keep list-level primary.** Charter-consistent (a concept's CQL is
  context-free; the emitter composes `exists` per declared value type). Adopt item-level only via the correlated
  emit form above, surgically.

---

## §5. BUCKET D — explicitly deprioritized (recorded, not dropped)

- "Emitted CQL should read as though a skilled KE hand-wrote it" — downgraded from north-star to nice-to-have by
  the operator (§0). Never a design driver.
- Fluent style (Bryn #2); item-level-everywhere (Bryn #3) — see §4.

---

## §6. Corrected classification of the "two different readings" claim (hallucination check)

The first draft (and Bryn) called the list-level comparator issue "a **live defect** — 'Last Systolic Below 120'
AND 'Last Diastolic Below 80' can be satisfied by two *different* readings." **In the actual emitted content this
cannot occur:** both chains derive from ONE selected panel — `{ CRLCommon.LastOf(...) }` is a deliberately
constructed **singleton** list, and both component extractions run against that same panel
(`cms22:39-61`). The existential in `Below(values, …)` ranges over the components of a single panel.

It is a **latent trap** if the emitter ever passes a genuine multi-element list, and the scalar-overload
direction is still right — but record it as **flip hygiene/robustness**, not a shipped defect. (Adopting Bryn's
"live defect" phrasing unverified was exactly the over-statement the operator's skepticism directive guards
against.)

---

## §7. Also-missed / housekeeping (from the panel)

- **`Active(Condition)` recurrence/relapse widening** (PR marks BEHAVIORAL) — same family as #5/#6
  (too-narrow code set). Either an A-widen candidate or an explicit reject ("recurrence/relapse admission is a
  clinical call needing KE input"); do not silently omit it (`feedback_dont-narrow-scope`).
- **`AgeAt(List<Encounter>)`** shares #10's anchor-nondeterminism → C.
- **`EarliestOf` is NOT dependency-free** (uses `.toInterval()`) — correct any cherry-pick temptation.
- **`Exceeds` signature retype** (`Quantity`→`System.Quantity`) — residual disambiguation hunk; rides the
  no-wholesale-merge stance.
- **`ServiceRequest.statusReason` invalid in R4** — CEL-emitter bug; file separately.

---

## §8. Recommended actions

1. **Land BUCKET A** as a small, self-contained CRLCommon correctness pass — its **own panel round**, version
   bump, targeted boundary tests + lane-aware fixtures, golden check. Includes the **vendored local `toInterval`
   normalizer** for #1 (highest-impact, canonical-lane). Independent of #236 and the flip; slot as a fast
   follow-on or fold into the cluster's first commit.
2. **Fold BUCKET B into the emit-flip / cluster design** — the FHIRCommon adoption swap (gated on the §3
   compile/packaging checks), the CEL-contract items (status/onset-path/positive-status), the reason axis, and
   the `ComponentOf` representation-aware retarget.
3. **Carry BUCKET C** (timing-phrase direction + correlated-query form; the deferred window/threshold predicates;
   the `allXxx` totality redesign) into the #189-deferred window work with #272 as named input.
4. **Leave PR #272 OPEN** as design input; do not merge wholesale. Any acknowledgement is an operator-posted
   comment — HOLD for operator OK (outward-facing).

---

## §9. Cross-refs
- `docs/emit-followups-236-238-272.md` §3 — parent assessment.
- `feedback_emitted-cql-is-compilation-artifact` — the §0 lens.
- `project_emit189-cel-boolean-value` §C — the deferred window/threshold predicates #272 concern #4 overlaps.
- `project_cel-emit-consistency-cluster` — where BUCKET B (dependency + CEL-contract) lands.
- `packages/crl/src/cel/emitter/emitFhir.ts:356-366,554-611` — the CEL-emit lane facts (§0a).
- `packages/crl/src/cql-emitter/catalog/inference-pattern-catalog.md:627,648,657,669` — the IsVerified set and the
  MostRecent/Last/Earliest semantics.
- `packages/crl/src/cql-emitter/catalog/loadCatalog.ts` — proves ship-whole.
- disc 416 — this triage's panel round (accept/refine/reject log).
