import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { CPGLLexer } from '../lexer/CPGLLexer';
import { CPGLParser as GeneratedParser } from '../grammar/generated/CPGLParser';

describe('CPGLParser', () => {
    function createParser(input: string): GeneratedParser {
        const charStream = CharStreams.fromString(input);
        const lexer = new CPGLLexer(charStream);
        const tokenStream = new CommonTokenStream(lexer);
        return new GeneratedParser(tokenStream);
    }

    test('should parse a simple decision', () => {
        const input = 'decision "Test"\n  when "condition" then\n    do "action"\n';
        const parser = createParser(input);
        
        expect(() => {
            const tree = parser.file();
            expect(tree).toBeTruthy();
        }).not.toThrow();
    });

    test('should parse a decision with multiple actions', () => {
        const input = 'decision "Complex Test"\n' +
                     '  when "first condition" then\n' +
                     '    do "action1"\n' +
                     '    do "action2"\n' +
                     '  when "second condition" then\n' +
                     '    do "action3"\n';
        const parser = createParser(input);
        
        expect(() => {
            const tree = parser.file();
            expect(tree).toBeTruthy();
        }).not.toThrow();
    });

    test('should parse a decision with use statements', () => {
        const input = 'decision "Test with Use"\n' +
                     '  when "condition" then\n' +
                     '    use "other_decision"\n' +
                     '    do "action"\n';
        const parser = createParser(input);
        
        expect(() => {
            const tree = parser.file();
            expect(tree).toBeTruthy();
        }).not.toThrow();
    });
}); 