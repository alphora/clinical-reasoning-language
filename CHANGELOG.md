# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-03-19

### Added
- Initial release of the Clinical Practice Guideline Language (CPGL) parser and validator package
- Core functionality:
  - Tokenization of CPGL input
  - Parsing of CPGL input into parse trees
  - AST building from CPGL input
  - Validation of CPGL input
- Language support for:
  - Decision blocks
  - Condition clauses
  - Action statements
  - FHIR resource types
  - String literals
  - Comments (single-line and block)
  - Indentation-based structure
- Comprehensive error handling and reporting
- TypeScript type definitions
- CLI tools for lexer, parser, AST, and validator
- Test suite with comprehensive coverage
- ESLint and Prettier configuration
- Documentation including API reference and usage examples

### Technical Details
- Built with TypeScript
- Uses ANTLR4 for grammar parsing
- Supports CommonJS and ES modules
- Zero dependencies (except for development)
- MIT licensed

### Installation
```bash
npm install github:cqis/cpgl#v0.1.0
```

### Usage Examples

#### Tokenization
```typescript
import { tokenizeCPGL } from '@cqis/cpgl';

const result = tokenizeCPGL(`
  decision "Test":
    when "Condition" then do "Action".
  done
`);
```

#### Parsing
```typescript
import { parseCPGL } from '@cqis/cpgl';

const result = parseCPGL(`
  decision "Test":
    when "Condition" then do "Action".
  done
`);
```

#### AST Building
```typescript
import { buildCPGL } from '@cqis/cpgl';

const result = buildCPGL(`
  decision "Test":
    when "Condition" then do "Action".
  done
`);
```

#### Validation
```typescript
import { validateCPGL } from '@cqis/cpgl';

const result = validateCPGL(`
  decision "Test":
    when "Condition" then do "Action".
  done
`);
``` 