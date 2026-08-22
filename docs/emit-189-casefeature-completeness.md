# #189 — Case-feature COMPLETENESS: gathering every FHIR-required element (T5/T6 design capture)

**Status:** design capture, not yet built. Owned by the T5/T6 CEL-instance / resource-enablement work —
tracker **#290** (enable Procedure / ServiceRequest / MedicationRequest) and the CEL-lane cluster (**#189**).
Read `docs/CRL-NORTH-STAR.md` §4 first; this doc is the detail behind the §4 completeness rule.

## The problem

The #189 2d flip makes a decision case-feature emit the concept's **natural** resource (Condition,
MedicationRequest, …) instead of the forced-Observation hack. But the emitted case-feature
StructureDefinition currently constrains only **coding + subject + recency**. For resources with **required
elements beyond coding**, that produces an **invalid, incomplete** resource:

| Resource | FHIR-required elements (base cardinality `min ≥ 1`) beyond `subject` |
|---|---|
| **MedicationRequest** | `status` (1..1), `intent` (1..1), `medication[x]` (1..1) |
| **ServiceRequest** | `status` (1..1), `intent` (1..1) |
| **Procedure** | `status` (1..1) |
| **Observation** | `status` (1..1) |
| **Condition** | (none required beyond `subject`; `code` is the discriminator) |

If DTR `$extract` builds a MedicationRequest from a case-feature that never gathered `status`/`intent`, the
resource does not validate. **That is the whole point of CRL:** the author writes the declarative minimum
(`type is MedicationRequest.` + `code is X.` + `definition is exists this.`) and the toolchain expands it into
**complete and correct** CQL/FHIR. If we drop the required elements, we've handed the author a broken artifact
— i.e. "just use raw CQL/FHIR," the thing CRL exists to avoid.

## The model: determination vs. gathered record

For a local-code MedicationRequest the user asserts (via `$extract`):

```
action.condition = exists([MedicationRequest: <local code>])     // the boolean determination — what `when` uses
action.input = the MedicationRequest the user asserts:
  - medication[x]  → "what is the medication?"   (the coding; blank → user supplies, may change)
  - status         → "what is the status?"        (REQUIRED — must be gathered)
  - intent         → "what is the intent?"        (REQUIRED — must be gathered)
  - subject        → %resource.subject            (bound)
```

`status` and `intent` are **answered** (gathered from the user, offered a sensible default they can override),
**not**:
- **hardcoded** as inert carriers — that fabricates clinical facts the author never stated;
- **failed closed** — that refuses to emit a resource CRL fully knows how to describe.

The user is asserting a local-domain record, so DTR asks them for its required fields.

## The three-layer architecture (how minimal authoring becomes complete FHIR)

1. **Emitter floor.** Every FHIR-required element gets a fixed per-resource default (MedicationRequest →
   `status = active`, `intent = order`), emitted as `mustSupport` so DTR gathers it and `$extract` **always**
   yields a valid resource. **Buildable now, no grammar** — extend `resourceEmitRegistry` with each resource's
   required-element set + default, and have `caseFeatureDifferential` emit them.
2. **The slot.** An **optional** concept element holding the required-element values. **Human-omittable**
   (the author writes the declarative minimum), **AI-fillable**, **human-overridable**. This is the grammar
   piece — see the open question below.
3. **AI enrichment.** A CRL-authoring-assist step that populates the slot from the concept's **semantic
   meaning** (its name + local code). Separate tool/workflow — **not** the emitter.

### Why AI edits the CRL, never the emit output (the load-bearing point)

The emitter is **deterministic**: it can only emit what the CRL contains (plus the floor default). It cannot
"derive semantics." So for the AI to make emit come out **semantically correct** (e.g. `intent = plan` where
the concept means a planned order, not the generic `order` floor), its judgment must be **persisted into the
CRL** — into the concept's slot the emitter then reads. The AI edits **source**, and the deterministic emitter
does the rest. This is the right division precisely because the enriched CRL is human-readable, diffable,
reviewable, and version-controlled — an AI-edited CQL/FHIR blob is none of those. **AI on the source is
auditable; AI on the output is not.** Without the slot, there is nowhere for the AI's judgment to live but the
output — which is exactly what we must not do.

## Open question — the SLOT's grammar shape (design-panel item, do NOT freehand)

How does a concept carry the required-element values? Candidates:

- **`context is (element is intent, value is order).`** — a general, optional element/value binding list.
  Least invasive to the core grammar; opt-in. Leans "HOW" (raw FHIR-element setting), acceptable *because it
  is AI/optionally-human-filled, not part of the human declarative minimum*.
- **A repeatable semantic line** — e.g. `intent is order.` / `status is active.` on the concept, validator-
  gated to the elements valid for its `type is`.
- **Bound to the local code** — the values live on the code's own definition (defined once where the meaning
  lives), since a local code is 1:1 with its concept.

**Rejected** (both violate "the author declares WHAT; the emitter/AI derives HOW"):
- **Specialize `concept` per kind** (`medicationrequest concept …`, `type is` goes away) — promotes a FHIR
  resource type to the concept's identity, couples the whole authoring model to FHIR, forces the author to
  think in resources, and detonates the uniform `concept` abstraction. Biggest change, most against the
  philosophy.
- **Flat `concept` with every resource's fields, type-gated** — pollutes the core grammar with every
  resource's FHIR elements and makes the author know which resource requires which. Exactly "all this shit a
  human shouldn't need to know."

## Sequencing

1. **Emitter floor** — buildable now against `resourceEmitRegistry`; unblocks a valid `$extract`; no grammar.
2. **Lock** the completeness rule + the human/AI/emitter division into North Star §4 (done alongside this doc).
3. **Design panel** on the slot's grammar shape before writing any grammar.
4. **AI enrichment** workflow — separate, after the slot exists.

Related tracker items: #290 (enable MedicationRequest/ServiceRequest/Procedure), #220 (data-capture case
features: typed values / has-value / terminology binding), #158 (emit SD profiles from declared types), #189
(the CEL-lane instance work whose writer must produce instances that match these profiles).
