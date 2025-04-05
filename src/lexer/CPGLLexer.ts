import type { CharStream } from 'antlr4ts/CharStream';
import { Lexer } from 'antlr4ts/Lexer';
import { Interval } from 'antlr4ts/misc/Interval';
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
    ['code', GeneratedLexer.CODE],
    ['url', GeneratedLexer.URL],
    ['valuetype', GeneratedLexer.VALUETYPE],
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

  /**
   * Get the next token from the input stream
   * Handles indentation tracking and token generation
   */
  public nextToken(): Token {
    // Handle pending tokens first
    const pendingToken = this.handlePendingTokens();
    if (pendingToken) return pendingToken;

    // Handle EOF
    const eofToken = this.handleEOF();
    if (eofToken) return eofToken;

    // Handle line start
    if (this.atStartOfLine) {
      const indentationToken = this.handleLineStart();
      if (indentationToken) return indentationToken;
    } else {
      this.skipWhitespace();
    }

    // Handle EOF after whitespace
    const eofAfterWhitespaceToken = this.handleEOF();
    if (eofAfterWhitespaceToken) return eofAfterWhitespaceToken;

    // Handle comments
    if (this.isCommentStart()) {
      return this.handleComment();
    }

    // Handle newlines
    if (this.isNewline()) {
      return this.handleNewline();
    }

    // Handle string literals
    if (this.isStringLiteral()) {
      return this.handleStringLiteral();
    }

    // Handle identifiers and keywords
    if (this.isAlpha(this._input.LA(1))) {
      return this.handleIdentifier();
    }

    // Handle invalid characters
    return this.handleError();
  }

  private handlePendingTokens(): Token | null {
    if (this.pendingTokens.length > 0) {
      const token = this.pendingTokens.shift();
      return token || null;
    }
    return null;
  }

  private handleEOF(): Token | null {
    if (this._input.LA(1) === -1) {
      if (this.indentationStack.length > 1) {
        this.indentationStack.pop();
        return this.createToken({
          type: GeneratedLexer.DEDENT,
          text: '<DEDENT>',
          startIndex: this._input.index,
          stopIndex: this._input.index,
          line: this._currentLine,
          charPositionInLine: this._currentColumn,
          channel: Token.DEFAULT_CHANNEL,
          tokenIndex: this._tokenIndex++,
          source: [this._input, this],
        });
      }
      if (this.indentationStack.length === 1) {
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
    }
    return null;
  }

  private handleLineStart(): Token | null {
    this.atStartOfLine = false;
    let whitespaceCount = 0;

    while (this._input.LA(1) === ' '.charCodeAt(0)) {
      whitespaceCount++;
      this._input.consume();
      this._currentColumn++;
    }

    this.currentIndent = whitespaceCount;
    const lastIndent = this.indentationStack[this.indentationStack.length - 1];

    if (this.currentIndent > lastIndent) {
      this.indentationStack.push(this.currentIndent);
      return this.createToken({
        type: GeneratedLexer.INDENT,
        text: '<INDENT>',
        startIndex: this._input.index - whitespaceCount,
        stopIndex: this._input.index,
        line: this._currentLine,
        charPositionInLine: this._currentColumn,
        channel: Token.DEFAULT_CHANNEL,
        tokenIndex: this._tokenIndex++,
        source: [this._input, this],
      });
    } else if (this.currentIndent < lastIndent) {
      if (!this.isValidDedent(this.currentIndent)) {
        throw new Error('Inconsistent indentation');
      }
      this.indentationStack.pop();
      return this.createToken({
        type: GeneratedLexer.DEDENT,
        text: '<DEDENT>',
        startIndex: this._input.index - whitespaceCount,
        stopIndex: this._input.index,
        line: this._currentLine,
        charPositionInLine: this._currentColumn,
        channel: Token.DEFAULT_CHANNEL,
        tokenIndex: this._tokenIndex++,
        source: [this._input, this],
      });
    }
    return null;
  }

  private isValidDedent(currentIndent: number): boolean {
    for (let i = this.indentationStack.length - 1; i >= 0; i--) {
      if (this.indentationStack[i] === currentIndent) {
        return true;
      }
    }
    return false;
  }

  private skipWhitespace(): void {
    while (this._input.LA(1) === ' '.charCodeAt(0)) {
      this._input.consume();
      this._currentColumn++;
    }
  }

  private isCommentStart(): boolean {
    return (
      this._input.LA(1) === '/'.charCodeAt(0) &&
      (this._input.LA(2) === '/'.charCodeAt(0) || this._input.LA(2) === '*'.charCodeAt(0))
    );
  }

  private handleComment(): Token {
    return this._input.LA(2) === '/'.charCodeAt(0)
      ? this.handleSingleLineComment()
      : this.handleBlockComment();
  }

  private isNewline(): boolean {
    return this._input.LA(1) === '\n'.charCodeAt(0) || this._input.LA(1) === '\r'.charCodeAt(0);
  }

  private handleNewline(): Token {
    const start = this._input.index;
    this._input.consume();

    if (this._input.LA(1) === '\n'.charCodeAt(0)) {
      this._input.consume();
    }

    this._currentLine++;
    this._currentColumn = 0;
    this.atStartOfLine = true;

    return this.createToken({
      type: GeneratedLexer.NEWLINE,
      text: '<NEWLINE>',
      startIndex: start,
      stopIndex: this._input.index - 1,
      line: this._currentLine - 1,
      charPositionInLine: this._currentColumn,
      channel: Token.DEFAULT_CHANNEL,
      tokenIndex: this._tokenIndex++,
      source: [this._input, this],
    });
  }

  private isStringLiteral(): boolean {
    return this._input.LA(1) === '"'.charCodeAt(0);
  }

  /**
   * Handle single-line comments
   */
  protected handleSingleLineComment(): Token {
    this._input.consume(); // Consume the first '/'
    this._currentColumn++;
    this._input.consume(); // Consume the second '/'
    this._currentColumn++;

    while (
      this._input.LA(1) !== -1 &&
      this._input.LA(1) !== '\n'.charCodeAt(0) &&
      this._input.LA(1) !== '\r'.charCodeAt(0)
    ) {
      this._input.consume();
      this._currentColumn++;
    }

    // Skip the comment and return the next token
    return this.nextToken();
  }

  /**
   * Handle block comments
   */
  protected handleBlockComment(): Token {
    this._input.consume(); // Consume the first '/'
    this._currentColumn++;
    this._input.consume(); // Consume the '*'
    this._currentColumn++;

    let foundEnd = false;
    let iterationCount = 0;
    const MAX_ITERATIONS = 1000; // Safety limit

    while (this._input.LA(1) !== -1 && !foundEnd) {
      iterationCount++;
      if (iterationCount > MAX_ITERATIONS) {
        throw new Error('Block comment processing exceeded maximum iterations');
      }

      if (this._input.LA(1) === '\n'.charCodeAt(0)) {
        this._input.consume(); // Consume the newline
        this._currentLine++;
        this._currentColumn = 0;
      } else if (this._input.LA(1) === '\r'.charCodeAt(0)) {
        this._input.consume(); // Consume \r
        if (this._input.LA(1) === '\n'.charCodeAt(0)) {
          this._input.consume(); // Consume \n
        }
        this._currentLine++;
        this._currentColumn = 0;
      } else if (
        this._input.LA(1) === '*'.charCodeAt(0) &&
        this._input.LA(2) === '/'.charCodeAt(0)
      ) {
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

    // Skip the comment and return the next token
    return this.nextToken();
  }

  /**
   * Handle string literals
   */
  protected handleStringLiteral(): Token {
    const start = this._input.index;
    this._input.consume(); // Consume the opening quote
    this._currentColumn++;

    while (
      this._input.LA(1) !== -1 &&
      this._input.LA(1) !== '"'.charCodeAt(0) &&
      this._input.LA(1) !== '\n'.charCodeAt(0) &&
      this._input.LA(1) !== '\r'.charCodeAt(0)
    ) {
      this._input.consume();
      this._currentColumn++;
    }

    if (
      this._input.LA(1) === -1 ||
      this._input.LA(1) === '\n'.charCodeAt(0) ||
      this._input.LA(1) === '\r'.charCodeAt(0)
    ) {
      throw new Error('Unterminated string literal');
    }

    this._input.consume(); // Consume the closing quote
    this._currentColumn++;

    return this.createToken({
      type: GeneratedLexer.STRING,
      text: this._input.getText(new Interval(start, this._input.index - 1)),
      startIndex: start,
      stopIndex: this._input.index,
      line: this._currentLine,
      charPositionInLine: this._currentColumn,
      channel: Token.DEFAULT_CHANNEL,
      tokenIndex: this._tokenIndex++,
      source: [this._input, this],
    });
  }

  /**
   * Handle identifiers and keywords
   */
  protected handleIdentifier(): Token {
    const start = this._input.index;
    let text = '';

    while (
      this._input.LA(1) !== -1 &&
      (this.isAlpha(this._input.LA(1)) ||
        this.isDigit(this._input.LA(1)) ||
        this._input.LA(1) === '_'.charCodeAt(0))
    ) {
      text += String.fromCharCode(this._input.LA(1));
      this._input.consume();
      this._currentColumn++;
    }

    // Check if this is a keyword
    const type = this.TOKEN_RULES.get(text);
    if (type !== undefined) {
      return this.createToken({
        type,
        text,
        startIndex: start,
        stopIndex: this._input.index - 1,
        line: this._currentLine,
        charPositionInLine: this._currentColumn,
        channel: Token.DEFAULT_CHANNEL,
        tokenIndex: this._tokenIndex++,
        source: [this._input, this],
      });
    }

    // If not a keyword, it's an error
    return this.createToken({
      type: GeneratedLexer.ERROR,
      text,
      startIndex: start,
      stopIndex: this._input.index - 1,
      line: this._currentLine,
      charPositionInLine: this._currentColumn,
      channel: Token.DEFAULT_CHANNEL,
      tokenIndex: this._tokenIndex++,
      source: [this._input, this],
    });
  }

  /**
   * Check if a character is alphabetic
   */
  private isAlpha(c: number): boolean {
    return (
      (c >= 'a'.charCodeAt(0) && c <= 'z'.charCodeAt(0)) ||
      (c >= 'A'.charCodeAt(0) && c <= 'Z'.charCodeAt(0))
    );
  }

  /**
   * Check if a character is a digit
   */
  private isDigit(c: number): boolean {
    return c >= '0'.charCodeAt(0) && c <= '9'.charCodeAt(0);
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
    source: [CharStream, Lexer];
  }): Token {
    return new CPGLToken(options);
  }

  /**
   * Handle invalid characters
   */
  private handleError(): Token {
    const start = this._input.index;
    const text = String.fromCharCode(this._input.LA(1));
    this._input.consume();
    this._currentColumn++;

    return this.createToken({
      type: GeneratedLexer.ERROR,
      text,
      startIndex: start,
      stopIndex: start,
      line: this._currentLine,
      charPositionInLine: this._currentColumn,
      channel: Token.DEFAULT_CHANNEL,
      tokenIndex: this._tokenIndex++,
      source: [this._input, this],
    });
  }
}
