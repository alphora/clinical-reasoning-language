# Lexer Implementation Requirements for CPGL

This document details the requirements for implementing a lexer for the Decision Tree Language (CPGL) using an approach modeled on the Python 3 ANTLR grammar. The goal is to create a robust, unambiguous, and maintainable lexer that supports an indentation-based syntax, similar to Python’s handling of NEWLINE, INDENT, and DEDENT tokens, along with support for comments and other lexical elements.

---

## 1. Objectives

- **Accurate Tokenization:**  
  The lexer must correctly tokenize the CPGL DSL, producing tokens for keywords, string literals, identifiers, and special symbols.
  
- **Indentation-Based Block Handling:**  
  The lexer must track leading whitespace on each line and emit appropriate INDENT and DEDENT tokens to demarcate code blocks.
  
- **Comment Support:**  
  Support single-line (`//`) and block (`/* ... */`) comments, ensuring that these are ignored during parsing.
  
- **Robustness & Error Recovery:**  
  The lexer must gracefully handle malformed input, such as inconsistent indentation or unterminated string literals/comments, and provide useful error messages.

- **Integration with ANTLR:**  
  The generated tokens must align with the grammar rules of the CPGL parser, ensuring seamless integration.

---

## 2. Lexical Tokens

The lexer must produce tokens for the following:

- **Keywords:**  
  `decision`, `when`, `then`, `do`, `use`, `action`, `casefeature`, `code`, `fhirtype`, `url`, `valuetype`
  
- **Special Symbols:**  
  Quoted strings (for names, conditions, etc.), identifiers (for resource types), and any punctuation used by the DSL.
  
- **Control Tokens for Indentation:**  
  - **NEWLINE:** End-of-line markers (supporting both Unix and Windows formats).  
  - **INDENT:** Emitted when a new line’s leading whitespace increases relative to the previous non-blank line.  
  - **DEDENT:** Emitted when a new line’s leading whitespace decreases relative to the current indentation level.

- **Comments:**  
  - **Single-line comments:** Begin with `//` and extend to the end of the line.  
  - **Block comments:** Begin with `/*` and end with `*/`, spanning multiple lines if needed.

- **Whitespace:**  
  Spaces and tabs (outside of indentation handling) should be recognized and skipped.

---

## 3. Indentation Handling

### 3.1. Indentation Mechanism

- **Indentation Stack:**  
  The lexer must maintain an internal stack (or similar structure) that records the indentation level (number of spaces/tabs) of previous lines. 

- **Processing NEWLINE:**  
  Upon encountering a NEWLINE token:
  - Determine the indentation level of the next non-blank line.
  - Compare this level with the top of the indentation stack.
  - If the indentation level is greater, push the new level onto the stack and emit an INDENT token.
  - If the indentation level is lower, pop from the stack until the current level is reached and emit a DEDENT token for each pop.
  - If the level is the same, do nothing (aside from emitting a NEWLINE).

### 3.2. Lexer Actions

- **Custom Lexer Actions:**  
  Implement custom actions (in the target language, e.g., TypeScript) within the lexer to:
  - Count the number of spaces (and/or tabs) at the beginning of each line.
  - Skip blank lines and comment-only lines without affecting the indentation count.
  - Handle edge cases where a block comment might span multiple lines and affect indentation recognition.

- **Token Emission:**  
  Ensure that INDENT and DEDENT tokens are emitted at the proper places and that their presence does not interfere with other tokens.

---

## 4. Comment Handling

### 4.1. Single-Line Comments

- **Definition:**  
  Recognize the sequence `//` and ignore all characters until the end-of-line.
  
- **Implementation:**  
  Use a lexer rule that matches `//` followed by any characters except a newline, and then skip these tokens (e.g., using the `-> skip;` command in ANTLR).

### 4.2. Block Comments

- **Definition:**  
  Recognize the sequence `/*` and continue matching characters (including newlines) until the first occurrence of `*/`.
  
- **Non-Greedy Matching:**  
  Use non-greedy matching (such as `.*?`) to ensure that nested occurrences do not cause unintended behavior.
  
- **Implementation:**  
  Block comments should be skipped, and if they span multiple lines, ensure that no extra NEWLINE tokens are generated from within the comment.

- **Nested Comments:**  
  Decide whether nested block comments are allowed. Typically, languages like C or Java do not allow nesting; follow that model unless nesting is a requirement.

---

## 5. String Literals and Identifiers

### 5.1. String Literals

- **Quoted Strings:**  
  A string literal should be defined as a sequence of characters enclosed in double quotes (`"`).
  
- **Escape Sequences:**  
  Support common escape sequences (e.g., `\"`, `\\`, `\n`) as required by the DSL.
  
- **Line Restrictions:**  
  Ensure that string literals do not span multiple lines unless explicitly allowed by the DSL.

### 5.2. Identifiers

- **Definition:**  
  An identifier can be defined as a sequence of letters, digits, and underscores, starting with a letter or underscore.
  
- **Usage:**  
  Use identifiers for resource types, keywords in properties (e.g., for `fhirtype`, `valuetype`), and other unquoted tokens.

---

## 6. Integration with ANTLR Grammar

- **Token Names:**  
  The tokens generated by the lexer (e.g., NEWLINE, INDENT, DEDENT, STRING, IDENTIFIER) must match the names expected by the CPGL parser grammar.
  
- **Error Handling:**  
  The lexer should report errors for unexpected characters, unterminated string literals, or comments.
  
- **Testing:**  
  Develop a comprehensive test suite with example CPGL code snippets that exercise:
  - Nested and flat indentation scenarios.
  - Mixed usage of single-line and block comments.
  - Edge cases, such as blank lines and varying indentation widths (spaces vs. tabs).

---

## 7. Documentation and Maintainability

- **Inline Comments in Code:**  
  Document the custom lexer actions and state management (indentation stack) in the source code.
  
- **Configuration Options:**  
  Provide configuration parameters (if applicable) to set the indentation style (e.g., number of spaces per indent level) and to toggle comment handling behavior.
  
- **Reference Python’s Implementation:**  
  Clearly reference the Python 3 ANTLR grammar as a model. Indicate which parts have been adapted and any changes made to suit the CPGL DSL.

---

## 8. Summary

Implementing the lexer for CPGL using Python’s indentation-handling approach requires:
- A robust system for tracking indentation via a stack, emitting INDENT/DEDENT tokens.
- Lexer rules that correctly identify keywords, string literals, identifiers, and control tokens.
- Support for single-line and block comments, ensuring they do not interfere with indentation.
- Detailed testing and documentation to ensure maintainability and clarity.
- Integration with the overall ANTLR grammar for CPGL, ensuring token names and behavior match the parser’s expectations.

Following these requirements will result in an unambiguous, user-friendly lexer that supports your high-level domain language, making it easier for both the parser and end users to process CPGL code correctly.
