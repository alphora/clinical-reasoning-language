import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

import { getAllTokens, verifyTokenSequence } from './index.test';

describe('CPGL Lexer - Basic Tokens', () => {
  describe('Keywords', () => {
    it('should tokenize decision statement', () => {
      const input =
        'decision "Test Decision":\n    when "Condition" then:\n        do "Action"\n    done';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.STRING,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.COLON,
        CPGLLexer.DO,
        CPGLLexer.STRING,
        CPGLLexer.DONE,
      ]);
    });

    it('should tokenize decision statement with multiple actions', () => {
      const input =
        'decision "Test Decision":\n    when "Condition" then:\n        do "Action1"\n        do "Action2"\n    done';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.STRING,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.COLON,
        CPGLLexer.DO,
        CPGLLexer.STRING,
        CPGLLexer.DO,
        CPGLLexer.STRING,
        CPGLLexer.DONE,
      ]);
    });
  });

  describe('String Literals', () => {
    it('should tokenize simple string', () => {
      const input = '"Test String"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.STRING], ['"Test String"']);
    });

    it('should tokenize string with spaces', () => {
      const input = '"Test String With Spaces"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.STRING], ['"Test String With Spaces"']);
    });
  });

  describe('Boolean Operators', () => {
    it('should tokenize AND operator', () => {
      const input = 'and';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.AND], ['and']);
    });

    it('should tokenize OR operator', () => {
      const input = 'or';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.OR], ['or']);
    });
  });

  describe('Parentheses', () => {
    it('should tokenize opening parenthesis', () => {
      const input = '(';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.LPAREN], ['(']);
    });

    it('should tokenize closing parenthesis', () => {
      const input = ')';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.RPAREN], [')']);
    });

    it('should tokenize parenthesized expression', () => {
      const input = '("Test")';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.LPAREN, CPGLLexer.STRING, CPGLLexer.RPAREN]);
    });
  });
});
