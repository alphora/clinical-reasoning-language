import { CharStreams } from "antlr4ts";

import { CRLLexer } from "../grammar/generated/antlr/CRLLexer";

import { CRLLexerErrorListener } from "./CRLLexerErrorListener";

export function createLexer(input: string): {
  lexer: CRLLexer;
  errorListener: CRLLexerErrorListener;
} {
  const lexerErrorListener = new CRLLexerErrorListener();
  const lexer = new CRLLexer(CharStreams.fromString(input));
  lexer.removeErrorListeners();
  lexer.addErrorListener(lexerErrorListener);
  return { lexer, errorListener: lexerErrorListener };
}
