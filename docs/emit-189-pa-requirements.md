# #189 emit — Prior-Authorization (PA) data requirements

**Status:** requirements capture (operator-directed, 2026-08-22). Authority: `docs/CRL-NORTH-STAR.md` (charter) +
`docs/emit-consistency-189-design.md` (design of record). This doc records WHAT the PA use case requires of the
emit round-trip so the #189 build serves PA correctly and does not paint us into a corner. It does not decide
HOW — that is the design of record and the per-todo plans.

PA is the deep, correct use case (charter §maturity). QM artifacts are a provisional smoke test — do not anchor
scope on them. Where PA and the QM corpus disagree, PA governs.

## The round-trip obligation (charter §1)
The FHIR a case emits (CEL instance lane) MUST satisfy the CQL the same CRL emits (definition lane's retrieves),
and `$extract` from the emitted SDs MUST produce resources that satisfy those same retrieves. Three surfaces,
one invariant: **the coding element a resource is written on = the element the CQL retrieve reads = the element
the SD profiles.** This is what makes emit *representation-consistent*, not merely *loadable*.

## The three needs (operator decomposition, 2026-08-22)

### Need 1 — READ: emit CEL that meets LOCAL code requirements (`code is`)
A CEL fact backed by a LOCAL concept must emit a FHIR instance whose coding is the concept's local domain code
on the resource's natural element, so the local CQL retrieve finds it.
- **Capability target:** ANY declared FHIR resource type.
- **PA today:** Observation only (HCSC constrained deliverable: `code is` + `defined as`, single Observation
  template). **PA-critical.**
- **Coverage today:** NONE. The only `.cel` fixtures are the remote cms22/cms69 corpus; there is no
  local-`code is` CEL instance fixture. (Local `code is` examples exist only on the *definition*/`$extract` side
  — `example-for-emit` MedicationRequest, `dme101-030` Condition — verified 2026-08-22.)
- **Load-bearing consequence:** a local fact carries NO authored code (design §5 conflict rule rejects one);
  coding is **derived from the concept** — `{system: <canonicalBase>/CodeSystem/<domain>-local, code}`. This is
  **derive-local** (design §4). It needs `canonicalBase`, which the CEL emitter does not have today
  (`emitCelToFhir(graph)` takes none — verified). Threading it is mechanical (the CQL/FHIR lanes already take a
  `canonicalBase` param); **#271** is the separate design-q about making it required / the composition rule, NOT
  a hard blocker. Because valid local-coded CEL instances are what let KE `$apply`-test PA's local Observation
  logic, **derive-local is on the PA-testing critical path** — in scope, not deferrable.

### Need 2 — READ: emit CEL that meets REMOTE code requirements (representation / `coded from`)
A CEL fact backed by a REMOTE (`coded from`) concept emits a FHIR instance whose coding is the AUTHORED external
code on the resource's natural element, so the external-lane CQL retrieve finds it.
- **Capability target:** ANY declared FHIR resource type.
- **PA today:** Patient + ServiceRequest. **PA-critical.**
- **Coverage today:** the cms22/cms69 corpus exercises this (all remote), and it mostly works — remote
  ServiceRequest codes on `.code` (correct), Patient via its own subject path. **But element-placement is wrong
  for non-`.code` resources:** the Encounter golden emits an invalid top-level `.code`; its code belongs on
  `Encounter.type[]`, which is exactly what the emitted `[Encounter: …]` retrieve reads (verified
  `Cms22RecordSource.cql:12,15`). Fixing element placement is an in-scope **correctness** fix, NOT the deferred
  work.
- **What §10 DEFERS (not this effort):** the full remote MODEL — external-ValueSet membership *validation* and
  selective-representation keying (#257). Basic remote *emission* is not deferred.

### Need 3 — CREATE: `$extract` produces FHIR resources from CRL SDs
The DTR/questionnaire runtime fills a case-feature questionnaire and `$extract` creates the resource the SD
profiles. This is the definition lane 2d built (SD + `action.input` typed by the natural resource).
- **Capability target:** ANY declared FHIR resource type.
- **PD.condition (the decision's boolean):** references only BOOLEAN-valued concepts, so
  `PlanDefinition.condition` works (charter decision-no-opaque-boolean). Today the boolean lowers via an
  Observation-`exists` shape; that MAY be permanently correct, but must not be hard-wired such that a
  non-Observation condition path is impossible. **Do not paint into a corner.**
- **PD.input (the case-features that CONSTRUCT the boolean):** a boolean concept may be built from
  non-boolean-valued FHIR resource types; each emits to `PlanDefinition.action.input` via its LOCAL `code is` +
  its natural-resource SD. **PA use unknown → implement as broadly as reasonable.** (2d shipped this for the 5
  registry resources.)
- **Required fields → additional questions:** a `$extract`ed resource must be VALID (e.g. MedicationRequest
  needs `status`+`intent`; Encounter needs `status`+`class`). The decided model: required fields the concept
  does not supply become ADDITIONAL QUESTIONS (emitter floor default + optional concept slot + AI enrichment of
  the SOURCE, never the emit output). Designed (`docs/emit-189-casefeature-completeness.md`, North Star §4), not
  yet implemented — **#290 follow-on.** PA-relevant for any non-Observation `$extract` target.

## The single per-resource authority (registry shape A′)
One `RESOURCE_EMIT_REGISTRY` serves all three needs; rows carry a capability/lane marker. Definition-lane
consumers (`caseFeatureProfileShape`, descriptor derivation) honor only case-feature-proven rows; the CEL writer
(both read lanes) honors all. This avoids a second write table that could drift from the retrieve invariant
(the T2 header's stated purpose). Adding a resource = one row, consulted by every surface — the anti-corner
property PA requires. (Design panel disc 486, A′ over a two-map split.)

## Scope rule for this effort (operator, 2026-08-22)
Capture PA requirements (this doc); get the whole set done as much as **reasonable**; defer only what is BOTH
unreasonably large AND not-PA. **"Reasonable" is NOT "minimal-for-PA."** Collapsing each requirement to the
single resource PA happens to use today (Observation) is dangerous: it lets ONE option masquerade as THE
capability, so the code overfits to that option's shape and the generality is a fiction. **Guard: at least TWO
examples of every requirement, chosen to span the dimensions where overfit hides** (see the example matrix
below). Local non-Observation is therefore NOT a deferrable tail — it is the *required second example* that
proves the local lane is resource-general.

| Piece | PA? | In this effort? |
|---|---|---|
| Local **Observation** CEL read (derive-local + canonicalBase threading) | ✅ PA | **In** |
| Local **MedicationRequest** CEL read (required 2nd example: choice `medication[x]`, valueless) | anti-overfit | **In** |
| Remote **Patient + ServiceRequest** CEL read (element placement) | ✅ PA | **In** |
| Remote **Encounter** element placement (`.code`→`type[]`, array strategy) | required 2nd/3rd example | **In** |
| Dispatch-by-resolved-role; value-legality (no typeof-sniffing); case-atomic; replace `applyDateField` | infra for all | **In** |
| Category-3 activity-instance write rule (Task/CommunicationRequest via `CPG_TO_FHIR`) | infra | **T4** — must name **CommunicationRequest + ImmunizationRecommendation** (both no R4 `.code`; live `CPG_TO_FHIR` targets); the `.code` fallback must not survive the flip (disc 488) |
| `$extract` PD.input across ≥2 coding strategies (2d shipped 5 resources) | ✅ | **Done (2d) — assert coverage** |
| `$extract` PD.condition not Observation-locked (≥1 non-Observation-expressible path) | anti-corner | **In** (assertion/guard) |
| `$extract` required-field completeness (additional questions) | ✅ PA (non-Obs targets) | Designed; **#290 follow-on** |
| Full remote model: external-VS validation, selective-rep keying | ✗ | **Deferred #257 (§10)** |
| `#271` canonicalBase-required (composition rule) | related | separable design-q; thread the value now |

## Example matrix — ≥2 per capability dimension (the anti-overfit artifact)
The point of two examples is to hit DISTINCT cells, not to duplicate one shape. The dimensions where "one
option = the capability" hides:

| Dimension | Cell A | Cell B | Cell C |
|---|---|---|---|
| **Coding strategy** | plain `.code` (Observation, Condition, ServiceRequest) | choice `medication[x]` (MedicationRequest) | array `type[]` (Encounter) |
| **Value axis** | value-bearing (Observation) | valueless / `exists` (Condition, MedicationRequest, ServiceRequest) | — |
| **Representation** | local `code is` → derive-local | remote `coded from` → authored code | — |
| **Recency access** | choice `effective[x]`/`performed[x]` (cast dateTime) | plain `authoredOn`/`recordedDate` (cast none) | nested `period.start` (Encounter) |

Concrete fixture set to author/assert (each cell covered ≥ twice across the set):
- **Local read:** Observation (plain, value-bearing, `effective[x]`) **and** MedicationRequest (choice,
  valueless, `authoredOn`). Optionally Condition (plain, valueless, `recordedDate`) as a third local cell.
- **Remote read:** ServiceRequest (plain) **and** Encounter (array `type[]`, `period.start`) **and** Patient
  (subject path). The existing cms22/cms69 corpus supplies remote plain/array coverage.
- **`$extract`:** 2d already emits SDs + `action.input` across Observation/Condition/Procedure/ServiceRequest/
  MedicationRequest — assert this spans ≥2 coding strategies; add a guard that PD.condition is not structurally
  Observation-locked.

## What "don't paint into a corner" means concretely
- Registry is one table + capability marker → a new resource is one row, honored by every surface.
- PD.condition's Observation-`exists` shape must be a *chosen lowering*, not an assumption baked so deep a
  non-Observation boolean condition is unreachable.
- Coding element per resource lives in ONE place (the registry), never re-switched per lane.
- Required-field completeness is additive (additional questions), never a hardcoded per-resource field list.
