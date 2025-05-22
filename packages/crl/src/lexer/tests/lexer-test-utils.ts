import { Token } from "antlr4ts";

import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";

/**
 * Gets all tokens from the lexer, filtering out whitespace and comments
 */
export function getAllTokens(lexer: CRLLexer): Token[] {
  const tokens: Token[] = [];
  let token = lexer.nextToken();
  while (token.type !== Token.EOF) {
    if (
      token.type !== CRLLexer.WS &&
      token.type !== CRLLexer.COMMENT &&
      token.type !== CRLLexer.COMMENT_BLOCK
    ) {
      tokens.push(token);
    }
    token = lexer.nextToken();
  }
  return tokens;
}
