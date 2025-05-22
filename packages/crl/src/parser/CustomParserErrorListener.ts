import { ANTLRErrorListener, RecognitionException, Recognizer, Token } from "antlr4ts";
import { ATNSimulator } from "antlr4ts/atn/ATNSimulator";

import { CRLError } from "../types/errors";

export class CustomParserErrorListener implements ANTLRErrorListener<Token> {
  private readonly errors: CRLError[] = [];

  syntaxError(
    _recognizer: Recognizer<Token, ATNSimulator>,
    offendingSymbol: Token | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    _e: RecognitionException | undefined,
  ): void {
    const offendingDetails = offendingSymbol
      ? {
          text: offendingSymbol.text,
          type: offendingSymbol.type,
          line: offendingSymbol.line,
          charPositionInLine: offendingSymbol.charPositionInLine,
          startIndex: offendingSymbol.startIndex,
          stopIndex: offendingSymbol.stopIndex,
          tokenIndex: offendingSymbol.tokenIndex,
        }
      : { text: "unknown" };

    const error: CRLError = {
      type: "ParserError",
      line,
      column: charPositionInLine,
      message: `Syntax error: ${msg}`,
      details: {
        offendingSymbol: offendingDetails,
      },
    };
    this.errors.push(error);
  }

  getErrors(): CRLError[] {
    return this.errors;
  }
}
