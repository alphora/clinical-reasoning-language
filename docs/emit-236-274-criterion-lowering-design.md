# #236/#274 design-of-record — criterion CQL-define-DAG lowering

**STATUS (2026-08-12): DESIGN COMPLETE + twice-reviewed** (crl-emit panel R1+R2, disc 417; both arms converged,
all criticals verified against the code). Metrics **VERIFIED** against real artifacts (§1). **Fix = shape-2
CQL-DEFINE DAG (§2)** — emit each criterion once as a named per-operand-totalized boolean CQL define, referenced
by one `text/cql-identifier` condition. ⚠ The sub-PD / `definitionCanonical` shape (an earlier draft) was
**KILLED as a category error** (§1a) — do NOT resurrect it. **§3 = the resolved atomic BUILD CONTRACT (A–J).**
NEEDS BUILD — no code yet. Operator override 2026-08-12: correctness-first, **#236 is the priority build**. The
two **[HARNESS]** gaps are now **CLOSED (verified 2026-08-12, cqf-fhir-cr-cli 4.7.0)**: (1) the translator
**tolerates forward references** (a define resolves one declared later) → emit needs **no topological sort**; (2)
the CQL engine **memoizes ExpressionDef evaluation per patient context** (a 2⁴⁰-path, non-foldable doubling DAG
evaluated in 2.3 s, not per-reference) → a criterion→criterion DAG is **linear at eval-time**; the caps safely
retire to an eval-time bound and CRE must replicate memoization in its own evaluator. Evidence in §3 D/G and
disc 417.

---

## 1. Problem — verified mechanism

Adopting the kit's `decision-composition` invariant (named `criterion` guards / compound `or`-guards) makes the
emitted PlanDefinition grow ~51× (≈130 KB → ≈6.7 MB) on a real PA policy. `$apply` passes (51/51) — a **scaling**
problem, not a defect. Two amplifiers, both **verified against the code**, and both **recursive**:

1. **Criterion inline-expansion is recursive** — `expandCriteria` → `materialize` replaces each criterion-ref
   leaf with the criterion's *recursively-expanded* body, rebuilding **fresh, disjoint** nodes per use
   (`ast/criterionExpansion.ts:266-320`, header :4-6). Runs at WhenBlock entry
   (`fhir-emitter/decision.ts:683`) **before** DNF. So a criterion carrying `or` throws its disjuncts into the
   parent's cartesian product, and a criterion referencing criteria compounds this per nesting level. The
   atom-cap (`CRITERION_EXPANSION_ATOM_CAP = 1024`) exists specifically to stop the doubling attack
   `C_k := C_{k-1} and C_{k-1}` at C_11 = 2048 (`criterionExpansion.ts:80-82`) — i.e. the expansion is provably
   **exponential** in the worst case; a separate `CRITERION_MAX_DEPTH = 32` bounds alias-chain nesting.
2. **Per-arm subtree clone** — after DNF, `emitCompoundWhenBlock` maps each arm to an action carrying
   `...cloneJson(bodyFields)` — a deep copy of the whole downstream subtree (`definitionCanonical` + `action` +
   `extension`) (`decision.ts:850-884`, clone at :882).

**Qualifier-agnostic (corrects the plan's assumption #1).** The `first:`/`all:` distinction is only *placement*
of the arms (splice as ordered siblings vs. wrap in one `cqf-applicabilityBehavior "any"` grouping action,
`decision.ts:886-906`); the arm count and the per-arm subtree clone are **identical either way**. So the fix is
NOT `first:`-specific.

The #236 policy hit **244 arms — under the 256 `COMPOUND_GUARD_ARM_CAP`** (`decision.ts:556`), which is why it
emitted a *valid* 6.7 MB output rather than tripping `compound-guard-expansion-overflow`. The caps guard OOM /
cycles, not size.

Real numbers — **VERIFIED LOCALLY 2026-08-12 against the real artifacts** (KE-provided under a one-time operator
exception; read locally, NOT committed — clinical specifics stay out of this doc / the fixture / the corpus).
A DME-device+accessories PA policy: 176 concepts, 41 criteria, 1 coverage decision, **~48 real decision leaves**,
grouped by category (a taxonomy of named `criterion` OR-guards); behavior-identical across versions
(`run_decision` 111/111, `$apply` passes). Verified structure (generic labels): a **11-way** device router, a
**3-way** device router, and an `Accessory` router = OR of three sub-criteria of arity **21 / 9 / 1**
(the recursive criterion→criteria→atoms case); leaf gates are `and`-of-`or`, e.g. `covered-device AND (flagA OR
flagB)` (the inner OR doubles the covered-device condition in every clone). Growth of the single
`coverage-determination` PlanDefinition:

| decision shape | lines | size |
|---|---|---|
| FLAT (no grouping) | 26,247 | ~1 MB |
| + 3 top-level category routers (1 nesting level) | 375,161 | ~14× |
| + 1 nested accessory sub-node (2 levels) | 597,905 | **~28–30 MB (~23×)** |
| + full taxonomy: Accessories parent over 3 sub-routers (3 levels) | 6,329,533 | **~307.6 MB (~240× by lines)** |

- At the 28 MB level: **6,284 leaves from ~48 real** (131× leaf inflation), only **170 distinct condition
  expressions**. The smoking gun: one shared covered-device gate (written ONCE in one `criterion`) is cloned
  ~1,428× at 28 MB, ~1,944× at 307 MB. A concept referenced once cannot legitimately appear ~2,000× — every copy
  is DNF-distribution. **VERIFIED independently:** counted **6,284 `definitionCanonical`** in the real 28 MB PD
  (exact); the covered-device phrase occurs **7,140×** textually = ~1,428 logical condition-uses × ~5 mentions
  each (title/description/condition/2 input labels) — consistent. Line/byte counts of all three PDs match exactly.
- Slice: an 11-way router → subtree ×12; a 21-way router → subtree ×21; the leaf gate
  `covered-device AND (functionInHome OR performIADL)` — the inner OR **doubles** covered-device inside every
  clone; the outer `Accessory` parent `(GeneralAccessory or PoweredAccessory or NonPoweredAccessory)` where each
  is itself an OR-of-atoms criterion → the **recursive cartesian** case, ×31 the accessory subtree (the 28 → 307
  MB jump).

This CONFIRMS the recursion analysis — the "~51×" was conservative; one extra criterion→criterion level is ~11×
on its own.

## 1a. #274 reconciliation — same root cause, THREE surfaces, and a design FORK

The KE team filed the content-side manifestation as **#274** (authored by rob-reynolds): "Emit & cockpit
inline/flatten referenced criteria and disjunctive guards instead of preserving them as nodes." Same root cause
as #236. Surfaces:
- **#236** — `run_decision` trace expansion (original locus).
- **#274 emit** — the PlanDefinition clone (the metrics above).
- **#274 cockpit** — the MV cockpit renderer *also* inlines: a guard referencing a `criterion` is drawn by
  expanding its members inline into the parent "ANY OF" list, not as one collapsed reference node. Rewriting a
  router to *reference* a group criterion changed NEITHER emit NOR cockpit — both inline it back.
  → **Scope: the fix should cover emit + cockpit (+ trace); VERIFY whether they share the flattening code path
  so one fix covers all three** (#274 explicitly asks this).

**RESOLVED (crl-emit panel disc 417 + operator, 2026-08-12): the CQL-DEFINE DAG (shape 2).** #274 is authored by
the KE under the operator's GitHub creds — the KE's content-side framing, not an authoritative CRL-design source.
Its remedy (inline `A or B or …` as one opaque `condition.expression`) is verified inferior. But the panel also
killed **this design's original mechanism** (sub-PD via `definitionCanonical`) as a **category error** and
surfaced the correct fix, which BOTH arms proposed independently:

- **Sub-PD-via-`definitionCanonical` (shape 1, the first draft of this doc) — REJECTED.** `PlanDefinition.action.
  condition` is `Expression`-typed only; there is no reference-typed condition. `definitionCanonical` is the
  action *body* mechanism (`decision.ts:1092`, `emitLeafAction` :1102-1129 resolves it ONLY for
  `RecommendActivity` / `UseDecision` leaves), never an applicability carrier. Child-applicability does not flow
  *up* to gate the referencing action (the harness finding at `:753-756`: an unconditional group "selects while
  empty and STARVES otherwise"). The `use decision` precedent does not transfer — a sub-decision gates its OWN
  internal actions; a criterion is a predicate consumed *before* the leaf. VERIFIED against the code.
- **The #224 "tradeoff" DISSOLVES.** #224 forbids *anonymous inline* composition collapsed to one opaque
  `text/cql-expression` (`decision.ts:630-634`). It does NOT forbid referencing a **named** define by
  `text/cql-identifier`. A `defined as (A sem-or B)` concept guard **already emits exactly one condition today**
  via the single-ref path (`decision.ts:702-742`, one `guardApplicabilityCondition("positive", …)` at :734) —
  and nobody calls that a #224 violation. A `criterion` is a named author abstraction; #274's cockpit ask is
  literally to render it as ONE collapsed node. So named-reference is #224-CONSISTENT; the false dichotomy
  (opaque-expression vs sub-PD) hid the winning option.
- **#274's inline-`or`-expression remedy** stays inferior: it IS the anonymous opaque expression #224 forbids,
  and a named-define DAG is strictly better (reusable, negatable, one cockpit node, structure visible in its own
  artifact).

---

## 2. Fix — the CQL-define DAG: emit each criterion ONCE as a named boolean define, reference it by identifier

Emit each **distinct** `criterion` **once** as a named boolean CQL define — exactly the treatment a `defined as`
concept already gets — and lower a criterion *reference* (in a guard, or inside another criterion) as a **single
named literal**, not by inline-expanding its body into the DNF. Criterion→criterion references become
define→define references: a **DAG of named CQL defines**, one node per distinct criterion, referenced wherever
used. N uses → N `text/cql-identifier` conditions pointing at one define; depth-D nesting → D define references.
Linear in the number of distinct criteria, regardless of composition — the classic tree→DAG collapse, in the CQL
lane where FHIR already supports it.

**This is EXISTING machinery, not a new mechanism.** The single-ref path (`decision.ts:702-742`) already emits
one `guardApplicabilityCondition("positive", conceptCqlId, …)` (:734) for a named ref, and a compound guard
treats each conjunct as one DNF literal. The change is to **stop expanding** criterion refs before DNF
(`expandGuardOrRecord` at `:683`) and instead resolve a criterion ref to its emitted define — so a criterion
behaves like a `defined as` concept. No new FHIR shape, no new `$apply` semantics, no new resource kind.

### 2a. #224 — named reference is consistent, no atom-visibility sacrifice

The panel resolved the apparent tension (disc 417): #224 (`decision.ts:630-634`) forbids lowering an
**anonymous** compound guard to one opaque `text/cql-expression`. Referencing a **named** define by
`text/cql-identifier` is categorically different and already permitted — `defined as (A sem-or B)` proves it.
A `criterion` is a named author abstraction, so:
- **FHIR:** the guard emits ONE positive `text/cql-identifier` condition per criterion ref (or `not
  Coalesce("crit", false)` when negated — see §2c). Byte-shape identical to a single-concept guard.
- **Cockpit (#274):** the criterion renders as ONE collapsed "ANY OF `<criterion>`" node — exactly what #274
  asks for — expandable to its members from the source AST.
- **Structure stays visible** in the criterion's OWN CQL define (compositional: the define references its atom
  defines and sub-criterion defines, not one flattened expression) and via `input[]` (§2d).

So there is no atom-visibility tradeoff and no operator decision to force: the named-define shape satisfies both
size and visibility. The original §2a claim ("cannot emit as a define — violates #224") was wrong; it conflated
*anonymous opaque expression* with *named reference*.

### 2b. What the parent guard becomes

`A and crit1 and crit2` (where `crit1 = (a or b or c or d)`, `crit2 = (e or f)`): each of `crit1`/`crit2` is one
named literal, so the parent guard is a pure `and` → **one DNF arm, three `text/cql-identifier` conditions**
(`A`, `crit1`, `crit2`), subtree emitted once. `crit1`'s own `or` lives **inside its define** (`define "crit1":
Coalesce("a",false) or … or Coalesce("d",false)`), emitted once. Multiplication → addition.

**Boundary (unchanged, correct):** a literal `or` written *directly* in the parent guard (not via a criterion)
still DNFs at the parent — bounded by the arm-cap. The #236 blowup is criterion-sourced, so the fix targets it.
A criterion-ref is now one literal in that DNF, so it composes cheaply even alongside a direct `or`.

### 2c. Negation rule (panel-required; free under this shape)

`not <criterion>` lowers to `not Coalesce("crit", false)` — **byte-for-byte the existing negated-atom carrier**
(`decision.ts:641-663`). No expansion, no arm multiplication. This is a decisive advantage over expansion:
today `not (a and b)` De-Morgans to an `or` and re-multiplies; under referencing, negating a criterion is one
condition. The kit flip (§4) must state this boundary explicitly.

### 2d. Totality (North Star §4) and DTR input[]

- **Totality:** the criterion define totalizes **per operand before any `not`** — `Coalesce("A", false) or
  Coalesce("B", false)`, `not Coalesce("A", false)` — NOT a terminal `Coalesce(<whole>, false)`. Criterion refs
  are themselves total (they resolve to totalized defines), so composition stays two-valued. This matches the
  existing negated-atom carrier and North Star §4's "total per operand."
- **DTR `input[]`:** keep the criterion's **recursive atom closure** in `input[]` at the **use-site**
  (`buildActionInputs`, `decision.ts:581-602`, extended to walk a criterion's atom closure the way it already
  walks a concept's case-feature closure) — so DTR surfaces the atoms without a cross-resource `$apply`
  round-trip. Accept the input[] union at the use-site (the guard genuinely needs the criterion's alternatives).
  This is the panel's stated acceptance criterion (Q from both arms).

### 2e. What this shape AVOIDS (vs the rejected sub-PD shape)

No new PlanDefinitions (41 criteria would have been 41 new resources); no canonical-identity / cross-kind
collision design (`EmittedResource.sourceKind` needs no `Criterion` member); no cascade-suppression redesign; no
`library[]` linkage per criterion. The define lives in the existing library. Strictly smaller than shape 1.

---

## 3. BUILD CONTRACT (resolved — crl-emit panel R2, disc 417 R2; both arms converged)

**ONE ATOMIC change** across the emit + CQL-gate + CRE(+viewModel) seams — like the #189 both-lane flip. A
half-migration ships a two-lane-inconsistent release (VERIFIED: the CQL lane hard-fails a large DAG at
`imports/emit.ts:522-538` while FHIR would emit it; the CRE would `status:"error"` a doc that emits fine). Order:

**A. Criterion index (the shared primitive).** `(lib, criterionName) → { defineId, sourceCondition,
recursiveAtomClosure (stable order), criterionDependencies, dependencyDepth }`. Consumed by FHIR emit + CQL emit
+ the CRE evaluator. Provenance keeps its OWN `CriterionIdentity`/`bodyHash` (`guardOutline.ts:341-399`,
fill-order-independent) — do NOT force it onto the topo-sorted index. The CQL gate consumes cap verdicts, not ids.
(Fable's refinement of the "shared table": it's an index for 3 consumers, not a universal primitive.)

**B. Collision-safe define ids.** `nameUniquenessValidator` already enforces concept-XOR-criterion in one bucket
(cite as the load-bearing precondition — no same-named concept can shadow); cross-library criterion refs are
FORBIDDEN (`criterion-misuse`, `validator.ts:48-52`) → kills the canonical-URL/cross-lib class. Remaining risk:
criterion-vs-`parameter`/`terminology` name collision — the index owns a deterministic `defineId` + a collision
preflight SHARED by define emission, the positive `text/cql-identifier`, and the negated carrier.

**C. Criterion define emission (NEW — criteria are DROPPED today; VERIFIED `emitCQL.ts:865,877` emit only
Terminology+Concept, `classifyStatementLayer` excludes the rest).** Emit each reachable criterion as a boolean
define **in the library `PlanDefinition.library[]` targets** (none→Root, interface→Interface; `decision.ts:521-526`),
body referencing same-library concept re-exports + sibling criterion defines. **Dedicated total-boolean emitter —
NOT the `defined as` composition path** (VERIFIED: `emitCQL.ts` has no `Coalesce`; the composition path is not
per-operand total). Rule: positive concept leaf → `Coalesce(<concept>, false)`; positive criterion leaf →
`Coalesce(<criterion>, false)` (deliberate defensive boundary — MARK it so it isn't "optimized" away; motivated
by the nullable legacy plain re-export shape, `decision.ts:637-646`); `not X` → `not Coalesce(X, false)`; `and`/
`or` combine already-total operands; NEVER `Coalesce` a non-boolean (validator already requires boolean guard
operands, `useSiteTypeValidator` `checkGuardLiterals`). Emit in **topological order** (cycle-free by
`cycleDetector`; the CQL child ref is load-bearing, unlike provenance's blank-token trick). `interfaceSurface`
(`layeredEmit.ts:973-1034`) KEEPS its expansion-based atom walk — over-applying "stop expanding" there drops the
re-exports the define bodies reference. **[HARNESS ✔ 2026-08-12] translator forward-ref tolerance CONFIRMED**
(a define resolving one declared textually later translated + evaluated cleanly on cqf-cli 4.7.0). So topological
order is **not required for correctness** — keep it only as a determinism/readability nicety, not a load-bearing
constraint; a cycle is still a validator error, not a translator one.

**D. Guard lowering: criterion ref → ONE literal.** Build-time choice, with both arms' safeguards: **(a)**
emit-LOCAL pre-pass (replace the `expandGuardOrRecord` at `decision.ts:683`) rewriting a criterion ref to a
concept-like ref STAMPED with a kind-marker (keeps `soleRef`/`toNNF`/DNF/arm-count untouched; the marker stops a
rewritten node ever evaluating as an absent→false concept in the CRE — the silent-wrong-answer mode the tripwire
at `run.ts:475-484` guards) + extend 2 resolvers; **(b)** extend `BranchConditionLiteral` to a signed
concept|criterion union across `toNNF`/DNF/`litRef`/`soleRef` + the same 2 resolvers. Both need the 2 resolver
extensions (name→defineId, name→atom-closure); (a) is smaller, (b) more compile-time-auditable. KEEP the type
tripwire for genuinely concept-only paths. FHIR: positive → one `text/cql-identifier`; negated → `not
Coalesce("crit", false)` (existing carrier, `decision.ts:641-663`; the redundancy vs the total define is
DELIBERATE byte-consistency).

**E. DTR `input[]`: criterion-keyed.** `collectCaseFeatures` (`closureOrchestrator.ts:416+`) computes the
criterion's recursive concept closure keyed by criterion name (today it only keys concepts); DNF arm unions
direct-concept + criterion-closure inputs (first-occurrence, deduped by canonical); pos+neg share the list.
input[] GROWS per action (whole closure vs a single arm's disjunct) — accepted (the one atomic condition needs
all its alternatives); goldens change (approved, not byte-preserving).

**F. CRE reference-and-evaluate (NOT parity-only).** `evalBranchCondition` gets a `BranchConditionCriterionRef`
case (replacing the tripwire `run.ts:475-484`): resolve `(lib,name)`, evaluate body **memoized per case**, with a
stack cycle/depth guard (the `evalConcept` precedent `criterionExpansion.ts:21-22`). `cre/viewModel.ts` is a
**LOCKSTEP seam** — the trace↔spine zip degrades SILENTLY if it diverges from `run.ts` (`expandDecisions.ts:1-18`,
`viewModel.ts:610`) → lands in the SAME change (only the MV cockpit in the other package trails). Trace shape:
full sub-trace at FIRST occurrence + reference nodes at later sites (precedent: `guardOutline` `kind:"criterion"`)
— NOT full-per-site (re-inflates the trace, defeating the fix).

**G. Caps — which dies where.** `CRITERION_EXPANSION_ATOM_CAP` RETIRES at BOTH emit gates in this change
(`decision.ts:684` suppression + `imports/emit.ts:534` hard error) — leaving either alive silently reinstates the
blowup refusal for a now-linear artifact. Survives as eval-time bounds: dependency-depth (reuse
`CRITERION_MAX_DEPTH`), cycle/undefined (validator), a per-body node-count guard (size for MACHINE-generated
files, not authored), DNF arm-cap on the RESIDUAL parent guard only. No materialization remains, so the CRE bound
lives in the memoized evaluator's stack guard. **[HARNESS ✔ 2026-08-12] `$apply`/engine per-reference caching
CONFIRMED**: the cqf CQL engine **memoizes ExpressionDef evaluation per patient context** — a 40-level doubling
DAG (`L(n)="L(n-1)" and "L(n-1)"`, L0 a non-foldable retrieve so folding is ruled out; 2⁴⁰≈1.1e12 resolutions if
per-reference) evaluated in 2.3 s. So one decision-guard define referencing the criterion DAG evaluates each
criterion **once** — linear at the CQL layer. Consequence: the emit-tree caps CAN retire to an eval-time bound
without reintroducing an exponential eval-time trace; **CRE must implement the same memoization** in its own
evaluator (per F), since that is OUR code, not the engine's. (Residual: whether `$apply` shares one context
across N *separate* action conditions is a further nicety — even without it, N linear evals is polynomial, never
exponential.)

**H. Provenance identity.** Declaration id `criterionKey(lib,name)` vs occurrence id `decisionSubNodeRef(lib,
decision, nodeId)` + ref location → the tuple `(criterion, guard-nodeKey)`. `sourcedFromCriterion` becomes
vestigial on switched seams (a lane that stops materializing never stamps it) — retire it from new CRE/FHIR paths
(or ride the emit-local rewritten ref, one mechanism for both needs); add an explicit occurrence node to CRE/VM.

**I. Diagnostics + kit.** Add an `unresolved-criterion` diagnostic kind (else undefined-criterion regresses to a
wrong-kind `unresolved-concept` at emit, which is reachable without validation). Flip the two shipped strings that
become FALSE (`decision.ts:693`, `imports/emit.ts:538` — golden-pinned; expect oracle drift, `oracle:update`
deliberately). Kit flips per §4.

**J. Acceptance bar.** 111/111 `run_decision` identical (positive / negated / missing-closed-world /
nested-negation) + a **trace-linearity assertion** on the synthetic fixture (trace nodes bounded by DISTINCT
criteria, not by references — "the linearity assertion IS the #236 fix expressed as a test") + emit size linear +
`$apply` passes on a synthetic doubling-DAG (record artifact size / translator success / runtime).

---

## 4. Kit changes (after the fix; batched — schemaVersion bump + BOTH hashes re-pinned + vsix)

Two statements currently trail the mechanics and flip once referencing lands:
- `criterion`: "NOT an emit-arm reducer (it expands, so it does not shrink the DNF)" → **becomes a reducer**
  (emitted once as a referenced boolean define). **Boundary (panel-required):** the relief applies to POSITIVE
  and NEGATED refs alike — `not <criterion>` is `not Coalesce("crit", false)`, one condition, no re-expansion.
- `branch-guards`: "NEVER reach for a `criterion` expecting relief — it inline-expands and does nothing for the
  arm count" → **now it does provide relief** (positive or negated).
Plus: `decision-composition` records #236 as load-bearing — the cross-link is updated to "resolved by
named-criterion-define lowering." Note this is a KE-visible semantic change (criterion goes from a pure
macro with no artifact identity to a named CQL define) — worth its own kit line, not just the two flips.

**DONE (kit schemaVersion 1.24→1.25, disc 422).** The design-panel round expanded the scope beyond the two
statements above: the faithfulness DISCRIMINATOR was re-grounded (both `decision-composition` + `concept-form`
invariants and the `hollowed-criteria`/`dropped-or-added-criterion` judge lenses) from "each criterion its own
action-level `condition[]`" → "opaque INFERENCE composite (`defined as`/`sem-*`) vs named TRANSPARENT define
(`criterion`)", since per §2a a named criterion loses NO atom visibility (atoms relocate to the define body +
use-site `input[]` + cockpit ANY-OF node). Every "each atom visible" prose surface was swept to distinguish
inline (action `condition[]`) from named criterion. `docs/decision-shapes.md` was folded into the same
transaction (it was cited by the flipped rules' `ref` fields and still taught the retired inline-expansion
model). The `criterion-expansion-overflow`/criterion-atom bound was retired from the kit's cap doctrine.

---

## 5. Sequence
1. **[DONE]** payer metrics verified (§1); panel R1 (disc 417) killed shape 1, converged on shape 2; operator
   blessed; panel R2 (disc 417 R2) produced the §3 build contract — both arms converged, all criticals verified.
2. **[NEXT — needs operator greenlight]** Build the §3 ATOMIC contract. It is a **multi-seam change best run as a
   decomposed per-todo build** (roughly: A criterion index + B collision-safe ids · C define emission + total
   emitter · D guard lowering + resolvers · E criterion-keyed inputs · F CRE reference-eval + viewModel lockstep ·
   G caps retire/replace · H provenance · I diagnostics+kit · J acceptance incl. the synthetic doubling-DAG
   fixture + trace-linearity assertion). **All land atomically** (or behind a flag) — no two-lane-inconsistent
   intermediate release. HOLD on code.
3. **[HARNESS ✔ 2026-08-12 — CLOSED]** both verification gaps closed on cqf-fhir-cr-cli 4.7.0: translator
   forward-ref tolerance CONFIRMED (no topological sort needed); engine ExpressionDef memoization per context
   CONFIRMED (criterion DAG linear at eval-time; CRE must replicate). Tests in the session scratchpad
   (`harness-gaps/cql/{ForwardRef,MemoDag2}.cql`).
4. Regenerate goldens (`run_decision`/`validate_cel` behavior-identical + trace-linearity; oracle `oracle:update`
   deliberately) + vsix (batched with the emit work the KEs are waiting on).

**Fixture note:** the committed regression fixture is a SYNTHETIC anonymized reproduction of the verified
structure (11/3/9/21/1, `Accessory`=OR-of-3, leaf gate `covered AND (a|b)`); the real payer artifacts stay local
and are never committed.

---

## 6. Cross-refs
- `docs/emit-followups-236-238-272.md` §2 — the parent assessment.
- `ast/criterionExpansion.ts` — the recursive expansion engine (the thing being bypassed).
- `fhir-emitter/decision.ts:683,850-906` — WhenBlock criterion-expansion + DNF + per-arm clone + placement.
- `project_emit-followups-236-238-272` (memory).
