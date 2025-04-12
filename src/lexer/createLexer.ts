import { CharStream } from 'antlr4ts';

import { CPGLLexer } from '../grammar/generated/CPGLLexer';

export function createLexer(input: CharStream): CPGLLexer {
  return new CPGLLexer(input);
}
