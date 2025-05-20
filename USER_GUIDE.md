# Clinical Reasoning Language (CRL) User Guide

## Overview

Clinical Reasoning Language (CRL) is a domain-specific language for expressing clinical logic, concepts, activities, terminologies, and decisions in a readable, structured, and computable format. This guide describes the syntax, structure, and features of CRL as defined by the latest grammar and lexer.

---

## File Structure

- **Header:** Every CRL file must start with a markdown header line beginning with `#`.
- **Statements:** The file contains any number of statements: `decision`, `terminology`, `activity`, and `concept`.
- **Comments:**
  - Single-line comments: `// ...`
  - Block comments: `/* ... */`

---

## Quoting and String Conventions

- **Identifiers** (names, references): Double quotes (`"...")`.
  - Example: `"BMI Valueset"`, `"Colonoscopy"`
- **Free text, markdown, evidence, meta, system/code values:** Backticks (`` `...` ``).
  - Example: `` `Some *markdown* text` ``
- **No escape characters** are allowed in quoted strings.

---

## Statement Types

### 1. Decision Statement

Defines reusable decision logic blocks with `when` conditions and actions.

```crl
decision "Decision Name":
  - when "Concept Name" then recommend activity "Activity Name".
  - when "Other Concept" then:
      any:
      - recommend activity "A".
      - use decision "B".
  - end when
```

#### Structure
- `decision "Name": ...` (colon required)
- One or more `when` blocks
- `when` block can:
  - Directly recommend or use an activity/decision
  - Contain a block body (with `any:` or `all:` qualifier, optional)
  - Be nested
- End block with `- end when`

#### Actions
- `recommend activity "Activity Name".`
- `use decision "Decision Name".`

---

### 2. Terminology Statement

Defines a terminology reference, which can be a valueset or a system/code pair. Multiple valuesets and system/code pairs are allowed.

```crl
terminology "BMI Valueset":
- valueset is `BMI`.

terminology "Colonoscopy":
- system is `http://snomed.info/sct`.
  - code is `73761001`.
- code is `73761002`.
```

#### Structure
- `terminology "Name": ...` (colon required)
- One or more lines:
  - `- valueset is `valuesetName`.`
  - `- system is `systemUri`.` (followed by one or more `- code is `codeValue`.` lines)

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
- `activity "Name": ...` (colon required)
- Required: `- request [do not perform] ACTIVITY_TYPE.`
- Optional: `- with "Terminology".` or `- with `Free text`.`
- Optional: `- because `Rationale`.`

#### Activity Types
- Must be one of the allowed types (see grammar for full list, e.g., `CPGImmunizationRequest`, `CPGProposeDiagnosisTask`, etc.)
- `do not perform` is an optional prefix to the activity type.

---

### 4. Concept Statement

Defines a reusable clinical concept. Must be either coded from a terminology or inferred from other concepts. Supports multiple meta lines and optional evidence.

```crl
concept "Most Recent BMI":
- type is Observation.
- valuetype is boolean.
- meta is `Some meta information`.
- meta is `Some other meta information`.
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
- `concept "Name": ...` (colon required)
- Required: `- type is CONCEPT_TYPE.`
- Required: `- valuetype is CONCEPT_VALUE_TYPE.`
- Optional: Any number of `- meta is `Meta info`.` lines
- Optional: `- evidence is `Evidence info`.`
- Required: Either `- coded from "Terminology".` or one of the following inference forms:
  - `- inferred from "Concept".` (optionally followed by one or more `- apply pattern `PatternName`.` lines)
  - `- inferred from ( ...logical expression... ).`

#### Inference
- `inferred from "Concept".` — single concept reference
- `inferred from ( ... )` — logical expression using `and`, `or`, `not`, parentheses, and concept references
- `apply pattern` — can follow a single concept reference, and can be repeated

#### Example Logical Expression
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

- **Keywords:** `decision`, `terminology`, `activity`, `concept`, `when`, `then`, `recommend activity`, `use decision`, `request`, `with`, `because`, `type is`, `valuetype is`, `evidence is`, `meta is`, `coded from`, `inferred from`, `apply pattern`, `system is`, `code is`, `valueset is`, `any:`, `all:`, `do not perform`, `not`, `and`, `or`, `end when`, `:` (colon), `.` (dot), `-` (dash)
- **Identifiers:** Double-quoted strings
- **Free text/markdown:** Backtick-quoted strings
- **Comments:** `// ...` or `/* ... */`

---

## Notes and Best Practices

- **Case Sensitivity:** CRL is case sensitive.
- **Whitespace/Indentation:** Not significant.
- **Header:** File must start with a markdown header line (`# ...`).
- **Quoted Strings:** No escape characters allowed.
- **Meta Lines:** Multiple `meta is` lines are allowed per concept.
- **Evidence:** Only one `evidence is` line per concept.
- **Pattern Application:** Only allowed after a single concept reference in `inferred from`.
- **Terminology:** Can have multiple valueset and system/code pairs.
- **Activity Types:** Must be from the allowed set (see grammar).
- **Block Qualifiers:** `any:` and `all:` are optional in decision block bodies (default is `any`).

---

## Full Example

See `docs/clinical-reasoning-language-example.crl` for a comprehensive example covering all features and options.

---

## Reference

For the full, up-to-date grammar, see:
- `src/grammar/CRLParser.g4` (parser rules)
- `src/grammar/CRLLexer.g4` (lexer rules)

For questions or contributions, see the project repository. 