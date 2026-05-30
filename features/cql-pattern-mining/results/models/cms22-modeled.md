# Modeling CMS22 in CRL

> **Exercise:** model `CMS22FHIRPCSBPScreeningFollowUp` — BP screening and follow-up — in CRL using the v0.3.2 inference-pattern catalog. The cross-domain check after CMS69 BMI: same screening + follow-up shape, different measure domain. Source CQL: `features/cql-pattern-mining/data/cql/dqm-content-qicore-2025/CMS22FHIRPCSBPScreeningFollowUp.cql`. Resulting CRL: `cms22.crl` (this folder).

## Shape differences vs CMS69

- **Panel observation with components.** BP is a panel with Systolic + Diastolic components; BMI was a single observation. This surfaced a catalog gap.
- **Five-class numerator.** Normal / Elevated / First HTN / Second HTN 130s / Second HTN 140+, each with its own intervention bundle. CMS69 had three (High / Low / Normal).
- **Year-prior lookback.** "Second hypertensive reading" requires a prior reading within the year before the qualifying encounter. CMS69 had no equivalent lookback.
- **Two parallel exception families.** BP-measurement-not-done (Medical Reason OR Patient Declined) + per-class HTN-followup-declined-by-patient. Each per-class declined bundle mirrors the per-class followup bundle, with `NotDoneWithReason` leaves substituted for `WasOrdered` leaves.

## Idioms applied

- **Concept-based negation** (already in v0.3): `not "Virtual Encounters"` to express "encounter class ≠ virtual".
- **Concept-based projection** (new in v0.3.2): discriminator concepts (`Systolic Blood Pressure Code`, `Diastolic Blood Pressure Code`) at the Asserted layer wrap the component-identifying code; `Component(panel, discriminator)` at the Inferred layer projects the value. Sister idiom to concept-based negation — both keep property/code access out of pattern bodies, at the concept layer.
- **Justification + ordered**: referrals use `Justified(action, reason) and WasOrdered(action)` to encode "ordered, with hypertensive-reading reason code."

## Catalog deltas surfaced (v0.3.2)

- `Component(panel, discriminator)` — added to Calculation. See catalog v0.3.2 header.
- `Between(value, lo, hi)` — added to Calculation alongside `AtLeast`/`AtMost`/`Exceeds`/`Below`, used for closed-range BP bucketing (`120-129`, `130-139`, `80-89`).

## Round-3 reviewer-feedback sweep — resolved + deferred

The round-3 vibe review surfaced ~30 distinct points across `ask_gpt55`, `ask_gemini`, and the Claude sub-agent. Detailed transcript: `.vibe-tools/discussions/012-cms22-round3-sweep.md` (local). Headline outcomes:

### Applied to cms22.crl

- **Prior-Year Hypertensive Reading re-anchored correctly.** Added `Last BP Panel Within Year Prior to Qualifying Encounter` + `Prior-Year Last Systolic` / `Prior-Year Last Diastolic` projections; redefined `Prior-Year Hypertensive Reading` against those. No longer re-anchors the encounter-day-bound concept.
- **BP Measurement Not Done expanded** to a union: `BP Measurement Sources = Blood Pressure Panels or Standalone Systolic BP Observations or Standalone Diastolic BP Observations`. Added two new Asserted leaves for the standalone observation retrievals.
- **Denominator-exclusion driver fixed.** Renamed concept `Verified Hypertension Established By Qualifying Encounter`; dropped the `Active(...)` over-constraint; switched property reference from `.onset` (raw FHIR) to `.prevalenceStart` (clinically-canonical, emitter resolves to `prevalenceInterval().starts`).
- **`Active(...)` dropped from Antihypertensive Medication Order pattern** — the bundle-level `SameDay(med, "Qualifying Encounter")` already anchors the medication; `Active` was redundant + semantically wrong (status active/completed isn't catalog-`Active`).
- **Age anchor fixed.** `Aged 18+ at Qualifying Encounter` → `Aged 18+ at Measurement Period Start`, with `AtLeast(AgeAt(start of "Measurement Period"), 18 years)` matching source CQL.
- **Normal BP Numerator wrapper dropped.** Numerator now references `Normal BP Reading` directly.
- **Denominator type aligned** Observation → Encounter (matches cms69 typing; reflects per-encounter measure semantics).

### Applied to cms69.crl

- **Age anchor parity** with cms22: renamed concept + measurement-period-start anchor.

### Applied to catalog v0.3.3

- **`Within(X, window)` re-tiered** from Qualification → Contextualization (sister to `AsOf`; relates evidence to a clinically-named anchor). Window argument grammar formalized: named period OR anchor-anchored offset of the form `<duration> before|after start|end of <anchor>`. Hallucinated example (`Follow up with Rescreen Within 6 Months` — actually a valueset name, not a `Within` use) replaced with `Prior-Year Hypertensive Reading`.
- **`Component(panel, discriminator)` re-tiered** from Calculation → Contextualization. Idiom note clarifies the discriminator concept is type-degenerate (a naming wrapper for a code, not a retrieve like the panel/observation sources).
- **`Verified(X)` semantics widened** to allow measure-defined acceptable sets including null/provisional/differential (matches CMS22's local `isVerified()`).
- **`NotDoneWithReason` card** now notes the `reason` parameter accepts a disjunction of valuesets, and the pattern generalizes across action-resource families (Observation/ServiceRequest/MedicationRequest) — emitter resolves the resource-specific not-done-reason property.
- **`Between(value, lo, hi)` card** explicitly notes closed-vs-half-open: half-open ranges (e.g., `Interval[1, 120)`) decompose to `AtLeast`/`Below`. Don't widen `Between`.
- **Property-access policy subsection added.** Documents `<concept>.<property>` grammar in pattern bodies; clinically-canonical names (`.prevalenceStart`, `.authoredOn`, `.value`); WHAT-vs-HOW principle; lift implementation-leaky property accesses into concepts via the `Component` idiom.
- **v0.3.2 header line softened** — "confirmed without changes" replaced with explicit acknowledgment of tensions for `Within`, `Active`, `NotDoneWithReason`.

### Refined (documented; not changed in code)

- **Followup-bundle encounter-binding leak.** Per-class bundles anchor interventions to the universal `Qualifying Encounter` via `SameDay`, not to the specific encounter that produced the reading class. Patient-level-boolean-equivalent for single-encounter patients; for multi-encounter patients, theoretically allows cross-encounter same-day matching. Fixing this requires introducing per-class qualifying-encounter concepts (a model refactor). Deferred.
- **Status filtering abstracted to the emitter.** Source CQL filters BP observations by `status in {final, amended, corrected}` and excludes zero/negative values; CRL doesn't. Intentional — data-validity filtering is an emitter concern, not a clinical-assertion concern.
- **Antihypertensive Medication Declined over-strict vs source CQL.** Source's `MedicationNotRequested` branch only checks `status in {active, completed}`, not `reasonRefused in "Patient Declined"`. CRL adds the patient-declined constraint (since the source's parent define is titled "Order for Hypertension Follow Up Declined by Patient"). The CRL is a clinical-intent reading; the source has an irregularity here.
- **CMS22 bundle-layer temporal anchoring vs CMS69 down-in-intervention anchoring** — two valid styles. CMS22 lifts temporal anchoring to the bundle layer (`SameDay(intervention-concept, encounter)`); CMS69 pushes it down inside each intervention concept (`OnOrBefore(...) and During(...)` in the `apply pattern`). The catalog doesn't prescribe one over the other. Bundle-layer is more compositional (intervention concepts are reusable); down-in-intervention is more self-contained.

### Rejected

- **gemini #7 — Body concepts redundant.** The `Second Hypertensive Reading 130s Body` / `... 140+ Body` concepts are required because `inferred from (X and Y) + apply pattern` doesn't compose syntactically in CRL (the Body holds the pattern-bearing definition; the outer concept does the AND composition).
- **gpt55 #9 — Public interface types should be Encounter.** Per earlier operator adjudication, IP and Numerator are typed boolean Observation; the CQL emitter handles encounter-level materialization. Denominator type aligned to Encounter per cms69 parity, but IP/Numerator kept per operator direction.
