import {
  ANTLRErrorListener,
  RecognitionException,
  Recognizer,
  LexerNoViableAltException,
} from 'antlr4ts';
import { ATNSimulator } from 'antlr4ts/atn/ATNSimulator';

export class CPGLLexerErrorListener implements ANTLRErrorListener<number> {
  syntaxError<T extends number>(
    _recognizer: Recognizer<T, ATNSimulator>,
    _offendingSymbol: T | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    e: RecognitionException | undefined,
  ): void {
    if (e instanceof LexerNoViableAltException) {
      const errorMsg = `Line ${line}:${charPositionInLine} - Invalid token: ${msg}`;
      throw new Error(errorMsg);
    } else {
      const errorMsg = `Line ${line}:${charPositionInLine} - ${msg}`;
      throw new Error(errorMsg);
    }
  }
}
