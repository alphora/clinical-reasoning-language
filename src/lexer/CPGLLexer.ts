import type { CharStream } from 'antlr4ts/CharStream';
import { Lexer } from 'antlr4ts/Lexer';
import { Token } from 'antlr4ts/Token';

import { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';

import { CPGLToken } from './CPGLToken';

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
  public static readonly vocabulary = GeneratedLexer.VOCABULARY;
  public static readonly grammarFileName = 'CPGLCustomLexer';

  // Standard tokens for testing - these would normally be generated from an ANTLR grammar
  private readonly TOKEN_RULES: Map<string, number> = new Map([
    ['decision', GeneratedLexer.DECISION],
    ['when', GeneratedLexer.WHEN],
    ['then', GeneratedLexer.THEN],
    ['do', GeneratedLexer.DO],
    ['use', GeneratedLexer.USE],
    ['action', GeneratedLexer.ACTION],
    ['fhirtype', GeneratedLexer.FHIRTYPE],
    ['casefeature', GeneratedLexer.CASEFEATURE],
    ['valuetype', GeneratedLexer.VALUETYPE],
    ['casefeaturecode', GeneratedLexer.CASEFEATURECODE],
    ['profileurl', GeneratedLexer.PROFILEURL],
    ['any', GeneratedLexer.ANY],
    ['all', GeneratedLexer.ALL],
  ]);

  private readonly ACTION_FHIR_TYPES: Set<string> = new Set([
    'Appointment',
    'AppointmentResponse',
    'CarePlan',
    'Claim',
    'CommunicationRequest',
    'Contract',
    'DeviceRequest',
    'EnrollmentRequest',
    'ImmunizationRecommendation',
    'MedicationRequest',
    'NutritionOrder',
    'ServiceRequest',
    'SupplyRequest',
    'Task',
    'VisionPrescription'
  ]);

  private readonly CASEFEATURE_FHIR_TYPES: Set<string> = new Set([
    'AllergyIntolerance',
    'Condition',
    'Procedure',
    'Observation',
    'Immunization',
    'MedicationDispense',
    'MedicationAdministration',
    'MedicationStatement'
  ]);

  private readonly FHIR_VALUE_TYPES: Set<string> = new Set([
    'base64Binary',
    'boolean',
    'canonical',
    'code',
    'date',
    'dateTime',
    'decimal',
    'id',
    'instant',
    'integer',
    'markdown',
    'oid',
    'positiveInt',
    'string',
    'time',
    'unsignedInt',
    'uri',
    'url',
    'uuid',
    'xhtml'
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

  public get vocabulary(): typeof GeneratedLexer.VOCABULARY {
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

  private handlePendingTokens(): Token | null {
    if (this.pendingTokens.length > 0) {
      return this.pendingTokens.shift()!;
    }
    return null;
  }

  private handleEOF(): Token {
    this.generateDedentTokens();
    
    if (this.pendingTokens.length > 0) {
      return this.pendingTokens.shift()!;
    }

    return this.createToken({
      type: Token.EOF,
      text: '<EOF>',
      startIndex: this._input.index,
      stopIndex: this._input.index,
      line: this._currentLine,
      charPositionInLine: this._currentColumn,
      channel: Token.DEFAULT_CHANNEL,
      tokenIndex: this._tokenIndex++,
      source: [this._input, this],
    });
  }

  private generateDedentTokens(): void {
    while (this.indentationStack.length > 1) {
      this.indentationStack.pop();
      const dedentToken = this.createToken({
        type: GeneratedLexer.DEDENT,
        text: '',
        startIndex: this._input.index,
        stopIndex: this._input.index,
        line: this._currentLine,
        charPositionInLine: this._currentColumn,
        channel: Token.DEFAULT_CHANNEL,
        tokenIndex: this._tokenIndex++,
        source: [this._input, this],
      });
      this.pendingTokens.push(dedentToken);
    }
  }

  private skipWhitespace(): void {
    while (this._input.LA(1) === ' '.charCodeAt(0) || this._input.LA(1) === '\t'.charCodeAt(0)) {
      this._input.consume();
      this._currentColumn++;
    }
  }

  private handleTopLevelKeyword(token: Token): Token {
    if (token.type === GeneratedLexer.ACTION ||
        token.type === GeneratedLexer.CASEFEATURE ||
        token.type === GeneratedLexer.DECISION) {
      this.generateDedentTokens();
    }
    return token;
  }

  private handleTokenStart(): Token | null {
    // Handle pending tokens
    const pendingToken = this.handlePendingTokens();
    if (pendingToken) {
      return pendingToken;
    }

    // Handle line start
    if (this.atStartOfLine) {
      const lineStartToken = this.handleLineStart();
      if (lineStartToken) {
        return lineStartToken;
      }
    }

    // Skip whitespace
    this.skipWhitespace();

    return null;
  }

  private handleTokenContent(): Token | null {
    // Check for EOF
    if (this._input.LA(1) === -1) {
      return this.handleEOF();
    }

    // Handle newlines
    if (this._input.LA(1) === '\n'.charCodeAt(0) || this._input.LA(1) === '\r'.charCodeAt(0)) {
      return this.handleNewline();
    }

    // Handle comments
    if (this._input.LA(1) === '/'.charCodeAt(0)) {
      if (this._input.LA(2) === '/'.charCodeAt(0)) {
        const commentToken = this.handleSingleLineComment();
        if (commentToken) {
          return commentToken;
        }
        return this.nextToken();
      } else if (this._input.LA(2) === '*'.charCodeAt(0)) {
        const commentToken = this.handleBlockComment();
        if (commentToken) {
          return commentToken;
        }
        return this.nextToken();
      }
    }

    // Handle string literals
    if (this._input.LA(1) === '"'.charCodeAt(0)) {
      return this.handleStringLiteral();
    }

    // Handle identifiers and keywords
    if (this.isAlpha(this._input.LA(1))) {
      const token = this.handleIdentifier();
      return this.handleTopLevelKeyword(token);
    }

    return null;
  }

  /**
   * Get the next token from the input stream
   * Handles indentation tracking and token generation
   */
  public nextToken(): Token {
    // Handle token start (pending tokens, line start, whitespace)
    const startToken = this.handleTokenStart();
    if (startToken) {
      return startToken;
    }

    // Handle token content
    const contentToken = this.handleTokenContent();
    if (contentToken) {
      return contentToken;
    }

    // Handle invalid characters
    return this.handleError();
  }

  private handleLineStart(): Token | null {
    if (!this.atStartOfLine) {
      return null;
    }

    this.atStartOfLine = false;
    this.currentIndent = 0;

    // Count indentation
    while (this._input.LA(1) === ' '.charCodeAt(0) || this._input.LA(1) === '\t'.charCodeAt(0)) {
      this._input.consume();
      this.currentIndent++;
      this._currentColumn++;
    }

    // Check for non-multiple-of-4 indentation
    if (this.currentIndent % 4 !== 0) {
      throw new Error('Inconsistent indentation');
    }

    // Handle indentation
    const lastIndent = this.indentationStack[this.indentationStack.length - 1];
    if (this.currentIndent > lastIndent) {
      // Check for inconsistent indentation
      if (this.currentIndent - lastIndent !== 4) {
        throw new Error('Inconsistent indentation');
      }
      this.indentationStack.push(this.currentIndent);
      return this.createToken({
        type: GeneratedLexer.INDENT,
        text: '    ',
        startIndex: this._input.index - this.currentIndent,
        stopIndex: this._input.index - 1,
        line: this._currentLine,
        charPositionInLine: 0,
        channel: Token.DEFAULT_CHANNEL,
        tokenIndex: this._tokenIndex++,
        source: [this._input, this],
      });
    } else if (this.currentIndent < lastIndent) {
      // Find the matching indentation level
      const matchingIndex = this.indentationStack.indexOf(this.currentIndent);
      if (matchingIndex === -1) {
        throw new Error('Inconsistent indentation');
      }

      // Generate DEDENT tokens for each level of indentation we're dedenting
      const dedentCount = this.indentationStack.length - matchingIndex - 1;
      for (let i = 0; i < dedentCount; i++) {
        this.indentationStack.pop();
        const dedentToken = this.createToken({
          type: GeneratedLexer.DEDENT,
          text: '',
          startIndex: this._input.index,
          stopIndex: this._input.index,
          line: this._currentLine,
          charPositionInLine: this._currentColumn,
          channel: Token.DEFAULT_CHANNEL,
          tokenIndex: this._tokenIndex++,
          source: [this._input, this],
        });
        this.pendingTokens.push(dedentToken);
      }

      // Return the first DEDENT token if we generated any
      if (this.pendingTokens.length > 0) {
        return this.pendingTokens.shift()!;
      }
    }

    return null;
  }

  private handleNewline(): Token {
    // Consume the newline character(s)
    if (this._input.LA(1) === '\r'.charCodeAt(0)) {
      this._input.consume();
      this._currentColumn = 0;
    }
    this._input.consume();
    this._currentLine++;
    this._currentColumn = 0;
    this.atStartOfLine = true;

    return this.createToken({
      type: GeneratedLexer.NEWLINE,
      text: '\n',
      startIndex: this._input.index - 1,
      stopIndex: this._input.index - 1,
      line: this._currentLine - 1,
      charPositionInLine: this._currentColumn,
      channel: Token.DEFAULT_CHANNEL,
      tokenIndex: this._tokenIndex++,
      source: [this._input, this],
    });
  }

  private handleSingleLineComment(): Token | null {
    // Consume the // characters
    this._input.consume();
    this._input.consume();
    this._currentColumn += 2;

    // Consume the comment but stop before newline
    while (this._input.LA(1) !== -1 && this._input.LA(1) !== '\n'.charCodeAt(0) && this._input.LA(1) !== '\r'.charCodeAt(0)) {
      this._input.consume();
      this._currentColumn++;
    }

    // Consume the newline
    if (this._input.LA(1) === '\r'.charCodeAt(0)) {
      this._input.consume();
      if (this._input.LA(1) === '\n'.charCodeAt(0)) {
        this._input.consume();
      }
    } else if (this._input.LA(1) === '\n'.charCodeAt(0)) {
      this._input.consume();
    }
    this._currentLine++;
    this._currentColumn = 0;
    this.atStartOfLine = true;

    // Return null to skip the comment
    return null;
  }

  private handleNewlineInComment(): void {
    if (this._input.LA(1) === '\n'.charCodeAt(0)) {
      this._input.consume();
      this._currentLine++;
      this._currentColumn = 0;
      this.atStartOfLine = true;
    } else if (this._input.LA(1) === '\r'.charCodeAt(0)) {
      this._input.consume();
      if (this._input.LA(1) === '\n'.charCodeAt(0)) {
        this._input.consume();
      }
      this._currentLine++;
      this._currentColumn = 0;
      this.atStartOfLine = true;
    } else {
      this._input.consume();
      this._currentColumn++;
    }
  }

  private handleBlockCommentNesting(): number {
    let nesting = 1;
    if (this._input.LA(1) === '/'.charCodeAt(0) && this._input.LA(2) === '*'.charCodeAt(0)) {
      nesting++;
      this._input.consume();
      this._input.consume();
      this._currentColumn += 2;
    } else if (this._input.LA(1) === '*'.charCodeAt(0) && this._input.LA(2) === '/'.charCodeAt(0)) {
      nesting--;
      this._input.consume();
      this._input.consume();
      this._currentColumn += 2;
    } else {
      this.handleNewlineInComment();
    }
    return nesting;
  }

  private handleBlockComment(): Token | null {
    // Consume the /* characters
    this._input.consume();
    this._input.consume();
    this._currentColumn += 2;

    let nesting = 1;

    // Consume the comment content
    while (nesting > 0 && this._input.LA(1) !== -1) {
      nesting = this.handleBlockCommentNesting();
    }

    // Consume the newline after the block comment
    if (this._input.LA(1) === '\r'.charCodeAt(0)) {
      this._input.consume();
      if (this._input.LA(1) === '\n'.charCodeAt(0)) {
        this._input.consume();
      }
      this._currentLine++;
      this._currentColumn = 0;
      this.atStartOfLine = true;
    } else if (this._input.LA(1) === '\n'.charCodeAt(0)) {
      this._input.consume();
      this._currentLine++;
      this._currentColumn = 0;
      this.atStartOfLine = true;
    }

    // Return null to skip the comment
    return null;
  }

  private handleStringLiteral(): Token {
    // Consume the opening quote
    this._input.consume();
    this._currentColumn++;

    const startIndex = this._input.index;
    let text = '"';

    // Consume the string content
    while (this._input.LA(1) !== -1 && this._input.LA(1) !== '"'.charCodeAt(0)) {
      if (this._input.LA(1) === '\\'.charCodeAt(0)) {
        this._input.consume();
        this._currentColumn++;
        text += '\\';
      }
      text += String.fromCharCode(this._input.LA(1));
      this._input.consume();
      this._currentColumn++;
    }

    // Consume the closing quote
    if (this._input.LA(1) === '"'.charCodeAt(0)) {
      this._input.consume();
      this._currentColumn++;
      text += '"';
    }

    return this.createToken({
      type: GeneratedLexer.STRING,
      text,
      startIndex,
      stopIndex: this._input.index - 1,
      line: this._currentLine,
      charPositionInLine: this._currentColumn - text.length,
      channel: Token.DEFAULT_CHANNEL,
      tokenIndex: this._tokenIndex++,
      source: [this._input, this],
    });
  }

  private handleIdentifier(): Token {
    const startIndex = this._input.index;
    let text = '';

    // Consume the identifier
    while (this.isAlpha(this._input.LA(1)) || this.isDigit(this._input.LA(1))) {
      text += String.fromCharCode(this._input.LA(1));
      this._input.consume();
      this._currentColumn++;
    }

    // Check if it's a keyword
    if (this.TOKEN_RULES.has(text)) {
      return this.createToken({
        type: this.TOKEN_RULES.get(text)!,
        text,
        startIndex,
        stopIndex: this._input.index - 1,
        line: this._currentLine,
        charPositionInLine: this._currentColumn - text.length,
        channel: Token.DEFAULT_CHANNEL,
        tokenIndex: this._tokenIndex++,
        source: [this._input, this],
      });
    }

    // Check if it's an ACTION_FHIR_TYPE
    if (this.ACTION_FHIR_TYPES.has(text)) {
      return this.createToken({
        type: GeneratedLexer.ACTION_FHIR_TYPE,
        text,
        startIndex,
        stopIndex: this._input.index - 1,
        line: this._currentLine,
        charPositionInLine: this._currentColumn - text.length,
        channel: Token.DEFAULT_CHANNEL,
        tokenIndex: this._tokenIndex++,
        source: [this._input, this],
      });
    }

    // Check if it's a CASEFEATURE_FHIR_TYPE
    if (this.CASEFEATURE_FHIR_TYPES.has(text)) {
      return this.createToken({
        type: GeneratedLexer.CASEFEATURE_FHIR_TYPE,
        text,
        startIndex,
        stopIndex: this._input.index - 1,
        line: this._currentLine,
        charPositionInLine: this._currentColumn - text.length,
        channel: Token.DEFAULT_CHANNEL,
        tokenIndex: this._tokenIndex++,
        source: [this._input, this],
      });
    }

    // Check if it's a FHIR_VALUE_TYPE
    if (this.FHIR_VALUE_TYPES.has(text)) {
      return this.createToken({
        type: GeneratedLexer.FHIR_VALUE_TYPE,
        text,
        startIndex,
        stopIndex: this._input.index - 1,
        line: this._currentLine,
        charPositionInLine: this._currentColumn - text.length,
        channel: Token.DEFAULT_CHANNEL,
        tokenIndex: this._tokenIndex++,
        source: [this._input, this],
      });
    }

    // If it's not any of the above, it's an error
    return this.createToken({
      type: GeneratedLexer.ERROR,
      text,
      startIndex,
      stopIndex: this._input.index - 1,
      line: this._currentLine,
      charPositionInLine: this._currentColumn - text.length,
      channel: Token.DEFAULT_CHANNEL,
      tokenIndex: this._tokenIndex++,
      source: [this._input, this],
    });
  }

  private handleError(): Token {
    const startIndex = this._input.index;
    const text = String.fromCharCode(this._input.LA(1));
    this._input.consume();
    this._currentColumn++;

    return this.createToken({
      type: GeneratedLexer.ERROR,
      text,
      startIndex,
      stopIndex: this._input.index - 1,
      line: this._currentLine,
      charPositionInLine: this._currentColumn - 1,
      channel: Token.DEFAULT_CHANNEL,
      tokenIndex: this._tokenIndex++,
      source: [this._input, this],
    });
  }

  private isAlpha(c: number): boolean {
    return (c >= 'a'.charCodeAt(0) && c <= 'z'.charCodeAt(0)) ||
           (c >= 'A'.charCodeAt(0) && c <= 'Z'.charCodeAt(0));
  }

  private isDigit(c: number): boolean {
    return c >= '0'.charCodeAt(0) && c <= '9'.charCodeAt(0);
  }

  private createToken(options: {
    type: number;
    text: string;
    startIndex: number;
    stopIndex: number;
    line: number;
    charPositionInLine: number;
    channel: number;
    tokenIndex: number;
    source: [CharStream, Lexer];
  }): Token {
    return new CPGLToken(options);
  }
}
