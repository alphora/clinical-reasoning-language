# CRL North Star — how CRL actually works

**Status:** authoritative primer. This is the "north star" for anyone (human or agent) doing CRL language,
emitter, or representation work, and it is meant to be **handed to reviewers** so they evaluate CRL against
how CRL actually works — not against CQL idioms or chart-matching assumptions.

**How to use it:** read it at the **start of every** #189 / emit-cluster / representation round, and paste or
reference it into any design/code review of CRL logic. Where this doc and an older spec disagree, this doc is
current; see "Reconciliation" at the end.

---

## 1. What CRL is

CRL (Clinical Reasoning Language) is a **declarative** language for clinical logic. Authors declare **what**
a determination means, not **how** to compute it. It covers the full breadth of clinical quality and
decision support — **cognitive support, CDS, Prior Authorization, risk adjustment, AND quality measures** —
not just measures.

CRL compiles to two coordinated outputs:

- **CQL** — the logic (retrieves, derivations, composition, guards).
- **FHIR** — the knowledge artifacts (PlanDefinition/Library/etc.) and, via CEL case files, the test/data
  instances the logic runs against.

The two outputs must **agree**: the FHIR a case emits must satisfy the CQL the same CRL emits. Keeping those
two lanes consistent is the through-line of the emit work (issue #189).

---

## 2. ⭐ The local domain is the CANONICAL, PRODUCTION representation

**This is the single most important thing to understand, and the one most often gotten backwards.**

A concept's **local code** (`- code is \`x\`.`) is the project's **own canonical code** for that concept, in
the project-owned local CodeSystem (`<canonicalBase>/CodeSystem/<domain>-local`). **CRL logic is defined over
the local domain.** The local code is production, first-class, and the thing the logic actually runs on. It
is **not** a testing convenience.

**Source representations are the OPTIONAL, ADDITIVE path.** A `- source representation:` with
`- coded from "SomeValueSet".` binds an **external** terminology (clinical/SNOMED/ICD, administrative/claims).
When that external data is available, it **defaults** the local concept — it seeds the concept's value from
real-world data. The source codes are the *optional* ones. The local code stays canonical, and it:

1. **fills gaps** where external data is absent, and
2. **remains the representation the logic uses**, even after a source rep is added.

### Why local codes are essential in production — the argument

Prior Authorization is the first deep use case, and today it runs **exclusively off local domain codes** — it
has no access to clinical or claims data. (The one exception is **Patient**: PA receives the Patient resource,
so Patient uses a source representation. See the Patient-age recency merge.)

Consider a PA workflow that must answer a clinical question but has **no clinical data** to answer it. The
options are:

- **Fail?** That violates the CMS interoperability/PA mandate — our customers get fined. Not an option.
- **Write a real clinical medical fact** (e.g. a SNOMED-coded cancer Condition in the EHR's terminology)?
  No. It usually isn't the treating physician submitting the PA, so writing a real diagnosis would change and
  break the clinical workflow, and it would place medical facts outside the EHR's system of record.
- **What we actually do:** assert a code **in our own domain** meaning *"inference of the member having
  cancer, for the purpose of analysis"* (CDS and Measures are part of that analysis). This is an
  **analytical determination in the project's canonical vocabulary** — deliberately **not** a clinical fact
  in external terminology.

This is the **system of insight ≠ system of record** distinction (ADR 0001): an *assertion* is a reasoning
input, not a fact of record. The local domain is exactly where those analytical determinations live, which
is why it is the canonical, production representation.

### Consequence for emit

`exists([<Resource>: <local code>])` matching a CEL-emitted local-domain resource **is the production
round-trip** for the local-domain path — which, for PA, is essentially everything. A review comment like
"this won't match a real SNOMED chart Condition" is measuring the **optional source-representation path** and
is irrelevant to whether the local-domain path is production-correct. It is. Do **not** conclude that
concepts should be "moved to source representations to match charts": every concept is canonically local, and
*some additionally* gain a source rep for defaulting.

---

## 3. The concept model

### One identity, declared value type

A **concept** is one determination with **one identity** and a **declared value type**. Provenance rides on
values, not on separate identities (ADR 0001 rejected sourced/asserted twin identities).

### Representations produce records

- **`- code is \`x\`.`** — the concept's **local** code (canonical, project-owned domain). Where local and
  user assertions land. Present ⟹ locally assertable.
- **`- source representation: - type is …. - value element is …. - value type is …. - coded from "VS".`** —
  an **external**, optional source shape. A source representation is **fully explicit** — it carries its own
  `type is` + `value element is` + `value type is` (`coded from` optional, e.g. Patient/birthDate has none)
  and **does NOT inherit** the concept's fields (validator A.1,
  `representationShapeValidator.ts:260-275`). Identity = `{type, value type, terminology}`.
- **`- coded from "VS".`** — a named external binding (read-only base).

Only representations emit FHIR **instances**. A concept unions the records from all its representations.

### `defined as` — value-preserving set algebra

`- defined as ( A sem-or B ).` composes **distinct named concepts** with value-preserving set operations:

- `sem-or` = union · `sem-and` = intersection/refinement · `sem-not` = complement (closed-world).

`sem-and` and `sem-not` are **load-bearing** — validated by real quality-measure logic (value-preserving
refinement of a record set). Composition operands must **agree on value type** (mixed-value-type composition
is an author error — see below).

### `definition is` — named derivations

`- definition is <derivation>.` names a derivation over a concept's records:

- selection (`most recent this`), threshold (`count "X" ... at least N`), aggregation, temporal
  (`within last …`), formula, and **`exists`** (concept → boolean).
- `this` refers to the concept's **own representation records** (not its computed value → no circularity).

### ⭐ Value-type-driven reduction ("no bare `code is`" — stated correctly)

A concept's records are a **set**. Its **result shape and value are decided by its own declaration** — never
silently, never by consumption context. Two things are declared explicitly:

- **The value type** — the scalar/element type of the concept's result (`boolean`, `Quantity`, `CodeableConcept`, …).
- **The cardinality** — whether the concept publishes a **set of records** or a **single reduced value**. This
  is declared, **not inferred** from whether a reduction happens to be present (that would drift back to a
  consumption-site rule). A record-valued concept says so: **`value type is set of <T>`** (a `RecordSet`).

The rules:

- **A scalar-valued concept** (`value type is boolean` / `Quantity` / …, singular) ⟹ its record set MUST
  collapse to that scalar ⟹ an **explicit reduction is required** (`definition is exists this` /
  `most recent this`, a `definition is` derivation, or a `defined as`). A bare scalar `code is` with no
  reduction is an **error** — the magic the emitter must never manufacture (the old `.asTruths()` hidden
  `exists(any true)`).
- **A record-valued concept** (`value type is set of <T>`) ⟹ **no scalar reduction**; it **publishes its
  record set**. Other concepts reference it **by name** and derive from its **records**. (The explicit
  `set of` is what disambiguates a `CodeableConcept` *set* — e.g. a coded-Encounter refinement operand — from
  a single-`CodeableConcept` scalar; both use the `CodeableConcept` value type, so cardinality can't be read
  off the value type alone.)

**Worked example — step therapy (a real PA pattern):**

```crl
concept "Conservative Therapy Trial":      // record-valued: declared a set → publishes its records
- type is Procedure.
- value type is set of Procedure.
- code is `conservative-therapy-trial`.

concept "Adequate Step Therapy":           // scalar (boolean) → reduction is explicit
- value type is boolean.
- definition is count "Conservative Therapy Trial" at least 2.

concept "Most Recent Trial":               // single record → selection is explicit
- value type is Procedure.
- definition is most recent "Conservative Therapy Trial".
```

One concept, one local code, many deriving references. There is no "two concepts sharing a code" problem
(that would be `emit-duplicate-local-code`), and no dynamic "reduce at the use-site" rule: the base concept
**declares** it is a record set, and each derivation names it and reaches its **records**. *(The exact
surface form of the cardinality marker — `value type is set of <T>` vs a `records` keyword — is finalized in
the grammar slice; the ruling is that cardinality is declared, not inferred.)*

**Boolean determination from a valueless resource** (the #189 migration form): declare the concept's
**result** value type boolean and reduce with existence over the natural resource —

```crl
concept "Familial Adenomatous Polyposis":
- type is Condition.
- value type is boolean.               // the RESULT type (from exists), not a claimed Condition element
- code is `familial-adenomatous-polyposis`.
- definition is exists this.           // → exists([Condition: "Familial Adenomatous Polyposis"])
```

Note the two distinct types: the **representation datum** is a `Condition` record (coding at `Condition.code`,
no value element); the **published result** is `Scalar<Boolean>` produced by `exists`. `value type` names the
result. The "value type must match a real element" rule applies only to a representation read as a value
**without** a reduction — never to the output of `exists` / a threshold / an age calculation.

### Cardinality is declared, not inferred

Every concept has a declared result shape — `RecordSet` (a retrieve/union), `Record` (a selection like `most
recent`), or `Scalar` (a reduced value / `exists`). Set-algebra (`union`/`intersect`/`except`) is defined on
`RecordSet`; a reduction moves `RecordSet → Record/Scalar`. The shape is **self-described by the concept**, so
its CQL is a pure function of its own definition.

### Closed-world

Implicit absence = the empty set. A scalar over the empty set has no value; a **boolean** over the empty set
is **false**. Explicit absence is an ordinary **absence code** (a record), not a positive event. There is no
"unknown."

---

## 4. Emit principles

- **Representations emit FHIR instances; `defined as` / `definition is` emit CQL (logic), not instances.**
- **CQL is context-free.** A concept's CQL is a pure function of its own definition — never of how it is
  consumed (guard vs measure population vs operand). There is no "QM vs decision" CQL fork.
- **No magic.** The emitter never manufactures a value a concept did not declare. Every set→scalar reduction
  is explicit in the CRL (per the value-type rule above).
- **Null-safety by construction.** Every boolean-valued define the emitter produces is **total**: `exists(…)`
  is total by construction; a nullable boolean derivation is totalized (`Coalesce(<predicate>, false)`) at its
  own boundary — **per operand, before any `not`** (because `not Coalesce(A,false)` ≠ `Coalesce(not A,false)`
  under closed-world), and never by Coalescing a nullable **non-boolean** operand (that would manufacture a
  value). The backstop is an emit/test-time totality assertion, not a blanket terminal Coalesce.
- **`canonicalBase` is required** — absent/empty is an error, no `urn:` fallback. The local CodeSystem is
  always `<canonicalBase>/CodeSystem/<domain>-local`.

---

## 5. Scope & maturity — read the examples correctly

- **Prior Authorization is the deep, first use case.** The correct model is being worked out through PA.
- **Quality measures in CRL are a smoke test.** Two measures were authored to prove CRL could express
  clinical logic at all — valuable, but built following the **current** way of modeling measures, which is
  **almost certainly wrong**. "Measures the CRL way" is a **later phase** (local domain codes very likely
  apply there too — TBD).
- **So: distinguish the QM *approach* from the QM *capability lessons*.** Do **not** treat measure artifacts
  (e.g. cms69) as canonical, and do **not** anchor design decisions on current measure patterns. **But** the
  capabilities the QM work legitimately validated — notably `sem-and` and `sem-not` as load-bearing — are
  real and stay. The one inference to reject is "QMs use local codes less, therefore local codes aren't
  production." Keep the baby; discard the bathwater.

---

## 6. For reviewers

When you review CRL logic, emit, or representation design, measure it against **this model**, specifically:

- The **local domain is canonical/production**; source reps are optional/additive. Do not treat local codes
  as a test shim or push concepts toward chart-matching source reps to "fix" round-trip.
- A concept is **self-describing**: its **value type** decides whether a reduction is owed; its **cardinality**
  is declared; its CQL is **context-free**.
- The emitter manufactures **nothing** — flag any place a value appears that the concept didn't declare.
- QM artifacts are **provisional**; the capabilities they exercised (`sem-and`/`sem-not`) are not.

---

## Reconciliation

This doc is authoritative on the points above. Two older specs need updating to match and should be read
**subordinate** to this doc until reconciled:

- `docs/defined-as-is-semantic-composition.md` and `docs/cql-to-crl-type-valuetype-rule.md §7` — both state
  that mixed-value-type ("mixed-shape") composition is legal via an implicit `exists` bridge. That is
  **superseded**: mixed-value-type composition is an **author error**; the author writes an explicit
  `definition is exists <record concept>` operand. These docs will be updated with the validation slice.

Related: `docs/decisions/0001-asserted-vs-sourced-data-model.md` (the asserted-vs-sourced foundation, still
current).
