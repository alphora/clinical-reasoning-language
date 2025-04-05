import { CharStreams } from 'antlr4ts';

import { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';

import { CPGLLexer } from './CPGLLexer';

describe('CPGLLexer Simple Test', () => {
  test('should tokenize a simple string', () => {
    const input = 'decision "test"';
    const lexer = new CPGLLexer(CharStreams.fromString(input));

    const token1 = lexer.nextToken();
    expect(token1.type).toBe(GeneratedLexer.DECISION);
    expect(token1.text).toBe('decision');

    const token2 = lexer.nextToken();
    expect(token2.type).toBe(GeneratedLexer.STRING);
    expect(token2.text).toBe('"test"');

    const token3 = lexer.nextToken();
    expect(token3.type).toBe(GeneratedLexer.EOF);
  });
});
