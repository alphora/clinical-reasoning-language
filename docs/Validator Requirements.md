# Requirements for CRL Validator (Single-File Scope)

These requirements specify the design and implementation details for a **Typescript-based** validator of a domain-specific language (DSL) called *CRL (Clinical Reasoning Language)*. The validator is intended to operate on an Abstract Syntax Tree (AST) produced by an ANTLR-based lexer and parser. The **lexer**, **parser**, and **AST** generation phases are already implemented.

---

## 1. Background & Objectives

1. **DSL Context**  
   - The DSL grammar is defined in ANTLR files (`CRLLexer.g4` and `CRLParser.g4`) and produces a parse tree.  
   - An AST is created from that parse tree, representing statements like `decision`, `concept`, `activity`, or `terminology`.
   - The validator processes the AST to enforce **semantic** and **business** rules that the grammar cannot fully address.

2. **Primary Goals**  
   - Ensure the DSL’s **semantic correctness** (e.g., no invalid cross-references or cycles).  
   - Provide **clear error and warning messages** (including line/column info) to DSL authors or AI tools that consume these errors.  
   - Support **single-file** validation first; multi-file or cross-file validation will be tackled in a future phase.

3. **Assumptions**  
   - The grammar and AST building logic **already** validate certain structural constraints. For example:
     - A `decision` must have at least one `when` clause.
     - A `when` clause must contain at least one action (`do`/`use`) or nested `when`s.
     - `terminology` must have exactly one of: `valueset`, `unknown`, or `system/code`.
     - `activity` must have exactly one `perform` clause.
     - A `concept` must have exactly one `has type`, exactly one `has valuetype`, optionally one `provenance`, and must have either `coded by` **or** `inferred by`.
   - The user’s decisions and prior references have indicated no immediate need to enforce references existing in the same file. Cross-file references will be addressed later.

---

## 2. Scope of Validation

1. **Focus on AST Validation**  
   - **Grammar-level** syntax and structure errors are already reported by ANTLR and are **not** rechecked in this validator.  
   - The validator will operate on the final AST and apply semantic and business rules.

2. **Business Rules to Enforce**  
   - **Same-Keyword Duplication**: Two or more `decision` blocks cannot share the same name, nor can two `concept`s, two `activity`s, or two `terminology`s.  
   - **Cross-Keyword Naming**: A `decision` and a `concept` can share the same name (and similarly for other different top-level keywords) without error.  
   - **Repeated Actions Within the Same Block**  
     - Repeated `do` statements with the same target (e.g., `do "Vaccinate"` repeated in the same block) is an error.  
     - Repeated `use` statements with the same target (e.g., `use "Some Decision"`) is also an error if they occur in the same block.  
   - **Duplicate Names Elsewhere**  
     - Any **other** duplicate names outside of top-level declarations (e.g., concept-level duplication of certain lines) should result in a **warning** but not an error (if that situation arises in expansions).  
   - **No Cycles in `use` Statements**  
     - If a `decision` references itself directly or indirectly via a chain of `use` statements (e.g., `A` → `B` → `A`), this is an error.  
   - **No Cycles in `inferred by`**  
     - If a `concept` is inferred by another concept which eventually leads back to the original concept, that is an error.  
   - **Unused Declarations**  
     - A declared `decision`, `concept`, `activity`, or `terminology` that is never referenced anywhere in the single file triggers a **warning** (not an error).

3. **Business Rules *Not* Enforced by the Validator**  
   - **Reference Existence** checks are deferred until cross-file validation is supported.  
   - **Reserved Keywords** as identifiers are not restricted because the grammar uses quoted strings for names.  
   - **Terminology referencing concepts** is not applicable here (and thus no cycle detection needed in that regard).

---

## 3. Validation Phases

While the validator is a single component, conceptually we can separate checks into:

1. **AST Structural Validation**  
   - Ensuring the AST node types, relationships, and mandatory fields are present. This is mostly guaranteed by the parser/grammar rules.  
   - Confirming top-level statements (e.g., `decision`, `concept`, `activity`, `terminology`) are well-formed.

2. **Semantic/Business Rule Validation**  
   - Checking for **duplicate top-level** names within the same keyword category.  
   - Checking for **duplicates of `do` or `use`** statements within the same block.  
   - Building a **call graph** or **dependency graph** for `use` statements and verifying there are no cycles.  
   - Building a **concept inference graph** for `concept` → `concept` references in `inferred by` blocks, verifying no cycles.  
   - Checking if any declaration is **unused** (i.e., not referenced in any `when`, `use`, `do`, or `inferred by`).

3. **Future (Out of Scope for Now)**  
   - **Reference existence** checks for decisions, concepts, or activities.  
   - **Cross-file** checks, including references to items declared outside the current file.  

---

## 4. Validation Architecture & Implementation

1. **Core Validator Interface**  
   - A main `validate(ast: AST): ValidationResult` method.  
   - Returns an aggregated list of `ValidationError` or `ValidationWarning` objects, each describing the **type** of violation, its **severity**, and the AST node’s **location** (line, column).

2. **Validation Components**  
   - **NameUniquenessValidator**:  
     - Verifies each top-level `decision`, `concept`, `activity`, and `terminology` name is unique within that keyword’s space.  
     - Logs an **error** if duplicate names are found in the same keyword category.  
   - **ActionUniquenessValidator**:  
     - Within a single `when` or `blockBody`, checks for repeated `do "X"` or `use "Y"` calls.  
     - Logs an **error** if such duplicates exist in the same block.  
   - **CycleDetector**:  
     1. **DecisionCycle**: Builds a directed graph of `decision` → `decision` edges (via `use`). Checks for cycles.  
     2. **ConceptCycle**: Builds a directed graph of `concept` → `concept` edges (via `inferred by`). Checks for cycles.  
     - Logs an **error** if a cycle is found.  
   - **UnusedDeclarationsValidator**:  
     - Tracks references to each named declaration (decisions, concepts, activities, terminologies).  
     - Logs a **warning** for any declarations never referenced.

3. **Validation Pipeline**  
   - The pipeline coordinates these components:  
     1. **NameUniquenessValidator** → 2. **ActionUniquenessValidator** → 3. **CycleDetector** → 4. **UnusedDeclarationsValidator**.  
   - The pipeline accumulates **all** errors and warnings.  
   - Optionally, if “critical” errors occur (e.g., a cycle or missing essential data structure), the pipeline can stop early or continue to accumulate errors, based on user preference.  

---

## 5. Error Handling

1. **Error vs Warning**  
   - **Errors** indicate the DSL is invalid and likely should not be executed or used further. Examples:
     - Duplicate top-level names within the same keyword (e.g. two `decision "X"`).  
     - Repeated `do "X"` or `use "Y"` within the same block.  
     - Cycles in `use` references or `inferred by` references.  
   - **Warnings** highlight possible issues but do not necessarily block execution. Examples:
     - Unused declarations.  
     - Certain other duplicates that are not strictly prohibited (e.g., concept or terminology name duplicates across categories, if that’s not disallowed).

2. **Reporting**  
   - Each error/warning should include:  
     - **Type**: `ERROR` or `WARNING`.  
     - **Message**: Human-readable description of the violation.  
     - **Location**: Node’s line and column from the AST (or path in the AST if line/column is unavailable).

3. **Error Aggregation**  
   - The validator should collect **all** errors/warnings in one pass (or in a coordinated multi-pass pipeline).  
   - This enables the user/AI to see all issues without having to fix them one at a time.

---

## 6. Performance & Incremental Validation

1. **Efficient AST Traversal**  
   - The AST is relatively small (a single CRL file), but should still be traversed in a single or minimal number of passes.  
   - Re-using partial computations (e.g., a single pass to build reference graphs for cycle detection) is preferred.

2. **Caching & Incremental** (Optional/Future Enhancement)  
   - If integrated into an IDE or interactive environment, partial validation might be needed.  
   - The design should allow incremental checks (e.g., re-validating only changed parts). For now, a full pass is often simpler to implement initially.

---

## 7. Implementation Outline in TypeScript

Below is a high-level approach for implementing the validator in TypeScript:

```typescript
interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

interface ValidationIssue {
  severity: 'ERROR' | 'WARNING';
  message: string;
  line: number;
  column: number;
}

function validate(ast: AST): ValidationResult {
  const result: ValidationResult = { errors: [], warnings: [] };

  // Phase 1: Name Uniqueness
  NameUniquenessValidator.check(ast, result);

  // Phase 2: Action Uniqueness
  ActionUniquenessValidator.check(ast, result);

  // Phase 3: Cycle Detection
  CycleDetector.checkDecisions(ast, result);
  CycleDetector.checkConcepts(ast, result);

  // Phase 4: Unused Declarations
  UnusedDeclarationsValidator.check(ast, result);

  return result;
}
```

Each validator component would implement logic specific to its domain, e.g.:

**NameUniquenessValidator**  
- Collects and groups top-level statements by type (decision, concept, etc.).  
- Any group with duplicates triggers an error.

**ActionUniquenessValidator**  
- Recursively visits `when`/`blockBody` nodes, tracking sets of encountered `do` or `use` strings in each scope.

**CycleDetector**  
- Gathers adjacency lists from each decision to the decisions they “use”.  
- Gathers adjacency lists from each concept to the concepts they “inferred by”.  
- Applies standard graph cycle checks (DFS or Tarjan’s strongly connected components).

**UnusedDeclarationsValidator**  
- Tracks references encountered in `when`, `do`, `use`, or `inferred by`, and compares them to all declared names.

---

### 8. Example Validation Flow

Given a CRL file with duplicated `decision "blah"` and repeated `do "Vaccinate"` in the same block, the validator would:

1. **Parse**  
   - The existing ANTLR grammar produces a parse tree, then the AST is built.

2. **Validate**  
   - **NameUnique** check sees two `decision "blah"` → logs an error.  
   - **ActionUnique** check sees `do "Vaccinate"` repeated in the same block → logs an error.  
   - **Cycle** check sees no cycles → no error.  
   - **Unused** check sees no declarations are unused → no warning.

3. **Aggregates results**  
   - 2 errors:
     ```
     [
       { severity: ERROR, message: "Duplicate name 'blah'...", ... },
       { severity: ERROR, message: "Repeated do 'Vaccinate'...", ... }
     ]
     ```

---

## Metadata Annotation Validation (proposed — CRL metadata model)

> Status: design (not yet implemented). Specifies how the validator should treat `@tag` metadata annotations carried on ``- meta is `@tag: <body>`.`` lines. Full model + tag registry: [`spec/metadata-model.md`](../spec/metadata-model.md) + [`spec/metadata-registry.json`](../spec/metadata-registry.json).

Metadata tags are a **string convention** inside the existing `meta` backtick text — there is **no grammar change**. The grammar accepts any `meta` body as an opaque string; the following are the validator's responsibility:

1. **Tag recognition** — a `meta` body matching `^@([a-z][a-z0-9-]*):` is a typed annotation; the captured tag is looked up in the registry. A `meta` body **not** starting with `@` is a legitimate untyped note (back-compat) — no diagnostic.
2. **Malformed-tag lint** — a `meta` body starting with `@` but **not** matching `^@[a-z][a-z0-9-]*:` is a **warning** (probable malformed tag — catches silent demotion of a typo'd tag to an untyped note).
3. **Unknown tag** — a recognized-shape tag whose id is not in the registry is a **warning** (forward-compatible).
4. **Value-shape mismatch** — e.g. an external-ref tag (`@kg-concept`, `@reef-reference`) missing its `ref`, or a `confidence` outside `[0,1]`, is an **error**.
5. **Cardinality** — a tag exceeding its registry cardinality (e.g. two `@description` on one concept; `@description` is `0..1`) is an **error**.
6. **Re-run staleness** — if two distinct extraction `run` ids' family-C exhaust (`@semantic-parse-text`, `@controlled-natural-language`) or candidate external-refs coexist on one concept, emit a **warning** (the producer is expected to replace the prior run's set on re-extraction).
7. **Scope** — metadata tags attach to `concept` only (the `meta` carrier exists nowhere else in the grammar). Metadata on other statement types is out of scope for this phase.

External-ref tags carry a display label + `;`-separated `key value` fields (`ref`, `confidence`, `rank`, `status`, `by`). `@kg-concept` references the **Concept Graph** (a hint for the decision); `@reef-reference` references **REEF** ("the great reef") — distinct stores. See the registry for the per-tag schema, the `emit` contract (e.g. `@ke-feedback` surfaces in generated CQL block comments; the emitter must sanitize `*/`), and the full rule set.

---

### 9. Conclusion

These requirements provide a clear outline of what the single-file CRL validator should check, how it should report errors, and how it should integrate into a larger DSL workflow. Key points include:

- **Leverage** existing lexer/parser to handle grammar-level rules.  
- **Focus** on semantic and business rules at the AST level (name uniqueness, repeated actions, cycle detection, warnings for unused declarations).  
- **Defer** cross-file reference validation to a future phase.  
- **Implement** in TypeScript with a modular, pipeline-based architecture that aggregates errors and warnings in a single pass.

This lays the foundation for a robust, maintainable validator optimized for an AI-assisted environment or any typical user workflow.
