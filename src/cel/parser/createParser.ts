import { CommonTokenStream } from "antlr4ts";

import { CELParser } from "../../grammar/generated/antlr/CELParser";
import { createCELLexer } from "../lexer/createLexer";

import { CELParserErrorListener } from "./CELParserErrorListener";

export function createCELParser(input: string): {
  parser: CELParser;
  parserErrorListener: CELParserErrorListener;
  lexerErrorListener: import("../lexer/CELLexerErrorListener").CELLexerErrorListener;
} {
  const { lexer, errorListener: lexerErrorListener } = createCELLexer(input);
  const tokenStream = new CommonTokenStream(lexer);

  const parserErrorListener = new CELParserErrorListener();
  const parser = new CELParser(tokenStream);
  parser.removeErrorListeners();
  parser.addErrorListener(parserErrorListener);

  return { parser, parserErrorListener, lexerErrorListener };
}
