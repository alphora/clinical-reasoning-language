import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { CPGLParser } from '../../grammar/generated/CPGLParser';
import { createLexer } from '../../lexer/createLexer';
import { ASTBuilder } from '../builder';
import { File } from '../types';

export const parseInput = (input: string): File => {
  const lexer = createLexer(CharStreams.fromString(input));
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new CPGLParser(tokenStream);
  const tree = parser.cpgl();
  const builder = new ASTBuilder();
  return builder.visitCpgl(tree);
};
