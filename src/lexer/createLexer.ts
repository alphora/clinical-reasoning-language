import { CharStream } from 'antlr4ts';

import { CPGLLexer } from '../grammar/generated/CPGLLexer';

import { CPGLLexerErrorListener } from './CPGLLexerErrorListener';

export function createLexer(input: CharStream): CPGLLexer {
  const lexer = new CPGLLexer(input);
  lexer.removeErrorListeners();
  lexer.addErrorListener(new CPGLLexerErrorListener());
  return lexer;
}
