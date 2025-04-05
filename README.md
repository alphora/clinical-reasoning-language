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
import { CPGLLexer, GeneratedLexer } from 'clinical-practice-guideline-language';

// Create a lexer instance
const input = `decision "Test Decision"
    when "Condition" then
        do "Action"`;
const lexer = new CPGLLexer(CharStreams.fromString(input));

// Get tokens
let token = lexer.nextToken();
while (token.type !== GeneratedLexer.EOF) {
    console.log(`Token: type=${token.type} (${token.typeName}), text="${token.text}"`);
    token = lexer.nextToken();
}
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

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
antlr4ts CPGL.g4 -o generated
```

## License

MIT