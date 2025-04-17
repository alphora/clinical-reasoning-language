import { TokenStream } from 'antlr4ts';
import { CPGLParser } from '../grammar/generated/CPGLParser';
import { CustomParserErrorListener } from './CustomParserErrorListener';

export function createParser(input: TokenStream): CPGLParser {
  const parser = new CPGLParser(input);
  parser.removeErrorListeners();
  parser.addErrorListener(new CustomParserErrorListener());
  return parser;
} 