# CRL emit-consistency (#189) — design of record

**Status:** design converged through four design-panel rounds (1, 2, 2R efficacy test, and a final round on
the CRL-emit lens) plus operator decisions of 2026-08-11. **The grammar + validation slice (§8/§9 step 1) is
IMPLEMENTED and SHIPPED (validate-only — it parses/validates the new forms but does NOT emit; commits
`bfdd204` · `c0d79fa`+`68af9b5` · `b1068ca` · `92fc5c0`+`f24e36f` · `5e37b2b`). The atomic emit FLIP (§9 step 4)
is NOT yet implemented.** This is the committed, durable design of record; the full round-by-round history
(reviewer transcripts, per-point accept/refine/reject) lives in
`.vibe-tools/discussions/413-emit189-context-free-total-boolean.md` (gitignored working log).
Grounded in **`docs/CRL-NORTH-STAR.md`** (authoritative CRL model) — read that first.

**How to resume:** read the charter, then §0 (scope) and §10 (deferred/resume) here, then the section for the
slice you're building. The sequencing in §9 is the build order.

**Source-tree paths (verified 2026-08-14 — the CQL emitter is NOT under `emit/`):** `emitCQL.ts` and
`layeredEmit.ts` live in `packages/crl/src/cql-emitter/`; `decision.ts` in `packages/crl/src/fhir-emitter/`;
the CEL emitter `emitFhir.ts` in `packages/crl/src/cel/emitter/`; the T1/T2/T3b inert infra
(`effectiveRepresentation.ts`, `resourceEmitRegistry.ts`, `booleanTotality.ts`) in `packages/crl/src/emit/`.
Line citations below drift as the code moves — trust the function name over the number.

---

## 0. Scope (operator decision D2 — 2026-08-11)

**#189 is scoped to the LOCAL path.** The local `code is` domain is the canonical production representation
CRL logic runs on (charter §2); it is where #189's round-trip pain lives (PA runs exclusively off local codes,
Patient excepted). The descriptor (§4) therefore has two arms only: **`local-exact`** and **`uncoded`**
(Patient/birthDate — a value element, no `coded from`).

**Deferred to when source representations land (~#257 territory) — see §10:** all sourced-CEL emission,
external ValueSet membership validation, `verificationStatus`/refutation filtering, and
selective-representation keying. These are the optional/additive path; nothing in PA today needs CEL cases
emitted for external-coded facts.

---

## 1. Concept model (from the charter — normative summary)

- One identity, a **declared value type** and a **declared cardinality** (operator decision D1 — cardinality
  is declared, **not inferred** from reduction-presence). The cardinality is a dedicated concept-level line,
  **`- shape is Scalar | Record | RecordSet.`** (grammar-shipped in the validation slice; `Scalar` is the
  default the builder normalizes an omitted `shape is` to): a **Scalar** concept declares a singular value type
  (`boolean`/`Quantity`/…) and **must reduce**; a **RecordSet** concept **publishes its records** (consumed by
  name), its record resource coming from `type is`; a **Record** concept is a single selected record. The
  explicit `shape is RecordSet` disambiguates a `CodeableConcept` *set* (e.g. a coded-Encounter refinement
  operand) from a single-`CodeableConcept` scalar — both would carry the `CodeableConcept` value type, so
  cardinality can't be read off the value type. `shape is Record | RecordSet` parses and validates today but is
  **validate-only** (emit activates at the flip).
- **Datum type ≠ result type.** The *representation datum* is the record shape (`Condition` with coding at
  `Condition.code`, no value element); the *published result* is what the define returns (`Scalar<Boolean>`
  from `exists`). For a **Scalar** concept, `value type` names the RESULT; for a **Record/RecordSet** concept
  `value type` is optional (the result type is the record resource, from `type is`) and, when present, names the
  record's **datum** type. "value-type-must-match-a-real-element" applies **only** to a representation read as a
  value *without* a reduction — and to any **value-reading** reduction (`most recent this` on a scalar value
  type reads the value element; the check covers it too — final-round Claude #5).
- **Source representation is fully explicit** (`type` + `value element` + `value type`, `coded from` optional)
  and does **not** inherit the concept's fields (validator A.1, `representationShapeValidator.ts:260-275`).
- **Closed-world:** absence = empty/false; explicit absence = an absence code (a record).

---

## 2. Reductions and result shape (final-round F1, F3)

**Result shape = f(reduction, declared shape, declared value type)** — every cell is a result type or a
validation error (no silent rewrite = no manufacturing). The keying is **reduction × declared shape × declared
value type** (`shape is` supplies the cardinality; for `Scalar` — the default — the value type carries the
discrimination, for `Record`/`RecordSet` the resource comes from `type is`, **or from the shape-checked operand
for a representation-free derived concept** — `reductionShapeValidator` exempts `non-scalar-missing-type` there,
so this inheritance is only partly validated in N). The table enumerates the **defined** cells. **Normatively,
any (reduction × shape) pairing not listed is invalid — an error at the flip.** The shipped-N
`reductionShapeValidator` **warns** (all its findings are `severity: "warning"` in N, per §9 step 1) on the
implemented subset — a scalar reduction (or narrative `most recent …`) on a `RecordSet` →
`recordset-scalar-reduction`; a `Record` concept that does not select a single record → `record-shape-invariant`.
Deferred, still-unchecked cells (the `type
is`-vs-operand agreement — "left for the flip step", `reductionShapeValidator.ts:313-321`; value-element
correspondence; a `RecordSet` + scalar-narrative orphan; cross-library named operands) are listed in the
validator header and remain flip blockers — so the matrix is total **normatively**, not by exhaustive shipped-N
rows:

| Reduction | Declared shape | Declared value type | Result | Lowering / rule |
|---|---|---|---|---|
| `exists this` | Scalar | boolean | `Scalar<Boolean>` | **datum-discriminated** (F1): datum has NO value element → `exists([<R>: X])`; datum has a **boolean** value element → `exists([<R>: X] O where O.value is true)`; other datum → **error** |
| `exists this` | Scalar | non-boolean | — | **validation error** |
| `most recent this` | Scalar | scalar `V` (rep has a matching value element) | `Scalar<V>` | select newest, **then read the value element** (one composite reduction); `Coalesce(<read>, false)` if boolean, else null-guarded per §3 |
| `most recent this` | Scalar | scalar `V`, **valueless rep** | — | **validation error + migration prompt** ("existence is forced; author `exists this`") — NEVER silently rewrite to `exists` |
| `most recent this` | Record | (optional; resource from `type is`) | `Record<R>` | select newest record; no value read |
| `count this … at least N` | Scalar | boolean | `Scalar<Boolean>` | `Count([<R>: X]) >= N` (total; `Count`→0 on empty — verify at impl before relying on bare) |
| (none) | RecordSet | (optional; resource from `type is`) | `RecordSet<R>` | the retrieve/union; published, consumed by name |
| (none) | Scalar | scalar | — | **validation error** (no bare scalar `code is`) |
| named `exists "X"` / `most recent "X"` / `count "X"` | per above | per above, `X` a `RecordSet` | per above | `X` must resolve to a `RecordSet`; else resolution error |

Notes: `most recent` sort is the engine-proven form (`cql-emitter/emitCQL.ts:1405-1410`, in `emitRecencyMerge` — **`where` precedes `sort`**):
`Last([<R>: X] O where O.value is FHIR.boolean sort by (O.effective as FHIR.dateTime).value, O.id)`. The sort
**element is per representation, from the descriptor** (§4) — Condition→`recordedDate`, ServiceRequest→
`authoredOn`, Observation→`effective`. **Period-typed recency** (Encounter/EpisodeOfCare/Flag) breaks
`(x as FHIR.dateTime)` (null-sorts) → the descriptor carries a **typed sort expression** (e.g. `period.start`),
or `most recent this` is **rejected** for Period-recency reps (final-round Claude #7).

---

## 3. Null-totality — whole-BOUNDARY invariant + a proof obligation

Every boolean-valued define the emitter can produce is **total**. Rules:

1. Totalize each boolean-producing **leaf** at its own boundary: `exists`/`count` total by construction (do
   NOT wrap — a needless Coalesce blunts the assertion in rule 5); every nullable boolean derivation is
   `Coalesce(<boolean predicate>, false)`.
2. **Only the boolean predicate is Coalesced** — never a nullable non-boolean operand (`Coalesce(X,0) >= N`
   manufactures a value; use `Coalesce(X >= N, false)`).
3. **Per-operand-before-`not`** (`not Coalesce(A,false)` ≠ `Coalesce(not A,false)`). A terminal boundary
   Coalesce is insufficient (wrong under negation) and harmful (masks a missed leaf as a plausible `false`).
4. Retrieve **`where`-predicates are null-decided** (status-absent = pass). On the local path this is largely
   moot — local uses absence codes, not status filters (§5).
5. **Backstop = a static emit/test-time totality PROOF, not a runtime Coalesce.** Requires a **boolean-
   totality effect** in resolved-concept metadata + a lowering table classifying each form (intrinsically-
   total / boundary-totalized / rejected). The current emitter has only return-*shape* metadata
   (`PATTERN_RETURN_SHAPE`), not nullability — this is new metadata to add (final-round gpt56 #10). **Full
   buildable spec: `docs/emit-189-boolean-totality.md`** (the corrected classification, the two-phase
   obligation→discharge→proof model, whole-graph coverage, and the verification gaps). **Built AT the flip
   (T5), NOT as an inert precursor** — totality is a fact about the lowering, so an AST-only classifier would
   pass the proof vacuously (disc 426, both crl-emit arms + operator).
6. **Scope:** totality holds over an artifact graph emitted by ONE emitter version. Mixed-version includes are
   rejected/detected, never consumption-site-Coalesced.

---

## 4. Effective-representation descriptor (local-only per §0; F4, F5)

One descriptor is the single source both lanes read; a CEL fact resolves to it or the case fails closed (§5).
**Two arms** (local scope):

```
descriptor :=
  | local-exact { resourceType, codingElement, system, code,
                  datumValueType?, resultType/cardinality, recencyElement(+type), owningLibrary, valueElement? }
  | uncoded     { resourceType, valueElement, datumValueType, resultType/cardinality, recencyElement(+type) }   // Patient/birthDate
```

- **`datumValueType` (the record's value) is separate from `resultType`/cardinality (the concept's published
  result)** — F4. E.g. `Condition` datum (no value) → `Scalar<Boolean>` via `exists`; `Observation.value`
  boolean datum → `Scalar<Boolean>` via `most recent`.
- **`codingElement` is the retrieve-code PATH** (not universally `.code`), used by a **resource-specific
  writer** (§7 — a supported-path/value registry, not "arbitrary paths").
- **`valueElement` optional** (valueless existence has none). Its population rule (auto-map from `type is` ×
  `value type`, e.g. Observation+boolean→`valueBoolean`, vs authored `value element is`) must be specified.
- **Local derivation uses the OWNING library's `canonicalBase`/`localDomainId`** (sibling-lib disambiguation),
  NOT the CEL file's library. System = `<owning canonicalBase>/CodeSystem/<owning domain>-local` (needs #271).
- **`resultType` carries the discriminated shape `Scalar<V> | Record<R> | RecordSet<R>`** — `resourceType`
  lives in `Record`/`RecordSet` only, NOT in `Scalar` (F5): `ConditionExists sem-or ServiceRequestExists` are
  both `Scalar<Boolean>` and MUST compose.

Local (`code is`) → the CEL lane **derives** `{system, code}` from the concept (identical to the retrieve by
construction, fail-closed, no author token to mistype).

---

## 5. CEL emit — intent matrix (local path; F2)

`emitFhir.ts` today emits a **present** resource for absent/negative intent (generic `status`) → `exists`
returns true for a fact meant absent. Replace with:

| Authored intent | Emit |
|---|---|
| **present** | the resource, coding **derived** from the descriptor |
| **implicit absence** (omitted) | **no resource** (⇒ `exists` false; closed-world) |
| **explicit false** (value-bearing rep, `value is false`) | the resource with `valueBoolean = false` — but see the interaction rule below |
| **explicit absence** | **REJECT with a migration diagnostic** (F2): there is no positive→absence linkage, and synthesizing an absence code = manufacturing (charter §4). The author writes a **present** fact naming a *separately-authored absence concept* instead. |

**Interaction rule (final-round F1/Claude #2):** an `explicit false` fact against a concept whose reduction is
`exists this` would make bare `exists` true (round-trip lie). Resolve via §2's datum-discrimination: a boolean
value-element rep uses value-filtered `exists (… where value is true)`, so `valueBoolean:false` correctly
yields false. On a valueless rep, `explicit false` is a **validation error** (nothing to carry the false).

**Fail-closed = case-ATOMIC ERROR** (not warn-and-skip; `cel/emitter/emitFhir.ts:453-475` today leaves a misleading
partial fixture): an unresolved concept / missing writer path / missing canonicalBase → error + ZERO
resources for that case, diagnostic naming case/fact/concept/owning-library/field.

**Conflict rule:** a fact naming a local concept that ALSO carries its own `code` is **rejected** (closes the
author-token drift lane).

---

## 6. Multi-representation `this` (v1)

- **`exists this`** = the **union** of each representation's existence (`exists(repA) or exists(repB) …`).
  Total; dedup-immune (existence of the union). Degenerates to one retrieve for today's single-rep concepts.
- **`most recent this`** and **`count this`** over a multi-rep concept = **REJECT until #257** (both need
  cross-representation recency/**dedup** — ADR 0001; a naive union double-counts the same event present as
  both a local and a source record — final-round Claude #8). Single-rep forms are fine now.

---

## 7. Composition, Interface, recency

- **`defined as` is value-type-keyed:** booleans → plain `A or B`/`A and B`/`not A`; record-valued → set
  algebra (`intersect`/`union`/`except`). `sem-and`/`sem-not` load-bearing (charter §5).
- **Operand compatibility compares the discriminated result type** `Scalar<V> | Record<R> | RecordSet<R>`
  (F5) — `resourceType` matters only for `Record`/`RecordSet` (`RecordSet<Condition>` ≠ `RecordSet<Encounter>`);
  two `Scalar<Boolean>` compose regardless of source resource. Diagnostic names each *resolved* operand's
  type + operator; an unresolved operand emits the resolution error instead.
- **Mixed value type = author error** (decision B), realized **directionally** in the shipped validator
  (`useSiteTypeValidator.ts`, b1068ca — grammar/validator is the source of truth): a leaf declaring `value type
  is boolean` inside a composition whose parent declares a **non-boolean value type** is a hard **error**
  (`boolean-in-refinement-composition`, value-type-keyed, non-demotable) — fixed by giving that leaf its
  resource value type, or declaring the parent boolean (NOT by an `exists` lift). Any other result-type
  disagreement the implicit-existence bridge permits — a **boolean parent over a resource/record leaf**, two
  differing non-booleans, or a differing record resource — is a **warning** (`composition-result-type-mismatch`)
  today that **becomes an error at the flip**; the boolean-parent + record-leaf cell is fixed by making the
  bridge explicit with `defined as exists ( "Record Concept" )`. **Supersedes**
  `docs/defined-as-is-semantic-composition.md` + `docs/cql-to-crl-type-valuetype-rule.md §7` — both **updated in
  IMPL 4** with superseding banners (done, not deferred).
- **Interface = pure façade** (`define "X": Inferred."X"`): keeps the `library[]` rebind-target job, loses
  boolean-wrapping. Negated-guard `Coalesce` (`fhir-emitter/decision.ts:659-674`, `guardApplicabilityCondition`) stays (sits below its `not`); NOT
  generalized to a terminal Coalesce.
- **Layer-placement contract** (specify atomically with the flip): where the natural retrieve lives
  (LocalSource), the total scalar define (Inferred), what `Interface."X"` aliases, what the case-feature
  StructureDefinition `cpg-featureExpression` targets.
- **Recency arbitration rewritten** to return a total boolean at the boundary (today `recencyAgeTruths`
  returns a `{true}/{}` truth-set); if `this`+union-selection subsumes it, it sorts by the per-representation
  recency element (§4).

---

## 8. Grammar + validation slice (LEADS)

New surface: `definition is exists this` / `most recent this` / `count … at least N` / `this`; the **named**
`definition is exists "X"`; the **cardinality declaration** `- shape is Scalar | Record | RecordSet.` (a
dedicated concept-level line, `Scalar` the default — D1). `this` = an AST node for the concept's
**representation records only** (no circularity); ref-walk / cycle / CRE / requalification specified.

New validation (**WARNINGS / migration-prompts in version N**, per §9, **except the two non-demotable errors
noted**):
- **no bare SCALAR `code is`** (record-valued concepts are legal — declared via the cardinality marker).
- **non-boolean concept in a decision guard** (#240 → reject-with-error).
- **value-type-must-match-a-real-element** — for any representation read as a value (bare read OR a
  value-reading reduction like `most recent this`). **DEFERRED — NOT shipped in the slice** (a FLIP BLOCKER):
  it needs the FHIR model-info element registry that does not exist yet, so only AST-determinable checks land
  now (`reductionShapeValidator.ts:49-54` / `representationShapeValidator.ts:47-51`). The `§2` valueless-rep row
  is likewise a NORMATIVE (flip) error, not a shipped-N diagnostic.
- **mixed-value-type composition** (§7) — **one cell is a hard ERROR, not a warning**: a boolean leaf inside a
  composition whose parent declares a non-boolean value type (`boolean-in-refinement-composition`,
  non-demotable). Other result-type disagreements are warnings in N that become errors at the flip
  (`composition-result-type-mismatch`).
- **`most recent this` / `count this` on a multi-rep concept**; **`exists this` on a non-boolean**; **`most
  recent this` on a valueless rep** (§2/§6).

---

## 9. Sequencing — one atomic gate across BOTH lanes (F6)

1. **Grammar + validation slice** — new forms parse + validate; new checks are **WARNINGS**; new forms are
   **validate-only** (they parse and validate but do NOT yet emit). A KE who follows a migration prompt and
   authors a reduction now hits the dedicated **`emit-reduction-not-active`** sentinel (IMPL 3 — a clear
   "accepted for validate-only migration, CANNOT yet be emitted, activates at the flip" diagnostic fired ahead
   of the generic `emit-mixed-code-and-definition` check, on every lane incl. the FHIR-closure fold), not a
   confusing mixed-code hard error. Old bare `code is` still emits via the current path. **SHIPPED** —
   `bfdd204` (grammar+AST) · `c0d79fa`+`68af9b5` (reduction/shape validator) · `b1068ca` (use-site composition/
   guard) · `92fc5c0`+`f24e36f` (emit sentinel). The `shape is` cardinality line lands here (`Scalar` default,
   `Record`/`RecordSet` validate-only).
2. **Effective-representation descriptor** — inert shared infrastructure; activation gated. (Needs #271
   canonicalBase-required first.)
3. **Migration inventory** (reference-graph of every bare `code is` by consumption role) — **BEFORE
   enforcement**, classified, migration steps written.
4. **The atomic flip — ONE gate, BOTH lanes together:** CQL (natural-resource retrieve + `exists`/`most
   recent` scalar lowering + Interface aliases + plain composition + recency total-boolean + `asTruths`/
   `satisfied` removal + layer-placement contract) **AND** CEL (derive-local + intent matrix + case-atomic
   fail-closed) **AND** the validation checks flip to **hard errors** — all in one version. Neither lane flips
   without the other (a CQL-only flip leaves CEL writing author `.code` → still broken).
5. **Layer-collapse** — separate, later.

No version is internally inconsistent: N validates-with-warnings + emits the old form; the flip version
enforces + emits the new form, both lanes, together.

---

## 10. DEFERRED / RESUME — do not lose this

Everything punted, with enough to pick up. **Captured here so the investment survives; file as tracker issues
when picked up (memory is not backlog).**

### Deferred by D2 (sourced-CEL / source-representation path) — resume when source reps land (~#257)
- **Sourced-CEL emission** — emitting CEL cases for external-coded (`source representation` + `coded from`)
  facts. Needs the `external-valueset` / `external-code-set` descriptor arms.
- **External ValueSet membership validation** — a `coded from` ValueSet admits many `{system, code, version}`;
  validate the author's coding by **membership in the resolved expansion**, NOT string equality. When no
  expansion / terminology service is available at build time → **fail closed (case error)**, not
  "unverified-pass" (final-round ruling; was an option-list). `Coding.version` ≠ `valueSetVersion`; the CEL
  token `system|code` carries no version → **use version-insensitive membership** (ruled; the smaller change).
- **Refutation / `verificationStatus` path** — `exists this excluding refuted`: a grammar form (not in the §8
  slice), a descriptor `statusElement` + status coding/value + filter policy, and a **resource-specific**
  status/refutation discriminant (`verificationStatus` is Condition-only; ServiceRequest `revoked`,
  MedicationRequest `cancelled`, `doNotPerform`, or none). Absent-status must **pass** (§3 rule 4). This is a
  source-rep/real-chart concern; the local path uses absence codes (§5), not status filters.
- **Selective-representation keying** — `emit(<posrep-key>)` + the descriptor's `selectedRepresentation` key:
  how a representation is named for selective emit when a concept has local + multiple source reps. v1 default
  (once needed): omitted = canonical local; source emission requires an explicit stable structural key.

### Deferred to #257 (multi-representation semantics)
- **`most recent this` / `count this` over a multi-rep concept** — need cross-rep recency arbitration + dedup
  (ADR 0001 3-tier). Rejected with a migration prompt until #257 (§6).
- **Multi-rep record-set publication** — a record-valued multi-rep concept whose reps are *different* resource
  types has no single `RecordSet<R>` for §7's type matching. Also #257.

### Emit-cluster remainder (tracked issues; not part of the #189 flip itself)
- **#271** canonicalBase-required precursor (blocks the descriptor's local derivation) — land first.
- **#255** Patient-compartment path (makes age cases loadable).
- **#110** deterministic/scenario-relative CEL dates.
- **#253** emit-contract docs · **#254→#214** MCP emit-to-disk exposure.
- ~~**Decision B doc reconciliation**~~ — **DONE in IMPL 4** (`docs/defined-as-is-semantic-composition.md` +
  `docs/cql-to-crl-type-valuetype-rule.md §7` carry superseding banners for the shipped directional rule; §7 above).

### Implementation-detail obligations carried into the build
- **Resource-writer registry** (§4/§7) — a supported {resourceType → codingElement, valueElement, recency
  element/type, choice-element JSON mapping} table + fail-closed for unsupported; today CEL writes only
  `.code` and Observation values (`cel/emitter/emitFhir.ts:513,519-527`).
- **Boolean-totality effect metadata** (§3 rule 5) — the proof system behind the totality assertion. **Spec'd
  in `docs/emit-189-boolean-totality.md`; folded into T5 (not an inert precursor) per disc 426.**
- **`valueElement` population rule** (§4) — auto-map vs `value element is`.

---

## Appendix — decision log

| id | decision | date |
|---|---|---|
| Fork (i) | Local domain = CANONICAL/PRODUCTION (not chart-match; source reps optional/additive) | 2026-08-11 |
| Fork (ii) | "no bare `code is`" = value-type-driven (scalar ⇒ reduction; record ⇒ publishes) | 2026-08-11 |
| A | Boolean-from-valueless-resource = existence over the natural resource (`exists this`) | 2026-08-11 |
| B | Mixed-value-type composition = author error (supersede two docs) — **realized directionally** in b1068ca: boolean-leaf-in-non-boolean = hard error; other result-type mismatches = warning→error-at-flip (§7) | 2026-08-11 |
| C | Coding identity = 3rd round-trip axis; derive-local / (defer)validate-external | 2026-08-11 |
| D1 | Cardinality is **declared** (`- shape is Scalar \| Record \| RecordSet.`, `Scalar` default — grammar-shipped in the validation slice), not inferred | 2026-08-11 |
| D2 | #189 scoped to the LOCAL path; sourced-CEL deferred | 2026-08-11 |

Full round history + per-point processing: `.vibe-tools/discussions/413-emit189-context-free-total-boolean.md`
(ROUND 1, 2, 2R, FINAL). Companion working notes: `tmp/DECISIONS-concept-model-and-189.md`.
