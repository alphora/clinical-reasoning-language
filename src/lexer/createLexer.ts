import { CharStreams } from "antlr4ts";

import { CPGLLexer } from "../grammar/generated/antlr/CPGLLexer";

import { CPGLLexerErrorListener } from "./CPGLLexerErrorListener";

export function createLexer(input: string): {
  lexer: CPGLLexer;
  errorListener: CPGLLexerErrorListener;
} {
  const lexerErrorListener = new CPGLLexerErrorListener();
  const lexer = new CPGLLexer(CharStreams.fromString(input));
  lexer.removeErrorListeners();
  lexer.addErrorListener(lexerErrorListener);
  return { lexer, errorListener: lexerErrorListener };
}
