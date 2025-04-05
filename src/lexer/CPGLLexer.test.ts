/* eslint-disable no-console */
import { CharStreams } from 'antlr4ts';
import { CPGLLexer } from './CPGLLexer';
import { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';

describe('CPGLLexer', () => {
    it('should handle basic tokens', () => {
        const input = 'decision "test"';
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        
        const tokens = getAllTokens(lexer);
        expect(tokens.length).toBe(3);
        expect(tokens[0].type).toBe(GeneratedLexer.DECISION);
        expect(tokens[1].type).toBe(GeneratedLexer.STRING);
        expect(tokens[2].type).toBe(GeneratedLexer.EOF);
    });

    it('should handle indentation', () => {
        const input = 'decision "test"\n    when "condition" then\n        do "action"';
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        
        const tokens = getAllTokens(lexer);
        expect(tokens.length).toBe(14);
        expect(tokens[0].type).toBe(GeneratedLexer.DECISION);
        expect(tokens[1].type).toBe(GeneratedLexer.STRING);
        expect(tokens[2].type).toBe(GeneratedLexer.NEWLINE);
        expect(tokens[3].type).toBe(GeneratedLexer.INDENT);
        expect(tokens[4].type).toBe(GeneratedLexer.WHEN);
        expect(tokens[5].type).toBe(GeneratedLexer.STRING);
        expect(tokens[6].type).toBe(GeneratedLexer.THEN);
        expect(tokens[7].type).toBe(GeneratedLexer.NEWLINE);
        expect(tokens[8].type).toBe(GeneratedLexer.INDENT);
        expect(tokens[9].type).toBe(GeneratedLexer.DO);
        expect(tokens[10].type).toBe(GeneratedLexer.STRING);
        expect(tokens[11].type).toBe(GeneratedLexer.DEDENT);
        expect(tokens[12].type).toBe(GeneratedLexer.DEDENT);
        expect(tokens[13].type).toBe(GeneratedLexer.EOF);
    });

    it('should handle comments', () => {
        const input = '// This is a comment\ndecision "test"';
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        
        const tokens = getAllTokens(lexer);
        expect(tokens.length).toBe(4);
        expect(tokens[0].type).toBe(GeneratedLexer.NEWLINE);
        expect(tokens[1].type).toBe(GeneratedLexer.DECISION);
        expect(tokens[2].type).toBe(GeneratedLexer.STRING);
        expect(tokens[3].type).toBe(GeneratedLexer.EOF);
    });

    it('should handle block comments', () => {
        const input = '/* This is a\nblock comment */\ndecision "test"';
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        
        const tokens = getAllTokens(lexer);
        expect(tokens.length).toBe(4);
        expect(tokens[0].type).toBe(GeneratedLexer.NEWLINE);
        expect(tokens[1].type).toBe(GeneratedLexer.DECISION);
        expect(tokens[2].type).toBe(GeneratedLexer.STRING);
        expect(tokens[3].type).toBe(GeneratedLexer.EOF);
    });

    it('should handle errors', () => {
        const input = '@';
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        
        const tokens = getAllTokens(lexer);
        expect(tokens.length).toBe(2);
        expect(tokens[0].type).toBe(GeneratedLexer.ERROR);
        expect(tokens[1].type).toBe(GeneratedLexer.EOF);
    });

    it('should tokenize keywords correctly', () => {
        const input = 'decision when then do use action fhirtype casefeature code url valuetype';
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        
        const tokens = getAllTokens(lexer);
        expect(tokens.length).toBe(12);
        expect(tokens[0].type).toBe(GeneratedLexer.DECISION);
        expect(tokens[1].type).toBe(GeneratedLexer.WHEN);
        expect(tokens[2].type).toBe(GeneratedLexer.THEN);
        expect(tokens[3].type).toBe(GeneratedLexer.DO);
        expect(tokens[4].type).toBe(GeneratedLexer.USE);
        expect(tokens[5].type).toBe(GeneratedLexer.ACTION);
        expect(tokens[6].type).toBe(GeneratedLexer.FHIRTYPE);
        expect(tokens[7].type).toBe(GeneratedLexer.CASEFEATURE);
        expect(tokens[8].type).toBe(GeneratedLexer.CODE);
        expect(tokens[9].type).toBe(GeneratedLexer.URL);
        expect(tokens[10].type).toBe(GeneratedLexer.VALUETYPE);
        expect(tokens[11].type).toBe(GeneratedLexer.EOF);
    });

    it('should handle inconsistent indentation', () => {
        const input = 'decision "test"\n    when "condition" then\n  do "action"';
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        
        expect(() => {
            getAllTokens(lexer);
        }).toThrow('Inconsistent indentation');
    });

    it('should tokenize a complete CPGL document', () => {
        const input = `decision "Test Decision"
    when "Condition 1" then
        do "Action 1"
    when "Condition 2" then
        do "Action 2"
        use "Another Decision"`;
        const lexer = new CPGLLexer(CharStreams.fromString(input));
        
        const tokens = getAllTokens(lexer);
        expect(tokens.length).toBe(26);
        expect(tokens[0].type).toBe(GeneratedLexer.DECISION);
        expect(tokens[1].type).toBe(GeneratedLexer.STRING);
        expect(tokens[2].type).toBe(GeneratedLexer.NEWLINE);
        expect(tokens[3].type).toBe(GeneratedLexer.INDENT);
        expect(tokens[4].type).toBe(GeneratedLexer.WHEN);
        expect(tokens[5].type).toBe(GeneratedLexer.STRING);
        expect(tokens[6].type).toBe(GeneratedLexer.THEN);
        expect(tokens[7].type).toBe(GeneratedLexer.NEWLINE);
        expect(tokens[8].type).toBe(GeneratedLexer.INDENT);
        expect(tokens[9].type).toBe(GeneratedLexer.DO);
        expect(tokens[10].type).toBe(GeneratedLexer.STRING);
        expect(tokens[11].type).toBe(GeneratedLexer.NEWLINE);
        expect(tokens[12].type).toBe(GeneratedLexer.DEDENT);
        expect(tokens[13].type).toBe(GeneratedLexer.WHEN);
        expect(tokens[14].type).toBe(GeneratedLexer.STRING);
        expect(tokens[15].type).toBe(GeneratedLexer.THEN);
        expect(tokens[16].type).toBe(GeneratedLexer.NEWLINE);
        expect(tokens[17].type).toBe(GeneratedLexer.INDENT);
        expect(tokens[18].type).toBe(GeneratedLexer.DO);
        expect(tokens[19].type).toBe(GeneratedLexer.STRING);
        expect(tokens[20].type).toBe(GeneratedLexer.NEWLINE);
        expect(tokens[21].type).toBe(GeneratedLexer.USE);
        expect(tokens[22].type).toBe(GeneratedLexer.STRING);
        expect(tokens[23].type).toBe(GeneratedLexer.DEDENT);
        expect(tokens[24].type).toBe(GeneratedLexer.DEDENT);
        expect(tokens[25].type).toBe(GeneratedLexer.EOF);
    });
});

function getAllTokens(lexer: CPGLLexer) {
    const tokens = [];
    let token = lexer.nextToken();
    let iterationCount = 0;
    const MAX_ITERATIONS = 1000; // Safety limit to prevent infinite loops
    
    while (token.type !== GeneratedLexer.EOF && iterationCount < MAX_ITERATIONS) {
        console.log(`Token ${iterationCount}: type=${token.type} (${(token as any).typeName}), text="${token.text}"`);
        tokens.push(token);
        token = lexer.nextToken();
        iterationCount++;
    }
    
    if (iterationCount >= MAX_ITERATIONS) {
        throw new Error('Token generation exceeded maximum iterations');
    }
    
    tokens.push(token); // Add the EOF token
    console.log(`Token ${iterationCount}: type=${token.type} (${(token as any).typeName}), text="${token.text}"`);
    return tokens;
}
