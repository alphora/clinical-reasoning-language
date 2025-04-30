# CRL (Decision Tree Language) – Final Grammar Requirements

This document provides a **final and comprehensive** set of requirements for creating a grammar for the Decision Tree Language (CRL). These requirements merge the original CRL specifications with additional clarifications and refinements aimed at:

1. Producing a **useful, comprehensive, and accurate grammar** aligned with FHIR PlanDefinition and the CPG IG.
2. **Optimizing for human readability**, especially for non-technical clinical users.

The CRL grammar must therefore strike a balance between formal correctness, ease of parsing, and intuitive, indentation-based syntax.

---

## 1. Purpose and Scope

### 1.1 Purpose

- Represent a FHIR [PlanDefinition](http://hl7.org/fhir/plandefinition.html) as a Decision Tree or Decision Graph.
- Encode clinical logic and flow (conditions, actions, references to subtrees) in a compact DSL.
- Interoperate with the relevant portions of the Clinical Practice Guideline Implementation Guide (CPG IG).
- Provide a foundation for generating or interpreting clinical decision pathways.

### 1.2 Included FHIR Elements

- **PlanDefinition.id** → unique identifier for the overall decision tree/graph.
- **PlanDefinition.action** → backbone of the decision structure; the first top-level action is the root node.
- **PlanDefinition.action.condition** → decision nodes in CRL.
- **PlanDefinition.action.condition.expression** → references a CFL statement for the logical condition.
- **PlanDefinition.action.input** → inputs or arguments for a decision node.
- **PlanDefinition.action.definitionCanonical** → references a subtree (sub-PlanDefinition) or a leaf node.
- **PlanDefinition.action.action** → edges connecting nodes in the tree/graph.

### 1.3 Out of Scope

The following will be addressed in future releases of the grammar:

- **PlanDefinition.action.relatedAction** (including `actionId`, `relationship`, `offset`)
- **PlanDefinition.action.timing**
- **PlanDefinition.action.selectionBehavior**

These elements **must not** appear in the current CRL grammar.

---

## 2. Structural Elements

CRL models decision logic through:

1. **Root Node**  
   - The top-level `PlanDefinition.action`.

2. **Leaf Node**  
   - A terminal node representing an outcome (mapped from `definitionCanonical` referencing a leaf).

3. **Edges**  
   - Each `action.action` forms a branch connecting nodes in the decision tree/graph.

4. **Decision Nodes**  
   - Evaluate conditions and determine which branch to follow.

5. **Subtrees**  
   - Named subtrees that can be defined once and reused multiple times (including cyclical references). This feature supports decision graphs, not just acyclic trees.

---

## 3. Language Considerations

1. **Reference to Case Feature Language (CFL)**  
   - CRL references CFL statements in `CONCEPT { ... }` and `ACTION { ... }`.  
   - At this stage, references to CFL are **not** validated; the grammar will simply accept their textual presence.

2. **No Comments**  
   - CRL **disallows** any form of comments. The grammar must reject inline or block comment syntax.

3. **Logical Operators**  
   - Must support `AND`, `OR`, `NOT` in uppercase.  
   - **Parentheses** are **mandatory** around expressions to ensure clarity for authors and unambiguous parsing.

4. **SELECT Construct**  
   - `SELECT[...]` with cardinalities:  
     - `[>=N]` → “at least N”  
     - `[N]` → “exactly N”  
     - `[<N]` → “fewer than N”  
     - `[NONE]` → none is true  
     - `[ALL]` → all are true  
   - Additionally, the DSL must support the **shorthand** calls:  
     - `ALL(...)` → equivalent to `SELECT[ALL](...)`  
     - `ANY(...)` → equivalent to `SELECT[>=1](...)`

---

## 4. Grammar Statements

### 4.1 Indentation-Based Control Flow

CRL uses **Python-like whitespace** to delineate blocks. There are **no** curly braces or semicolons around conditional blocks. Instead, each block’s body is indented relative to the preceding line. The grammar must handle indentation-based scoping.

**Example**:

``` crl
IF (<condition>) THEN <indented statements> ELSEIF (<condition>) THEN <indented statements> ELSE <indented statements>
```

Key points:

- `ELSE IF` is replaced by **`ELSEIF`** as a single token.
- Each new clause (`ELSEIF`, `ELSE`) starts at the **same indentation level** as the `IF`.
- The body under `THEN`, `ELSEIF`, or `ELSE` is **further indented**.

### 4.2 Concept and Action Blocks

1. **Concept Block**

``` crl
CONCEPT{ "description": "Example description", "expression": "Summary of concept" }
```

- Must be used within parenthesized logical expressions.  
- May appear standalone or combined with other expressions (via `AND`, `OR`, `NOT`, `SELECT`, etc.).

1. **Action Block**

``` crl
ACTION{ "description": "Example description", "expression": "Summary of action" }
```

- Same usage as `CONCEPT`, but denotes an actionable step or outcome rather than a condition.

### 4.3 Logical Expressions

- **Always** enclosed in parentheses, e.g.:

``` crl
(CONCEPT{...} AND (NOT ACTION{...}))
```

or

``` crl
( (CONCEPT{...} OR ACTION{...}) AND CONCEPT{...} )
```

- **SELECT** can wrap multiple expressions, e.g.:

``` crl
SELECT[>=2]((CONCEPT{...}) OR (ACTION{...}) OR (CONCEPT{...}))
```

- Shorthand forms `ALL(...)` and `ANY(...)` are permitted as more user-friendly alternatives:

``` crl
ALL((CONCEPT{...}) AND (CONCEPT{...})) ANY((CONCEPT{...}) OR (ACTION{...}))
```

---

## 5. Subtrees and References

### 5.1 Defining a Subtree

The grammar must allow **named subtree definitions** for reuse. A subtree can include any valid CRL logic (including nested conditions, references to further subtrees, etc.). For example:

``` crl
DEFINE <SubtreeName>: IF (<condition>) THEN ... ELSEIF (<condition>) THEN ... ELSE ...
```

- `DEFINE <SubtreeName>:` appears at the top-level or in an appropriate scope.  
- The block following this definition is **indented**.  
- The grammar must handle subtree definitions in the **same** file only (no external references in the current version).

### 5.2 Using a Subtree

A defined subtree can be **called or referenced** from any logic branch to facilitate reuse. For instance:

``` crl
USE <SubtreeName>
```

or

``` crl
INCLUDE <SubtreeName>
```

(Choose the specific keyword to best fit your domain; the grammar must allow for a single, unambiguous reference keyword.)

### 5.3 Cyclical References

- The grammar **must** permit cyclical references, allowing directed cyclical graphs. Example:

``` crl
DEFINE A: IF (<condition>) THEN USE B ELSE ACTION{...}
DEFINE B: IF (<condition>) THEN USE A ELSE ACTION{...}
```

- The semantics or execution logic for such cycles is beyond the scope of the grammar but must not be disallowed at parse time.

---

## 6. Detailed Grammar Requirements

### 6.1 Terminals

1. **Keywords** (uppercase, indentation-sensitive):

    - `IF`
    - `ELSEIF`
    - `ELSE`
    - `THEN`
    - `DEFINE`
    - `USE` (or `INCLUDE`, whichever is chosen)
    - `CONCEPT`
    - `ACTION`
    - `SELECT`
    - `ALL`
    - `NONE`
    - `ANY`
    - `AND`
    - `OR`
    - `NOT`
2. **Operators**:
     - `>=`, `<=`, `<`, `>`, `=`
3. **Parentheses**:
    - `(` and `)`
4. **Square Brackets**:
    - `[` and `]` (for `SELECT[...]`)
5. **String Literals**:
    - Must handle JSON-like blocks for `CONCEPT{ ... }` and `ACTION{ ... }`.
6. **Indentation**:
    - Whitespace or newline rules to handle block structure (similar to Python’s layout).

### 6.2 Non-Terminals

1. **crlFile** (root rule)  
    - A sequence of **DEFINE** statements and/or a top-level **IF** block.
2. **defineStatement**  
    - Matches `DEFINE <SubtreeName>:` plus indented block.
3. **crlTree**  
    - Matches an `IF/ELSEIF/ELSE` chain with indented blocks, or a single `ACTION`/`CONCEPT` block, or a `USE` statement.
4. **conditionalBranch**  
    - Grammar for `IF (<expr>) THEN`, followed by an indented block, optional `ELSEIF` blocks, and optional `ELSE`.
5. **conceptBlock**  
    - Matches `CONCEPT { ... }`.
6. **actionBlock**  
    - Matches `ACTION { ... }`.
7. **logicalExpression**  
    - Captures `( expr )` forms with `AND`, `OR`, `NOT`, or `SELECT[...]`.
8. **selectStatement**  
    - Captures `SELECT[>=N](...)`, `ALL(...)`, `ANY(...)`, etc.
9. **useStatement**  
    - Captures `USE <SubtreeName>` referencing a previously defined subtree.

### 6.3 Parsing Expressions

- Must support nested parentheses, logical operators, and the combination of `CONCEPT{}` / `ACTION{}` blocks with `AND`, `OR`, `NOT`, `SELECT`, `ALL`, `ANY`.
- Must **reject** any expressions that do not enclose conditions in parentheses (i.e., unparenthesized expressions are invalid).
- Must accept string literal data inside `description` and `expression` fields of concept/action blocks, without additional validation.

### 6.4 Validation Rules

1. **No Comments**  
    - Reject any input containing `#`, `//`, `/* ... */`, or any other comment-like sequence.
2. **Indentation**  
    - The grammar must correctly interpret indentation levels for block scope.  
    - A typical approach is to use a lexical grammar that emits **INDENT** and **DEDENT** tokens, or an equivalent mechanism.
3. **No External Subtrees**  
    - In this version, all `DEFINE` statements must appear in the same file.  
    - No syntax for external references is allowed.
