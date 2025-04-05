import { CPGLLexer } from '../lexer';
import { CommonTokenStream, CharStreams } from 'antlr4ts';
import { CPGLParser as GeneratedParser } from '../grammar/generated/CPGLParser';

export class CPGLParser {
    private lexer: CPGLLexer;
    private parser: GeneratedParser;

    constructor(input: string) {
        // Trim leading and trailing whitespace and newlines
        const trimmedInput = input.trim();
        // Convert input string to CharStream
        const charStream = CharStreams.fromString(trimmedInput);
        // Use our custom lexer
        this.lexer = new CPGLLexer(charStream);
        const tokens = new CommonTokenStream(this.lexer);
        this.parser = new GeneratedParser(tokens);
        
        // Remove the default error listener to prevent error messages
        this.parser.removeErrorListeners();
    }

    public parse(): void {
        try {
            // Parse the input starting from the file rule
            const tree = this.parser.file();
            console.log('Parse tree:', tree.toStringTree(this.parser));
        } catch (e) {
            console.error('Parsing error:', e);
        }
    }
} 