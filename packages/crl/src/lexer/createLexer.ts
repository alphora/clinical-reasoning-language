import { CharStreams } from "antlr4ts";

import { CRLLexer } from "../grammar/generated/antlr/CRLLexer";

import { CRLLexerErrorListener } from "./CRLLexerErrorListener";

class CRLLexerWithAutoError extends CRLLexer {
  private errorListener?: CRLLexerErrorListener;

  setErrorListener(listener: CRLLexerErrorListener): void {
    this.errorListener = listener;
  }

  override emit(): import("antlr4ts").Token {
    const token = super.emit();

    if (this.errorListener && token.type === this.errorListener.ERROR_TOKEN_TYPE) {
      this.errorListener.handleToken(token);
    }
    return token;
  }
}

export function createLexer(input: string): {
  lexer: CRLLexer;
  errorListener: CRLLexerErrorListener;
} {
  const lexerErrorListener = new CRLLexerErrorListener();
  const lexer = new CRLLexerWithAutoError(CharStreams.fromString(input));
  lexer.removeErrorListeners();
  lexer.addErrorListener(lexerErrorListener);
  (lexer as CRLLexerWithAutoError).setErrorListener(lexerErrorListener);
  return { lexer, errorListener: lexerErrorListener };
}
