import { ANTLRErrorListener, RecognitionException, Recognizer, Token } from 'antlr4ts';
import { ATNSimulator } from 'antlr4ts/atn/ATNSimulator';
import { CharStream } from 'antlr4ts/CharStream';
import { Interval } from 'antlr4ts/misc/Interval';

import { CPGLLexer } from '../grammar/generated/CPGLLexer';
export class CPGLLexerErrorListener implements ANTLRErrorListener<number> {
  ERROR_TOKEN_TYPE = 27;

  syntaxError<T extends number>(
    _recognizer: Recognizer<T, ATNSimulator>,
    _offendingSymbol: T | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    _e: RecognitionException | undefined,
  ): void {
    const input = _recognizer.inputStream as CharStream;
    const startIndex: number = (_recognizer as any)._tokenStartCharIndex ?? 0;
    const currentIndex: number = input.index;
    const errorText = input.getText(Interval.of(startIndex, currentIndex));
    const errorMessage = `Lexical error at line ${line}:${charPositionInLine}: Invalid token '${errorText}'. (details: ${msg})`;
    console.error(errorMessage);

    if (_recognizer instanceof CPGLLexer) {
      const errorToken: Token = _recognizer._factory.create(
        _recognizer,
        this.ERROR_TOKEN_TYPE,
        errorMessage,
        Token.DEFAULT_CHANNEL,
        startIndex,
        currentIndex - 1,
        line,
        charPositionInLine,
      );

      _recognizer.emit(errorToken);

      // Do not throw an error here; by emitting a token, we let the lexer continue
      // so that all lexical errors in the input can be collected.
      return;
    }

    throw new Error(errorMessage);
  }
}
