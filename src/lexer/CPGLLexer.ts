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
    private _pendingTokens: Token[] = [];
    private _indentType: 'space' | 'tab' | null = null;
    private _inLineComment: boolean = false;
    private _inBlockComment: boolean = false;
    private _blockCommentNestingLevel = 0;
    private _lastNonWhitespaceToken: number | null = null;
    private _lastTokenWasNewline: boolean = false;
    private _lastTokenType: number = -1;
    private _currentIndent: number = 0;
    private _pendingNewline: boolean = false;
    private _emptyLineIndent: number | null = null;
    private _currentIndentLevel = 0;
    private _isInCasefeatureBlock = false;
    private _isInActionBlock = false;

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

    // Valid FHIR types for actions
    private static readonly VALID_ACTION_FHIR_TYPES = new Set([
        'Appointment', 'AppointmentResponse', 'CarePlan', 'Claim',
        'CommunicationRequest', 'Contract', 'DeviceRequest', 'EnrollmentRequest',
        'ImmunizationRecommendation', 'MedicationRequest', 'NutritionOrder',
        'ServiceRequest', 'SupplyRequest', 'Task', 'VisionPrescription'
    ]);

    // Valid FHIR types for casefeatures
    private static readonly VALID_CASEFEATURE_FHIR_TYPES = new Set([
        'AllergyIntolerance', 'Condition', 'Procedure', 'Observation',
        'Immunization', 'MedicationDispense', 'MedicationAdministration',
        'MedicationStatement'
    ]);

    // Valid FHIR value types for casefeatures
    private static readonly VALID_FHIR_VALUE_TYPES = new Set([
        'Quantity',
        'CodeableConcept',
        'string',
        'boolean',
        'integer',
        'Range',
        'Ratio',
        'SampledData',
        'time',
        'dateTime',
        'Period',
        'Attachment',
        'Reference(MolecularSequence)'
    ]);

    constructor(input: CharStream) {
        super(input);
    }

    public nextToken(): Token {
        while (true) {
            // Return any pending tokens first
            if (this._pendingTokens.length > 0) {
                const token = this._pendingTokens.shift()!;
                this._lastTokenType = token.type;  // Track last token type
                return token;
            }

            const c = this._input.LA(1);

            // Handle EOF
            if (c === Token.EOF) {
                // Handle any remaining indentation
                while (this._indentStack.length > 1) {
                    this._indentStack.pop();
                    this._pendingTokens.push(this.createToken(TokenTypes.DEDENT, ''));
                }
                if (this._pendingTokens.length > 0) {
                    return this._pendingTokens.shift()!;
                }
                return this.createToken(TokenTypes.EOF, '<EOF>');
            }

            // Handle block comments
            if (this._inBlockComment) {
                if (c === '*'.charCodeAt(0) && this._input.LA(2) === '/'.charCodeAt(0)) {
                    this._blockCommentNestingLevel--;
                    if (this._blockCommentNestingLevel === 0) {
                        this._inBlockComment = false;
                        this._input.consume();  // consume *
                        this._input.consume();  // consume /
                        continue;
                    }
                } else if (c === '/'.charCodeAt(0) && this._input.LA(2) === '*'.charCodeAt(0)) {
                    this._blockCommentNestingLevel++;
                    this._input.consume();  // consume /
                    this._input.consume();  // consume *
                    continue;
                }
                this._input.consume();
                if (c === '\n'.charCodeAt(0)) {
                    this._currentLine++;
                    this._currentColumn = 0;
                    this._atLineStart = true;
                } else {
                    this._currentColumn++;
                }
                continue;
            }

            // Handle line comments
            if (c === '/'.charCodeAt(0) && this._input.LA(2) === '/'.charCodeAt(0)) {
                while (this._input.LA(1) !== '\n'.charCodeAt(0) && this._input.LA(1) !== Token.EOF) {
                    this._input.consume();
                    this._currentColumn++;
                }
                continue;
            }

            // Start of block comment
            if (c === '/'.charCodeAt(0) && this._input.LA(2) === '*'.charCodeAt(0)) {
                this._inBlockComment = true;
                this._blockCommentNestingLevel = 1;
                this._input.consume();  // consume /
                this._input.consume();  // consume *
                this._currentColumn += 2;
                continue;
            }

            // Handle whitespace and indentation
            if (this.isWhitespace(c)) {
                if (c === '\n'.charCodeAt(0)) {
                    this._input.consume();
                    this._currentLine++;
                    this._currentColumn = 0;
                    this._atLineStart = true;

                    // Count indentation
                    let spaces = 0;
                    let nextChar = this._input.LA(1);

                    while (nextChar === ' '.charCodeAt(0) || nextChar === '\t'.charCodeAt(0) || nextChar === '\n'.charCodeAt(0)) {
                        if (nextChar === '\t'.charCodeAt(0)) {
                            throw new Error('Tabs are not allowed for indentation');
                        }
                        if (nextChar === '\n'.charCodeAt(0)) {
                            this._input.consume();
                            this._currentLine++;
                            this._currentColumn = 0;
                            spaces = 0;
                        } else {
                            spaces++;
                            this._input.consume();
                            this._currentColumn++;
                        }
                        nextChar = this._input.LA(1);
                    }

                    // Skip empty lines or lines with only comments
                    if (nextChar === '\n'.charCodeAt(0) || nextChar === Token.EOF ||
                        (nextChar === '/'.charCodeAt(0) && 
                         (this._input.LA(2) === '/'.charCodeAt(0) || this._input.LA(2) === '*'.charCodeAt(0)))) {
                        if (!this._lastTokenWasNewline) {
                            this._pendingTokens.push(this.createToken(TokenTypes.NEWLINE, '\n'));
                            this._lastTokenWasNewline = true;
                        }
                        this._emptyLineIndent = spaces;
                        continue;
                    }

                    // Check if indentation is a multiple of 4
                    if (spaces % 4 !== 0) {
                        throw new Error('Indentation must be a multiple of 4 spaces');
                    }

                    this._currentIndent = spaces;
                    const previousIndent = this._indentStack[this._indentStack.length - 1];

                    if (!this._lastTokenWasNewline) {
                        this._pendingTokens.push(this.createToken(TokenTypes.NEWLINE, '\n'));
                    }

                    if (this._currentIndent > previousIndent) {
                        this._indentStack.push(this._currentIndent);
                        this._pendingTokens.push(this.createToken(TokenTypes.INDENT, '    '));
                    } else if (this._currentIndent < previousIndent) {
                        while (this._indentStack.length > 1 && this._indentStack[this._indentStack.length - 1] > this._currentIndent) {
                            this._indentStack.pop();
                            this._pendingTokens.push(this.createToken(TokenTypes.DEDENT, ''));
                        }
                        if (this._indentStack[this._indentStack.length - 1] !== this._currentIndent) {
                            throw new Error('Invalid dedent level');
                        }
                    }

                    if (this._pendingTokens.length > 0) {
                        this._lastTokenWasNewline = true;
                        return this._pendingTokens.shift()!;
                    }
                    continue;
                } else {
                    this._input.consume();
                    this._currentColumn++;
                    continue;
                }
            }

            this._lastTokenWasNewline = false;

            // Handle identifiers and keywords
            if (this.isAlpha(c)) {
                return this.handleWord();
            }

            // Handle string literals
            if (c === '"'.charCodeAt(0)) {
                return this.handleString();
            }

            // Handle parentheses
            if (c === '('.charCodeAt(0)) {
                this._input.consume();
                this._currentColumn++;
                return this.createToken(TokenTypes.LPAREN, '(');
            }
            if (c === ')'.charCodeAt(0)) {
                this._input.consume();
                this._currentColumn++;
                return this.createToken(TokenTypes.RPAREN, ')');
            }

            // Handle invalid characters
            throw new Error(`Invalid character: ${String.fromCharCode(c)}`);
        }
    }

    private handleWord(): Token {
        const start = this._input.index;
        const startColumn = this._currentColumn;
        let text = '';

        while (this._input.LA(1) !== -1 && this.isWordChar(this._input.LA(1))) {
            text += String.fromCharCode(this._input.LA(1));
            this._input.consume();
            this._currentColumn++;
        }

        const tokenType = this.getTokenType(text);
        if (tokenType) {
            // Update context tracking
            if (tokenType === TokenTypes.CASEFEATURE) {
                this._isInCasefeatureBlock = true;
            } else if (tokenType === TokenTypes.ACTION) {
                this._isInActionBlock = true;
            } else if (tokenType === TokenTypes.DEDENT && this._currentIndentLevel === 0) {
                this._isInCasefeatureBlock = false;
                this._isInActionBlock = false;
            } else if (this._isInActionBlock && (tokenType === TokenTypes.DO || tokenType === TokenTypes.USE)) {
                throw new Error('Actions cannot have do or use clauses');
            }

            if (tokenType === TokenTypes.FHIRTYPE || tokenType === TokenTypes.VALUETYPE) {
                // Consume whitespace after fhirtype/valuetype
                while (this._input.LA(1) !== -1 && this.isWhitespace(this._input.LA(1))) {
                    this._input.consume();
                    this._currentColumn++;
                }

                // Get the FHIR type name
                let fhirType = '';
                const typeStart = this._input.index;
                const typeStartColumn = this._currentColumn;

                while (this._input.LA(1) !== -1 && this.isWordChar(this._input.LA(1))) {
                    fhirType += String.fromCharCode(this._input.LA(1));
                    this._input.consume();
                    this._currentColumn++;
                }

                if (fhirType) {
                    if (tokenType === TokenTypes.FHIRTYPE) {
                        // Check if we're in action or casefeature context
                        if (this._isInActionBlock) {
                            if (!CPGLLexer.VALID_ACTION_FHIR_TYPES.has(fhirType)) {
                                throw new Error(`Invalid action FHIR type: ${fhirType}`);
                            }
                            this._lastNonWhitespaceToken = TokenTypes.ACTION_FHIR_TYPE;
                            this._pendingTokens.push(this.createToken(TokenTypes.ACTION_FHIR_TYPE, fhirType, typeStart, typeStartColumn));
                            return this.createToken(tokenType, text, start, startColumn);
                        } else if (this._isInCasefeatureBlock) {
                            if (!CPGLLexer.VALID_CASEFEATURE_FHIR_TYPES.has(fhirType)) {
                                throw new Error(`Invalid casefeature FHIR type: ${fhirType}`);
                            }
                            this._lastNonWhitespaceToken = TokenTypes.CASEFEATURE_FHIR_TYPE;
                            this._pendingTokens.push(this.createToken(TokenTypes.CASEFEATURE_FHIR_TYPE, fhirType, typeStart, typeStartColumn));
                            return this.createToken(tokenType, text, start, startColumn);
                        } else {
                            throw new Error('FHIR type must be used in action or casefeature context');
                        }
                    } else if (tokenType === TokenTypes.VALUETYPE) {
                        // Handle FHIR value types in casefeature context
                        if (!this._isInCasefeatureBlock) {
                            throw new Error('Value type must be used in casefeature context');
                        }
                        if (!CPGLLexer.VALID_FHIR_VALUE_TYPES.has(fhirType)) {
                            throw new Error(`Invalid FHIR value type: ${fhirType}`);
                        }
                        this._lastNonWhitespaceToken = TokenTypes.FHIR_VALUE_TYPE;
                        this._pendingTokens.push(this.createToken(TokenTypes.FHIR_VALUE_TYPE, fhirType, typeStart, typeStartColumn));
                        return this.createToken(tokenType, text, start, startColumn);
                    }
                } else {
                    throw new Error(`${text} must be followed by a valid type name`);
                }
            }
            this._lastNonWhitespaceToken = tokenType;
            return this.createToken(tokenType, text, start, startColumn);
        }

        // All other words are treated as strings, including FHIR type names when not following fhirtype/valuetype
        this._lastNonWhitespaceToken = TokenTypes.STRING;
        return this.createToken(TokenTypes.STRING, text, start, startColumn);
    }

    private handleString(): Token {
        const start = this._input.index;
        const startColumn = this._currentColumn;
        let text = '"';

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
            } else {
                text += String.fromCharCode(this._input.LA(1));
                this._input.consume();
                this._currentColumn++;
            }
        }

        // Check for unterminated string
        if (this._input.LA(1) === Token.EOF) {
            throw new Error('Unterminated string literal');
        }

        // Consume closing quote
        text += '"';
        this._input.consume();
        this._currentColumn++;

        this._lastNonWhitespaceToken = TokenTypes.STRING;
        return this.createToken(TokenTypes.STRING, text, start, startColumn);
    }

    private createToken(type: number, text: string, start?: number, startColumn?: number): Token {
        const token = new CPGLToken(
            type,
            text,
            this._currentLine,
            startColumn ?? this._currentColumn,
            0, // default channel
            this._tokenIndex++,
            start ?? this._input.index,
            this._input.index,
            [this._input, this]
        );
        return token;
    }

    private isWhitespace(c: number): boolean {
        return c === ' '.charCodeAt(0) || c === '\t'.charCodeAt(0) || c === '\n'.charCodeAt(0) || c === '\r'.charCodeAt(0);
    }

    private isAlpha(c: number): boolean {
        return (c >= 'a'.charCodeAt(0) && c <= 'z'.charCodeAt(0)) ||
               (c >= 'A'.charCodeAt(0) && c <= 'Z'.charCodeAt(0)) ||
               c === '_'.charCodeAt(0);
    }

    private isDigit(c: number): boolean {
        return c >= '0'.charCodeAt(0) && c <= '9'.charCodeAt(0);
    }

    private isWordChar(c: number): boolean {
        return this.isAlpha(c) || this.isDigit(c) || c === '_'.charCodeAt(0);
    }

    public getTokenType(tokenName: string): number {
        const lowerText = tokenName.toLowerCase();
        return CPGLLexer.KEYWORDS.get(lowerText) || TokenTypes.STRING;
    }
}
