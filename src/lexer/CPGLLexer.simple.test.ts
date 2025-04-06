/**
 * Simple tests for the custom CPGL lexer
 * 
 * IMPORTANT: These tests verify the basic functionality of our custom lexer implementation.
 * They should NOT use the generated lexer directly for token generation.
 */
import { CharStreams } from 'antlr4ts';
import { TokenTypes } from './CPGLLexerConstants';
import { CPGLLexer } from './CPGLLexer';

describe('CPGLLexer Simple Test', () => {
  it('should tokenize basic input', () => {
    const input = 'decision "test"';
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    
    const token1 = lexer.nextToken();
    expect(token1.type).toBe(TokenTypes.DECISION);
    
    const token2 = lexer.nextToken();
    expect(token2.type).toBe(TokenTypes.STRING);
    
    const token3 = lexer.nextToken();
    expect(token3.type).toBe(TokenTypes.EOF);
  });
});
