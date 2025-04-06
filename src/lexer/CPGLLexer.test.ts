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
import { CharStreams } from 'antlr4ts';
import { TokenTypes } from './CPGLLexerConstants';
import { CPGLLexer } from './CPGLLexer';
import { Token } from 'antlr4ts/Token';

// Helper function to get all tokens from a lexer
function getAllTokens(lexer: CPGLLexer): Token[] {
  const tokens: Token[] = [];
  let token = lexer.nextToken();
  while (token.type !== TokenTypes.EOF) {
    tokens.push(token);
    token = lexer.nextToken();
  }
  tokens.push(token); // Include EOF token
  return tokens;
}

// Helper function to verify token sequence
function verifyTokenSequence(tokens: Token[], expectedTypes: number[], expectedTexts?: string[]) {
  expect(tokens.length).toBe(expectedTypes.length);
  tokens.forEach((token, index) => {
    expect(token.type).toBe(expectedTypes[index]);
    if (expectedTexts?.[index]) {
      expect(token.text).toBe(expectedTexts[index]);
    }
  });
}

// Helper function to determine FHIR type token
function getFhirTypeToken(input: string): number {
  if (input.includes('Action')) {
    return TokenTypes.ACTION_FHIR_TYPE;
  }
  if (input.includes('CaseFeature')) {
    return TokenTypes.CASEFEATURE_FHIR_TYPE;
  }
  return TokenTypes.FHIR_VALUE_TYPE;
}

describe('CPGLLexer', () => {
  describe('Basic Tokens', () => {
    it('should tokenize keywords', () => {
      const input = 'decision when then do use any all action fhirtype casefeature casefeaturecode profileurl valuetype expression';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.WHEN,
        TokenTypes.THEN,
        TokenTypes.DO,
        TokenTypes.USE,
        TokenTypes.ANY,
        TokenTypes.ALL,
        TokenTypes.ACTION,
        TokenTypes.FHIRTYPE,
        TokenTypes.CASEFEATURE,
        TokenTypes.CASEFEATURECODE,
        TokenTypes.PROFILEURL,
        TokenTypes.VALUETYPE,
        TokenTypes.EXPRESSION,
        TokenTypes.EOF
      ]);
    });

    it('should tokenize strings', () => {
      const input = '"simple string" "string with spaces" "string with \\"quotes\\""';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.STRING,
        TokenTypes.STRING,
        TokenTypes.STRING,
        TokenTypes.EOF
      ], [
        '"simple string"',
        '"string with spaces"',
        '"string with \\"quotes\\""'
      ]);
    });

    it('should tokenize boolean operators', () => {
      const input = 'OR AND NOT';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.OR,
        TokenTypes.AND,
        TokenTypes.NOT,
        TokenTypes.EOF
      ]);
    });

    it('should tokenize parentheses', () => {
      const input = '( )';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.LPAREN,
        TokenTypes.RPAREN,
        TokenTypes.EOF
      ]);
    });
  });

  describe('Whitespace and Indentation', () => {
    it('should handle newlines', () => {
      const input = '\n\n\n';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.NEWLINE,
        TokenTypes.NEWLINE,
        TokenTypes.NEWLINE,
        TokenTypes.EOF
      ]);
    });

    it('should handle 4-space indentation', () => {
      const input = '    ';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.INDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle inconsistent indentation', () => {
      const input = '  \t';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.INDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle multiple levels of indentation', () => {
      const input = `decision "Test"
    when "Level 1" then
        when "Level 2" then
            when "Level 3" then
                do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should emit DEDENT tokens at EOF for open blocks', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action"
    when "Another Condition" then
        do "Another Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should throw an exception for non-4-space indentation', () => {
      const input = `decision "Test"
  when "Invalid Indent" then  // 2 spaces instead of 4
      do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });

    it('should throw an exception for mixed tabs and spaces', () => {
      const input = `decision "Test"
    when "Mixed Indent" then
    \tdo "Action"`;  // Mix of spaces and tab
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });

    it('should handle empty lines with indentation', () => {
      const input = `decision "Test"
    when "Condition" then
    
        do "Action"`;  // Empty line with indentation
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.NEWLINE,  // Empty line
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle complex nesting indentation patterns from example', () => {
      const input = `decision "Elderly Based"
    any
    when "Client Age Greater Than 60" then
        do "Indicate"
    when "Client Age Less Than 60" then
        do "Vaccinate"
        do "another thing"
        do "somthing else"
    when "Client Age Greater Than 60" then
        use "Elderly Based"
        use "IMMZ.D2.D5.Measles"`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ANY, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT
      ]);
    });

    it('should handle indentation in composite expressions', () => {
      const input = `casefeature "Complex Expression"
    expression (NOT "Condition 1" AND 
               "Condition 2") OR 
               (NOT "Condition 3" AND 
                "Condition 4")`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.EXPRESSION, TokenTypes.LPAREN,
        TokenTypes.NOT, TokenTypes.STRING,
        TokenTypes.AND, TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.OR, TokenTypes.LPAREN,
        TokenTypes.NOT, TokenTypes.STRING,
        TokenTypes.AND, TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.DEDENT
      ]);
    });

    it('should handle indentation in deeply nested when clauses', () => {
      const input = `decision "Deeply Nested"
    when "Level 1" then
        all
        when "Level 2" then
            any
            when "Level 3" then
                do "Action 1"
                do "Action 2"
            when "Level 3b" then
                use "Action 3"
        when "Level 2b" then
            do "Action 4"`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ALL, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ANY, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT
      ]);
    });
  });

  describe('Comments', () => {
    it('should skip single-line comments', () => {
      const input = '// This is a comment\n';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.NEWLINE,
        TokenTypes.EOF
      ]);
    });

    it('should skip block comments', () => {
      const input = '/* This is a\nblock comment */\n';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.NEWLINE,
        TokenTypes.EOF
      ]);
    });

    it('should handle comments on indented lines', () => {
      const input = `decision "Test"
    // Comment on indented line
    when "Condition" then
        // Another indented comment
        do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle comments between tokens', () => {
      const input = `decision /* block comment */ "Test" // line comment
    when "Condition" /* another comment */ then
        do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle whitespace between tokens', () => {
      const input = `decision    "Test"    \n    when    "Condition"    then\n        do    "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle trailing whitespace', () => {
      const input = `decision "Test"    \n    when "Condition" then    \n        do "Action"    `;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle block comments spanning multiple lines', () => {
      const input = `decision "Test"
    /* This is a
       multi-line
       comment */
    when "Condition" then
        do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });
  });

  describe('FHIR Types', () => {
    it('should tokenize action FHIR types', () => {
      const input = 'fhirtype Action';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.FHIRTYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.EOF
      ]);
    });

    it('should tokenize casefeature FHIR types', () => {
      const input = 'fhirtype CaseFeature';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.FHIRTYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
        TokenTypes.EOF
      ]);
    });

    it('should tokenize FHIR value types', () => {
      const input = 'valuetype string';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.VALUETYPE,
        TokenTypes.FHIR_VALUE_TYPE,
        TokenTypes.EOF
      ]);
    });

    it('should handle all valid FHIR types from the grammar', () => {
      const inputs = [
        `action "Test"
    fhirtype Action`,
        `casefeature "Test"
    fhirtype CaseFeature`,
        `casefeature "Test"
    valuetype string`,
        `casefeature "Test"
    valuetype boolean`,
        `casefeature "Test"
    valuetype integer`,
        `casefeature "Test"
    valuetype decimal`,
        `casefeature "Test"
    valuetype date`,
        `casefeature "Test"
    valuetype dateTime`,
        `casefeature "Test"
    valuetype time`,
        `casefeature "Test"
    valuetype code`,
        `casefeature "Test"
    valuetype Coding`,
        `casefeature "Test"
    valuetype CodeableConcept`,
        `casefeature "Test"
    valuetype Quantity`,
        `casefeature "Test"
    valuetype Ratio`,
        `casefeature "Test"
    valuetype Period`,
        `casefeature "Test"
    valuetype Range`,
        `casefeature "Test"
    valuetype Reference`
      ];

      inputs.forEach(input => {
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        expect(() => {
          verifyTokenSequence(tokens, [
            input.includes('action') ? TokenTypes.ACTION : TokenTypes.CASEFEATURE,
            TokenTypes.STRING,
            TokenTypes.NEWLINE,
            TokenTypes.INDENT,
            input.includes('fhirtype') ? TokenTypes.FHIRTYPE : TokenTypes.VALUETYPE,
            getFhirTypeToken(input),
            TokenTypes.DEDENT,
            TokenTypes.EOF
          ]);
        }).not.toThrow();
      });
    });

    it('should handle FHIR types in different contexts', () => {
      const inputs = [
        `decision "Test"
    when "Condition" then
        action "Test Action"
            fhirtype Action`,
        `decision "Test"
    when "Condition" then
        casefeature "Test Feature"
            fhirtype CaseFeature
            valuetype string`,
        `decision "Test"
    when "Condition" then
        casefeature "Test Feature"
            fhirtype CaseFeature
            valuetype boolean
        when "Another Condition" then
            casefeature "Another Feature"
                fhirtype CaseFeature
                valuetype integer`
      ];

      inputs.forEach(input => {
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        expect(() => {
          verifyTokenSequence(tokens, [
            TokenTypes.DECISION,
            TokenTypes.STRING,
            TokenTypes.NEWLINE,
            TokenTypes.INDENT,
            TokenTypes.WHEN,
            TokenTypes.STRING,
            TokenTypes.THEN,
            TokenTypes.NEWLINE,
            TokenTypes.INDENT,
            input.includes('action') ? TokenTypes.ACTION : TokenTypes.CASEFEATURE,
            TokenTypes.STRING,
            TokenTypes.NEWLINE,
            TokenTypes.INDENT,
            TokenTypes.FHIRTYPE,
            input.includes('Action') ? TokenTypes.ACTION_FHIR_TYPE : TokenTypes.CASEFEATURE_FHIR_TYPE,
            ...(input.includes('valuetype') ? [
              TokenTypes.NEWLINE,
              TokenTypes.VALUETYPE,
              TokenTypes.FHIR_VALUE_TYPE
            ] : []),
            TokenTypes.DEDENT,
            ...(input.includes('Another Condition') ? [
              TokenTypes.DEDENT,
              TokenTypes.WHEN,
              TokenTypes.STRING,
              TokenTypes.THEN,
              TokenTypes.NEWLINE,
              TokenTypes.INDENT,
              TokenTypes.CASEFEATURE,
              TokenTypes.STRING,
              TokenTypes.NEWLINE,
              TokenTypes.INDENT,
              TokenTypes.FHIRTYPE,
              TokenTypes.CASEFEATURE_FHIR_TYPE,
              TokenTypes.NEWLINE,
              TokenTypes.VALUETYPE,
              TokenTypes.FHIR_VALUE_TYPE,
              TokenTypes.DEDENT
            ] : []),
            TokenTypes.DEDENT,
            TokenTypes.DEDENT,
            TokenTypes.EOF
          ]);
        }).not.toThrow();
      });
    });

    it('should throw an exception for invalid FHIR types', () => {
      const inputs = [
        `action "Test"
    fhirtype NotAType`,  // Invalid action type
        `casefeature "Test"
    fhirtype InvalidType`,  // Invalid casefeature type
        `casefeature "Test"
    valuetype not_a_type`,  // Invalid value type
        `action "Test"
    fhirtype Action fhirtype Action`,  // Duplicate type declaration
        `casefeature "Test"
    fhirtype CaseFeature valuetype string`,  // Multiple type declarations
        `casefeature "Test"
    valuetype string valuetype boolean`,  // Multiple value types
        `action "Test"
    valuetype string`,  // Value type in action
        `casefeature "Test"
    fhirtype Action`  // Action type in casefeature
      ];

      inputs.forEach(input => {
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        expect(() => {
          getAllTokens(lexer);
        }).toThrow();
      });
    });
  });

  describe('Complex Structures', () => {
    it('should tokenize decision blocks', () => {
      const input = `decision "Test Decision"
    when "Condition" then
        do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should tokenize casefeatures with complex expressions', () => {
      const input = `casefeature "Test CaseFeature"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression ("Test Expression" OR (NOT ("Subexpression 1" AND "Subexpression 2")))`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.CASEFEATURE,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.CASEFEATURECODE,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.PROFILEURL,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.VALUETYPE,
        TokenTypes.FHIR_VALUE_TYPE,
        TokenTypes.NEWLINE,
        TokenTypes.EXPRESSION,
        TokenTypes.LPAREN,
        TokenTypes.STRING,
        TokenTypes.OR,
        TokenTypes.LPAREN,
        TokenTypes.NOT,
        TokenTypes.LPAREN,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.RPAREN,
        TokenTypes.RPAREN,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should tokenize nested when clauses with different qualifiers', () => {
      const input = `decision "Test Decision"
    when "Condition 1" then
        all
        when "Subcondition 1" then
            do "Action 1"
        when "Subcondition 2" then
            any
            when "Subsubcondition 1" then
                do "Action 2"
            when "Subsubcondition 2" then
                use "Another Decision"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ALL,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ANY,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.USE,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle nested blocks with qualifiers', () => {
      const input = `decision "Test"
    when "Condition" then
        all
        when "Subcondition 1" then
            do "Action 1"
        when "Subcondition 2" then
            do "Action 2"
    when "Another Condition" then
        any
        when "Subcondition 3" then
            do "Action 3"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ALL,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ANY,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle multiple terminal actions in a block', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action 1"
        do "Action 2"
        use "Action 3"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.USE,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle complex boolean expressions with parentheses', () => {
      const input = `casefeature "Test"
    expression (("Condition 1" AND "Condition 2") OR (NOT "Condition 3" AND ("Condition 4" OR "Condition 5")))`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.CASEFEATURE,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.EXPRESSION,
        TokenTypes.LPAREN,
        TokenTypes.LPAREN,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.OR,
        TokenTypes.LPAREN,
        TokenTypes.NOT,
        TokenTypes.LPAREN,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.LPAREN,
        TokenTypes.STRING,
        TokenTypes.OR,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.RPAREN,
        TokenTypes.RPAREN,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle multiple levels of nesting with mixed structures', () => {
      const input = `decision "Test"
    when "Level 1" then
        all
        when "Level 2" then
            any
            when "Level 3" then
                do "Action 1"
                do "Action 2"
            when "Level 3b" then
                use "Action 3"
        when "Level 2b" then
            do "Action 4"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ALL,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ANY,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.USE,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should throw an exception for invalid tokens', () => {
      const input = '@invalid $tokens';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });

    it('should throw an exception for unterminated strings', () => {
      const input = '"unterminated string';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });

    it('should throw an exception for invalid indentation patterns', () => {
      const inputs = [
        `decision "Test"
  when "Invalid Indent" then  // 2 spaces
      do "Action"`,
        `decision "Test"
    when "Mixed Indent" then
    \tdo "Action"`,  // Mix of spaces and tab
        `decision "Test"
    when "Inconsistent Indent" then
            do "Action"`  // 8 spaces instead of 4
      ];

      inputs.forEach(input => {
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        expect(() => {
          getAllTokens(lexer);
        }).toThrow();
      });
    });

    it('should throw an exception for missing newlines', () => {
      const inputs = [
        `decision "Test" when "No Newline" then do "Action"`,  // No newlines
        `decision "Test"
    when "Missing Newline" then do "Action"`,  // Missing newline after then
        `decision "Test"
    when "Condition" then
        do "Action" when "Another" then`  // Missing newline between blocks
      ];

      inputs.forEach(input => {
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        expect(() => {
          getAllTokens(lexer);
        }).toThrow();
      });
    });

    it('should throw an exception for invalid boolean expressions', () => {
      const inputs = [
        `casefeature "Test"
    expression "Condition" AND`,  // Missing right operand
        `casefeature "Test"
    expression AND "Condition"`,  // Missing left operand
        `casefeature "Test"
    expression ("Condition" AND "Condition 2"`,  // Unmatched parentheses
        `casefeature "Test"
    expression NOT AND "Condition"`,  // Invalid operator sequence
        `casefeature "Test"
    expression "Condition" OR OR "Condition 2"`  // Duplicate operators
      ];

      inputs.forEach(input => {
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        expect(() => {
          getAllTokens(lexer);
        }).toThrow();
      });
    });
  });

  describe('Token Emission Order', () => {
    it('should emit INDENT before first token of indented block', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      // Verify INDENT appears before 'when' token
      const whenIndex = tokens.findIndex(t => t.type === TokenTypes.WHEN);
      const indentIndex = tokens.findIndex(t => t.type === TokenTypes.INDENT);
      expect(indentIndex).toBeLessThan(whenIndex);
    });

    it('should emit DEDENT after last token of block', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action"
    when "Another Condition" then
        do "Another Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      // Verify DEDENT appears after 'Action' string
      const actionIndex = tokens.findIndex(t => t.type === TokenTypes.STRING && t.text === '"Action"');
      const dedentIndex = tokens.findIndex(t => t.type === TokenTypes.DEDENT);
      expect(dedentIndex).toBeGreaterThan(actionIndex);
    });

    it('should emit multiple INDENT/DEDENT tokens in sequence for nested blocks', () => {
      const input = `decision "Test"
    when "Level 1" then
        when "Level 2" then
            do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      // Get all INDENT and DEDENT tokens
      const indentTokens = tokens.filter(t => t.type === TokenTypes.INDENT);
      const dedentTokens = tokens.filter(t => t.type === TokenTypes.DEDENT);
      
      // Verify we have the correct number of each
      expect(indentTokens.length).toBe(3); // One for each level
      expect(dedentTokens.length).toBe(3); // One for each level
      
      // Verify they appear in the correct order
      const lastIndentIndex = tokens.lastIndexOf(indentTokens[indentTokens.length - 1]);
      const firstDedentIndex = tokens.indexOf(dedentTokens[0]);
      expect(firstDedentIndex).toBeGreaterThan(lastIndentIndex);
    });

    it('should emit NEWLINE before INDENT/DEDENT at block boundaries', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action"
    when "Another Condition" then
        do "Another Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      // For each INDENT/DEDENT, verify there's a NEWLINE before it
      tokens.forEach((token, index) => {
        if (token.type === TokenTypes.INDENT || token.type === TokenTypes.DEDENT) {
          expect(tokens[index - 1].type).toBe(TokenTypes.NEWLINE);
        }
      });
    });

    it('should handle token sequences in complex decision structures from example', () => {
      const input = `decision "Elderly Based"
    any
    when "Client Age Greater Than 60" then
        do "Indicate"
    when "Client Age Less Than 60" then
        do "Vaccinate"
        do "another thing"
        do "somthing else"
    when "Client Age Greater Than 60" then
        use "Elderly Based"
        use "IMMZ.D2.D5.Measles"`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ANY, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT
      ]);
    });

    it('should handle token sequences in complex composite expressions', () => {
      const input = `casefeature "Complex Expression"
    expression (NOT "Condition 1" AND 
               "Condition 2") OR 
               (NOT "Condition 3" AND 
                "Condition 4")`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.EXPRESSION, TokenTypes.LPAREN,
        TokenTypes.NOT, TokenTypes.STRING,
        TokenTypes.AND, TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.OR, TokenTypes.LPAREN,
        TokenTypes.NOT, TokenTypes.STRING,
        TokenTypes.AND, TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.DEDENT
      ]);
    });

    it('should handle token sequences in deeply nested blocks', () => {
      const input = `decision "Deeply Nested"
    when "Level 1" then
        all
        when "Level 2" then
            any
            when "Level 3" then
                do "Action 1"
                do "Action 2"
            when "Level 3b" then
                use "Action 3"
        when "Level 2b" then
            do "Action 4"`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ALL, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.ANY, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT
      ]);
    });
  });

  describe('Decision Structure', () => {
    // eslint-disable-next-line typescript:S2004
    // @ts-ignore: Deep nesting is intentional for test organization
    describe('Multiple When Clauses at Same Level', () => {
      it('should handle decision with multiple when clauses at same level', () => {
        const input = `decision "Elderly Based"
    any
    when "Client Age Greater Than 60" then
        do "Indicate"
    when "Client Age Less Than 60" then
        do "Vaccinate"
        do "another thing"
        do "somthing else"
    when "Client Age Greater Than 60" then
        use "Elderly Based"
        use "IMMZ.D2.D5.Measles"`;

        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);

        verifyTokenSequence(tokens, [
          TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.ANY, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.DEDENT,
          TokenTypes.DEDENT
        ]);
      });

      it('should handle decision with multiple when clauses and different terminal actions', () => {
        const input = `decision "Test Decision"
    when "Condition 1" then
        do "Action 1"
    when "Condition 2" then
        use "Another Decision"
    when "Condition 3" then
        do "Action 2"
        do "Action 3"`;

        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);

        verifyTokenSequence(tokens, [
          TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.DEDENT
        ]);
      });

      it('should handle decision with multiple when clauses and empty lines', () => {
        const input = `decision "Test Decision"
    when "Condition 1" then
        do "Action 1"

    when "Condition 2" then
        use "Another Decision"

    when "Condition 3" then
        do "Action 2"`;

        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);

        verifyTokenSequence(tokens, [
          TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.NEWLINE,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.NEWLINE,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.DEDENT
        ]);
      });
    });
  });

  describe('Action Structure', () => {
    // eslint-disable-next-line typescript:S2004
    // @ts-ignore: Deep nesting is intentional for test organization
    describe('Multiple Actions in Sequence', () => {
        it('should handle multiple do actions in sequence', () => {
            const input = `action "Multiple Do Actions"
    fhirtype Action
    do "Action 1"
    do "Action 2"
    do "Action 3"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.ACTION, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.FHIRTYPE, TokenTypes.ACTION_FHIR_TYPE, TokenTypes.NEWLINE,
                TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.DEDENT
            ]);
        });

        it('should handle multiple use actions in sequence', () => {
            const input = `action "Multiple Use Actions"
    fhirtype Action
    use "Decision 1"
    use "Decision 2"
    use "Decision 3"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.ACTION, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.FHIRTYPE, TokenTypes.ACTION_FHIR_TYPE, TokenTypes.NEWLINE,
                TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.DEDENT
            ]);
        });

        it('should handle mixed do and use actions in sequence', () => {
            const input = `action "Mixed Actions"
    fhirtype Action
    do "Action 1"
    use "Decision 1"
    do "Action 2"
    use "Decision 2"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.ACTION, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.FHIRTYPE, TokenTypes.ACTION_FHIR_TYPE, TokenTypes.NEWLINE,
                TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.USE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.DEDENT
            ]);
        });
    });

    // eslint-disable-next-line typescript:S2004
    // @ts-ignore: Deep nesting is intentional for test organization
    describe('Actions with Different FHIR Types', () => {
        it('should handle action with CaseFeature FHIR type', () => {
            const input = `action "CaseFeature Action"
    fhirtype CaseFeature
    do "Action 1"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.ACTION, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.FHIRTYPE, TokenTypes.CASEFEATURE_FHIR_TYPE, TokenTypes.NEWLINE,
                TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.DEDENT
            ]);
        });

        it('should handle action with Action FHIR type', () => {
            const input = `action "Standard Action"
    fhirtype Action
    do "Action 1"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.ACTION, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.FHIRTYPE, TokenTypes.ACTION_FHIR_TYPE, TokenTypes.NEWLINE,
                TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.DEDENT
            ]);
        });

        it('should handle action with value type', () => {
            const input = `action "Value Type Action"
    valuetype string
    do "Action 1"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.ACTION, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.VALUETYPE, TokenTypes.FHIR_VALUE_TYPE, TokenTypes.NEWLINE,
                TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.DEDENT
            ]);
        });
    });
  });

  describe('CaseFeature Structure', () => {
    // eslint-disable-next-line typescript:S2004
    // @ts-ignore: Deep nesting is intentional for test organization
    describe('Complex Composite Expressions', () => {
        it('should handle nested parentheses in expressions', () => {
            const input = `casefeature "Complex Expression"
    expression (("Condition 1" AND "Condition 2") OR (NOT ("Condition 3" AND ("Condition 4" OR "Condition 5"))))`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.EXPRESSION, TokenTypes.LPAREN,
                TokenTypes.LPAREN, TokenTypes.STRING, TokenTypes.AND, TokenTypes.STRING, TokenTypes.RPAREN,
                TokenTypes.OR,
                TokenTypes.LPAREN, TokenTypes.NOT, TokenTypes.LPAREN,
                TokenTypes.STRING, TokenTypes.AND,
                TokenTypes.LPAREN, TokenTypes.STRING, TokenTypes.OR, TokenTypes.STRING, TokenTypes.RPAREN,
                TokenTypes.RPAREN, TokenTypes.RPAREN,
                TokenTypes.RPAREN,
                TokenTypes.DEDENT
            ]);
        });

        it('should handle multiple levels of NOT operations', () => {
            const input = `casefeature "Multiple NOTs"
    expression NOT (NOT (NOT "Condition"))`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.EXPRESSION, TokenTypes.NOT, TokenTypes.LPAREN,
                TokenTypes.NOT, TokenTypes.LPAREN,
                TokenTypes.NOT, TokenTypes.STRING,
                TokenTypes.RPAREN, TokenTypes.RPAREN,
                TokenTypes.DEDENT, TokenTypes.EOF
            ]);
        });

        it('should handle complex AND/OR combinations', () => {
            const input = `casefeature "Complex AND/OR"
    expression ("Condition 1" AND "Condition 2" AND "Condition 3") OR 
               ("Condition 4" OR "Condition 5" OR "Condition 6") AND 
               (NOT "Condition 7" OR NOT "Condition 8")`;
            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);
            
            verifyTokenSequence(tokens, [
                TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.EXPRESSION, TokenTypes.LPAREN,
                TokenTypes.STRING, TokenTypes.AND, TokenTypes.STRING, TokenTypes.AND, TokenTypes.STRING,
                TokenTypes.RPAREN,
                TokenTypes.OR,
                TokenTypes.LPAREN,
                TokenTypes.STRING, TokenTypes.OR, TokenTypes.STRING, TokenTypes.OR, TokenTypes.STRING,
                TokenTypes.RPAREN,
                TokenTypes.AND,
                TokenTypes.LPAREN,
                TokenTypes.NOT, TokenTypes.STRING, TokenTypes.OR, TokenTypes.NOT, TokenTypes.STRING,
                TokenTypes.RPAREN,
                TokenTypes.DEDENT, TokenTypes.EOF
            ]);
        });

        it('should handle complex expression with multiple casefeature references', () => {
            const input = `casefeature "Multiple References"
    expression ("Feature 1" AND "Feature 2") OR (NOT "Feature 3" AND "Feature 4") OR "Feature 5"`;
            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);
            
            verifyTokenSequence(tokens, [
                TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.EXPRESSION, TokenTypes.LPAREN,
                TokenTypes.STRING, TokenTypes.AND, TokenTypes.STRING,
                TokenTypes.RPAREN,
                TokenTypes.OR, TokenTypes.LPAREN,
                TokenTypes.NOT, TokenTypes.STRING, TokenTypes.AND, TokenTypes.STRING,
                TokenTypes.RPAREN,
                TokenTypes.OR, TokenTypes.STRING,
                TokenTypes.DEDENT, TokenTypes.EOF
            ]);
        });
    });

    // eslint-disable-next-line typescript:S2004
    // @ts-ignore: Deep nesting is intentional for test organization
    describe('Different FHIR Types', () => {
        it('should handle CaseFeature with Condition FHIR type', () => {
            const input = `casefeature "Condition Feature"
    fhirtype Condition
    expression "Condition Expression"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.FHIRTYPE, TokenTypes.CONDITION_FHIR_TYPE, TokenTypes.NEWLINE,
                TokenTypes.EXPRESSION, TokenTypes.STRING,
                TokenTypes.DEDENT
            ]);
        });

        it('should handle CaseFeature with Observation FHIR type', () => {
            const input = `casefeature "Observation Feature"
    fhirtype Observation
    expression "Observation Expression"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.FHIRTYPE, TokenTypes.OBSERVATION_FHIR_TYPE, TokenTypes.NEWLINE,
                TokenTypes.EXPRESSION, TokenTypes.STRING,
                TokenTypes.DEDENT
            ]);
        });

        it('should handle CaseFeature with ServiceRequest FHIR type', () => {
            const input = `casefeature "ServiceRequest Feature"
    fhirtype ServiceRequest
    expression "ServiceRequest Expression"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.FHIRTYPE, TokenTypes.SERVICE_REQUEST_FHIR_TYPE, TokenTypes.NEWLINE,
                TokenTypes.EXPRESSION, TokenTypes.STRING,
                TokenTypes.DEDENT
            ]);
        });

        it('should handle CaseFeature with MedicationRequest FHIR type', () => {
            const input = `casefeature "MedicationRequest Feature"
    fhirtype MedicationRequest
    expression "MedicationRequest Expression"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.FHIRTYPE, TokenTypes.MEDICATION_REQUEST_FHIR_TYPE, TokenTypes.NEWLINE,
                TokenTypes.EXPRESSION, TokenTypes.STRING,
                TokenTypes.DEDENT
            ]);
        });
    });

    // eslint-disable-next-line typescript:S2004
    // @ts-ignore: Deep nesting is intentional for test organization
    describe('Different Value Types', () => {
        it('should handle CaseFeature with boolean value type', () => {
            const input = `casefeature "Boolean Feature"
    valuetype boolean
    expression "Boolean Expression"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.VALUETYPE, TokenTypes.BOOLEAN_VALUE_TYPE, TokenTypes.NEWLINE,
                TokenTypes.EXPRESSION, TokenTypes.STRING,
                TokenTypes.DEDENT
            ]);
        });

        it('should handle CaseFeature with dateTime value type', () => {
            const input = `casefeature "DateTime Feature"
    valuetype dateTime
    expression "DateTime Expression"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.VALUETYPE, TokenTypes.DATETIME_VALUE_TYPE, TokenTypes.NEWLINE,
                TokenTypes.EXPRESSION, TokenTypes.STRING,
                TokenTypes.DEDENT
            ]);
        });

        it('should handle CaseFeature with quantity value type', () => {
            const input = `casefeature "Quantity Feature"
    valuetype quantity
    expression "Quantity Expression"`;

            const lexer = new CPGLLexer(CharStreams.fromString(input));
            const tokens = getAllTokens(lexer);

            verifyTokenSequence(tokens, [
                TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
                TokenTypes.INDENT,
                TokenTypes.VALUETYPE, TokenTypes.QUANTITY_VALUE_TYPE, TokenTypes.NEWLINE,
                TokenTypes.EXPRESSION, TokenTypes.STRING,
                TokenTypes.DEDENT
            ]);
        });
    });

    // eslint-disable-next-line typescript:S2004
    // @ts-ignore: Deep nesting is intentional for test organization
    describe('Complex Boolean Expressions', () => {
      it('should handle complex expression from example file', () => {
        const input = `casefeature "Complex Expression"
    expression (NOT "Condition 1" AND "Condition 2") OR (NOT "Condition 3" AND "Condition 4")`;
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        
        verifyTokenSequence(tokens, [
          TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.EXPRESSION, TokenTypes.LPAREN,
          TokenTypes.NOT, TokenTypes.STRING,
          TokenTypes.AND, TokenTypes.STRING,
          TokenTypes.RPAREN,
          TokenTypes.OR, TokenTypes.LPAREN,
          TokenTypes.NOT, TokenTypes.STRING,
          TokenTypes.AND, TokenTypes.STRING,
          TokenTypes.RPAREN,
          TokenTypes.DEDENT, TokenTypes.EOF
        ]);
      });

      it('should handle deeply nested expressions', () => {
        const input = `casefeature "Deeply Nested"
    expression (("Condition 1" AND ("Condition 2" OR "Condition 3")) AND (NOT ("Condition 4" AND "Condition 5")))`;
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        
        verifyTokenSequence(tokens, [
          TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.EXPRESSION, TokenTypes.LPAREN, TokenTypes.LPAREN,
          TokenTypes.STRING, TokenTypes.AND, TokenTypes.LPAREN,
          TokenTypes.STRING, TokenTypes.OR, TokenTypes.STRING,
          TokenTypes.RPAREN, TokenTypes.RPAREN,
          TokenTypes.AND, TokenTypes.LPAREN,
          TokenTypes.NOT, TokenTypes.LPAREN,
          TokenTypes.STRING, TokenTypes.AND, TokenTypes.STRING,
          TokenTypes.RPAREN, TokenTypes.RPAREN,
          TokenTypes.RPAREN,
          TokenTypes.DEDENT, TokenTypes.EOF
        ]);
      });

      it('should handle multiple levels of NOT operations', () => {
        const input = `casefeature "Multiple NOTs"
    expression NOT (NOT (NOT "Condition"))`;
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        
        verifyTokenSequence(tokens, [
          TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.EXPRESSION, TokenTypes.NOT, TokenTypes.LPAREN,
          TokenTypes.NOT, TokenTypes.LPAREN,
          TokenTypes.NOT, TokenTypes.STRING,
          TokenTypes.RPAREN, TokenTypes.RPAREN,
          TokenTypes.DEDENT, TokenTypes.EOF
        ]);
      });

      it('should handle complex AND/OR combinations', () => {
        const input = `casefeature "Complex AND/OR"
    expression ("Condition 1" AND "Condition 2" AND "Condition 3") OR 
               ("Condition 4" OR "Condition 5" OR "Condition 6") AND 
               (NOT "Condition 7" OR NOT "Condition 8")`;
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        
        verifyTokenSequence(tokens, [
          TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.EXPRESSION, TokenTypes.LPAREN,
          TokenTypes.STRING, TokenTypes.AND, TokenTypes.STRING, TokenTypes.AND, TokenTypes.STRING,
          TokenTypes.RPAREN,
          TokenTypes.OR,
          TokenTypes.LPAREN,
          TokenTypes.STRING, TokenTypes.OR, TokenTypes.STRING, TokenTypes.OR, TokenTypes.STRING,
          TokenTypes.RPAREN,
          TokenTypes.AND,
          TokenTypes.LPAREN,
          TokenTypes.NOT, TokenTypes.STRING, TokenTypes.OR, TokenTypes.NOT, TokenTypes.STRING,
          TokenTypes.RPAREN,
          TokenTypes.DEDENT, TokenTypes.EOF
        ]);
      });

      it('should handle complex expression with multiple casefeature references', () => {
        const input = `casefeature "Multiple References"
    expression ("Feature 1" AND "Feature 2") OR (NOT "Feature 3" AND "Feature 4") OR "Feature 5"`;
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        
        verifyTokenSequence(tokens, [
          TokenTypes.CASEFEATURE, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.EXPRESSION, TokenTypes.LPAREN,
          TokenTypes.STRING, TokenTypes.AND, TokenTypes.STRING,
          TokenTypes.RPAREN,
          TokenTypes.OR, TokenTypes.LPAREN,
          TokenTypes.NOT, TokenTypes.STRING, TokenTypes.AND, TokenTypes.STRING,
          TokenTypes.RPAREN,
          TokenTypes.OR, TokenTypes.STRING,
          TokenTypes.DEDENT, TokenTypes.EOF
        ]);
      });
    });
  });
});

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