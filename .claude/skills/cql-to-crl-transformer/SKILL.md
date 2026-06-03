---
name: cql-to-crl-transformer
description: Transform a CQL define (or a list of defines) into one or more CRL concepts with correct `type is …` and `value type is …` declarations per the canonical rule. Use this whenever (a) creating new CRL concepts from existing CQL source, (b) auditing existing CRL concepts for type/valuetype correctness, or (c) the user asks for the "CQL→CRL transformer".
---

# CQL → CRL transformer

This skill is the precursor to the future "CQL/Narrative → CRL transformer" MCP. Its purpose is to take CQL `define` statements as input and produce CRL `concept` declarations with correct `type` and `valuetype`, applying the rule canonicalized in [features/cql-pattern-mining/cql-to-crl-type-valuetype-rule.md](../../../features/cql-pattern-mining/cql-to-crl-type-valuetype-rule.md).

## When to use

- Converting a CQL library into a CRL model for the first time.
- Auditing an existing CRL model against the source CQL (the cms69 / cms22 corpus is the canonical example — see `features/cql-pattern-mining/results/models/`).
- Determining `(type, valuetype)` for any single concept where the answer isn't obvious from the narrative form.

## Required reading before invocation

Read these in full **once** at the start of a session and keep them in mind:

1. **CRITICAL — DO NOT SKIP**: [features/cql-pattern-mining/defined-as-is-semantic-composition.md](../../../features/cql-pattern-mining/defined-as-is-semantic-composition.md). This document states the SINGLE most important design principle for this skill: `defined as` is SEMANTIC composition, not boolean logic. The author declares the result `(type, valuetype)`; `sem-and` / `sem-or` / `sem-not` do NOT type-check operands. Mixed-shape operands are legal under explicit author declaration. Multiple agent runs have produced wrong transformations by mis-reading this — treating `sem-and` as boolean AND with strict operand-type matching, "fixing" non-defects, then introducing new ones. Read this doc end-to-end before doing any transformation work. The same principle applies to the sibling body kind `definition is` (narrative-predicate form) — see the "sibling form" section of that doc.
2. The canonical rule: [features/cql-pattern-mining/cql-to-crl-type-valuetype-rule.md](../../../features/cql-pattern-mining/cql-to-crl-type-valuetype-rule.md) — the whole document, especially §1 (core rule), §7 (validator chain check, including §7.5 the asserted-as-contract post-pass), and §10 (quick checklist).
3. The CRL v0.7 grammar concepts: asserted (`coded from`), composition (`defined as`), narrative predicate (`definition is`).

## Inputs

The skill works at three granularities. Pick the one that matches the caller's input:

1. **Single CQL define** — text of one define + name → produce one CRL concept declaration.
2. **A CRL concept name + a path to a CQL library** — find the define, then transform it.
3. **A whole CQL library + a target directory** — produce a **4-file split** (terminology / asserted / inferred / interface), not a monolithic CRL file. See "Whole-library output layout" below.

### Whole-library output layout (per v2.1.0)

A whole-library transform emits four `.crl` files under the target
directory, mirroring the cms22-split / cms69-split convention:

| File              | `library "X".`            | Layer        | Contents |
|---|---|---|---|
| `<base>.crl`              | `"<Measure>"`             | interface    | The Quality Measure API: Initial Population / Denominator / Denominator Exclusions / Numerator / Denominator Exceptions. Whatever the downstream consumer (Measure engine / registry) reads. |
| `<base>-inferred.crl`     | `"<Measure> Inferred"`    | inferred     | Every `defined as` / `definition is` concept — the measure logic. |
| `<base>-asserted.crl`     | `"<Measure> Asserted"`    | asserted     | Every `coded from` concept — FHIR resource-to-valueset bindings. |
| `<base>-terminology.crl`  | `"<Measure> Terminology"` | terminology  | Every `terminology` declaration. Runtime parameters (e.g. `Measurement Period`) do NOT live here — see the parameter rule below. |

Rules for the output:

- The **interface file is unsuffixed** so its emitted CQL filename
  matches the downstream identifier (e.g. `CMS69.cql` is the entry
  point for the FHIR `Measure` resource).
- **No `include` lines** between local layers. Per v2.1.0 lock 026,
  local sibling libraries auto-resolve via qualified refs without an
  `include`; emitting them would just produce
  `redundant-local-include` warnings. The per-CRL emitter still emits
  a CQL `include` for every cross-library reference it sees in each
  layer's body, so the produced CQL has a self-contained dependency
  graph.
- **`include` IS required** for any externally-`npm install`ed CRL
  package (`include "Pkg".`) — that's how v2.1.0 distinguishes local
  siblings from external deps.
- **Cross-layer refs are qualified**: write
  `"<Measure> Asserted"."BMI Observations"` from the inferred layer,
  not bare `"BMI Observations"`. Bare refs are local-only under
  per-library scoping (validator §7).
- **Runtime parameters are LIBRARY-LOCAL** (v2.2.0, issue #59). The CQL
  source `parameter "Measurement Period" Interval<DateTime>` becomes the
  CRL declarative form `parameter "Measurement Period": - param type is
  Period.`. The rule for placement in a split project:
  - Every library that REFERENCES a parameter declares it locally.
  - Do NOT reference parameters from other libraries via qualified refs
    (`"OtherLib"."Param"`). The validator allows the syntax, but the
    canonical authoring pattern is local-only.
  - For a typical measure split, this puts `Measurement Period` in the
    inferred layer (where the timing-window narrative refs live —
    `"Encounter" during "Measurement Period"`). Terminology and asserted
    layers usually don't reference it, so they don't declare it. The
    interface layer typically references inferred concepts whose NAMES
    contain "Measurement Period" (e.g. `"Aged 18+ at Measurement Period
    Start"`); those are concept refs, not parameter refs, so the
    interface layer doesn't declare the parameter either.
  - Emit-time consequence: each emitted CQL file contains the `parameter`
    line ONLY in the libraries whose CRL source actually references the
    parameter. The cms22-split / cms69-split corpora are the canonical
    examples — `CMS22 Inferred.cql` carries `parameter "Measurement Period"
    Interval<DateTime>`; `CMS22 Terminology.cql`, `CMS22 Asserted.cql`, and
    `CMS22.cql` do not.
- Emit a `package.json` `{ "name": "<base>-demonstration-split",
  "version": "1.0.0", "private": true }` alongside so
  `findProjectRoot` stops at the split directory.
- Emit a `NOTES.md` listing the layout table and the re-emit/validate
  commands (mirror cms22-split/NOTES.md format).

## Procedure (per concept)

Run these steps in order. **Do not skip steps; do not guess where you can read.**

### Step 1 — Find the CQL define

If given a name and a library path, locate the define in the library. If the define cannot be found, **stop and escalate** — do not invent one.

### Step 2 — Determine the return shape

Read the define's body and determine its return type as ELM would compute it. Apply §1 of the rule doc:

- Returns `Boolean` (uses `exists`, `not`, comparison operators, boolean combinators) → **boolean shape**.
- Returns `List<Resource>` or `Resource` (filters, query expressions, list operations) → **refinement shape**.
- Returns a primitive value (`DateTime`, `Quantity`, `Integer`, etc.) extracted from a resource → **value-bearing shape**.

Cues to read:

- `exists(...)` / `not exists(...)` / `... is null` / `... is not null` → boolean.
- Comparison (`>`, `<`, `>=`, `<=`, `=`, `!=`) on scalars → boolean.
- `... in ...` (membership / interval) → boolean.
- `... during ...` (Date in Period) → boolean.
- `[Resource: <code>]` / `[Resource]` / `... where ...` returning a list → refinement.
- `First(...)`, `Last(...)`, `Singleton from ...` returning a single resource → refinement (single element of a refined list).
- `<Resource>.authoredOn`, `<Resource>.performed`, `<Resource>.value` returning a primitive value → value-bearing.
- Boolean combinators (`and`, `or`, `not`) over the above → boolean.

When the define **chains** through other defines, you may need to follow the chain to the leaf. Do so until the shape is determinable. If you reach an unresolvable reference, escalate.

### Step 3 — Apply the rule

Per the shape determined in Step 2:

- **Boolean shape** → `type is Observation. value type is boolean.` Subject's type is irrelevant.
- **Refinement shape** → identify the subject (first FHIR-resource-bearing thing in the body, traced back to its asserted concept). Inherit BOTH `type` and `valuetype` from the asserted subject. Do not change them.
- **Value-bearing shape** → `type is <source FHIR resource>. value type is <primitive>.` (e.g. `type is ServiceRequest. value type is dateTime.` for an `authoredOn` extract.)

### Step 4 — Sanity check against §5

Verify the `(type, valuetype)` pair is in the per-FHIR-type allowed set (§5 of the rule doc). If it's outside the observed set but inside the FHIR-valid set, note it as new territory. If outside both, escalate — the answer is probably wrong.

### Step 5 — Output

For each concept, emit:

```
concept "<Name>":
- type is <Type>.
- value type is <ValueType>.
- <body unchanged>.
```

Plus a reasoning trace in a comment (optional but encouraged for first-time pass):

```
// shape=boolean (CQL: `exists([Condition: "Overweight or Obese"] C where C.clinicalStatus ~ "active")`)
// → Observation+boolean per rule §1
```

### Step 6 — Confidence flag

For each transformation, tag confidence:

- **HIGH** — CQL clearly matches one of the three shapes; the §5 set agrees; the subject's declaration is unambiguous.
- **MEDIUM** — Shape is clear but the subject's declaration needs cross-checking, or the pair is in the "FHIR-valid but unseen" zone.
- **LOW** — Shape is ambiguous, chain is unresolvable, or the pair is outside the §5 allowed set.

**Stop and escalate for any LOW.** Do not commit a low-confidence transformation; surface it to the operator for judgment.

## Post-pass — asserted concepts as required-valuetypes contracts

After every individual concept has been transformed (every surface
concept has a final `(type, valuetype)`), run this whole-corpus pass.
It only applies to **whole-library** runs, not single-concept ones.

For each **asserted concept** `A` in the model:

1. Compute the **reverse-dependency closure** of `A` — every concept
   `C` in the model whose body, transitively followed through every
   `defined as` / `definition is` ref, eventually reaches `A` as its
   first FHIR-resource-bearing subject (§7.1 of the rule doc).
2. Collect the `valuetype` of every `C` in that closure, with one
   exclusion: **`boolean` does NOT propagate**. Per §1, boolean is the
   consumer's property (it represents a patient-level predicate the
   consumer derives), not a property the asserted source needs to
   advertise. Drop boolean-valued consumers from the set.
3. Union the resulting set with `A`'s own declared valuetypes.
4. Emit `A` with the full union as multiple `value type is X.` lines —
   the AST supports a `valueTypes?: string[]` array, so multi-valuetype
   on a single concept is grammatical:

   ```crl
   concept "Blood Pressure Panels":
   - type is Observation.
   - value type is CodeableConcept.
   - value type is Quantity.
   - coded from "Blood pressure panel with all children optional".
   ```

The asserted concept ends up advertising **every shape its consumers
project from it** — the asserted-as-contract pattern. Downstream tools
(emitter, future model viewers, IDE completion) read the asserted's
valuetypes set to know what projections are legal.

Confidence rules apply here too: if a consumer's `(type, valuetype)`
puts the asserted's union outside §5's per-FHIR-type set, flag it.

## Escalation criteria

Stop and ask the operator when:

- The CQL define cannot be found.
- The shape cannot be determined from the body and the chain (e.g. a circular reference).
- The body uses a CQL idiom not in the cue list of Step 2 — do not extrapolate.
- The transformation would produce a `(type, valuetype)` pair outside both the empirical and FHIR-valid sets of §5.
- Two equally plausible interpretations exist (the `classified as` ambiguity is the canonical case).

The cost of a wrong silent transformation is days of audit later. The cost of an escalation is one round-trip with the operator. Always pick the escalation.

## Output for a batch run

When transforming many concepts in one pass, produce:

1. A table of `(concept name, shape, suggested type, suggested valuetype, confidence)` — the operator can review HIGH rows fast and focus attention on MEDIUM/LOW.
2. The edited CRL file(s) reflecting the HIGH-confidence transformations.
3. A separate report of MEDIUM/LOW concepts requiring decision.

## Known corpus

For the current cms69 + cms22 corpus, see §6 of the rule doc for the list of concepts known to need correction. The skill's first batch run is precisely this list.

## Future MCP form

When this skill is lifted into an MCP server, the procedure above becomes the tool implementation, with these tools exposed:

- `transform_cql_define(name: string, cql_text: string) → CrlConcept`
- `transform_cql_library(cql_text: string) → CrlFile`
- `audit_crl_against_cql(crl_text: string, cql_text: string) → AuditReport`

The rule doc is the spec. This skill body is the user-facing prompt that drives the tool. They must stay in sync; the rule doc is the source of truth.
