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
refinement of a record set). Composition operands' **result types must agree**, and the shipped validator
enforces this **directionally** (not a blanket "mixed = error"): a leaf declaring `value type is boolean`
inside a composition whose parent declares a non-boolean value type is a hard **error**
(`boolean-in-refinement-composition`); any other result-type disagreement the implicit-existence bridge
currently permits is a **warning** (`composition-result-type-mismatch`) today that becomes an **error at the
#189 flip**. See `docs/emit-consistency-189-design.md` §7.

### `definition is` — named derivations

`- definition is <derivation>.` names a derivation over a concept's records:

- selection (`most recent this`), threshold (`count "X" ... at least N`), aggregation, temporal
  (`within last …`), formula, and **`exists`** (concept → boolean).
- `this` refers to the concept's **own representation records** (not its computed value → no circularity).

### ⭐ Value-type-driven reduction ("no bare `code is`" — stated correctly)

A concept's records are a **set**. Its **result shape and value are decided by its own declaration** — never
silently, never by consumption context. Two things are declared explicitly:

- **The value type** — the scalar/element type of the concept's result (`boolean`, `Quantity`, `CodeableConcept`, …).
- **The cardinality** — whether the concept publishes a **set of records** (`RecordSet`), a **single selected
  record** (`Record`), or a **single reduced value** (`Scalar`). This is declared, **not inferred** from whether
  a reduction happens to be present (that would drift back to a consumption-site rule). A concept declares it on
  a dedicated concept-level line: **`- shape is Scalar | Record | RecordSet.`** — `Scalar` is the default the
  builder normalizes an omitted `shape is` to; the record resource comes from `type is`, not from the value type.

The rules:

- **A scalar-valued concept** (`value type is boolean` / `Quantity` / …, singular) ⟹ its record set MUST
  collapse to that scalar ⟹ an **explicit reduction is required** (`definition is exists this` /
  `most recent this`, a `definition is` derivation, or a `defined as`). A bare scalar `code is` with no
  reduction is **invalid** — the magic the emitter must never manufacture (the old `.asTruths()` hidden
  `exists(any true)`). *(In the shipped validate-only slice this is the `no-bare-scalar-code` **warning** — a
  migration prompt; it becomes a hard error at the flip. A `code is` concept whose reduction is supplied by a
  `value projection` posrep — e.g. patient age — is NOT bare and is exempt.)*
- **A record-valued concept** (`shape is RecordSet`) ⟹ **no scalar reduction**; it **publishes its
  record set**. Other concepts reference it **by name** and derive from its **records**. (The explicit
  `shape is RecordSet` is what disambiguates a `CodeableConcept` *set* — e.g. a coded-Encounter refinement
  operand — from a single-`CodeableConcept` scalar; both would carry the `CodeableConcept` value type, so
  cardinality can't be read off the value type alone — it is declared, on its own line.)

**Worked example — step therapy (a real PA pattern):**

```crl
concept "Conservative Therapy Trial":      // record-valued: declared a set → publishes its records
- shape is RecordSet.                       // cardinality declared; resource is `type is`
- type is Procedure.
- code is `conservative-therapy-trial`.

concept "Adequate Step Therapy":           // scalar (boolean, the default shape) → reduction is explicit
- value type is boolean.
- definition is count "Conservative Therapy Trial" at least 2.

concept "Most Recent Trial":               // single record → selection is explicit
- shape is Record.                          // one selected record; resource is `type is`, no value type
- type is Procedure.
- definition is most recent "Conservative Therapy Trial".
```

One concept, one local code, many deriving references. There is no "two concepts sharing a code" problem
(that would be `emit-duplicate-local-code`), and no dynamic "reduce at the use-site" rule: the base concept
**declares** it is a record set, and each derivation names it and reaches its **records**. *(The cardinality
marker is finalized as a dedicated concept-level line — `- shape is Scalar | Record | RecordSet.`, `Scalar` the
default — grammar-shipped in the #189 validation slice; the ruling is that cardinality is declared, not
inferred. `shape is Record | RecordSet` parses and validates today but is **validate-only** — emit activates
at the flip.)*

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

### ⭐ Case-features are ANY resource — "Observation.boolean-only" is a HACK we are deleting

**Read this before touching the case-feature / decision-input / DTR emit. It is the single most-repeated wrong
turn.** A decision's **case-feature StructureDefinition is typed by the concept's own natural resource** — the
concept's `type is` (Condition, Procedure, ServiceRequest, MedicationRequest, Observation, …), derived from its
effective-representation descriptor. It is **never forced to Observation**.

The old emitter restricted *every* `code is` concept's case-feature to an **`Observation` with a boolean
`value[x]`** (the "LocalSource-always-boolean rule" in `structureDefinition.ts` / `closureOrchestrator.ts`).
**That is a HACK** — a stopgap that squeezed all determinations into `Observation.valueBoolean` to stand up early
Prior Auth. #189 (the emit-consistency flip) and its FHIR half (2d) **remove it**. The doctrine comments in that
code describe the hack; they are **not** the model. When you see a `type is Condition` boolean concept emit an
`Observation` case-feature SD, that is **the bug we are fixing**, not a constraint to respect.

**Not every concept is a case feature — only NON-EPHEMERAL facts get an SD.** A case feature is a concept that
denotes a **persistable / gatherable record** — an actual FHIR resource instance (Condition, Procedure, …) with a
`code is` / representation. Those, and only those, get a case-feature StructureDefinition and a DTR questionnaire
input. A **purely derived** concept — a reduction (`count`, `most recent`, `exists`), a `defined as` composition,
any computed boolean — is **ephemeral**: it exists only as a value computed during CQL evaluation, has no resource
of its own, and gets **CQL, not an SD**. Its case-features are the non-ephemeral **records it derives from**
(collect *through* a reduction/composition to the code/representation-bearing operands). A concept that is *both*
a record and a reduction (e.g. `code is` + `exists this`) is a case feature **via its record** — the SD describes
the Condition, and its `featureExpression` targets the records define; the boolean is the ephemeral CQL reading.
(A concept whose dependency closure reaches no `code is` / representation at all is authored null-forever — a
validator concern, issue #291, not an emit one.)

How the boolean is represented depends on the concept's natural resource — the descriptor's `valueless` flag is
the discriminator:

- **Valueless resource** (Condition, Procedure, ServiceRequest, MedicationRequest — the record has no value
  element): the determination's truth is **`exists`, computed in CQL** over the record — closed-world (present =
  true, absent = false). There is **no boolean value on the resource**; do NOT fabricate one (a Condition has no
  boolean slot). DTR gathers the record **by its code** (verified: SDC `$extract` creates a Condition whose coding
  element is the answer slot); existence of the coded record = the determination.
- **Value-bearing Observation** (`type is Observation`, `value type is boolean` — the record genuinely carries a
  value): the boolean **legitimately lives in `Observation.value`** and is **read** in CQL. This is a real
  representation, **NOT** the hack.

**The hack is not "storing a boolean" — it is FORCING every concept into `Observation.valueBoolean` regardless of
its declared `type is`.** A genuine boolean Observation is fine; coercing a `type is Condition` (valueless) concept
into one is the bug. The two distinct types (charter §3) remain: the **representation datum** (the record — for a
valueless resource, coding with no value element) and the **published result** (`Scalar<Boolean>`, from `exists`
for a valueless record or from *reading* the value for a boolean Observation).

**Therefore, when reasoning about case-features / DTR / `$apply`, do NOT:**

- fabricate a boolean value on a **valueless** resource (Condition/Procedure/…) — its determination is `exists`
  (a genuine boolean Observation carrying `value` is a different, legitimate case);
- treat "fall back to Observation-only" as an acceptable outcome (**that IS the hack** — the fix is per-resource
  case-features; a resource that cannot yet be proven fails **loud** (`unsupported-casefeature-resource`), it is
  never quietly re-hacked to Observation);
- read the `structureDefinition.ts` / `closureOrchestrator.ts` "always-boolean" doctrine as authoritative — it is
  the code we are removing.

**Patient is the one supplied exception** (charter §2): PA supplies the Patient resource, so a Patient/age
determination is *read*, not gathered via a questionnaire case-feature.

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
- **Case-features are any resource** (§4): flag any reasoning that forces a case-feature to Observation, invents a
  boolean value to store on a resource, or treats "Observation-only fallback" as acceptable — that is the hack
  being removed, not the model.
- QM artifacts are **provisional**; the capabilities they exercised (`sem-and`/`sem-not`) are not.

---

## Reconciliation

This doc is authoritative on the points above. Two older specs need updating to match and should be read
**subordinate** to this doc until reconciled:

- `docs/defined-as-is-semantic-composition.md` and `docs/cql-to-crl-type-valuetype-rule.md §7` — both stated
  that mixed-value-type ("mixed-shape") composition is legal via an implicit `exists` bridge. That is
  **superseded** (decision B), and both docs were **updated in the #189 grammar+validation slice** (IMPL 4)
  with a superseding banner reflecting the shipped **directional** rule: a boolean leaf inside a non-boolean
  composition is a hard **error**; other result-type disagreements the bridge permits are a **warning** today
  that becomes an **error at the #189 flip**. The explicit `defined as exists ( … )` lift is the fix for the
  boolean-parent-over-record-leaf warning cell (not for the error cell — there the leaf's value type is realigned).

Related: `docs/decisions/0001-asserted-vs-sourced-data-model.md` (the asserted-vs-sourced foundation, still
current).
