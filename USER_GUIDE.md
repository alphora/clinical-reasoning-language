
# Clinical Reasoning Language (CRL) User Guide

## Overview

Clinical Reasoning Language (CRL) is a domain-specific language for expressing clinical logic, concepts, activities, terminologies, and decisions in a readable, structured, and computable format. This guide describes the syntax, structure, and features of CRL as defined by the latest grammar and lexer.

---

## File Structure

A CRL file (also called a **library**) is structured as:

1. **Header** (required): A markdown line beginning with `#`. Stored in the AST as the `header` field.
2. **Library declaration** (optional): One `library "Name" version '<v>'?.` line declaring this file's identity. Files without a `library` line are *anonymous* — valid as a CLI root, but cannot be `include`d by name from other files.
3. **Include declarations** (optional, repeatable): `include "Name" version '<v>'?.` lines naming other libraries this file depends on. Resolved by name against a CLI `--source-path` registry, not by file path.
4. **Statements** (any number): `decision`, `terminology`, `activity`, and `concept`.

Ordering is strict: `library` → `include`s → other statements. The library + include feature is covered in detail in [§5 Cross-library imports](#5-cross-library-imports-library--include).

- **Comments:**
  - Single-line comments: `// ...`
  - Block comments: `/* ... */`

---

## Quoting and String Conventions

- **Identifiers** (names, references): Double quotes (`"..."`)


  Double quotes in CRL are expected to resolve to defined statements—either the name of a statement or a reference to a corresponding statement with that name elsewhere in CRL.
  - Example: `"BMI Valueset"`, `"Colonoscopy"`
- **Free text, markdown, evidence, meta, and system/code** values must be enclosed in backticks (`...`). Backticks are used for two purposes:
  Text content – e.g., `Some *markdown* text` for human-readable descriptions or rationale.
  External references – e.g., `http://snomed.info/sct` to denote URIs, system identifiers, or values outside the CRL namespace.
  
- **No escape characters** are allowed in quoted strings

---

## Statement Types

### 1. Decision Statement

Defines reusable decision logic blocks with `when` conditions and actions.

```crl
decision "Decision Name":
  - when "Concept Name" then recommend activity "Activity Name".
  - when "Other Concept" then:
      - recommend activity "A".
      - use decision "B".
  - end when
```

#### Structure

- `decision "Name":` (colon required)
- One or more `when` blocks
- `when` block can:
  - Directly recommend or use an activity/decision
  - Contain a block body (with optional `any:` or `all:` qualifier)
  - Be nested
- End blocks with `- end when`

#### Actions

- `recommend activity "Activity Name".`
- `use decision "Decision Name".`

>**Note**: `when ""` (an empty concept) is allowed by syntax and is used to ensure the action always runs (i.e., effectively condition = true).

---

### 2. Terminology Statement

Defines a terminology reference using either a valueset or system/code. Multiple codes per system are allowed.

```crl
terminology "BMI Valueset":
- valueset is `BMI`.

terminology "Colonoscopy":
- system is `http://snomed.info/sct`.
  - code is `73761001`.
- code is `73761002`.
```

#### Structure

- `terminology "Name":` (colon required)
- One or more of:
  - ``- valueset is `valuesetName`.``
  - ``- system is `systemUri`.``
    - Followed by one or more ``- code is `codeValue`.`` lines

---

### 3. Activity Statement

Defines an executable clinical activity.

```crl
activity "Vaccinate":
- request CPGImmunizationRequest.

activity "Indicate":
- request CPGProposeDiagnosisTask.
- with "Colonoscopy".

activity "Message Care Plan":
- request CPGCommunicationRequest.
- with `Create a care plan`.
- because `A new plan needs to be implemented.`.

activity "Contraindicated":
- request do not perform CPGImmunizationRequest.
- with "Immunization".
- because `Immunization is contraindicated`.
```

#### Structure

- `activity "Name":` (colon required)
- Required: `- request [do not perform] ACTIVITY_TYPE.`
- Optional:
  - `- with "Terminology".` or ``- with `Free text`.`` (only one allowed per activity)
  - ``- because `Rationale`.``

#### Activity Types

Must be a custom-defined type conforming to FHIR resource names.

> **Note:** `do not perform` marks the activity as contraindicated or not to be executed.

---

### 4. Concept Statement

Defines a reusable clinical concept. Must be either coded from a terminology or inferred from other concepts.

```crl
concept "Most Recent BMI":
- type is Observation.
- valuetype is boolean.
- meta is `Some meta information`.
- meta is `@ke-feedback: confirm the lookback window with the KE`.
- evidence is `Calculated by Smile`.
- inferred from "BMI".
  - apply pattern `Most Recent(this, lookbackMonths)`.

concept "BMI":
- type is Observation.
- valuetype is Quantity.
- inferred from ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").

concept "BMI Range as a Condition":
- type is Condition.
- valuetype is CodeableConcept.
- coded from "BMI Range as a Condition".
```

#### Structure

- `concept "Name":` (colon required)
- Required:
  - `- type is CONCEPT_TYPE.`
  - `- valuetype is CONCEPT_VALUE_TYPE.`
- Optional:
  - One or more ``- meta is `Text`.`` lines
  - One ``- evidence is `Text`.`` line
- Required: Either `- coded from` or one of the following `inferred from` forms:
  - `- inferred from "Concept".`
    - Optional: ``- apply pattern `PatternName`.`` (can repeat)
  - `- inferred from ( ...logical expression... ).`

#### Inference
- `inferred from "Concept".` — single concept reference
- `inferred from ( ... )` — logical expression using `and`, `or`, `not`, parentheses, and concept references
- `apply pattern` — can follow a single concept reference, and can be repeated

#### Metadata annotations (`@tag` convention)

`meta is` lines hold free text. By convention, prefix the text with an `@tag:` to give the note a recognized **type**. This needs no special syntax — it is ordinary `meta` text — and is fully back-compatible: a `meta` line **without** a leading `@tag` is just an untyped note.

```crl
- meta is `@description: true when the patient is age 60 or older`.
- meta is `@ke-feedback: confirm whether to anchor age on admission vs evaluation date; status open`.
- meta is `@kg-concept: the "elderly" condition; ref kg:condition/elderly; confidence 0.94; status candidate`.
```

End the line with a `.` **after** the closing backtick (not inside it): `- meta is` + the backtick-quoted text + `.`.

The tag vocabulary, value shapes, and cardinality are defined in the [metadata registry](./spec/metadata-registry.json) and enforced by the Validator; see the [metadata model](./spec/metadata-model.md) for the full set of tags. This model is in design (draft); the convention parses today.

> **Important:** `apply pattern` can **only** follow single concept inference (not logical expressions).

#### Logical Expressions

```crl
- inferred from (
    (
        ("a" and "b")
        or (
            ("c" and "d")
            and not ("e" or "f")
        )
    )
    or (
        ("x" or "y")
        and "z"
    )
    or "k"
    or "l"
).
```

---

### 5. Cross-library imports (`library` + `include`)

CRL files are called **libraries** and can depend on other libraries. The syntax is modeled on CQL's `library` and `include`:

```crl
# CMS22 BMI Screening and Follow-Up
library "CMS22" version '1.0.0'.

include "CMS22 Terminology" version '1.0.0'.
include "CMS22 Asserted"    version '1.0.0'.
include "CMS22 Inferred"    version '1.0.0'.
include "CMS22 Interface"   version '1.0.0'.

# (concept / decision / activity / terminology statements follow — optional)
```

#### Rules

- `library` is **optional** (max one per file). A file without `library` is **anonymous** — it can be a CLI root but can't be `include`d by name.
- `library` must come **before** any `include`; `include`s must come **before** any `concept`/`decision`/`activity`/`terminology`.
- `include` is repeatable; source order is preserved in the AST.
- Both `library` and `include` end with `.` (CRL statement convention).
- `version '...'` is optional on both. When absent on `library`, the library registers as version-less; when absent on `include`, it matches any registered version (and errors with `ambiguous-include` if more than one matches).
- Identifiers are double-quoted (`"CMS22 Inferred"`). Versions are single-quoted (`'1.0.0'`).
- `library`, `include`, and `version` are reserved keywords at the top level but remain usable as narrative words inside `definition is` bodies.
- **No aliasing in v0.7.** CQL's `called Foo` is reserved for a future v0.8.

#### Visibility — global in v0.7

Once a library is included transitively, every declaration anywhere in the include closure is visible to every library in that closure. There is no direction-aware scoping today; future v0.8 may add it.

Cross-kind same-name is legal: a `concept "BMI"` and a `terminology "BMI"` can coexist. The namespace is kind-separated (concepts, terminologies, decisions, activities), and the validator and emitter rely on that.

#### Resolution — by library name, not file path

When the CLI (or programmatic API) is given a root file plus one or more `--source-path` directories, the resolver:

1. Scans every `.crl` under each source path (recursively; skips `node_modules`, `dist`, `build`, dot-prefixed dirs).
2. Parses each file. Registers `(library name, version) → {filePath, ast}` for files that declare a `library` line.
3. Walks `include` statements from the root, transitively. Detects cycles, conflicts, ambiguous matches.
4. Builds a kind-separated combined namespace.

The root file's directory is implicitly added to source paths, so `--source-path .` is redundant if the root is in `.`.

#### Diagnostic kinds

Every import-side diagnostic carries `kind`, `severity` (`"error"` or `"warning"`), and a kind-specific payload:

| `kind` | When | Severity |
|---|---|---|
| `parse-failure` | A `.crl` file failed to parse. **Error** when it's the root; **warning** when it's an unrelated file in the search path. | varies |
| `registry-duplicate` | Two files declare the same `(library name, version)`. | error |
| `unresolved-include` | An `include` couldn't find a matching library. | error |
| `ambiguous-include` | An unversioned `include` matched multiple registered versions. | error |
| `cycle` | The include graph has a cycle. Carries `filePaths` (e.g. `[A, B, A]`) and parallel `includeChain`. | error |
| `name-conflict` | Two libraries declared the same `(kind, name)`. The flattened AST keeps the first occurrence in topological order (leaves win). | error |

#### CLI

Both `crl-validate` and `crl-emit` accept `--source-path <dir>` (repeatable). Without it, they fall back to single-file mode (backward-compatible).

```bash
# Single-file (existing behavior — unchanged)
crl-validate --path cms22.crl

# Import-aware: walk the include graph
crl-validate --path cms22.crl --source-path ./libs

# Multiple source paths (repeatable flag)
crl-validate --path cms22.crl --source-path ./libs --source-path ./shared

# Soft mode demotes ref-target errors to warnings (resolver structural
# diagnostics — cycles, unresolved-include — stay errors regardless)
crl-validate --path cms22.crl --source-path ./libs --soft

# Pretty output groups import diagnostics, validation errors, and warnings
crl-validate --path cms22.crl --source-path ./libs --pretty

# Emit one flat-inlined CQL library across the include graph
crl-emit --path cms22.crl --source-path ./libs > out.cql

# Override the emitted CQL library name
crl-emit --path cms22.crl --source-path ./libs --library-name CMS22 > out.cql
```

`crl-emit --source-path` short-circuits when any error-severity import diagnostic is present (cycle, unresolved include, etc.) — it won't emit a CQL library with unresolved cross-file refs. On success, you get one flat-inlined CQL library on stdout.

`crl-validate --source-path` flow:

1. Resolves the include graph from the root (transitively).
2. Builds the combined namespace.
3. Runs the semantic validator (name uniqueness, reference resolution, cycle detection) over a synthetic flattened AST so cross-file refs resolve naturally.
4. Attaches `filePath` and `libraryName` to every validator error via a location-range lookup, so output tells you which file complained.
5. Returns `{ success, importDiagnostics, validationErrors, validationWarnings }` (raw mode) or three pretty sections (`--pretty`).

#### Programmatic API

The npm package `@smile-digital-health/crl` exports:

```ts
import {
  validateCRLImports,    // import-aware validation
  emitCQLImports,        // import-aware emit
  resolveImports,        // lower-level: just resolve the graph
  emitCQLFromAST,        // emit from a CRL AST (skip parsing)
} from '@smile-digital-health/crl';

// Validate
const v = validateCRLImports('/abs/path/cms22.crl', ['/abs/path/libs'], { soft: false });
v.success;                  // boolean — zero validator errors AND zero error-severity import diagnostics
v.graph;                    // full ResolvedGraph (resolvedLibraries, namespace, diagnostics)
v.importDiagnostics;        // ImportDiagnostic[] — pre-filtered convenience
v.validationErrors;         // each has { filePath, libraryName, message, location, severity }
v.validationWarnings;

// Emit
const e = emitCQLImports('/abs/path/cms22.crl', ['/abs/path/libs'], { libraryName: 'CMS22' });
e.success;
e.cql;                      // string — the emitted CQL library (on success)
e.graph;
e.importDiagnostics;
e.errors;                   // only present on emitter exception (vs. import-side failures, which live in importDiagnostics)

// Just resolve
const g = resolveImports('/abs/path/cms22.crl', ['/abs/path/libs']);
g.resolvedLibraries;        // RegistryEntry[] in topological order (leaves first, root last)
g.namespace;                // { concepts, terminologies, decisions, activities } — each Map<name, NamespaceEntry>
g.diagnostics;              // ImportDiagnostic[]
```

All four entry points return result envelopes — missing source paths, parse failures, etc. become diagnostics, never thrown exceptions.

#### Worked example

A real 5-file split lives at `features/cql-pattern-mining/results/models/cms22-split/` (split from the 1010-line `cms22.crl`). To exercise it:

```bash
# From repo root, after `npm run build`:

node dist/cli/run-validator.js \
  --path features/cql-pattern-mining/results/models/cms22-split/cms22.crl \
  --source-path features/cql-pattern-mining/results/models/cms22-split \
  --pretty

node dist/cli/run-emitter.js \
  --path features/cql-pattern-mining/results/models/cms22-split/cms22.crl \
  --source-path features/cql-pattern-mining/results/models/cms22-split \
  --library-name CMS22 \
  > /tmp/cms22.cql
```

The emitted CQL is byte-identical (except for the library identity line) to the previously JAR-validated `cql/src/CMS22Generated.cql`. See `cms22-split/NOTES.md` for layout details.

#### v0.7 scope summary

- Global namespace (transitive visibility, no scoping).
- No aliasing (`include "Foo" called "F"` reserved for v0.8).
- Exact-string version matching (no semver ranges).
- Flat-inline emit (one CQL library out, regardless of N CRL files in).
- Library functions never throw — all errors return as diagnostics.

---

## Valid Types

These lists are generated from the grammar (`src/grammar/CRLLexer.g4`); only these values are accepted by the parser.

### Concept value types (`valuetype is`)

`Attachment`, `boolean`, `CodeableConcept`, `dateTime`, `integer`, `Period`, `Quantity`, `Range`, `Ratio`, `SampledData`, `string`, `time`

### Concept types (`type is`)

`AdverseEvent`, `AllergyIntolerance`, `ClinicalImpression`, `Communication`, `CommunicationRequest`, `Condition`, `DetectedIssue`, `Device`, `DiagnosticReport`, `DocumentReference`, `Encounter`, `FamilyMemberHistory`, `Goal`, `Immunization`, `MedicationAdministration`, `MedicationDispense`, `MedicationRequest`, `NutritionIntake`, `NutritionOrder`, `Observation`, `Procedure`, `QuestionnaireResponse`, `RiskAssessment`, `ServiceRequest`, `Task`

### Activity types (`request`)

`CPGAdministerMedication`, `CPGCollectInformation`, `CPGCommunicationRequest`, `CPGDispenseMedication`, `CPGDocumentMedication`, `CPGEnrollment`, `CPGGenerateReport`, `CPGImmunizationRequest`, `CPGMedicationRequest`, `CPGProposeDiagnosisTask`, `CPGRecordDetectedIssue`, `CPGRecordInference`, `CPGReportFlagTask`, `CPGServiceRequest`

---

## Keywords and Tokens

- **Keywords:** `library`, `include`, `version`, `decision`, `terminology`, `activity`, `concept`, `when`, `then`, `recommend activity`, `use decision`, `request`, `with`, `because`, `type is`, `valuetype is`, `evidence is`, `meta is`, `coded from`, `defined as`, `definition is`, `apply pattern`, `system is`, `code is`, `valueset is`, `any:`, `all:`, `do not perform`, `not`, `and`, `or`, `sem-and`, `sem-or`, `sem-not`, `end when`, `:` (colon), `.` (dot), `-` (dash), `(` (left paren), `)` (right paren)
- **Identifiers:** Double-quoted strings
- **Free text/markdown:** Backtick-quoted strings
- **Comments:** `// ...` or `/* ... */`

---

## Notes and Best Practices

- **Case Sensitivity:** CRL is case sensitive
- **Whitespace/Indentation:** Not significant
- **Header:** File must start with a markdown header line (`# ...`)
- **Quoted Strings:** No escape characters allowed
- **Meta Lines:** Multiple `meta is` lines allowed per concept
- **Evidence Line:** Only one `evidence is` line per concept
- **Pattern Application:** Allowed only after single concept references
- **Terminology Entries:** Can have multiple valuesets and system/code pairs
- **Activity Types:** Must be selected from valid resource types
- **Block Qualifiers:** `any:` and `all:` are optional (default is `any:`)

---

## Full Example

See [docs/clinical-reasoning-language-example.crl](`https://github.com/alphora/clinical-reasoning-language/blob/main/docs/clinical-reasoning-language-example.crl`) for a comprehensive example covering all features and options.

---

## Reference

For the full, up-to-date grammar, see:
- [src/grammar/CRLParser.g4](`https://github.com/alphora/clinical-reasoning-language/blob/main/src/grammar/CRLParser.g4`) parser rules)
- [src/grammar/CRLLexer.g4](`https://github.com/alphora/clinical-reasoning-language/blob/main/src/grammar/CRLLexer.g4`) (lexer rules)

For questions or contributions, see the project repository.
