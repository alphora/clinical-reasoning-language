/**
 * Clinical Practice Guideline Language (CPGL)
 */

# @cqis/cpgl

Clinical Practice Guideline Language (CPGL) parser and validator

## Overview

CPGL is a domain-specific language designed for expressing clinical practice guidelines in a structured and machine-readable format. The language is implemented in TypeScript and provides a comprehensive set of tools for processing CPGL documents.

### Core Modules

1. **Lexer Module**
   - Tokenizes CPGL input into a sequence of tokens
   - Handles lexical analysis of CPGL documents
   - Supports various token types including keywords, identifiers, and literals

2. **Parser Module**
   - Parses CPGL input into a parse tree
   - Implements grammar rules for CPGL syntax
   - Handles complex nested structures and expressions

3. **AST Module**
   - Builds and validates Abstract Syntax Trees (AST)
   - Provides type-safe AST structures
   - Handles semantic analysis and validation

4. **CLI Module**
   - Command-line interface for CPGL processing
   - Supports file-based and stdin/stdout operations
   - Provides validation and transformation capabilities

## Installation

### From GitHub Release

```bash
npm install github:cqis/cpgl#v0.1.0
```

## CLI Usage

The CPGL package includes command-line tools for processing CPGL files. Each tool can be run with the `--raw` flag to output raw JSON data instead of formatted output.

### Lexer Tool

```bash
# Run the lexer on the example file
npx ts-node src/cli/run-lexer.ts

# Run with raw JSON output
npx ts-node src/cli/run-lexer.ts --raw
```

The lexer tool tokenizes the input file and displays:
- Line and column numbers
- Token types
- Token text
- Formatted output with separators for readability

### Parser Tool

```bash
# Run the parser on the example file
npx ts-node src/cli/run-parser.ts

# Run with raw JSON output
npx ts-node src/cli/run-parser.ts --raw
```

The parser tool creates a parse tree from the input and displays:
- Tree structure
- Node types
- Text content
- Rule indices for grammar nodes

### AST Tool

```bash
# Run the AST builder on the example file
npx ts-node src/cli/run-ast.ts

# Run with raw JSON output
npx ts-node src/cli/run-ast.ts --raw
```

The AST tool builds an abstract syntax tree and displays:
- AST structure
- Node types
- Node properties
- Formatted tree representation

### Validator Tool

```bash
# Run the validator on the example file
npx ts-node src/cli/run-validator.ts

# Run with raw JSON output
npx ts-node src/cli/run-validator.ts --raw
```

The validator tool checks the AST for errors and displays:
- Validation status (valid/invalid)
- Error messages with line and column numbers
- Warning messages with line and column numbers

## Features

### Language Features
- Decision blocks with nested conditions
- Concept definitions with type and value specifications
- Activity statements with perform types
- Terminology statements with valueset, system/code, and unknown definitions
- FHIR resource type support
- String literals with proper escaping
- Comments (single-line and block)

### Processing Features
- Lexical analysis with detailed token information
- Syntax parsing with error recovery
- AST generation with type safety
- Semantic validation with comprehensive error reporting
- Cross-platform compatibility (Windows, Mac, Linux)

### Development Features
- TypeScript implementation for type safety
- Comprehensive test suite
- Detailed documentation
- Example implementations
- Development tools and utilities

## API Usage

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

### Core Functions

- `tokenizeCPGL(input: string): ParseResult<Token[]>`
- `parseCPGL(input: string): ParseResult<any>`
- `buildCPGL(input: string): ParseResult<File>`
- `validateCPGL(input: string): ParseResult<File>`

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

1. Create a new branch (e.g., `release/v0.1.0`)
1. Generate a CHANGELOG: "I'm creating a new release release/>version<, generate and append to the CHANGELOG.  Use git to determin the changes from the last tag to now.

" (e.g., v0.1.0)
1. Commit all changes
1. Run the automated release script:
   ```bash
   npm run prepublish:github -- <patch|minor|major|version>
   ```
   - This will:
     - Remove `dist/` from `.gitignore`
     - Build the project
     - Add and commit `dist/`
     - Bump the version and create a git tag (using the argument you provide)
     - Push the commit and tag to GitHub
     - Restore `dist/` to `.gitignore` and commit that change
     - Push the final commit
1. Create a PR & merge the PR (if working on a feature branch)
1. Create a new release on GitHub
   1. Tag the release with the version number (e.g., `v0.1.0`) if not already tagged
   1. Generate release notes

**Note:**
- You do NOT need to attach a `.tgz` file for GitHub-based npm installs.
- Users can install directly from GitHub using:
  ```bash
  npm install github:cqis/cpgl#v0.1.0
  ```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test files
npx jest src/ast/tests/decision-structure.test.ts --verbose --no-cache --colors --forceExit --detectOpenHandles --watchAll=false
```

### Updating Grammar

```bash
npm run generate
```

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
npx jest src/ast/tests/decision-structure.test.ts --verbose --no-cache --colors --forceExit --detectOpenHandles --watchAll=false 

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

1. Place test files in the appropriate directory, for example `src/lexer/tests/`
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
```

### Regenerating ANTLR Files

If you modify the grammar in `src/grammar/CPGL.g4`, you'll need to regenerate the lexer and parser:

```bash
cd src/grammar
antlr4ts -Xforce-atn -o src/grammar/generated src/grammar/CPGLLexer.g4 && antlr4ts -Xforce-atn -o src/grammar/generated src/grammar/CPGLParser.g4
```

Note: This project uses a custom AST implementation that uses ANTLR's visitor pattern. The generated files are used only for lexing and parsing directly, while semantic analysis and interpretation are handled by our custom AST implementation.

## Grammar-Driven Activity Types

### How Activity Types Stay in Sync

- The list of valid activity types is defined in the `validTypes` array in the `ACTIVITY_TYPE` rule of `src/grammar/CPGLLexer.g4`.
- A script (`scripts/extractActivityTypes.js`) automatically extracts this list and writes it to `src/grammar/activityTypes.json`.
- A TypeScript module (`src/grammar/activityTypes.ts`) imports this JSON and exports both the list and a type-safe union type.
- **All code (lexer, AST, error listener, etc.) should import from this module to avoid drift.**

### How to Update Activity Types

1. **Edit the `validTypes` array** in `src/grammar/CPGLLexer.g4`.
2. **Run**:
   ```bash
   npm run generate
   ```
   This will:
   - Extract the updated activity types to `src/grammar/activityTypes.json`
   - Regenerate the lexer and parser
   - Keep all code in sync

### Usage in TypeScript

```typescript
import { activityTypes, ActivityType } from './grammar/activityTypes';

// Use activityTypes as an array
console.log(activityTypes);

// Use ActivityType as a type
function isValidActivityType(type: string): type is ActivityType {
  return activityTypes.includes(type as ActivityType);
}
```

### Why?
- This ensures a **single source of truth** for activity types.
- No more manual updates or risk of drift between grammar and code.
- All validation, error reporting, and type checking use the same list.
