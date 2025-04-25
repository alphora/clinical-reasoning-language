import { createLexer } from '../createLexer';
import { getAllTokens } from './index.test';
import { CPGLLexer } from '../../grammar/generated/antlr/CPGLLexer';
import { CPGLLexerErrorListener } from '../CPGLLexerErrorListener';
import { Token } from 'antlr4ts';

// Overload signatures
export function getTokensFromString(input: string): Token[];
export function getTokensFromString(input: string, opts: { withListener: true }): { tokens: Token[], errorListener: CPGLLexerErrorListener, lexer: CPGLLexer };
export function getTokensFromString(input: string, opts?: { withListener?: boolean }) {
  const { lexer, errorListener } = createLexer(input);
  const tokens = getAllTokens(lexer);
  if (opts?.withListener) {
    return { tokens, errorListener, lexer };
  }
  return tokens;
} 