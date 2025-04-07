import { CharStreams } from 'antlr4ts';
import { TokenTypes } from '../CPGLLexerConstants';
import { CPGLLexer } from '../CPGLLexer';
import { getAllTokens, verifyTokenSequence } from './index.test';

describe('Comments', () => {
  describe('Single-line Comments', () => {
    it('should ignore single-line comments in decision blocks', () => {
      const input = `decision "Test Decision"
    // This is a comment about the condition
    when "Condition" then
        // This is a comment about the action
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

    it('should handle single-line comments at the start of file', () => {
      const input = `// This is a comment
decision "Test"
    when "Condition" then
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
  });

  describe('Block Comments', () => {
    it('should ignore block comments in casefeature blocks', () => {
      const input = `casefeature "Test Feature"
    casefeaturecode "Test Code"
    fhirtype Condition
    profileurl "Test URL"
    valuetype string
    /* This is a block comment
       explaining the feature */
    expression ("Condition 1" AND "Condition 2")`;

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

    it('should handle block comments between tokens', () => {
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

  describe('Comments in Expressions', () => {
    it('should handle comments between tokens in expressions', () => {
      const input = `casefeature "Test Feature"
    casefeaturecode "Test Code"
    fhirtype Condition
    profileurl "Test URL"
    valuetype string
    expression (/* comment */ "Condition 1" /* another comment */ AND "Condition 2")`;

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
  });
}); 