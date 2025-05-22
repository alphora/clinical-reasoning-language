import { CommonTokenStream } from "antlr4ts";

import { CRLParser } from "../grammar/generated/antlr/CRLParser";
import { createLexer } from "../lexer/createLexer";

import { CustomParserErrorListener } from "./CustomParserErrorListener";

export function createParser(input: string): {
  parser: CRLParser;
  parserErrorListener: CustomParserErrorListener;
  lexerErrorListener: import("../lexer/CRLLexerErrorListener").CRLLexerErrorListener;
} {
  const { lexer, errorListener: lexerErrorListener } = createLexer(input);
  const tokenStream = new CommonTokenStream(lexer);

  const parserErrorListener = new CustomParserErrorListener();
  const parser = new CRLParser(tokenStream);
  parser.removeErrorListeners();
  parser.addErrorListener(parserErrorListener);

  return { parser, parserErrorListener, lexerErrorListener };
}
