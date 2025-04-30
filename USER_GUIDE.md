# Clinical Reasoning Language (CRL) User Guide

Welcome to the CRL User Guide! This guide introduces the syntax, structure, and authoring best practices for the Clinical Reasoning Language (CRL).

---

## Table of Contents
- [Introduction](#introduction)
- [Language Structure](#language-structure)
- [Quoting Conventions](#quoting-conventions)
- [Comments](#comments)
- [Top-Level Statements](#top-level-statements)
- [Syntax and Grammar Overview](#syntax-and-grammar-overview)
- [Authoring Guidelines](#authoring-guidelines)
- [Activity Deduplication and Reference Resolution](#activity-deduplication-and-reference-resolution)
- [Example: A Complete CRL Library](#example-a-complete-crl-library)
- [References](#references)
- [Keywords](#keywords)
- [Keyword Glossary](#keyword-glossary)
- [Valid Types](#valid-types)

---

## Introduction

CRL (Clinical Reasoning Language) is a domain-specific language for expressing clinical practice guidelines in a structured, machine-readable, and human-friendly format. It is inspired by HL7's Clinical Quality Language (CQL) but is tailored for guideline authoring, decision support, and computable care pathways.

CRL is designed to:
- Enable clear, unambiguous representation of clinical logic
- Support decision, concept, activity, and terminology definitions
- Be easy to read, write, and validate

---

## Language Structure

CRL is built from a small set of basic elements, called **tokens**:
- **Symbols**: e.g., `:`, `.`, `(`, `)`
- **Keywords**: e.g., `decision`, `concept`, `activity`, `terminology`, `when`, `then`, `do`, `use`, `type`, `valuetype`, `coded`, `from`, `inferred`, `done`, `because`, `system`, `code`, `valueset`, `and`, `or`, `not`, `any`, `all`, `with`, `pattern`, `apply`, `evidence`
- **Literals**: e.g., numbers, backtick-quoted free text (`` `markdown or free text` ``)
- **Identifiers**: always double-quoted (e.g., `"Colonoscopy"`, `"BMI Valueset"`)

Whitespace (spaces, tabs, newlines) separates tokens and is ignored except where required for readability.

---

## Quoting Conventions

CRL enforces strict quoting rules for clarity and unambiguous parsing:

- **Identifiers and references**: Always use double quotes (`"Identifier"`).
  - Examples: `"Colonoscopy"`, `"BMI Valueset"`, `"Propose Diagnosis Task"`
- **Free text, markdown, and evidence**: Always use backticks (`` `free text or markdown` ``).
  - Examples: `` `This is *markdown*` ``, `` `A rationale for the action` ``, `` `http://snomed.info/sct` ``
- **Single quotes are not used** as delimiters in CRL.

## Comments

CRL supports two types of comments:

- **Single-line comments** start with `//` and continue to the end of the line.
  - Example:
    ```crl
    // This is a single-line comment
    decision "BMI":
      when "BMI > 30" then do "Propose Diagnosis Task".
    done
    ```

- **Block comments** are enclosed in `/* ... */` and can span multiple lines.
  - Example:
    ```crl
    /*
      This is a block comment.
      It can span multiple lines.
    */
    concept "BMI":
      type is Observation.
      valuetype is Quantity.
      inferred from ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").
    done
    ```

Comments can be placed anywhere whitespace is allowed. They are ignored by the lexer and parser and do not affect the meaning of the CRL document.

---

## Top-Level Statements

A CRL document consists of a sequence of **statements**. The main statement types are:

- **Decision**: Defines a clinical decision with conditions and actions.
- **Concept**: Defines a clinical concept, its type, value type, evidence, and logic.
- **Activity**: Defines an activity to be performed, with type, value, and rationale.
- **Terminology**: Defines a terminology set, system/code, or free text.

Each statement has a specific structure, as defined by the grammar.

---

## Syntax and Grammar Overview

Below are the main constructs, with simplified syntax and examples. For full details, see the [CRL grammar](./src/grammar/CRLParser.g4) and [lexer](./src/grammar/CRLLexer.g4).

### 1. Decision Statement

```crl
decision "Decision Name":
  when "Concept Name" then do "Activity Name".
  when "Other Concept" then:
    any:
      when "Nested Concept" then do "Nested Activity".
    done
  done
  when "Another Concept" then use "Other Decision".
done
```

### 2. Concept Statement

```crl
concept "Concept Name":
  type is Condition.
  valuetype is boolean.
  evidence is `Provenance or markdown info`.
  inferred from ("Other Concept" and "Another Concept").
done
```

### 3. Activity Statement

```crl
activity "Activity Name" perform CPGImmunizationRequest with "Colonoscopy".
activity "Notify" perform CPGCommunicationRequest with `A notification message` because `Rationale for notification`.
```

### 4. Terminology Statement

```crl
terminology "BMI Valueset" valueset `bmi valueset`.
terminology "Colonoscopy" system `http://snomed.info/sct` code `73761001`.
```

---

## Authoring Guidelines

- **Always use double quotes for identifiers and references.**
- **Always use backticks for free text, markdown, and evidence.**
- **End statements with a period (`.`) or `done` as required by the grammar.**
- **Indent nested blocks for readability.**
- **Use keywords and symbols exactly as defined in the grammar.**
- **Validate your CRL files using the CLI tools before publishing.**

---

## Activity Deduplication and Reference Resolution

When using the FSH-to-CRL transformer, the tool automatically deduplicates activities and manages references as follows:

- **Deduplication:**  
  Each unique combination of activity name and value is defined only once in the output.  
  If multiple activities share the same name but have different values, suffixes (`_2`, `_3`, etc.) are added to the name (inside the quotes) to ensure uniqueness.

- **Reference Replacement:**  
  All references to activities in `do` statements are updated to use the final, unique name (with suffix if needed).

- **Quoting and Escaping:**  
  Quoting and escaping of activity names is handled automatically by the transformer.

**Example:**
```crl
// If two activities have the same name but different values:
activity "Last Live Vaccine Administered Within 4 Weeks"
    perform CPGCommunicationRequest
    with `Should not vaccinate client for MCV0 ...`.

activity "Last Live Vaccine Administered Within 4 Weeks_2"
    perform CPGCommunicationRequest
    with `Should not vaccinate client for MCV1 ...`.
```

For more technical details, see the [Activity Deduplication and Reference Requirements](./src/transformer/fsh-to-crl/docs/Activity%20Deduplication%20and%20Reference%20Requirements.md).

---

## Example: A Complete CRL Library

```crl
decision "IMMZ.D2.D5.Measles":
  when "Measles Routine Immunization Schedule Incomplete" then:
    any:
      when "No Primary Series Doses Administered" then:
        when "Client Age Less Than 12 Months" then do "Indicate".
        when "Last Live Vaccine Administered has had in 4 Weeks" then use "Elderly Based".
      done
      when "Client Is Due For MCV12" then do "Vaccinate".
    done
  done
  when "One Primary Series Dose Administered" then:
    all:
      when "Client Age Less Than 15 Months" then do "Indicate".
      when "Last Live Vaccine Administered has had in 4 Weeks" then use "Elderly Based".
      when "Client Is Due For MCV12" then do "Vaccinate".
    done
  done
  when "Two Primary Series Doses Administered" then do "Indicate".
done

concept "BMI Range as a Condition":
  type is Condition.
  valuetype is CodeableConcept.
  coded from "BMI Valueset".
done

activity "Notify" perform CPGCommunicationRequest with `A notification message` because `Notify the clinician of the result`.

terminology "BMI Valueset" valueset `bmi valueset`.
terminology "Colonoscopy" system `http://snomed.info/sct` code `73761001`.
```

---

## References
- [CRL Grammar (CRLParser.g4)](./src/grammar/CRLParser.g4)
- [CRL Lexer (CRLLexer.g4)](./src/grammar/CRLLexer.g4)

---

For more details, see the [README](./README.md) and the CLI tools for validation and processing.

## Keywords

The following are all reserved keywords in CRL:

- `activity`
- `all`
- `and`
- `any`
- `apply`
- `because`
- `coded`
- `code`
- `concept`
- `decision`
- `do`
- `done`
- `evidence`
- `from`
- `inferred`
- `not`
- `or`
- `pattern`
- `perform`
- `system`
- `terminology`
- `then`
- `type`
- `use`
- `valuetype`
- `valueset`
- `when`
- `with`

## Keyword Glossary

Below is a glossary of all keywords, with descriptions and usage examples:

- **activity**: Declares an activity statement.
  - Example: `activity "Vaccinate" perform CPGImmunizationRequest.`

- **all**: Used in block bodies to require all conditions/actions.
  - Example: `all: when "A" then do "B". done`

- **and**: Logical operator for combining concepts in inferred-from logic.
  - Example: `inferred from ("A" and "B").`

- **any**: Used in block bodies to require any of the conditions/actions.
  - Example: `any: when "A" then do "B". done`

- **apply**: Used to apply a pattern in concept inference.
  - Example: `inferred from "BMI" apply pattern `Most Recent(this, lookbackMonths)`.`

- **because**: Introduces a rationale (free text) for an activity.
  - Example: ``activity "Notify" perform CPGCommunicationRequest because `A rationale here`.``

- **coded**: Used in `coded from` clause for concepts.
  - Example: `coded from "BMI Valueset".`

- **code**: Used in terminology statements to specify a code.
  - Example: ``terminology "Colonoscopy" system `http://snomed.info/sct` code `73761001`.``

- **concept**: Declares a concept statement.
  - Example: See BMI example below.

- **decision**: Declares a decision statement.
  - Example: `decision "Check BMI": ... done`

- **do**: Used in actions to perform an activity.
  - Example: `do "Vaccinate".`

- **done**: Marks the end of a block or statement.
  - Example: `done`

- **evidence**: Used to specify evidence (free text) for a concept.
  - Example: ``evidence is `Some evidence info`.``

- **from**: Used in `coded from` and `inferred from` clauses in concepts.
  - Example: `coded from "BMI Valueset".`

- **inferred**: Used in `inferred from` clause for concepts.
  - Example: `inferred from ("A" or "B").`

- **not**: Logical negation in inferred-from logic.
  - Example: `inferred from (not "A").`

- **or**: Logical operator for alternatives in inferred-from logic.
  - Example: `inferred from ("A" or "B").`

- **pattern**: Used in pattern application in concept inference.
  - Example: `apply pattern `Most Recent(this, lookbackMonths)`.`

- **perform**: Specifies the activity type in an activity statement.
  - Example: `activity "Vaccinate" perform CPGImmunizationRequest.`

- **system**: Used in terminology statements to specify a code system.
  - Example: ``terminology "Colonoscopy" system `http://snomed.info/sct` code `73761001`.``

- **terminology**: Declares a terminology statement.
  - Example: `terminology "BMI Valueset" valueset `bmi valueset`.`

- **then**: Used in decision statements to introduce the action block.
  - Example: `when "BMI > 30" then do "Propose Diagnosis Task".`

- **type**: Used to specify the type of a concept.
  - Example: `type is Condition.`

- **use**: Used in actions to reference another decision.
  - Example: `use "Other Decision".`

- **valuetype**: Used to specify the value type of a concept.
  - Example: `valuetype is boolean.`

- **valueset**: Used in terminology statements to specify a valueset.
  - Example: `terminology "BMI Valueset" valueset `bmi valueset`.`

- **when**: Used in decision statements to introduce a condition.
  - Example: `when "BMI > 30" then do "Propose Diagnosis Task".`

- **with**: Used in activity statements to specify a value or reference.
  - Example: `activity "Indicate" perform CPGProposeDiagnosis with "Colonoscopy".`

## Valid Types

### Activity Types
The following are valid activity types (case sensitive):
- CPGAdministerMedication
- CPGCollectInformation
- CPGCommunicationRequest
- CPGDispenseMedication
- CPGRecordInference
- CPGReportFlagTask
- CPGServiceRequest

Example:
```crl
activity "Vaccinate" perform CPGImmunizationRequest.
```

### Concept Types
The following are valid concept types (case sensitive):
- AdverseEvent
- AllergyIntolerance
- ClinicalImpression
- Communication
- CommunicationRequest
- Condition
- DetectedIssue
- Device
- DiagnosticReport
- Encounter
- FamilyMemberHistory
- Goal
- Immunization
- MedicationAdministration
- MedicationDispense
- MedicationRequest
- NutritionIntake
- NutritionOrder
- Observation
- Procedure
- QuestionnaireResponse
- RiskAssessment
- ServiceRequest
- Task

Example:
```crl
concept "BMI Range as a Condition":
  type is Condition.
  valuetype is CodeableConcept.
  coded from "BMI Valueset".
done
```

### Concept Value Types
The following are valid concept value types (case sensitive):
- Attachment
- boolean
- CodeableConcept
- dateTime
- integer
- Period
- Quantity
- Range
- Ratio
- SampledData
- string
- time

Example:
```crl
concept "BMI":
  type is Observation.
  valuetype is Quantity.
  inferred from ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").
done
``` 