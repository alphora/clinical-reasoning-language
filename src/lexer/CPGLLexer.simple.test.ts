import { CharStreams } from 'antlr4ts';
import { CPGLLexer } from './CPGLLexer';
import { CPGLTokenType } from './CPGLTokenType';

describe('CPGLLexer Simple Test', () => {
    test('should tokenize a simple string', () => {
        const input = 'decision "Test"';
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        
        const token1 = lexer.nextToken();
        expect(token1.type).toBe(CPGLTokenType.DECISION);
        expect(token1.text).toBe('decision');
        
        const token2 = lexer.nextToken();
        expect(token2.type).toBe(CPGLTokenType.STRING);
        expect(token2.text).toBe('"Test"');
        
        const token3 = lexer.nextToken();
        expect(token3.type).toBe(CPGLTokenType.EOF);
    });
}); 