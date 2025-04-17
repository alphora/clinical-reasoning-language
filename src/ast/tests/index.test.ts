import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { CPGLParser } from '../../grammar/generated/CPGLParser';
import { createLexer } from '../../lexer/createLexer';
import { CPGLAstBuilder } from '../builder';
import { CPGL } from '../types';

// Test suite imports
import './builder.test';
import './decision-structure.test';
import './concept-structure.test';
import './terminology-structure.test';
import './activity-structure.test';

export const parseInput = (input: string): CPGL => {
  const lexer = createLexer(CharStreams.fromString(input));
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new CPGLParser(tokenStream);
  const tree = parser.cpgl();
  const builder = new CPGLAstBuilder();
  return builder.visitCpgl(tree);
};
