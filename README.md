# @smile-digital-health/crl

Clinical Reasoning Language (CRL) parser and validator

Clinical Reasoning Language (CRL) provides a structured way to model clinical decision logic, concept derivations, clinical activities, measurements, and summaries — while remaining simple, readable, and guideline-compatible.

## Overview

See the [User Guide](./USER_GUIDE.md) for a comprehensive introduction to the CRL language, syntax, and authoring best practices. For the **CLI and MCP tool reference** (emit, validate, the 7 MCP tools — for both CRL and CEL), see [TOOLING.md](./TOOLING.md).

CRL is a domain-specific language designed for expressing clinical practice guidelines in a structured and machine-readable format. The language is implemented in TypeScript and provides a comprehensive set of tools for processing CRL documents.

## Metadata annotations

CRL concepts can carry typed metadata via an `@tag` convention on `meta` lines (e.g. `@description`, `@ke-feedback`, `@kg-concept`) — for descriptions, knowledge-engineer feedback, plain-language logic, external-store hints, and extraction provenance. See the [metadata model](./spec/metadata-model.md) and the canonical [tag registry](./spec/metadata-registry.json). *(Draft: the convention parses today; Validator enforcement is forthcoming.)*

## Installation

This is a private package. To install it, you need:

1. An npm account with access to `@smile-digital-health` packages
   - Contact your team lead to request access
   - You will receive an invitation to join the organization
   - Each developer should use their own npm account

2. Set up authentication:

   ```bash
   # Log in to npm - recommended for individual developers
   npm login
   ```

  Or create/edit `~/.npmrc` with your personal access token (note the second line is **NOT a comment**):

  ```npmc
@smile-digital-health:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=YOUR_NPM_TOKEN
   ```

   > **Security Note:** Always use your personal npm token. Do not share tokens between team members.

Once authenticated, install the package:

```bash
npm install @smile-digital-health/crl
```

Or add it to your `package.json`:

```json
"dependencies": {
  "@smile-digital-health/crl": "^0.6.1"
}
```

### For Package Maintainers

#### Publishing to npm

The package is automatically published to npm when a new GitHub release is created (non-draft, non-prerelease). To verify what will be published:

```bash
# See what files would be included in the package
npm publish --dry-run

# Create the package locally without publishing
npm pack

# Examine contents of the generated .tgz file
tar -ztvf <package-name>.tgz
```

#### Cutting a release (build both artifacts + upload to GitHub)

Releases ship two artifacts side-by-side: the npm tarball (`@smile-digital-health/crl-<version>.tgz`) and the VS Code extension VSIX (`crl-language-support-<version>.vsix`).

**Heads-up (Windows):** if you have VS Code open with the CRL extension active, its bundled MCP server keeps `dist/` files open and both `npm pack` and `npm run package` will fail with `EPERM` on `dist/`. Close VS Code (or just disable the CRL extension) before running the build commands below.

```bash
# 1. Close VS Code (or disable the CRL extension) so the MCP server releases its lock on dist/.
# 2. From the repo root, build the npm tarball:
npm pack

# 3. Build the extension VSIX:
cd extension && npm run package

# 4. Upload the resulting .tgz and .vsix to the corresponding GitHub release.
```

Both artifacts are produced at the version declared in their respective `package.json` files. Bump those (and tag the commit `v<version>`) before running the steps above so the produced filenames match the release tag.

## Features

### Language Features

* Decision blocks with nested conditions
* Concept definitions with type and value specifications
* Activity statements with perform types
* Terminology statements with valueset, system/code, and unknown definitions
* FHIR resource type support
* String literals with proper escaping
* Comments (single-line and block)

### Processing Features

* Lexical analysis with detailed token information
* Syntax parsing with error recovery
* AST generation with type safety
* Semantic validation with comprehensive error reporting
* Cross-platform compatibility (Windows, Mac, Linux)

### Development Features

* TypeScript implementation for type safety
* Comprehensive test suite
* Detailed documentation
* Example implementations
* Development tools and utilities

## CLI Usage

> **⚠️ WARNING:**
> When using npm scripts and passing arguments to the underlying CLI, always use `--` before your arguments. Otherwise, npm will not pass them to your script.
> 
> **Example:**
> ```bash
> npm run cli:lexer -- --path path/to/your/file.crl --pretty
> ```

The CRL package includes command-line tools for processing CRL files. Each tool supports the following options:

- `--path <file>`: Specify the path to a CRL file to process. If omitted, the main example file is used by default.
- `--pretty`: Output formatted (pretty-printed) results instead of raw JSON.

### Lexer Tool

```bash
npx ts-node src/cli/run-lexer.ts
npx ts-node src/cli/run-lexer.ts --pretty
npx ts-node src/cli/run-lexer.ts --path path/to/your/file.crl
npx ts-node src/cli/run-lexer.ts --path path/to/your/file.crl --pretty
```

### Parser Tool

```bash
npx ts-node src/cli/run-parser.ts
npx ts-node src/cli/run-parser.ts --pretty
npx ts-node src/cli/run-parser.ts --path path/to/your/file.crl
npx ts-node src/cli/run-parser.ts --path path/to/your/file.crl --pretty
```

### AST Tool

```bash
npx ts-node src/cli/run-ast.ts
npx ts-node src/cli/run-ast.ts --pretty
npx ts-node src/cli/run-ast.ts --path path/to/your/file.crl
npx ts-node src/cli/run-ast.ts --path path/to/your/file.crl --pretty
```

### Validator Tool

```bash
npx ts-node src/cli/run-validator.ts
npx ts-node src/cli/run-validator.ts --pretty
npx ts-node src/cli/run-validator.ts --path path/to/your/file.crl
npx ts-node src/cli/run-validator.ts --path path/to/your/file.crl --pretty
```

By default, each command processes the main example CRL file. To process a different file, provide the file path using `--path`. Use `--pretty` for formatted output.

### FSH-to-CRL Transformer Tool

The FSH-to-CRL transformer converts FHIR Shorthand (FSH) files into Clinical Reasoning Language (CRL) files. It supports advanced mapping and deduplication logic for activities, concepts, and terminology blocks.

#### Activity Mapping Enhancements

- **Conditional `do not perform`**: If an activity in FSH has `doNotPerform = true`, the generated CRL will emit `do not perform` instead of `perform` for that activity.
- **Activity Terminology Block Emission**: For activities with a `medicationCodeableConcept`, the terminology block uses the `system` and `code` properties directly from the FSH object. For activities using `dynamicValue.expression.expression` with `path = "code.coding"`, the code and system are extracted from the CQL code expression.
- **Deduplication and Suffixing**: Terminology blocks are unique by identifier and body. If a duplicate identifier is encountered with a different body, a numeric suffix (e.g., `_2`) is added to the identifier. If both identifier and body are the same, the block is not duplicated.
- **Extraction Logic**: For `medicationCodeableConcept`, the transformer uses `system`, `code`, and `identifier` from the FSH object. For `dynamicValue.expression.expression` (where `path = "code.coding"`), the transformer uses `system` and `code` from the CQL code expression string and `identifier` from the corresponding description.

For more details, see the [User Guide](./USER_GUIDE.md) and the technical mapping documentation.

## CLI Tool Usage

You can run specific CLI modules using the following command:

```
npm run cli:<module>
```

For example, to run the lexer CLI on a CRL file:

```
npm run cli:lexer
```

Replace `<module>` with the desired CLI module name (e.g., `lexer`, `parser`, etc.).

## FHIR Definition Emit (v2.4.0)

CRL emits CPG-IG-conformant FHIR Definition resources (ValueSet, Library, ActivityDefinition, PlanDefinition) alongside the existing CQL emit.

```bash
crl-emit --path <root.crl> --out-dir <project-root> --target fhir-def
```

Output lands at `<project-root>/fhir/<ResourceType>/<id>.json`. CQL emit (the existing `--target cql` / default behavior) lands at `<project-root>/cql/<library-name>.cql`. Library content references the CQL file via the relative path `../../cql/<library-name>.cql`.

For semantic rules, layout details, deliberate spec deviations, and the MCP `emit_crl_fhir` tool, see [`USER_GUIDE.md` §"Emitting FHIR Definition resources"](USER_GUIDE.md#emitting-fhir-definition-resources).

## API Usage & Reference

**All API functions return a `ParseResult` object. If there are any lexical or syntax errors, these are collected and returned in the `errors` array (not just printed to the console). You should always check `result.success` and handle errors accordingly.**

The package provides four main functions for processing CRL code:

### 1. Tokenization

```typescript
import { tokenizeCRL } from '@smile-digital-health/crl';


const result = tokenizeCRL(`# Example
  decision "Test":
    - when "Condition" then recommend activity "Action".
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
import { parseCRL } from '@smile-digital-health/crl';

const result = parseCRL(`# Example
  decision "Test":
    - when "Condition" then recommend activity "Action".
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
import { buildCRL } from '@smile-digital-health/crl';

const result = buildCRL(`# Example
  decision "Test":
    - when "Condition" then recommend activity "Action".
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

> ⚠️ **Note:** Validation functionality is not yet implemented. The `validateCRL` function is a placeholder and will likely throw or return an error if used.

```typescript
import { validateCRL } from '@smile-digital-health/crl';

const result = validateCRL(`# Example
  decision "Test":
    - when "Condition" then recommend activity "Action".
`);

if (result.success) {
  // Access the validated AST
  console.log(result.result);
} else {
  // Handle validation errors
  console.error(result.errors);
}
```

### Core Functions & Types

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

## Examples

### Example AST Comparison

To compare the generated AST with the expected AST, you can run:

```bash
npx ts-node --log-error src/examples/compare-ast.ts
```

This will:

1. Parse the example CRL file (`docs/Measles Immunization Decision.crl`)
2. Generate an AST from the parsed input
3. Compare it with the expected AST (`docs/Expected AST.ast`)
4. Display any differences between the two ASTs

The comparison includes:

* Line count matching
* Whitespace-normalized matching
* Structure matching
* Detailed line-by-line comparison of differences

### FSH-to-CRL Example Data

The example FSH files and CRL outputs in `src/examples/fsh/who/smart-example-immz/` and `src/examples/crl/who/smart-example-immz/` are derived from the [WHO SMART Guidelines - Example IG for Measles Immunization](https://github.com/WorldHealthOrganization/smart-example-immz).

- **Source repository:** [WorldHealthOrganization/smart-example-immz](https://github.com/WorldHealthOrganization/smart-example-immz)
- **License:** [CC BY-IGO 3.0](https://github.com/WorldHealthOrganization/smart-example-immz/blob/main/LICENSE.md)

These examples are used for development, testing, and demonstration of the transformer.

## Updating Grammar & Generated Files

### Updating grammar files

```bash
npm run generate
```

This will extract all grammar-driven types and regenerate the lexer and parser.

### Grammar-Driven Types

* The lists of valid activity types, concept types, and concept value types are defined in the `validTypes` arrays in the `ACTIVITY_TYPE`, `CONCEPT_TYPE`, and `CONCEPT_VALUE_TYPE` rules of `src/grammar/CRLLexer.g4`.
* Scripts (`scripts/extractActivityTypes.js`, `scripts/extractConceptTypes.js`, `scripts/extractConceptValueTypes.js`) automatically extract these lists and write them to `src/grammar/activityTypes.json`, `src/grammar/conceptTypes.json`, and `src/grammar/conceptValueTypes.json`.
* TypeScript modules (`src/grammar/activityTypes.ts`, `src/grammar/conceptTypes.ts`, `src/grammar/conceptValueTypes.ts`) import these JSON files and export both the arrays and type-safe union types.
* **All code (lexer, AST, error listener, etc.) should import from these modules to avoid drift.**

### ANTLR-Generated Files

The following files are generated by ANTLR and should not be edited manually or tracked in git:

* `src/grammar/generated/antlr/CRLLexer.ts`
* `src/grammar/generated/antlr/CRLParser.ts`
* `src/grammar/generated/antlr/CRLParserVisitor.ts`
* `src/grammar/generated/antlr/CRLParserListener.ts`
* `src/grammar/generated/antlr/CRLLexer.tokens`
* `src/grammar/generated/antlr/CRLLexer.interp`
* `src/grammar/generated/antlr/CRLParser.tokens`
* `src/grammar/generated/antlr/CRLParser.interp`

To regenerate these files, run:

```bash
npm run generate
```

These files are ignored by git via `.gitignore` and will be recreated as needed.

## Development

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
   * Tests for fundamental language tokens
   * Keywords, punctuation, and basic syntax

2. **FHIR Types** (`fhir-types.test.ts`)
   * Tests for FHIR-specific activity types
   * Validation of CPG-prefixed activity types
   * Error handling for invalid types

3. **Grammar Example** (`grammar-example.test.ts`)
   * Tests the lexer against the complete grammar example
   * Validates real-world usage scenarios

4. **Error Handling** (`error-handling.test.ts`)
   * Tests for invalid input handling
   * Error message validation
   * Recovery from syntax errors

5. **Comments** (`comments.test.ts`)
   * Tests for comment handling
   * Single-line and block comments
   * Comment placement and nesting

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

* `getAllTokens`: Retrieves all tokens from a lexer
* `verifyTokenSequence`: Validates token sequences
* `getActionTokenSequence`: Helper for activity type tests
* `getCaseFeatureTokenSequence`: Helper for concept type tests
* `getValueTypeTokenSequence`: Helper for value type tests

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

If you modify the grammar in `src/grammar/CRL.g4`, you'll need to regenerate the lexer and parser:

```bash
cd src/grammar
antlr4ts -Xforce-atn -o src/grammar/generated src/grammar/CRLLexer.g4 && antlr4ts -Xforce-atn -o src/grammar/generated src/grammar/CRLParser.g4
```

Note: This project uses a custom AST implementation that uses ANTLR's visitor pattern. The generated files are used only for lexing and parsing directly, while semantic analysis and interpretation are handled by our custom AST implementation.

## 📦 Release Process & Checklist

> **Release Process:**
>
> The authoritative release checklist and instructions are maintained in a single location:
> 
> **[.github/PULL_REQUEST_TEMPLATE/release.md](.github/PULL_REQUEST_TEMPLATE/release.md)**
>
> Always follow the steps in this file when preparing a new release. This ensures consistency and reduces maintenance overhead. If you need to update the release process, update the PR template only.

## Developer Notes & Error Handling

### Developer Notes: Release Checklist & GitHub Automation

- **Pull Request Templates:** The project uses GitHub's PR template system to standardize release PRs and ensure all required steps are followed.
- **Release Automation:** The release process is automated via scripts and GitHub Actions. Always ensure your working directory is clean and up-to-date before running release scripts.
- **CI/CD:** All tests and builds are run in GitHub Actions before a release is published. If any step fails, the release will be blocked.
- **Generated Files:** Auto-generated files (e.g., ANTLR outputs, grammar-driven types) are ignored by git and should never be edited manually. Always use the provided scripts to regenerate them.
- **Documentation:** Keep all documentation referencing the release checklist up-to-date by linking to the PR template.

For more details, see the [release PR template](.github/PULL_REQUEST_TEMPLATE/release.md) and the automation scripts in `.github/scripts/`.

### Error Handling Strategy

This project implements robust, layered error handling across all stages of the CRL pipeline:

| Layer     | Responsibility                                  | Error Type         | How Errors Are Reported                |
|-----------|-------------------------------------------------|--------------------|----------------------------------------|
| Lexer     | Tokenization, valid characters/tokens            | LexicalError       | Collected by error listener, JSON      |
| Parser    | Syntax, structure, required/optional elements    | ParserError        | Collected by error listener, JSON      |
| AST       | Parse tree → AST, structural integrity           | AstError           | Collected by AST builder, JSON         |
| Validator | Domain/semantic rules, cross-references, logic   | ValidationError    | Collected by validator, plain text     |

- **Lexical and parser errors** are collected by their respective error listeners and reported as JSON strings with a `type` property (e.g., `"LexicalError"`, `"ParserError"`).
- **AST errors** are reported as `"AstError"` if the AST builder encounters a structural problem not caught by the parser.
- **Validation errors** are reported by the validator after AST construction.

#### Example Error Object

```json
{
  "type": "ParserError",
  "line": 1,
  "column": 51,
  "message": "Syntax error: missing 'done' at '<EOF>'",
  "details": {
    "offendingSymbol": { "text": "<EOF>", ... }
  }
}
```

#### Clean Test Output: Suppressing Console Errors in Jest

To keep test output clean and focused on actual test failures, all `console.error` output is globally suppressed during tests. This is achieved by adding the following to `jest.setup.js`:

```js
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
```

And registering it in `jest.config.js`:

```js
setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
```

This ensures that error logs are visible during development and CLI runs, but do not clutter test output.

## Editor Support: VS Code Extension

We provide a Visual Studio Code extension for CRL files:

- Syntax highlighting for `.crl` files
- Comment support
- Language basics for a better editing experience

For installation instructions and full details, see [extension/README.md](./extension/README.md)
