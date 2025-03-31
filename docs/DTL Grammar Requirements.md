# DTL (Decision Tree Language) – Comprehensive Requirements

This document outlines the comprehensive requirements for the Decision Tree Language (DTL). These requirements are intended for use with an AI assistant to generate an ANTLR grammar. DTL’s core purpose is to represent a FHIR [PlanDefinition](http://hl7.org/fhir/plandefinition.html) as a Decision Tree or Decision Graph using the Clinical Practice Guideline Implementation Guide (CPG IG).

---

## 1. Introduction

DTL is a domain-specific language designed to encode clinical decision logic in a tree or graph structure. DTL directly maps certain FHIR PlanDefinition elements (per the CPG IG) into a decision structure of **root nodes**, **leaf nodes**, **edges**, and **decision nodes**. DTL may also refer to a companion domain-specific language, the **Case Feature Language (CFL)**, to express the logical statements used in branching conditions.

### 1.1 Purpose

1. Represent a FHIR PlanDefinition as a Decision Tree or Decision Graph.
2. Encode clinical logic and flow (conditions, actions, references to subtrees) in a compact form.
3. Interoperate with the subset of the CPG IG specification relevant to PlanDefinition structures.
4. Provide a foundation for automatically generating or interpreting clinical decision pathways.

---

## 2. Scope

### 2.1 Included

- **PlanDefinition.id**  
  - Maps to the unique identifier of the decision tree/graph.

- **PlanDefinition.action**  
  - Constitutes the backbone of the decision graph/tree, with the first top-level PlanDefinition action serving as the root.

- **PlanDefinition.action.condition**  
  - Represents the decision nodes in DTL.

- **PlanDefinition.action.condition.expression**  
  - References a CFL statement (logical expression describing the condition).

- **PlanDefinition.action.input**  
  - Represents arguments or inputs for a decision node.

- **PlanDefinition.action.definitionCanonical**  
  - Used in two ways:
    1. Reference to another (sub) PlanDefinition, effectively embedding subtrees or subgraphs.
    2. Reference to a leaf node (a terminal action or outcome).

- **PlanDefinition.action.action**  
  - Represents the edges connecting nodes within the Decision Tree/Decision Graph.

### 2.2 Out of Scope

The following PlanDefinition elements will be mapped in later versions of DTL, and **should not** be considered part of the current grammar:

- `PlanDefinition.action.relatedAction`
  - `actionId`
  - `relationship`
  - `offset`

- `PlanDefinition.action.timing`
- `PlanDefinition.action.selectionBehavior`

---

## 3. DTL Structural Elements

DTL comprises four main elements:

1. **Root Node**:  
   - Corresponds to the first top-level `PlanDefinition.action`.  

2. **Leaf Node**:  
   - A terminal node where the decision path ends, typically mapped to `action.definitionCanonical` referencing a leaf.

3. **Edges**:  
   - Connections between nodes. In FHIR terms, each `action.action` in a PlanDefinition forms a branch (edge) in DTL.

4. **Decision Nodes**:  
   - Points in the tree where logic is evaluated to determine the next branch.

---

## 4. Language Considerations

1. **CFL References**  
   - DTL references the Case Feature Language (CFL) for expressions inside concept blocks (`CONCEPT {}`) and action blocks (`ACTION {}`). However, at this stage, such references are **not** validated for correctness. They are simple placeholders within the grammar.

2. **No Comments**  
   - DTL does **not** allow comments (i.e., no syntactic structure for inline or block comments).

3. **Logical Operators**  
   - `AND`, `OR`, and `NOT` must be supported for combining or negating expressions in both **concept blocks** and **action blocks**.

4. **SELECT Construct**  
   - Allows specifying the number of items that must be true within a parenthetical expression of multiple items:
     - **`SELECT[>=N](A OR B OR C)`**  
       True if **at least** N of the listed items are true.
     - **`SELECT[N](A OR B OR C)`**  
       True if **exactly** N of the listed items are true.
     - **`SELECT[<N](A OR B OR C)`**  
       True if **fewer than** N of the listed items are true.
     - **`SELECT[NONE](A OR B OR C)`**  
       True if **none** of the listed items is true.
     - **`SELECT[ALL](A AND B AND C)`**  
       True if **all** of the listed items are true.

---

## 5. DTL Grammar Statements

A DTL tree is structured using `IF`, `ELSE IF`, and `ELSE` blocks, with each condition referencing a **concept block**:

IF <concept block> THEN <action block OR nested DTL tree> ELSE IF <concept block> THEN <action block OR nested DTL tree> ELSE <action block OR nested DTL tree>

- There can be zero or more `ELSE IF` clauses.
- The `ELSE` clause is optional.
- A DTL tree may appear **nested** (recursively) within any THEN, ELSE IF, or ELSE section.
- A DTL can also be a single **action block** if no branching (conditions) is required.

### 5.1 Concept Blocks

A **concept block** describes a logical expression referencing CFL statements:

CONCEPT{ "description": "Example description", "expression": "Summary of concept" }

- May be combined with logical operators (`AND`, `OR`, `NOT`) or a `SELECT` statement.

### 5.2 Action Blocks

An **action block** describes an action or outcome:

ACTION{ "description": "Example description", "expression": "Summary of action" }

- May similarly be combined with logical operators or `SELECT` statements.

### 5.3 No Comments

DTL **disallows** comment syntax of any form (inline or block). Any comment-like material is considered invalid in the current version of the language.

---

## 6. Requirements for the ANTLR Grammar

When generating an ANTLR grammar from these requirements, ensure the following:

1. **Terminals**  
   - Keywords: `IF`, `ELSE`, `ELSE IF`, `THEN`, `CONCEPT`, `ACTION`, `SELECT`, `ALL`, `NONE`, `AND`, `OR`, `NOT`, plus symbols for operators `>=`, `<=`, `<`, `>`, `=`.
   - Parentheses `(` `)` for grouping.
   - Curly braces `{` `}` for concept and action blocks.
   - Square brackets `[` `]` for the **SELECT** construct.

2. **Non-Terminals**  
   - **dtlTree**: the root grammar rule for a DTL structure.
   - **conditionalBranch**: captures `IF/ELSE IF/ELSE` blocks.
   - **conceptBlock**: captures the syntax of the `CONCEPT { ... }` object.
   - **actionBlock**: captures the syntax of the `ACTION { ... }` object.
   - **selectStatement**: captures the `SELECT[...]` syntax.
   - **logicalExpression**: captures the structure of combining concept/action blocks using `AND`, `OR`, `NOT`, or nesting.

3. **Parsing Expressions**  
   - The grammar must handle:
     - Single condition branches, multiple `ELSE IF` branches, and optional `ELSE` branch.
     - Nesting of `IF...THEN` statements within any resulting block.
     - `CONCEPT` and `ACTION` objects, each containing at least:
       - A `description` (string).
       - An `expression` (string).
     - The `SELECT` expression and bracketed integer/keyword (e.g., `[2]`, `[>=2]`, `[NONE]`, `[ALL]`).

4. **Validation**  
   - Grammar rules must enforce that no comment syntax is present.
   - The grammar must allow for references to possible nested DTL sub-trees in place of action blocks. 
   - At this stage, the grammar need **not** validate the correctness of references to the CFL, though it must accept them as string literals in concept/action expressions.

5. **Extensibility**  
   - The grammar should be flexible enough to allow future additions for:
     - `action.relatedAction` handling (e.g., `offset`, `relationship`).
     - `PlanDefinition.action.timing`.
     - Additional constraint checks or domain-specific expansions.

---

## 7. Summary

The Decision Tree Language (DTL) is a specialized notation for modeling FHIR PlanDefinition artifacts as decision trees or graphs in alignment with the CPG IG. These requirements specify:

- The high-level structure (IF / ELSE IF / ELSE blocks).
- Concept and action blocks (referencing CFL expressions).
- The `SELECT` construct for advanced logical counting.
- Mappings to key PlanDefinition elements (e.g., `action`, `condition`, `input`, and `definitionCanonical`).
- Limitations (no comments, partial references to external languages).

This specification serves as the foundation for creating an ANTLR grammar. The grammar must accept valid DTL constructs as described here and reject any language constructs or syntax (particularly comments) not defined in these requirements.
