import { CharStream, LexerNoViableAltException } from 'antlr4ts';
import { ANTLRErrorListener } from 'antlr4ts/ANTLRErrorListener';
import { ATNSimulator } from 'antlr4ts/atn/ATNSimulator';
import { Interval } from 'antlr4ts/misc/Interval';
import { RecognitionException } from 'antlr4ts/RecognitionException';
import { Recognizer } from 'antlr4ts/Recognizer';

import { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';

export class CPGLLexer extends GeneratedLexer {
  constructor(input: CharStream) {
    super(input);
    this.removeErrorListeners();
    this.addErrorListener(new CPGLLexerErrorListener());
  }
}

class CPGLLexerErrorListener implements ANTLRErrorListener<number> {
  syntaxError<T extends number>(
    recognizer: Recognizer<T, ATNSimulator>,
    offendingSymbol: T | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    e: RecognitionException | undefined,
  ): void {
    if (e instanceof LexerNoViableAltException) {
      const lexer = recognizer as GeneratedLexer;
      const input = lexer.inputStream;
      const start = lexer._tokenStartCharIndex;
      const stop = input.index;
      const text = input.getText(Interval.of(start, stop));
      const errorMsg = `Lexical error at line ${line}:${charPositionInLine} - ${msg} - '${text}'`;
      throw new Error(errorMsg);
    } else {
      const errorMsg = `Lexical error at line ${line}:${charPositionInLine} - ${msg}`;
      throw new Error(errorMsg);
    }
  }
}
