# CRL Activity Mapping: Additional Requirements

## 1. Requirements

### A. Conditional "do not" for Activity
**Rule:**  
Apply to `ActivityMapping`.
- If the FSH `ActivityDefinition` has `doNotPerform = true`, the CRL `activity` block should use the `do not perform` syntax instead of `perform`.

### B. Conditional Terminology Block for Activity
**Rule:**  
Apply to `ActivityMapping`.
- Only emit a `terminology` block **if** the activity has a code (i.e., `activitydef-code.exists()`).
- The `terminology` block must be **unique by identifier** (with suffixing if needed, as previously described).

## 2. FSH Terms and Functions (from FSH-CRL-Mapping.md)

### A. `activity_def-donotperform`
**Term:**  
`activity_def-donotperform = ActivityDef.doNotPerform`  
Boolean property in the FSH `ActivityDefinition`.

### B. `activitydef-code`
**Term:** One of:
- `ActivityDef.medicationCodeableConcept.extractCode()`
- `ActivityDef.dynamicValue.expression.expression.where(ActivityDef.dynamicValue.path="code.coding").extractCodeExpression()`

**Function:**
- `extractCode(value: string): string`  
  Extracts system and code from a FSH code string  
  _(e.g., `$ICD11#XM28X5 "Measles vaccines"` → `system "ICD11" code "XM28X5"`)_
- `extractCodeExpression(value: string): string`  
  Extracts system and code from a CQL code expression.

### C. `activitydef-code-display`
**Term:** One of:
- `ActivityDef.medicationCodeableConcept.extractCodeDisplay()`
- `ActivityDef.dynamicValue.expression.description.where(ActivityDef.dynamicValue.path="code.coding")`

**Function:**
- `extractCodeDisplay(value: string): string`  
  Extracts the display string from a FSH code string  
  _(e.g., `$ICD11#XM28X5 "Measles vaccines"` → `"Measles vaccines"`)_

## 3. CRL Output Requirements

### A. Activity Block
- If `doNotPerform = true`, emit:
  ```crl
  activity "..." do not perform ...
  ```
- Otherwise, emit:
  ```crl
  activity "..." perform ...
  ```

### B. Terminology Block
- Only emit if the activity has a code.
- Use the extracted **display** as the identifier and the **code/system** as the code.
- Ensure **uniqueness** by identifier and body (suffix if needed).

## 4. Deduplication and Suffixing
- If a `terminology` block with the same **identifier** but a different **body** is encountered, **suffix** with `_<count>`.
- If both identifier and body are **identical**, **skip** (do not emit duplicate).

## 5. Summary Table

| FSH Property/Rule          | CRL Output           | Function/Transformation                        |
|---------------------------|------------------------|----------------------------------------|
| doNotPerform = true       | do not perform         | Boolean check                          |
| doNotPerform = false      | perform                | Default                                 |
| medicationCodeableConcept    | terminology block      | extractCode, extractCodeDisplay         |
| dynamicValue (code.coding)| terminology block      | extractCodeExpression, extractCodeDisplay |
| code exists               | emit terminology       | Only if code is present                 |
| code/display deduplication| unique identifier+body | Suffix if needed                        |

## 6. Implementation Implications
- Activity emission logic must:
  - Check `doNotPerform`
  - Switch between `perform` and `do not perform`

- Terminology emission logic for activities must:
  - Only emit if a code exists
  - Use correct extraction functions
  - Deduplicate and suffix as needed

## 7. Conclusion
- These requirements are now **conditional**:
  - Only emit `do not perform` if `doNotPerform = true`
  - Only emit a `terminology` block if a code exists
- All extraction and formatting must use the helper functions defined in the mapping documentation.
- Deduplication and suffixing rules for terminology blocks **remain in effect**.
