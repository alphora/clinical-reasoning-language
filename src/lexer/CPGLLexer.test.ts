/* eslint-disable no-console */
import { CharStreams, Token } from 'antlr4ts';
import { CPGLLexer } from './CPGLLexer';
import { CPGLTokenType } from './CPGLTokenType';

describe('CPGLLexer', () => {
    // Helper function to collect all tokens from input
    function getAllTokens(input: string): { type: number; text: string }[] {
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens: { type: number; text: string }[] = [];
        
        try {
            while (true) {
                const token = lexer.nextToken();
                tokens.push({
                    type: token.type,
                    text: token.text ?? ''
                });
                // Break after adding the EOF token
                if (token.type === Token.EOF) {
                    break;
                }
            }
        } catch (e) {
            // Convert error to a more informative format for test failures
            throw new Error(`Tokenization error: ${e instanceof Error ? e.message : String(e)}`);
        }
        
        return tokens;
    }

    test('should tokenize keywords correctly', () => {
        const tokens = getAllTokens('decision when then do use action');
        
        expect(tokens.find(t => t.type === CPGLTokenType.DECISION)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.WHEN)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.THEN)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.DO)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.USE)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.ACTION)).toBeTruthy();
    });

    test('should handle strings correctly', () => {
        const tokens = getAllTokens('"Simple string" "Test string"');
        
        const stringTokens = tokens.filter(t => t.type === CPGLTokenType.STRING);
        expect(stringTokens.length).toBeGreaterThanOrEqual(1);
        
        if (stringTokens.length > 0) {
            expect(stringTokens[0].text).toContain('Simple string');
        }
    });

    test('should handle comments', () => {
        const tokens = getAllTokens('// This is a comment\ndecision // Another comment');
        
        expect(tokens.filter(t => t.type === CPGLTokenType.COMMENT)).toHaveLength(2);
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

    // test('should handle block comments', () => {
    //     const tokens = getAllTokens('/* This is a\nblock comment */\ndecision "Test"');
        
    //     expect(tokens.find(t => t.type === CPGLTokenType.COMMENT_BLOCK)).toBeTruthy();
    //     expect(tokens.find(t => t.type === CPGLTokenType.DECISION)).toBeTruthy();
    // });

    test('should tokenize a complete CPGL document', () => {
        const input = 'decision "Test"\n  when "condition" then\n    do "action"\n  use "other_decision"';
        const tokens = getAllTokens(input);

        // Verify the tokens
        expect(tokens.find(t => t.type === CPGLTokenType.DECISION)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.STRING)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.WHEN)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.THEN)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.DO)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.USE)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.INDENT)).toBeTruthy();
        expect(tokens.find(t => t.type === CPGLTokenType.DEDENT)).toBeTruthy();
    });
});

test('Lexer should tokenize input correctly', () => {
    const input = 'decision Test';
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens: { type: number; text: string }[] = [];
    let token = lexer.nextToken();
    
    while (token.type !== Token.EOF) {
        tokens.push({
            type: token.type,
            text: token.text ?? ''
        });
        token = lexer.nextToken();
    }

    // Add assertions to verify the tokens
    expect(tokens).toHaveLength(2); // decision keyword and Test identifier
    expect(tokens[0].type).toBe(CPGLTokenType.DECISION);
    expect(tokens[0].text).toBe('decision');
    expect(tokens[1].type).toBe(CPGLTokenType.IDENTIFIER);
    expect(tokens[1].text).toBe('Test');
}); 