import { readFileSync } from 'fs';
import { join } from 'path';

import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { CPGLAstBuilder } from '../ast/builder';
import { CPGL } from '../ast/types';
import { printAST } from '../ast/utils';
import { createLexer } from '../lexer/createLexer';
import { createParser } from '../parser/createParser';

// Read the example file
const examplePath = join(__dirname, '../examples/cpgl/who/measles/IMMZ_All_Decisions.cpg');
const input = readFileSync(examplePath, 'utf-8');

// Create the lexer and token stream
const lexer = createLexer(CharStreams.fromString(input));
const tokenStream = new CommonTokenStream(lexer);

// Create the parser
const parser = createParser(tokenStream);

// Parse the input
const tree = parser.cpgl();

// Create the AST builder and visit the parse tree
const builder = new CPGLAstBuilder();
const ast = builder.visit(tree) as CPGL;

// Check if raw output is requested
const prettyOutput = process.argv.includes('--pretty');

if (!prettyOutput) {
  // Raw AST output
  console.log(JSON.stringify(ast, null, 2));
} else {
  // Pretty AST output
  console.log('AST Representation:');
  console.log('==================');
  console.log(printAST(ast));
}
