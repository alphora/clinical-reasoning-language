import { CPGLLexer } from '../lexer';
import { CommonTokenStream, CharStreams } from 'antlr4ts';
import { CPGLParser as GeneratedParser } from '../grammar/CPGLParser';

export class CPGLParser {
    private lexer: CPGLLexer;
    private parser: GeneratedParser;

    constructor(input: string) {
        // Convert input string to CharStream
        const charStream = CharStreams.fromString(input);
        // Use our custom lexer
        this.lexer = new CPGLLexer(charStream);
        const tokens = new CommonTokenStream(this.lexer);
        this.parser = new GeneratedParser(tokens);
    }

    public parse(): void {
        // Parse the input
        this.parser.file();
    }
} 