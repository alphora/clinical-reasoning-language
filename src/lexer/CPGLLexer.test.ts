/* eslint-disable no-console */
import { CharStreams, Token } from 'antlr4ts';
import { CPGLLexer, CPGLTokenType } from '../lexer';

describe('CPGLLexer', () => {
    // Helper function to collect all tokens from input
    function getAllTokens(input: string): { type: number; text: string }[] {
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens: { type: number; text: string }[] = [];
        
        try {
            let token = lexer.nextToken();
            while (token.type !== CPGLTokenType.EOF) {
                tokens.push({
                    type: token.type,
                    text: token.text ?? ''
                });
                token = lexer.nextToken();
            }
        } catch (e) {
            // Convert error to a more informative format for test failures
            throw new Error(`Tokenization error: ${e instanceof Error ? e.message : String(e)}`);
        }
        
        return tokens;
    }

    test('should tokenize keywords correctly', () => {
        const tokens = getAllTokens('decision when then with');
        
        expect(tokens.find(t => t.type === CPGLTokenType.DECISION)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.WHEN)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.THEN)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.WITH)).toBeTruthy();
    });

    test('should handle strings correctly', () => {
        const tokens = getAllTokens('"Simple string" "Test string"');
        
        const stringTokens = tokens.filter(t => t.type === CPGLTokenType.STRING);
        expect(stringTokens.length).toBeGreaterThanOrEqual(1);
        
        if (stringTokens.length > 0) {
            expect(stringTokens[0].text).toContain('Simple string');
        }
    });

    test('should handle single-line comments', () => {
        const tokens = getAllTokens('// This is a comment\ndecision // Another comment');
        
        expect(tokens.filter(t => t.type === CPGLTokenType.SINGLE_LINE_COMMENT)).toHaveLength(2);
        expect(tokens.find(t => t.type === CPGLTokenType.DECISION)).toBeTruthy();
    });

    test('should handle basic indentation', () => {
        const tokens = getAllTokens('level1\n    level2\n        level3\n    back\nlevel1');
        
        const indentTokens = tokens.filter(t => 
            t.type === CPGLTokenType.INDENT || t.type === CPGLTokenType.DEDENT);
            
        expect(indentTokens.length).toBeGreaterThan(0);
        // Check if we have the same number of INDENTs and DEDENTs
        const indents = indentTokens.filter(t => t.type === CPGLTokenType.INDENT);
        const dedents = indentTokens.filter(t => t.type === CPGLTokenType.DEDENT);
        expect(indents.length).toBe(dedents.length);
    });

    test('should throw on inconsistent indentation', () => {
        expect(() => {
            getAllTokens('level1\n    level2\n   invalid');
        }).toThrow('Inconsistent indentation');
    });
});

// Example test case to ensure the lexer is functioning
// This is a placeholder; replace with actual test logic

test('Lexer should tokenize input correctly', () => {
    const input = 'decision Test';
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    let token = lexer.nextToken();
    
    while (token.type !== Token.EOF) {
        console.log(`Token: type=${token.type}, text="${token.text}"`);
        token = lexer.nextToken();
    }
}); 