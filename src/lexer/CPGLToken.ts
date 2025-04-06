import { Token } from 'antlr4ts/Token';
import { TokenTypes } from './CPGLLexerConstants';
import { CharStream } from 'antlr4ts/CharStream';
import { Lexer } from 'antlr4ts/Lexer';

/**
 * Custom token implementation for the Clinical Practice Guideline Language
 * 
 * IMPORTANT: This file uses the generated lexer ONLY for its static constants
 * and type definitions. It does not use the lexer for token generation.
 */
export class CPGLToken implements Token {
  constructor(
    public type: number,
    public text: string,
    public line: number,
    public charPositionInLine: number,
    public channel: number,
    public tokenIndex: number,
    public startIndex: number,
    public stopIndex: number,
    public source: [CharStream, Lexer]
  ) {}

  public get typeName(): string {
    switch (this.type) {
      case TokenTypes.DECISION:
        return 'DECISION';
      case TokenTypes.WHEN:
        return 'WHEN';
      case TokenTypes.THEN:
        return 'THEN';
      case TokenTypes.DO:
        return 'DO';
      case TokenTypes.USE:
        return 'USE';
      case TokenTypes.ACTION:
        return 'ACTION';
      case TokenTypes.FHIRTYPE:
        return 'FHIRTYPE';
      case TokenTypes.CASEFEATURE:
        return 'CASEFEATURE';
      case TokenTypes.VALUETYPE:
        return 'VALUETYPE';
      case TokenTypes.NEWLINE:
        return 'NEWLINE';
      case TokenTypes.INDENT:
        return 'INDENT';
      case TokenTypes.DEDENT:
        return 'DEDENT';
      case TokenTypes.ACTION_FHIR_TYPE:
        return 'ACTION_FHIR_TYPE';
      case TokenTypes.CASEFEATURE_FHIR_TYPE:
        return 'CASEFEATURE_FHIR_TYPE';
      case TokenTypes.FHIR_VALUE_TYPE:
        return 'FHIR_VALUE_TYPE';
      case TokenTypes.STRING:
        return 'STRING';
      case TokenTypes.ERROR:
        return 'ERROR';
      default:
        return `UNKNOWN(${this.type})`;
    }
  }

  public get tokenSource(): Lexer {
    return this.source[1];
  }

  public get inputStream(): CharStream {
    return this.source[0];
  }

  /**
   * Alias for charPositionInLine to match some conventions
   */
  public get column(): number {
    return this.charPositionInLine;
  }

  public toString(): string {
    let channelStr = '';
    if (this.channel > 0) {
      channelStr = `,channel=${this.channel}`;
    }

    let txt = this.text;
    if (txt) {
      txt = txt.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    } else {
      txt = '<no text>';
    }

    return `[@${this.tokenIndex},${this.startIndex}:${this.stopIndex}='${txt}',<${this.typeName}>${channelStr},${this.line}:${this.charPositionInLine}]`;
  }
}
