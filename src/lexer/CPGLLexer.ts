/**
 * Custom lexer for the Clinical Practice Guideline Language (CPGL)
 * 
 * IMPORTANT: This is our custom lexer implementation that extends the base ANTLR Lexer.
 * It provides additional functionality for handling indentation-based syntax, comments, and token generation.
 * 
 * WARNING: Do not replace this with the generated lexer (../grammar/generated/CPGLLexer) as it lacks
 * the custom functionality needed for our language features.
 * 
 * The generated lexer is only used internally for:
 * - Vocabulary definitions
 * - Token type constants
 * - Grammar rules
 */
import type { CharStream } from 'antlr4ts/CharStream';
import { Lexer } from 'antlr4ts/Lexer';
import { Token } from 'antlr4ts/Token';

// Import proxy constants instead of generated lexer
import { TokenTypes, Vocabulary, RuleNames, ChannelNames, ModeNames } from './CPGLLexerConstants';
import { CPGLToken } from './CPGLToken';

/**
 * Custom lexer for the Clinical Practice Guideline Language (CPGL)
 * Handles indentation-based syntax, comments, and token generation
 */
export class CPGLLexer extends Lexer {
  readonly indentationStack: number[] = [0];
  readonly pendingTokens: Token[] = [];
  private atStartOfLine = true;
  private _tokenIndex = -1;
  private _currentLine = 1;
  private _currentColumn = 0;

  // Required by ANTLR
  public static readonly channelNames: string[] = ChannelNames;
  public static readonly modeNames: string[] = ModeNames;
  public static readonly ruleNames: string[] = RuleNames;
  public static readonly vocabulary = Vocabulary;
  public static readonly grammarFileName = 'CPGLCustomLexer';

  // Standard tokens for testing - these would normally be generated from an ANTLR grammar
  private readonly TOKEN_RULES: Map<string, number> = new Map([
    ['decision', TokenTypes.DECISION],
    ['when', TokenTypes.WHEN],
    ['then', TokenTypes.THEN],
    ['do', TokenTypes.DO],
    ['use', TokenTypes.USE],
    ['action', TokenTypes.ACTION_FHIR_TYPE],
    ['fhirtype', TokenTypes.FHIRTYPE],
    ['casefeature', TokenTypes.CASEFEATURE_FHIR_TYPE],
    ['valuetype', TokenTypes.FHIR_VALUE_TYPE],
    ['casefeaturecode', TokenTypes.CASEFEATURECODE],
    ['profileurl', TokenTypes.PROFILEURL],
    ['any', TokenTypes.ANY],
    ['all', TokenTypes.ALL],
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

  public get vocabulary(): typeof Vocabulary {
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
    // Generate DEDENT tokens for all remaining indentation levels
    while (this.indentationStack.length > 1) {
      this.indentationStack.pop();
      const dedentToken = this.createToken({
        type: TokenTypes.DEDENT,
        text: '<DEDENT>',
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
    
    // Handle any remaining pending tokens
    if (this.pendingTokens.length > 0) {
      return this.pendingTokens.shift()!;
    }

    // Create and return EOF token
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
        type: TokenTypes.DEDENT,
        text: '<DEDENT>',
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
    if (token.type === TokenTypes.ACTION ||
        token.type === TokenTypes.CASEFEATURE ||
        token.type === TokenTypes.DECISION) {
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
      // Generate DEDENT tokens for all remaining indentation levels
      while (this.indentationStack.length > 1) {
        this.indentationStack.pop();
        const dedentToken = this.createToken({
          type: TokenTypes.DEDENT,
          text: '<DEDENT>',
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
      
      // Handle any remaining pending tokens
      if (this.pendingTokens.length > 0) {
        return this.pendingTokens.shift()!;
      }

      // Create and return EOF token
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

    // Handle newlines
    if (this._input.LA(1) === '\n'.charCodeAt(0)) {
      this._input.consume();
      this._currentLine++;
      this._currentColumn = 0;
      this.atStartOfLine = true;
      return this.createToken({
        type: TokenTypes.NEWLINE,
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
      return this.handleString();
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
    // Handle any pending tokens first
    const pendingToken = this.handlePendingTokens();
    if (pendingToken) {
      return pendingToken;
    }

    // Handle EOF
    if (this._input.LA(1) === Token.EOF) {
      return this.handleEOF();
    }

    // Skip empty lines at the start of the file
    if (this._currentLine === 1 && this._currentColumn === 0) {
      while (this._input.LA(1) === '\n'.charCodeAt(0)) {
        this._input.consume();
        this._currentLine++;
      }
    }

    // Handle newlines and indentation at start of line
    if (this.atStartOfLine) {
      this.atStartOfLine = false;
      this._currentColumn = 0;

      // Skip any whitespace
      let indent = 0;
      while (this._input.LA(1) === ' '.charCodeAt(0)) {
        this._input.consume();
        indent++;
        this._currentColumn++;
      }

      // Handle indentation
      if (indent > this.indentationStack[this.indentationStack.length - 1]) {
        if (indent % 4 !== 0) {
          throw new Error('Inconsistent indentation');
        }
        this.indentationStack.push(indent);
        return this.createToken({
          type: TokenTypes.INDENT,
          text: '    ',
          startIndex: this._input.index - indent,
          stopIndex: this._input.index - 1,
          line: this._currentLine,
          charPositionInLine: 0,
          channel: Token.DEFAULT_CHANNEL,
          tokenIndex: this._tokenIndex++,
          source: [this._input, this],
        });
      } else if (indent < this.indentationStack[this.indentationStack.length - 1]) {
        while (indent < this.indentationStack[this.indentationStack.length - 1]) {
          this.indentationStack.pop();
          const dedentToken = this.createToken({
            type: TokenTypes.DEDENT,
            text: '<DEDENT>',
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
        if (indent !== this.indentationStack[this.indentationStack.length - 1]) {
          throw new Error('Inconsistent indentation');
        }
        // Add a NEWLINE token after DEDENT
        const newlineToken = this.createToken({
          type: TokenTypes.NEWLINE,
          text: '\n',
          startIndex: this._input.index,
          stopIndex: this._input.index,
          line: this._currentLine,
          charPositionInLine: this._currentColumn,
          channel: Token.DEFAULT_CHANNEL,
          tokenIndex: this._tokenIndex++,
          source: [this._input, this],
        });
        this.pendingTokens.push(newlineToken);
        return this.pendingTokens.shift()!;
      }
    }

    // Skip whitespace
    while (this._input.LA(1) === ' '.charCodeAt(0)) {
      this._input.consume();
      this._currentColumn++;
    }

    // Handle newlines
    if (this._input.LA(1) === '\n'.charCodeAt(0)) {
      return this.handleNewline();
    }

    // Handle strings
    if (this._input.LA(1) === '"'.charCodeAt(0)) {
      return this.handleString();
    }

    // Handle FHIR types
    if (this._input.LA(1) === 'f'.charCodeAt(0) && 
        this._input.LA(2) === 'h'.charCodeAt(0) && 
        this._input.LA(3) === 'i'.charCodeAt(0) && 
        this._input.LA(4) === 'r'.charCodeAt(0)) {
      let token = this.handleFHIRType();
      if (token) return token;
    }

    // Handle other tokens
    let token = this.handleOtherTokens();
    if (token) return token;

    // If we get here, something went wrong
    throw new Error(`Unexpected character: ${String.fromCharCode(this._input.LA(1))}`);
  }

  private handleNewline(): Token {
    const start = this._input.index;
    this._input.consume(); // consume newline
    this._currentLine++;
    this._currentColumn = 0;
    this.atStartOfLine = true;

    // Skip any additional newlines
    while (this._input.LA(1) === '\n'.charCodeAt(0)) {
      this._input.consume();
      this._currentLine++;
    }

    // Create NEWLINE token
    const token = this.createToken({
      type: TokenTypes.NEWLINE,
      text: '\n',
      startIndex: start,
      stopIndex: this._input.index - 1,
      line: this._currentLine - 1,
      charPositionInLine: this._currentColumn,
      channel: Token.DEFAULT_CHANNEL,
      tokenIndex: this._tokenIndex++,
      source: [this._input, this],
    });

    // If we're at EOF or the next character is not a space, generate DEDENT tokens
    if (this._input.LA(1) === Token.EOF || this._input.LA(1) !== ' '.charCodeAt(0)) {
      while (this.indentationStack.length > 1) {
        this.indentationStack.pop();
        const dedentToken = this.createToken({
          type: TokenTypes.DEDENT,
          text: '<DEDENT>',
          startIndex: this._input.index,
          stopIndex: this._input.index,
          line: this._currentLine,
          charPositionInLine: this._currentColumn,
          channel: Token.DEFAULT_CHANNEL,
          tokenIndex: this._tokenIndex++,
          source: [this._input, this],
        });
        this.pendingTokens.push(dedentToken);
        // Add a NEWLINE token after each DEDENT
        const newlineToken = this.createToken({
          type: TokenTypes.NEWLINE,
          text: '\n',
          startIndex: this._input.index,
          stopIndex: this._input.index,
          line: this._currentLine,
          charPositionInLine: this._currentColumn,
          channel: Token.DEFAULT_CHANNEL,
          tokenIndex: this._tokenIndex++,
          source: [this._input, this],
        });
        this.pendingTokens.push(newlineToken);
      }
    }

    return token;
  }

  private handleLineStart(): Token | null {
    // Handle pending tokens
    const pendingToken = this.handlePendingTokens();
    if (pendingToken) {
      return pendingToken;
    }

    // Skip initial whitespace and track indentation
    let indent = 0;
    while (this._input.LA(1) === ' '.charCodeAt(0) || this._input.LA(1) === '\t'.charCodeAt(0)) {
      if (this._input.LA(1) === ' '.charCodeAt(0)) {
        indent++;
      } else if (this._input.LA(1) === '\t'.charCodeAt(0)) {
        indent = (indent + 8) & ~7;  // Round up to next tab stop
      }
      this._input.consume();
      this._currentColumn++;
    }

    // Validate indentation
    if (indent % 4 !== 0) {
      throw new Error('Inconsistent indentation');
    }

    // If we're at the start of a line
    if (this.atStartOfLine) {
      this.atStartOfLine = false;

      // If this is a new indentation level
      if (indent > this.indentationStack[this.indentationStack.length - 1]) {
        this.indentationStack.push(indent);
        return this.createToken({
          type: TokenTypes.INDENT,
          text: '    ',
          startIndex: this._input.index - indent,
          stopIndex: this._input.index - 1,
          line: this._currentLine,
          charPositionInLine: this._currentColumn - indent,
          channel: Token.DEFAULT_CHANNEL,
          tokenIndex: this._tokenIndex++,
          source: [this._input, this],
        });
      }
      // If this is a dedent
      else if (indent < this.indentationStack[this.indentationStack.length - 1]) {
        // Generate DEDENT tokens until we match the current indent level
        while (indent < this.indentationStack[this.indentationStack.length - 1]) {
          this.indentationStack.pop();
          const dedentToken = this.createToken({
            type: TokenTypes.DEDENT,
            text: '<DEDENT>',
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

        // If we couldn't find a matching indent level
        if (indent !== this.indentationStack[this.indentationStack.length - 1]) {
          throw new Error('Inconsistent indentation');
        }

        return this.handlePendingTokens();
      }
      // Same indentation level
      else if (indent === this.indentationStack[this.indentationStack.length - 1]) {
        // Do nothing, continue with the next token
      }
      else {
        throw new Error('Inconsistent indentation');
      }
    }

    return null;
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

  private handleString(): Token {
    const start = this._input.index;
    let text = '"';
    this._input.consume(); // consume opening quote
    this._currentColumn++;

    while (this._input.LA(1) !== Token.EOF && this._input.LA(1) !== '"'.charCodeAt(0)) {
      text += String.fromCharCode(this._input.LA(1));
      this._input.consume();
      this._currentColumn++;
    }

    if (this._input.LA(1) === '"'.charCodeAt(0)) {
      text += '"';
      this._input.consume(); // consume closing quote
      this._currentColumn++;
    }

    return this.createToken({
      type: TokenTypes.STRING,
      text,
      startIndex: start,
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
        type: TokenTypes.ACTION_FHIR_TYPE,
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
        type: TokenTypes.CASEFEATURE_FHIR_TYPE,
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
        type: TokenTypes.FHIR_VALUE_TYPE,
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
      type: TokenTypes.ERROR,
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
      type: TokenTypes.ERROR,
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

  private handleFHIRType(): Token | null {
    const start = this._input.index;
    let text = '';
    
    // Skip the 'fhir' keyword
    while (this._input.LA(1) !== Token.EOF && 
           this._input.LA(1) !== ' '.charCodeAt(0)) {
      this._input.consume();
      this._currentColumn++;
    }
    
    // Skip whitespace
    while (this._input.LA(1) === ' '.charCodeAt(0)) {
      this._input.consume();
      this._currentColumn++;
    }
    
    // Read the FHIR type
    while (this._input.LA(1) !== Token.EOF && 
           this._input.LA(1) !== '\n'.charCodeAt(0) && 
           this._input.LA(1) !== ' '.charCodeAt(0)) {
      text += String.fromCharCode(this._input.LA(1));
      this._input.consume();
      this._currentColumn++;
    }

    if (this.ACTION_FHIR_TYPES.has(text) || 
        this.CASEFEATURE_FHIR_TYPES.has(text) || 
        this.FHIR_VALUE_TYPES.has(text)) {
      return this.createToken({
        type: TokenTypes.FHIRTYPE,
        text,
        startIndex: start,
        stopIndex: this._input.index - 1,
        line: this._currentLine,
        charPositionInLine: this._currentColumn - text.length,
        channel: Token.DEFAULT_CHANNEL,
        tokenIndex: this._tokenIndex++,
        source: [this._input, this],
      });
    }

    return null;
  }

  private handleOtherTokens(): Token | null {
    const start = this._input.index;
    let text = '';
    while (this._input.LA(1) !== Token.EOF && 
           this._input.LA(1) !== '\n'.charCodeAt(0) && 
           this._input.LA(1) !== ' '.charCodeAt(0) &&
           this._input.LA(1) !== '"'.charCodeAt(0)) {
      text += String.fromCharCode(this._input.LA(1));
      this._input.consume();
      this._currentColumn++;
    }

    const tokenType = this.TOKEN_RULES.get(text);
    if (tokenType !== undefined) {
      return this.createToken({
        type: tokenType,
        text,
        startIndex: start,
        stopIndex: this._input.index - 1,
        line: this._currentLine,
        charPositionInLine: this._currentColumn - text.length,
        channel: Token.DEFAULT_CHANNEL,
        tokenIndex: this._tokenIndex++,
        source: [this._input, this],
      });
    }

    return null;
  }
}
