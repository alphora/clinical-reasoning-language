# Quantity threshold units: implementation plan

Date2026-11-18. Baseline develop7c7a83cc0c79bf32d729d2752b798d048e5a0699 / CRL6.4.54. Feature branch codex/quantity-percent-ms in normal checkout. Four preexisting untracked paths untouched; no new checkout. No release/image/pin/customer policy changes authorized by this task.

## Current intent and authority

QUOTED operator: asks whether LVEF(%) and QRS/PR(ms) numeric thresholds are supported, then "implement them." Keep numeric Quantity answers, explicit units, exact threshold boundaries, unknown inputs and errors. We independently reproduced released54validator rejecting %/ms while m control succeeds.
DERIVED bounded scope: add same-unit % and ms comparisons. The pictured LVEF question uses an inclusive upper bound, so implement selected-Quantity at most as well as existing at least; do not approximate <= by negating >= at the same cutoff. Do not add general UCUM conversion, seconds/minutes, ratio1→percent scaling, clinical value ranges or alternative question models.
Read docs/CRL-NORTH-STAR.md. Existing constraints are implementation bounds, not operator prohibitions. Mechanical before-rules: tmp/quantity-thresholds-20261118/before-rules.md, generated from exact baseline for charter, typed-intake doc and canonical kit. No production code deleted; existing allowlist grows, existing at-least behavior remains. Old unit-limited claims will be corrected together, with negative tests still retaining genuinely unsupported units.

Active #320 trust taxonomy: marked grounded code is measured implementation, not automatic authority for new intent; suspect/unmarked paths are patients. This is a bounded feature, not a redesign or retirement of publication selection, timing, unknown, fallback or native session contracts. Existing selected Record/Observation behavior is preserved. Marker alone is not execution proof.

## Single feature slice (ordinary plan/code review loop)

1. Extend implementation coherently. publicationQuantity.ts adds isolated percentage and millisecond dimensions/factor1; reject cross-dimension/s/1 substitutions, preserve raw code precedence and existing precision/magnitude/unknown/error behavior. readPublicationThreshold admits AtMost as well as AtLeast; carry optional comparison discriminator only for AtMost so existing descriptors/default AtLeast semantics remain compatible. produceMembershipCandidate dispatches exact <= or >= without rounding/coalescing unknown. CQL renderPublicationQuantity.ts generates matching unit/factor cases and explicit upper-bound comparator/candidate selection; emitCQL.ts selects matching helper for AtMost while retaining old AtLeast calls. No new engine jar/driver dependency or change to CQL catalogue.
2. Qualify with owning tests and real emitted execution: exact below/equal/above for35% and120ms, decimal boundaries eight places, zero, missing/valueless, invalid units/system/comparator, cross-dimension rejection, UCUM code-vs-display precedence; existing m/cm/kg/g/BMI cases still pass. Validator/preparation acceptance/refusal, CEL→FHIR Quantity unit identity, CRE outcomes/unknown and imported-owner path, standalone and embedded emitted CQL. Extend the owning Quantity fixture/tests/shared teaching input rather than invent an independent oracle. Actual applySession against pinned engine2ee7 on generated definitions with numeric answers, input→update→clear and explicit native errors. Reuse supported session helpers and preserve same-call raw evidence. Do not rerun historical customer policies.
3. Update source guidance and finish. Charter/typed-intake docs and kit teach %/ms and both inclusive operators; keep conversion and release-availability limits precise. Use crl-kit-update bounded delta from audit04657bd7, reuse owning fixture/test tags; bump schema once and audit only after reviewed content commit. Focused core tests/typecheck + affected kit identity/reference gates, core/extension build. Code panel before scoped commit; integrate into develop for normal debug. No publish/tag/deploy.

Review concern: Does AtMost require additional consumers beyond preparation/producer/CQL emitter? Avoid changing hidden truth/unknowns, BMI eligibility, integer fallback or datatype provenance. Unit group lookup must not admit arbitrary units via object prototype. No claim of rendered/native success until executed. Existing upstream unit-normalization already accepts same-unit arbitrary UCUM codes; new comparison support remains explicitly bounded.

Panel: native vibe-reviewer-crl-emit gpt-6-astra/high + configured ask_claude anthropic/claude-opus-5/high, same crl-emit-v0.1.0 lens, byte-equivalent prompt. External retry medium after timeout. Review plans before implementation and substantive code before commit. No peer authoring or new release dependency inferred.


## Plan review round1
Native gpt-6-astra/high: 0 critical, 0 important, 0 nit; converged. Full response: No additional AtMost consumer gap found: matcher already recognizes it (matcher.ts:411), validation uses shared reader (useSiteTypeValidator.ts:228), CRE routes through produceMembershipCandidate (cre/run.ts:1005). Isolated %/ms groups, exact inclusive comparison and unknown/error preservation are fine. Existing same-unit normalization supports the scope without conversions or BMI expansion. Execution remains unverified and requires emitted/native boundary/edit/clear checks.
External anthropic/claude-opus-5/high: INCOMPLETE. Full response: "I'll start by reading the protocol and the north star, then the proposal." Tool then reported provider API180s per-call ceiling on model turn21;20completedturns/$3.87estimated. No findings returned, no catch counts inferred. Accept/refine/reject totals0/0/0. One bounded retry at medium effort with restricted current-file packet; native receives identical request. Plan not yet converged as a panel.

## Plan review round2 (same bounded request)
Native gpt-6-astra/high: 0C/0I/0N, converged. Full response: The bounded plan supports same-unit %/ms thresholds and inclusive at most55% without introducing conversions or changing missing-input semantics. Optional discriminator can preserve existing AtLeast descriptors while selecting exact <= in both evaluator and CQL paths. No concrete remaining plan gap; runtime remains subject to boundary/error/edit/clear checks.
External anthropic/claude-opus-5/medium full response follows:
## Verification performed

Read the charter in full, `publicationQuantity.ts`, `publicationProgram.ts` (`readPublicationThreshold` L106-114, admission L205-240, threshold preparation L460-474), `publicationProducer.ts`, `renderPublicationQuantity.ts`, plus the claims the native arm asserted (`matcher.ts:411-418`, `useSiteTypeValidator.ts:228`) and the lexer/builder quantity path.

**Confirmed accurate in the plan:** `AtMost` is already a matcher pattern producing `[ConceptRefArg, QuantityArg]`, so no grammar work is needed; a publication-shaped concept with an `at most` definition is today rejected by `publicationAdmissionReason` L216-217, so admitting it is additive, not a semantic flip of accepted content; `publicationQuantityUnitsCompatible` short-circuits on `a === b`, so adding isolated `%`/`ms` groups does not change `normalizePublicationQuantity` or `checkQuestionUnit` for any existing content. Those parts are fine.

**Counts: 1 critical, 5 important, 3 nits.**

---

### [critical] The optional discriminator's default is a silent wrong-answer, not a loud failure

> "carry optional comparison discriminator only for AtMost so existing descriptors/default AtLeast semantics remain compatible"

The stated benefit is descriptor/golden stability. The cost is that `comparison?: "atMost"` gives you **zero compile-time coverage**: `produceMembershipCandidate` (`publicationProducer.ts:37`) and `emitCQL.ts:2522-2523` both currently branch only on `producer.kind === "quantityThreshold"`, and any site that reads the producer without consulting the new optional field keeps calling `publicationQuantityAtLeast` / `QUANTITY_CQL.compare`. The failure mode is `LVEF 70 %` evaluating **true** for "LVEF 55% or less" — valid CQL, valid FHIR, no diagnostic, and no existing test catches it because every current threshold test is at-least (`publicationQuantity.test.ts:54`, `publicationBMI.test.ts:59`).

Make it a required union on `PublicationThresholdProducer` (`"atLeast" | "atMost"`). This is an internal descriptor type, not authored syntax — TS then forces every construction and consumption site to be visited, and the default-AtLeast *authoring* behavior is unaffected. The compatibility argument only protects snapshot bytes, and your step 3 regenerates goldens anyway. If you keep it optional, state explicitly which sites were enumerated and add a test that constructs a descriptor without the field and asserts at-least.

### [important] TS `units` table and the emitted CQL `factor`/`group` arms have no mechanical link

`publicationQuantity.ts:24-28` holds the table; `renderPublicationQuantity.ts:13` and `:15` hold hand-written `case` arms duplicating it (and `renderPublicationBMI.ts:22` duplicates the subset again). Adding `%` to the TS table and forgetting the CQL `group` arm yields: CRE returns `{known, true}`, emitted CQL returns `Message(... 'publication-quantity-unit-unsupported' ...)`. That is exactly the charter §4.0 violation ("Supported author-evaluator (CRE) and emitted execution paths must agree on values, unknown states, and code matching for the same case"), and only native `$apply` would catch it — your step 2 would have to be running the right case to notice. Derive the CQL arms from `Object.entries(units)` (or add a test asserting every TS unit appears in the rendered factor and group arms, and that factors match). Cheap now, mandatory the next time a unit is added.

### [important] CRL already has a bare `milliseconds` quantity spelling that this feature will not accept

`CRLLexer.g4:148` makes `milliseconds`/`millisecond` a first-class `TIME_UNIT`, and `visitQuantity` (builder.ts:1521-1528) stores it as `unit: "milliseconds"`. So `definition is "QRS Duration" at most 120 milliseconds.` parses to an `AtMost` call with a `QuantityArg` identical in shape to `120 'ms'` — and gets rejected by `publicationQuantityThresholdError`, whose message today reads "requires a finite value and a supported unit: m, cm, kg, g, kg/m2" and will not even mention `ms` unless updated. Two spellings that read the same to a KE, one supported. The plan doesn't mention this. Decide and pin it: reject with a diagnostic that names `'ms'` explicitly, plus a negative test for `120 milliseconds` / `2 seconds`. Do not alias `milliseconds` → `ms` silently; that would make the time-unit token mean a UCUM code in one position only.

### [important] What happens to an LVEF recorded in UCUM `1` (or unitless) is undefined by the plan

The plan says "no ratio 1→percent scaling" — correct scope — but doesn't state the behavioral consequence. For the selected operand, `publicationQuantityAtLeast`/`AtMost` returns `{kind:"error", code:"publication-quantity-unit-unsupported"}` and the CQL helper raises `Message(..., true, ...)`. So an EHR LVEF of `0.55 {1}` or a bare `55` with no unit does not become unknown or false — it **errors the publication and fails the decision**. For `%` specifically that is a realistic record shape, unlike kg/m2. Is a hard error the operator's intent for LVEF, or should an uninterpretable unit be unknown? The charter's absence rule distinguishes "missing input" from "determinate false" but says nothing about "present but uninterpretable"; you're choosing error, which is defensible, but it should be a stated decision with a test, not an inherited side effect of the kg/m2 design. Note the blast radius is bounded because selection runs first (`renderPublicationQuantity.ts:27` only reaches compare when `operand.state = 'selected'`), so only the most-recent record can trigger it — say so.

### [important] Emitted CQL text changes for every existing library carrying a threshold *or BMI* producer

`emitCQL.ts:1266` gates `renderPublicationThresholdHelpers()` on `producer.kind ∈ {quantityThreshold, bodyMassIndex}`, and `renderPublicationBMI.ts:15` reuses `QUANTITY_CQL.unit`. Adding `%`/`ms` arms to `factor`/`group` — and emitting a new AtMost compare function — changes the emitted Library content of every policy with a BMI publication, including libraries that never use the new units. The plan's step 3 says "affected kit identity/reference gates" without naming this. Enumerate the affected golden/canonical set up front (Bleph/Obese acceptance artifacts, kit canonical CQL, any provenance hash manifests), and decide deliberately whether the AtMost function is emitted unconditionally or only when an AtMost producer exists. Unconditional is simpler but widens the diff; conditional keeps existing AtLeast libraries byte-identical except for the two new case arms. Either is fine — but pick it explicitly, because "no change to CQL catalogue" in the plan reads as "no emitted-artifact churn", which is false.

### [important] No test for the admission flip (previously rejected form now emits)

Today, `shape is Record` + `Observation` + `value type is boolean` + `definition is "X" at most 30 'kg/m2'` fails at `publicationProgram.ts:216-217` with "Supported production is selected-value presence, …". After this change it prepares and emits. Your step-2 list covers values and boundaries but has no "this exact source previously produced diagnostic D and now produces a descriptor/CQL" case. Add one — it is the single check that proves the admission widening landed where intended and nowhere else (e.g. that a `Quantity`-valued concept with an `at most` definition still fails L223, and that an `at most` over a non-Quantity operand still fails L468).

### [nit] Update the message/doc strings together with the table

`publicationQuantityThresholdError` hard-codes "m, cm, kg, g, kg/m2"; `CRL-NORTH-STAR.md` §2 says "This comparison currently supports m/cm, kg/g and kg/m2" and describes only `at least N 'unit'` as the producer form; `authoring-kit/index.ts:728` repeats the bounds. All three plus the message's own tests are part of the same edit. The charter sentence also needs the inclusive operator added, not just the units.

### [nit] Pin the nested-`AtMost` fall-through diagnostic

`definition is age today at most 18 years` matches `AtMost` with a `NestedPatternArg` (matcher.ts:1042), so `readPublicationThreshold`'s `operand.type !== "ConceptRefArg"` guard returns `undefined` and the concept lands on the generic "Supported production is …" message — which will now read oddly, since `at most` *is* supported. Add a test pinning that diagnostic so it isn't later mistaken for a threshold-matching bug.

### [nit] Record why unit factors must stay integers ≥ 1

The CQL side compares `Q.value.value * factor >= threshold * factor(unit)` in Decimal while TS uses exact bigint rationals. They agree today only because every factor is an integer ≥ 1 and inputs are capped at 8 decimal places, so the products never need a 9th fractional digit. `%` and `ms` at factor 1 preserve that. Your "reject `s`/`1` substitutions" decision is right for this reason, not just scope — write the reason down, because a future fractional factor (`%` ↔ `1` at 0.01) would break TS/CQL agreement, not merely widen scope.

[reviewer cost: 14 turns · $1.84 estimated · 1,081,362↓ + 17,237↑ · effort=medium · anthropic/claude-opus-5]

### Lead dispositions
Totals: Accept6 / Refine3 / Reject0 (all9external findings). Native0findings.
C1 Refine: use required at-least|at-most discriminator populated by syntax reader; existing authored AtLeast behavior remains. Required construction is clearer, though TS cannot force consumers to consult any field; behavioral CRE/emitted/native tests establish actual routing.
I1 Accept: derive CQL factor/group arms from the one TS supported-unit table. BMI's separate input eligibility stays unchanged.
I2 Accept: reject spelled-out milliseconds/seconds with diagnostic listing quoted ms and negative tests; no lexical alias/conversion.
I3 Refine: no new operator question needed: preserve explicit invalid-unit errors as already stated. Ratio1 and unitless numeric answers error rather than silently unknown/false, after normal selection. Add tests/docs.
I4 Accept: emit both comparator helpers unconditionally within existing threshold/BMI helper gate. CQL bytes change in those generated libraries; no catalogue implementation/engine changes. Inspect affected tests/goldens and test actual existing BMI flow; do not regenerate customer delivery/provenance.
I5 Accept: exact AtMost admission source now prepares/emits; wrong output type/nonQuantity operand and unsupported units still rejected.
N1 Accept: sweep message, charter, typed intake and canonical kit clauses (including bmi-publication).
N2 Refine: pin nested age form's existing refusal, without extending arbitrary nested producer support.
N3 Accept: shared table documents integer factors >=1 preserving CQL eight-decimal products; fractional conversions outside scope.
Plan settled with these refinements. Code review will assess implementation and executed proof separately.


## Native round2 verbatim response
**0 critical, 0 important, 0 nit. Converged.**

The bounded plan supports same-unit `%`/`ms` thresholds and inclusive `at most 55 '%'` without introducing conversions or changing missing-input semantics. The optional discriminator can preserve existing `AtLeast` descriptors while selecting exact `<=` in both evaluator and CQL paths.

No concrete remaining plan gap found. Runtime support remains subject to the planned boundary, error, and edit/clear execution checks.
