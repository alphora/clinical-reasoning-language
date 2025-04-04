import { Lexer } from 'antlr4ts/Lexer';
import { CharStream } from 'antlr4ts/CharStream';
import { Token } from 'antlr4ts/Token';
import { CPGLToken } from './CPGLToken';
import { CPGLTokenType } from './CPGLTokenType';
import { Interval } from 'antlr4ts/misc/Interval';

/**
 * Custom lexer for the Clinical Practice Guideline Language (CPGL)
 * Handles indentation-based syntax, comments, and token generation
 */
export class CPGLLexer extends Lexer {
    private indentationStack: number[] = [0];
    private pendingTokens: CPGLToken[] = [];
    private currentIndent = 0;
    private atStartOfLine = true;
    private _tokenIndex = -1;
    private _currentLine = 1;
    private _currentColumn = 0;

    // Required by ANTLR
    public static readonly channelNames: string[] = ['DEFAULT_TOKEN_CHANNEL', 'HIDDEN'];
    public static readonly modeNames: string[] = ['DEFAULT_MODE'];
    public static readonly ruleNames: string[] = [];
    public static readonly vocabulary = {};
    public static readonly grammarFileName = 'CPGL.g4';

    // Standard tokens for testing - these would normally be generated from an ANTLR grammar
    private readonly TOKEN_RULES: Map<string, number> = new Map([
        ['decision', CPGLTokenType.DECISION],
        ['recommend', CPGLTokenType.RECOMMENDATION],
        ['condition', CPGLTokenType.CONDITION],
        ['action', CPGLTokenType.ACTION],
        ['if', CPGLTokenType.IF],
        ['else', CPGLTokenType.ELSE],
        ['when', CPGLTokenType.WHEN],
        ['then', CPGLTokenType.THEN],
        ['with', CPGLTokenType.WITH],
        ['EVIDENCE_LEVEL', CPGLTokenType.EVIDENCE_LEVEL]
    ]);

    // Required by Lexer
    public get channelNames(): string[] {
        return CPGLLexer.channelNames;
    }

    public get modeNames(): string[] {
        return CPGLLexer.modeNames;
    }

    public get ruleNames(): string[] {
        return CPGLLexer.ruleNames;
    }

    public get vocabulary(): any {
        return CPGLLexer.vocabulary;
    }

    public get grammarFileName(): string {
        return CPGLLexer.grammarFileName;
    }

    constructor(input: CharStream) {
        super(input);
    }

    /**
     * Get the next token from the input stream
     * Handles indentation tracking and token generation
     */
    public nextToken(): Token {
        // If we have pending tokens (INDENT/DEDENT), return those first
        if (this.pendingTokens.length > 0) {
            this._tokenIndex++;
            return this.pendingTokens.shift()!;
        }

        // If at EOF and we have indentation levels to close
        if (this._input.LA(1) === -1 && this.indentationStack.length > 1) {
            this.indentationStack.pop();
            this._tokenIndex++;
            return this.createToken(
                CPGLTokenType.DEDENT,
                '<DEDENT>',
                this._input.index,
                this._input.index
            );
        }

        // Handle normal input
        if (this._input.LA(1) === -1) {
            // End of file
            return this.createToken(CPGLTokenType.EOF, '<EOF>', this._input.index, this._input.index);
        }

        // Skip whitespace at the beginning of the line
        if (this.atStartOfLine) {
            this.atStartOfLine = false;
            let whitespaceCount = 0;
            
            // Count spaces at the beginning of the line
            while (this._input.LA(1) === ' '.charCodeAt(0)) {
                whitespaceCount++;
                this._input.consume();
                this._currentColumn++;
            }

            // Handle indentation changes
            this.currentIndent = whitespaceCount;
            const lastIndent = this.indentationStack[this.indentationStack.length - 1];

            if (this.currentIndent > lastIndent) {
                // Increase in indentation
                this.indentationStack.push(this.currentIndent);
                return this.createToken(
                    CPGLTokenType.INDENT,
                    '<INDENT>',
                    this._input.index - whitespaceCount,
                    this._input.index
                );
            } else if (this.currentIndent < lastIndent) {
                // Decrease in indentation
                let found = false;
                for (let i = this.indentationStack.length - 1; i >= 0; i--) {
                    if (this.indentationStack[i] === this.currentIndent) {
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    throw new Error('Inconsistent indentation');
                }

                this.indentationStack.pop();
                return this.createToken(
                    CPGLTokenType.DEDENT,
                    '<DEDENT>',
                    this._input.index - whitespaceCount,
                    this._input.index
                );
            }
        }

        // Handle comments
        if (this._input.LA(1) === '/'.charCodeAt(0)) {
            if (this._input.LA(2) === '/'.charCodeAt(0)) {
                // Single-line comment
                return this.handleSingleLineComment();
            } else if (this._input.LA(2) === '*'.charCodeAt(0)) {
                // Block comment
                return this.handleBlockComment();
            }
        }

        // Handle newlines
        if (this._input.LA(1) === '\n'.charCodeAt(0) || this._input.LA(1) === '\r'.charCodeAt(0)) {
            const start = this._input.index;
            this._input.consume();
            
            // Handle Windows-style newlines (\r\n)
            if (this._input.LA(1) === '\n'.charCodeAt(0) && this._input.LA(-1) === '\r'.charCodeAt(0)) {
                this._input.consume();
            }
            
            this.atStartOfLine = true;
            this._currentLine++;
            this._currentColumn = 0;
            return this.createToken(CPGLTokenType.NEWLINE, '<NEWLINE>', start, this._input.index);
        }

        // Handle string literals
        if (this._input.LA(1) === '"'.charCodeAt(0)) {
            return this.handleStringLiteral();
        }

        // Handle operators and punctuation
        const operatorMap: Record<string, number> = {
            '==': CPGLTokenType.EQUALS,
            '!=': CPGLTokenType.NOT_EQUALS,
            '>': CPGLTokenType.GT,
            '<': CPGLTokenType.LT,
            '>=': CPGLTokenType.GTE,
            '<=': CPGLTokenType.LTE,
            '(': CPGLTokenType.LPAREN,
            ')': CPGLTokenType.RPAREN,
            '[': CPGLTokenType.LBRACKET,
            ']': CPGLTokenType.RBRACKET,
            '{': CPGLTokenType.LBRACE,
            '}': CPGLTokenType.RBRACE,
            ',': CPGLTokenType.COMMA,
            ':': CPGLTokenType.COLON,
            '.': CPGLTokenType.DOT
        };

        // Check for two-character operators
        if (this._input.LA(1) !== -1 && this._input.LA(2) !== -1) {
            const possibleOp = String.fromCharCode(this._input.LA(1), this._input.LA(2));
            if (operatorMap[possibleOp]) {
                const start = this._input.index;
                this._input.consume();
                this._currentColumn++;
                this._input.consume();
                this._currentColumn++;
                return this.createToken(operatorMap[possibleOp], possibleOp, start, this._input.index);
            }
        }

        // Check for single-character operators
        if (this._input.LA(1) !== -1) {
            const possibleOp = String.fromCharCode(this._input.LA(1));
            if (operatorMap[possibleOp]) {
                const start = this._input.index;
                this._input.consume();
                this._currentColumn++;
                return this.createToken(operatorMap[possibleOp], possibleOp, start, this._input.index);
            }
        }

        // Handle identifiers and keywords
        if (this.isAlpha(this._input.LA(1)) || this._input.LA(1) === '_'.charCodeAt(0)) {
            return this.handleIdentifier();
        }

        // Skip other whitespace
        if (this.isWhitespace(this._input.LA(1))) {
            const start = this._input.index;
            while (this.isWhitespace(this._input.LA(1))) {
                this._input.consume();
                this._currentColumn++;
            }
            return this.createToken(CPGLTokenType.WS, '<WS>', start, this._input.index);
        }

        // Handle unknown characters
        const start = this._input.index;
        const text = String.fromCharCode(this._input.LA(1));
        this._input.consume();
        this._currentColumn++;
        return this.createToken(CPGLTokenType.UNKNOWN, text, start, this._input.index);
    }

    private isAlpha(c: number): boolean {
        return (c >= 'a'.charCodeAt(0) && c <= 'z'.charCodeAt(0)) || 
               (c >= 'A'.charCodeAt(0) && c <= 'Z'.charCodeAt(0));
    }

    private isDigit(c: number): boolean {
        return c >= '0'.charCodeAt(0) && c <= '9'.charCodeAt(0);
    }

    private isAlphanumeric(c: number): boolean {
        return this.isAlpha(c) || this.isDigit(c);
    }

    private isWhitespace(c: number): boolean {
        return c === ' '.charCodeAt(0) || c === '\t'.charCodeAt(0);
    }

    /**
     * Handle single-line comments
     */
    protected handleSingleLineComment(): Token {
        const start = this._input.index;
        this._input.consume(); // Consume the first '/'
        this._currentColumn++;
        this._input.consume(); // Consume the second '/'
        this._currentColumn++;
        
        while (this._input.LA(1) !== -1 && 
               this._input.LA(1) !== '\n'.charCodeAt(0) && 
               this._input.LA(1) !== '\r'.charCodeAt(0)) {
            this._input.consume();
            this._currentColumn++;
        }
        
        return this.createToken(
            CPGLTokenType.SINGLE_LINE_COMMENT,
            this._input.getText(new Interval(start, this._input.index - 1)), 
            start, 
            this._input.index
        );
    }

    /**
     * Handle block comments
     */
    protected handleBlockComment(): Token {
        const start = this._input.index;
        this._input.consume(); // Consume the '/'
        this._currentColumn++;
        this._input.consume(); // Consume the '*'
        this._currentColumn++;
        
        let foundEnd = false;
        while (this._input.LA(1) !== -1 && !foundEnd) {
            if (this._input.LA(1) === '\n'.charCodeAt(0)) {
                this._currentLine++;
                this._currentColumn = 0;
            } else if (this._input.LA(1) === '\r'.charCodeAt(0)) {
                // Handle Windows-style newlines
                if (this._input.LA(2) === '\n'.charCodeAt(0)) {
                    this._input.consume(); // Consume \r
                }
                this._currentLine++;
                this._currentColumn = 0;
            } else if (this._input.LA(1) === '*'.charCodeAt(0) && this._input.LA(2) === '/'.charCodeAt(0)) {
                this._input.consume(); // Consume the '*'
                this._currentColumn++;
                this._input.consume(); // Consume the '/'
                this._currentColumn++;
                foundEnd = true;
                break;
            } else {
                this._input.consume();
                this._currentColumn++;
            }
        }
        
        if (!foundEnd) {
            throw new Error('Unterminated block comment');
        }
        
        return this.createToken(
            CPGLTokenType.BLOCK_COMMENT,
            this._input.getText(new Interval(start, this._input.index - 1)), 
            start, 
            this._input.index
        );
    }

    /**
     * Handle string literals
     */
    protected handleStringLiteral(): Token {
        const start = this._input.index;
        this._input.consume(); // Consume opening quote
        this._currentColumn++;
        
        let escaping = false;
        while (this._input.LA(1) !== -1) {
            const c = this._input.LA(1);
            
            if (escaping) {
                escaping = false;
                this._input.consume();
                this._currentColumn++;
            } else if (c === '\\'.charCodeAt(0)) {
                escaping = true;
                this._input.consume();
                this._currentColumn++;
            } else if (c === '"'.charCodeAt(0)) {
                this._input.consume(); // Consume closing quote
                this._currentColumn++;
                break;
            } else {
                this._input.consume();
                this._currentColumn++;
            }
        }

        if (this._input.LA(-1) !== '"'.charCodeAt(0)) {
            throw new Error('Unterminated string literal');
        }
        
        return this.createToken(
            CPGLTokenType.STRING,
            this._input.getText(new Interval(start, this._input.index - 1)), 
            start, 
            this._input.index
        );
    }

    /**
     * Handle identifiers and keywords
     */
    protected handleIdentifier(): Token {
        const start = this._input.index;
        
        // Consume all valid identifier characters
        while (this.isAlphanumeric(this._input.LA(1)) || this._input.LA(1) === '_'.charCodeAt(0)) {
            this._input.consume();
            this._currentColumn++;
        }
        
        const text = this._input.getText(new Interval(start, this._input.index - 1));
        
        // Check if it's a keyword
        const keywordType = this.TOKEN_RULES.get(text);
        if (keywordType !== undefined) {
            return this.createToken(keywordType, text, start, this._input.index);
        }
        
        // Otherwise it's an identifier
        return this.createToken(CPGLTokenType.IDENTIFIER, text, start, this._input.index);
    }

    /**
     * Create a token with the appropriate values
     */
    private createToken(type: number, text: string, start: number, stop: number): Token {
        this._tokenIndex++;
        return new CPGLToken(
            type,
            text,
            this._input,
            this,
            Token.DEFAULT_CHANNEL,
            start,
            stop - 1,
            this._tokenIndex,
            this._currentLine,
            this._currentColumn
        );
    }
} 