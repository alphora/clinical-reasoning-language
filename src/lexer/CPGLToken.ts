import type { CharStream } from 'antlr4ts/CharStream';
import type { Lexer } from 'antlr4ts/Lexer';
import { Token } from 'antlr4ts/Token';

import { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';

/**
 * Custom token implementation for the Clinical Practice Guideline Language (CPGL)
 */
export class CPGLToken implements Token {
  readonly _type: number;
  readonly _text: string;
  readonly _line: number;
  readonly _charPositionInLine: number;
  readonly _channel: number;
  readonly _tokenIndex: number;
  readonly _startIndex: number;
  readonly _stopIndex: number;
  readonly _source: [CharStream, Lexer];

  constructor({
    type,
    text,
    line,
    charPositionInLine,
    channel,
    tokenIndex,
    startIndex,
    stopIndex,
    source,
  }: {
    type: number;
    text: string;
    line: number;
    charPositionInLine: number;
    channel: number;
    tokenIndex: number;
    startIndex: number;
    stopIndex: number;
    source: [CharStream, Lexer];
  }) {
    this._type = type;
    this._text = text;
    this._source = source;
    this._channel = channel;
    this._startIndex = startIndex;
    this._stopIndex = stopIndex;
    this._tokenIndex = tokenIndex;
    this._line = line;
    this._charPositionInLine = charPositionInLine;
  }

  get type(): number {
    return this._type;
  }

  get channel(): number {
    return this._channel;
  }

  get start(): number {
    return this._startIndex;
  }

  get stop(): number {
    return this._stopIndex;
  }

  get startIndex(): number {
    return this._startIndex;
  }

  get stopIndex(): number {
    return this._stopIndex;
  }

  get tokenIndex(): number {
    return this._tokenIndex;
  }

  get line(): number {
    return this._line;
  }

  get charPositionInLine(): number {
    return this._charPositionInLine;
  }

  get text(): string {
    // Special handling for EOF token
    if (this._type === Token.EOF) {
      return '<EOF>';
    }
    return this._text;
  }

  get source(): [CharStream, Lexer] {
    return this._source;
  }

  get inputStream(): CharStream {
    return this._source[0];
  }

  get tokenSource(): Lexer {
    return this._source[1];
  }

  /**
   * Get the name of the token type
   */
  public get typeName(): string {
    if (this._type === Token.EOF) {
      return 'EOF';
    }
    switch (this._type) {
      case GeneratedLexer.DECISION:
        return 'DECISION';
      case GeneratedLexer.WHEN:
        return 'WHEN';
      case GeneratedLexer.THEN:
        return 'THEN';
      case GeneratedLexer.DO:
        return 'DO';
      case GeneratedLexer.USE:
        return 'USE';
      case GeneratedLexer.ACTION:
        return 'ACTION';
      case GeneratedLexer.FHIRTYPE:
        return 'FHIRTYPE';
      case GeneratedLexer.CASEFEATURE:
        return 'CASEFEATURE';
      case GeneratedLexer.VALUETYPE:
        return 'VALUETYPE';
      case GeneratedLexer.NEWLINE:
        return 'NEWLINE';
      case GeneratedLexer.WS:
        return 'WS';
      case GeneratedLexer.COMMENT:
        return 'COMMENT';
      case GeneratedLexer.COMMENT_BLOCK:
        return 'COMMENT_BLOCK';
      case GeneratedLexer.INDENT:
        return 'INDENT';
      case GeneratedLexer.DEDENT:
        return 'DEDENT';
      case GeneratedLexer.ACTION_FHIR_TYPE:
        return 'ACTION_FHIR_TYPE';
      case GeneratedLexer.CASEFEATURE_FHIR_TYPE:
        return 'CASEFEATURE_FHIR_TYPE';
      case GeneratedLexer.FHIR_VALUE_TYPE:
        return 'FHIR_VALUE_TYPE';
      case GeneratedLexer.STRING:
        return 'STRING';
      case GeneratedLexer.ERROR:
        return 'ERROR';
      default:
        return `UNKNOWN(${this._type})`;
    }
  }

  /**
   * Alias for charPositionInLine to match some conventions
   */
  public get column(): number {
    return this._charPositionInLine;
  }

  public toString(): string {
    let channelStr = '';
    if (this._channel > 0) {
      channelStr = `,channel=${this._channel}`;
    }

    let txt = this.text; // Use the getter to handle EOF specially
    if (txt) {
      txt = txt.replace(/\n/g, '\\n');
      txt = txt.replace(/\r/g, '\\r');
      txt = txt.replace(/\t/g, '\\t');
    } else {
      txt = '<no text>';
    }

    return `[@${this._tokenIndex},${this._startIndex}:${this._stopIndex}='${txt}',<${this.typeName}>${channelStr},${this._line}:${this._charPositionInLine}]`;
  }
}
