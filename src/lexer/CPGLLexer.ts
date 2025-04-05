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
    readonly indentationStack: number[] = [0];
    readonly pendingTokens: Token[] = [];
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
    public static readonly grammarFileName = 'CPGLCustomLexer';

    // Standard tokens for testing - these would normally be generated from an ANTLR grammar
    private readonly TOKEN_RULES: Map<string, number> = new Map([
        ['decision', CPGLTokenType.DECISION],
        ['when', CPGLTokenType.WHEN],
        ['then', CPGLTokenType.THEN],
        ['do', CPGLTokenType.DO],
        ['use', CPGLTokenType.USE],
        ['action', CPGLTokenType.ACTION],
        ['fhirtype', CPGLTokenType.FHIRTYPE],
        ['casefeature', CPGLTokenType.CASEFEATURE],
        ['code', CPGLTokenType.CODE],
        ['url', CPGLTokenType.URL],
        ['valuetype', CPGLTokenType.VALUETYPE]
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

    // Line and column tracking
    public get line(): number {
        return this._currentLine;
    }

    public get charPositionInLine(): number {
        return this._currentColumn;
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
            const token = this.pendingTokens.shift();
            if (token) {
                return token;
            }
        }

        // If at EOF and we have indentation levels to close
        if (this._input.LA(1) === -1) {
            if (this.indentationStack.length > 1) {
                this.indentationStack.pop();
                return this.createToken({
                    type: CPGLTokenType.DEDENT,
                    text: '<DEDENT>',
                    startIndex: this._input.index,
                    stopIndex: this._input.index,
                    line: this._currentLine,
                    charPositionInLine: this._currentColumn,
                    channel: Token.DEFAULT_CHANNEL,
                    tokenIndex: this._tokenIndex++,
                    source: [this._input, this]
                });
            }
            // Return EOF token when all indentation levels are closed
            return this.createToken({
                type: CPGLTokenType.EOF,
                text: '<EOF>',
                startIndex: this._input.index,
                stopIndex: this._input.index,
                line: this._currentLine,
                charPositionInLine: this._currentColumn,
                channel: Token.DEFAULT_CHANNEL,
                tokenIndex: this._tokenIndex++,
                source: [this._input, this]
            });
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
                return this.createToken({
                    type: CPGLTokenType.INDENT,
                    text: '<INDENT>',
                    startIndex: this._input.index - whitespaceCount,
                    stopIndex: this._input.index,
                    line: this._currentLine,
                    charPositionInLine: this._currentColumn,
                    channel: Token.DEFAULT_CHANNEL,
                    tokenIndex: this._tokenIndex++,
                    source: [this._input, this]
                });
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
                return this.createToken({
                    type: CPGLTokenType.DEDENT,
                    text: '<DEDENT>',
                    startIndex: this._input.index - whitespaceCount,
                    stopIndex: this._input.index,
                    line: this._currentLine,
                    charPositionInLine: this._currentColumn,
                    channel: Token.DEFAULT_CHANNEL,
                    tokenIndex: this._tokenIndex++,
                    source: [this._input, this]
                });
            }
        } else {
            // Skip whitespace between tokens
            while (this._input.LA(1) === ' '.charCodeAt(0)) {
                this._input.consume();
                this._currentColumn++;
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
            return this.createToken({
                type: CPGLTokenType.NEWLINE,
                text: '<NEWLINE>',
                startIndex: start,
                stopIndex: this._input.index - 1,
                line: this._currentLine - 1,
                charPositionInLine: this._currentColumn,
                channel: Token.DEFAULT_CHANNEL,
                tokenIndex: this._tokenIndex++,
                source: [this._input, this]
            });
        }

        // Handle string literals
        if (this._input.LA(1) === '"'.charCodeAt(0)) {
            return this.handleStringLiteral();
        }

        // Handle identifiers and keywords
        if (this.isAlpha(this._input.LA(1)) || this._input.LA(1) === '_'.charCodeAt(0)) {
            return this.handleIdentifier();
        }

        // Unknown character - treat as identifier
        const startIndex = this._input.index;
        const startColumn = this._currentColumn;
        const c = String.fromCharCode(this._input.LA(1));
        this._input.consume();
        this._currentColumn++;

        return this.createToken({
            type: CPGLTokenType.IDENTIFIER,
            text: c,
            startIndex: startIndex,
            stopIndex: this._input.index - 1,
            line: this._currentLine,
            charPositionInLine: startColumn,
            channel: Token.DEFAULT_CHANNEL,
            tokenIndex: this._tokenIndex++,
            source: [this._input, this]
        });
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
        
        return this.createToken({
            type: CPGLTokenType.COMMENT,
            text: this._input.getText(new Interval(start, this._input.index - 1)), 
            startIndex: start, 
            stopIndex: this._input.index,
            line: this._currentLine,
            charPositionInLine: this._currentColumn,
            channel: Token.HIDDEN_CHANNEL,
            tokenIndex: this._tokenIndex++,
            source: [this._input, this]
        });
    }

    /**
     * Handle block comments
     */
    protected handleBlockComment(): Token {
        const start = this._input.index;
        this._input.consume(); // Consume the first '/'
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
        
        return this.createToken({
            type: CPGLTokenType.COMMENT_BLOCK,
            text: this._input.getText(new Interval(start, this._input.index - 1)), 
            startIndex: start, 
            stopIndex: this._input.index,
            line: this._currentLine,
            charPositionInLine: this._currentColumn,
            channel: Token.HIDDEN_CHANNEL,
            tokenIndex: this._tokenIndex++,
            source: [this._input, this]
        });
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
        
        return this.createToken({
            type: CPGLTokenType.STRING,
            text: this._input.getText(new Interval(start, this._input.index - 1)), 
            startIndex: start, 
            stopIndex: this._input.index,
            line: this._currentLine,
            charPositionInLine: this._currentColumn,
            channel: Token.DEFAULT_CHANNEL,
            tokenIndex: this._tokenIndex++,
            source: [this._input, this]
        });
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
            return this.createToken({
                type: keywordType,
                text: text,
                startIndex: start,
                stopIndex: this._input.index,
                line: this._currentLine,
                charPositionInLine: this._currentColumn,
                channel: Token.DEFAULT_CHANNEL,
                tokenIndex: this._tokenIndex++,
                source: [this._input, this]
            });
        }
        
        // Otherwise it's an identifier
        return this.createToken({
            type: CPGLTokenType.IDENTIFIER,
            text: text,
            startIndex: start,
            stopIndex: this._input.index,
            line: this._currentLine,
            charPositionInLine: this._currentColumn,
            channel: Token.DEFAULT_CHANNEL,
            tokenIndex: this._tokenIndex++,
            source: [this._input, this]
        });
    }

    /**
     * Create a token with the appropriate values
     */
    private createToken(options: {
        type: number;
        text: string;
        startIndex: number;
        stopIndex: number;
        line: number;
        charPositionInLine: number;
        channel: number;
        tokenIndex: number;
        source: [CharStream, CPGLLexer];
    }): Token {
        return new CPGLToken(options);
    }
} 