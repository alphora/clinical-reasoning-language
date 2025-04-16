import { readFileSync } from 'fs';
import { join } from 'path';

import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { ASTBuilder } from '../ast/builder';
import { CPGL } from '../ast/types';
import { CPGLParser } from '../grammar/generated/CPGLParser';
import { createLexer } from '../lexer/createLexer';
import { Validator } from '../validator/validator';

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
const ast = builder.visit(tree) as CPGL;

// Create the validator and validate the AST
const validator = new Validator();
const result = validator.validate(ast);

// Check if raw output is requested
const rawOutput = process.argv.includes('--raw');

if (rawOutput) {
  // Raw validation output
  console.log(JSON.stringify(result, null, 2));
} else {
  // Pretty validation output
  console.log('Validation Results:');
  console.log('==================');
  console.log(`Valid: ${result.isValid}`);
  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach(error => {
      console.log(
        `- ${error.message} (${error.location.start.line}:${error.location.start.column})`,
      );
    });
  }
  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(warning => {
      console.log(
        `- ${warning.message} (${warning.location.start.line}:${warning.location.start.column})`,
      );
    });
  }
}
