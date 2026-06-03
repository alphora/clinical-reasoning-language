# CRL metadata model

> **Status: vocabulary settled; enforcement pending.** Two design-review rounds complete. The Validator that enforces this spec is not yet implemented (README flags `validateCRL` as a placeholder). The `@tag` convention parses today; enforcement is forthcoming. Canonical registry: [`metadata-registry.json`](./metadata-registry.json).

Captures information *about* a CRL `concept` that lives outside its formal logic — descriptions, knowledge-engineer feedback, plain-language logic, external-store hints, and extraction provenance — so it survives the Knowledge Engineering Lifecycle (KEL) from authoring through to generated FHIR+CQL. (**v1 limit:** metadata attaches to `concept` only; KE feedback on `decision`/`activity`/logic blocks is a known gap pending a future carrier.)

## How it works

Metadata rides the existing repeatable `meta` element as a **string convention** — no grammar change:

```
- meta is `@<tag>: <body>`.
```

The `@tag` (matched `^@([a-z][a-z0-9-]*):`) names a registered type; the rest is the value. A `meta` line **without** a leading `@tag` stays a valid untyped note (back-compatible). The parser treats the whole body as opaque text; the **Validator** enforces tag vocabulary, value shape, cardinality, and malformed-tag detection (see [Validator Requirements](../docs/Validator%20Requirements.md)).

The terminating `.` goes **after** the closing backtick: `` - meta is `...`. `` — not inside it.

## The tags

| Tag | Meaning | Family | Author | Card. |
|---|---|---|---|---|
| `@id` | stable concept identifier; durable metadata keys on `@id` so renames don't orphan tags | B narrative | human | 0..1 |
| `@description` | author's gloss of the object (distinct from `evidence` = verbatim source quote) | B narrative | human | 0..1 |
| `@ke-feedback` | Informaticist→KE note; must reach the KE in generated CQL. Carries `status open\|resolved\|deferred`; only unresolved emits | B narrative | human | 0..n |
| `@logic-expression-text` | **the logic** — the case features / decision points (*what* the logic tests) | B narrative | human/agent | 0..1 |
| `@controlled-natural-language` | **the logic flow** — the order & sequencing in which the logic is applied (*how*) | B narrative | human/agent | 0..1 |
| `@crl-future-expression` | plain-language logic CRL can't express yet; lands in a CQL block comment + feeds the CRL roadmap | B narrative | human/agent | 0..n |
| `@kg-concept` | scored **hint for the decision** — a node in the **Concept Graph** ("KG" = Concept Graph) | A external-ref | agent/human | 0..n |
| `@reef-reference` | scored **hint** for **REEF** ("the great reef"), the downstream artifact repo the CRL→CQL/FHIR skill + compiler consume | A external-ref | agent/human | 0..n |
| `@semantic-parse-text` | semantic parse of the **source narrative** (extraction exhaust) | C provenance | human/agent | 0..n |

`@logic-expression-text` (the logic) and `@controlled-natural-language` (the logic flow) are a complementary pair. `@kg-concept` (Concept Graph) and `@reef-reference` (REEF) are **distinct** stores — both hold scored hints, shaped by the shared `ExternalReference` value type with a `system` discriminator (`kg` / `reef`).

## Example (parse-verified)

```crl
concept "Elderly Patient":
- type is Observation.
- value type is boolean.
- meta is `@description: true when the patient is age 60 or older at the time of evaluation`.
- meta is `@ke-feedback: confirm whether to anchor age on admission vs evaluation date; status open`.
- meta is `@logic-expression-text: the patient is at least 60 years old`.
- meta is `@controlled-natural-language: check the patient's age, then assert elderly when it is at least 60`.
- meta is `@kg-concept: the "elderly" condition; ref kg:condition/elderly; confidence 0.94; status candidate`.
- meta is `@reef-reference: the "age 60 or over" observation; ref reef:obs/age-ge-60; confidence 0.88; status candidate`.
- meta is `@semantic-parse-text: age(patient) >= 60; by agent crl-extractor@2.1.0; run r17`.
- evidence is `Section 3.2 of the source policy`.
- defined as "Patient Age".
```

(Element order is fixed: `type`, `value type`, `meta`*, `evidence`?, then one of `coded from` / `defined as` / `definition is`.)

## Value shapes

**Text tags** — free prose after the colon.

**External-ref tags** (`@kg-concept`, `@reef-reference`) — a display label, then `;`-separated `key value` fields so the Validator never has to guess inside prose:
```crl
- meta is `@kg-concept: the "elderly" condition; ref kg:condition/elderly; confidence 0.94; rank 1; status candidate`.
```
Fields: `ref` (required), `confidence` (decimal `[0,1]`), `rank` (1-based integer, 1 = best), `status` (`candidate|confirmed|rejected|superseded`), `by <author>`.

**Origin / author** (any tag) — a trailing `; by <author>` (human name/id, or `agent <name>@<version>`); optional `; run <id>`, `; at <iso-timestamp>`, `; source <ref>#<hash>`. Omitted = implicit current author.

## Lifecycle — re-run replace rule

Everything lives inline; the `.crl` is the source of truth (no sidecar). Extraction-exhaust — `@semantic-parse-text` and **candidate** external refs — is regenerated each Step-2 run. A new run **replaces** the prior run's such tags for the concept (matched by `by`/`run`). **Confirmed** refs and all durable family-B tags are never auto-replaced. The Validator warns if two distinct `run` ids' exhaust coexist on one concept.

Replace-eligible tags (family-C + candidate external refs) **require** a `run` so the match key is unambiguous — the Validator errors if it's omitted. Refs with `status: rejected` or `status: superseded` are **durable historical records** (preserved across re-runs so negative review work isn't lost).

## Stable identity (recommended)

Metadata is keyed on the concept name by default. To make durable metadata survive renames, attach an optional `@id` and key tags on it. Rename / split / merge handling is a known v1 gap; `@id` is the operator-recommended hedge until a fuller story exists.

## Design decisions (settled)

- **No grammar change** — `@tag` is a string convention; the Validator enforces correctness. (CRL already defers semantics.)
- **`@description` is a meta tag**, not a first-class element (uniform; would otherwise need a grammar change).
- **Everything inline; `.crl` is the source of truth** — no sidecar; staleness handled by the re-run replace rule.
- **KG = the Concept Graph; KG and REEF are distinct stores** — `@kg-concept` hints the decision, `@reef-reference` hints REEF.
- **`@reef-reference` is a hint**, not an authoritative mapping.
- **`confidence`** = decimal in `[0,1]`; **`rank`** = 1-based positive integer.
- **`@logic-expression-text` (the logic) and `@controlled-natural-language` (the logic flow) are distinct**, both durable.

## Best-practice anchors

FHIR extensions (typed value + context + a definition registry); JSON-LD `@type` + local context / JSDoc `@tag` (closest fit: a local registry, not global URLs); W3C PROV (the provenance family).
