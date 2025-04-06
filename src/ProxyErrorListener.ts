import { ANTLRErrorListener } from 'antlr4ts';
import { RecognitionException } from 'antlr4ts/RecognitionException';
import { Token } from 'antlr4ts/Token';

export class ProxyErrorListener implements ANTLRErrorListener<Token> {
  private errors: string[] = [];

  syntaxError(
    recognizer: any,
    offendingSymbol: Token | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    e: RecognitionException | undefined
  ): void {
    this.errors.push(`line ${line}:${charPositionInLine} ${msg}`);
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  getErrors(): string[] {
    return this.errors;
  }
} 