import { CharStreams } from 'antlr4ts';
import { TokenTypes } from '../CPGLLexerConstants';
import { CPGLLexer } from '../CPGLLexer';
import { getAllTokens, verifyTokenSequence } from './index.test';

describe('Whitespace', () => {
  it('should handle newlines in decision blocks', () => {
    const input = `decision "Test Decision"\n    when "Condition" then\n        do "Action"`;
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

  it('should handle 4-space indentation in nested blocks', () => {
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

  it('should throw error for tabs in indentation', () => {
    const input = `decision "Test Decision"
    when "Condition" then
\t    do "Action"`;

    const lexer = new CPGLLexer(CharStreams.fromString(input));
    
    expect(() => {
      getAllTokens(lexer);
    }).toThrow('Tabs are not allowed for indentation');
  });

  it('should handle multiple levels of indentation in nested blocks', () => {
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
}); 