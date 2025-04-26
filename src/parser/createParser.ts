import { CommonTokenStream } from "antlr4ts";

import { CPGLParser } from "../grammar/generated/antlr/CPGLParser";
import { createLexer } from "../lexer/createLexer";

import { CustomParserErrorListener } from "./CustomParserErrorListener";

export function createParser(input: string): {
  parser: CPGLParser;
  parserErrorListener: CustomParserErrorListener;
  lexerErrorListener: import("../lexer/CPGLLexerErrorListener").CPGLLexerErrorListener;
} {
  const { lexer, errorListener: lexerErrorListener } = createLexer(input);
  const tokenStream = new CommonTokenStream(lexer);

  const parserErrorListener = new CustomParserErrorListener();
  const parser = new CPGLParser(tokenStream);
  parser.removeErrorListeners();
  parser.addErrorListener(parserErrorListener);

  return { parser, parserErrorListener, lexerErrorListener };
}
