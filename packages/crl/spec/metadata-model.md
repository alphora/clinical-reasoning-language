# CRL metadata model

> **Status: core stable; enforcement + status-aware emit LIVE (core).** The core vocabulary is settled (two design-review rounds); CQL emit is **status-aware** (a tag emits iff `emit.cql:true` AND its status ∉ `emit.suppressWhenStatus`). **Enforcement (#154):** `validateCRL` enforces the registry rules — vocabulary (malformed/unknown `@tag` → warning), field shape (required/enum/duplicate), and cardinality — via `MetaTagValidator` reading the compile-time-inlined registry; the `@tag` carrier parses on `concept`, `decision`, and `library`. **⚠ Review FLAGS left this model in #212 step 4b** — they are no longer `.crl` meta tags; they live as `medical-validation/flags/<id>.json` store records (vocabulary in [`flags/flagVocab.ts`](../src/flags/flagVocab.ts)); the `.crl`-meta open-flag warning is gone and the MV gate reads the flag store. **Remainder (#154 follow-up):** the family-C extraction-exhaust rules (`run`-required, re-run staleness) + re-add detection. Canonical registry: [`metadata-registry.json`](./metadata-registry.json).

Captures information *about* CRL logic that lives outside the formal logic itself — descriptions, knowledge-engineer feedback, plain-language logic, external-store hints, and extraction provenance — so it survives the Knowledge Engineering Lifecycle (KEL) from authoring through to generated FHIR+CQL. (Review FLAGS were once carried here too; as of #212/#230 they are a `medical-validation/flags/` store, not a meta tag.) (**Carrier scope:** metadata parses on `concept`, `decision`, and `library` (KE #203 Todo 2 — the grammar change landed). The registry's `carrier.scope` lists all three.)

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
| `@logic-expression-text` | **the logic** — the case features / decision points (*what* the logic tests); lands in a CQL block comment | B narrative | human/agent | 0..1 |
| `@controlled-natural-language` | **the logic flow** — the order & sequencing in which the logic is applied (*how*) | B narrative | human/agent | 0..1 |
| `@crl-future-expression` | plain-language logic CRL can't express yet; lands in a CQL block comment + feeds the CRL roadmap | B narrative | human/agent | 0..n |
| `@business-logic-deferred` | business logic intentionally not yet implemented; lands in a CQL block comment as a tracked gap | B narrative | human/agent | 0..n |
| `@clinical-logic-deferred` | clinical decision logic intentionally not yet implemented; lands in a CQL block comment as a tracked gap | B narrative | human/agent | 0..n |
| `@cql-comment` | verbatim author comment to carry into the generated CQL; the `@cql-comment:` prefix is stripped — only the body appears | B narrative | human/agent | 0..n |
| `@kg-concept` | scored **hint for the decision** — a node in the **Concept Graph** ("KG" = Concept Graph) | A external-ref | agent/human | 0..n |
| `@reef-reference` | scored **hint** for **REEF** ("the great reef"), the downstream artifact repo the CRL→CQL/FHIR skill + compiler consume | A external-ref | agent/human | 0..n |
| `@semantic-parse-text` | semantic parse of the **source narrative** (extraction exhaust) | C provenance | human/agent | 0..n |
| `@gap-filed` | a durable POINTER to a filed gap/issue (**not** a flag — ships fine, no gate); required `; ref <issue>` | B narrative | human | 0..n |

> **Review FLAGS are no longer `.crl` meta tags (#212 step 4b).** The former flag tags — `@customer-confirmable`, `@internal-inconsistency`, `@open-fork`, `@fidelity-defect`, `@validation-concern` — left this registry; they are authored as `medical-validation/flags/<id>.json` store records (via the `create_flag`/`set_flag_status` MCP tools), with their vocabulary in [`flags/flagVocab.ts`](../src/flags/flagVocab.ts). Writing one of those tags as a `.crl` meta line now yields a `meta-unknown-tag` warning and does NOT gate Medical Validation. `@gap-filed` (a non-flag pointer) stays a `.crl` meta tag.

**Emitted to CQL.** The CQL emitter renders the tags with `emit.cql: true` in the registry as a leading block comment on the concept's `define`: the narrative/deferred tags `@logic-expression-text`, `@crl-future-expression`, `@ke-feedback`, `@business-logic-deferred`, `@clinical-logic-deferred`, `@cql-comment`. Emit is **status-aware** (Todo 5): a tag whose registry `emit.suppressWhenStatus` includes the line's status is NOT emitted — so a `resolved` `@ke-feedback` is suppressed while `open`/`deferred`/absent emits. All other tags and untyped notes are not emitted to CQL. Each tagged line keeps its full `@tag: body; …fields` form in the comment (the RAW line) **except** `@cql-comment`, whose prefix is stripped so only the body appears. (`@crl-future-expression` additionally surfaces as a structured `futureExpressions` entry on the emit result.) (Review flags no longer emit — they left the registry; the flag store is their home.)

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

All `.crl` **meta tags** live inline; the `.crl` is their source of truth (no sidecar). (Review flags are the exception — they moved to the `medical-validation/flags/` store in #212/#230; see the relocation section above.) Extraction-exhaust — `@semantic-parse-text` and **candidate** external refs — is regenerated each Step-2 run. A new run **replaces** the prior run's such tags for the concept (matched by `by`/`run`). **Confirmed** refs and all durable family-B tags are never auto-replaced. The Validator warns if two distinct `run` ids' exhaust coexist on one concept.

Replace-eligible tags (family-C + candidate external refs) **require** a `run` so the match key is unambiguous — the Validator errors if it's omitted. Refs with `status: rejected` or `status: superseded` are **durable historical records** (preserved across re-runs so negative review work isn't lost).

## Review flags → the `medical-validation/flags/` store (#212, relocated in #230)

Review flags were once carried here as `.crl` meta tags with `flag: true`. As of **#212 they left the `.crl` model entirely** and live as first-class **store records**; **#230 relocated the store** from the untracked artifact root (`<artifactRoot>/.crl/flags/`, outside every KELP entity → never captured by `kelp save`, left the worktree dirty) into the tracked `medical-validation` entity, at `<policySrc>/medical-validation/flags/<id>.json` — beside the MV sidecar, so `kelp save medical-validation` captures the records on the artifact branch:

- **Vocabulary + validation:** [`flags/flagVocab.ts`](../src/flags/flagVocab.ts) (the five concern types + their field rules/aliases/enums/categories + the pure draft validator) — moved OUT of this registry.
- **Record model + store:** [`flags/mvFlag.ts`](../src/flags/mvFlag.ts) + [`flags/mvFlagStore.ts`](../src/flags/mvFlagStore.ts) (a self-describing `MvFlag` record with an anchor; per-flag JSON under `medical-validation/flags/`).
- **Authoring:** the `create_flag` / `set_flag_status` MCP tools WRITE the store (they require a `path` and do NOT rewrite `.crl` source). The MV cockpit's Add-flag drawer routes through the same seam (`validateAndBuildMvFlagDraft`).
- **The `mvComplete` gate** reads the flag store (open flags block), not `.crl` meta. Writing a former flag tag as a `.crl` meta line now yields a `meta-unknown-tag` warning and does NOT gate.

The concern taxonomy (extraction vs validation reference point; the four extraction types + `@validation-concern`) is unchanged in meaning — it just lives in `flagVocab`, not here. `@gap-filed` (a non-flag pointer, required `; ref`, no gate) remains a `.crl` meta tag in this model.

## Stable identity (recommended)

Metadata is keyed on the concept name by default. To make durable metadata survive renames, attach an optional `@id` and key tags on it. Rename / split / merge handling is a known v1 gap; `@id` is the operator-recommended hedge until a fuller story exists.

## Design decisions (settled)

- **No grammar change *for the `@tag` convention*** — `@tag` is a string convention on the `meta` line; the Validator enforces correctness. (CRL already defers semantics.) NOTE: extending the `meta` *carrier* to new SCOPES (`decision`/`library`, KE #203) IS a grammar change — the anticipated "future carrier", not a reversal of this decision (which was only ever about not needing a new element for concept metadata).
- **Review flags relocated to a `medical-validation/flags/` store (#212, #230)** — originally they reused `@ke-feedback`'s status machinery as `.crl` meta tags (open→resolved, resolved-durable); as the model matured they became first-class store records (a self-describing `MvFlag`), decoupling the audit trail from `.crl` source (#212); #230 then moved the store into the tracked `medical-validation` entity so `kelp save` captures it. See the relocation section above.
- **`@description` is a meta tag**, not a first-class element (uniform; would otherwise need a grammar change).
- **Meta tags are inline; `.crl` is their source of truth** — no sidecar for meta; staleness handled by the re-run replace rule. (Review flags are the exception — a `medical-validation/flags/` store, #212/#230.)
- **KG = the Concept Graph; KG and REEF are distinct stores** — `@kg-concept` hints the decision, `@reef-reference` hints REEF.
- **`@reef-reference` is a hint**, not an authoritative mapping.
- **`confidence`** = decimal in `[0,1]`; **`rank`** = 1-based positive integer.
- **`@logic-expression-text` (the logic) and `@controlled-natural-language` (the logic flow) are distinct**, both durable.

## Best-practice anchors

FHIR extensions (typed value + context + a definition registry); JSON-LD `@type` + local context / JSDoc `@tag` (closest fit: a local registry, not global URLs); W3C PROV (the provenance family).
