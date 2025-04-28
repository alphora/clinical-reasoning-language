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

## [0.5.0] - 2025-04-19

### Added
- **Rationale support:** Added rationale property to activities and grammar, with support in the AST and pretty-printer.
- **Markdown/free text:** Activities and terminology can now use backtick-quoted markdown/free text values.
- **Comprehensive builder and grammar tests:** Expanded and improved test coverage for builder, grammar, and edge cases.
- **Warning for pretty mode:** The AST CLI now warns that pretty mode is currently broken.

### Changed
- **Grammar overhaul:** 
  - Double quotes are now required for all identifiers and references.
  - Backticks are required for all free text, markdown, and rationale values.
  - Updated grammar and lexer to enforce these quoting rules.
  - Improved handling of concept inferred-by and coded-by clauses.
- **Refactored builder:** 
  - Improved type safety and error handling.
  - Refactored to use optional chaining and modern TypeScript idioms.
  - Removed unnecessary type assertions and redundant checks.
- **Test suite:** 
  - Updated all builder and grammar tests to match new quoting and grammar rules.
  - Added tests for empty and edge-case values (e.g., empty backtick strings).
- **Documentation:** 
  - Updated grammar examples and README to reflect new quoting and rationale rules.

### Fixed
- **Linter and SonarLint issues:** 
  - Addressed all major linter warnings, including optional chaining, redundant conditions, and union types with `any`.
  - Fixed bugs in builder logic that could cause undefined errors in certain edge cases.
- **Grammar bugs:** 
  - Fixed issues with concept and activity parsing.
  - Fixed builder and grammar to handle new rationale and markdown rules.

### Technical Improvements
- Improved error messages and debugging output in the builder.
- Hardened AST builder against malformed parse trees.
- Improved maintainability and readability of the codebase.

### Known Issues
- **Pretty mode in AST CLI is currently broken** and will print a warning if used.

[0.5.0]: https://github.com/cqis/cpgl/releases/tag/v0.5.0

## [0.5.1] - 2024-06-10

### Fixed
- **Error message handling:** Improved error reporting and error message clarity throughout the lexer, especially in `CPGLLexerErrorListener`.
- Fixed bug in how the error listener accesses dynamically generated type files.
- Fixed build and test issues related to the new location of auto-generated files and dynamic type imports.
- Ensured all grammar-driven type files (activity, concept, value) are correctly included and referenced in builds and tests.
- Improved robustness of error handling for missing or misconfigured type files.
- Fixed test paths and removed unused files.

### Technical Improvements
- Refactored error listener to use dynamically generated JSON type files for activity, concept, and value types.
- Hardened error handling for missing or invalid type files, with more actionable error messages.
- Improved maintainability by moving auto-generated files to a more standard location.

[0.5.1]: https://github.com/cqis/cpgl/releases/tag/v0.5.1

## [0.5.2] - 2025-04-25

### Fixed
- **Parser & Error Emission:**  Fixed a bug in the test helper `parseInput` that caused parser errors not to be emitted or captured correctly. The helper now uses the correct parser API, ensuring that error listeners and error reporting work as intended in all AST and parser tests.
- All parser and lexer tests now pass, confirming correct error emission and reporting.

### Internal
- Refactored test helpers to use the new `createParser(input: string)` API.
- Removed legacy lexer and token stream instantiation from test code.

Commits included since v0.5.1:
- db66606 Passing parser tests
- b4524a1 All lexer tests passing
- 5b0d850 Restore dist/ to .gitignore after GitHub Publish
- a93a445 Include dist for GitHub Publish
- 1c6eb97 Release documentation 

## [0.5.3] - 2025-04-25

### Fixed
- **GitHub Publish Hotfix:** Ensured all required build and generated files are included in the release commit/tag for GitHub installs. This fixes issues where users could not install from GitHub due to missing files.

### Added
- **Release Workflow:** Added a GitHub Actions workflow to require all tests to pass before a release is published.

## [v0.5.4]

### Fixed
- Regression not running in GitHub CI.
- Included dist and generated files for GitHub Publish to ensure all necessary files are present for deployment and installation.
- Included files needed for GitHub deploy to improve release reliability.

Commits included since v0.5.3:
- 7643835 Regression not running in github ci
- 249cdb6 Include dist and generated files for GitHub Publish
- f56580a Include files needed for github deploy

## [v0.6.0] - YYYY-MM-DD
### Added
- No major new features in this release.

### Changed
- Numerous linter fixes and code style improvements for better code quality and maintainability. (rob-reynolds)
- Improved lexer and test reliability, addressing issues in lexer tests and token handling. (rob-reynolds)

### Fixed
- Fixed various linter errors and warnings across the codebase. (rob-reynolds)
- Addressed issues in lexer and related tests to ensure correct tokenization and test coverage. (rob-reynolds)

---
 
## Unreleased 
- Fixed bug where error handling wasn't adding detailed errors when they were thrown by the build or parse modules. (rob-reynolds, 2025-04-28)
- Remove the validator test that was failing (rob-reynolds, 2025-04-27)
- Update readme (rob-reynolds, 2025-04-27)
- Restore dist/ to .gitignore after GitHub Publish (rob-reynolds, 2025-04-27)
- 0.6.0 (rob-reynolds, 2025-04-27)
- Include dist for GitHub Publish (rob-reynolds, 2025-04-27)
- Comment build in unimplemented validator (rob-reynolds, 2025-04-27)
- Updated documentation (rob-reynolds, 2025-04-27)
- Update documentation (rob-reynolds, 2025-04-27)