# CEL — Case Example Language

**Version**: v1 (shipped at extension v2.2.4 + the corresponding root package).
**Status**: locked. Spec changes go through a feature pitch.
**Related**: [CRL](./clinical-reasoning-language-spec.md), [#64](https://github.com/alphora/clinical-reasoning-language/issues/64) (CEL umbrella), [#76](https://github.com/alphora/clinical-reasoning-language/issues/76) (homeostasis — cross-DSL profile-aware follow-up).

## What CEL is

CEL is the sibling DSL to CRL that covers the **instance / scenario side** of Clinical Quality content. Where CRL describes the definitional content — concepts, terminologies, activities, decisions, parameters — CEL describes the patient-agnostic clinical data points (`fact`s) and the concrete scenarios that exercise the CRL logic (`case`s).

CRL/CEL together cover the whole Clinical Quality stack: cognitive support, clinical decision support, prior authorization, risk adjustment, **and** quality measures. CEL is not measure-specific.

A `.cel` file declares a `library "X".` and contains any mix of `fact` and `case` declarations. Files with at least one case must name the CRL library they exercise via `covers "<CRL library>".`. The toolchain validates the file against the covered library's closure and emits FHIR JSON instance fixtures per case.

## File shape

```cel
# Optional Markdown narrative header.

library "<Name>".
covers "<CRL library name>".          # required when the file has at least one case
include "<External package library>". # optional; same shape as CRL include

# Patient-agnostic facts:
fact "<Fact name>":
- <field> is <value>.
- ...
- defined by "<CRL type | CRL library>"."<CRL declaration>".

# Concrete scenarios:
case "<Scenario name>":
- description is `<narrative>`.
- subject is "<Patient fact>".
- encounter is "<Encounter fact>".         # optional case-level ambient
- anchor is <expr>.                        # ambient anchor
- anchor "<name>" is <expr>.               # named anchor (multi-anchor flows)
- fact is "<fact>" [at <clause>] [with <intent>] [because `<reason>`].
- "<source>" <relation> "<target>".
- result is "<leaf>" is <value>.
```

## Top-level statements

### `library "X".`

File-level identity, required. Same shape as CRL.

### `covers "X".`

Required when the file has at least one case; optional for pure-fact libraries (shared data pools). Names the CRL library whose logic the cases exercise.

### `include "X" [as "Alias"].`

For **external package libraries** only. Local sibling CEL libraries auto-resolve via qualified refs without an `include`. Alias parses but emits `alias-not-yet-supported` warning (matches CRL's deferred state).

### `fact "X": …`

Reusable, patient-agnostic clinical data point. Body lines:

| Field | Example | Notes |
|---|---|---|
| `name is "…".` | `- name is "Maria Garcia".` | string |
| `birth date is "YYYY-MM-DD".` | `- birth date is "1972-08-22".` | ISO date string |
| `code is "<system>|<code>".` | `- code is "http://loinc.org|85354-9".` | FHIR canonical token form (per critical decision #3) |
| `date is "YYYY-MM-DD".` | `- date is "2026-03-10".` | ISO date string; default date for case-level references |
| `value is <number|string>.` | `- value is 118.` / `- value is "abnormal".` | numeric or string |
| `stage is <bare-word>.` | `- stage is ordered.` | bare-word allowlist (`proposed`, `ordered` in v1); maps to FHIR `intent` at emit |
| `defined by "<bare-type>".` | `- defined by "Patient".` | bare FHIR resource type per `conceptTypes.json` |
| `defined by "<Lib>"."<Decl>".` | `- defined by "CMS22 Asserted"."BP Screening Encounters".` | qualified ref into the covered library's closure |

`defined by` rule (single-level — no chain-follow):

- **Bare**: must resolve to a `conceptTypes.json` entry. Otherwise `unresolved-bare-type`.
- **Qualified**: looked up in the project closure's CRL registry. Candidate set = Concept ∪ Activity (Terminology / Decision / Parameter are excluded). Concept's `type is X` must be a `conceptTypes.json` entry; Activity is unconditionally accepted (FHIR type derivation lives in the emitter via the CPG→FHIR mapping table).

### `case "X": …`

A single scenario — one path through the CRL logic tree. Body lines:

| Field | Example |
|---|---|
| `description is \`<markdown>\`.` | multi-line backtick narrative; inner backticks must be escaped (`\``) |
| `subject is "<Patient fact>".` | required (per case) |
| `encounter is "<Encounter fact>".` | optional ambient encounter reference |
| `anchor is <expr>.` | ambient anchor (single-anchor flow) |
| `anchor "<name>" is <expr>.` | named anchor (multi-anchor flow) |
| `fact is "<fact>" [at …] [with … intent] [because \`…\`].` | adds a fact reference to the case |
| `"<source>" <relation> "<target>".` | cross-resource wiring (six relations — see below) |
| `result is "<leaf>" is <value>.` | expected outcome; v1 emits no JSON, deferred to [#70](https://github.com/alphora/clinical-reasoning-language/issues/70) |

#### Anchor expressions

```
anchor is now.
anchor is YYYY-MM-DD.
anchor is now + N <time-unit>.
anchor is now - N <time-unit>.
```

Time units: `year` / `years` / `month` / `months` / `week` / `weeks` / `day` / `days` / `hour` / `hours` / `minute` / `minutes` / `second` / `seconds` / `millisecond` / `milliseconds` (closed allowlist matching CRL's `TIME_UNIT`).

#### `at` clauses

```
fact is "X" at anchor.                     # ambient anchor
fact is "X" at anchor + N <time-unit>.
fact is "X" at anchor - N <time-unit>.
fact is "X" at "named-anchor".
fact is "X" at "named-anchor" + N <time-unit>.
fact is "X" on YYYY-MM-DD.                 # absolute date escape hatch
```

#### Intent modifiers

```
fact is "X" with absent intent.
fact is "X" with negative intent.
```

Default (no modifier) = positive. Emit shape:

- `absent intent`: `doNotPerform: true` on Request resources; `status: "entered-in-error"` elsewhere (best-effort v1).
- `negative intent`: `status: "stopped"` (best-effort v1).

#### Cross-resource wiring

Six locked relations. The source identifier appears bare (without `fact is`); the relation keyword disambiguates from other case-body forms (LL(1)).

| Source | Relation | FHIR field |
|---|---|---|
| `"<X>" based on "<Y>".` | `based on` | `basedOn` (Reference array) |
| `"<X>" part of "<Y>".` | `part of` | `partOf` (Reference array) |
| `"<X>" during encounter "<E>".` | `during encounter` | `encounter` (Reference) — overrides case-level `encounter is` ambient |
| `"<X>" requested by "<R>".` | `requested by` | `requester` (Reference) |
| `"<X>" performed by "<P>".` | `performed by` | `performer` (Reference) |
| `"<X>" not done because "<Y>".` | `not done because` | `statusReason` (best-effort v1 — CodeableConcept text) |

#### `result is`

```
result is "<leaf>" is true.            # boolean Concept leaf
result is "<leaf>" is false.
result is "<leaf>" is "<branch>".      # branch result on a Decision leaf
```

Leaf must be a top-level statement in the covered library. Shape-checked: Decision leaves require branch (string) results, Concept leaves require boolean. Activity / Terminology / Parameter leaves are categorical errors (`invalid-result-leaf-kind`).

v1 parses and resolves the leaf; does NOT emit JSON (deferred to [#70](https://github.com/alphora/clinical-reasoning-language/issues/70) / metric). Branch values are parsed but not cross-checked against the resolved Decision's branches.

## Validator semantics

The validator runs over a `ResolvedCelGraph` (the covered library's CRL registry, the parsed CEL AST, and bridge diagnostics from the resolver). It produces `errors[]` and `warnings[]` with the following kinds:

**Errors** (always block — soft mode doesn't demote):
- `unresolved-bare-type` — bare `defined by` doesn't match `conceptTypes.json`.
- `unresolved-qualified-library` — qualified library doesn't exist in the closure.
- `unresolved-qualified-declaration` — library exists but no Concept/Activity named `Decl`.
- `unresolved-result-leaf` — `result is` leaf doesn't resolve in the covered library.
- `invalid-result-shape` — value shape doesn't match the leaf kind (Decision needs branch; Concept needs boolean).
- `invalid-result-leaf-kind` — result leaf is Activity/Terminology/Parameter (only Concept and Decision are valid).
- `unresolved-fact-ref` — `subject is` / `encounter is` / `fact is` / cross-resource source/target references a fact not declared in this file.
- `duplicate-fact-name`, `duplicate-case-name` — intra-file uniqueness violations.
- `unresolved-cel-include` — CEL `include "X".` doesn't resolve.
- Passthrough errors from the resolver (`project-root-not-found`, `unresolved-covers`, `covers-missing-but-cases-present`, severity-error `crl-import` underlying diagnostics, `parse-failure`).

**Warnings** (silenced by soft mode):
- `unsupported-yet` — qualified `defined by` resolves but doesn't land on a derivable FHIR type (Concept without `conceptType`, Concept with `conceptType` outside the allowlist).
- `alias-not-yet-supported` — `include "X" as "Y".` parsed but alias semantics deferred.

**Fact / case namespaces** are separate; intra-file collisions only. `fact "Wellness Visit"` and `case "Wellness Visit"` in the same file are legal. `fact "Wellness Visit"` in two different files (even when both cover the same CRL library) is legal.

**Soft mode** silences `unsupported-yet` and `alias-not-yet-supported`. All other diagnostics stay as errors. This is a CEL-specific divergence from CRL's soft mode (which demotes reference-resolution).

## Emitter semantics

Per pitch v4 critical decision #2 (bounded MVP). Emits FHIR JSON instance fixtures per case to the KALM directory shape:

```
<out-dir>/patient/<library-slug>/<case-slug>/<FHIR Type>/<resource-id>.json
```

- Slugs are kebab-case lowercase.
- Resource IDs: `<library-slug>-<case-slug>-<fact-slug>` for clinical resources; Patient resources use just the patient's fact slug (shared across cases).
- One resource per fact reference PLUS the subject Patient.
- Per-case atomic, per-file partial. Cases with unsupported facts are skipped with `unsupported-yet` diagnostic; the CLI exits nonzero if any case is unsupported.

CRL kind → FHIR resource:
- Bare `defined by "X"` → `X` (must be in `conceptTypes.json`).
- Qualified `defined by "Lib"."Decl"`:
  - Concept → its `conceptType` (must be in allowlist; else `unsupported-yet`).
  - Activity → mapped via the CPG profile table:

CRL `request CPG<Type>` tokens align with the [CPG IG Activity Profiles](https://build.fhir.org/ig/HL7/cqf-recommendations/profiles.html#activity-profiles) Request-column profile names (with the `Task` suffix dropped consistently per CRL convention). The FHIR resource produced when a recommendation is applied derives from the parent of the IG Request profile. See [`docs/cpg-ig-alignment.md`](cpg-ig-alignment.md) for the verified token mapping table + the design rationale + how to add a new activity / concept type.

| CRL token | IG Request profile (extends) | FHIR resource |
|---|---|---|
| `CPGServiceRequest` | `CPGServiceRequest` extends `ServiceRequest` | `ServiceRequest` |
| `CPGMedicationRequest` | `CPGMedicationRequest` extends `MedicationRequest` | `MedicationRequest` |
| `CPGImmunizationRequest` | `CPGImmunizationRequest` extends `MedicationRequest` | `MedicationRequest` |
| `CPGCommunicationRequest` | `CPGCommunicationRequest` extends `CommunicationRequest` | `CommunicationRequest` |
| `CPGQuestionnaire` | `CPGQuestionnaireTask` extends `CPGTask` (Task) | `Task` |
| `CPGEnrollment` | `CPGEnrollmentTask` extends `CPGTask` | `Task` |
| `CPGProposeDiagnosis` | `CPGProposeDiagnosisTask` extends `CPGTask` | `Task` |
| `CPGRecordDetectedIssue` | `CPGRecordDetectedIssueTask` extends `CPGTask` | `Task` |
| `CPGRecordInference` | `CPGRecordInferenceTask` extends `CPGTask` | `Task` |
| `CPGReportFlag` | `CPGReportFlagTask` extends `CPGTask` | `Task` |
| `CPGGenerateReport` | `CPGGenerateReportTask` extends `CPGTask` | `Task` |
| `CPGDispenseMedication` | `CPGDispenseMedicationTask` extends `CPGTask` | `Task` |
| `CPGDocumentMedication` | `CPGDocumentMedicationTask` extends `CPGTask` | `Task` |
| `CPGAdministerMedication` | `CPGAdministerMedicationTask` extends `CPGTask` | `Task` |

Stage → FHIR intent:
- `stage is proposed.` → `intent: "proposal"`
- `stage is ordered.` → `intent: "order"`

## CLI

Per pitch v4 critical decision #1 (option d): `crl-emit` auto-dispatches by file extension.

```bash
crl-emit --path features/.../cms22.cel  --out-dir tests/data/fhir   # → FHIR JSON
crl-emit --path features/.../cms22.crl  --out-dir tests/data/cql    # → CQL (existing)
```

Exit codes:
- `0` — clean emit.
- `1` — precondition/error (parse failure, unresolved-covers, etc.).
- `2` — emit succeeded but at least one case was skipped as `unsupported-yet`.

## Worked examples in the repo

- [`features/cql-pattern-mining/results/models/cms22-split/cms22.cel`](../features/cql-pattern-mining/results/models/cms22-split/cms22.cel) — CMS22 BP screening measure case (Normal-BP path).
- [`features/cql-pattern-mining/results/models/cms22-split/cms22-strategy.cel`](../features/cql-pattern-mining/results/models/cms22-split/cms22-strategy.cel) — CMS22 cognitive support strategy case (hypertensive-reading path).
- [`features/cql-pattern-mining/results/models/cms69-split/cms69.cel`](../features/cql-pattern-mining/results/models/cms69-split/cms69.cel) — CMS69 BMI screening measure case (high-BMI + follow-up path).
- [`features/cql-pattern-mining/results/models/cms69-split/cms69-strategy.cel`](../features/cql-pattern-mining/results/models/cms69-split/cms69-strategy.cel) — CMS69 cognitive support strategy case (high-BMI intervention path).
- [`docs/cel-syntax-reference.cel`](./cel-syntax-reference.cel) — normative coverage artifact. Four cases exercising every locked CEL syntax feature: dynamic `now` anchor; fixed-date + absolute `on` escape + intent modifiers; multi-anchor (named admission/discharge); all six cross-resource wiring relations.

## Required: each CRL/CEL project needs its own `package.json`

`validate_crl` / the validator / the resolver walks **up** from the file you're validating to find the nearest `package.json`. That file defines the closure boundary — every CRL file inside its directory (and any nested directories that don't have their own `package.json`) belongs to the cross-file scope.

In a monorepo without a per-project `package.json`, the walk reaches the repo root and pulls in unrelated CRL files (test fixtures, regression data, abandoned drafts). Drop a minimal `package.json` at each project root:

```json
{ "name": "your-project-name", "version": "0.0.0", "private": true }
```

The split corpora at `features/cql-pattern-mining/results/models/cms{22,69}-split/` are good shape examples.

## Known v1 limitations (tracked at homeostasis #76)

These are intentional v1 gaps. The [homeostasis lane (#76)](https://github.com/alphora/clinical-reasoning-language/issues/76) is the umbrella for the cross-DSL profile-aware validator that closes them.

### Language-level gaps

- **No `using FHIR <version>` declaration**. CEL implicitly targets FHIR R4 (whatever CRL's `conceptTypes.json` / `activityTypes.json` shape assumes). No way to pin R4B / R5 or a specific Implementation Guide (e.g. CPG).
- **No profile-driven required-element validation**. A `Patient` fact missing required FHIR elements (per the active profile) is NOT flagged. The validator only checks structural CEL constructs.
- **No base-profile-on-facts declaration**. The fact's FHIR type derives entirely from `defined by`; there's no separate "this fact targets the CPGPatient profile" annotation.
- **Bidirectional CRL ↔ CEL constraint surface not implemented**. A CRL concept's `type is X` and a CEL fact's `defined by "Lib"."Decl"` can drift apart silently.

### Emitter gaps

- **Intent modifiers map to a single best-effort field per resource type** (`doNotPerform` / `status: entered-in-error` / `status: stopped`). The CPG-profile-correct shape per intent + resource type is deferred.
- **`not done because` emits `statusReason` text only** — the canonical mapping is CodeableConcept or Reference per profile.
- **BP-panel + components emits as separate Observations** rather than R4-canonical `Observation.component[]` (per pitch v4 critical decision #2 documented limitation). v1 ships non-canonical fixtures.
- **`result is` lines parse + validate but emit no JSON** (deferred to [#70](https://github.com/alphora/clinical-reasoning-language/issues/70) / metric). A future `GuidanceResponse` / `MeasureReport` shape is the natural fit.
- **No engine round-trip**. v1 emits "obvious shape" against R4 base resources; the emitted FHIR isn't validated against a FHIR engine + the CRL logic to confirm the case's `result is` claim.

### Tooling gaps

- **No in-editor diagnostics for `.cel` files**. The CRL VS Code extension highlights `.cel` syntax (since v2.2.4) but doesn't run `validateCELFile` against open documents. Authors run `crl-validate --path X.cel` from the CLI for now (per current v2.2.4 — note: the CLI bin only validates `.crl`; CEL validation is in the npm package's `validateCELFile` export; CLI dispatch for `.cel` validation is a follow-up).
- **No `validate_cel` MCP tool**. The MCP server exposes `validate_crl` for `.crl` files only; CEL needs its own tool.
- **No completion in the `defined by` slot**. The covered CRL library's closure isn't walked for autocomplete suggestions in `.cel` files. Authors type qualified refs by hand.
- **No hover / go-to-definition / find-references on `.cel` constructs**.
- **No cross-DSL navigation** (`.cel` `defined by` → `.crl` declaration).

## What's locked (per pitch v4)

The pieces that won't change without a feature pitch:

- Top-level kind: `library` (mirrors CRL). Single file kind holds both facts + cases.
- Three logical levels: library (file) > case (scenario) > fact (data point).
- `covers` 1..1 when present; required for case-bearing files.
- Cross-library reuse via npm packaging; no `version` on `library`; `include` for external packages only.
- `defined by` = "instance of": uniform resolution against bare FHIR types OR qualified CRL declarations.
- Field syntax: `- field is "value".` (sentence form, matches CRL).
- Intent enum: `absent`, `negative`. Documented-intent dropped.
- Universal optional `because \`<reason>\``.
- Six cross-resource keywords (named above).
- Per-reference relative dates with explicit case anchor; named multi-anchor.
- FHIR resource id at case level; same fact in N cases produces N distinct resources.
- FHIR emit directory: `tests/data/fhir/patient/<library-id>/<case-id>/<FHIR Type>/<resource-id>.json`.
- Caseload coverage is NOT exhaustive — a CEL library is a curated set of scenarios.
- CEL → FHIR JSON directly (no FSH intermediate).

## What's reversible (per pitch v4)

Things explicitly easy to revise after v1:

- Internal grammar / AST / resolver / emit-table shape.
- VS Code extension UX details.
- Test coverage shape.
- MVP-permissive `stage` allowlist ([#65 Q1a](https://github.com/alphora/clinical-reasoning-language/issues/65) deferred).

## Related issues

- [#64](https://github.com/alphora/clinical-reasoning-language/issues/64) — CEL umbrella.
- [#65](https://github.com/alphora/clinical-reasoning-language/issues/65) — CEL spec design questions (locked decisions).
- [#69](https://github.com/alphora/clinical-reasoning-language/issues/69) — `summary` (related CRL feature, separate).
- [#70](https://github.com/alphora/clinical-reasoning-language/issues/70) — `metric` (covers `result is` final form).
- [#71](https://github.com/alphora/clinical-reasoning-language/issues/71) — unified authoring environment (related but separate).
- [#72](https://github.com/alphora/clinical-reasoning-language/issues/72) — companion-package distribution model.
- [#73](https://github.com/alphora/clinical-reasoning-language/issues/73) — FHIR Definition emit from CRL (PlanDefinition / ActivityDefinition / ValueSet).
- [#75](https://github.com/alphora/clinical-reasoning-language/issues/75) — resolver sub-package boundary (adjacent improvement).
- [#76](https://github.com/alphora/clinical-reasoning-language/issues/76) — **homeostasis** (the umbrella that closes the v1 gaps listed above).
