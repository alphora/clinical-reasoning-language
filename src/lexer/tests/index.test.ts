/**
 * CPGL Lexer Tests
 *
 * These tests verify the lexer's ability to correctly tokenize CPGL input according to the grammar.
 * The tests are organized by category and follow the structure of the CPGL grammar.
 *
 * Note: The deep nesting in this file is intentional and follows the grammar's hierarchical structure.
 * We suppress the nesting depth linter warnings (typescript:S2004) because:
 * 1. The nesting matches the logical organization of the grammar
 * 2. It helps group related tests together
 * 3. It makes test failures easier to diagnose
 * 4. The nesting is necessary for proper test organization
 *
 * Test Categories:
 * 1. Basic Tokens
 *    - Keywords (decision, when, then, do, use, any, all)
 *    - String literals
 *    - Boolean operators (AND, OR, NOT)
 *    - Parentheses
 *
 * 2. Whitespace and Indentation
 *    - 4-space indentation
 *    - Newlines
 *    - Multiple indentation levels
 *    - DEDENT at EOF
 *    - Invalid indentation patterns
 *
 * 3. Comments
 *    - Single-line comments
 *    - Block comments
 *    - Comments with indentation
 *    - Comments between tokens
 *
 * 4. FHIR Types
 *    - Action FHIR types
 *    - CaseFeature FHIR types
 *    - Value types (string, boolean, integer, etc.)
 *    - Invalid FHIR types
 *
 * 5. Complex Structures
 *    - Decision blocks
 *    - Casefeatures with expressions
 *    - Nested blocks with qualifiers
 *    - Multiple terminal actions
 *    - Complex boolean expressions
 *
 * 6. Error Handling
 *    - Invalid tokens
 *    - Unterminated strings
 *    - Invalid indentation
 *    - Missing newlines
 *    - Invalid boolean expressions
 *    - Invalid FHIR types
 *
 * 7. Token Emission Order
 *    - INDENT/DEDENT placement
 *    - NEWLINE handling
 *    - Block boundary tokens
 *
 * Adding New Test Cases:
 * 1. Choose the appropriate category based on the feature being tested
 * 2. Create a new test case with a descriptive name
 * 3. Use the helper functions:
 *    - getAllTokens(lexer): Get all tokens from input
 *    - verifyTokenSequence(tokens, expectedTypes): Verify token sequence
 * 4. For error cases, use expect(() => { ... }).toThrow()
 *
 * Test Structure:
 * Each test follows this pattern:
 * 1. Define input string
 * 2. Create lexer with input
 * 3. Get tokens
 * 4. Verify token sequence or error handling
 *
 * Relationship to Grammar:
 * These tests verify the lexer's ability to tokenize input according to the CPGL grammar.
 * The token types and sequences should match the grammar's requirements for:
 * - File structure
 * - Statement blocks
 * - Decision blocks
 * - When clauses
 * - Actions
 * - Casefeatures
 * - Expressions
 *
 * Note: These tests focus on token generation only. Parser integration tests
 * will be added after the lexer implementation is complete and stable.
 */
/**
 * Future Work: Parser Integration Tests
 *
 * Once the lexer implementation is complete and stable, the following parser integration tests
 * should be added:
 *
 * 1. Token Type Verification
 *    - Verify that all token types emitted by the lexer match the parser's expectations
 *    - Test token type compatibility with parser grammar rules
 *
 * 2. Token Stream Structure
 *    - Verify that the token stream structure aligns with grammar rules
 *    - Test proper token ordering for different CPGL constructs
 *
 * 3. End-to-End Parsing
 *    - Test parsing of complete example files
 *    - Verify successful parsing of complex CPGL structures
 *
 * Note: These tests should be added after the parser has been updated to work with
 * the new lexer implementation. Testing parser integration now would be premature
 * as the parser will need significant updates to work with the new lexer.
 */
import { CharStreams } from 'antlr4ts';
import { Token } from 'antlr4ts/Token';

import { CPGLLexer } from '../CPGLLexer';
import { TokenTypes } from '../CPGLLexerConstants';

/**
 * Helper function to get all tokens from a lexer
 */
export function getAllTokens(lexer: CPGLLexer): Token[] {
  const tokens: Token[] = [];
  let token = lexer.nextToken();
  while (token.type !== TokenTypes.EOF) {
    tokens.push(token);
    token = lexer.nextToken();
  }
  tokens.push(token); // Add EOF token
  return tokens;
}

/**
 * Helper function to verify a sequence of tokens
 */
export function verifyTokenSequence(
  tokens: Token[],
  expectedTypes: number[],
  expectedTexts?: string[],
) {
  expect(tokens.length).toBe(expectedTypes.length);
  for (let i = 0; i < tokens.length; i++) {
    expect(tokens[i].type).toBe(expectedTypes[i]);
    if (expectedTexts && expectedTexts[i]) {
      expect(tokens[i].text).toBe(expectedTexts[i]);
    }
  }
}

// Export common imports
export { CharStreams, TokenTypes, CPGLLexer, Token };
