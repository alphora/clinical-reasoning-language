// External dependencies
import { readFileSync } from 'fs';
import { join } from 'path';

import { CharStreams, CommonTokenStream } from 'antlr4ts';

// Internal dependencies
import { CPGLLexer } from '../grammar/generated/CPGLLexer';
import { CPGLParser } from '../grammar/generated/CPGLParser';
import { ASTValidator } from '../validation/validator';

import { ASTBuilder } from './builder';
import { File } from './types';

function parseAndValidateFile(filePath: string): void {
  try {
    // Read the input file
    const input = readFileSync(filePath, 'utf-8');
    console.log(`\nParsing file: ${filePath}`);
    console.log('Input:');
    console.log('----------------------------------------');
    console.log(input);
    console.log('----------------------------------------\n');

    // Create the lexer and parser
    const inputStream = CharStreams.fromString(input);
    const lexer = new CPGLLexer(inputStream);
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new CPGLParser(tokenStream);

    // Parse the input
    const parseTree = parser.cpgl();
    console.log('Parse tree:');
    console.log(parseTree.toStringTree(parser.ruleNames));
    console.log('\n');

    // Build the AST
    const astBuilder = new ASTBuilder();
    const ast = astBuilder.visit(parseTree) as File;
    console.log('AST:');
    console.log(JSON.stringify(ast, null, 2));
    console.log('\n');

    // Validate the AST
    const validator = new ASTValidator();
    validator.validate(ast);
    console.log('AST validation successful!');
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error:', error.message);
      if ('location' in error && typeof error.location === 'object' && error.location !== null) {
        const location = error.location as { line: number; column: number };
        console.error(`Location: line ${location.line}, column ${location.column}`);
      }
    } else {
      console.error('Unknown error:', error);
    }
    process.exit(1);
  }
}

// Get the input file path from command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Please provide a file path to parse');
  process.exit(1);
}

const filePath = join(process.cwd(), args[0]);
parseAndValidateFile(filePath);
