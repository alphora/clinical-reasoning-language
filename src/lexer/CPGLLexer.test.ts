/**
 * Comprehensive tests for the CPGL lexer
 * 
 * These tests verify the lexer's ability to correctly tokenize CPGL input according to the grammar.
 * The tests are organized by token type and include whitespace verification.
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
  });
}); 