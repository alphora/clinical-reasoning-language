---
name: cql-to-crl-transformer
description: Transform a CQL define (or a list of defines) into one or more CRL concepts with correct `type is …` and `valuetype is …` declarations per the canonical rule. Use this whenever (a) creating new CRL concepts from existing CQL source, (b) auditing existing CRL concepts for type/valuetype correctness, or (c) the user asks for the "CQL→CRL transformer".
---

# CQL → CRL transformer

This skill is the precursor to the future "CQL/Narrative → CRL transformer" MCP. Its purpose is to take CQL `define` statements as input and produce CRL `concept` declarations with correct `type` and `valuetype`, applying the rule canonicalized in [features/cql-pattern-mining/cql-to-crl-type-valuetype-rule.md](../../../features/cql-pattern-mining/cql-to-crl-type-valuetype-rule.md).

## When to use

- Converting a CQL library into a CRL model for the first time.
- Auditing an existing CRL model against the source CQL (the cms69 / cms22 corpus is the canonical example — see `features/cql-pattern-mining/results/models/`).
- Determining `(type, valuetype)` for any single concept where the answer isn't obvious from the narrative form.

## Required reading before invocation

Read these in full **once** at the start of a session and keep them in mind:

1. The canonical rule: [features/cql-pattern-mining/cql-to-crl-type-valuetype-rule.md](../../../features/cql-pattern-mining/cql-to-crl-type-valuetype-rule.md) — the whole document, especially §1 (core rule), §7 (validator chain check), and §10 (quick checklist).
2. The CRL v0.6 grammar concepts: asserted (`coded from`), composition-typed (`inferred from`), narrative predicate (`logic is`).

## Inputs

The skill works at three granularities. Pick the one that matches the caller's input:

1. **Single CQL define** — text of one define + name → produce one CRL concept declaration.
2. **A CRL concept name + a path to a CQL library** — find the define, then transform it.
3. **A whole CQL library + a target CRL filename** — produce a full CRL file (declarations + bodies).

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

- **Boolean shape** → `type is Observation. valuetype is boolean.` Subject's type is irrelevant.
- **Refinement shape** → identify the subject (first FHIR-resource-bearing thing in the body, traced back to its asserted concept). Inherit BOTH `type` and `valuetype` from the asserted subject. Do not change them.
- **Value-bearing shape** → `type is <source FHIR resource>. valuetype is <primitive>.` (e.g. `type is ServiceRequest. valuetype is dateTime.` for an `authoredOn` extract.)

### Step 4 — Sanity check against §5

Verify the `(type, valuetype)` pair is in the per-FHIR-type allowed set (§5 of the rule doc). If it's outside the observed set but inside the FHIR-valid set, note it as new territory. If outside both, escalate — the answer is probably wrong.

### Step 5 — Output

For each concept, emit:

```
concept "<Name>":
- type is <Type>.
- valuetype is <Valuetype>.
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
