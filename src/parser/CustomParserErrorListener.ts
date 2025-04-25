import { ANTLRErrorListener, RecognitionException, Recognizer, Token } from "antlr4ts";
import { ATNSimulator } from "antlr4ts/atn/ATNSimulator";

export class CustomParserErrorListener implements ANTLRErrorListener<Token> {
  private readonly errors: string[] = [];

  syntaxError(
    recognizer: Recognizer<Token, ATNSimulator>,
    offendingSymbol: Token | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    e: RecognitionException | undefined,
  ): void {
    const errorMessage = JSON.stringify({
      type: "ParserError",
      line: line,
      column: charPositionInLine,
      message: `Syntax error: ${msg}`,
      details: {
        offendingSymbol: offendingSymbol?.text ?? "unknown"
      }
    });
    console.error(errorMessage);
    this.errors.push(errorMessage);
  }

  getErrors(): string[] {
    return this.errors;
  }
}
