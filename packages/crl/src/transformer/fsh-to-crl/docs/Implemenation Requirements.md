To ensure the mapping rules fully describe the requirements necessary to implement a FSH-to-CRL transformer, we must analyze whether each CRL construct can be derived unambiguously from available FSH fields. Below is a rewritten and *complete* description of the transformation rules, grounded in the CRL syntax and semantics.

---

# FSH-to-CRL Transformation Mapping Rules (Complete Specification)

## Definitions
- **PlanDefinition (strategydefinition or recommendationdefinition)** maps to `decision`
- **ActivityDefinition (immunizationactivity or servicerequestactivity)** maps to `activity`
- CRL expects that each `decision`, `when`, `do`, `use`, `activity`, `concept`, and `terminology` can be inferred from FHIR fields via these rules.

---

## Mapping Rules

### Top-Level Mappings
- `plandef > decision`
  - `PlanDefinition.name` -> `decision "<PlanDefinition.name>"`

### Decision-Level Attributes
- `plandef-title > decision.when.identifier`
  - `PlanDefinition.action.title` -> `when "<title>"`
- `plandef-condition.expression > decision.when.identifier`
  - `PlanDefinition.action.condition.expression.expression` -> `when "<expression>"`
- `plandef-condition > concept`
  - If action has a condition, the string becomes a `concept` identifier

### when-action blocks
- `plandef-action > decision.when`
  - Recursively walk through all `PlanDefinition.action[]`
  - If `action.definitionCanonical` points to another PlanDefinition, emit `use "<referenced PlanDefinition.name>"`
  - If `action.definitionCanonical` points to an ActivityDefinition, emit `do "<ActivityDefinition.name>"`
  - If `action` has no children or `definitionCanonical`, emit `do "<title>"` or `do "<generated activity name>"`

### Comments and rationale
- `plandef-description > decision.comment`
  - `PlanDefinition.description` → comment block above the `decision` (optional)
- `plandef-rationale > decision.rationale`
  - If available, transform into `rationale` block inside `decision`

### Canonical references
- `plandef-canonical > decision.when.use`
  - `PlanDefinition.action.definitionCanonical` → `use "<PlanDefinition.name>"`

### Activity Mapping
- `activitydef > activity`
  - `ActivityDefinition.name` → `activity "<name>"`
- `activitydef-description > activity.identifier`
  - `ActivityDefinition.description` or `title` → `of "<description>"`
- `activitydef-kind > activity.request`
  - `ActivityDefinition.kind` (e.g., #MedicationRequest) → `request <ActivityType>`
- `activitydef-code-display > activity.request.of`
  - If `ActivityDefinition.code.display` exists, append `of "<display>"`
- `activitydef-code-display > terminology.identifier`
  - `code.display` used for `terminology "<display>"`
- `activitydef-code > terminology.code`
  - `code.code` used for `terminology.code`

### Concept Mapping
- `plandef-condition > concept`
  - Each `action.condition.expression.expression` → generates a concept block
- `plandef-condition-expression > concept.identifier`
  - The condition string becomes the `concept` identifier
- Concepts are emitted with:
  ```
  concept "<identifier>":
    has type Observation.
    has valuetype boolean.
    coded by "<terminology_id>".
  done
  ```

### Terminology
- `coded by` references a `terminology` block:
  ```
  terminology "<TermName>" system "<TopDecisionName>" code "<ConceptCode>"
  ```
  - ConceptCode = identifier with spaces removed or kebab-cased
