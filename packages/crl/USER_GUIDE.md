
# Clinical Reasoning Language (CRL) User Guide

## Overview

Clinical Reasoning Language (CRL) is a domain-specific language for expressing clinical logic, concepts, activities, terminologies, and decisions in a readable, structured, and computable format. This guide describes the syntax, structure, and features of CRL as defined by the latest grammar and lexer.

**CEL** (Case Example Language) is the sibling DSL covering the **instance / scenario side** of Clinical Quality content — patient-agnostic facts and concrete case scenarios that exercise CRL logic. See [docs/cel-spec.md](./docs/cel-spec.md) for the locked CEL spec.

---

## File Structure

A CRL file (also called a **library**) is structured as:

1. **Header** (required): A markdown line beginning with `#`. Stored in the AST as the `header` field.
2. **Library declaration** (required): One `library "Name".` line declaring this file's identity. v2.1.0 removed the previous anonymous-file mode — every CRL file must declare its library name.
3. **Include declarations** (optional, repeatable): `include "Name".` lines naming **external** libraries this file depends on. Local sibling libraries in the same project auto-resolve via qualified refs without needing an `include` line. There is no `version` clause — npm packaging IS the version system.
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
first:
  - when "Concept Name" then recommend activity "Activity Name".
  - when "Other Concept" then:
      all:
      - recommend activity "A".
      - use decision "B".
      end.
  - otherwise then recommend activity "Default Activity".
```

#### Structure

- `decision "Name":` (colon required)
- A block of `when` branches, combined with a qualifier:
  - **`first:`** — ordered; the first matching branch wins; requires a trailing
    `otherwise`. **`all:`** — every matching branch fires.
  - A multi-branch block must declare `first:` or `all:`; a single branch needs none.
- A branch may directly recommend/use, or open a `then:` body, or nest.
- A `then:` body is a homogeneous block — either nested branches (`first:`/`all:`)
  or actions (`any:` = offer one / `all:` = do all) — closed by `end`.
- `otherwise` is the catch-all: only inside a `first:` block, must be last,
  required at the top level.

#### Actions

- `recommend activity "Activity Name".`
- `use decision "Decision Name".`

**Per-action guards (`unless` / `only when`).** A single menu item may carry a guard that conditions whether it is offered (typically inside an `any:` menu):

```crl
any:
- recommend activity "Order MRI".
- recommend activity "Order CT" unless "Contrast Allergy".
- recommend activity "Order Ultrasound" only when "Radiation Concern".
end.
```

`unless "C"` drops the item when concept `C` holds; `only when "C"` offers it only when `C` holds. A guard conditions ONE menu item — it is applicability polarity (lowered to `not` at emit time), not a `when` branch and not a sem-* operator.

> **See [decision-shapes.md](docs/decision-shapes.md)** for the full set of
> `first` / `any` / `all` / `otherwise` combinations, with worked examples and
> the common mistakes to avoid.

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
- request CPGProposeDiagnosis.
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

Defines a reusable clinical concept. Its body is one of: `code is` (local-source query), `coded from` (external terminology query), `defined as` (sem-* **inference** over other concepts), or `definition is` (a narrative predicate matched against the catalog).

```crl
concept "Most Recent BMI":
- type is Observation.
- value type is Quantity.
- meta is `Some meta information`.
- meta is `@ke-feedback: confirm the lookback window with the KE`.
- evidence is `Calculated by Smile`.
- definition is most recent "BMI".

concept "BMI":
- type is Observation.
- value type is Quantity.
- defined as ( "BMI Range as a Condition" sem-or "BMI as an Observation" sem-or "Calculated BMI" ).

concept "BMI Range as a Condition":
- type is Condition.
- value type is CodeableConcept.
- coded from "BMI Range as a Condition".
```

> `most recent "BMI"` selects the most recent BMI **Observation** (the `most recent` catalog selection pattern); `value type is Quantity` is that selected observation's value type. This is the short form — a measure may instead split it into a selection concept (`definition is most recent "BMI"`) plus a typed wrapper (`defined as "<selection>"`); see the corpus fixtures.

#### Structure

- `concept "Name":` (colon required)
- `- type is CONCEPT_TYPE.` — REQUIRED for an asserted (`coded from`) concept (a valueset carries no FHIR type); OPTIONAL for `defined as` / `definition is` inference (deduced from the body's refs if omitted).
- `- value type is CONCEPT_VALUE_TYPE.` — OPTIONAL and repeatable (0..*); deduced from the type's default / subject chain when omitted, lazily required when a consumer depends on it.
- Optional: one or more ``- meta is `Text`.`` lines; one ``- evidence is `Text`.`` line.
- A body — `- code is ` + a backtick-quoted code (local source); `- coded from "VS".` (external terminology); `- defined as ...` (sem-* inference); or `- definition is <narrative>.` (a catalog narrative predicate). Plus zero or more trailing `- source representation:` lines (the external multi-representation form — see below).

#### Inference (`defined as`)
- `defined as "Concept".` — a single concept reference (AST: `DefinedAsBareRef`)
- `defined as ( ... )` — a parenthesized SEMANTIC expression using `sem-and` / `sem-or` / `sem-not`, parentheses, and concept references (AST: `DefinedAsComposition`)

The `sem-*` operators are semantic-**inference** operators that normalize ONE concept's representations/components into one fact — NOT boolean logic, and NOT decision composition (combining a policy's distinct criteria — that is the decision tree's job). The author declares the result `(type, valuetype)`; operands need not type-check against each other. The narrative-predicate form `definition is <narrative>` (e.g. `most recent "X"`, `has "X"`, `"X" at least N`) covers the catalog patterns that the removed `apply pattern` syntax used to express.

#### Source representations (external, multi-representation)

A concept's LOCAL representation is its `code is`. To say the SAME clinical concept ALSO appears in one or more NON-LOCAL (external) sources — a different FHIR shape queried from an external system — add `- source representation:` lines. Each is an anonymous inner concept that INHERITS the enclosing concept's fields and overrides only what differs (dashed concept-body syntax; inherited lines omitted). A representation body may carry `- type is`, `- value type is` (0..*), and its own `- coded from "VS".`:

```crl
concept "Mammogram":
- type is Procedure.
- code is `mammogram-local`.              // the LOCAL representation
- source representation:                   // an EXTERNAL representation
  - type is ImagingStudy.
  - coded from "Mammogram Imaging VS".
- source representation:                   // another external representation
  - type is DiagnosticReport.
  - coded from "Mammogram Report VS".
```

The local `code is` plus the external `source representation`s form the concept's full **source set** — one author-facing identity per clinical concept. See ADR 0001 (asserted-vs-sourced data model) for the layer / origin / code-domain model and source-set dedup.

#### Metadata annotations (`@tag` convention)

`meta is` lines hold free text. By convention, prefix the text with an `@tag:` to give the note a recognized **type**. This needs no special syntax — it is ordinary `meta` text — and is fully back-compatible: a `meta` line **without** a leading `@tag` is just an untyped note.

```crl
- meta is `@description: true when the patient is age 60 or older`.
- meta is `@ke-feedback: confirm whether to anchor age on admission vs evaluation date; status open`.
- meta is `@kg-concept: the "elderly" condition; ref kg:condition/elderly; confidence 0.94; status candidate`.
```

End the line with a `.` **after** the closing backtick (not inside it): `- meta is` + the backtick-quoted text + `.`.

The tag vocabulary, value shapes, and cardinality are defined in the [metadata registry](./spec/metadata-registry.json) and enforced by the Validator; see the [metadata model](./spec/metadata-model.md) for the full set of tags. This model is in design (draft); the convention parses today.

> **Note:** the catalog narrative patterns (`most recent`, `has`, `at least`, `during`, …) are written with the `- definition is <narrative>.` body form — they replaced the removed `apply pattern` syntax.

#### Documenting status assertions — use `has <X>`, not bare `documented <X>`

Bare `documented "X"` is not a catalog pattern (only `<X> documented as <Y>` and `without documented <X>` exist). The canonical way to assert that a contraindication / finding / etc. is documented in the chart is to declare an asserted concept `coded from "<Terminology VS>"` and reference it with `has <X>`:

```crl
// Asserted: code-based detection of a contraindication.
concept "Antihypertensive Contraindication":
- type is Observation.
- value type is CodeableConcept.
- coded from "Antihypertensive Contraindication VS".

// Inferred: boolean assertion that the contraindication is documented.
concept "Has Antihypertensive Contraindication":
- type is Observation.
- value type is boolean.
- definition is has "Antihypertensive Contraindication".
```

See issue [#94](https://github.com/alphora/clinical-reasoning-language/issues/94).

#### Dimensionless thresholds — `'{score}'` convention

CRL's quantity grammar requires a UCUM unit on every numeric literal — this means a unitless clinical-score threshold (e.g. MADRS ≥ 28, PHQ-9 ≥ 10, QIDS ≥ 11) cannot be written as a bare number. The canonical workaround is the UCUM dimensionless annotation `'{score}'`:

```crl
- definition is "MADRS Score" at least 28 '{score}'.
- definition is "PHQ-9 Score" at least 10 '{score}'.
```

`'{score}'` is a real UCUM curly-braces annotation that emits as `Quantity { value: 28, code: "{score}", system: "http://unitsofmeasure.org" }` — well-formed FHIR + cleanly round-trips. Use it for any dimensionless integer/decimal threshold (clinical assessment scales, dose counts, dimensionless ratios). A future minor release may accept a bare integer directly; until then, `'{score}'` is the convention.

See issue [#95](https://github.com/alphora/clinical-reasoning-language/issues/95) for tracking.

#### Inference expressions (`sem-*`)

A `defined as` body is a tree of `sem-and` / `sem-or` / `sem-not` over concept references (these are SEMANTIC inference operators, not boolean `and`/`or`/`not`):

```crl
- defined as (
    (
        ("a" sem-and "b")
        sem-or (
            ("c" sem-and "d")
            sem-and sem-not ("e" sem-or "f")
        )
    )
    sem-or (
        ("x" sem-or "y")
        sem-and "z"
    )
    sem-or "k"
    sem-or "l"
).
```

---

### 5. Parameter Statement

Declares a runtime CQL parameter — a value the measure execution environment supplies (e.g. `"Measurement Period"`, the calendar window the measure runs against). Added in v2.2.0.

```crl
parameter "Measurement Period":
- param type is Period.

parameter "Index Patient":
- param type is Patient.
```

#### Structure

- `parameter "Name":` (colon required)
- Exactly one body line: `- param type is <PARAMETER_TYPE>.`
- No `coded from` / `defined as` / `definition is` — parameters are runtime inputs, not derived.

#### Library-local rule

Every library that references a parameter declares it locally. Do NOT use qualified refs (`"OtherLib"."Param"`) to reach parameters declared in other libraries. In a split project, the parameter declaration lives in the library that uses it — typically the inferred / measure-logic layer where the timing-window narrative refs live. See the [cms22-split corpus](./features/cql-pattern-mining/results/models/cms22-split/) for the canonical pattern.

#### Reference resolution

Narrative slots (`- definition is ...`) accept concept-or-parameter refs; the resolver prefers a concept first when both exist with the same name. Non-narrative slots (`coded from`, `defined as` bare-ref, composition operands `sem-and` / `sem-or` / `sem-not`, `when ... then ...`, activity `with`) remain concept- or terminology-only.

#### CQL emit semantics

- **`Patient`-typed parameter** → emitted CQL has a `context Patient` line per the CQL spec. The parameter's quoted CRL name is NOT emitted; the `context Patient` line has no per-name identifier. Every narrative ref to the parameter rewrites to the bare `Patient` identifier in emitted CQL.
- **`Period`-typed parameter** → emitted as `parameter "Name" Interval<DateTime>` (matches `CRLCommon` timing-arg signatures).
- **Primitives** → PascalCase (`boolean → Boolean`, etc.).
- **FHIR data + resource types** → passthrough (resolve via the library's `using FHIR version '4.0.1'` declaration).

See [Valid Types → Parameter types](#parameter-types-param-type-is) below for the full allowlist.

---

### 6. Cross-library imports (`library` + `include`) — v2.1.0

CRL files are called **libraries**. A project is an npm package — it has a
`package.json` at its root, plus its CRL source files. Other CRL libraries
are published as npm packages and pulled in via `npm install`. The
resolver finds them by walking up from a `.crl` file to the nearest
`package.json`, then scanning the project's `.crl` files plus
`node_modules/` for installed CRL packages.

Versioning is handled entirely by npm — the installed package IS the
version. There is no `version` clause in CRL source.

#### Syntax

```crl
# CMS22 Blood Pressure Screening and Follow-Up
library "CMS22".
include "Some External Package Library".

# (concept / decision / activity / terminology statements follow)
```

#### Rules

- `library` is **required** (max one per file). v2.1.0 removed the previous anonymous-file mode.
- `include` is **for external (package) libraries only**. Local sibling libraries in the same project auto-resolve via qualified refs without needing an `include` line. Writing `include "LocalSibling".` produces a `redundant-local-include` warning.
- `library` must come **before** any `include`; `include`s must come **before** any `concept`/`decision`/`activity`/`terminology`.
- `include` is repeatable; source order is preserved in the AST.
- Both `library` and `include` end with `.` (CRL statement convention).
- Identifiers are double-quoted (`"CMS22 Inferred"`).
- `library`, `include`, and `as` are reserved keywords at the top level but remain usable as narrative words inside `definition is` bodies.
- **`include "Foo" as "Bar".` aliasing parses but is not yet honored** — the resolver emits an `alias-not-yet-supported` warning and treats the include as if no alias were present. Full alias semantics defer to v2.2.

#### Cross-library references — qualified refs

References across library boundaries use the qualified form `"Library"."Name"`:

```crl
library "CMS22 Interface".

concept "Initial Population":
- type is Encounter.
- defined as "CMS22 Inferred"."Qualifying Encounter".
```

Resolution rules:

- **Bare refs** (`"X"`) resolve to declarations **in the same library** only. v2.1.0 ended global-namespace lookup.
- **Qualified refs** to a **local sibling** (any library in the same project) work without an `include` line — locals auto-resolve.
- **Qualified refs** to a **package** library require the asking file to `include` that package. Otherwise → `external-library-not-included`.
- **Same `(kind, name)` across libraries is legal** under per-library scoping. Each library has its own scope; both libraries' `concept "BMI"` can coexist; refs disambiguate via qualifier.

#### Project layout

A CRL project is an npm package:

```
my-cms22/                              ← project root
├── package.json                       ← standard npm package.json
├── node_modules/                      ← installed CRL packages live here
│   └── @smile/bmi-concepts/
│       ├── package.json               ← declares its CRL libraries (see below)
│       └── src/crl/
│           └── bmi-asserted.crl       ← declares `library "BMI Asserted".`
├── src/crl/                           ← author's .crl files (convention)
│   ├── cms22.crl                      ← the root file (or any other; CLI takes --path)
│   ├── cms22-inferred.crl
│   ├── cms22-asserted.crl
│   └── cms22-terminology.crl
└── tests/...
```

`src/crl/` is the **convention** for where authors put `.crl` files, but
the resolver doesn't hard-code that path — it scans the whole project
root recursively (skipping `node_modules`, `dist`, `build`, dot-dirs), so
`.crl` files anywhere in the project are picked up.

#### Publishing a CRL package

The published package's `package.json` declares which files contribute
CRL libraries via a `crl.libraries` array:

```json
{
  "name": "@smile/bmi-concepts",
  "version": "1.0.0",
  "crl": {
    "libraries": [
      "src/crl/bmi-asserted.crl",
      "src/crl/bmi-inferred.crl",
      "src/crl/bmi-terminology.crl"
    ]
  },
  "files": ["src/crl/**/*.crl", "package.json", "README.md"]
}
```

- `crl` is an object (not a bare array) so future fields can be added
  (`crl.exclude`, `crl.aliases`, …) without breaking the schema.
  Unknown sub-fields under `crl` are silently ignored.
- Paths in `crl.libraries` are **package-relative**. Paths that escape
  the package directory (`..`) are rejected.
- Each listed file should declare its own `library "Name".`. Listed
  files without a library declaration produce a
  `package-resolution-failure` warning.
- A package without a `crl` field contributes nothing (most npm packages
  aren't CRL packages — no error).

Consumers `npm install @smile/bmi-concepts` and use qualified refs like
`"BMI Asserted"."BMI Code"` plus `include "BMI Asserted".` in the asking
file — the resolver finds the file via the package's `crl.libraries`
declaration.

#### Resolution

When given a root `.crl` (e.g. via `crl-validate --path src/crl/cms22.crl`),
the resolver:

1. **Walks up** from the root file to the nearest `package.json` — that
   directory is the **project root**. If no `package.json` is found,
   the diagnostic `project-root-not-found` is emitted and resolution
   stops.
2. **Local scan**: recursively walks the project root for `.crl` files
   (skipping `node_modules`, `dist`, `build`, dot-dirs). Each file with
   a `library "Name".` declaration registers under that name in
   `byNameLocal`.
3. **Package scan**: walks top-level entries in `node_modules/` (including
   `@org/*` scoped subdirs). For each package with a `crl.libraries`
   field, parses each listed file and registers it under its library name
   in `byNamePackage`. Transitive CRL deps are assumed hoisted to
   top-level by npm.
4. **Walks includes** from the root transitively. Detects cycles. Local
   sibling libraries that aren't include-walked still appear in the
   graph's `localLibraries` field so qualified refs to them resolve.
5. **Builds per-library scopes** so each library's bare-ref lookups stay
   in that library, and qualified-ref lookups respect the
   local-auto-resolve vs package-include rules.

#### Per-library validator scoping

Under v2.1.0, the validator runs per-library:

- `NameUniquenessValidator` keys uniqueness per `(library, kind, name)`,
  so two libraries with `concept "BMI"` don't collide.
- `ReferenceResolver` resolves bare refs in the owning library's local
  names, and qualified refs via the per-file include + local-auto-resolve
  rules above.
- `CycleDetector` builds a global concept-ref graph keyed by
  `(library, name)` so cross-library cycles surface.

Validation walks all four ref slots: concept body refs, decision
`when "C"` / `recommend activity "A"` / `use decision "D"`, and activity
`with "T"`.

#### Per-CRL emit

v2.1.0 emits **one CQL file per CRL library** (not one big flat-inlined CQL
file like v2.0). Each library produces its own `<libraryName>.cql` with
its own `library X` header, its own `include FHIRHelpers` + `include
CRLCommon`, and a CQL `include OtherLib` line for each cross-library
qualified ref it makes.

What's emitted today:
- `concept` declarations (via `defined as` / `definition is` / `coded from`)
- `terminology` declarations (valuesets, codes)
- Cross-library qualified refs emit as CQL native `"Lib"."Name"` /
  `Lib."Name"` (quoted when the library name contains spaces).

What's NOT emitted today (validation-only support):
- `decision` declarations
- `activity` declarations

The validator surfaces ref errors in decision/activity body slots, but
the emitter doesn't render those statements into CQL. Quality-Measure
consumers get the `concept` outputs; decision/activity emission is a
future feature.

#### Diagnostic kinds

Every import-side diagnostic carries `kind`, `severity` (`"error"` or `"warning"`), and a kind-specific payload:

| `kind` | When | Severity |
|---|---|---|
| `parse-failure` | A `.crl` file failed to parse. **Error** when it's the root; **warning** when it's another file in the project. | varies |
| `project-root-not-found` | No `package.json` was found walking up from the root file. | error |
| `package-resolution-failure` | An installed package's `crl.libraries` entry couldn't be loaded. Carries a `reason` field: `"missing-file"`, `"invalid-json"`, `"crl-libraries-not-array"`, `"no-library-declaration"`, `"path-escapes-package"`, `"parse-error"`. | warning |
| `registry-duplicate` | Two libraries in the SAME registry (local-vs-local or package-vs-package) declared the same name. Local-vs-package same-name is benign. | error |
| `unresolved-include` | An `include` couldn't find a matching library. | error |
| `cycle` | The include graph has a cycle. Carries `filePaths` (e.g. `[A, B, A]`) and parallel `includeChain`. | error |
| `alias-not-yet-supported` | An `include "Foo" as "Bar".` is parsed but alias semantics are deferred to v2.2; the include is treated as if no alias were given. | warning |
| `redundant-local-include` | An `include` names a local-origin library. Per v2.1.0, locals auto-resolve via qualified refs without an `include` — the include is redundant scaffolding. | warning |

Validator-side diagnostics (from `ValidationError.kind`):

| `kind` | When | Severity |
|---|---|---|
| `empty-name` | A declaration's name is blank. | error |
| `duplicate-name` | Two declarations within the same library + same kind share a name. | error |
| `unresolved-reference` | A bare ref doesn't match any declaration in the owning library. | error |
| `reference-cycle` | Concept refs form a cycle (within or across libraries). | error |
| `external-library-not-included` | A qualified ref `"Pkg"."X"` to a package library is missing its `include` line, OR references a library the resolver doesn't know about. | error |
| `qualified-ref-unresolved` | A qualified ref `"Lib"."X"` to a known/included library but the name `X` isn't declared there for the expected kind. | error |

`unresolved-reference` and `qualified-ref-unresolved` demote to warnings
under soft mode. Structural diagnostics
(`external-library-not-included`, cycle, name uniqueness) never demote.

#### CLI

```bash
# Validate
crl-validate --path src/crl/cms22.crl
crl-validate --path src/crl/cms22.crl --soft     # demote ref-target errors to warnings
crl-validate --path src/crl/cms22.crl --pretty   # grouped human-readable output

# Emit (per-CRL — one CQL file per library)
crl-emit --path src/crl/cms22.crl --out-dir ./out/
```

`--out-dir` is required for `crl-emit`. The CLI writes one
`<libraryName>.cql` file per library in the emit closure (root's
include-walked closure + any local sibling transitively qualified-referenced).
Library names are preserved verbatim in filenames (so the on-disk file
matches the CQL `include "Lib Name"` reference).

`crl-emit` short-circuits when any error-severity import diagnostic is
present — it won't emit broken CQL. On success, the CLI writes the files
and prints `wrote <path>` per file.

The emitted CQL library declarations are **unversioned** — `library X`
(or `library "X With Spaces"`), not `library X version 'Y'`. Same
principle as CRL source: npm packaging IS the version system, so
duplicating it in the output adds nothing. CQL `include` statements
between emitted libraries are also unversioned.

The same no-version rule applies to the emitted `include CRLCommon
called CRLCommon` line — CRLCommon is our library, so npm pins its
version. The `include FHIRHelpers version '4.0.1' called FHIRHelpers`
line keeps its version because FHIRHelpers ships versioned with the
FHIR spec itself (it's not an npm package).

#### Programmatic API

The npm package `@smile-digital-health/crl` exports:

```ts
import {
  validateCRL,           // single-file validation
  validateCRLImports,    // import-aware validation
  emitCQLImports,        // import-aware emit (per-CRL)
  resolveImports,        // lower-level: just resolve the graph
  emitCQLFromAST,        // emit from a CRL AST (skip parsing)
} from '@smile-digital-health/crl';

// Validate
const v = validateCRLImports('/abs/path/cms22.crl', { soft: false });
v.success;                  // boolean — zero validator errors AND zero error-severity import diagnostics
v.graph;                    // full ResolvedGraph (resolvedLibraries, localLibraries, registry, namespace, diagnostics, projectRoot)
v.importDiagnostics;        // ImportDiagnostic[] — pre-filtered convenience
v.validationErrors;         // each has { kind, message, location, severity, libraryName?, filePath?, targetLibrary?, targetName? }
v.validationWarnings;

// Emit (per-CRL — returns one CQL per library)
const e = emitCQLImports('/abs/path/cms22.crl');
e.success;
e.cqlByLibrary;             // Array<{ libraryName, filePath, outputFilename, cql }>
e.graph;
e.importDiagnostics;
e.errors;                   // only present on emitter exception

// Just resolve
const g = resolveImports('/abs/path/cms22.crl');
g.projectRoot;              // string — the dir containing package.json
g.resolvedLibraries;        // RegistryEntry[] — include-walked closure (leaves first, root last)
g.localLibraries;           // RegistryEntry[] — local-origin libs NOT in the include walk
g.registry;                 // { byNameLocal, byNamePackage } — full registry universe
g.diagnostics;              // ImportDiagnostic[]
```

All entry points return result envelopes — missing `package.json`,
parse failures, malformed packages, etc. become diagnostics, never
thrown exceptions.

#### Project layout

A CRL project is an npm package:

```
my-cms22/                              ← project root
├── package.json                       ← standard npm package.json
├── node_modules/                      ← installed CRL packages live here
│   └── @smile/bmi-concepts/
│       ├── package.json               ← declares its CRL libraries (see below)
│       └── src/crl/
│           └── bmi-asserted.crl       ← declares `library "BMI Asserted".`
├── src/crl/                           ← author's .crl files (convention)
│   ├── cms22.crl                      ← the root file (or any other; CLI takes --path)
│   ├── cms22-interface.crl
│   └── cms22-inferred.crl
└── tests/...
```

`src/crl/` is the **convention** for where authors put `.crl` files, but
the resolver doesn't hard-code that path — it scans the whole project
root recursively (skipping `node_modules`, `dist`, `build`, dot-dirs), so
`.crl` files anywhere in the project are picked up.

#### Publishing a CRL package

The published package's `package.json` declares which files contribute
CRL libraries via a `crl.libraries` array:

```json
{
  "name": "@smile/bmi-concepts",
  "version": "1.0.0",
  "crl": {
    "libraries": [
      "src/crl/bmi-asserted.crl",
      "src/crl/bmi-inferred.crl",
      "src/crl/bmi-terminology.crl"
    ]
  },
  "files": ["src/crl/**/*.crl", "package.json", "README.md"]
}
```

- `crl` is an object (not a bare array) so future fields can be added
  (`crl.exclude`, `crl.aliases`, …) without breaking the schema.
  Unknown sub-fields under `crl` are silently ignored.
- Paths in `crl.libraries` are **package-relative**. Paths that escape
  the package directory (`..`) are rejected.
- Each listed file should declare its own `library "Name".`. Listed
  files without a library declaration produce a
  `package-resolution-failure` warning.
- A package without a `crl` field contributes nothing (most npm packages
  aren't CRL packages — no error).

Consumers `npm install @smile/bmi-concepts` and use `include "BMI Asserted".`
in their CRL — the resolver finds the file via the package's
`crl.libraries` declaration.

#### Resolution

When given a root `.crl` (e.g. via `crl-validate --path src/crl/cms22.crl`),
the resolver:

1. **Walks up** from the root file to the nearest `package.json` — that
   directory is the **project root**. If no `package.json` is found,
   the diagnostic `project-root-not-found` is emitted and resolution
   stops.
2. **Local scan**: recursively walks the project root for `.crl` files
   (skipping `node_modules`, `dist`, `build`, dot-dirs). Each file with
   a `library "Name".` declaration registers under that name.
3. **Package scan**: walks top-level entries in `node_modules/` (including
   `@org/*` scoped subdirs). For each package with a `crl.libraries`
   field, parses each listed file and registers it under its library name.
   v0.7 assumes npm hoisting puts transitive CRL deps at the top level —
   the resolver does not recurse into nested `node_modules/`.
4. **Walks includes** from the root transitively. Detects cycles.
5. **Builds a kind-separated namespace** (concepts, terminologies,
   decisions, activities).

#### Visibility — global in v0.7

Once a library is included transitively, every declaration anywhere in
the include closure is visible to every library in that closure. Future
v0.8 may add direction-aware scoping.

Cross-kind same-name is legal: a `concept "BMI"` and a `terminology "BMI"`
can coexist. The namespace is kind-separated, and the validator and
emitter rely on that.

#### Diagnostic kinds

Every import-side diagnostic carries `kind`, `severity` (`"error"` or `"warning"`), and a kind-specific payload:

| `kind` | When | Severity |
|---|---|---|
| `parse-failure` | A `.crl` file failed to parse. **Error** when it's the root; **warning** when it's another file in the project. | varies |
| `project-root-not-found` | No `package.json` was found walking up from the root file. | error |
| `package-resolution-failure` | An installed package's `crl.libraries` entry couldn't be loaded. Carries a `reason` field: `"missing-file"`, `"invalid-json"`, `"crl-libraries-not-array"`, `"no-library-declaration"`, `"path-escapes-package"`, `"parse-error"`. | warning |
| `registry-duplicate` | Two registered libraries (local + local, local + package, or package + package) declare the same name. | error |
| `unresolved-include` | An `include` couldn't find a matching library. | error |
| `cycle` | The include graph has a cycle. Carries `filePaths` (e.g. `[A, B, A]`) and parallel `includeChain`. | error |
| `name-conflict` | Two libraries declared the same `(kind, name)` statement (e.g. both have `concept "X"`). The flattened AST keeps the first occurrence in topological order (leaves win). | error |

There is **no** `ambiguous-include` diagnostic — without version
matching, every include name resolves to at most one library.

#### CLI

```bash
# Validate
crl-validate --path src/crl/cms22.crl
crl-validate --path src/crl/cms22.crl --soft     # demote ref-target errors to warnings
crl-validate --path src/crl/cms22.crl --pretty   # grouped human-readable output

# Emit one flat-inlined CQL library
crl-emit --path src/crl/cms22.crl > out.cql
crl-emit --path src/crl/cms22.crl --library-name CMS22 > out.cql   # override CQL library name
```

The `--source-path` flag has been removed. Resolution is via `package.json`
walk-up + `node_modules/` scan; there's no longer a way to point the
resolver at an arbitrary directory.

`crl-emit` short-circuits when any error-severity import diagnostic is
present — it won't emit a CQL library with unresolved cross-file refs.
On success, you get one flat-inlined CQL library on stdout.

The emitted CQL library declaration is **unversioned** — `library X`,
not `library X version 'Y'`. Same principle as CRL source: npm packaging
IS the version system, so duplicating it in the output adds nothing. The
emitter resolves the `X` in priority order: (1) `--library-name` /
`EmitOptions.libraryName` if provided; (2) the root's `library "X".`
declaration; (3) `"GeneratedFromCRL"` default.

The same no-version rule applies to the emitted `include CRLCommon called CRLCommon`
line — CRLCommon is our library, so npm pins its version. The
`include FHIRHelpers version '4.0.1' called FHIRHelpers` line keeps its
version because FHIRHelpers ships versioned with the FHIR spec itself
(it's not an npm package).

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
const v = validateCRLImports('/abs/path/cms22.crl', { soft: false });
v.success;                  // boolean — zero validator errors AND zero error-severity import diagnostics
v.graph;                    // full ResolvedGraph (resolvedLibraries, namespace, diagnostics, projectRoot)
v.importDiagnostics;        // ImportDiagnostic[] — pre-filtered convenience
v.validationErrors;         // each has { filePath, libraryName, message, location, severity }
v.validationWarnings;

// Emit
const e = emitCQLImports('/abs/path/cms22.crl', { libraryName: 'CMS22' });
e.success;
e.cql;                      // string — the emitted CQL library (on success)
e.graph;
e.importDiagnostics;
e.errors;                   // only present on emitter exception (vs. import-side failures, which live in importDiagnostics)

// Just resolve
const g = resolveImports('/abs/path/cms22.crl');
g.projectRoot;              // string — the dir containing package.json (undefined when project-root-not-found)
g.resolvedLibraries;        // RegistryEntry[] in topological order (leaves first, root last)
g.namespace;                // { concepts, terminologies, decisions, activities } — each Map<name, NamespaceEntry>
g.diagnostics;              // ImportDiagnostic[]
```

All four entry points return result envelopes — missing `package.json`,
parse failures, malformed packages, etc. become diagnostics, never
thrown exceptions.

#### Worked example: two files referencing each other

The simplest possible cross-file scenario — one root, one local sibling.
Both files live in `my-project/src/crl/`. The project has a `package.json`
at its root.

```
my-project/
├── package.json
└── src/crl/
    ├── shared.crl
    └── screening.crl    ← root (the file you pass to --path)
```

**`my-project/package.json`** (just the bare minimum):
```json
{
  "name": "my-project",
  "version": "0.1.0",
  "private": true
}
```

**`my-project/src/crl/shared.crl`**:
```crl
# Shared vocabulary
library "Shared Vocabulary".

terminology "BMI Valueset":
- valueset is `http://example.org/fhir/ValueSet/bmi`.

concept "BMI Observations":
- type is Observation.
- coded from "BMI Valueset".
```

**`my-project/src/crl/screening.crl`** (the root — uses a qualified ref into Shared Vocabulary; no `include` line needed because it's a local sibling):
```crl
# BMI Screening
library "BMI Screening".

concept "BMI Encounter Performed":
- type is Encounter.
- definition is "Shared Vocabulary"."BMI Observations" performed.
```

Run it:

```bash
crl-validate --path my-project/src/crl/screening.crl --pretty
crl-emit --path my-project/src/crl/screening.crl --out-dir ./out/
```

What happens under the hood:

1. Resolver walks up from `screening.crl` → finds `my-project/package.json` → **project root** = `my-project/`.
2. Local scan: walks `my-project/` recursively, finds both `.crl` files and registers them in `byNameLocal` under their declared library names.
3. Package scan: `my-project/node_modules/` is absent — no installed CRL packages.
4. Per-library scopes built. `BMI Screening`'s scope sees `Shared Vocabulary` in `knownLibraries` (a local sibling — auto-resolves without `include`).
5. Validator: the qualified ref `"Shared Vocabulary"."BMI Observations"` looks up `BMI Observations` in `Shared Vocabulary`'s local names. Resolves cleanly.
6. Emit: two CQL files written to `./out/` — `BMI Screening.cql` (with `include "Shared Vocabulary"`) and `Shared Vocabulary.cql` (with the valueset + concept).

If `screening.crl` instead wrote `include "Shared Vocabulary".`, the validator would emit a `redundant-local-include` warning — the include is unnecessary because local siblings auto-resolve.

Try modifying `shared.crl` to rename `BMI Observations` to `Observations of BMI`. Without changing `screening.crl`, run `crl-validate` — you get a `qualified-ref-unresolved` error attributed to `screening.crl` pointing at the now-stale qualified ref. The `targetLibrary`, `targetName`, `filePath`, and `libraryName` fields on the error tell you exactly which library the missing name was looked up in.

#### Worked example: cross-package (npm install)

A larger version of the same pattern, but the shared library is published
as an npm package and `npm install`ed:

```
my-screening/
├── package.json                   { "dependencies": { "@smile/bmi-shared": "^1.0.0" } }
├── node_modules/
│   └── @smile/bmi-shared/
│       ├── package.json           { "crl": { "libraries": ["src/crl/bmi-shared.crl"] } }
│       └── src/crl/bmi-shared.crl   declares: library "Shared Vocabulary".
└── src/crl/screening.crl          declares: library "BMI Screening". includes "Shared Vocabulary".
```

For the package case, `screening.crl` DOES need `include "Shared Vocabulary".`
because it's now reaching an external (package) library, not a local
sibling. The qualified ref form is the same: `"Shared Vocabulary"."BMI Observations"`.

#### Worked example: cms22 4-layer split

A 4-file split lives at `features/cql-pattern-mining/results/models/cms22-split/`
(split from the original 1010-line `cms22.crl`). The layers are
interface (`cms22.crl`, the public Measure API), inferred, asserted,
and terminology. To exercise it:

```bash
# From repo root, after `npm run build`:

node dist/cli/run-validator.js \
  --path features/cql-pattern-mining/results/models/cms22-split/cms22.crl \
  --pretty

node dist/cli/run-emitter.js \
  --path features/cql-pattern-mining/results/models/cms22-split/cms22.crl \
  --out-dir /tmp/cms22-out/
```

The emitter produces four CQL files: `CMS22.cql` (the interface),
`CMS22 Inferred.cql`, `CMS22 Asserted.cql`, `CMS22 Terminology.cql`.
Cross-library refs emit as CQL native `"OtherLib"."Name"` so the
generated CQL has a self-contained dependency graph. See
`cms22-split/NOTES.md` for layout details.

#### v2.1.0 scope summary

- **`library` declarations are required.** No anonymous-file mode.
- **Per-library scoping.** Bare refs resolve locally; cross-library refs
  must be qualified.
- **`include` is external-only.** Local siblings auto-resolve via
  qualified refs without needing `include`.
- **Per-CRL emit.** One CQL file per CRL library; cross-library refs
  emit as CQL native qualified references.
- **No version syntax.** npm packaging is the version system; the
  package IS the version. No `version` clause in CRL source or emitted
  CQL.
- **Alias parses but doesn't yet apply** (`include "Foo" as "Bar".` →
  `alias-not-yet-supported` warning, treated as raw include). Defers to
  v2.2.
- **No fallback.** Missing `package.json` is an error, not "treat the
  root's directory as the project."
- **Library functions never throw** — all errors return as diagnostics.

---

## Valid Types

These lists are generated from the grammar (`src/grammar/CRLLexer.g4`); only these values are accepted by the parser.

### Concept value types (`value type is`)

`Attachment`, `boolean`, `CodeableConcept`, `dateTime`, `integer`, `Period`, `Quantity`, `Range`, `Ratio`, `SampledData`, `string`, `time`

### Concept types (`type is`)

Allowlist covers every base FHIR resource referenced by a CPG IG Request or Event profile, plus subject/contextual resources. See [`docs/cpg-ig-alignment.md`](docs/cpg-ig-alignment.md) for the full CRL↔CPG-IG mapping rationale.

`AdverseEvent`, `AllergyIntolerance`, `Claim`, `ClinicalImpression`, `Communication`, `CommunicationRequest`, `Condition`, `DetectedIssue`, `Device`, `DiagnosticReport`, `DocumentReference`, `Encounter`, `EpisodeOfCare`, `ExplanationOfBenefit`, `FamilyMemberHistory`, `Flag`, `Goal`, `ImagingStudy`, `Immunization`, `MedicationAdministration`, `MedicationDispense`, `MedicationRequest`, `MedicationStatement`, `NutritionIntake`, `NutritionOrder`, `Observation`, `Patient`, `Procedure`, `QuestionnaireResponse`, `RiskAssessment`, `ServiceRequest`, `Task`

### Activity types (`request`)

CRL tokens align with the CPG IG Activity Profiles table's Request column with the `Task` suffix dropped consistently. See [`docs/cpg-ig-alignment.md`](docs/cpg-ig-alignment.md) for the full mapping.

`CPGAdministerMedication`, `CPGCommunicationRequest`, `CPGDispenseMedication`, `CPGDocumentMedication`, `CPGEnrollment`, `CPGGenerateReport`, `CPGImmunizationRequest`, `CPGMedicationRequest`, `CPGProposeDiagnosis`, `CPGQuestionnaire`, `CPGRecordDetectedIssue`, `CPGRecordInference`, `CPGReportFlag`, `CPGServiceRequest`

### Parameter types (`param type is`)

The union of concept value types and concept types. v2.2.0 deliberately omits `Practitioner` from the allowlist; emitter-side support exists as a defensive AST path but author syntax is rejected at parse time.

`AdverseEvent`, `AllergyIntolerance`, `Attachment`, `boolean`, `ClinicalImpression`, `CodeableConcept`, `Communication`, `CommunicationRequest`, `Condition`, `dateTime`, `DetectedIssue`, `Device`, `DiagnosticReport`, `DocumentReference`, `Encounter`, `EpisodeOfCare`, `FamilyMemberHistory`, `Flag`, `Goal`, `Immunization`, `integer`, `MedicationAdministration`, `MedicationDispense`, `MedicationRequest`, `MedicationStatement`, `NutritionIntake`, `NutritionOrder`, `Observation`, `Patient`, `Period`, `Procedure`, `Quantity`, `QuestionnaireResponse`, `Range`, `Ratio`, `RiskAssessment`, `SampledData`, `ServiceRequest`, `string`, `Task`, `time`

---

## Keywords and Tokens

- **Keywords:** `library`, `include`, `as`, `decision`, `terminology`, `activity`, `concept`, `parameter`, `when`, `then`, `otherwise`, `recommend activity`, `use decision`, `request`, `with`, `because`, `unless`, `only when`, `first:`, `any:`, `all:`, `end`, `type is`, `value type is`, `param type is`, `evidence is`, `meta is`, `coded from`, `defined as`, `definition is`, `source representation`, `code is`, `system is`, `valueset is`, `do not perform`, `not`, `and`, `or`, `sem-and`, `sem-or`, `sem-not`, `:` (colon), `.` (dot), `-` (dash), `(` (left paren), `)` (right paren)
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
- **Inference body:** `defined as` (a `sem-and`/`sem-or`/`sem-not` tree) or `definition is` (a catalog narrative predicate — the form that replaced the removed `apply pattern`)
- **Terminology Entries:** Can have multiple valuesets and system/code pairs
- **Activity Types:** Must be selected from valid resource types
- **Block Qualifiers:** `any:` and `all:` are optional (default is `any:`)

---

## Emitting FHIR Definition resources

CRL emits CPG-IG-conformant FHIR Definition resources (ValueSet, Library, ActivityDefinition, PlanDefinition) alongside the existing CQL emit.

### CLI

```
crl-emit --path <root.crl> --out-dir <project-root> --target fhir-def
crl-emit --help                                       # print flag reference + exit 0
```

`--help` (alias `-h`) prints the full flag reference, input-dispatch rules, and exit-code table, then exits 0.

**One invocation writes both lanes.** `--target fhir-def` runs the CQL emit lane AND the FHIR-def emit lane atomically — either both succeed and write, or neither writes (no partial state). This is required because the emitted Library resources reference the sibling CQL files via `content[0].attachment.url = "../../cql/<name>.cql"`; shipping FHIR without CQL would produce broken Library references.

Output layout (operator's locked project convention):

```
<project-root>/
   cql/
      <library-name>.cql           ← written from CQL emit lane
   fhir/
      ValueSet/<id>.json
      Library/<id>.json
      ActivityDefinition/<id>.json
      PlanDefinition/<id>.json     ← Recommendations + Decisions both
```

The legacy `--target cql` (or omitting `--target` on a `.crl` file) writes CQL output flat to `--out-dir` per the v2.2.x behavior — useful when you want only CQL.

Exit codes: `0` = clean; `1` = hard errors (CRLError of error severity, or import-time error, or metadata error); `2` = warnings or unresolved references without hard errors.

`.cel` input with `--target` (either value) is a hard error. CEL files emit FHIR instances via the existing CEL pipeline (omit `--target`); definitions are CRL-only.

### What gets emitted per CRL declaration

| CRL declaration | Emitted resources |
|---|---|
| `library "X"` | one `Library` |
| `terminology "T"` | one `ValueSet` |
| `activity "A"` | TWO resources: one `ActivityDefinition` (cpg-`<type>`activity profile) + one wrapping `PlanDefinition` (cpg-recommendationdefinition profile, 1:1 wrapping) |
| `decision "D"` (root — not referenced by any other `use decision`) | one `PlanDefinition` (cpg-strategydefinition profile, workflow-definition type) |
| `decision "D"` (sub — referenced by ≥1 `use decision`) | one `PlanDefinition` (cpg-publishableplandefinition only, eca-rule type) |

### CRL ⟷ FHIR semantics

- `when "C" then recommend activity "A"` → an `action` whose `condition` references concept `C` (CQL identifier expression) and whose `definitionCanonical` points at the Recommendation PlanDefinition wrapping activity `A`.
- `when "C" then use decision "D"` → an `action` whose `definitionCanonical` points at sub-decision `D`.
- Nested `when ... then:` produces nested `action.action[]` until a leaf adds `definitionCanonical`.
- `any:` qualifier → custom `crl-logical-switch` extension URL on the parent action. The corresponding StructureDefinition is NOT shipped (pending CPG ballot). Strict validators may need an ignore-list for the extension URL until the ballot publishes.

### Deliberate deviations from the published CPG IG

- **`version` is stamped on every emitted FHIR definitional resource**, sourced from the npm `package.json` `version` (the authoritative single source of truth). CRMI requires `version` (1..1) at the Shareable floor, so it is emitted unconditionally. Emitted **CQL stays version-less** (the package owns the CQL version). `date` is stamped only at publishable+ capability (CRMI requires `date` 1..1 at Publishable) and is reproducible: resolved from `--date` → `SOURCE_DATE_EPOCH` (env, epoch seconds) → `crl.date` (package.json, ISO) → wall clock. A publishable+ emit with no resolvable date is a hard error (`missing-publishable-date`). Every emitted definitional resource also carries the additive `cqf-knowledgeCapability` codes (up to the target capability) and, except ValueSet, a `cqf-knowledgeRepresentationLevel` of `structured` (Library/ActivityDefinition/PlanDefinition all carry CQL-source-level structured logic; `executable` is reserved for compiled ELM). These are the FHIR-core `cqf-` extensions that the CRMI shareable profiles bind (not the CPG IG's `cpg-` variants). The targeted CRMI version is declared in `package.json` `crl.fhirDependencies` (e.g. `{ "hl7.fhir.uv.cpg": "2.0.0", "hl7.fhir.uv.crmi": "2.0.0-ballot" }`) for provenance — never stamped on a resource.
- **Cross-library concept / terminology references are unsupported in v0.** Same-library qualified refs (`"CurrentLib"."X"`) resolve as bare locals. True cross-library refs cascade-suppress through the existing Todo 3 cascade rules with `unresolved-*` UnmatchedReference entries.
- **`cpg-strategydefinition.action.definition[x]` target-profile** — the published spec constrains this to `canonical(cpg-recommendationdefinition)` only. CRL emit deliberately violates this constraint by referencing publishable-only sub-decisions (matches the cc-screening reference example pattern). The operator is amending the published spec.

### IG dependency note (#104, post-v2.5.0)

The publishable + shareable plan-definition lifecycle profiles moved from CPG STU1's `uv/cpg` namespace into the **CRMI IG** at `uv/crmi` in CPG 2.0.0. CRL emit now stamps the correct canonicals (`crmi-publishableplandefinition`, `crmi-shareablevalueset`). However, **CPG IG 2.0.0 itself does NOT declare a CRMI dependency**, so consumers of these emitted resources should add `hl7.fhir.uv.crmi` to their IG `dependencies` alongside the CPG package.

The two knowledge-* extensions (`cqf-knowledgeCapability`, `cqf-knowledgeRepresentationLevel`) are FHIR-core extensions — no extra dependency needed; they resolve at `hl7.org/fhir/extensions`.

### MCP tools

The `emit_crl_fhir` MCP tool exposes the same emit pipeline for AI assistants. Path-only argument; returns a summary envelope by default. Pass `includeResources: true` to also receive the full `resources[]` array.

The companion **`emit_cel`** MCP tool (added in v2.4.1) emits FHIR instance resources from `.cel` Case Example documents — parity with `emit_cql` + `emit_crl_fhir`. Same shape: path-only, summary by default, `includeResources: true` opts in to the full `emittedCases[]` array.

### Round-trip fixture

A reference round-trip fixture lives at `features/cpg-roundtrip/cc-screening-cognitive-support/`:
- `cc-screening.crl` — the CRL author's representation.
- `expected-fhir/` — the IG reference resources (copied verbatim from the demo-content-r4 colorectal-cancer-screening example).
- `README.md` — documents the 4 deliberate shape deviations (Drift A/B/C/D) where CRL v0's emit differs structurally from the example.

---

## Full Example

See [features/cql-pattern-mining/results/models/cms69-split/cms69-strategy.crl](`https://github.com/alphora/clinical-reasoning-language/blob/main/features/cql-pattern-mining/results/models/cms69-split/cms69-strategy.crl`) for a comprehensive example covering all features and options. A second canonical example built on CMS22 ships at [features/cql-pattern-mining/results/models/cms22-split/cms22-strategy.crl](`https://github.com/alphora/clinical-reasoning-language/blob/main/features/cql-pattern-mining/results/models/cms22-split/cms22-strategy.crl`).

---

## Reference

For the full, up-to-date grammar, see:
- [src/grammar/CRLParser.g4](`https://github.com/alphora/clinical-reasoning-language/blob/main/packages/crl/src/grammar/CRLParser.g4`) parser rules)
- [src/grammar/CRLLexer.g4](`https://github.com/alphora/clinical-reasoning-language/blob/main/packages/crl/src/grammar/CRLLexer.g4`) (lexer rules)

For questions or contributions, see the project repository.
