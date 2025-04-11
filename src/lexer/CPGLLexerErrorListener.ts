import { ANTLRErrorListener, RecognitionException, Recognizer } from 'antlr4ts';
import { ATNSimulator } from 'antlr4ts/atn/ATNSimulator';

export class CPGLLexerErrorListener implements ANTLRErrorListener<number> {
  syntaxError<T extends number>(
    _recognizer: Recognizer<T, ATNSimulator>,
    _offendingSymbol: T | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    _e: RecognitionException | undefined,
  ): void {
    throw new Error(`Line ${line}:${charPositionInLine} - ${msg}`);
  }
}
