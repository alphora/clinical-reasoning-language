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

/**
 * Verifies that the sequence of tokens matches the expected types and optionally the expected text
 */
export function verifyTokenSequence(
  tokens: Token[],
  expectedTypes: number[],
  expectedTexts?: string[],
): void {
  expect(tokens.length).toBe(expectedTypes.length);
  if (expectedTexts) {
    expect(tokens.length).toBe(expectedTexts.length);
  }

  for (let i = 0; i < tokens.length; i++) {
    expect(tokens[i].type).toBe(expectedTypes[i]);
    if (expectedTexts) {
      if (
        tokens[i].type === CRLLexer.ERROR &&
        typeof tokens[i].text === "string" &&
        (tokens[i].text ?? "").trim().startsWith("{")
      ) {
        // Try to parse the error JSON and compare the .value property
        try {
          const errorObj = JSON.parse(tokens[i].text ?? "{}");
          expect(errorObj.value).toBe(expectedTexts[i] ?? "");
        } catch {
          // If parsing fails, fall back to direct comparison
          expect(tokens[i].text ?? "").toBe(expectedTexts[i] ?? "");
        }
      } else {
        expect(tokens[i].text ?? "").toBe(expectedTexts[i] ?? "");
      }
    }
  }
}
