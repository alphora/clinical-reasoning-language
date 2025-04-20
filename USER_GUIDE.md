# Clinical Practice Guideline Language (CPGL) User Guide

Welcome to the CPGL User Guide! This guide introduces the syntax, structure, and authoring best practices for the Clinical Practice Guideline Language (CPGL).

---

## Table of Contents
- [Introduction](#introduction)
- [Language Structure](#language-structure)
- [Quoting Conventions](#quoting-conventions)
- [Comments](#comments)
- [Top-Level Statements](#top-level-statements)
- [Syntax and Grammar Overview](#syntax-and-grammar-overview)
- [Authoring Guidelines](#authoring-guidelines)
- [Example: A Complete CPGL Library](#example-a-complete-cpgl-library)
- [References](#references)
- [Keywords](#keywords)
- [Keyword Glossary](#keyword-glossary)
- [Valid Types](#valid-types)

---

## Introduction

CPGL (Clinical Practice Guideline Language) is a domain-specific language for expressing clinical practice guidelines in a structured, machine-readable, and human-friendly format. It is inspired by HL7's Clinical Quality Language (CQL) but is tailored for guideline authoring, decision support, and computable care pathways.

CPGL is designed to:
- Enable clear, unambiguous representation of clinical logic
- Support decision, concept, activity, and terminology definitions
- Be easy to read, write, and validate

---

## Language Structure

CPGL is built from a small set of basic elements, called **tokens**:
- **Symbols**: e.g., `:`, `.`, `(`, `)`
- **Keywords**: e.g., `decision`, `concept`, `activity`, `terminology`, `when`, `then`, `do`, `use`, `has`, `type`, `valuetype`, `coded`, `by`, `inferred`, `done`, `because`, `of`, `system`, `code`, `valueset`, `and`, `or`, `not`, `any`, `all`
- **Literals**: e.g., numbers, backtick-quoted free text (`` `markdown or free text` ``)
- **Identifiers**: always double-quoted (e.g., `"Colonoscopy"`, `"BMI Valueset"`)

Whitespace (spaces, tabs, newlines) separates tokens and is ignored except where required for readability.

---

## Quoting Conventions

CPGL enforces strict quoting rules for clarity and unambiguous parsing:

- **Identifiers and references**: Always use double quotes (`"Identifier"`).
  - Examples: `"Colonoscopy"`, `"BMI Valueset"`, `"Propose Diagnosis Task"`
- **Free text, markdown, and provenance**: Always use backticks (`` `free text or markdown` ``).
  - Examples: `` `This is *markdown*` ``, `` `A rationale for the action` ``
- **Single quotes are not used** as delimiters in CPGL.

## Comments

CPGL supports two types of comments:

- **Single-line comments** start with `//` and continue to the end of the line.
  - Example:
    ```cpgl
    // This is a single-line comment
    decision "BMI":
      when "BMI > 30" then do "Propose Diagnosis Task".
    done
    ```

- **Block comments** are enclosed in `/* ... */` and can span multiple lines.
  - Example:
    ```cpgl
    /*
      This is a block comment.
      It can span multiple lines.
    */
    concept "BMI":
      has type Observation.
      has valuetype Quantity.
      inferred by ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").
    done
    ```

Comments can be placed anywhere whitespace is allowed. They are ignored by the lexer and parser and do not affect the meaning of the CPGL document.

---

## Top-Level Statements

A CPGL document consists of a sequence of **statements**. The main statement types are:

- **Decision**: Defines a clinical decision with conditions and actions.
- **Concept**: Defines a clinical concept, its type, value type, provenance, and logic.
- **Activity**: Defines an activity to be performed, with type, value, and rationale.
- **Terminology**: Defines a terminology set, system/code, or free text.

Each statement has a specific structure, as defined by the grammar.

---

## Syntax and Grammar Overview

Below are the main constructs, with simplified syntax and examples. For full details, see the [CPGL grammar](./src/grammar/CPGLParser.g4) and [lexer](./src/grammar/CPGLLexer.g4).

### 1. Decision Statement

```cpgl
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

```cpgl
concept "Concept Name":
  has type Condition.
  has valuetype boolean.
  has provenance `Provenance or markdown info`.
  inferred by ("Other Concept" and "Another Concept").
done
```

### 3. Activity Statement

```cpgl
activity "Activity Name" perform CPGImmunizationRequest of "Colonoscopy".
activity "Notify" perform CPGCommunicationRequest of `A notification message` because `Rationale for notification`.
```

### 4. Terminology Statement

```cpgl
terminology "BMI Valueset" valueset "bmi valueset".
terminology "Colonoscopy" system `http://snomed.info/sct` code `73761001`.
```

---

## Authoring Guidelines

- **Always use double quotes for identifiers and references.**
- **Always use backticks for free text, markdown, and provenance.**
- **End statements with a period (`.`) or `done` as required by the grammar.**
- **Indent nested blocks for readability.**
- **Use keywords and symbols exactly as defined in the grammar.**
- **Validate your CPGL files using the CLI tools before publishing.**

---

## Example: A Complete CPGL Library

```cpgl
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
  has type Condition.
  has valuetype CodeableConcept.
  coded by "BMI Valueset".
done

activity "Notify" perform CPGCommunicationRequest of `A notification message` because `Notify the clinician of the result`.

terminology "BMI Valueset" valueset "bmi valueset".
terminology "Colonoscopy" system `http://snomed.info/sct` code `73761001`.
```

---

## References
- [CPGL Grammar (CPGLParser.g4)](./src/grammar/CPGLParser.g4)
- [CPGL Lexer (CPGLLexer.g4)](./src/grammar/CPGLLexer.g4)

---

For more details, see the [README](./README.md) and the CLI tools for validation and processing.

## Keywords

The following are all reserved keywords in CPGL:

- `activity`
- `all`
- `and`
- `any`
- `because`
- `by`
- `coded`
- `code`
- `concept`
- `condition`
- `decision`
- `do`
- `done`
- `has`
- `inferred`
- `not`
- `of`
- `or`
- `perform`
- `provenance`
- `system`
- `terminology`
- `then`
- `type`
- `use`
- `valuetype`
- `valueset`
- `when`

## Keyword Glossary

Below is a glossary of all keywords, with descriptions and usage examples:

- **activity**: Declares an activity statement.
  - Example: `activity "Vaccinate" perform CPGImmunizationRequest.`

- **all**: Used in block bodies to require all conditions/actions.
  - Example: `all: when "A" then do "B". done`

- **and**: Logical operator for combining concepts in inferred-by logic.
  - Example: `inferred by ("A" and "B").`

- **any**: Used in block bodies to require any of the conditions/actions.
  - Example: `any: when "A" then do "B". done`

- **because**: Introduces a rationale (free text) for an activity.
  - Example: ``activity "Notify" perform CPGCommunicationRequest because `A rationale here`.``

- **by**: Used in `coded by` and `inferred by` clauses in concepts.
  - Example: `coded by "BMI Valueset".`

- **coded**: Used in `coded by` clause for concepts.
  - Example: `coded by "BMI Valueset".`

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

- **has**: Used to specify properties of a concept.
  - Example: `has type Condition.`

- **inferred**: Used in `inferred by` clause for concepts.
  - Example: `inferred by ("A" or "B").`

- **not**: Logical negation in inferred-by logic.
  - Example: `inferred by (not "A").`

- **of**: Used in activity statements to specify a value or reference.
  - Example: `activity "Indicate" perform CPGProposeDiagnosis of "Colonoscopy".`

- **or**: Logical operator for alternatives in inferred-by logic.
  - Example: `inferred by ("A" or "B").`

- **perform**: Specifies the activity type in an activity statement.
  - Example: `activity "Vaccinate" perform CPGImmunizationRequest.`

- **provenance**: Used to specify provenance (free text) for a concept.
  - Example: ``has provenance `Some provenance info`.``

- **system**: Used in terminology statements to specify a code system.
  - Example: ``terminology "Colonoscopy" system `http://snomed.info/sct` code `73761001`.``

- **terminology**: Declares a terminology statement.
  - Example: `terminology "BMI Valueset" valueset "bmi valueset".`

- **then**: Used in decision statements to introduce the action block.
  - Example: `when "BMI > 30" then do "Propose Diagnosis Task".`

- **type**: Used to specify the type of a concept.
  - Example: `has type Condition.`

- **use**: Used in actions to reference another decision.
  - Example: `use "Other Decision".`

- **valuetype**: Used to specify the value type of a concept.
  - Example: `has valuetype boolean.`

- **valueset**: Used in terminology statements to specify a valueset.
  - Example: `terminology "BMI Valueset" valueset "bmi valueset".`

- **when**: Used in decision statements to introduce a condition.
  - Example: `when "BMI > 30" then do "Propose Diagnosis Task".`

## Valid Types

### Activity Types
The following are valid activity types (case sensitive):
- CPGCommunicationRequest
- CPGCollectInformation
- CPGEnrollment
- CPGGenerateReport
- CPGMedicationRequest
- CPGDispenseMedication
- CPGAdministerMedication
- CPGDocumentMedication
- CPGImmunizationRequest
- CPGServiceRequest
- CPGProposeDiagnosisTask
- CPGRecordDetectedIssue
- CPGRecordInference
- CPGReportFlagTask

Example:
```cpgl
activity "Vaccinate" perform CPGImmunizationRequest.
```

### Concept Types
The following are valid concept types (case sensitive):
- Communication
- CommunicationRequest
- Condition
- QuestionnaireTask
- QuestionnaireResponse
- MedicationRequest
- MedicationDispense
- MedicationAdministration
- MedicationStatement
- ImmunizationRequest
- Immunization
- ServiceRequest
- Procedure
- Observation

Example:
```cpgl
concept "BMI Range as a Condition":
  has type Condition.
  has valuetype CodeableConcept.
  coded by "BMI Valueset".
done
```

### Concept Value Types
The following are valid concept value types (case sensitive):
- Quantity
- CodeableConcept
- string
- boolean
- integer
- Range
- Ratio
- SampledData
- time
- dateTime
- Period
- Attachment

Example:
```cpgl
concept "BMI":
  has type Observation.
  has valuetype Quantity.
  inferred by ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").
done
``` 