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

## Known issues (round-3 reviewer feedback — sweep pending)

The round-3 vibe review surfaced material concerns to address in v0.3.3 / future model refinement passes — recorded in `.vibe-tools/discussions/012-*` (when written). Headline items:

- `Prior-Year Hypertensive Reading` re-anchors `"Hypertensive Reading"` (an encounter-day-bound concept) into a year-prior window via `Within(...)` — semantically suspect. Needs a dedicated `Last BP Panel Within Year Prior` discriminator before `Within(...)` can carry the lookback correctly.
- `BP Measurement Not Done With Reason` misses standalone Systolic / Diastolic cancellation branches (source CQL covers panel + systolic + diastolic).
- `Active("Antihypertensive Medications")` doesn't match the source CQL's `status in {'active', 'completed'}` (catalog `Active` is for currently-relevant Conditions/medications; status-completed orders aren't currently active).
- `Active("Hypertension Diagnoses")` + `OnOrBefore(...onset, ...)` may over-constrain the denominator exclusion vs source CQL's `prevalenceInterval().starts before or on day of encounter`.
- `Within(X, 1 year before start of "Qualifying Encounter")` invents a window-argument shape the catalog `Within` card doesn't formalize — needs a card update or a new `LookbackBefore(X, duration, anchor)` primitive.
- `Verified(X)` in the catalog is framed more strictly than CMS22's local `isVerified()` helper (which allows null / provisional / differential). Card semantics should widen or measure should call out the divergence.
- Per-class followup bundle composition uses `SameDay(intervention, "Qualifying Encounter")` rather than the source CQL's per-encounter `with ... such that ... during day of <reading-class-encounter>.period`. Patient-level-boolean-equivalent for single-encounter patients, but the encounter-binding is implicit through the `Qualifying Encounter` concept rather than per-class.

These are tracked for the round-3 accept/refine/reject sweep + catalog v0.3.3.
