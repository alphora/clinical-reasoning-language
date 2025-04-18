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

## [0.2.0] - 2024-04-17

### Added
- Enhanced concept structure support:
  - Proper expression of concept.inferred-by
  - Improved concept valueset handling
  - Better type and value specifications
- New validator implementation with comprehensive checks
- Keyword-specific structure tests
- Duplicate action detection with warning system

### Changed
- Refactored builder implementation for better maintainability
- Renamed `activityType` to `perform` to match grammar
- Renamed `File` to `CPGL` for consistency
- Moved duplicate detection from builder to validator
- Improved test organization and coverage

### Fixed
- Fixed build process to ensure files are properly included in dist
- Resolved linter issues
- Fixed cycle detection in validator
- Corrected concept valueset handling
- Addressed various test failures and edge cases

### Technical Improvements
- Enhanced test framework
- Improved error handling and reporting
- Better type safety in builder implementation
- More robust validation system
- Cleaner code organization

### Important Note
- **Temporary Change**: The validator has been temporarily disabled to allow for refactoring to match the builder implementation. This functionality will be restored in the next release.

[0.2.0]: https://github.com/cqis/cpgl/releases/tag/v0.2.0

## [0.3.0] - 2025-04-17

### Changed
- Formatted parser error to match lexer error.

### Known Issues
- Error tests are currently broken and will be addressed in a future update.

[0.3.0]: https://github.com/cqis/cpgl/releases/tag/v0.3.0

## [0.4.0] - 2024-06-09

### Added
- WHO IMM Strategy example
- Prepublish utility script for automated GitHub releases
- Developer notes documentation
- All grammar-driven types (activity, concept, value) are now auto-generated from the grammar for consistency and maintainability.
- Hardened prepublish script with robust error handling, rollback, and working directory checks.

### Changed
- Updated lexer to automatically extract activity types from grammar
- Improved example files
- Consistent behavior across the lexer
- Refactored lexer error handling for consistency
- Improved and fixed tests in the lexer
- Fixed activity types in grammar
- Updated documentation to reflect new grammar-driven type extraction and release process.
- Added prepublish:github script to package.json for easier releases.

### Fixed
- Bug fixes in lexer grammar
- Fixed builder tests to align with new type system and grammar-driven types.

[0.4.0]: https://github.com/cqis/cpgl/releases/tag/v0.4.0 