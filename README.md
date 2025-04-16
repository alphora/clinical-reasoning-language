/**
 * Clinical Practice Guideline Language (CPGL)
 */

# @cqis/cpgl

Clinical Practice Guideline Language (CPGL) parser and validator

## Installation

### From GitHub Release

```bash
npm install github:cqis/cpgl#v0.1.0
```

## Usage

The package provides four main functions for processing CPGL code:

### 1. Tokenization

```typescript
import { tokenizeCPGL } from '@cqis/cpgl';

const result = tokenizeCPGL(`
  decision "Test":
    when "Condition" then do "Action".
  done
`);

if (result.success) {
  // Access the tokens
  console.log(result.result);
} else {
  // Handle errors
  console.error(result.errors);
}
```

### 2. Parsing

```typescript
import { parseCPGL } from '@cqis/cpgl';

const result = parseCPGL(`
  decision "Test":
    when "Condition" then do "Action".
  done
`);

if (result.success) {
  // Access the parse tree
  console.log(result.result);
} else {
  // Handle errors
  console.error(result.errors);
}
```

### 3. AST Building

```typescript
import { buildCPGL } from '@cqis/cpgl';

const result = buildCPGL(`
  decision "Test":
    when "Condition" then do "Action".
  done
`);

if (result.success) {
  // Access the AST
  console.log(result.result);
} else {
  // Handle errors
  console.error(result.errors);
}
```

### 4. Validation

```typescript
import { validateCPGL } from '@cqis/cpgl';

const result = validateCPGL(`
  decision "Test":
    when "Condition" then do "Action".
  done
`);

if (result.success) {
  // Access the validated AST
  console.log(result.result);
} else {
  // Handle validation errors
  console.error(result.errors);
}
```

## API Reference

### `tokenizeCPGL(input: string): ParseResult<Token[]>`

Tokenizes CPGL input into a sequence of tokens.

### `parseCPGL(input: string): ParseResult<any>`

Parses CPGL input into a parse tree.

### `buildCPGL(input: string): ParseResult<File>`

Builds an AST from CPGL input.

### `validateCPGL(input: string): ParseResult<File>`

Validates CPGL input and returns the AST if valid.

### Types

```typescript
interface Token {
  line: number;
  column: number;
  type: string;
  text: string;
}

interface ParseResult<T> {
  success: boolean;
  result?: T;
  errors?: string[];
}
```

## Error Handling

All functions return a `ParseResult` object with:
- `success`: boolean indicating if the operation was successful
- `result`: the parsed/tokenized/validated result (if successful)
- `errors`: array of error messages (if unsuccessful)

## Development

### Building the Package

1. Install dependencies:
```bash
npm install
```

2. Build the package:
```bash
npm run build
```

3. Create a distribution tarball:
```bash
npm pack
```

This will generate a `.tgz` file (e.g., `@cqis-cpgl-0.1.0.tgz`) that can be distributed.

### Distribution

The package is distributed via GitHub Releases. To create a new release:

1. Create a new release on GitHub
2. Attach the generated `.tgz` file
3. Tag the release with a version number (e.g., `v0.1.0`)

Users can then install the package using:
```bash
npm install github:cqis/cpgl#v0.1.0
```

Replace `v0.1.0` with the specific version they want to install.

## License

MIT

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

## Example AST Comparison

To compare the generated AST with the expected AST, you can run:

```bash
npx ts-node --log-error src/examples/compare-ast.ts
```

This will:
1. Parse the example CPGL file (`docs/Measles Immunization Decision.cpgl`)
2. Generate an AST from the parsed input
3. Compare it with the expected AST (`docs/Expected AST.ast`)
4. Display any differences between the two ASTs

The comparison includes:
- Line count matching
- Whitespace-normalized matching
- Structure matching
- Detailed line-by-line comparison of differences

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
npm run example:lexer
npm run example:parser
```

#### Lexer Example
The lexer example (`run-lexer.ts`) demonstrates how to tokenize a CPGL document:
- Reads the grammar example file
- Creates a lexer with a custom error listener
- Prints all tokens found in the input

#### Parser Example
The parser example (`run-parser.ts`) demonstrates how to parse a CPGL document:
- Reads the grammar example file
- Creates a lexer with a custom error listener
- Creates a token stream
- Creates a parser with the same error listener
- Parses the input and prints the resulting parse tree

### Regenerating ANTLR Files

If you modify the grammar in `src/grammar/CPGL.g4`, you'll need to regenerate the lexer and parser:

```bash
cd src/grammar
antlr4ts -Xforce-atn -o src/grammar/generated src/grammar/CPGLLexer.g4 && antlr4ts -Xforce-atn -o src/grammar/generated src/grammar/CPGLParser.g4
```

Note: This project uses a custom AST implementation rather than ANTLR's visitor pattern. The generated files are used only for lexing and parsing, while semantic analysis and interpretation are handled by our custom AST implementation.
