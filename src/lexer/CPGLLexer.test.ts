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
  console.log('Got tokens:', tokens.map(t => ({ type: t.type, text: t.text })));
  console.log('Expected types:', expectedTypes);
  expect(tokens.length).toBe(expectedTypes.length);
  tokens.forEach((token, index) => {
    expect(token.type).toBe(expectedTypes[index]);
    if (expectedTexts?.[index]) {
      expect(token.text).toBe(expectedTexts[index]);
    }
  });
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
      
      expect(() => {
        getAllTokens(lexer);
      }).toThrow('Mixed tabs and spaces are not allowed for indentation');
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
      
      expect(() => { //NOSONAR
        getAllTokens(lexer);
      }).toThrow();
    });

    it('should throw an exception for mixed tabs and spaces', () => {
      const input = `decision "Test"
    when "Mixed Indent" then
    \tdo "Action"`;  // Mix of spaces and tab
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => { //NOSONAR
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

    it('should handle mixed comments and code', () => {
      const input = 'decision "test"\n    // Comment before when\n    when "condition" then\n        // Comment before action\n        do "action"\n';
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
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle block comments', () => {
      const input = 'decision "test"\n    /* Comment before when\n       spanning multiple lines */\n    when "condition" then\n        /* Comment before action */\n        do "action"\n';
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
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle mixed comments and indentation', () => {
      const input = 'decision "test"\n    // Comment before when\n    when "condition" then\n        // Comment before action\n        do "action"\n';
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
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle mixed comments and complex structure', () => {
      const input = 'decision "test"\n    // First when clause\n    when "true" then\n        // Nested when\n        when "false" then\n            // Terminal action\n            do "action1"\n        // Another action\n        do "action2"\n    // Second when clause\n    when not "true" then\n        // Fourth action\n        do "action3"\n';
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
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.WHEN,
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });
  });

  describe('FHIR Types', () => {
    describe('Action FHIR Types', () => {
      it('should recognize all action FHIR types', () => {
        const input = 'Appointment AppointmentResponse CarePlan Claim CommunicationRequest Contract DeviceRequest EnrollmentRequest ImmunizationRecommendation MedicationRequest NutritionOrder ServiceRequest SupplyRequest Task VisionPrescription';
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        
        verifyTokenSequence(tokens, [
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.EOF
        ]);
      });

      it('should handle action FHIR type in context', () => {
        const input = `action "Test Action"
    fhirtype Appointment`;
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        
        verifyTokenSequence(tokens, [
          TokenTypes.ACTION,
          TokenTypes.STRING,
          TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.FHIRTYPE,
          TokenTypes.ACTION_FHIR_TYPE,
          TokenTypes.DEDENT,
          TokenTypes.EOF
        ]);
      });

      it('should throw an exception for invalid action FHIR type', () => {
        const input = `action "Test Action"
    fhirtype Condition`;  // Condition is a casefeature type, not an action type
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        
        expect(() => { //NOSONAR
          getAllTokens(lexer);
        }).toThrow();
      });
    });

    describe('CaseFeature FHIR Types', () => {
      it('should recognize all casefeature FHIR types', () => {
        const input = 'AllergyIntolerance Condition Procedure Observation Immunization MedicationDispense MedicationAdministration MedicationStatement';
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        
        verifyTokenSequence(tokens, [
          TokenTypes.CASEFEATURE_FHIR_TYPE,
          TokenTypes.CASEFEATURE_FHIR_TYPE,
          TokenTypes.CASEFEATURE_FHIR_TYPE,
          TokenTypes.CASEFEATURE_FHIR_TYPE,
          TokenTypes.CASEFEATURE_FHIR_TYPE,
          TokenTypes.CASEFEATURE_FHIR_TYPE,
          TokenTypes.CASEFEATURE_FHIR_TYPE,
          TokenTypes.CASEFEATURE_FHIR_TYPE,
          TokenTypes.EOF
        ]);
      });

      it('should handle casefeature FHIR type in context', () => {
        const input = `casefeature "Test CaseFeature"
    fhirtype Condition`;
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        
        verifyTokenSequence(tokens, [
          TokenTypes.CASEFEATURE,
          TokenTypes.STRING,
          TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.FHIRTYPE,
          TokenTypes.CASEFEATURE_FHIR_TYPE,
          TokenTypes.DEDENT,
          TokenTypes.EOF
        ]);
      });

      it('should throw an exception for invalid casefeature FHIR type', () => {
        const input = `casefeature "Test CaseFeature"
    fhirtype Appointment`;  // Appointment is an action type, not a casefeature type
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        
        expect(() => { //NOSONAR
          getAllTokens(lexer); 
        }).toThrow();
      });
    });

    it('should throw an exception for completely invalid FHIR types', () => {
      const input = 'InvalidFHIRType';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
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
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle casefeature with boolean expression', () => {
      const input = `casefeature "test"
    casefeaturecode "code"
    fhirtype "type"
    profileurl "url"
    valuetype "value"
    expression ("condition1" OR "condition2")
`;

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
        TokenTypes.FHIRTYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
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
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle casefeature with nested boolean expression', () => {
      const input = `casefeature "test"
    casefeaturecode "code"
    fhirtype "type"
    profileurl "url"
    valuetype "value"
    expression (("condition1" AND "condition2") OR ("condition3" AND NOT "condition4"))
`;

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
        TokenTypes.FHIRTYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
        TokenTypes.NEWLINE,
        TokenTypes.PROFILEURL,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.VALUETYPE,
        TokenTypes.FHIR_VALUE_TYPE,
        TokenTypes.NEWLINE,
        TokenTypes.EXPRESSION,
        TokenTypes.LPAREN,
        TokenTypes.LPAREN,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.OR,
        TokenTypes.LPAREN,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.RPAREN,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle casefeature with quantity value type', () => {
      const input = `casefeature "Quantity Feature"
    casefeaturecode "code"
    fhirtype Observation
    profileurl "url"
    valuetype quantity
    expression ("Quantity > 100" AND "Quantity < 200")`;

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
        TokenTypes.FHIRTYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
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
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle CaseFeature with string value type', () => {
      const input = `casefeature "String Feature"
    casefeaturecode "code"
    fhirtype Observation
    profileurl "url"
    valuetype string
    expression ("Value = 'test'" OR "Value = 'example'")`;

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
        TokenTypes.FHIRTYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
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
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should throw an exception for invalid tokens', () => {
      const input = '@invalid $tokens';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => { //NOSONAR
        getAllTokens(lexer);
      }).toThrow();
    });

    it('should throw an exception for unterminated strings', () => {
      const input = '"unterminated string';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => { //NOSONAR
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
        expect(() => { //NOSONAR
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
        expect(() => { //NOSONAR
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
        expect(() => { //NOSONAR
          getAllTokens(lexer);
        }).toThrow();
      });
    });

    it('should throw error for invalid composite expressions', () => {
      const inputs = [
        `casefeature "Invalid Expression"
    expression (NOT "Condition 1" AND)`,  // Missing right operand
        `casefeature "Invalid Expression"
    expression (AND "Condition 1")`,  // Missing left operand
        `casefeature "Invalid Expression"
    expression ("Condition 1" OR OR "Condition 2")`,  // Duplicate operators
        `casefeature "Invalid Expression"
    expression (NOT NOT "Condition")`,  // Multiple NOTs without parentheses
        `casefeature "Invalid Expression"
    expression ("Condition 1" AND "Condition 2"`,  // Unmatched parentheses
        `casefeature "Invalid Expression"
    expression "Condition 1" AND "Condition 2")`  // Unmatched parentheses
      ];

      inputs.forEach(input => {
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        expect(() => { //NOSONAR
          getAllTokens(lexer);
        }).toThrow();
      });
    });

    it('should throw error for invalid FHIR type combinations', () => {
      const inputs = [
        `casefeature "Invalid FHIR Type"
    fhirtype Action`,  // Action type in casefeature
        `action "Invalid FHIR Type"
    fhirtype CaseFeature`,  // CaseFeature type in action
        `casefeature "Invalid FHIR Type"
    fhirtype Condition
    valuetype string`,  // Both FHIR type and value type
        `action "Invalid FHIR Type"
    valuetype string`,  // Value type in action
        `casefeature "Invalid FHIR Type"
    fhirtype NotAType`  // Invalid FHIR type
      ];

      inputs.forEach(input => {
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        expect(() => { //NOSONAR
          getAllTokens(lexer);
        }).toThrow();
      });
    });

    it('should throw error for invalid nesting patterns', () => {
      const inputs = [
        `decision "Invalid Nesting"
    when "Condition" then
        do "Action"
    when "Another Condition" then
            do "Action"`,  // Inconsistent indentation
        `decision "Invalid Nesting"
    when "Condition" then
        all
        when "Subcondition" then
            do "Action"
    when "Another Condition" then
        do "Action"`,  // Missing DEDENT
        `decision "Invalid Nesting"
    when "Condition" then
        all
            when "Subcondition" then
                do "Action"
        when "Another Condition" then
            do "Action"`,  // Incorrect nesting level
        `decision "Invalid Nesting"
    when "Condition" then
        all
        when "Subcondition" then
            do "Action"
        when "Another Condition" then
            do "Action"
    when "Another Condition" then
        do "Action"`  // Multiple when clauses at different levels
      ];

      inputs.forEach(input => {
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        expect(() => { //NOSONAR
          getAllTokens(lexer);
        }).toThrow();
      });
    });

    it('should throw error for invalid complex structures from example', () => {
      const inputs = [
        `decision "Elderly Based"
    any
    when "Client Age Greater Than 60" then
        do "Indicate"
    when "Client Age Less Than 60" then
        do "Vaccinate"
        do "another thing"
        do "somthing else"
    when "Client Age Greater Than 60" then
        use "Elderly Based"
        use "IMMZ.D2.D5.Measles"
    when "Invalid" then`,  // Missing action
        `decision "Elderly Based"
    any
    when "Client Age Greater Than 60" then
        do "Indicate"
    when "Client Age Less Than 60" then
        do "Vaccinate"
        do "another thing"
        do "somthing else"
    when "Client Age Greater Than 60" then
        use "Elderly Based"
        use "IMMZ.D2.D5.Measles"
        when "Invalid" then`,  // Invalid nesting
        `decision "Elderly Based"
    any
    when "Client Age Greater Than 60" then
        do "Indicate"
    when "Client Age Less Than 60" then
        do "Vaccinate"
        do "another thing"
        do "somthing else"
    when "Client Age Greater Than 60" then
        use "Elderly Based"
        use "IMMZ.D2.D5.Measles"
    do "Invalid"`  // Action outside when clause
      ];

      inputs.forEach(input => {
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        expect(() => { //NOSONAR
          getAllTokens(lexer);
        }).toThrow();
      });
    });
  });

  describe('Token Emission Order', () => {
    it('should emit NEWLINE followed by INDENT at block boundaries', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      // Verify NEWLINE followed by INDENT pattern
      const newlineIndex = tokens.findIndex(t => t.type === TokenTypes.NEWLINE);
      const indentIndex = tokens.findIndex(t => t.type === TokenTypes.INDENT);
      expect(indentIndex).toBe(newlineIndex + 1);
    });

    it('should emit DEDENT followed by next token', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action"
    when "Another Condition" then
        do "Another Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      // Find first DEDENT and verify next token is WHEN
      const firstDedentIndex = tokens.findIndex(t => t.type === TokenTypes.DEDENT);
      expect(tokens[firstDedentIndex + 1].type).toBe(TokenTypes.WHEN);
    });

    it('should emit multiple DEDENT tokens in sequence for nested blocks', () => {
      const input = `decision "Test"
    when "Level 1" then
        when "Level 2" then
            do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      // Get all DEDENT tokens
      const dedentTokens = tokens.filter(t => t.type === TokenTypes.DEDENT);
      expect(dedentTokens.length).toBe(3); // One for each level
      
      // Verify they appear in sequence
      const dedentIndices = tokens
        .map((t, i) => t.type === TokenTypes.DEDENT ? i : -1)
        .filter(i => i !== -1);
      const sortedIndices = [...dedentIndices].sort((a: number, b: number) => a - b);
      expect(dedentIndices).toEqual(sortedIndices);
    });

    it('should handle token order in basic blocks', () => {
      const input = `decision "Test"
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

    it('should handle token order in complex nested blocks', () => {
      const input = `decision "Test"
    when "Level 1" then
        all
        when "Level 2" then
            any
            when "Level 3" then
                do "Action 1"
                do "Action 2"
            when "Level 3b" then
                use "Action 3"`;
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
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle token order in casefeature expressions', () => {
      const input = `casefeature "Test"
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
        TokenTypes.DEDENT,
        TokenTypes.EOF
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
    it('should handle basic action with valid FHIR type', () => {
      const input = `action "Test Action"
    fhirtype MedicationRequest`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        TokenTypes.ACTION, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.FHIRTYPE, TokenTypes.ACTION_FHIR_TYPE, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle action with different valid FHIR type', () => {
      const input = `action "Another Action"
    fhirtype Appointment`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        TokenTypes.ACTION, TokenTypes.STRING, TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.FHIRTYPE, TokenTypes.ACTION_FHIR_TYPE, TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should throw an exception for action with invalid FHIR type', () => {
      const input = `action "Invalid Action"
    fhirtype Condition`;  // Condition is a casefeature type, not an action type

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });

    it('should throw an exception for action with do clause', () => {
      const input = `action "Invalid Action"
    fhirtype MedicationRequest
    do "Action"`;  // Actions cannot have do clauses

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });

    it('should throw an exception for action with use clause', () => {
      const input = `action "Invalid Action"
    fhirtype MedicationRequest
    use "Another Decision"`;  // Actions cannot have use clauses

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
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
                TokenTypes.FHIRTYPE, TokenTypes.CASEFEATURE_FHIR_TYPE, TokenTypes.NEWLINE,
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
                TokenTypes.FHIRTYPE, TokenTypes.CASEFEATURE_FHIR_TYPE, TokenTypes.NEWLINE,
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
                TokenTypes.FHIRTYPE, TokenTypes.ACTION_FHIR_TYPE, TokenTypes.NEWLINE,
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
                TokenTypes.FHIRTYPE, TokenTypes.ACTION_FHIR_TYPE, TokenTypes.NEWLINE,
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
    casefeaturecode "code"
    fhirtype Observation
    profileurl "url"
    valuetype boolean
    expression ("Value = true" OR "Value = false")`;

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
                TokenTypes.FHIRTYPE,
                TokenTypes.CASEFEATURE_FHIR_TYPE,
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
                TokenTypes.STRING,
                TokenTypes.RPAREN,
                TokenTypes.DEDENT,
                TokenTypes.EOF
            ]);
        });

        it('should handle CaseFeature with datetime value type', () => {
            const input = `casefeature "DateTime Feature"
    casefeaturecode "code"
    fhirtype Observation
    profileurl "url"
    valuetype dateTime
    expression ("Value > 2023-01-01T00:00:00Z" AND "Value < 2023-12-31T23:59:59Z")`;

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
                TokenTypes.FHIRTYPE,
                TokenTypes.CASEFEATURE_FHIR_TYPE,
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
                TokenTypes.AND,
                TokenTypes.STRING,
                TokenTypes.RPAREN,
                TokenTypes.DEDENT,
                TokenTypes.EOF
            ]);
        });

        it('should handle CaseFeature with quantity value type', () => {
            const input = `casefeature "Quantity Feature"
    casefeaturecode "code"
    fhirtype Observation
    profileurl "url"
    valuetype Quantity
    expression ("Quantity > 100" AND "Quantity < 200")`;

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
                TokenTypes.FHIRTYPE,
                TokenTypes.CASEFEATURE_FHIR_TYPE,
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
                TokenTypes.AND,
                TokenTypes.STRING,
                TokenTypes.RPAREN,
                TokenTypes.DEDENT,
                TokenTypes.EOF
            ]);
        });

        it('should handle CaseFeature with string value type', () => {
            const input = `casefeature "String Feature"
    casefeaturecode "code"
    fhirtype Observation
    profileurl "url"
    valuetype string
    expression ("Value = 'test'" OR "Value = 'example'")`;

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
                TokenTypes.FHIRTYPE,
                TokenTypes.CASEFEATURE_FHIR_TYPE,
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
                TokenTypes.STRING,
                TokenTypes.RPAREN,
                TokenTypes.DEDENT,
                TokenTypes.EOF
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

  describe('Whitespace and Comments', () => {
    describe('Comments', () => {
      it('should ignore single-line comments', () => {
        const input = `// This is a comment
decision "Test"
    // Another comment
    when "Condition" then
        // Comment before action
        do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.NEWLINE,
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

    it('should ignore block comments', () => {
      const input = `/* This is a block comment */
decision "Test"
    /* Another block comment
       spanning multiple lines */
    when "Condition" then
        /* Comment before action */
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
  });

  describe('Whitespace', () => {
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

    it('should handle empty lines with indentation', () => {
      const input = `decision "Test"
    
    when "Condition" then
        
        do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
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

  describe('Line Continuations', () => {
    it('should handle line continuations in expressions', () => {
      const input = `casefeature "Test"
    expression (NOT "Condition 1" AND 
               "Condition 2") OR 
               (NOT "Condition 3" AND 
                "Condition 4")`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.CASEFEATURE,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.EXPRESSION,
        TokenTypes.LPAREN,
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.OR,
        TokenTypes.LPAREN,
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle line continuations with comments', () => {
      const input = `casefeature "Test"
    expression (NOT "Condition 1" AND // Comment
               "Condition 2") OR /* Another comment */
               (NOT "Condition 3" AND 
                "Condition 4")`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.CASEFEATURE,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.EXPRESSION,
        TokenTypes.LPAREN,
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.OR,
        TokenTypes.LPAREN,
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should handle line continuations with mixed indentation', () => {
      const input = `casefeature "Test"
    expression (NOT "Condition 1" AND 
        "Condition 2") OR 
            (NOT "Condition 3" AND 
                "Condition 4")`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.CASEFEATURE,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.EXPRESSION,
        TokenTypes.LPAREN,
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.OR,
        TokenTypes.LPAREN,
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete example file token sequence', () => {
      const input = `decision "Elderly Based"
    when "Age" then
        all
        when "Age > 65" then
            do "Elderly Care Plan"
            do "Fall Risk Assessment"
        when "Age > 80" then
            use "Advanced Elderly Care Plan"
    when "Condition" then
        any
        when "Dementia" then
            do "Cognitive Assessment"
            do "Memory Care Plan"
        when "Mobility Issues" then
            use "Physical Therapy Plan"
    when "Medication" then
        all
        when "Multiple Medications" then
            do "Medication Review"
            do "Drug Interaction Check"
        when "High Risk Medications" then
            use "Specialized Medication Plan"`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      expect(() => { //NOSONAR
        verifyTokenSequence(tokens, [
          TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.ALL, TokenTypes.NEWLINE,
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
          TokenTypes.ALL, TokenTypes.NEWLINE,
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
          TokenTypes.DEDENT,
          TokenTypes.DEDENT
        ]);
      }).not.toThrow();
    });

    it('should handle major sections independently', () => {
      const sections = [
        {
          name: 'Age-based decisions',
          input: `when "Age" then
    all
    when "Age > 65" then
        do "Elderly Care Plan"
        do "Fall Risk Assessment"
    when "Age > 80" then
        use "Advanced Elderly Care Plan"`,
          expected: [
            TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
            TokenTypes.INDENT,
            TokenTypes.ALL, TokenTypes.NEWLINE,
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
            TokenTypes.DEDENT
          ]
        },
        {
          name: 'Condition-based decisions',
          input: `when "Condition" then
    any
    when "Dementia" then
        do "Cognitive Assessment"
        do "Memory Care Plan"
    when "Mobility Issues" then
        use "Physical Therapy Plan"`,
          expected: [
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
            TokenTypes.DEDENT
          ]
        },
        {
          name: 'Medication-based decisions',
          input: `when "Medication" then
    all
    when "Multiple Medications" then
        do "Medication Review"
        do "Drug Interaction Check"
    when "High Risk Medications" then
        use "Specialized Medication Plan"`,
          expected: [
            TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
            TokenTypes.INDENT,
            TokenTypes.ALL, TokenTypes.NEWLINE,
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
            TokenTypes.DEDENT
          ]
        }
      ];

      sections.forEach(section => { //NOSONAR
        const lexer = new CPGLLexer(CharStreams.fromString(section.input));
        const tokens = getAllTokens(lexer);
        expect(() => { //NOSONAR
          verifyTokenSequence(tokens, section.expected);
        }).not.toThrow();
      });
    });

    it('should verify relationships between different parts', () => {
      const input = `decision "Elderly Based"
    when "Age" then
        all
        when "Age > 65" then
            do "Elderly Care Plan"
            do "Fall Risk Assessment"
        when "Age > 80" then
            use "Advanced Elderly Care Plan"
    when "Condition" then
        any
        when "Dementia" then
            do "Cognitive Assessment"
            do "Memory Care Plan"
        when "Mobility Issues" then
            use "Physical Therapy Plan"`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      // Verify decision structure
      expect(tokens[0].type).toBe(TokenTypes.DECISION);
      expect(tokens[1].type).toBe(TokenTypes.STRING);

      // Verify when clauses
      const whenIndices = tokens
        .map((token, index) => token.type === TokenTypes.WHEN ? index : -1) //NOSONAR
        .filter(index => index !== -1); //NOSONAR
      expect(whenIndices.length).toBe(5);

      // Verify action types
      const actionIndices = tokens
        .map((token, index) => //NOSONAR
          (token.type === TokenTypes.DO || token.type === TokenTypes.USE) ? index : -1
        )
        .filter(index => index !== -1); //NOSONAR
      expect(actionIndices.length).toBe(6);

      // Verify indentation levels
      const indentCount = tokens.filter(token => token.type === TokenTypes.INDENT).length; //NOSONAR
      const dedentCount = tokens.filter(token => token.type === TokenTypes.DEDENT).length; //NOSONAR
      expect(indentCount).toBe(dedentCount);

      // Verify nesting structure
      let currentIndent = 0;
      let maxIndent = 0;
      tokens.forEach(token => { //NOSONAR
        if (token.type === TokenTypes.INDENT) {
          currentIndent++;
          maxIndent = Math.max(maxIndent, currentIndent);
        } else if (token.type === TokenTypes.DEDENT) {
          currentIndent--;
        }
      });
      expect(maxIndent).toBe(4); // Maximum nesting level in the example
    });
  });

  describe('Indentation Handling', () => {
    it('should handle basic 4-space indentation', () => {
      const inputs = [
        `decision "Test"
    when "Condition" then
        do "Action"`,  // Standard 4-space indentation
        `decision "Test"
    when "Condition" then
        do "Action"`,  // Extra spaces after indentation
        `decision "Test"
    when "Condition" then
        do "Action"`   // Mixed spaces after indentation
      ];

      inputs.forEach(input => { //NOSONAR
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        expect(() => { //NOSONAR
          verifyTokenSequence(tokens, [
            TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
            TokenTypes.INDENT,
            TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
            TokenTypes.INDENT,
            TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
            TokenTypes.DEDENT,
            TokenTypes.DEDENT
          ]);
        }).not.toThrow();
      });
    });

    it('should handle multiple levels of indentation', () => {
      const input = `decision "Test"
    when "Condition" then
        all
        when "Subcondition" then
            do "Action"
        when "Another Subcondition" then
            do "Another Action"`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      expect(() => { //NOSONAR
        verifyTokenSequence(tokens, [
          TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.ALL, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
          TokenTypes.INDENT,
          TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
          TokenTypes.DEDENT,
          TokenTypes.DEDENT,
          TokenTypes.DEDENT,
          TokenTypes.DEDENT
        ]);
      }).not.toThrow();
    });

    it('should handle empty lines with indentation', () => {
      const inputs = [
        `decision "Test"
    
    when "Condition" then
        do "Action"`,  // Empty line at same indentation
        `decision "Test"
    when "Condition" then
        
        do "Action"`,  // Empty line at deeper indentation
        `decision "Test"
    when "Condition" then
        do "Action"
        
    when "Another Condition" then
        do "Another Action"`  // Empty line between blocks
      ];

      inputs.forEach(input => { //NOSONAR
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        expect(() => { //NOSONAR
          verifyTokenSequence(tokens, [
            TokenTypes.DECISION, TokenTypes.STRING, TokenTypes.NEWLINE,
            TokenTypes.INDENT,
            TokenTypes.WHEN, TokenTypes.STRING, TokenTypes.THEN, TokenTypes.NEWLINE,
            TokenTypes.INDENT,
            TokenTypes.DO, TokenTypes.STRING, TokenTypes.NEWLINE,
            TokenTypes.DEDENT,
            TokenTypes.DEDENT
          ]);
        }).not.toThrow();
      });
    });

    it('should handle end-of-file DEDENT tokens', () => {
      const inputs = [
        `decision "Test"
    when "Condition" then
        do "Action"`,  // No trailing newline
        `decision "Test"
    when "Condition" then
        do "Action"
    `,  // With trailing newline
        `decision "Test"
    when "Condition" then
        all
        when "Subcondition" then
            do "Action"`  // Multiple levels
      ];

      inputs.forEach(input => { //NOSONAR
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);
        
        // Verify all INDENTs are matched with DEDENTs
        const indentCount = tokens.filter(token => token.type === TokenTypes.INDENT).length;
        const dedentCount = tokens.filter(token => token.type === TokenTypes.DEDENT).length;
        expect(indentCount).toBe(dedentCount);
        
        // Verify last token is DEDENT (except for EOF)
        const lastNonEofToken = tokens[tokens.length - 2];
        expect(lastNonEofToken.type).toBe(TokenTypes.DEDENT);
      });
    });

    it('should handle complex indentation patterns from example', () => {
      const input = `decision "IMMZ.D2.D5.Measles"
    when "Measles Routine Immunization Schedule Incomplete" then
        when "No Primary Series Doses Administered" then
            any
            when "Client Age Less Than 12 Months" then 
                do "Indicate"
            when "Last Live Vaccine Administered Within 4 Weeks" then 
                use "Elderly Based"
            when "Client Is Due For MCV12" then 
                do "Vaccinate"
    when "One Primary Series Dose Administered" then
        all
        when "Client Age Less Than 15 Months" then 
            do "Indicate"
        when "Last Live Vaccine Administered Within 4 Weeks" then 
            use "Elderly Based"
        when "Client Is Due For MCV12" then 
            do "Vaccinate"`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      // Verify indentation balance
      const indentCount = tokens.filter(token => token.type === TokenTypes.INDENT).length; //NOSONAR
      const dedentCount = tokens.filter(token => token.type === TokenTypes.DEDENT).length; //NOSONAR
      expect(indentCount).toBe(dedentCount);
      
      // Verify maximum indentation level
      let currentIndent = 0;
      let maxIndent = 0;
      tokens.forEach(token => { //NOSONAR
        if (token.type === TokenTypes.INDENT) {
          currentIndent++;
          maxIndent = Math.max(maxIndent, currentIndent);
        } else if (token.type === TokenTypes.DEDENT) {
          currentIndent--;
        }
      });
      expect(maxIndent).toBe(4); // Maximum nesting level in example
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

describe('Basic Token Recognition', () => {
  describe('Keywords', () => {
    it('should recognize all CPGL keywords', () => {
      const input = 'decision when then do use any all';
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
        TokenTypes.EOF
      ]);
    });

    it('should recognize keywords in context', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action"
    when "Another Condition" then
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
        TokenTypes.EOF
      ]);
    });
  });

  describe('String Literals', () => {
    it('should recognize simple string literals', () => {
      const input = '"simple string" "string with spaces"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.STRING,
        TokenTypes.STRING,
        TokenTypes.EOF
      ], [
        '"simple string"',
        '"string with spaces"'
      ]);
    });

    it('should handle escaped quotes in strings', () => {
      const input = '"string with \\"quotes\\"" "another \\"quoted\\" string"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.STRING,
        TokenTypes.STRING,
        TokenTypes.EOF
      ], [
        '"string with \\"quotes\\""',
        '"another \\"quoted\\" string"'
      ]);
    });

    it('should handle empty strings', () => {
      const input = '""';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.STRING,
        TokenTypes.EOF
      ], [
        '""'
      ]);
    });
  });

  describe('Boolean Operators', () => {
    it('should recognize all boolean operators', () => {
      const input = 'AND OR NOT';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.AND,
        TokenTypes.OR,
        TokenTypes.NOT,
        TokenTypes.EOF
      ]);
    });

    it('should recognize boolean operators in expressions', () => {
      const input = 'NOT "Condition 1" AND "Condition 2" OR NOT "Condition 3"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.OR,
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.EOF
      ]);
    });
  });

  describe('Parentheses', () => {
    it('should recognize parentheses', () => {
      const input = '( )';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.LPAREN,
        TokenTypes.RPAREN,
        TokenTypes.EOF
      ]);
    });

    it('should handle nested parentheses', () => {
      const input = '((()))';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.LPAREN,
        TokenTypes.LPAREN,
        TokenTypes.LPAREN,
        TokenTypes.RPAREN,
        TokenTypes.RPAREN,
        TokenTypes.RPAREN,
        TokenTypes.EOF
      ]);
    });

    it('should handle parentheses in expressions', () => {
      const input = '(NOT "Condition 1" AND "Condition 2") OR (NOT "Condition 3" AND "Condition 4")';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.LPAREN,
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.OR,
        TokenTypes.LPAREN,
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.AND,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.EOF
      ]);
    });
  });
}); // Close Basic Token Recognition describe block
}); // Close CPGLLexer describe block 