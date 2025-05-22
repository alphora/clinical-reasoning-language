
# Clinical Reasoning Language (CRL) User Guide

## Overview

Clinical Reasoning Language (CRL) is a domain-specific language for expressing clinical logic, concepts, activities, terminologies, and decisions in a readable, structured, and computable format. This guide describes the syntax, structure, and features of CRL as defined by the latest grammar and lexer.

---

## File Structure

- **Header:** Every CRL file must start with a markdown header line beginning with `#`, which is stored in the AST as the `header` field.
- **Statements:** The file contains any number of statements: `decision`, `terminology`, `activity`, and `concept`.
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

## Keywords and Tokens

- **Keywords:** `decision`, `terminology`, `activity`, `concept`, `when`, `then`, `recommend activity`, `use decision`, `request`, `with`, `because`, `type is`, `valuetype is`, `evidence is`, `meta is`, `coded from`, `inferred from`, `apply pattern`, `system is`, `code is`, `valueset is`, `any:`, `all:`, `do not perform`, `not`, `and`, `or`, `end when`, `:` (colon), `.` (dot), `-` (dash), `(` (left paren), `)` (right paren)
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
