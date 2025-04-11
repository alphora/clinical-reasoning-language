import { CharStreams, Token } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

import { getAllTokens, verifyTokenSequence } from './index.test';

describe('Whitespace Handling', () => {
  it('should skip newlines between tokens', () => {
    const input = 'decision\nwhen\nthen\ndo';
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    verifyTokenSequence(tokens, [
      CPGLLexer.DECISION,
      CPGLLexer.WHEN,
      CPGLLexer.THEN,
      CPGLLexer.DO,
      Token.EOF,
    ]);
  });

  it('should skip spaces between tokens', () => {
    const input = 'decision "Test Decision"    when "Condition"  then    do "Action"';
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    verifyTokenSequence(tokens, [
      CPGLLexer.DECISION,
      CPGLLexer.STRING,
      CPGLLexer.WHEN,
      CPGLLexer.STRING,
      CPGLLexer.THEN,
      CPGLLexer.DO,
      CPGLLexer.STRING,
      Token.EOF,
    ]);
  });

  it('should skip mixed whitespace patterns', () => {
    const input = `decision "Test"
    when "Level 1" then
        when "Level 2" then
            when "Level 3" then
                do "Action"`;

    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);

    verifyTokenSequence(tokens, [
      CPGLLexer.DECISION,
      CPGLLexer.STRING,
      CPGLLexer.WHEN,
      CPGLLexer.STRING,
      CPGLLexer.THEN,
      CPGLLexer.WHEN,
      CPGLLexer.STRING,
      CPGLLexer.THEN,
      CPGLLexer.WHEN,
      CPGLLexer.STRING,
      CPGLLexer.THEN,
      CPGLLexer.DO,
      CPGLLexer.STRING,
      Token.EOF,
    ]);
  });

  it('should handle consecutive whitespace', () => {
    const input = 'decision    "Test"  \t  when  \n\n  "Condition"';
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    verifyTokenSequence(tokens, [
      CPGLLexer.DECISION,
      CPGLLexer.STRING,
      CPGLLexer.WHEN,
      CPGLLexer.STRING,
      Token.EOF,
    ]);
  });

  it('should handle leading and trailing whitespace', () => {
    const input = '\n  \t decision "Test" when "Condition" \n  ';
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    verifyTokenSequence(tokens, [
      CPGLLexer.DECISION,
      CPGLLexer.STRING,
      CPGLLexer.WHEN,
      CPGLLexer.STRING,
      Token.EOF,
    ]);
  });
});
