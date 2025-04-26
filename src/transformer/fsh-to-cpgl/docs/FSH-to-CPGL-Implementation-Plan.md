# FSH-to-CPGL Transformer: Implementation Plan

## 1. Project Structure

Within `src/transformer/fsh-to-cpgl/`, use the following structure:

```
src/transformer/fsh-to-cpgl/
  ├─ index.ts                # Entry point for the transformer
  ├─ transformer.ts          # Main transformation logic (FSH → CPG-L)
  ├─ sushi-loader.ts         # SUSHI integration and FSH parsing helpers
  ├─ mapping/                # Mapping helpers and rule implementations
  │    ├─ planDefinition.ts
  │    ├─ activityDefinition.ts
  │    └─ concept.ts
  ├─ utils/                  # Utility functions (string, path, etc.)
  ├─ types/                  # TypeScript types/interfaces for FSH/CPGL
  └─ __tests__/              # Unit/integration tests
```

---

## 2. Implementation Steps

### A. SUSHI Integration
- Implement `sushi-loader.ts` to:
  - Load FSH files using SUSHI as a library.
  - Expose parsed FSH resources (instances, profiles, etc.) as TypeScript objects.

### B. Mapping Layer
- In `mapping/`, implement functions to:
  - Map PlanDefinition FSH objects to CPG-L `decision` blocks.
  - Map ActivityDefinition FSH objects to CPG-L `activity` blocks.
  - Map conditions, concepts, and terminology as per the requirements.
  - Handle FSH path functions (e.g., `toIdentifier()`, `extractCode()`, etc.).

### C. Transformation Orchestration
- In `transformer.ts`:
  - Accept parsed FSH resources.
  - Walk through each resource, applying the mapping rules.
  - Build up the CPG-L output as a string or AST.

### D. Output Generation
- Format and write the CPG-L output to `.cpg` files.
- Ensure output is valid per the CPG-L grammar (optionally, add a validation step).

### E. Entry Point
- In `index.ts`:
  - Parse CLI args or config (input FSH folder, output CPG-L file/folder).
  - Call the transformer and write results.

### F. Utilities & Types
- Add helpers for string formatting, kebab-case, identifier quoting, etc.
- Define TypeScript types for FSH and CPG-L constructs.

### G. Testing
- Add unit tests for each mapping function.
- Add integration tests: FSH input → CPG-L output (compare to canonical examples).

---

## 3. Milestones

1. **SUSHI Loader**: Parse FSH and print resource summaries.
2. **Basic PlanDefinition → decision mapping**: Output simple CPG-L for a PlanDefinition.
3. **ActivityDefinition, Concepts, and Terminology**: Add mapping for activities, concepts, and terminology.
4. **Recursive/Nested Actions**: Support nested actions and canonical references.
5. **FSH Path Functions**: Implement all required path functions and edge cases.
6. **Validation & Testing**: Ensure output is valid and matches canonical examples.
7. **CLI/Script**: Wrap as a CLI or callable script.

---

## 4. Next Step

**Start with the SUSHI loader:**  
- Implement `sushi-loader.ts` to load and parse FSH files, and expose a function that returns all FSH instances as TypeScript objects.

---

If you want to adjust the plan or focus on a different part first, update this document as needed. 