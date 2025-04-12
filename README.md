/**
 * Clinical Practice Guideline Language (CPGL)
 */

# Clinical Practice Guideline Language

A domain-specific language for expressing clinical practice guidelines.

## Overview

This project implements a lexer and parser for the Clinical Practice Guideline Language (CPGL), a domain-specific language designed for expressing clinical practice guidelines in a structured and machine-readable format.

## Features

- Lexical analysis of CPGL documents
- Support for:
  - Decision blocks
  - Condition clauses
  - Action statements
  - FHIR resource types
  - String literals
  - Comments (single-line and block)
  - Indentation-based structure

## Installation

```bash
npm install clinical-practice-guideline-language
```

## Usage

Here's a basic example of using the lexer:

```typescript
import { CharStreams } from 'antlr4ts';
import { CPGLLexer } from 'clinical-practice-guideline-language';

// Create a lexer instance
const input = `decision "Test Decision"
    when "Condition" then
        do "Action"`;
const lexer = new CPGLLexer(CharStreams.fromString(input));

// Get tokens
let token = lexer.nextToken();
while (token.type !== TokenTypes.EOF) {
    console.log(`Token: ${token.typeName} = "${token.text}"`);
    token = lexer.nextToken();
}
```

## Development

### Updating grammar files

```bash
npm run generate
```

### Building

```bash
npm run build
```

### Test Documentation

The project includes a comprehensive test suite to ensure the correctness of the lexer and parser. Here's how to run and work with the tests:

#### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test files
npm test src/lexer/tests/basic-tokens.test.ts
npm test src/lexer/tests/fhir-types.test.ts
npm test src/lexer/tests/grammar-example.test.ts

# Run tests in watch mode (useful during development)
npm run test:watch
```

#### Test Categories

The test suite is organized into several categories:

1. **Basic Tokens** (`basic-tokens.test.ts`)
   - Tests for fundamental language tokens
   - Keywords, punctuation, and basic syntax

2. **FHIR Types** (`fhir-types.test.ts`)
   - Tests for FHIR-specific activity types
   - Validation of CPG-prefixed activity types
   - Error handling for invalid types

3. **Grammar Example** (`grammar-example.test.ts`)
   - Tests the lexer against the complete grammar example
   - Validates real-world usage scenarios

4. **Error Handling** (`error-handling.test.ts`)
   - Tests for invalid input handling
   - Error message validation
   - Recovery from syntax errors

5. **Comments** (`comments.test.ts`)
   - Tests for comment handling
   - Single-line and block comments
   - Comment placement and nesting

#### Writing Tests

When adding new tests:

1. Place test files in the appropriate directory under `src/lexer/tests/`
2. Follow the existing test patterns
3. Include both positive and negative test cases
4. Use descriptive test names
5. Add comments explaining complex test scenarios

Example test structure:
```typescript
describe('Feature Name', () => {
  it('should handle valid input', () => {
    // Test valid cases
  });

  it('should handle invalid input', () => {
    // Test error cases
  });
});
```

#### Test Utilities

The test suite includes several utility functions:

- `getAllTokens`: Retrieves all tokens from a lexer
- `verifyTokenSequence`: Validates token sequences
- `getActionTokenSequence`: Helper for activity type tests
- `getCaseFeatureTokenSequence`: Helper for concept type tests
- `getValueTypeTokenSequence`: Helper for value type tests

### Linting

The project uses ESLint for code quality checks. To run the linter:

```bash
# Lint all TypeScript files
npx eslint . --ext .ts

# Lint and automatically fix issues where possible
npx eslint . --ext .ts --fix
```

### Running Examples

The project includes several example files that demonstrate different features and validation scenarios:

```bash
# Run the basic usage example
npm run example

# Run specific examples
npm run example:basic
npm run example:debug
npm run example:full
```

### Regenerating ANTLR Files

If you modify the grammar in `src/grammar/CPGL.g4`, you'll need to regenerate the lexer and parser:

```bash
cd src/grammar
antlr4ts -visitor -Xforce-atn -o src/grammar/generated src/grammar/CPGLLexer.g4 && antlr4ts -visitor -Xforce-atn -o src/grammar/generated src/grammar/CPGLParser.g4
```
