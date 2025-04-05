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

    private cleanTreeString(tree: any): string {
        const treeStr = tree.toStringTree(this.parser);
        // Remove redundant rule names that match their token values
        return treeStr.replace(/\b(\w+)\s+\1\b/g, '$1');
    }

    public parse(): void {
        try {
            // Parse the input starting from the file rule
            const tree = this.parser.file();
            console.log('Parse tree:', this.cleanTreeString(tree));
        } catch (e) {
            console.error('Parsing error:', e);
        }
    }
} 