import { readFileSync } from 'fs';
import { join } from 'path';

import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { ASTBuilder } from '../ast/builder';
import { File } from '../ast/types';
import { printAST } from '../ast/utils';
import { CPGLParser } from '../grammar/generated/CPGLParser';
import { createLexer } from '../lexer/createLexer';

// Read the example file
const examplePath = join(__dirname, '../../docs/grammar-example.cpg');
const input = readFileSync(examplePath, 'utf-8');

// Create the lexer and token stream
const lexer = createLexer(CharStreams.fromString(input));
const tokenStream = new CommonTokenStream(lexer);

// Create the parser
const parser = new CPGLParser(tokenStream);

// Parse the input
const tree = parser.cpgl();

// Create the AST builder and visit the parse tree
const builder = new ASTBuilder();
const ast = builder.visit(tree) as File;

// Check if raw output is requested
const rawOutput = process.argv.includes('--raw');

if (rawOutput) {
  // Raw AST output
  console.log(JSON.stringify(ast, null, 2));
} else {
  // Pretty AST output
  console.log('AST Representation:');
  console.log('==================');
  console.log(printAST(ast));
}
