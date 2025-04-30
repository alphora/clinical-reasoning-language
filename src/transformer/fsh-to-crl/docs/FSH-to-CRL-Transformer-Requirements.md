# FSH-to-CRL Transformer: Comprehensive Requirements

## 1. Introduction

This document specifies the requirements for implementing a transformer that converts FHIR Shorthand (FSH) files into Clinical Reasoning Language (CRL) files. It merges and deduplicates the content from the project's mapping rules, implementation requirements, and SUSHI usage notes. It also includes a summary of the CRL grammar and a canonical example for reference.

---

## 2. Technical Approach: Using SUSHI Programmatically

- Use the [SUSHI](https://github.com/FHIR/sushi) tool as a library to parse `.fsh` files into structured TypeScript objects.
- The main entry point is the `FSHTank` class, which provides access to all parsed FSH resources.
- Example usage:

```ts
import { loadConfiguration } from 'fsh-sushi';
import { FSHTank } from 'fsh-sushi';
import { FHIRDefinitions, loadFromPath } from 'fsh-sushi';

async function parseFSHFiles(pathToFSH: string) {
  const defs = new FHIRDefinitions();
  await loadFromPath(defs, './path-to-fhir-definitions');

  const config = loadConfiguration(pathToFSH);
  const tank = new FSHTank(config, pathToFSH);
  const docs = tank.getAllDocuments();

  const allInstances = tank.getAllInstances();
  for (const inst of allInstances) {
    console.log(inst.name, inst.instanceOf, inst.rules);
  }
}
```
- Iterate over `tank.getAllInstances()` and inspect properties such as `.name`, `.instanceOf`, and `.rules`.
- Write helper functions to traverse and extract relevant FSH data for mapping.

---

## 3. Mapping Rules: FSH to CRL

### 3.1. Definitions
- **PlanDefinition** (strategydefinition or recommendationdefinition) maps to `decision`.
- **ActivityDefinition** (immunizationactivity or servicerequestactivity) maps to `activity`.
- CRL expects that each `decision`, `when`, `do`, `use`, `activity`, `concept`, and `terminology` can be inferred from FHIR fields via these rules.

### 3.2. Top-Level Mappings
- `plandef > decision`: `PlanDefinition.name` → `decision "<PlanDefinition.name>"`

### 3.3. Decision-Level Attributes
- `plandef-title > decision.when.identifier`: `PlanDefinition.action.title` → `when "<title>"`
- `plandef-condition.expression > decision.when.identifier`: `PlanDefinition.action.condition.expression.expression` → `when "<expression>"`
- `plandef-condition > concept`: If action has a condition, the string becomes a `concept` identifier

### 3.4. when-action Blocks
- `plandef-action > decision.when`: Recursively walk through all `PlanDefinition.action[]`
  - If `action.definitionCanonical` points to another PlanDefinition, emit `use "<referenced PlanDefinition.name>"`
  - If `action.definitionCanonical` points to an ActivityDefinition, emit `do "<ActivityDefinition.name>"`
  - If `action` has no children or `definitionCanonical`, emit `do "<title>"` or `do "<generated activity name>"`

### 3.5. Comments and Rationale
- `plandef-description > decision.comment`: `PlanDefinition.description` → comment block above the `decision` (optional)
- `plandef-rationale > decision.rationale`: If available, transform into `rationale` block inside `decision`

### 3.6. Canonical References
- `plandef-canonical > decision.when.use`: `PlanDefinition.action.definitionCanonical` → `use "<PlanDefinition.name>"`

### 3.7. Activity Mapping
- `activitydef > activity`: `ActivityDefinition.name` → `activity "<name>"`
- `activitydef-description > activity.identifier`: `ActivityDefinition.description` or `title` → `of "<description>"`
- `activitydef-kind > activity.perform`: `ActivityDefinition.kind` (e.g., #MedicationRequest) → `perform <ActivityType>`
- `activitydef-code-display > activity.perform.of`: If `ActivityDefinition.code.display` exists, append `of "<display>"`
- `activitydef-code-display > terminology.identifier`: `code.display` used for `terminology "<display>"`
- `activitydef-code > terminology.code`: `code.code` used for `terminology.code`

### 3.8. Concept Mapping
- `plandef-condition > concept`: Each `action.condition.expression.expression` → generates a concept block
- `plandef-condition-expression > concept.identifier`: The condition string becomes the `concept` identifier
- Concepts are emitted with:
  ```
  concept "<identifier>":
    has type Observation.
    has valuetype boolean.
    coded by "<terminology_id>".
  done
  ```

### 3.9. Terminology
- `coded by` references a `terminology` block:
  ```
  terminology "<TermName>" system "<TopDecisionName>" code "<ConceptCode>"
  ```
  - ConceptCode = identifier with spaces removed or kebab-cased

### 3.10. FSH Path Functions
- `toIdentifier()`: Ensures the value meets CRL identifier requirements (double-quoted string)
- `toString()`: Ensures the value meets CRL string requirements (double-quoted string, with escapes)
- `remove(string)`: Removes all instances of the argument string
- `where(clause)`: Only generate a CRL value if the clause is satisfied
- `extractCode()`, `extractCodeDisplay()`, `extractCodeExpression()`: Regex-based transforms for code extraction (see mapping doc for details)

### 3.11. Navigation
- Navigation from one FSH resource to another is via `definitionCanonical`, referencing the `Instance` value of another resource

---

## 4. CRL Grammar (Summary)

The CRL language is defined by the following ANTLR grammars:
- [CRLLexer.g4](../../../../grammar/CRLLexer.g4)
- [CRLParser.g4](../../../../grammar/CRLParser.g4)

### Key Syntax Elements
- **Identifiers and references**: Double-quoted strings (e.g., `"Colonoscopy"`)
- **Free text/markdown**: Backtick-quoted strings (e.g., `` `Some *markdown* text` ``)
- **Statements**: `decision`, `activity`, `concept`, `terminology`
- **Blocks**: Indented or colon-delimited, terminated by `done`
- **Action statements**: `do`, `use`, `perform`, `of`, `because`
- **Concepts**: Have `type`, `valuetype`, and may be `coded by` or `inferred by`
- **Terminology**: May specify `system` and `code`

For full details, see the referenced grammar files.

---

## 5. Canonical Example: CRL Output

Below is a canonical CRL example, excerpted from a real transformation output. This demonstrates the mapping of FSH PlanDefinitions and ActivityDefinitions to CRL decisions, activities, concepts, and terminology.

```crl
// Decision for IMMZDTImmunizationStrategy instance
decision "IMMZDTImmunizationStrategy":
    when "Check Immunizations" then:
        when "Measles Dose 0" then use "IMMZD2DTMeaslesDose0".
        when "Measles Routine Immunization" then use "OTIMMZD2DTMeasles".
        when "Measles Supplementary Dose" then use "IMMZD2DTMeaslesSupplementary".
        when "Measles Contraindications" then use "IMMZD5DTMeaslesCI".
    done
done

// Activity for "IMMZD2DTMeaslesDose0"
activity "IMMZD2DTMeaslesDose0_activity" perform CPGCommunicationRequest of `Ensure proper dosage based on patient weight.`.

// Concept declaration
concept "Check Immunizations":
    has type Observation.
    has valuetype boolean.
    coded by "IMMZDTImmunizationStrategy_CheckImmunizations_Term".
done
terminology "IMMZDTImmunizationStrategy_CheckImmunizations_Term" system `IMMZDTImmunizationStrategy` code `CheckImmunizations`.
```

For a full example, see [`IMMZ_All_Decisions.crl`](../../../../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl).

---

## 6. Implementation Notes
- All code must be written in TypeScript.
- The transformer must be cross-platform (Windows, Mac, Linux).
- Use platform-independent file and path handling.
- Follow the project's development and logging guidelines.
- Write modular, maintainable code; refactor if files exceed 200–300 lines.

---

## 7. References
- [FSH-CRL-Mapping.md](./FSH-CRL-Mapping.md)
- [Implemenation Requirements.md](./Implemenation%20Requirements.md)
- [SushiVisitor.md](./SushiVisitor.md)
- [CRLLexer.g4](../../../../grammar/CRLLexer.g4)
- [CRLParser.g4](../../../../grammar/CRLParser.g4)
- [IMMZ_All_Decisions.crl](../../../../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl) 