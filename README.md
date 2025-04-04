# Clinical Practice Guideline Language (CPGL)

A TypeScript implementation of a lexer for the Clinical Practice Guideline Language (CPGL), a domain-specific language for expressing clinical practice guidelines in a structured and executable format.

## Features

- Indentation-based syntax (similar to Python)
- Support for decision trees and clinical recommendations
- Semantic tokens for clinical concepts
- Proper handling of comments, string literals, and indentation
- Cross-platform compatibility

## Installation

```bash
npm install
```

## Usage

```typescript
import { CharStreams } from 'antlr4ts';
import { CPGLLexer, CPGLTokenType } from 'clinical-practice-guideline-language';

// Example input string
const input = `
decision HypertensionTreatment
    when
        patient.condition == "hypertension"
        patient.age > 18
    then
        recommend "Consider lifestyle modifications"
        recommend "Start antihypertensive medication"
            with EVIDENCE_LEVEL "high"
`;

// Create a character stream from the input
const chars = CharStreams.fromString(input);

// Create a lexer that feeds off of the character stream
const lexer = new CPGLLexer(chars);

// Process the tokens
let token = lexer.nextToken();
while (token.type !== CPGLTokenType.EOF) {
    console.log(`Token: ${token.type} (${CPGLTokenType[token.type]}) - '${token.text}'`);
    token = lexer.nextToken();
}
```

## Development

### Building the project

```bash
npm run build
```

### Running tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Running the example

```bash
npm run example
```

## License

MIT