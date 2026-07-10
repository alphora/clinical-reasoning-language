# CRL metadata model

> **Status: core stable (v0.2.0); enforcement pending.** The core vocabulary is settled (two design-review rounds); **v0.2.0 adds the review-flag tags** per KE #203 (additive; two further design-review rounds — disc 220). The Validator that enforces this spec is not yet implemented (README flags `validateCRL` as a placeholder). The `@tag` convention parses today (on `concept`); enforcement + the decision/library carrier are forthcoming. Canonical registry: [`metadata-registry.json`](./metadata-registry.json).

Captures information *about* CRL logic that lives outside the formal logic itself — descriptions, knowledge-engineer feedback, plain-language logic, external-store hints, extraction provenance, and **review flags** (the audit trail of deliberate, still-open decisions) — so it survives the Knowledge Engineering Lifecycle (KEL) from authoring through to generated FHIR+CQL. (**Carrier scope:** metadata parses on `concept` today; `decision`/`library` scope is the KE #203 *planned* carrier — a grammar change not yet landed, so decision/library `meta` lines are ParserErrors until then. The registry's `carrier.scope` = what parses; `plannedScope` = the intended expansion.)

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
| `@customer-confirmable` | **review flag** — an EXTERNAL-stakeholder ambiguity resolved provisionally, pending a customer/Burton ruling (`; assumption <x>`) | B narrative | human/agent | 0..n |
| `@internal-inconsistency` | **review flag** (stop-and-flag) — the SOURCE contradicts itself (source-vs-source; distinct from `@fidelity-defect`) | B narrative | human/agent | 0..n |
| `@open-fork` | **review flag** — an INTERNAL modeling fork encoded one way (`; chosen <b>`) but not settled (`; alternatives <…>`) | B narrative | human/agent | 0..n |
| `@fidelity-defect` | **review flag** — a known encoding≠source defect; `; direction over-reach\|criterion-drop` (collapses the KE's two `*-to-fix` tags) | B narrative | human/agent | 0..n |
| `@gap-filed` | a durable POINTER to a filed gap/issue (**not** a review flag — ships fine, no gate); required `; ref <issue>` | B narrative | human | 0..n |

**Emitted to CQL.** The CQL emitter renders exactly the tags with `emit.cql: true` in the registry as a leading block comment on the concept's `define`: `@logic-expression-text`, `@crl-future-expression`, `@ke-feedback`, `@business-logic-deferred`, `@clinical-logic-deferred`, `@cql-comment`. All other tags and untyped notes are not emitted to CQL. Each tagged line keeps its `@tag: body` form in the comment **except** `@cql-comment`, whose prefix is stripped so only the body appears (a verbatim passthrough comment). (`@crl-future-expression` additionally surfaces as a structured `futureExpressions` entry on the emit result.)

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

## Flags (KE #203)

A **flag** (a tag with `flag: true`) marks a problem that **blocks Medical Validation completion while open**. ONE mechanism, two `category` values by origin (see `flagModel` in the registry):

- **`category: review`** — authored by the **AI during narrative → CRL**: source-ambiguity (`@customer-confirmable`), source-self-contradiction (`@internal-inconsistency`), an unsettled modeling fork (`@open-fork`), or encoding-infidelity (`@fidelity-defect{direction}`). A **learning signal**.
- **`category: note`** — authored by a **human during Medical Validation** (a concern raised while validating). Same behavior; the note-flag carrier lands with the MV cockpit surface.

The mechanics (shared):

- **`mvComplete` is the gate:** `mvComplete = (every MV case is pass) ∧ (no OPEN flags)`. Resolved flags do NOT block it. Surfaced in the MV cockpit.
- **Status lifecycle:** `open → resolved` (**open|resolved only** — no `deferred`). MV transitions **open ↔ resolved only** (edits the `.crl` *meta* — metadata-only, never the logic); it **never deletes**. The `resolved → deleted` step belongs to a separate **learning** system (which consumes the resolved flags, extracts the lesson, then removes them — out of scope here). `resolved` persists meanwhile as the learning signal.
- **Warn while open:** an `open` flag raises a Validator **warning** and blocks `mvComplete`. The `warnWhileOpen` marker is **per-tag** (family B also holds non-gating tags like `@ke-feedback`/`@id`).
- **Emit:** an `open` flag emits to CQL — normal meta-tag behavior (a KE sees open work in the generated CQL); a `resolved` flag does **not** emit (noise in the artifact). Emit is orthogonal to `mvComplete`. *(Status-aware emit is a later todo; the registry declares it via `plannedEmit`.)*
- **Transitions in MV:** a warning badge on the tree **start node** while any flag is open → the flag list → an open↔resolved toggle per flag → the cockpit writes the `.crl` meta.
- **Re-add guard:** a source property (e.g. `@internal-inconsistency`) can persist across extraction runs, so a `resolved` tombstone must not be re-opened. An extractor MUST NOT re-add a flag whose `key` (a normalized source-span/hash) matches an existing `resolved` tombstone; correcting the source removes it cleanly. A genuinely-new instance (different `key`) may be added.
- **`@stage-boundary` is intentionally NOT a flag** — "the stage/language can't express this" reuses `@crl-future-expression` (language limit), `@business-logic-deferred` / `@clinical-logic-deferred` (deferred logic), or `@gap-filed` when filed. A near-synonym is the concept-hiding smell.
- **`@gap-filed` is a pointer, not a flag** — it ships fine (managed work tracked in the filed issue), needs a required `; ref <issue>`, and does **not** gate `mvComplete`. Deleted when the CRL no longer depends on the gap.
- **Scope:** flags are `concept`-scoped today; `decision`/`library` is the planned carrier (see the carrier note above).

## Stable identity (recommended)

Metadata is keyed on the concept name by default. To make durable metadata survive renames, attach an optional `@id` and key tags on it. Rename / split / merge handling is a known v1 gap; `@id` is the operator-recommended hedge until a fuller story exists.

## Design decisions (settled)

- **No grammar change *for the `@tag` convention*** — `@tag` is a string convention on the `meta` line; the Validator enforces correctness. (CRL already defers semantics.) NOTE: extending the `meta` *carrier* to new SCOPES (`decision`/`library`, KE #203) IS a grammar change — the anticipated "future carrier", not a reversal of this decision (which was only ever about not needing a new element for concept metadata).
- **Review flags reuse `@ke-feedback`'s status machinery** (open→resolved, resolved-durable, emit-only-while-open) rather than a parallel "presence=open / delete-on-fix" convention — one resolution mechanism, coherent with the registry's retention model (KE #203, disc 220).
- **`@description` is a meta tag**, not a first-class element (uniform; would otherwise need a grammar change).
- **Everything inline; `.crl` is the source of truth** — no sidecar; staleness handled by the re-run replace rule.
- **KG = the Concept Graph; KG and REEF are distinct stores** — `@kg-concept` hints the decision, `@reef-reference` hints REEF.
- **`@reef-reference` is a hint**, not an authoritative mapping.
- **`confidence`** = decimal in `[0,1]`; **`rank`** = 1-based positive integer.
- **`@logic-expression-text` (the logic) and `@controlled-natural-language` (the logic flow) are distinct**, both durable.

## Best-practice anchors

FHIR extensions (typed value + context + a definition registry); JSON-LD `@type` + local context / JSDoc `@tag` (closest fit: a local registry, not global URLs); W3C PROV (the provenance family).
