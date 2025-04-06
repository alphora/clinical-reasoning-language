/**
 * Custom lexer for the Clinical Practice Guideline Language (CPGL)
 * 
 * IMPORTANT: This is our custom lexer implementation that extends the base ANTLR Lexer.
 * It provides additional functionality for handling indentation-based syntax, comments, and token generation.
 * 
 * WARNING: Do not replace this with the generated lexer (../grammar/generated/CPGLLexer) as it lacks
 * the custom functionality needed for our language features.

 */
import { CharStream } from 'antlr4ts/CharStream';
import { Lexer } from 'antlr4ts/Lexer';
import { Token } from 'antlr4ts/Token';
import { TokenTypes } from './CPGLLexerConstants';
import { CPGLToken } from './CPGLToken';
import { Vocabulary } from 'antlr4ts/Vocabulary';
import { VocabularyImpl } from 'antlr4ts/VocabularyImpl';

/**
 * Custom lexer for CPGL that handles Python-like whitespace control
 */
export class CPGLLexer extends Lexer {
    private _tokenIndex: number = 0;
    private _currentLine: number = 1;
    private _currentColumn: number = 0;
    private _atLineStart: boolean = true;
    private _indentStack: number[] = [0];
    private _pendingDedents: number = 0;
    private _indentType: 'space' | 'tab' | null = null;
    private _inLineComment: boolean = false;
    private _inBlockComment: boolean = false;

    // Required by Lexer interface
    public static readonly channelNames: string[] = [
        'DEFAULT_TOKEN_CHANNEL', 'HIDDEN'
    ];
    public static readonly modeNames: string[] = [
        'DEFAULT_MODE'
    ];
    public static readonly ruleNames: string[] = [];
    public static readonly vocabulary: Vocabulary = new VocabularyImpl([], [], []);
    public static readonly grammarFileName: string = 'CPGL.g4';

    public get channelNames(): string[] { return CPGLLexer.channelNames; }
    public get modeNames(): string[] { return CPGLLexer.modeNames; }
    public get ruleNames(): string[] { return CPGLLexer.ruleNames; }
    public get vocabulary(): Vocabulary { return CPGLLexer.vocabulary; }
    public get grammarFileName(): string { return CPGLLexer.grammarFileName; }

    // Keywords map for fast lookup
    private static readonly KEYWORDS = new Map<string, number>([
        ['decision', TokenTypes.DECISION],
        ['when', TokenTypes.WHEN],
        ['then', TokenTypes.THEN],
        ['do', TokenTypes.DO],
        ['use', TokenTypes.USE],
        ['any', TokenTypes.ANY],
        ['all', TokenTypes.ALL],
        ['action', TokenTypes.ACTION],
        ['fhirtype', TokenTypes.FHIRTYPE],
        ['casefeature', TokenTypes.CASEFEATURE],
        ['casefeaturecode', TokenTypes.CASEFEATURECODE],
        ['profileurl', TokenTypes.PROFILEURL],
        ['valuetype', TokenTypes.VALUETYPE],
        ['expression', TokenTypes.EXPRESSION],
        ['or', TokenTypes.OR],
        ['and', TokenTypes.AND],
        ['not', TokenTypes.NOT]
    ]);

    constructor(input: CharStream) {
        super(input);
    }

    public nextToken(): Token {
        // Handle pending DEDENT tokens
        if (this._pendingDedents > 0) {
            this._pendingDedents--;
            return this.createToken(TokenTypes.DEDENT, '');
        }

        // Handle EOF with pending dedents
        if (this._input.LA(1) === Token.EOF) {
            // If we're still indented when we hit EOF, emit DEDENT tokens
            if (this._indentStack.length > 1) {
                this._pendingDedents = this._indentStack.length - 1;
                this._indentStack = [0];
                return this.createToken(TokenTypes.DEDENT, '');
            }
            return this.createToken(TokenTypes.EOF, '<EOF>');
        }

        // Skip comments
        if (this._inLineComment) {
            while (this._input.LA(1) !== '\n'.charCodeAt(0) && this._input.LA(1) !== Token.EOF) {
                this._input.consume();
                this._currentColumn++;
            }
            this._inLineComment = false;
            if (this._input.LA(1) === '\n'.charCodeAt(0)) {
                return this.handleNewline();
            }
            return this.nextToken();
        }

        if (this._inBlockComment) {
            while (this._input.LA(1) !== Token.EOF) {
                if (this._input.LA(1) === '*'.charCodeAt(0) && this._input.LA(2) === '/'.charCodeAt(0)) {
                    this._input.consume(); // consume *
                    this._input.consume(); // consume /
                    this._currentColumn += 2;
                    this._inBlockComment = false;
                    return this.nextToken();
                }
                if (this._input.LA(1) === '\n'.charCodeAt(0)) {
                    return this.handleNewline();
                }
                this._input.consume();
                this._currentColumn++;
            }
        }

        // Handle indentation at line start
        if (this._atLineStart) {
            let spaces = 0;
            let hasSpaces = false;
            let hasTabs = false;

            // Skip empty lines and handle comments
            while (this._input.LA(1) === '\n'.charCodeAt(0) || 
                   this._input.LA(1) === ' '.charCodeAt(0) || 
                   this._input.LA(1) === '\t'.charCodeAt(0) ||
                   this._input.LA(1) === '/'.charCodeAt(0)) {
                
                if (this._input.LA(1) === '\n'.charCodeAt(0)) {
                    return this.handleNewline();
                }

                if (this._input.LA(1) === '/'.charCodeAt(0)) {
                    if (this._input.LA(2) === '/'.charCodeAt(0)) {
                        this._inLineComment = true;
                        this._input.consume(); // consume first /
                        this._input.consume(); // consume second /
                        this._currentColumn += 2;
                        return this.nextToken();
                    }
                    if (this._input.LA(2) === '*'.charCodeAt(0)) {
                        this._inBlockComment = true;
                        this._input.consume(); // consume /
                        this._input.consume(); // consume *
                        this._currentColumn += 2;
                        return this.nextToken();
                    }
                }

                if (this._input.LA(1) === ' '.charCodeAt(0)) {
                    spaces++;
                    hasSpaces = true;
                } else if (this._input.LA(1) === '\t'.charCodeAt(0)) {
                    // Convert tab to 4 spaces (Python standard)
                    spaces += 4;
                    hasTabs = true;
                }
                
                // Throw error if we detect mixed indentation (Python behavior)
                if (hasSpaces && hasTabs) {
                    throw new Error('Mixed tabs and spaces are not allowed for indentation');
                }

                // Set indentation type if not already set
                if (this._indentType === null) {
                    this._indentType = hasSpaces ? 'space' : 'tab';
                } else if ((this._indentType === 'space' && hasTabs) || 
                          (this._indentType === 'tab' && hasSpaces)) {
                    throw new Error('Mixed tabs and spaces are not allowed for indentation');
                }

                this._input.consume();
                this._currentColumn++;
            }

            // If we have indentation
            if (spaces > 0) {
                // Check if indentation is a multiple of 4
                if (spaces % 4 !== 0) {
                    throw new Error('Indentation must be a multiple of 4 spaces');
                }

                const currentIndent = spaces;
                const lastIndent = this._indentStack[this._indentStack.length - 1];

                if (currentIndent > lastIndent) {
                    // New indentation level
                    this._indentStack.push(currentIndent);
                    this._atLineStart = false;
                    return this.createToken(TokenTypes.INDENT, '    ');
                } else if (currentIndent < lastIndent) {
                    // Dedent - possibly multiple levels
                    while (this._indentStack[this._indentStack.length - 1] > currentIndent) {
                        this._indentStack.pop();
                        this._pendingDedents++;
                    }
                    if (this._indentStack[this._indentStack.length - 1] !== currentIndent) {
                        throw new Error('Inconsistent indentation');
                    }
                    this._atLineStart = false;
                    return this.createToken(TokenTypes.DEDENT, '');
                }
            }
            this._atLineStart = false;
        }

        // Skip whitespace within lines
        while (this._input.LA(1) === ' '.charCodeAt(0) || 
               this._input.LA(1) === '\t'.charCodeAt(0)) {
            this._input.consume();
            this._currentColumn++;
        }

        // Handle newlines
        if (this._input.LA(1) === '\n'.charCodeAt(0)) {
            return this.handleNewline();
        }

        // Try to match a keyword or identifier
        if (this.isAlpha(this._input.LA(1))) {
            return this.handleWord();
        }

        // Handle string literals
        if (this._input.LA(1) === '"'.charCodeAt(0)) {
            return this.handleString();
        }

        // Handle operators
        if (this._input.LA(1) === '('.charCodeAt(0)) {
            this._input.consume();
            this._currentColumn++;
            return this.createToken(TokenTypes.LPAREN, '(');
        }
        if (this._input.LA(1) === ')'.charCodeAt(0)) {
            this._input.consume();
            this._currentColumn++;
            return this.createToken(TokenTypes.RPAREN, ')');
        }

        // Skip unrecognized characters
        this._input.consume();
        this._currentColumn++;
        return this.nextToken();
    }

    private isAlpha(c: number): boolean {
        return (c >= 'a'.charCodeAt(0) && c <= 'z'.charCodeAt(0)) ||
               (c >= 'A'.charCodeAt(0) && c <= 'Z'.charCodeAt(0));
    }

    private handleWord(): Token {
        const start = this._input.index;
        const startColumn = this._currentColumn;
        let text = '';

        while (this.isAlpha(this._input.LA(1))) {
            text += String.fromCharCode(this._input.LA(1));
            this._input.consume();
            this._currentColumn++;
        }

        // Check if it's a keyword
        const tokenType = CPGLLexer.KEYWORDS.get(text.toLowerCase());
        if (tokenType !== undefined) {
            return this.createToken(tokenType, text, start, startColumn);
        }

        return this.createToken(TokenTypes.STRING, text, start, startColumn);
    }

    private handleString(): Token {
        const start = this._input.index;
        const startColumn = this._currentColumn;
        let text = '';

        // Consume opening quote
        this._input.consume();
        this._currentColumn++;

        while (this._input.LA(1) !== Token.EOF && this._input.LA(1) !== '"'.charCodeAt(0)) {
            // Handle escaped quotes
            if (this._input.LA(1) === '\\'.charCodeAt(0) && this._input.LA(2) === '"'.charCodeAt(0)) {
                text += '\\"';
                this._input.consume(); // consume backslash
                this._input.consume(); // consume quote
                this._currentColumn += 2;
                continue;
            }

            text += String.fromCharCode(this._input.LA(1));
            this._input.consume();
            this._currentColumn++;
        }

        // Consume closing quote if present
        if (this._input.LA(1) === '"'.charCodeAt(0)) {
            this._input.consume();
            this._currentColumn++;
        }

        return this.createToken(TokenTypes.STRING, `"${text}"`, start, startColumn);
    }

    private handleNewline(): Token {
        const token = this.createToken(TokenTypes.NEWLINE, '\n');
        this._input.consume();
        this._currentLine++;
        this._currentColumn = 0;
        this._atLineStart = true;
        return token;
    }

    private createToken(type: number, text: string, start?: number, startColumn?: number): Token {
        return new CPGLToken(
            type,
            text,
            this._currentLine,
            startColumn ?? this._currentColumn,
            Token.DEFAULT_CHANNEL,
            this._tokenIndex++,
            start ?? this._input.index,
            (start ?? this._input.index) + text.length - 1,
            [this._input, this]
        );
    }
}
