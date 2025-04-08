import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../CPGLLexer';
import { TokenTypes } from '../CPGLLexerConstants';

import { getAllTokens, verifyTokenSequence } from './index.test';

describe('Structures', () => {
  describe('Decision Structure', () => {
    it('should tokenize basic decision blocks', () => {
      const input = `decision "Test Decision"
    when "Condition" then
        do "Action"
`;
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
        TokenTypes.EOF,
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
                use "Another Decision"
`;
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
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.DEDENT,
        TokenTypes.EOF,
      ]);
    });
  });

  describe('Action Structure', () => {
    it('should handle basic action with valid FHIR type', () => {
      const input = `action "Test Action"
    fhirtype MedicationRequest
`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        TokenTypes.ACTION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.FHIRTYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.EOF,
      ]);
    });

    it('should handle action with different valid FHIR type', () => {
      const input = `action "Another Action"
    fhirtype Appointment
`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        TokenTypes.ACTION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.FHIRTYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.EOF,
      ]);
    });

    it('should throw an exception for action with invalid FHIR type', () => {
      const input = `action "Invalid Action"
    fhirtype Condition
`; // Condition is a casefeature type, not an action type

      const lexer = new CPGLLexer(CharStreams.fromString(input));

      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });

    it('should throw an exception for action with do clause', () => {
      const input = `action "Invalid Action"
    fhirtype MedicationRequest
    do "Action"
`; // Actions cannot have do clauses

      const lexer = new CPGLLexer(CharStreams.fromString(input));

      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });

    it('should throw an exception for action with use clause', () => {
      const input = `action "Invalid Action"
    fhirtype MedicationRequest
    use "Another Decision"  // Actions cannot have use clauses
`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));

      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });
  });

  describe('Basic CaseFeature Structure', () => {
    it('should tokenize casefeatures with basic expressions', () => {
      const input = `casefeature "Test CaseFeature"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression ("Simple Expression")
`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      // Debug logging
      console.log('Actual tokens:', tokens.map(t => ({ type: t.type, text: t.text })));

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
        TokenTypes.RPAREN,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.EOF,
      ]);
    });
  });

  describe('Complex CaseFeature Expressions', () => {
    it('should tokenize casefeatures with complex expressions', () => {
      const input = `casefeature "Test CaseFeature"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression ("Test Expression" OR (NOT ("Subexpression 1" AND "Subexpression 2")))
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
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.EOF,
      ]);
    });

    it('should handle nested parentheses in expressions', () => {
      const input = `casefeature "Complex Expression"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression (("Condition 1" AND "Condition 2") OR (NOT ("Condition 3" AND ("Condition 4" OR "Condition 5")))
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
        TokenTypes.RPAREN,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.EOF,
      ]);
    });

    it('should handle multiple levels of NOT operations', () => {
      const input = `casefeature "Multiple NOTs"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression (NOT (NOT (NOT "Condition")))
`;

      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        TokenTypes.CASEFEATURE,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.EXPRESSION,
        TokenTypes.NOT,
        TokenTypes.LPAREN,
        TokenTypes.NOT,
        TokenTypes.LPAREN,
        TokenTypes.NOT,
        TokenTypes.STRING,
        TokenTypes.RPAREN,
        TokenTypes.RPAREN,
        TokenTypes.NEWLINE,
        TokenTypes.DEDENT,
        TokenTypes.EOF,
      ]);
    });
  });
});
