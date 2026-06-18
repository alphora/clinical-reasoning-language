import { ANTLRErrorListener, RecognitionException, Recognizer, Token } from "antlr4ts";
import { ATNSimulator } from "antlr4ts/atn/ATNSimulator";

import { CRLError } from "../../types/errors";

/**
 * CEL lexer error listener. Simpler than CRL's — CEL drops the explicit
 * `ERROR` token + per-rule semantic-action error emission (per R3-A
 * disposition in discussion 048). All lexical errors come through
 * ANTLR's default `syntaxError` reporting; no `handleToken` machinery.
 */
export class CELLexerErrorListener implements ANTLRErrorListener<number> {
  private readonly errors: CRLError[] = [];

  syntaxError<T extends number>(
    _recognizer: Recognizer<T, ATNSimulator>,
    offendingSymbol: T | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    _e: RecognitionException | undefined,
  ): void {
    let offendingDetails: unknown = { text: "unknown" };
    if (offendingSymbol && typeof (offendingSymbol as unknown as Token).text === "string") {
      const token = offendingSymbol as unknown as Token;
      offendingDetails = {
        text: token.text,
        type: token.type,
        line: token.line,
        charPositionInLine: token.charPositionInLine,
      };
    } else if (offendingSymbol !== undefined) {
      offendingDetails = { text: String(offendingSymbol) };
    }

    this.errors.push({
      type: "LexicalError",
      line,
      column: charPositionInLine,
      message: msg,
      details: { offendingSymbol: offendingDetails },
    });
  }

  getErrors(): CRLError[] {
    return this.errors;
  }
}
