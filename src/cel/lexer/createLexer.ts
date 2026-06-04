import { CharStreams } from "antlr4ts";

import { CELLexer } from "../../grammar/generated/antlr/CELLexer";

import { CELLexerErrorListener } from "./CELLexerErrorListener";

export function createCELLexer(input: string): {
  lexer: CELLexer;
  errorListener: CELLexerErrorListener;
} {
  const lexerErrorListener = new CELLexerErrorListener();
  const lexer = new CELLexer(CharStreams.fromString(input));
  lexer.removeErrorListeners();
  lexer.addErrorListener(lexerErrorListener);
  return { lexer, errorListener: lexerErrorListener };
}
