# Migrating bare `code is` concepts — a hand-off guide for content KEs (#189)

**Audience:** anyone authoring CRL in a content repo (e.g. `hcsc-content`). **Scope:** YOUR repo. Each
content repo's KE migrates their own libraries; the language repo migrates its own examples/fixtures.
This guide tells you what changes, how to find every concept in your libraries that needs it, and
exactly what edit to make.

---

## What is changing, and why

Today a concept whose only value source is a bare local code —

```crl
concept "Active Crohns Disease":
- type is Condition.
- value type is boolean.
- code is `active-crohns-disease`.
```

— silently publishes the raw local code *as a boolean existence*. That is an implicit reduction the
author never wrote. The #189 emit flip makes concepts **self-describing**: a `Scalar` concept must
**state its reduction explicitly**. After the flip, a bare `code is` with no reduction is a **hard
error** (`no-bare-scalar-code`), not a silent default.

This is not a new capability you have to learn — it is making the concept say out loud what it already
means. The emitter manufactures nothing; every set→scalar reduction is written down.

> **Closed-world, unchanged:** absence still means "false / not present." Adding `exists this` does not
> change the semantics of a presence concept — it just states them.

> **This is a family of rules, not one rule.** `no-bare-scalar-code` is the headline, but the flip also
> hardens several other validation warnings to errors (composition result-type mismatches, non-boolean
> and record-shaped decision guards, other reduction-shape coherence rules). Your done criterion is a
> **clean warning list**, not just zero `no-bare-scalar-code` — see the checklist.

---

## How to find every target in YOUR repo

The `no-bare-scalar-code` diagnostic **already ships** (it is a validate-only warning on current
versions — it does not yet change your emit). Run validation over your libraries and read the warnings:

- Each warning **names the offending concept** and carries a **per-concept suggested action**.
- It fires **corpus-wide** — every bare presence concept, across every FHIR resource
  (Observation / Condition / MedicationRequest / Device / …).

You do not have to guess or grep: the validator is the authority. If your tooling surfaces validation
warnings (the MCP `validate_crl`, the editor squiggles, or `crl-validate`), the target list is whatever
carries a `no-bare-scalar-code` warning — **and clear the rest of your warnings too** (see the checklist).

---

## The fix — four cases, keyed by your concept's value type

Pick the row that matches the concept the warning named. **Do not** change the `code is` line — you are
*adding* a reduction, not replacing the code.

### 1. Boolean presence → `exists this`

The concept asks "is this present?" (`value type is boolean`). State the presence reduction:

```crl
concept "Active Crohns Disease":
- type is Condition.
- value type is boolean.
- code is `active-crohns-disease`.
- definition is exists this.          # ← add this line
```

This is valid over **multiple representations** too (the union of each representation's existence).

### 2. Value read (a single-representation value) → `most recent this`

The concept publishes a *value*, not a yes/no (`value type is Quantity`, `CodeableConcept`, `integer`,
`string`, `dateTime`, …), and has ONE representation. Read the most recent record's value:

```crl
concept "Most Recent A1c":
- type is Observation.
- value type is Quantity.
- code is `a1c`.
- definition is most recent this.     # ← add this line
```

**Prerequisites (all must hold — else `most recent this` will NOT emit):**

- The **effective resource must be supported**. An omitted local `type is` currently DEFAULTS to
  `Observation` (the implicit-standard local resource) — so a bare `code is` value read reads
  `Observation.value`. Declare `type is <Resource>` explicitly if Observation is not what you mean.
- That resource's value element **admits your value type** (e.g. `Observation.value` admits `Quantity`,
  `CodeableConcept`, …; `Condition` has *no* value element — a value read there is impossible, use
  case 1 instead). The language repo's inventory flags concepts that fail this as **blockers**; if the
  validator later errors with `value-type-must-match-a-real-element`, this is why.
- No incompatible **use-site**: a value-typed (non-boolean) concept used as a decision `when` guard or
  action guard is independently invalid at the flip (guards must be boolean). Fix the use-site too.

### 3. Multiple representations of a value → promote one to a `RecordSet`

If the concept has a value type AND more than one representation (a `code is` **and** one or more
`source representation`s), a `most recent this` would span every representation and be ambiguous
(cross-representation dedup is deferred to #257). Split it explicitly:

```crl
# BEFORE — one concept, a local code + a source representation, no reduction:
concept "A1c Result":
- type is Observation.
- value type is Quantity.
- code is `a1c`.
- source representation:
  - type is Observation.
  - value element is Observation.value.
  - value type is Quantity.
  - coded from "A1c VS".

# AFTER — a named RecordSet publishes ONE chosen representation's records; a scalar reduces THAT.
concept "A1c Results":
- type is Observation.
- shape is RecordSet.
- code is `a1c`.                       # the chosen representation feeds the reduction

concept "Most Recent A1c":
- type is Observation.
- value type is Quantity.
- definition is most recent "A1c Results".
```

**State where every original representation goes.** The example keeps the local `code is` as the
`RecordSet`'s single representation.

⚠ **DO NOT drop the `source representation`, and do not split a concept in order to avoid one.** An earlier
version of this case said the source representation is dropped from the reduced set. That instructed authors
off the canonical model (charter §0a/§2: the local `code is` is the production representation and a source
representation is optional and ADDITIVE), and its premise is also gone — the both-rep `most recent this` +
`coded from` recency merge emits today.

The one re-authoring that IS correct here is unrelated to emit maturity: a BOOLEAN concept carrying a
non-boolean coded source rep must become the canonical value concept + boolean interface concept split
(charter §3). That is a value-type-agreement rule. The value concept keeps BOTH arms.
only the chosen set feeds `most recent this` until cross-representation dedup lands (#257). If you need
the other representation too, model it as its own named `RecordSet` and decide, per concept, which set
the reduction reads. Preserve local assertability where you had it (`code is` stays on the `RecordSet`).

### 4. No single value type (none declared, or more than one) → declare one first

If the concept declares no value type, or more than one, the reduction is undetermined — **you** decide.
Declare a single `value type is <T>.` first, then apply case 1 (boolean → `exists this`) or case 2 (a
value type → `most recent this`).

> **Note — a validator-message discrepancy.** The current shipped warning suggests `exists this` for
> the no-single-value-type case (it treats an undeclared value type as boolean). That is being corrected
> at the flip: the charter-correct step is to **declare the value type first**, because a copied
> `exists this` guesses the concept is a boolean presence when it may not be. Declare, then reduce.

---

## What is NOT a target — leave these alone

The flip does **not** break, and you should **not** add a reduction to:

- **`code is` + `defined as`** (a "both representation" concept) — the `defined as` already satisfies the
  reduction requirement. Its *emitted CQL* changes at the flip, but you author nothing.
- **A `value projection` representation** (e.g. the patient-age recency posrep) — the projection already
  supplies the reduction. Adding `exists this` would **break** it. Leave it.
- **A `shape is RecordSet` concept with a bare `code is`** — that is the canonical base-record retrieve
  (it publishes its set of records). No reduction is owed.
- **A concept with no local `code is`** (a purely derived / `defined as` concept) — nothing to migrate.
- **`code is` + `coded from`** (a local code plus an external terminology binding, no reduction) — this
  mixed form is out of the reduction rule's scope (its definition slot is taken); `no-bare-scalar-code`
  does not fire. Its emit is governed elsewhere — leave it for the mixed-form handling, not this guide.

The validator will not warn `no-bare-scalar-code` on any of these. If it does not warn, do not change it.

---

## Timing — migrate in lockstep with the version upgrade

There is a version ordering to respect:

- **Before the flip release:** the reduction forms (`exists this` / `most recent this`) validate but
  **fail emit** (`emit-reduction-not-active`). So do **not** add reductions to content you still emit
  on a pre-flip version.
- **At/after the flip release:** the reduction forms emit correctly, and the bare `code is` becomes a
  hard error.

**So: apply these edits when you move your repo to a CRL package version at or past the flip release.**
Validate first (the warnings are your worklist), upgrade, apply the fixes, re-emit, confirm green.

---

## Checklist

1. Validate your libraries on your current version; collect **every** validation warning (not only
   `no-bare-scalar-code` — the flip hardens a family).
2. For each `no-bare-scalar-code`, note the suggested action and pick the matching case (1–4), checking
   case 2's prerequisites.
3. Upgrade to a CRL version at/after the flip release.
4. Apply the edits — for cases 1–2 add the reduction line without touching the `code is`; case 3 is
   the explicit split shown above (promote a representation to a named `RecordSet`), not a one-liner.
   Fix any other warned rules too.
5. Re-emit and re-validate — a **clean warning list** (zero `no-bare-scalar-code`, zero
   `emit-reduction-not-active`, **and** zero of the other flip-hardened warnings your repo carried).

The language repo's own in-repo inventory (for reference, not your worklist) lives at
`docs/emit-189-migration-inventory.md`. Your worklist is your own validator run.
