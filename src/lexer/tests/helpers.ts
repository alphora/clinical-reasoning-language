import { Token } from "antlr4ts";

import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";
import { createLexer } from "../createLexer";
import { CRLLexerErrorListener } from "../CRLLexerErrorListener";

import { getAllTokens } from "./lexer-test-utils";

// Overload signatures
export function getTokensFromString(input: string): Token[];
export function getTokensFromString(
  input: string,
  opts: { withListener: true },
): { tokens: Token[]; errorListener: CRLLexerErrorListener; lexer: CRLLexer };
export function getTokensFromString(
  input: string,
  opts?: { withListener?: boolean },
): Token[] | { tokens: Token[]; errorListener: CRLLexerErrorListener; lexer: CRLLexer } {
  const { lexer, errorListener } = createLexer(input);
  const tokens = getAllTokens(lexer);
  if (opts?.withListener) {
    return { tokens, errorListener, lexer };
  }
  return tokens;
}
