import { Token } from "antlr4ts";

import { CPGLLexer } from "../../grammar/generated/antlr/CPGLLexer";

/**
 * Gets all tokens from the lexer, filtering out whitespace and comments
 */
export function getAllTokens(lexer: CPGLLexer): Token[] {
  const tokens: Token[] = [];
  let token = lexer.nextToken();
  while (token.type !== Token.EOF) {
    if (
      token.type !== CPGLLexer.WS &&
      token.type !== CPGLLexer.COMMENT &&
      token.type !== CPGLLexer.COMMENT_BLOCK
    ) {
      tokens.push(token);
    }
    token = lexer.nextToken();
  }
  return tokens;
}
