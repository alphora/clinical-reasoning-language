# ADR 0001 — Asserted/sourced concept values and the representation model ("calculate-as-if")

- **Status:** Accepted — core decision (B) confirmed by a 3-reviewer round; the representation/resolution
  model refined and re-reviewed (transcript: `.vibe-tools/discussions/080-asserted-vs-fact-data-model.md`,
  rounds 2–7).
- **Date:** 2026-06-14
- **Scope:** CRL/CEL **conceptual** data model. **General** — quality measures, cognitive support / CDS,
  prior authorization, risk adjustment (NOT a prior-auth-specific design). FHIR/CQL and the
  auto-generated Questionnaire/QuestionnaireResponse are emit / communication-channel concerns and are
  out of scope here. Exact grammar productions, narrative/expression grammar, and emit lowering are the
  *how*-round; this ADR fixes the conceptual model they must realize.

## Context
A CRL decision branches on **concepts**. A concept's value for a subject may be **supplied** by a source
system (EHR / payer) or **asserted** by a user when source data is unavailable ("calculate as if X
holds"). An assertion is **not a fact of record**. The reasoning system is a **system of insight, not a
system of record**. The model must: run on assertions alone (no source data), normalize heterogeneous
source forms into one concept value, and never let an assertion masquerade as a clinical fact.

## Options (core fork)
- **(A) Two concept-identity domains** (a "source" concept + an "asserted" concept per concept), unioned,
  most-recent. **Rejected** — per-concept dual identity + a maintained correspondence is an O(N) drift
  surface; "most-recent" lets an assertion silently beat a source value; the separation it buys is
  illusory (safety lives in the invariants + no-write-back, which (B) expresses directly).
- **(B) One concept identity; provenance rides on values.** **Chosen.**

## Decision — the model

### 1. One author-facing identity
A concept (e.g. "Mammogram") has a single identity. Whether a value was supplied or asserted is the
**provenance of that value**, not a different concept. Decisions/derivations branch on the one concept.

### 2. Three orthogonal axes
- **Layer** (how a concept is *defined* — syntactic). **`asserted`** = `coded from` (a retrieve; values
  asserted by *some* authority, queried). **`inferred`** = everything else (`defined as` composition,
  `definition is` predicate/derivation — calculated). Rule: `coded from` ⇒ asserted; else inferred.
  (`defined as` is the sem-* composition keyword; there is no `inferred from` keyword.)
- **Origin** (the asserting **authority** — *who* claimed a value). For **asserted** values: an
  **extensible** set of authorities — `clinical`, `payer`, `user`/`application`, `pharmacy`, … For
  **calculated** values: **`System`** ("inferred by content@version + reasoning-engine@version"), with
  the content version and engine version recorded in provenance. Origin rides **source → record** for
  asserted values; it is carried on the value's provenance and is **NOT a selection-precedence axis**
  (recency only). "Asserted" is never an origin — every authority asserts; the word lives only at the
  layer. *(Orthogonality note: origin is free of layer for **asserted** values — any authority may
  assert through any retrieve. For **calculated** values origin is necessarily `System` — i.e. it is
  determined by the layer — which is intended, not a contradiction. `System` denotes the reasoning
  engine that computed the value, and is distinct from the `application` authority, which is an actor
  that **asserts** a value.)*
- **Code domain** (*which* codes). `standardized` (a named `terminology`/value set) vs `local` (an inline
  coding `coded from: - system is …. - code is ….`, no terminology object needed for a single local code).

### 3. `possible representation:`
An anonymous concept that **inherits every field of the enclosing asserted concept except what it
overrides** — shorthand for explicit source leaves without names or a hand-written union.
- A representation's **structural identity = `{ type, value type, terminology }`** (where *terminology*
  is a named value set **or** an inline `{ system, code }` — never a missing key).
- It stays in the **asserted layer** (same clinical concept, many shapes).
- The top-level `coded from` is the **base representation + defaults** (the base representation is
  itself a member of the deduped source set); each `possible representation:` inherits the defaults and
  may override; a field in a representation **replaces** the inherited one. A representation is written
  in the **same concept-body syntax** (dashed statements) and states only what it adds/overrides —
  inherited fields (`type`, `value type`, the default `coded from`) are omitted. The nesting is
  **recursive**: a structured value is itself a block — an inline code is
  `coded from: - system is …. - code is ….` (whereas a named reference stays inline,
  `coded from "X"`).
- A representation is **never independently nameable/referenceable** — it is reached only through
  resolution of the enclosing concept (this preserves B; a nameable partition would be A-ward drift).

### 4. Composition and derivations
Asserted multi-representation retrieves are grouped by source class (e.g. "Clinical Mammogram",
"Administrative Mammogram") and are **reusable**. `defined as ( A sem-or B )` composes **distinct**
concepts ("Mammogram"). Derivations (`most recent`, `count … within …`, predicates, arithmetic) build on
top. One author-facing identity per clinical concept.

### 5. Sources, records, and resolution
- A concept declares (directly + via composition) a **set of sources** (representations).
- **Resolution** computes a concept's value: collect its sources, **dedup the source set by
  `{ type, value type, terminology }`** (the same source across composed concepts collapses to one,
  queried once), query them, yielding the concept's **set of records** — plus the concept's calculated
  value, if it has a definition. A concept is therefore naturally **multi-valued** (a record set);
  `count`/`within`/`most recent` operate over records.
- **Flattening the source set is a query-time concern only**; semantic evaluation remains
  **graph-structured per concept** (e.g. "High BMI" evaluates over "BMI"'s value, not over a flat bag
  of underlying evidence).
- **Selection is by recency.** Where a single value is needed, `most recent` selects the newest record /
  value. A fresh user assertion wins by being newest; a newer source value supersedes an older
  assertion (provenance — origin + timestamp — carries the reasoning). Default is **KE-overridable** per
  concept; the only place precedence beyond recency may enter, by explicit KE choice.
- **A calculated value's as-of time = the oldest (min) timestamp of the asserted values used**
  (transitively, over the leaf asserted inputs) — a derived value is only as fresh as its stalest
  dependency, so a newer assertion correctly wins and a recompute does not silently defeat an override.
  Consequently a recompute supersedes an older assertion **only when all inputs it uses are newer than
  that assertion**. (Wall-clock evaluation time may be provenance, never the selection timestamp.)

### 6. Three-tier de-duplication
- **Source dedup — CRL's responsibility.** The source set is deduped by
  `{ type, value type, terminology }` (terminology = named value set or inline `{system, code}`).
- **Record uniqueness — emit (CQL) responsibility.** Querying a deduped source returns distinct records;
  CRL does not model it.
- **Cross-resource event-equivalence — out of scope.** Two *different* resources describing one real
  event (a mammogram as both an Observation and a Claim) are two records. This is **data quality**,
  upstream — not CRL/FHIR/CQL. CRL trusts record-uniqueness. (Consequence: counts/temporal windows trust
  upstream dedup. Recorded as an explicit scope exclusion. This design therefore **assumes an upstream
  data-quality/de-duplication pipeline** for count- or window-sensitive measures; absent one, such rules
  must be authored to approximate dedup and should be treated with care.)

### 7. Closed-world; absence is codes, not a value-state
The model operates under the **closed-world assumption**.
- **Implicit absence** = the **empty set**: no record found ⇒ `exists` false, `count` 0. There is **no
  "unknown"** truth value (that is the open-world construct CWA removes).
- **Scalar selection over an empty positive set yields no-value** (not `false`). A scalar value (e.g.
  "Most Recent Mammogram") over zero records is no-value; a **presence/boolean predicate** evaluated
  over no-value resolves to **`false`** under CWA (e.g. "Up To Date On Mammography" → false). This is
  the closed-world *scalar-of-empty* rule — distinct from the excluded open-world "unknown".
- **Explicit absence** = an **absence-meaning code** ("no known mammogram", "patient denies") — an
  ordinary coded record in the asserted layer, carrying origin/provenance like any record. The
  "asserted-absent vs sourced-absent" distinction is just the **origin on that absence record**; absence
  is **not** a special value-state in the type system. **An absence record is not a positive event** —
  `exists`/`count` over the positive concept exclude it; it asserts the *negative* and participates only
  in selection/predicate semantics (so it does not spuriously make `exists` true or inflate a `count`).
- Absence-assertion is the negative case of the assertion mechanism: assert an absence-code record;
  being newer, recency lets it override a positive **in selection/predicate contexts** (not by being
  counted as a positive).

### 8. Mixed concepts (assertable inferred concepts)
A concept may carry **both** a `definition is` (calculation) **and** a `possible representation:`
(explicit assertion-catch). Its value = **most-recent over { calculated value } ∪ { asserted records }**.
This is how an *inferred* concept becomes directly assertable ("calculate as if 'High BMI'") without
reconstructing leaves — the assertion is persisted and read back through the catch representation
(origin `user`). Invariants:
- the assertion-catch representation is **non-nameable** (§3) — so the concept keeps one identity (B);
- candidate values **share the concept's declared value type / unit** (a coherent resolution set).
Cross-level what-if states are intended (e.g. `BMI = 32` with an asserted `High BMI = false`); a KE
policy knob (allow / prohibit / diagnostic) governs whether they are permitted. (Cycle risk is handled
by CRL's existing cycle detection.)

### 9. Safety via invariants, not arbitration
It is safe to resolve by recency (and to honor a fresh override) because: (a) **assertion ≠ fact** — the
insight system never writes the record domain, at most emitting a request/task for the record-keeper;
and (b) **provenance is the reasoning** — every value's origin + timestamp is recorded and propagates
into the determination, so supersession is transparent, never silent arbitration.

### 10. The only legitimate "two domains" is record authority (insight vs. record), NOT concept identity.

## Telling A from B (litmus)
Count **author-facing concept identities per clinical concept**: **B** — one declared concept;
asserted-ness/origin reached only through resolution (provenance, representations). **A** — a separately
declared, nameable "asserted" concept kept in correspondence with a sourced twin. Corollary: an author
never writes a representation's or a partition's name on the left-hand side of a declaration/reference.

## Example A — Mammogram (multi-shape, multi-source, derivations)
```crl
terminology "Mammogram VS":                  - valueset is `http://example.org/screening/ValueSet/mammogram`.
terminology "Mammogram DiagnosticReport VS": - valueset is `http://example.org/screening/ValueSet/mammogram-dr`.

# ASSERTED layer — grouped by source class (top-level coded from = base rep + defaults)
concept "Clinical Mammogram":
- type is Observation.
- coded from "Mammogram VS".
- possible representation: - type is ImagingStudy.
- possible representation: - type is DiagnosticReport. - coded from "Mammogram DiagnosticReport VS".
- possible representation: - coded from: - system is `http://example.org/local`. - code is `mammogram`.

concept "Administrative Mammogram":
- type is Observation.
- possible representation: - type is Claim. - coded from "Mammogram VS".
- possible representation: - type is ExplanationOfBenefit. - coded from "Mammogram VS".
- possible representation: - coded from: - system is `http://example.org/local`. - code is `mammogram`.

# INFERRED layer — composition + derivations
concept "Mammogram":
- type is Observation.
- defined as ( "Clinical Mammogram" sem-or "Administrative Mammogram" ).

concept "Most Recent Mammogram":
- type is Observation.
- value type is dateTime.
- definition is most recent "Mammogram".

concept "Mammograms In Last Six Months":
- type is Observation.
- value type is integer.
- definition is count of "Mammogram" within last 6 months.

concept "Up To Date On Mammography":
- type is Observation.
- value type is boolean.
- definition is "Most Recent Mammogram" within last 27 months.
```
The local Observation source, present in both groupings, collapses to one by the
`{ type, value type, terminology }` key. Records are not deduped by CRL.

## Example B — BMI (inference cascade; assertable at every level)
```crl
terminology "Height VS":   - valueset is `http://example.org/vitals/ValueSet/height`.
terminology "Weight VS":   - valueset is `http://example.org/vitals/ValueSet/weight`.
terminology "Clinical BMI": - valueset is `http://example.org/vitals/ValueSet/bmi`.

concept "Height":
- type is Observation.
- value type is Quantity.
- coded from "Height VS".
- possible representation: - coded from: - system is `http://example.org/local`. - code is `height`.

concept "Weight":
- type is Observation.
- value type is Quantity.
- coded from "Weight VS".
- possible representation: - coded from: - system is `http://example.org/local`. - code is `weight`.

concept "BMI":
- type is Observation.
- value type is Quantity.
- definition is "Weight" / ( "Height" * "Height" ).                              # computed
- possible representation: - coded from "Clinical BMI".                          # directly recorded clinical BMI (origin clinical)
- possible representation: - coded from: - system is `http://example.org/local`. - code is `bmi`.   # user assertion (origin user)

concept "High BMI":
- type is Observation.
- value type is boolean.
- definition is "BMI" >= 30 'kg/m2'.
- possible representation: - coded from: - system is `http://example.org/local`. - code is `high-bmi`.
```
Cascade `High BMI ← BMI ← {Height, Weight}`. `BMI` is the fully-mixed form: it may be **computed**
(from Height/Weight), **retrieved** (a directly recorded clinical BMI), or **asserted** (local) —
most-recent over all three wins. Assert at any level; recency selects; a later source recompute can
supersede an older assertion **only when all inputs it uses are newer than that assertion** (the
recompute's as-of time is the oldest input), with provenance explaining. `BMI`/`High BMI` are mixed
concepts (§8).

## Consequences
- A CEL `fact` is the existence proof for B: one `defined by` slot — it cannot name an "asserted
  identity" vs a "sourced identity"; provenance rides on the value. B-shaped today; gains origin.
- Source-shape normalization (heterogeneous carriers → one declared concept value + provenance) is the
  inferred/normalization layer; representations return **evidence carriers**, the concept value is the
  **declared shape**.
- The `cf-example-content` libraries are *one early, A-shaped implementation* (hand-written at the
  lowered level) — assess/keep parts deliberately; do not copy wholesale. (B) is the author-facing model
  it should lower *from*.

## Deferred to the *how*-round
Exact grammar for `possible representation:` and inline `coded from: - system is …. - code is ….`; the
inheritance/override production details; the origin-derivation mapping (type/code-domain → authority);
effective-vs-entry time semantics; local-code governance (scope/versioning); the narrative/expression
grammar for `definition is …`; the KE policy-knob surface (§8); and the CRE + emit lowering.
