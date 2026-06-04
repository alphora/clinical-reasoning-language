# CRL ↔ CPG IG Alignment

**Canonical reference for how CRL and CEL declarations map onto the [CPG IG (cqf-recommendations)](https://build.fhir.org/ig/HL7/cqf-recommendations/) profile families.** Captures the verified facts and the design rationale so future authors / contributors / reviewers don't need to repeat the IG verification dance.

**Status:** locked as of 2026-06-04. The mapping is intentionally narrow: CRL is the definitional side, CEL is the instance side, and the IG provides the canonical resource shapes both sides target.

## The CPG IG Activity Profiles table

The IG's [Activity Profiles section](https://build.fhir.org/ig/HL7/cqf-recommendations/en/profiles.html#activity-profiles) lays out four columns per clinical activity (Send a message, Order a medication, Collect information, …):

| IG column | Meaning | CRL/CEL counterpart |
|---|---|---|
| **Activity** | Human-readable label (e.g. "Send a message"). | The CRL `activity "X":` declaration name (author chooses). |
| **Definition** | The `ActivityDefinition` profile (`cpg-<lowercase>activity`). This is the recommendation logic — what the CDS engine knows about. | The FHIR resource emitted by the CRL → FHIR-def emit lane (issue [#73](https://github.com/alphora/clinical-reasoning-language/issues/73)) for each CRL `activity` declaration. |
| **Request** | The Request-pattern profile representing the proposed/ordered resource (e.g. `CPGServiceRequest`, `CPGMedicationRequest`, `CPGQuestionnaireTask`). | The CRL `activity "X": - request CPG<Type>.` token names THIS column (with the `Task` suffix dropped — see convention below). Also reachable as a CRL `concept "X": - type is <BaseResource>.` when authors want to name a specific Request-pattern data point. |
| **Event** | The Event-pattern profile representing what actually happened when the recommendation was applied (e.g. `CPGCommunication`, `CPGImmunization`, `CPGProcedure`, `CPGObservation`). | A CRL `concept "X": - type is <BaseResource>.` representing an observed event. Same `concept` declaration kind as the Request side; the `type is` value differentiates. |

So:
- CRL `activity` = IG Definition column (when emitted as FHIR).
- CRL `concept` covers BOTH the Request column AND the Event column. The `- type is X.` value picks the side.
- CRL `terminology` corresponds to IG `ValueSet` profiles (cpg-shareableValueSet etc. — Todo 1 of the FHIR-def emit lane closed this).
- CRL `decision` corresponds to IG `PlanDefinition` profiles (`cpg-strategydefinition` etc. — Todo 3 of the FHIR-def emit lane).

## The CRL `request CPG<Type>` convention

**Token name = IG Request-column profile name minus the `Task` suffix where present.**

This is the rule. Every CRL `request CPG<Type>` token references a specific Request-column profile. Most of the IG's Request-column profiles are named `CPG<Resource>Task` (because they extend the FHIR Task pattern). The CRL convention drops the suffix because the `request` keyword and the wider CRL idiom (`activity "X": - request CPGFoo.`) already convey the request semantics; the `Task` suffix is just FHIR plumbing.

### Verified token ↔ IG profile mapping

Each row was verified against the source FSH in `HL7/cqf-recommendations/input/fsh/profiles/activity-profiles/` on 2026-06-04. The Definition column profile fixes `kind`, `intent`, `code`, `profile`, `doNotPerform` per the IG (relevant for the FHIR-def emit lane, Todo 2).

| CRL token | IG Definition profile (Id) | IG Request profile | FHIR resource (`kind`) | IG activity-type code (`cpg-activity-type-cs`) |
|---|---|---|---|---|
| `CPGServiceRequest` | `cpg-servicerequestactivity` | `CPGServiceRequest` | `ServiceRequest` | `order-service` |
| `CPGMedicationRequest` | `cpg-medicationrequestactivity` | `CPGMedicationRequest` | `MedicationRequest` | `order-medication` |
| `CPGImmunizationRequest` | `cpg-immunizationactivity` | `CPGImmunizationRequest` | `MedicationRequest` ⚠️ | `recommend-immunization` |
| `CPGCommunicationRequest` | `cpg-communicationactivity` | `CPGCommunicationRequest` | `CommunicationRequest` | `send-message` |
| `CPGQuestionnaire` | `cpg-collectinformationactivity` | `CPGQuestionnaireTask` | `Task` | `collect-information` |
| `CPGEnrollment` | `cpg-enrollmentactivity` | `CPGEnrollmentTask` | `Task` | `enrollment` |
| `CPGProposeDiagnosis` | `cpg-proposediagnosisactivity` | `CPGProposeDiagnosisTask` | `Task` | `propose-diagnosis` |
| `CPGRecordDetectedIssue` | `cpg-recorddetectedissueactivity` | `CPGRecordDetectedIssueTask` | `Task` | `record-detected-issue` |
| `CPGRecordInference` | `cpg-recordinferenceactivity` | `CPGRecordInferenceTask` | `Task` | `record-inference` |
| `CPGReportFlag` | `cpg-reportflagactivity` | `CPGReportFlagTask` | `Task` | `report-flag` |
| `CPGGenerateReport` | `cpg-generatereportactivity` | `CPGGenerateReportTask` | `Task` | `generate-report` |
| `CPGDispenseMedication` | `cpg-dispensemedicationactivity` | `CPGDispenseMedicationTask` | `Task` | `dispense-medication` |
| `CPGDocumentMedication` | `cpg-documentmedicationactivity` | `CPGDocumentMedicationTask` | `Task` | `document-medication` |
| `CPGAdministerMedication` | `cpg-administermedicationactivity` | `CPGAdministerMedicationTask` | `Task` | `administer-medication` |

⚠️ note for `CPGImmunizationRequest`: the IG models an immunization recommendation as a `MedicationRequest` (not `ImmunizationRequest`) — the CRL grammar token name and the FHIR resource kind diverge here, but the mapping is verified against the IG FSH.

### Canonical URL form

For both the Definition and Request profiles, the canonical URL is `http://hl7.org/fhir/uv/cpg/StructureDefinition/<Id>`. **The Id has NO hyphen before "activity"** even though the source FSH filename in the IG repo does (`cpg-servicerequest-activity.fsh` → `Id: cpg-servicerequestactivity`).

### Profiles intentionally NOT in CRL today

The IG defines three additional activity profiles the CRL grammar deliberately omits:

| IG profile | Why CRL omits |
|---|---|
| `CPGStopActivity` | Workflow-state transitions don't fit CRL's declarative recommendation idiom. May fold into a future workflow declaration kind; not in scope for v2.x. |
| `CPGHoldActivity` | Same as Stop. |
| `CPGResumeActivity` (FSH filename is `cpg-resume-activity.fsh`, Definition column shows `CPGResumeTask` which is inconsistent in the IG itself) | Same as Stop. |

## The CRL `concept - type is X.` allowlist ↔ IG Request/Event resources

Every base FHIR resource referenced by an IG Request or Event profile is in CRL's `CONCEPT_TYPE` allowlist (with three exceptions modeled by other declaration kinds — see below). The allowlist source of truth is the `CONCEPT_TYPE` lexer rule in [`src/grammar/CRLLexer.g4`](src/grammar/CRLLexer.g4); a build-time gate verifies `parameterTypes ⊇ conceptTypes ∪ conceptValueTypes`.

### Resources covered

**Request-pattern resources** (IG Request column references):
- `MedicationRequest`, `CommunicationRequest`, `ServiceRequest`, `NutritionOrder`, `Task`

**Event-pattern resources** (IG Event column references):
- `Communication`, `Condition`, `DetectedIssue`, `Encounter`, `EpisodeOfCare`, `Flag`, `Immunization`, `MedicationAdministration`, `MedicationDispense`, `MedicationStatement`, `NutritionIntake`, `Observation`, `Procedure`, `QuestionnaireResponse`, `DiagnosticReport`, `AdverseEvent`, `AllergyIntolerance`, `ClinicalImpression`, `FamilyMemberHistory`, `RiskAssessment`

**Subject/contextual resources** (referenced by CRL concepts but not strictly Request or Event):
- `Patient`, `Device`, `DocumentReference`, `Goal`

### Transitively covers CEL `fact` declarations too

CEL's validator imports the same `conceptTypes` allowlist ([`src/cel/validator/validator.ts:1`](../src/cel/validator/validator.ts#L1)) and applies it to two `defined by` resolution paths:

- **Bare `defined by "X"`** — `X` must be in `conceptTypes`. The fact instantiates that bare FHIR resource type directly.
- **Qualified `defined by "Lib"."Decl"`** — resolves via the qualified CRL concept's `- type is X.`, which is itself from `conceptTypes`.

So **every CEL fact transitively lands on a FHIR resource from the same allowlist that covers both Request and Event patterns.** The split is:
- CRL `concept` = definitional side (the clinical data point's schema).
- CEL `fact` = instance side (a specific data point realization for a test case).
- Both kinds of declaration name resources from the same `conceptTypes` shared module.

This is what gives CRL+CEL the symmetric "Request-and-Event coverage" the IG envisions — neither DSL needs a separate notion of "request-concept" vs "event-concept"; the FHIR resource type the declaration names is the discriminator.

### IG Event-column resources intentionally NOT in `CONCEPT_TYPE`

Three IG Event profiles' base resources are deliberately absent from the concept-type allowlist because CRL plans to model them via dedicated top-level declaration kinds:

| IG Event profile | Base FHIR resource | Planned CRL declaration kind | Status |
|---|---|---|---|
| `CPGMetricReport` | `MeasureReport` | `metric "X":` | Backlog ([`tmp/backlog-scratch-pad.md`](../tmp/backlog-scratch-pad.md) "add metric" section) |
| `CPGCaseSummary`, `CPGCasePlanSummary`, `CPGCasePlanProgressingNote` | `Composition` | `summary "X":` | Backlog (same scratch pad, "add summary" section) |
| `CPGCase` | `EpisodeOfCare` | `concept - type is EpisodeOfCare.` | **Live (2026-06-04)** — added in the same change as this doc. |

`EpisodeOfCare` was added to `CONCEPT_TYPE` rather than a dedicated declaration kind because `CPGCase` doesn't introduce the cross-cutting `based on` / `collects` semantics that justify the `metric` and `summary` kinds — it's just another resource type concepts can name.

## Adding a new resource type to `CONCEPT_TYPE`

When the IG adds a new activity profile (or the operator wants to add a resource that wasn't in the original allowlist):

1. Edit [`src/grammar/CRLLexer.g4`](src/grammar/CRLLexer.g4) — add the resource name to BOTH the `CONCEPT_TYPE.validTypes` list AND the `PARAMETER_TYPE.validTypes` resources section. Both lists must stay sorted; the build-time gate (`scripts/extractParameterTypes.js`) verifies `parameterTypes ⊇ conceptTypes`.
2. Run `npm run generate` — regenerates `src/grammar/generated/types/conceptTypes.json` + `parameterTypes.json` + the ANTLR-generated `CRLLexer.ts`.
3. Update [`USER_GUIDE.md`](../USER_GUIDE.md) `### Concept types` and `### Parameter types` reference lists.
4. Update this doc's "Resources covered" section above if the addition crosses a new pattern (Request/Event/Contextual).
5. `npm test` — the lexer regression tests pick up the new token automatically.

## Adding a new activity token to `request CPG<Type>`

Bigger surface than a concept-type addition because the CRL token also drives the CEL emitter's resource-kind mapping and the FHIR-def emit lane's profile mapping.

1. Verify against the IG: fetch the source FSH for the new activity profile from `HL7/cqf-recommendations/input/fsh/profiles/activity-profiles/cpg-<name>-activity.fsh`. Confirm the Id, the Request profile binding, the `kind`, and the `code = $cpg-activity-type-cs#<literal>` value.
2. Add to `ACTIVITY_TYPE.validTypes` in `CRLLexer.g4` (drop `Task` suffix per the convention).
3. Update the CEL emitter's `CPG_TO_FHIR` map (`src/cel/emitter/emitFhir.ts:32-47`) with the verified `kind`.
4. Update the "Verified token ↔ IG profile mapping" table in this doc.
5. Update `USER_GUIDE.md` `### Activity types` reference list.
6. When the FHIR-def emit lane Todo 2 lands, add an entry to its activity-profile mapping table with the verified IG canonical URL fragment + `code` value + `profile` (target Request) canonical.
7. Run `npm run generate` + `npm test`.

## Cross-DSL reach

| Lane | Status | Notes |
|---|---|---|
| **CRL → CQL emit** | Shipped (v2.2.6) | Activity declarations emit as CQL no-op stubs today; the meaningful FHIR-def emit is a separate lane. |
| **CEL → FHIR JSON instance emit** | Shipped (v2.2.5 CEL Todo 5) | CEL emits Request/Event resources; `src/cel/emitter/emitFhir.ts`'s `CPG_TO_FHIR` map drives the FHIR kind per CRL `request CPG<Type>` token. The kinds were corrected against verified IG FSH on 2026-06-04. |
| **CRL → FHIR Definition emit** | Partial — Todo 1 shipped (ValueSet); Todo 2 in design (Activity → ActivityDefinition); Todo 3 not started (Decision → PlanDefinition); Todo 4 not started (CLI/MCP/release) | Closes [#73](https://github.com/alphora/clinical-reasoning-language/issues/73). Discussion log at [`.vibe-tools/discussions/055-crl-fhir-def-emit-pitch.md`](../.vibe-tools/discussions/055-crl-fhir-def-emit-pitch.md) onward. |
| **Homeostasis (cross-DSL validation)** | Not started | Tracked at [#76](https://github.com/alphora/clinical-reasoning-language/issues/76). Includes FHIR-version targeting, profile-driven required-element validation, and CRL↔CEL consistency. |

## Open design questions

These are unresolved as of 2026-06-04 and feed into the FHIR-def emit lane (Todo 2 specifically):

1. **`with` terminology resolution.** CRL `activity "X": - with "Term".` references a terminology. The CPG IG ActivityDefinition profiles have NO standard slot for binding terminology — the `code` field on every activity profile is FIXED to a `cpg-activity-type-cs#<literal>` value, not the author's `with`. Three options (none verified yet):
   - **(A)** Omit from emit entirely; the relationship is encoded only via the activity's CQL library; downstream consumers resolve at apply time.
   - **(B)** Emit as a `dynamicValue` entry on the ActivityDefinition with `path = "code"` (or `productCodeableConcept` per kind) and `expression` set to a CQL ValueSet reference.
   - **(C)** Use profile-specific extensions where they exist (`cpg-collectinformationactivity` has `CPGCollectWith`; most don't).
2. **`metric` declaration kind.** Scope, body shape, FHIR emit target (MeasureReport).
3. **`summary` declaration kind.** Scope, body shape, FHIR emit target (Composition).
4. **Workflow-state activities (Stop / Hold / Resume).** Out of scope for v2.x; revisit when there's a real authoring use case.

## Source-of-truth references

| Resource | Location |
|---|---|
| CRL grammar (concept type + activity type allowlists) | [`src/grammar/CRLLexer.g4`](../src/grammar/CRLLexer.g4) |
| CRL→CEL emit CPG-to-FHIR-kind mapping | [`src/cel/emitter/emitFhir.ts:32-47`](../src/cel/emitter/emitFhir.ts#L32-L47) |
| CEL FHIR-instance emit semantics | [`docs/cel-spec.md`](cel-spec.md) (section "Activity") |
| CRL→FHIR-def emit pitch / plans / discussions | [`.vibe-tools/discussions/055-crl-fhir-def-emit-pitch.md`](../.vibe-tools/discussions/055-crl-fhir-def-emit-pitch.md), `056`-`058` (Todo 1), `059+` (Todo 2) |
| CPG IG source (live build) | https://build.fhir.org/ig/HL7/cqf-recommendations/ |
| CPG IG activity-profile FSH | `HL7/cqf-recommendations/input/fsh/profiles/activity-profiles/` |
| CPG IG activity-type CodeSystem | `cpg-activity-type-cs` at `http://hl7.org/fhir/uv/cpg/CodeSystem/cpg-activity-type-cs` |

## Verification log

| Date | What | Outcome |
|---|---|---|
| 2026-06-04 | Verified all 14 CPG activity profile Ids + `kind` + `code` + `profile` (target) + `intent` + `doNotPerform` fields against `HL7/cqf-recommendations/input/fsh/profiles/activity-profiles/*.fsh` via the GitHub API. | 8 CEL CPG_TO_FHIR `kind` values were wrong against the IG; fixed in commit `887528a`. CRL grammar tokens needed 3 renames; landed in `887528a`. 3 missing concept types added in commit (this commit). |
