# CRL clinical inference patterns — draft catalog v0.5.4

> **Status: draft v0.5.4** (v0.3 + CMS69 → v0.3.1 re-tier → v0.3.2 + CMS22 → v0.3.3 round-3 reviewer sweep → v0.3.4 property-access policy → v0.3.5 umbrella-application sweep → v0.4.0 pattern bodies are narrative → v0.5 catalog as source of truth → v0.5.1 reviewer-round-1 integration → v0.5.2 reviewer-round-2 integration → v0.5.3 operator-triage on Q1/Q2/Q3 → v0.5.4 round-3 cleanup). **45 patterns** across the inference taxonomy plus a **5-form window-from-anchor sub-grammar** (BeforeStartOf, AfterStartOf, BeforeEndOf, AfterEndOf, OnDayOf).
>
> **v0.5.4 — round-3 reviewer cleanup** (`.vibe-tools/discussions/014`): three reviewers caught two real issues in the round-2/3 deltas — (a) the SubjectBoundPredicate definition contradicted its own `With("Encounter", AtLeast("BMI", 30 'kg/m2'))` rejection example (set was structurally permissive but example rejected on semantic grounds). Fixed by narrowing the closed set: value comparators (`AtLeast`/`AtMost`/`Between`/`Exceeds`/`Below`) and range classifiers (`High`/`Low`/`Normal`/`Abnormal`) excluded; added `CurrentlyTaking`/`HasAdverseReactionTo`/`AtLeastApart`/`AtMostApart`/`AtLeastN`/`Consecutive` to the subset where Y is at canonical position 0. (b) The AnchorEnum emission table had fabricated FHIR paths (`Encounter.hospitalization.dischargeDisposition.period.start` doesn't exist; `admitSource` is CodeableConcept not DateTime). Fixed by removing the alternatives and committing to the validated primary resolutions. Plus: documented ambient-encounter-context requirement for AnchorEnum; clarified `CRLPatterns.AsOf` / `CRLPatterns.AgeAt` as CQL-level overload sets (one per resolved-anchor type); fixed cross-table emission inconsistency (`AnchorEnum (literal)` row split out from `KindEnum (literal)`); updated umbrella meta-rule's AsOf parenthetical to match the closed AnchorEnum + AnchorExpr-modifier reality; fixed `pattern-usage.md` leftover `AtLeastDaysApart` reference.
>
> **v0.5.3 — operator-triage on round-2 deferred questions** (`.vibe-tools/discussions/014`): operator approved option 1 (recommendations a/a/a). Applied: (Q1) AnchorEnum resolves at emit-time via a per-anchor table — one `CRLPatterns.AsOf` function, per-anchor logic in the catalog's emission table; (Q2) `With(X, Y)`'s Y constrained to `ConceptRef | SubjectBoundPredicate` — closed set of patterns where Y is the first positional argument (subject-bound); (Q3) `InpatientStay` keeps `Period` return + mandatory lift idiom (no change — already current state).
>
> **v0.5.2 — reviewer-round-2 integration** (`.vibe-tools/discussions/014`): three reviewers caught issues the v0.5.1 deltas introduced or left unresolved. Key fixes: (a) placeholder-binding rule rewritten as name-based with no positional fallback (round-1 statement was self-contradictory); (b) `Before`/`After` removed from `TemporalPredicate` set (referenced but never defined); `Overlaps`/`AtLeastApart`/`AtMostApart` added (boolean temporal predicates the corpus needs in `reason` slot); (c) defined `Instance<T> ↔ ConceptRef<T>` coercion rule globally so selection patterns feed value comparators (`AtLeast(MostRecent(...), ...)` now type-valid); (d) widened `Justified.reason` to `ReasonExpr` allowing heterogeneous `Disjunction<ConceptRef | TemporalPredicate>` per the CMS69 corpus shape; (e) tightened `Calculate`/`Lowest`/`Highest` return type to `Quantity<U>` so downstream comparators unit-check; (f) added `[, scope: ScopeSpec]` to `Lowest`/`Highest`; (g) added top-level "Composition and precedence" section: `not > and > or`, in-arg disjunctions REQUIRE parens; (h) `Period` documented as a primitive not used directly in narrative; (i) `AnchorEnum` declared closed (admission/discharge/delivery/procedure); KindEnum stays open with soft-compile warnings; (j) Quantity literals accept both UCUM-quoted (`'mm[Hg]'`, `'a'`) and CQL-time-unit-bare (`30 days`, `1 year`) surface forms — validator normalizes; (k) Concept declaration `type`/`valuetype` reference documented for `ConceptRef<T>` resolution.
>
> **v0.5.1 — reviewer-round-1 integration** (`.vibe-tools/discussions/014`): three reviewers caught real holes in the v0.5 schema treating the catalog as source of truth for parser/validator/emitter. Key fixes: (a) defined `Instance<T>` for selection-pattern returns (not `ConceptRef`); (b) widened `Last`/`MostRecent`/`Earliest`/`First` scope to include `OnDayOf` (cms22 line 159 needed this); (c) fixed the self-contradicting `Last(BP, Within(...))` example — `within` is a narrative connector, not a function call; (d) renamed `Component` → `ComponentOf` to avoid FHIR `.component` collision and align with the narrative; (e) renamed `Verified` → `IsVerified` aligning with `Active`/`IsActive` naming; (f) renamed `AtLeastDaysApart`/`AtMostDaysApart` → `AtLeastApart`/`AtMostApart` with `Quantity<time>` param so weeks/months work narratively; (g) unified `AsOf` and `AgeAt` on `AnchorExpr` with productive `start of <ref>` / `end of <ref>` modifiers; (h) widened `Justified` reason to include disjunctions and temporal predicates per cms69 corpus; (i) tightened Quantity-comparator signatures with unit-parametric `Quantity<U>`; (j) widened `Without` kind to `KindEnum | ConceptRef` mirroring `AsOf`; (k) dropped `Has`'s optional `when` (zero corpus use); (l) replaced `Expression` with `PatternCall` in `With`. New top-level sections: ConceptRef emission model; umbrella treatment meta-rule. Per-card sections trimmed — the reference table is the source of truth; per-card bullets keep intent/params/category/maturity/evidence/examples/anti-example only.
>
> **v0.5 — catalog as source of truth.** Each pattern card now carries three load-bearing fields that make the catalog the formal source of truth for the language: **`narrative form`** (the clinical-speech template the author writes), **`canonical`** (the function-call signature the compiler/validator/emitter use as the AST shape), and **`CQL function`** (the dotted reference into the shared `CRLPatterns.cql` library the emitter targets). These three fields live in the reference table; the table is authoritative.
>
> This formalizes the architecture decided in discussion 013: narrative is sugar; function-call form is the canonical AST. The catalog drives the parser's template-match pass, the validator's signature checks, and the emitter's CQL mapping — all from one place. Adding a new pattern is: add a row to the reference table + a per-card section + a function to `CRLPatterns.cql`.
>
> **v0.4.0 pattern bodies are narrative** (operator review): function-call syntax in pattern bodies replaced by clinical-narrative templates. CRL is for clinical authors. See `feedback_narrative-pattern-bodies` memory.
>
> **v0.3.5 umbrella-application sweep** (operator review): operator caught modeled measures composing from primitives where existing umbrellas fit. CMS22 denominator-exclusion → `AsOf("Qualifying Encounter", "Verified Hypertension")`; CMS22 `First Hypertensive Reading` → `Without(record-of, ...)`; CMS69 `Has Normal BMI` → `Without(documented, ...)`. See `feedback_parameterized-umbrella-patterns` memory.
>
> **v0.3.4 policy tightening** (operator review): **No FHIR property access in pattern bodies.** Lifted to clinically-named concepts. Quantity-typed refs operated on directly (no `.value`).
>
> **v0.3.3 re-tier + card refinements** (round-3 reviewer sweep, post-CMS22): `Within` → Contextualization; `Component` → Contextualization; `IsVerified` semantics widened; `NotDoneWithReason` accepts disjunction + generalizes across resource types; `Between` closed-vs-half-open noted.
>
> **v0.3.2 additions** (CMS22 modeling): `ComponentOf(panel, discriminator)`, `Between(value, lo, hi)`.
>
> **v0.3.1 re-tier** (operator review): `Justified` → Assertion. `Active` → Assertion. `WasPerformed` stays in State/Process Inference.
>
> **v0.3 additions** (CMS69 modeling): `Justified`, `OnOrBefore`, `SameDay`. Concept-based negation idiom for `class != virtual` cases.

## Reading the catalog

The **reference table** (next section) is the authoritative source of truth for narrative form, canonical signature, and CQL function. Per-pattern cards lower in the document fill in intent / params / category / maturity / evidence / examples / anti-example, but do NOT duplicate the three reference fields.

**Placeholder binding (narrative → canonical):** placeholders in `narrative form` use `<name>` syntax. The template-match pass binds placeholders to canonical parameters **by name** — the placeholder's `<name>` matches the canonical parameter's `name`. Narrative-surface order is irrelevant to binding; it's only the rendered reading order. Canonical parameter order is the AST shape. Example:

```
narrative:  <discriminator> component of <panel>
canonical:  ComponentOf(panel: ConceptRef, discriminator: ConceptRef<T>): T
            ─ <discriminator> in the narrative binds to the `discriminator` canonical param.
            ─ <panel> in the narrative binds to the `panel` canonical param.
            ─ Surface order (discriminator first, panel second) does NOT determine binding.
```

**Binding rules:**
- Every narrative `<name>` placeholder MUST have a same-named canonical parameter. Mismatch is a catalog-validation error caught at catalog-load time.
- Every canonical parameter MUST appear at least once in the narrative (optional params marked `[name]` in the canonical, and the absence is allowed at narrative position).
- Repeated placeholders are equality constraints: `<X> and <X>` would require both positions resolve to the same expression. (Rare in this catalog; flagged where it appears.)

**Placeholder kinds** (for VS Code autocomplete and validator type-direction):
- `<concept>`, `<X>`, `<Y>`, `<event>`, `<panel>`, `<discriminator>`, `<med>`, `<value>`, `<action>`, `<reason>`, `<encounter>`, `<period>`, `<anchor>` — concept reference (quoted name like `"Qualifying Encounter"`)
- `<quantity>`, `<lo>`, `<hi>`, `<target>`, `<duration>` — Quantity literal (`120 'mm[Hg]'`, `30 days`)
- `<n>` — Integer literal
- `<kind>`, `<window>`, `<scope>`, `<classification>` — context-dependent (see per-pattern card)

**Dispatch rules** (where narrative templates overlap):
- `<X> between <A> and <B>` → `Between(value, lo, hi)` when A/B are Quantity literals; `BetweenAnchors(X, start, end)` when A/B are concept refs. Decided by argument kind, not template.
- `<X> within <window>` (top-level) → `Within(X, window): boolean`. `last/first/most recent/earliest <X> within <window>` (embedded in selection pattern) → the selection pattern with `<window>` as its scope; the `within` is a connector, not a `Within(...)` call.
- `has <X>` matches `Has(X)`; `has history of <X>` matches `HasHistoryOf(X)`; longest-match wins.

**Naming convention** (narrative kebab-case → canonical PascalCase):
- Sub-grammar names use kebab-case (`before-start-of`, `after-end-of`).
- Canonical and CQL-function names use PascalCase (`BeforeStartOf`, `AfterEndOf`) — remove hyphens, capitalize each segment.

Each per-pattern card carries:
- **intent** — one-line declarative description; the WHAT
- **params** — clinical parameter sketch; no implementation typing
- **category** — primary; secondary in italics if relevant
- **maturity** — `strong` / `moderate` / `thin`
- **evidence** — Layer-1 (names) + Layer-2 (body shapes / helper calls) + Layer-3 (compositions)
- **examples** — corpus callers (`library :: statement name`)
- **anti-example** — distinguishes from the nearest-neighbor pattern

Three patterns use the **parameterized-umbrella** technique: **`Without(kind, X)`**, **`AsOf(anchor, X)`**, and the **window-from-anchor sub-grammar** (5 sister forms: `before-start-of`, `after-start-of`, `before-end-of`, `after-end-of`, `on-day-of`).

## Composition and precedence

Pattern bodies compose via `and` / `or` / `not` boolean connectors and `(...)` grouping. Precedence (highest binds tightest, mirrors CQL):

1. `not` (unary negation)
2. `and`
3. `or`

So `A and not B or C` parses as `(A and (not B)) or C`. Use explicit parens when in doubt.

**In-argument disjunctions vs top-level connectors.** Some pattern arguments accept a `Disjunction<T>` — `Without(kind, X: ConceptRef | Disjunction<ConceptRef>)`, `NotDoneWithReason(action, reason: ConceptRef | Disjunction<ConceptRef>)`, `Justified(action, reason: ReasonExpr)`. To distinguish an in-arg disjunction from a top-level `or`, **in-arg disjunctions must be parenthesized**:

```crl
// In-arg disjunction (one pattern call, reason is a disjunction):
"X" justified by ("Y" or "Z")

// Top-level disjunction (two pattern calls connected by or):
"X" justified by "Y" or "X" justified by "Z"
```

Without parens, bare `or` between two concept refs in argument position is interpreted as the END of the current pattern call's argument followed by a top-level `or` introducing a sibling pattern. Authors who want the in-arg form MUST parenthesize. The template-match pass enforces this.

For heterogeneous in-arg disjunctions (e.g., `Justified`'s `reason` mixing ConceptRefs and TemporalPredicates), the same rule applies — wrap the whole alternatives list in parens:

```crl
"High BMI Follow-up Service Requests" justified by ("Overweight or Obese Diagnoses" or "Has Overweight or Obese" on or before "High BMI Follow-up Order Date")
```

**Inside selection-pattern scopes.** Connectors `within`, `during`, `on day of`, `between … and …` are narrative sub-grammar (window-from-anchor, OnDayOf, BetweenAnchors), not boolean connectors. They live INSIDE pattern arguments and do not participate in `and`/`or`/`not` precedence at the body level.

## Pattern bodies are narrative

**Rule (v0.4.0):** Pattern bodies are clinical-narrative templates, not function calls. The CRL author writes patterns the way a clinician speaks; the catalog documents the templates; autocomplete and the emitter drive composition and resolution.

**v0.5 refinement:** the catalog formalizes the relationship between the narrative surface and the canonical AST. The `narrative form` column is what the author writes; the `canonical` column is what the parser produces after template-matching. Both forms compose with `and` / `or` / `not` connectors and `(...)` grouping.

**Examples of the shift:**

```crl
// narrative (canonical v0.4.0+, what the author writes)
- apply pattern `"Primary-Care Referrals" justified by "Hypertensive Reading Findings" and "Primary-Care Referrals" was ordered`.

// canonical AST after template-match (what the compiler sees internally)
And(
  Justified(ConceptRef("Primary-Care Referrals"), ConceptRef("Hypertensive Reading Findings")),
  WasOrdered(ConceptRef("Primary-Care Referrals")))

// emitted CQL (what flows downstream — see ConceptRef emission model below)
CRLPatterns.Justified("Primary-Care Referrals" expression, "Hypertensive Reading Findings" expression)
  and CRLPatterns.WasOrdered("Primary-Care Referrals" expression)
```

**Why this works:** narrative is human-friendly; canonical is machine-friendly. The catalog is the bridge.

**Composition.** Patterns combine with `and` / `or` / `not` connectors and `(...)` grouping. Nesting works naturally:

```crl
- apply pattern `("Last Systolic" between 130 'mm[Hg]' and 139 'mm[Hg]' or "Last Diastolic" between 80 'mm[Hg]' and 89 'mm[Hg]') and not ("Last Systolic" at least 140 'mm[Hg]' or "Last Diastolic" at least 90 'mm[Hg]')`.
```

**Authoring tooling.** Without function-call syntax to lean on, autocomplete drives discovery. The VS Code extension sources completion templates from the catalog's `narrative form` field. **Authoring is autocomplete-first.**

**Validator and emitter implications.** The validator template-matches narrative against the catalog and type-checks the canonical AST against the `canonical` signature. The emitter consumes canonical AST + the `CQL function` field, emitting calls into the shared `CRLPatterns.cql` library.

## ConceptRef emission model

`ConceptRef` in canonical signatures denotes "the named concept's evaluable expression," NOT "the concept name as a string." When the emitter generates CQL, every `ConceptRef("Foo")` argument resolves to whatever CQL expression `Foo` evaluates to: a `define`'d expression, a retrieve, a valueset reference, etc., per the concept's declaration.

**Resolution rules** (single global rule, applies to every `ConceptRef`-typed parameter in every pattern):

1. Asserted concept (`coded from <valueset>` or `code from <code>`) → resolves to the valueset/code reference (`"Foo Codes"` or the literal Code).
2. Inferred concept (`inferred from ... apply pattern ...`) → resolves to the `define` expression generated for that concept.
3. Interface concept (no body) → resolves to the `define` expression generated at the Interface layer.

The emitter knows the concept's kind from its declaration and inserts the correct CQL expression at the call site. Pattern functions in `CRLPatterns.cql` therefore take resolved expressions (lists, intervals, resources, values) — not strings.

**Parameter-emission modes:**

| Canonical type | CQL signature shape | What's passed |
|---|---|---|
| `ConceptRef` (Asserted, type=Condition/Encounter/...) | `List<Resource>` or `Choice<...>` | the retrieve/list expression |
| `ConceptRef<Quantity>` (Asserted) | `Quantity` | the singleton-quantity expression |
| `ConceptRef` (Inferred, boolean) | `Boolean` | the `define`'s boolean expression |
| `ConceptRef` (Inferred, with `valuetype is X`) | `X` | the lifted value expression |
| `Instance<T>` (selection return) | `T` | the selected resource/value |
| `Quantity` (literal) | `Quantity` | the literal value (`120 'mm[Hg]'`) |
| `Integer` (literal) | `Integer` | the literal |
| `KindEnum` (literal) | `String` | the enum symbol as a normalized kebab-case string token |
| `AnchorEnum` (literal) | see AnchorExpr row + AnchorEnum emission resolution table below | resolved per the AnchorEnum emission resolution table; never emitted as a raw String |
| `AnchorExpr` (ConceptRef variant) | `Choice<List<Resource>, DateTime, Period>` | the named concept's evaluable expression — typically the resource list or period |
| `AnchorExpr` (StartOf(ref)) | `DateTime` | `start of <ref>.toInterval()` (or per-resource start-of helper) |
| `AnchorExpr` (EndOf(ref)) | `DateTime` | `end of <ref>.toInterval()` |
| `AnchorExpr` (AnchorEnum) | `DateTime` or `Period` | resolved by the per-anchor table (next section) |
| `WindowSpec` | `Interval<DateTime>` | computed from the (duration, anchor) pair |

### AnchorEnum emission resolution

AnchorEnum values resolve to specific CQL expressions at emit time. The catalog table below is the authoritative source for what each clinical-anchor token emits:

| AnchorEnum value | CQL resolution (against the ambient encounter/procedure context) | Emission shape |
|---|---|---|
| `admission` | `<encounter>.period.start` | `DateTime` |
| `discharge` | `<encounter>.period.end` | `DateTime` |
| `delivery` | `<encounter>.lastTimeOfDelivery()` (PCMaternal helper, or equivalent per-context) | `DateTime` |
| `procedure` | `start of <procedure>.performed.toInterval()` | `DateTime` |

**Ambient context requirement.** AnchorEnum values resolve against an ambient resource context drawn from the enclosing scope. Each enum value has a required ambient resource type:

| AnchorEnum value | Required ambient resource |
|---|---|
| `admission` | Encounter |
| `discharge` | Encounter |
| `delivery` | Encounter (or PCMaternal-helper-bound) |
| `procedure` | Procedure |

The emitter binds the ambient resource from the enclosing scope:

- Inside `With(X, ...)` where X's resource type matches the AnchorEnum's required type, the ambient resource is X.
- At top level (no enclosing With), the author must use a concept ref explicitly (`AsOf("Qualifying Encounter", X)`, `AsOf("Index Procedure", X)`) — the AnchorEnum form is not legal without ambient context.
- Validator rejects an unbound AnchorEnum (no compatible ambient resource) with a "missing <required-type> context for AnchorEnum value" error.

The CRLPatterns library handles `CRLPatterns.AsOf` and `CRLPatterns.AgeAt` as **CQL-level overload sets**, one overload per resolved-anchor type. `AgeAt` follows the same overload-set pattern as `AsOf`. Concretely (AsOf shown; AgeAt is parallel):

```
define function AsOf(anchor List<Encounter>, X: ...): boolean ...
define function AsOf(anchor DateTime, X: ...): boolean ...
define function AsOf(anchor Period, X: ...): boolean ...
```

The emitter picks the right overload based on the statically-resolved anchor type. From the CRL author's perspective there is one logical pattern (`AsOf`); the emission/CQL layer carries the overload distinction.

Adding a new AnchorEnum value is a catalog change: add a row to the closed enum AND a row to this resolution table. New enum values are not soft-compile candidates (the emitter has no fallback for unknown anchors).

## Umbrella treatment meta-rule

The catalog has three parameterized umbrellas: `Without`, `AsOf`, and `window-from-anchor`. Two use enum-discriminator pattern; one uses sister-function pattern. The rule:

- **Enum discriminator** when the same parameter shape carries semantically divergent behavior per discriminator value. Different discriminators trigger different resource queries or different property checks. The discriminator selects *which implementation branch*. Used by `Without(kind, X)` (record-of/documented/evidence-of/result-for; open enum with soft-compile warnings) and `AsOf(anchor, X)` (closed AnchorEnum {admission/discharge/delivery/procedure}, plus AnchorExpr modifiers `start of <ref>` / `end of <ref>` on a separate axis).
- **Sister functions** when each variant shares parameter shape AND semantic shape — varying only in positional/temporal direction. No implementation branch needed; each sister is a clean specialization. Used by window-from-anchor (5 sister forms — `BeforeStartOf`, `AfterStartOf`, `BeforeEndOf`, `AfterEndOf`, `OnDayOf` — same `(duration, anchor)` shape, varying only in direction × edge).

When adding a new umbrella: enum if discriminator values have divergent semantics; sister functions if they don't.

## Catalog reference (45 patterns + 5 window-from-anchor sub-grammar forms)

This table is the v0.5 source-of-truth. Return types are explicit. Per-card content (intent, evidence, examples) below the table fills in the rest.

### Classification

| Pattern | Narrative form | Canonical | CQL function |
|---|---|---|---|
| `Has(X)` | `has <X>` | `Has(X: ConceptRef): boolean` | `CRLPatterns.Has` |
| `HasHistoryOf(X[, anchor])` | `has history of <X>` (optionally `prior to <anchor>`) | `HasHistoryOf(X: ConceptRef[, anchor: ConceptRef]): boolean` | `CRLPatterns.HasHistoryOf` |
| `Without(kind, X)` | `without <kind> <X>` (kind ∈ record-of, documented, evidence-of, result-for, …) | `Without(kind: KindEnum \| ConceptRef, X: ConceptRef \| Disjunction<ConceptRef>): boolean` | `CRLPatterns.Without` |
| `CurrentlyTaking(med)` | `currently taking <med>` | `CurrentlyTaking(med: ConceptRef): boolean` | `CRLPatterns.CurrentlyTaking` |
| `HasAdverseReactionTo(X)` | `has adverse reaction to <X>` | `HasAdverseReactionTo(X: ConceptRef): boolean` | `CRLPatterns.HasAdverseReactionTo` |

### Contextualization

| Pattern | Narrative form | Canonical | CQL function |
|---|---|---|---|
| `With(X, Y)` | `<X> with <Y>` | `With(X: ConceptRef, Y: ConceptRef \| SubjectBoundPredicate): boolean` | `CRLPatterns.With` |
| `AsOf(anchor, X)` | `<X> as of <anchor>` | `AsOf(anchor: AnchorExpr, X: ConceptRef): boolean` | `CRLPatterns.AsOf` |
| `Within(X, window)` | `<X> within <window>` — window is a named period OR a window-from-anchor | `Within(X: ConceptRef, window: ConceptRef \| WindowSpec): boolean` | `CRLPatterns.Within` |
| `ComponentOf(panel, discriminator)` | `<discriminator> component of <panel>` | `ComponentOf(panel: ConceptRef, discriminator: ConceptRef<T>): T` (T from discriminator's valuetype) | `CRLPatterns.ComponentOf` |
| `NotDoneWithReason(action, reason)` | `<action> not done with reason <reason>` (reason may be a disjunction `(<A> or <B>)`) | `NotDoneWithReason(action: ConceptRef, reason: ConceptRef \| Disjunction<ConceptRef>): boolean` | `CRLPatterns.NotDoneWithReason` |
| `BaselineAndFollowUp(initial, followup)` | `<initial> with follow-up <followup>` | `BaselineAndFollowUp(initial: ConceptRef, followup: ConceptRef): boolean` | `CRLPatterns.BaselineAndFollowUp` |
| `InpatientStay(encounter[, includePrelude])` | `inpatient stay anchored on <encounter>` (optionally `including prelude`) | `InpatientStay(encounter: ConceptRef[, includePrelude: boolean = false]): Period` | `CRLPatterns.InpatientStay` |
| `WasOrdered(X)` | `<X> was ordered` | `WasOrdered(X: ConceptRef): boolean` | `CRLPatterns.WasOrdered` |

### Assertion

| Pattern | Narrative form | Canonical | CQL function |
|---|---|---|---|
| `Justified(action, reason)` | `<action> justified by <reason>` | `Justified(action: ConceptRef, reason: ReasonExpr): boolean` (see Type notation — heterogeneous disjunction supported) | `CRLPatterns.Justified` |
| `Active(X[, during])` | `<X> is active` (optionally `during <period>`) | `Active(X: ConceptRef[, during: ConceptRef]): boolean` | `CRLPatterns.Active` |
| `IsVerified(X)` | `<X> is verified` | `IsVerified(X: ConceptRef): boolean` | `CRLPatterns.IsVerified` |
| `DocumentedAs(X, classification)` | `<X> documented as <classification>` | `DocumentedAs(X: ConceptRef, classification: ConceptRef): boolean` | `CRLPatterns.DocumentedAs` |

### Qualification (temporal)

Selection patterns (`MostRecent`, `Last`, `Earliest`, `First`) return an `Instance<T>` — a selected resource/event — not a `ConceptRef`. The selected instance feeds into downstream patterns like `ComponentOf(...)`, `WasOrdered`, value comparators.

| Pattern | Narrative form | Canonical | CQL function |
|---|---|---|---|
| `MostRecent(X[, scope])` | `most recent <X>` (optionally `<scope>`) | `MostRecent(X: ConceptRef[, scope: ScopeSpec]): Instance<X>` | `CRLPatterns.MostRecent` |
| `Last(X[, scope])` | `last <X>` (optionally `<scope>`) | `Last(X: ConceptRef[, scope: ScopeSpec]): Instance<X>` | `CRLPatterns.Last` |
| `Earliest(X[, scope])` | `earliest <X>` (optionally `<scope>`) | `Earliest(X: ConceptRef[, scope: ScopeSpec]): Instance<X>` | `CRLPatterns.Earliest` |
| `First(X[, scope])` | `first <X>` (optionally `<scope>`) | `First(X: ConceptRef[, scope: ScopeSpec]): Instance<X>` | `CRLPatterns.First` |
| `During(event, period)` | `<event> during <period>` | `During(event: ConceptRef, period: ConceptRef): boolean` | `CRLPatterns.During` |
| `Overlaps(eventA, eventB)` | `<eventA> overlaps <eventB>` | `Overlaps(eventA: ConceptRef, eventB: ConceptRef): boolean` | `CRLPatterns.Overlaps` |
| `OnDayOfOrAfter(X, anchor)` | `<X> on day of or after <anchor>` | `OnDayOfOrAfter(X: ConceptRef, anchor: ConceptRef): boolean` | `CRLPatterns.OnDayOfOrAfter` |
| `OnOrBefore(X, anchor)` | `<X> on or before <anchor>` | `OnOrBefore(X: ConceptRef, anchor: ConceptRef): boolean` | `CRLPatterns.OnOrBefore` |
| `SameDay(eventA, eventB)` | `<eventA> same day as <eventB>` | `SameDay(eventA: ConceptRef, eventB: ConceptRef): boolean` | `CRLPatterns.SameDay` |
| `BetweenAnchors(X, start, end)` | `<X> between <start> and <end>` (start/end are concept refs — see dispatch rule) | `BetweenAnchors(X: ConceptRef, start: ConceptRef, end: ConceptRef): boolean` | `CRLPatterns.BetweenAnchors` |
| `AtLeastApart(eventA, eventB, duration)` | `<eventA> and <eventB> at least <duration> apart` | `AtLeastApart(eventA: ConceptRef, eventB: ConceptRef, duration: Quantity<time>): boolean` | `CRLPatterns.AtLeastApart` |
| `AtMostApart(eventA, eventB, duration)` | `<eventA> and <eventB> at most <duration> apart` | `AtMostApart(eventA: ConceptRef, eventB: ConceptRef, duration: Quantity<time>): boolean` | `CRLPatterns.AtMostApart` |

### Window-from-anchor (sub-grammar — 5 sister forms)

A parameterized umbrella for windowed-from-anchor temporal scopes. Used as the `window` argument to `Within`, the `scope` argument to selection patterns, and as standalone scope-expressions. All share the parameter shape `(duration: Quantity<time>, anchor: ConceptRef)`; `OnDayOf` is the duration-free variant.

| Pattern | Narrative form | Canonical | CQL function |
|---|---|---|---|
| `before-start-of(duration, anchor)` | `<duration> before start of <anchor>` | `BeforeStartOf(duration: Quantity<time>, anchor: ConceptRef): WindowSpec` | `CRLPatterns.BeforeStartOf` |
| `after-start-of(duration, anchor)` | `<duration> after start of <anchor>` | `AfterStartOf(duration: Quantity<time>, anchor: ConceptRef): WindowSpec` | `CRLPatterns.AfterStartOf` |
| `before-end-of(duration, anchor)` | `<duration> before end of <anchor>` | `BeforeEndOf(duration: Quantity<time>, anchor: ConceptRef): WindowSpec` | `CRLPatterns.BeforeEndOf` |
| `after-end-of(duration, anchor)` | `<duration> after end of <anchor>` | `AfterEndOf(duration: Quantity<time>, anchor: ConceptRef): WindowSpec` | `CRLPatterns.AfterEndOf` |
| `on-day-of(anchor)` | `on day of <anchor>` | `OnDayOf(anchor: ConceptRef): WindowSpec` | `CRLPatterns.OnDayOf` |

**Filled-in examples** (showing how the `within` connector vanishes in canonical form):
- `last "Blood Pressure Panels" within 1 year before start of "Qualifying Encounter"` → `Last("Blood Pressure Panels", BeforeStartOf(1 'year', "Qualifying Encounter"))`
- `last "Blood Pressure Panels" on day of "Qualifying Encounter"` → `Last("Blood Pressure Panels", OnDayOf("Qualifying Encounter"))`
- `last "BP Panels" within 30 days after end of "Procedure"` → `Last("BP Panels", AfterEndOf(30 days, "Procedure"))`
- `"Retinal Exam" within "Year Prior"` → `Within("Retinal Exam", "Year Prior")` *(standalone Within, distinct from the embedded form)*

### Calculation

| Pattern | Narrative form | Canonical | CQL function |
|---|---|---|---|
| `AgeAt(anchor)` | `age at <anchor>` | `AgeAt(anchor: AnchorExpr): Quantity<year>` | `CRLPatterns.AgeAt` |
| `Calculate(X)` | `calculated <X>` | `Calculate(X: ConceptRef<Quantity<U>>): Quantity<U>` (input-list shape thin; see card) | `CRLPatterns.Calculate` |
| `Lowest(X[, scope])` | `lowest <X>` (optionally `<scope>`) | `Lowest(X: ConceptRef<Quantity<U>>[, scope: ScopeSpec]): Quantity<U>` | `CRLPatterns.Lowest` |
| `Highest(X[, scope])` | `highest <X>` (optionally `<scope>`) | `Highest(X: ConceptRef<Quantity<U>>[, scope: ScopeSpec]): Quantity<U>` | `CRLPatterns.Highest` |
| `AtLeastN(events, n)` | `at least <n> <events>` | `AtLeastN(events: ConceptRef, n: Integer): boolean` | `CRLPatterns.AtLeastN` |
| `Consecutive(events, n)` | `<n> consecutive <events>` | `Consecutive(events: ConceptRef, n: Integer): boolean` | `CRLPatterns.Consecutive` |
| `High(X)` | `<X> is high` | `High(X: ConceptRef<Quantity>): boolean` | `CRLPatterns.High` |
| `Low(X)` | `<X> is low` | `Low(X: ConceptRef<Quantity>): boolean` | `CRLPatterns.Low` |
| `Normal(X)` | `<X> is normal` | `Normal(X: ConceptRef<Quantity>): boolean` | `CRLPatterns.Normal` |
| `Abnormal(X)` | `<X> is abnormal` | `Abnormal(X: ConceptRef<Quantity>): boolean` | `CRLPatterns.Abnormal` |
| `AtLeast(value, target)` | `<value> at least <target>` | `AtLeast(value: ConceptRef<Quantity<U>>, target: Quantity<U>): boolean` | `CRLPatterns.AtLeast` |
| `AtMost(value, target)` | `<value> at most <target>` | `AtMost(value: ConceptRef<Quantity<U>>, target: Quantity<U>): boolean` | `CRLPatterns.AtMost` |
| `Between(value, lo, hi)` | `<value> between <lo> and <hi>` (lo/hi are Quantity literals — see dispatch rule) | `Between(value: ConceptRef<Quantity<U>>, lo: Quantity<U>, hi: Quantity<U>): boolean` | `CRLPatterns.Between` |
| `Exceeds(value, target)` | `<value> exceeds <target>` | `Exceeds(value: ConceptRef<Quantity<U>>, target: Quantity<U>): boolean` | `CRLPatterns.Exceeds` |
| `Below(value, target)` | `<value> below <target>` | `Below(value: ConceptRef<Quantity<U>>, target: Quantity<U>): boolean` | `CRLPatterns.Below` |

### State / Process Inference

| Pattern | Narrative form | Canonical | CQL function |
|---|---|---|---|
| `WasPerformed(X)` | `<X> was performed` | `WasPerformed(X: ConceptRef): boolean` | `CRLPatterns.WasPerformed` |

**Note on Quantity-valued concepts.** Patterns that compare numeric values operate on a Quantity-typed concept reference directly — no `.value` access. The concept *is* the quantity (per v0.3.4 property-access policy).

**Type notation:**
- `ConceptRef` — a quoted concept name (`"Hypertensive Reading"`); resolves to the concept's evaluable expression per the ConceptRef emission model.
- `ConceptRef<T>` — a concept whose `valuetype` is `T` (e.g., `ConceptRef<Quantity>` for value-comparison patterns; `ConceptRef<Quantity<U>>` constrains to unit-bearing Quantity where U is a UCUM unit type variable). The validator resolves T by reading the concept's declaration. Concept declarations carry `type` (FHIR resource type) and `valuetype` (the value's type) — the validator reads these to ground `ConceptRef<T>` resolution. See [Property access in pattern bodies] section for an example declaration.
- `Quantity` — a typed quantity literal. Two surface forms are both valid: **UCUM-quoted** (`120 'mm[Hg]'`, `1 'year'`) and **CQL time-unit-bare** (`30 days`, `1 year`, `45 minutes`) for time-unit specializations (the CQL convention). The grammar accepts both; the validator normalizes to a canonical UCUM token internally. `Quantity<time>` constrains to UCUM time-units. `Quantity<U>` is unit-parametric — within a single call, all `Quantity<U>` arguments must share the same canonical unit (no unit conversion in v0.5.x), so `Between(value: ConceptRef<Quantity<mm[Hg]>>, lo: 120 'mm[Hg]', hi: 90 'kg')` is a unit-mismatch validator error. `Quantity<year>` is the conventional shorthand for `Quantity<'a'>` (UCUM annum).
- `Integer`, `boolean` — primitives.
- `Period` — an `Interval<DateTime>`-like primitive returned by `InpatientStay`. Not used directly in narrative; consumed by lifting into a named concept (see `InpatientStay` card's lift idiom). Authors never write `Period` directly.
- `Instance<T>` — a selected resource/event of the concept type T. Returned by `MostRecent`/`Last`/`Earliest`/`First`. Feeds into `ComponentOf(...)`, value comparators, and `WasOrdered`/`WasPerformed` as the "the actual selected resource."
- `Disjunction<T>` — a disjunctive expression `(<A> or <B>[ or <C>…])` of T-typed elements (used by `Without`, `NotDoneWithReason`, `Justified` reason args). Supports two or more disjuncts; nested parens not currently in scope.
- `PatternCall` — any canonical-form pattern AST node (e.g. `WasOrdered("X")`, `OnOrBefore(X, Y)`).
- `SubjectBoundPredicate` — a **boolean-returning** `PatternCall` from a closed set, where the first canonical-position argument is the bound subject Y (the parent `With(...)`'s second argument). Used to express "case feature X qualified by predicate-about-Y," where the X↔Y correlation is supplied by the `CRLPatterns.With` consumer.
  - **Closed set** (after canonicalization, Y appears at position 0):
    - **Action / state predicates:** `WasPerformed(Y)`, `WasOrdered(Y)`, `IsVerified(Y)`, `Active(Y[, during])`, `Has(Y)`, `HasHistoryOf(Y[, anchor])`, `CurrentlyTaking(Y)`, `HasAdverseReactionTo(Y)`, `DocumentedAs(Y, classification)`
    - **Temporal predicates with Y as subject:** `Within(Y, window)`, `During(Y, period)`, `OnOrBefore(Y, anchor)`, `OnDayOfOrAfter(Y, anchor)`, `Overlaps(Y, eventB)`, `SameDay(Y, eventB)`, `BetweenAnchors(Y, start, end)`, `AtLeastApart(Y, eventB, duration)`, `AtMostApart(Y, eventB, duration)`
    - **Aggregate predicates with Y as subject:** `AtLeastN(Y, n)`, `Consecutive(Y, n)`
  - **NOT in the subset** (and the validator rejects them in Y position):
    - **Value comparators**: `AtLeast`, `AtMost`, `Between`, `Exceeds`, `Below` — first arg is a Quantity-valued subject compared to a target literal; no implicit X-correlation. `With("Encounter", AtLeast("BMI", 30 'kg/m2'))` is rejected because BMI-at-least-30 is a standalone clinical predicate, not an encounter-qualifying relationship.
    - **Range classifiers**: `High`, `Low`, `Normal`, `Abnormal` — similar; standalone classification, not a qualification of the parent subject.
    - **Patterns where Y is not at position 0:** `Justified(action, Y)` (Y is reason, not action); `ComponentOf(panel, Y)` (Y is discriminator); `NotDoneWithReason(action, Y)` (Y is reason).
    - **Non-boolean patterns:** selection patterns return `Instance<T>`; `ComponentOf` returns `T`; `Calculate`/`Lowest`/`Highest`/`AgeAt` return Quantity — none of these are SubjectBoundPredicates.
  - **Validator behavior:** after the template-match pass canonicalizes, the validator checks that Y appears at the first canonical position of the inner pattern call AND that the inner pattern is in the closed set. Both checks must pass.
  - **Note:** the set is **clinical-narrative-bounded**, not just structural. Value comparators and range classifiers are excluded even though they structurally have Y at position 0, because the corpus shows they're authored as standalone predicates, not as encounter/case-feature qualifiers. If a future corpus surfaces a clinical use of `With(X, AtLeast(Y, ...))`, revisit.
- `TemporalPredicate` — a boolean-returning pattern call from the temporal-qualification set: {`During`, `Overlaps`, `OnOrBefore`, `OnDayOfOrAfter`, `SameDay`, `BetweenAnchors`, `AtLeastApart`, `AtMostApart`}. Used by `Justified` reason and other patterns that accept a temporal sub-predicate. (Note: removed `Before`/`After` placeholders in v0.5.1 round-2 — they were referenced but not defined as catalog patterns; `OnOrBefore`/`OnDayOfOrAfter` carry that semantics.)
- `Instance<T>` ↔ `ConceptRef<T>` coercion rule: an `Instance<T>` is assignment-compatible with `ConceptRef<T>` wherever the latter appears in a canonical signature. Treat both as "a value of type T's valuetype" — the difference is only that `Instance<T>` is a single selected resource while `ConceptRef<T>` may resolve to a list. Comparators (`AtLeast`, `Between`, …) and `ComponentOf`'s `panel` parameter all accept the coerced form. This means `AtLeast(MostRecent("Systolic BP"), 140 'mm[Hg]')` is type-valid: the selection returns `Instance<Quantity<mm[Hg]>>`, which the validator accepts as `ConceptRef<Quantity<mm[Hg]>>` per this rule.
- `ReasonExpr` — type for `Justified`'s reason slot. `ReasonExpr = ConceptRef | TemporalPredicate | Disjunction<ConceptRef | TemporalPredicate>` — the disjunction is type-heterogeneous: each disjunct may be a ConceptRef or a TemporalPredicate.
- `KindEnum` — open enum for `Without`'s discriminator. Tokens are kebab-case (`record-of`, `documented`, `evidence-of`, `result-for`, …) and case-sensitive. Unquoted lowercase identifiers in `kind` position lex as enum tokens; quoted-string tokens lex as ConceptRefs (per the `KindEnum | ConceptRef` widening). Unknown enum values produce validator warnings (soft compile).
- `AnchorEnum` — **closed** enum for clinical-anchor literals: {`admission`, `discharge`, `delivery`, `procedure`}. These are clinically-meaningful temporal landmarks distinct from generic temporal slices. Lexed as unquoted lowercase identifiers; concept refs are quoted strings. Adding a new AnchorEnum value is a catalog change (not a soft-compile warning) because each value corresponds to a specific emission rule.
- `WindowSpec` — one of the 5 window-from-anchor canonical forms: `BeforeStartOf`, `AfterStartOf`, `BeforeEndOf`, `AfterEndOf`, `OnDayOf`.
- `ScopeSpec` — the optional scope on selection patterns. `ScopeSpec = ConceptRef | WindowSpec`. A bare concept ref scopes to that named period/encounter; a window-spec scopes to the computed interval.
- `AnchorExpr` — anchor reference for `AsOf` and `AgeAt`. `AnchorExpr = ConceptRef | StartOf(ConceptRef) | EndOf(ConceptRef) | AnchorEnum`. `start of <ref>` and `end of <ref>` are productive modifiers usable in any AnchorExpr position. `AnchorEnum` carries clinically-named anchors (admission, discharge, delivery, procedure) distinct from generic temporal slices.

## Property access in pattern bodies

**Rule: no FHIR property access in CRL pattern bodies.** Pattern bodies reference concepts by name only — never `<concept>.<fhir-field>`. CRL is for clinical authors (doctors, nurses, informaticists). They write clinical concepts and clinical patterns, not FHIR navigations.

When a pattern needs a property of a clinical concept (the date an order was placed, the start of a diagnosis's prevalence, the value of a measurement), lift that property into a separate named concept and reference the concept.

**Concept-based property naming — the lift idiom.**

```crl
concept "High BMI Follow-up Order Date":
- type is ServiceRequest.
- valuetype is dateTime.
- inferred from "High BMI Follow-up Service Requests".
```

The lifted concept is the clinical name for "when the high-BMI follow-up was ordered." The emitter resolves it to `<source>.authoredOn` based on the source type, valuetype, and clinical-name suffix.

**Quantity values.** Patterns that compare numeric values operate on a Quantity-typed concept reference directly — no `.value` access. The Quantity concept's numeric content is implicit.

**Common lifts (source type → resolved FHIR property):**

| Lifted concept name | Source type | Emitter resolves to |
|---|---|---|
| `<thing> Order Date` | ServiceRequest / MedicationRequest | `.authoredOn` |
| `<thing> Performed Date` | Procedure | `.performed` |
| `<thing> Issued Date` | Observation | `.issued` |
| `<thing> Established Date` / `<thing> Onset` | Condition | `.prevalenceStart` (helper-resolved) |
| `<thing> Effective Date` | Observation / DiagnosticReport | `.effective` |

## Quick index

| Category | Patterns |
|---|---|
| Classification | `Has(X)`, `HasHistoryOf(X[, anchor])`, `Without(kind, X)`, `CurrentlyTaking(med)`, `HasAdverseReactionTo(X)` |
| Contextualization | `With(X, Y)`, `AsOf(anchor, X)`, `Within(X, window)`, `ComponentOf(panel, discriminator)`, `NotDoneWithReason(action, reason)`, `BaselineAndFollowUp(initial, followup)`, `InpatientStay(encounter[, includePrelude])`, `WasOrdered(X)` |
| Assertion | `Justified(action, reason)`, `Active(X[, during])`, `IsVerified(X)`, `DocumentedAs(X, classification)` |
| Qualification (temporal) | `MostRecent(X[, scope])`, `Last(X[, scope])`, `Earliest(X[, scope])`, `First(X[, scope])`, `During(event, period)`, `Overlaps(eventA, eventB)`, `OnDayOfOrAfter(X, anchor)`, `OnOrBefore(X, anchor)`, `SameDay(eventA, eventB)`, `BetweenAnchors(X, start, end)`, `AtLeastApart(eventA, eventB, duration)`, `AtMostApart(eventA, eventB, duration)` |
| Calculation | `AgeAt(anchor)`, `Calculate(X)`, `Lowest(X)`, `Highest(X)`, `AtLeastN(events, n)`, `Consecutive(events, n)`, `High(X)`, `Low(X)`, `Normal(X)`, `Abnormal(X)`, `AtLeast(value, target)`, `AtMost(value, target)`, `Between(value, lo, hi)`, `Exceeds(value, target)`, `Below(value, target)` |
| State / Process Inference | `WasPerformed(X)` |

## Patterns dropped from v0.1 (and why)

- **`PrevalenceInterval(condition)`** — HOW. Helper-derived Period the emitter picks; informaticist says "condition active during X" → `Active(condition[, during])`.
- **`MedicationPeriod(record)`** — same shape; folded into `Active(medication[, during])`.
- **`OffsetFromAnchor(X, anchor, offset)`** — "offset" leaks calendar-arithmetic. Renamed `OnDayOfOrAfter(X, anchor)` + split out `BetweenAnchors(X, start, end)`.
- **`ScreeningWithFollowUp(screening, followup, window)`** — not a primitive; composite written as `With(my-screening, my-followup-action)`.
- **`RiskAdjusted(observation, adjusters)`** — framework, not pattern.
- **`EncounterWith(criterion)`** / **`QualifyingEncounter(criterion)`** — folded into `With(encounter, criterion)`.
- **`StateAtAnchor(X, anchor)`** — renamed `AsOf(anchor, X)`.
- **`PresentOnAdmission(diagnosis)`** — specialization of `AsOf(admission, diagnosis-present)`.
- **`OnAdmission(X)` / `AtDischarge(X)` / `DuringEncounter(event)`** — covered by `AsOf` and `During`.
- **`Threshold(value, op, target)`** — split into individual primitives.
- **`Count(events)` / `CountAtLeast(events, n)`** — collapsed to `AtLeastN(events, n)`.
- **`LatestValue(field)`** anti-example mention removed (HOW slip).
- **`Hospitalization(encounter)`** — renamed `InpatientStay(encounter[, includePrelude])`.
- **`AssessmentPair(initial, followup)`** — renamed `BaselineAndFollowUp(initial, followup)`.
- ~~**`First(X) / Last(X)`** — merged into `Earliest(X[, anchor])` paired with `MostRecent(X[, anchor])`.~~ **Restored after operator pushback.**
- **`ConditionActiveDuring(condition, period)`** — folded into `Active(X[, during])`.
- **`ClinicalRangeClassification`** — split into doctor-natural primitives `High`, `Low`, `Normal`, `Abnormal`.
- **`Has(X, when)`** — optional `when` parameter dropped in v0.5.1 (zero corpus use; the `<X> during <period>` shape carries the temporal qualifier via composition).
- **`Component`** — renamed to `ComponentOf` in v0.5.1 to avoid FHIR `.component` collision and align with narrative form.
- **`Verified`** — renamed to `IsVerified` in v0.5.1 to align with `Active`/sister-attestational naming.
- **`AtLeastDaysApart` / `AtMostDaysApart`** — renamed to `AtLeastApart` / `AtMostApart` in v0.5.1 with `Quantity<time>` so weeks/months also work narratively.

---

## Classification

### `Has(X)`
- **intent** — patient has qualifying evidence of X
- **params** — `X` (clinical concept)
- **category** — Classification *(foundational; composes with most others)*
- **maturity** — strong
- **evidence** — L1: `Has …` is the dominant naming shape (60+ distinct n-gram families). L2: body root often `Exists(Retrieve)` or `Exists(Query)`. L3: appears as input to almost every higher-order composition.
- **examples** — `CMS117 :: Has HIV`, `CMS117 :: Has Severe Combined Immunodeficiency`, `CMS135 :: Has Diagnosis of Pregnancy`, `CMS1154 :: Has Pregnancy Diagnosis During Measurement Period`
- **anti-example** — not `Has(X)` if the assertion is specifically about state-at-an-anchor (use `AsOf(anchor, X)`), or about reasons / contraindications (use `HasAdverseReactionTo(X)` or `NotDoneWithReason(action, reason)`). For temporal scoping, compose with `During(...)` rather than adding a `when` argument — there's no `when` parameter as of v0.5.1.

### `HasHistoryOf(X[, anchor])`
- **intent** — patient had X in the past (prior to a clinical anchor, often resolved or significant)
- **params** — `X`; `anchor` optional (defaults to current/now)
- **category** — Classification *, secondary Qualification*
- **maturity** — moderate
- **evidence** — L1: `History of` (3+), `Prior MI` family.
- **examples** — `CMS137 :: History of SUD Diagnosis or Treatment`, `CMS145 :: History of Cardiac Surgery Prior to Encounter`, `CMS2 :: History of Bipolar Diagnosis Before Qualifying Encounter`
- **anti-example** — `Has(X)` if the condition is current/relevant *now*. `HasHistoryOf` implies past/resolved.

### `Without(kind, X)` *(parameterized umbrella)*
- **intent** — qualifying evidence of X is absent (in a clinically specific way)
- **params** — `kind` ∈ {`record-of`, `documented`, `evidence-of`, `result-for`, …} OR a concept reference for measure-specific discriminators; `X` (concept reference, or a disjunction of concepts in the pattern body — `"A" or "B"`)
- **category** — Classification
- **maturity** — strong
- **filled-in reads:**
  - `Without(record-of, BMI)` → "without record of BMI in the patient's data"
  - `Without(documented, allergy)` → "without documented allergy"
  - `Without(evidence-of, screening)` → "without evidence of screening performed"
  - `Without(result-for, A1c-test)` → "without result for A1c test"
  - `Without(documented, "Documented High BMI" or "Documented Low BMI")` → "without documented high or low BMI"
- **discriminator extension policy** — discriminator is open (`KindEnum | ConceptRef`). Add a clinical-narrative enum value (if generic-reusable) or pass a measure-specific concept reference directly. Unknown enum values produce validator warnings.
- **evidence** — L1: `No VTE Prophylaxis` (10), `No Mechanical VTE` (8), `Has No Record Of`, `Without Result`. L2: 7 `absence-of`-tagged statements.
- **examples** — `CMS108 :: No VTE Prophylaxis Medication Administered Or Ordered` (`evidence-of`), `CMS122 :: Has No Record Of Glycemic Status Assessment` (`record-of`), `CMS122 :: Has Most Recent Glycemic Status Assessment Without Result` (`result-for`), `CMS22 :: First Hypertensive Reading` (`record-of`), `CMS69 :: Has Normal BMI` (`documented`)
- **anti-example** — when the absence has a documented reason, use `NotDoneWithReason(action, reason)`.
- **modeling note (v0.3.5)** — when an `inferred from (X and not Y)` shape appears at the concept layer, the negation is often `Without(kind, Y)`. Check whether the absence reads as a clinician's clinical phrase.

### `CurrentlyTaking(med)`
- **intent** — patient is currently on medication X
- **params** — `med`
- **category** — Classification *, secondary State Inference*
- **maturity** — moderate
- **evidence** — L1: `Is Currently Taking` (4). L2: body is `Exists(MedicationRequest…where status=active)`.
- **examples** — `CMS135 :: Is Currently Taking ACEI or ARB or ARNI`, `CMS144 :: Is Currently Taking Beta Blocker Therapy for LVSD`
- **anti-example** — `Active(med, during(measurement-period))` if the question is *was on the medication at some point during a period*, not specifically *taking it now*.

### `HasAdverseReactionTo(X)`
- **intent** — patient has documented allergy / intolerance / adverse reaction / contraindication to X
- **params** — `X` (substance or intervention)
- **category** — Classification
- **maturity** — moderate
- **evidence** — L1: `Has Allergy or Intolerance to` (5), `Has Allergy or` (4). L2: typically `Exists(AllergyIntolerance where code in valueset)` plus condition-coded contraindications.
- **examples** — `CMS135 :: Has Allergy or Intolerance to ACEI or ARB or ARNI Ingredient`, `CMS144 :: Has Allergy or Intolerance to Beta Blocker Therapy Ingredient`
- **anti-example** — `NotDoneWithReason(action, reason)` when the reason is something other than allergy/intolerance.

---

## Contextualization

### `With(X, Y)`
- **intent** — combining two case features: X qualified by, accompanied by, or paired with Y
- **params** — `X` (subject — typically an encounter, finding, or activity); `Y` (qualifier — a concept ref OR a `SubjectBoundPredicate` where Y is the bound subject — see Type notation for the closed legal-pattern subset)
- **Y position constraint** — Y must be either (a) a bare ConceptRef or (b) a `SubjectBoundPredicate` (closed set — see Type notation). The closed set excludes value comparators, range classifiers, and patterns where Y is not at canonical position 0. `With("Encounter", AtLeast("BMI", 30 'kg/m2'))` is REJECTED because `AtLeast` is a value comparator (excluded from SubjectBoundPredicate), not because of subject identity. `With("Encounter", "BP Reading" was performed)` parses as `With("Encounter", WasPerformed("BP Reading"))` — `WasPerformed` is in the closed set; Y is "BP Reading"; X↔Y correlation ("the BP Reading is associated with this Encounter") is supplied by `CRLPatterns.With`.
- **category** — Contextualization *, secondary Classification*
- **maturity** — strong
- **evidence** — L1: `Encounter With` (101), `Qualifying Encounter` (15+11), `Delivery Encounter With` (6), `ED Encounter with` (6), `Has THA with` (5), `Has Encounter with` (10). L2: 44 `encounter-qualification`-tagged statements; root often `Query` with `where`-clause or `with`-relationship.
- **examples** — `CMS0334 :: Delivery Encounter With Calculated Gestational Age Greater Than Or Equal To 37 Weeks`, `CMS22 :: Encounter with Elevated Blood Pressure Reading`, `CMS56 :: Has THA with Initial and Follow Up HOOS Assessments`
- **anti-example** — `BaselineAndFollowUp(initial, followup)` when the qualifier is *specifically* a paired assessment with comparison semantics.

### `AsOf(anchor, X)` *(parameterized umbrella)*
- **intent** — the clinical state of X as of a specific anchor point
- **params** — `anchor: AnchorExpr` (concept ref like `"Qualifying Encounter"`; or `start of "Qualifying Encounter"` / `end of "Procedure"`; or clinical-anchor enum value like `admission`/`discharge`/`delivery`/`procedure`); `X` (clinical state, typically verified/established status concept)
- **category** — Contextualization *, secondary Classification*
- **maturity** — strong
- **filled-in reads:**
  - `AsOf(admission, diagnosis-present)` → "as of admission, the diagnosis was present"
  - `AsOf(discharge, antithrombotic-ordered)` → "as of discharge, antithrombotic was ordered"
  - `AsOf(StartOf("Qualifying Encounter"), exclusion-active)` → "as of the start of the qualifying encounter, exclusion was active"
  - `AsOf("Qualifying Encounter", "Verified Hypertension")` → "as of the qualifying encounter, verified hypertension was established"
- **AnchorExpr policy** — `start of <ref>` and `end of <ref>` are productive modifiers, usable in any anchor position. The clinical-anchor enum (admission/discharge/delivery/procedure) is for clinically-named events distinct from generic temporal slices. Bare concept refs scope to the whole period.
- **evidence** — L1: `Present on Admission` (13), `On Admission` (4), `Active at Admission` (6), `At Discharge` (8). L2 helper: `CQMCommon.isDiagnosisPresentOnAdmission` (14 calls). L3: dominant compositional pattern in CMS1017 HHFI risk-adjustment.
- **examples** — `CMS1017 :: Risk Variable Encounter with Anticoagulant Active at Admission`, `CMS22 :: Verified Hypertension As Of Qualifying Encounter`
- **anti-example** — `During(event, period)` when the question is whether the event occurred *anywhere within a period*.
- **modeling note (v0.3.5)** — `AsOf(<anchor>, "Verified Y")` encapsulates both "Y exists" and "Y was established by <anchor>" temporal anchoring. Don't compose `IsVerified(Y) and OnOrBefore(Y-established-date, <anchor>)` — that's the umbrella unwrapped.

### `Within(X, window)`
- **intent** — evidence of X exists in a window defined relative to a clinical anchor (look-back or look-forward)
- **params** — `X`; `window` (named clinical period OR anchor-anchored window-spec)
- **category** — Contextualization *, secondary Qualification*
- **maturity** — moderate
- **why Contextualization** — `Within` relates clinical evidence to a clinically-named anchor. Sister to `AsOf(anchor, X)`.
- **dispatch note** — standalone `<X> within <window>` → `Within(X, window): boolean`. The `within` word also appears as a CONNECTOR inside selection patterns (`last <X> within <window-spec>`) — there it's narrative sugar for the selection's scope argument, NOT a `Within(...)` call. See the dispatch rule above.
- **evidence** — L1: `Year Prior` (5), `Look Back Period` (4), "Within 6 Months" formulations. L2: CMS22 prior-year hypertensive reading lookback.
- **examples** — `CMS22 :: Prior-Year Hypertensive Reading`, `CMS131 :: Retinal Exam in Measurement Period or Year Prior`
- **anti-example** — `During(event, period)` for containment in a named period (single-event temporal qualifier); `OnDayOfOrAfter(X, anchor)` for calendar-day specificity.

### `ComponentOf(panel, discriminator)`
- **intent** — extract the named component value from a composite measurement panel
- **params** — `panel` (composite Observation); `discriminator` (concept naming which component — wraps the component-identifying code/valueset and carries the component's `valuetype`)
- **category** — Contextualization *, secondary Classification*
- **maturity** — moderate
- **why Contextualization** — relates a composite resource shape to one of its named sub-elements. Extraction, not derivation.
- **return type** — `T` where T is the discriminator concept's `valuetype` (NOT the panel's; the panel is `Observation` while the component's value is `Quantity`/etc.). The validator reads T from the discriminator's concept declaration.
- **filled-in reads:** `ComponentOf("Blood Pressure Panels", "Systolic Blood Pressure Code")` → "the systolic component of the blood pressure panel"; returns `Quantity<mm[Hg]>` because `"Systolic Blood Pressure Code"` has `valuetype is Quantity<mm[Hg]>`.
- **evidence** — L2: BP panel `.component` access via `singleton from … where C.code ~ "Systolic"` (CMS22). The discriminator-concept pattern wraps the component-identifying code at the Asserted layer.
- **examples** — `CMS22 :: Systolic BP Reading`, `CMS22 :: Diastolic BP Reading`, `CMS22 :: Last Systolic on Qualifying Encounter Day`
- **anti-example** — `Calculate(X)` is for *deriving* a new feature; `ComponentOf` is for *extracting* an existing component.
- **idiom note** — Discriminator concepts at the Asserted layer wrap the component-identifying code/valueset AND declare the component's `valuetype`. The discriminator is the load-bearing typed handle.
- **rename note (v0.5.1)** — was `Component` in v0.5; renamed to `ComponentOf` to avoid the FHIR `.component` collision (CQL emission risk) and align with narrative `<discriminator> component of <panel>`.

### `NotDoneWithReason(action, reason)`
- **intent** — the expected action was not performed, with an accepted clinical or patient reason
- **params** — `action`; `reason` (may be single valueset OR disjunction)
- **category** — Contextualization *, secondary State Inference*
- **maturity** — strong
- **evidence** — L1: `Has Medical or Patient Reason for Not Ordering X` (5), `Encounter With No X Due To Medical Reason` (4). L2: 4 statements; body combines absence-of-action with presence-of-reason.
- **examples** — `CMS135 :: Has Medical or Patient Reason for Not Ordering ACEI or ARB or ARNI`, `CMS22 :: Encounter with Medical Reason for Not Obtaining or Patient Declined Blood Pressure Measurement`, `CMS69 :: Medical Reason Or Patient Reason For Not Performing BMI Exam`
- **anti-example** — `Without(kind, X)` when there's no documented reason — just absence.
- **resource-type note** — Generalizes across action-resource families: Observation cancellation (`notDoneReason`), ServiceRequest declined (`reasonRefused`), MedicationRequest not requested (`reasonRefused`). Emitter resolves to the resource-specific property.

### `BaselineAndFollowUp(initial, followup)`
- **intent** — initial/baseline assessment paired with a follow-up assessment (often supports comparison or change-from-baseline)
- **params** — `initial`, `followup`
- **category** — Contextualization *, secondary Qualification*
- **maturity** — thin (sample-specific to functional-status measures)
- **evidence** — L1: `Initial and Follow Up` (5+ pattern instances).
- **examples** — `CMS56 :: Has THA with Initial and Follow Up HOOS Assessments`, `CMS90 :: Has Encounter with Initial and Follow Up PROMIS10 Assessments`
- **anti-example** — `With(X, Y)` when there's no time/order relationship.

### `InpatientStay(encounter[, includePrelude])`
- **intent** — the full inpatient hospitalization episode anchored on the encounter, optionally including the ED/observation prelude
- **params** — `encounter`; `includePrelude` (whether to count the ED visit and observation prelude as part of the stay)
- **category** — Domain Semantic Normalization *, secondary Contextualization*
- **maturity** — strong (inpatient-flow measures rely on this)
- **return type** — `Period`. Lift idiom: declare a named concept (`"Hospitalization"` with `inferred from <Encounter> apply pattern \`inpatient stay anchored on <Encounter>\``) and use the concept ref downstream. Patterns like `During(X, "Hospitalization")` then work on the named-period concept, not the raw `Period`.
- **evidence** — L2 helper: `CQMCommon.hospitalizationWithObservation` (7 sample calls).
- **examples** — used in CMS108 VTE Prophylaxis, CMS1017 HHFI for the canonical "during the hospitalization" anchor
- **anti-example** — `During(event, encounter)` for a *single encounter's period*; `InpatientStay` is the broader stay-episode.

### `WasOrdered(X)`
- **intent** — the action was ordered/requested (intent recorded; resource exists even if not performed)
- **params** — `X` (action — medication, service, procedure)
- **category** — Contextualization *, secondary State Inference*
- **maturity** — moderate
- **evidence** — L1: `Or Ordered` (4), `Statin Therapy Ordered`, `Beta Blocker Therapy Ordered`. L2: `Exists(MedicationRequest|ServiceRequest where intent=order)`.
- **examples** — `CMS347 :: Statin Therapy Ordered during Measurement Period`, `CMS144 :: Has Beta Blocker Therapy for LVSD Ordered`
- **anti-example** — `WasPerformed(X)` when the question is *was the action completed*, not *was it requested*.

---

## Assertion

**What "Assertion" means here.** Most patterns either *constrain* (qualifiers), *select* (selection patterns), *combine* (`With`), or *predicate over evidence* (`Has`, `Without`, etc.). Assertion patterns are different: they add a *clinical claim* about the subject — a relationship, status, confidence, or classification. Three sub-shapes:

- **Justificatory** — `Justified(action, reason)` asserts a clinical-appropriateness link.
- **Stateful** — `Active(X[, during])` asserts currently-relevant status.
- **Attestational** — `IsVerified(X)` and `DocumentedAs(X, classification)` assert a clinician's attestation.

### `Justified(action, reason)`
- **intent** — the action was performed/ordered with a clinical reason that matches the specified valueset, optionally further qualified by a temporal predicate
- **params** — `action`; `reason` (a valueset of acceptable reason concepts, or a disjunction of concepts, or a temporal predicate sub-call like `<Y> on or before <date>`)
- **category** — Assertion *, secondary Classification*
- **maturity** — strong
- **evidence** — Pervasive — `reasonCode in valueset` is one of the most common qualifying clauses in DQM. CMS69 alone uses it 6× across the BMI intervention defines.
- **examples** — `CMS69 :: High BMI Interventions Ordered` (`"High BMI Follow-up Service Requests" justified by "Overweight or Obese Diagnoses" or "Has Overweight or Obese" on or before "High BMI Follow-up Order Date"`), `CMS69 :: Low BMI Interventions Performed`, `CMS22 :: Hypertensive Reading Interventions`
- **anti-example** — `NotDoneWithReason(action, reason)` — Justified is "performed *for* X reason"; NotDoneWithReason is "*not* performed *because of* Y reason."

### `Active(X[, during])`
- **intent** — X (condition or medication) is in an active state — currently clinically relevant — optionally during a clinically-named period
- **params** — `X`; `during` optional (a period)
- **category** — Assertion *, secondary Qualification*
- **maturity** — strong
- **evidence** — L2 helper: `QICoreCommon.prevalenceInterval` (30 sample calls), `CMD.medicationRequestPeriod` (6), `CMD.medicationDispensePeriod` (3). L1: `Has Active` (4), `Active at Admission` (6).
- **examples** — `CMS1157 :: Has Active HIV Diagnosis Starts On or Before First 240 Days of Measurement Period`, `CMS153 :: Has Active Contraceptive Medications`, `CMS1154 :: Has Pregnancy Diagnosis During Measurement Period`
- **anti-example** — `Has(X)` when "active" status doesn't matter; `AsOf(anchor, X-active)` when the question is specifically state at one anchor point.

### `IsVerified(X)`
- **intent** — the finding/diagnosis carries an acceptable verification status — typically null or not "refuted"/"entered-in-error"
- **params** — `X` (condition or finding)
- **category** — Assertion
- **maturity** — strong
- **evidence** — L2 helper: `QICoreCommon.verified` (24 sample calls); local-measure helpers like CMS22's `isVerified()` accept null + confirmed + unconfirmed + provisional + differential.
- **examples** — `CMS117 :: Has HIV` (calls `QICoreCommon.verified`), `CMS22 :: Verified Hypertension`
- **anti-example** — `Has(X)` if you don't care about verification status.
- **emission note (v0.5.1)** — `CRLPatterns.IsVerified` resolves to the corpus-convergent accepted set `{null, confirmed, unconfirmed, provisional, differential}` (excludes `refuted` and `entered-in-error`). If future measure variance demands per-resource-type or per-measure overrides, the signature widens to `IsVerified(X: ConceptRef, resourceType: ResourceTypeEnum)` — held off for v0.5.1 because every corpus instance uses the same accepted set.
- **rename note (v0.5.1)** — was `Verified` in v0.5; renamed to `IsVerified` aligning with `Active`/`IsXxx` sister-attestational naming convention.

### `DocumentedAs(X, classification)`
- **intent** — a measurement or finding is documented as falling in a specific clinical classification
- **params** — `X` (measurement); `classification` (clinical category)
- **category** — Assertion *, secondary Classification*
- **maturity** — moderate
- **evidence** — L1: `Documented High BMI`, `Documented Low BMI` family in CMS69.
- **examples** — `CMS69 :: Documented High BMI During Measurement Period`, `CMS69 :: Documented Low BMI During Measurement Period`
- **anti-example** — `High(X)` / `Low(X)` for a *computed* classification. `DocumentedAs` is when the clinician asserted directly.

---

## Qualification (temporal)

**A note on the four temporal-selection cards below.** `First`/`Last` are **positional**; `Earliest`/`MostRecent` are **explicitly temporal**. In clinical practice they overlap because most "first" things happen to be ordered by time — but `First-line treatment` is not the temporally-earliest treatment.

**A note on selection-pattern returns.** All four selection patterns return `Instance<X>` — a selected resource/event of the concept type, not a `ConceptRef`. Downstream patterns like `ComponentOf(...)`, value comparators, and `WasOrdered`/`WasPerformed` consume the selected instance. When the selection feeds a value pattern, the instance auto-coerces to its `valuetype` for the comparison.

### `MostRecent(X[, scope])`
- **intent** — the chronologically most recent qualifying X (explicitly temporal)
- **params** — `X`; `scope: ScopeSpec` optional (a period, encounter concept, or window-from-anchor to scope the lookback)
- **category** — Qualification
- **maturity** — strong
- **evidence** — L1: `Most Recent` (15), `Has Most Recent` (5), `on Most Recent X Day` (3). L2 helper: `QICoreCommon.latest` (7).
- **examples** — `CMS122 :: Most Recent Glycemic Status Date`, `CMS165 :: Most Recent Blood Pressure Day`, `CMS1154 :: Most Recent BMI`
- **anti-example** — `Last(X)` when the ordering isn't necessarily time (e.g. "last-line treatment").

### `Last(X[, scope])`
- **intent** — the last qualifying X in a sequence — positional, not necessarily temporal
- **params** — `X`; `scope: ScopeSpec` optional (a sequence/period/encounter concept OR window-from-anchor to bound the "last in")
- **category** — Qualification
- **maturity** — moderate
- **scope examples** —
  - `last "BP Panels" on day of "Qualifying Encounter"` → `Last("BP Panels", OnDayOf("Qualifying Encounter"))`
  - `last "BP Panels" within 1 year before start of "Qualifying Encounter"` → `Last("BP Panels", BeforeStartOf(1 'year', "Qualifying Encounter"))`
- **evidence** — L1: `Last Hemoglobin A1c Result`, `Last Anesthesia Within Hospitalization`, `latestGeneralAnesthesiaOrMAC`. L2 helper: `QICoreCommon.latest` (7).
- **examples** — `CMS56/CMS90 :: latestGeneralAnesthesiaOrMAC`, `PCMaternal :: lastTimeOfDelivery`, `CMS22 :: Last BP Panel on Qualifying Encounter Day`
- **anti-example** — `MostRecent(X)` when the ordering is strictly time-from-now.

### `Earliest(X[, scope])`
- **intent** — the chronologically earliest qualifying X (explicitly temporal)
- **params** — `X`; `scope: ScopeSpec` optional
- **category** — Qualification
- **maturity** — strong
- **evidence** — L2 helper: `QICoreCommon.earliest` (28 sample calls).
- **examples** — `CMS1218 :: Risk Variable First Albumin In Encounter` (calls `earliest`), `CMS0334 :: lastGravida` (also uses `earliest` helper)
- **anti-example** — `First(X)` when ordering isn't necessarily time.

### `First(X[, scope])`
- **intent** — the first qualifying X in a sequence — positional, not necessarily temporal
- **params** — `X`; `scope: ScopeSpec` optional
- **category** — Qualification
- **maturity** — strong
- **evidence** — L1: `Risk Variable First` (26), `First Anesthesia During Hospitalization` (43), `First ADHD Medication Prescribed During Intake Period`, `First Hypertensive Reading`.
- **examples** — `CMS136 :: First ADHD Medication Prescribed During Intake Period`, `CMS22 :: First Hypertensive Reading Interventions or Referral to Alternate Professional`
- **anti-example** — `Earliest(X)` when the ordering is explicitly chronological.

### `During(event, period)`
- **intent** — event occurs during a clinically-named period
- **params** — `event`; `period`
- **category** — Qualification
- **maturity** — strong
- **evidence** — L1: `During Measurement Period` (25+ variants), `in Measurement Period` (6). L2: 50 temporal-rel-tagged statements.
- **examples** — `CMS69 :: BMI During Measurement Period`, `CMS22 :: Qualifying Encounter during Measurement Period`
- **anti-example** — `Within(X, window)` when the time-bound is a window-from-anchor.

### `Overlaps(eventA, eventB)`
- **intent** — two events' intervals overlap (share any time)
- **params** — `eventA`, `eventB`
- **category** — Qualification
- **maturity** — moderate
- **evidence** — L1: "Overlaps ED Encounter", "Overlaps 2 Year Look Back Period". L2 helper: `AHA.overlapsAfterHeartFailureOutpatientEncounter`.
- **examples** — `CMS996 :: Allergy or Intolerance to Thrombolytic Medications Overlaps ED Encounter`, `CMS1154 :: Prediabetes Diagnosis Overlaps 2 Year Look Back Period`
- **anti-example** — `During` is asymmetric containment; `Overlaps` is symmetric.

### `OnDayOfOrAfter(X, anchor)`
- **intent** — X occurs on the same calendar day as or day after a clinical anchor
- **params** — `X`; `anchor`
- **category** — Qualification *, secondary Contextualization*
- **maturity** — moderate
- **evidence** — L1: `Day After Procedure` (10), `Day Of Or Day After` formulations. L2 helper: `TJC.calendarDayOfOrDayAfter` (8 calls).
- **examples** — `CMS108 :: Encounter With Intervention Comfort Measures On Day Of Or Day After Procedure`
- **anti-example** — `BetweenAnchors(X, start, end)` for the "from start-anchor to end-anchor" window; `Within(X, window)` for a rolling time window.

### `OnOrBefore(X, anchor)`
- **intent** — X occurs on or before a clinical anchor (or date)
- **params** — `X`; `anchor` (event or date)
- **category** — Qualification
- **maturity** — moderate
- **evidence** — L1: "on or before," "starts before or on day of." L2: 4× in CMS69 sample alone.
- **examples** — `CMS69 :: High BMI Interventions Ordered`, `CMS69 :: High BMI Interventions Performed`
- **anti-example** — `OnDayOfOrAfter(X, anchor)` for the directional flip.

### `SameDay(eventA, eventB)`
- **intent** — two events occurred on the same calendar day
- **params** — `eventA`, `eventB`
- **category** — Qualification
- **maturity** — moderate
- **evidence** — L1: "same day as." L2: dominant idiom in CMS22 followup-bundle composition (31×).
- **examples** — `CMS69 :: Medical Reason Or Patient Reason For Not Performing BMI Exam`, `CMS22 :: Elevated BP Followup Bundle`
- **anti-example** — `Overlaps(eventA, eventB)` for any time-intersection; `SameDay` is specifically calendar-day equality.

### `BetweenAnchors(X, start, end)`
- **intent** — X occurs in the period bounded by two clinical anchors
- **params** — `X`; `start` (anchor concept ref); `end` (anchor concept ref)
- **category** — Qualification *, secondary Contextualization*
- **maturity** — moderate
- **dispatch note** — `<X> between <start> and <end>` dispatches to `BetweenAnchors` when start/end are concept refs; dispatches to `Between(value, lo, hi)` when start/end are Quantity literals.
- **evidence** — L1: "From Day Of Start Of Hospitalization To Day After Admission" (5+).
- **examples** — `CMS108 :: Encounter With VTE Prophylaxis Received From Day Of Start Of Hospitalization To Day After Admission Or Procedure`
- **anti-example** — `During(event, encounter)` for a single named period.

### `AtLeastApart(eventA, eventB, duration)`
- **intent** — two events are separated by at least the given duration
- **params** — `eventA`, `eventB`, `duration: Quantity<time>`
- **category** — Qualification *, secondary Calculation*
- **maturity** — moderate
- **evidence** — L1: `Days Apart` (3) — "At Least 90 Days Apart".
- **examples** — `CMS1157 :: Has Two Encounters With HIV At Least 90 Days Apart` (`90 days`)
- **rename note (v0.5.1)** — was `AtLeastDaysApart(..., n: Integer)` in v0.5; renamed to `AtLeastApart(..., duration: Quantity<time>)` so weeks, months, and other time units flow naturally.

### `AtMostApart(eventA, eventB, duration)`
- **intent** — two events are separated by at most the given duration
- **params** — `eventA`, `eventB`, `duration: Quantity<time>`
- **category** — Qualification *, secondary Calculation*
- **maturity** — thin
- **evidence** — L1: "Less Than Or Equal To Four Days Apart".
- **examples** — `CMS951 :: Has Urine Albumin Test And Urine Creatine Test Less Than Or Equal To Four Days Apart` (`4 days`)
- **rename note (v0.5.1)** — same as `AtLeastApart`.

---

## Window-from-anchor (5 sister forms)

A parameterized umbrella for windowed-from-anchor temporal scopes. Used as the `window` argument to `Within`, the `scope` argument to selection patterns, and as standalone scope-expressions. The first four share `(duration: Quantity<time>, anchor: ConceptRef)`; `OnDayOf` is duration-free.

### `before-start-of(duration, anchor)`
- **intent** — a windowed period extending `duration` before the start of the anchor (lookback)
- **examples** — `CMS22 :: Prior-Year Hypertensive Reading` (`within 1 year before start of "Qualifying Encounter"`)

### `after-start-of(duration, anchor)`
- **intent** — a windowed period extending `duration` after the start of the anchor (lookforward from anchor start)
- **examples** — observation-prelude windows (`45 minutes after start of "ED Encounter"`)

### `before-end-of(duration, anchor)`
- **intent** — a windowed period extending `duration` before the end of the anchor (lookback from anchor end)

### `after-end-of(duration, anchor)`
- **intent** — a windowed period extending `duration` after the end of the anchor (lookforward from anchor end)

### `on-day-of(anchor)`
- **intent** — the calendar day containing the anchor's start (24-hour scope from anchor's start-day 00:00 to start-day 23:59:59). Used in selection scopes.
- **boundary rule** — when the anchor spans multiple calendar days, `OnDayOf(anchor)` uses the **start day** of the anchor period. Documented explicitly because clinical use cases (e.g. "last BP panel on the qualifying encounter day") consistently mean the day the encounter started, not every day it spanned.
- **examples** — `CMS22 :: Last BP Panel on Qualifying Encounter Day` (`last "Blood Pressure Panels" on day of "Qualifying Encounter"`)
- **note** — `OnDayOf` is the duration-free fifth sister, added in v0.5.1. Distinct from `OnDayOfOrAfter` (which is a 2-event temporal predicate, not a window-spec). The template-match dispatcher distinguishes by context: `<X> on day of <Y>` only parses as `OnDayOf(Y)` window inside a selection-pattern scope; `<X> on day of or after <Y>` always parses as `OnDayOfOrAfter(X, Y)` predicate (longest-match).

---

## Calculation

### `AgeAt(anchor)`
- **intent** — the patient's age (in years) at a clinical anchor point
- **params** — `anchor: AnchorExpr` (unified with `AsOf` — accepts concept refs, `start of <ref>` / `end of <ref>` modifiers, and clinical-anchor enum values)
- **category** — Calculation *, secondary Qualification*
- **maturity** — strong
- **evidence** — L1: `Patient Age N or Older at Start of Measurement Period` (4), `Aged 35 to 70 at Start of Measurement Period`.
- **examples** — `CMS2 :: Patient Age 12 Years or Older at Start of Measurement Period` (`age at start of "Measurement Period" at least 12 years`), `CMS1154 :: Aged 35 to 70 at Start of Measurement Period`
- **anti-example** — for the predicate form (`age at <anchor> at least <n> years`), compose with `AtLeast(...)` — the `AgeAt(...)` call returns a `Quantity<year>` value that feeds the comparator.

### `Calculate(X)`
- **intent** — derive a named clinical feature value from raw data (gestational age, boarded time, BMI, score from components)
- **params** — `X: ConceptRef<Quantity<U>>` (the named clinical feature to derive — must be Quantity-valued at the catalog level)
- **category** — Calculation
- **return type** — `Quantity<U>` where U is the unit type from X's `valuetype`. The unit-parametric return makes downstream comparators (`AtLeast`/`Below`/`Between`) unit-check correctly.
- **maturity** — thin (operator-acknowledged limitation: signature only carries the `X` placeholder, not the input list. The calculation formula lives implicitly in the X concept's `inferred from` chain. To be widened to `Calculate(X, inputs...)` in a future revision when CMS0334/CMS155 land and surface the need. Return type fixed unit-parametric now per round-2 review.)
- **evidence** — L1: `Risk Variable Body Mass Index (BMI)`, `lastGravida`, `lastParity`, `Calculated Gestational Age`, `Boarded Time`. L2 helper: `PCMaternal.calculatedGestationalAge` (3).
- **examples** — `CMS0334 :: Delivery Encounter With Calculated Gestational Age Greater Than Or Equal To 37 Weeks`, `CMS1244 :: Boarded Time Greater Than 240 Minutes`
- **anti-example** — `MostRecent(X)` / `Lowest(X)` for selecting an existing value; `Calculate` is for *deriving* a new feature.

### `Lowest(X[, scope])` / `Highest(X[, scope])`
- **intent** — the lowest or highest reading of X (optionally within a scope)
- **params** — `X: ConceptRef<Quantity<U>>` (the Quantity-valued clinical measurement); `scope: ScopeSpec` optional (a period, encounter concept, or window-from-anchor)
- **category** — Calculation
- **maturity** — moderate
- **return type** — `Quantity<U>` where U is the unit type inferred from X's `valuetype`. Composes with comparators (`AtLeast`/`Below`/`Between`) under the unit-parametric rule.
- **evidence** — L1: `Lowest Systolic Reading on Most Recent Blood Pressure Day` (3+), `Highest …` family.
- **examples** — `CMS165 :: Lowest Systolic Reading on Most Recent Blood Pressure Day` (`lowest "Systolic Reading" on day of "Most Recent BP Day"`), `CMS165 :: Lowest Diastolic Reading on Most Recent Blood Pressure Day`
- **anti-example** — `MostRecent(X)` selects by *time*; `Lowest`/`Highest` select by *value*.

### `AtLeastN(events, n)`
- **intent** — at least N qualifying events occurred
- **params** — `events`; `n`
- **category** — Calculation
- **maturity** — moderate
- **evidence** — L1: `Two Encounters`, `Has Appropriate Number of …`, `Three Polio Vaccinations`, `Four DTaP Vaccinations`. L2: typically `Length(query) >= n`.
- **examples** — `CMS117 :: Has Appropriate Number of Hib Immunizations`, `CMS1157 :: Has Two Encounters With HIV At Least 90 Days Apart`
- **anti-example** — `Consecutive(events, n)` when sequence/order matters.

### `Consecutive(events, n)`
- **intent** — N consecutive qualifying events (sequence matters)
- **params** — `events`; `n`
- **category** — Calculation *, secondary State Inference*
- **maturity** — thin
- **evidence** — L1: `Has Consecutive Heart Rates Less than 50` (3+), `Consecutive` n-gram.
- **examples** — `CMS144 :: Has Consecutive Heart Rates Less than 50`
- **anti-example** — `AtLeastN(events, n)` when total count matters but order doesn't.

### `High(X)` / `Low(X)` / `Normal(X)` / `Abnormal(X)`
- **intent** — measurement X falls into the named clinical category
- **params** — `X` (a named Quantity-valued measurement type — BMI, BP, A1c, etc.)
- **category** — Calculation *, secondary Classification*
- **maturity** — strong
- **evidence** — L1: `High BMI`, `Low BMI`, `Normal Blood Pressure`, `Elevated Blood Pressure`, `Abnormal Presentation`. L2: 18 `threshold-named`-tagged statements.
- **examples** — `CMS22 :: Encounter with Normal Blood Pressure Reading`, `CMS69 :: Documented High BMI During Measurement Period`
- **anti-example** — `DocumentedAs(X, high)` if the classification is asserted by a clinician (not computed); the named-category primitives are for the *computed* classification against standard cutoffs.

### `AtLeast(value, target)` / `AtMost(value, target)` / `Exceeds(value, target)` / `Below(value, target)`
- **intent** — numeric value crosses a clinical target (binary predicate)
- **params** — `value: ConceptRef<Quantity<U>>`; `target: Quantity<U>` (same UCUM unit type within the call — unit mismatch is a validator error)
- **category** — Calculation *, secondary Classification*
- **maturity** — strong
- **evidence** — L1: 18 `threshold-named`-tagged statements; "Greater Than 240 Minutes" (4), "Greater Than Or Equal To 37 Weeks" (6), "Less than 50".
- **examples** — `CMS0334 :: Delivery Encounter With Calculated Gestational Age Greater Than Or Equal To 37 Weeks`, `CMS1244 :: Boarded Time Greater Than 240 Minutes`
- **anti-example** — `High(X)` / `Low(X)` for *named clinical categories*; these primitives are for *explicit numeric* thresholds. `Between(value, lo, hi)` for closed-range bucketing.

### `Between(value, lo, hi)`
- **intent** — numeric value falls in the closed range `[lo, hi]`
- **params** — `value: ConceptRef<Quantity<U>>`; `lo`, `hi: Quantity<U>` (same UCUM unit type; both inclusive)
- **category** — Calculation *, secondary Classification*
- **maturity** — moderate
- **dispatch note** — `<X> between <A> and <B>` dispatches to `Between` when A/B are Quantity literals; to `BetweenAnchors` when A/B are concept refs.
- **evidence** — L1: range constructions "SBP 120 to 129", "SBP 130 to 139", "DBP 80 to 89". L2: `.value in Interval[lo, hi]` shape (CMS22 BP buckets).
- **examples** — `CMS22 :: Elevated BP Reading`, `CMS22 :: Second Hypertensive Reading 130s`
- **anti-example** — `AtLeast(value, target)` / `Below(value, target)` for one-sided thresholds.
- **closed-vs-half-open note** — `Between` is closed-closed `[lo, hi]`. Half-open clinical ranges decompose to `AtLeast(value, lo) and Below(value, hi)`.

---

## State / Process Inference

> `Active(X[, during])` was re-tiered to **Assertion** in v0.3.1 (clinical claim about X, not state-of-resource). `WasPerformed(X)` remains here as a state-of-resource predicate on action resources.

### `WasPerformed(X)`
- **intent** — the clinical action was performed (procedure / encounter / immunization / medication-administration completed)
- **params** — `X` (action)
- **category** — State Inference
- **maturity** — strong
- **evidence** — L2 helpers: `Status.isProcedurePerformed` (18), `Status.isEncounterPerformed` (6), `Status.isImmunizationAdministered` (13), `Status.isMedicationDispensed` (3). L1: tail-suffix `Test Performed` (3).
- **examples** — `CMS117 :: Has Appropriate Number of Hib Immunizations`, `CMS349 :: Has HIV Test Performed`
- **anti-example** — `WasOrdered(X)` if the question is intent (request recorded), not completion.

---

## Cross-cutting notes

### Known gaps deferred
- `EligibleForMeasure` — QM-specific use-case pattern; revisit when non-DQM corpora arrive
- `AlternativeEvidenceSatisfies(requirement, evidenceSet)` — interesting Layer-3 pattern in CMS117 immunization logic; need broader corpus support
- Statistical Inference primitives — deferred (PMML)
- Other use-case-specific patterns (CDS-Connect, surveillance, registries) — collect with the broader corpus expansion
- `Calculate(X, inputs...)` — current signature only carries the calculated-name; the input list lives implicitly in the X concept's `inferred from`. Widen when CMS0334/CMS155 surface a need.
- Per-measure `IsVerified` variance — current implementation uses the corpus-convergent accepted set; widen to `IsVerified(X, resourceType)` if a future measure needs different acceptance.

### Future tooling alignment
- VS Code extension: autocomplete sourced from `narrative form` column; hover/quickinfo from `intent` + `canonical`; placeholder-kind annotations drive completion type (concept name vs Quantity literal vs enum).
- Validator: signature checks driven by `canonical` column; ConceptRef-typed args resolved against concept declarations; `Quantity<U>` unit-parametric checks enforced at call site.
- Emitter: `CQL function` column maps each pattern to its `CRLPatterns.<Name>` target; arguments flow through the parameter-emission-mode table.
