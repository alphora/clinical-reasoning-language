// Node.js built-in imports
import * as fs from 'fs';
import * as path from 'path';

// External imports
import { CharStreams, CommonTokenStream } from 'antlr4ts';

// Internal imports
import { CPGLParser } from '../grammar/generated/CPGLParser';
import { createLexer } from '../lexer/createLexer';

// Get the path to the grammar example file
const examplePath = path.join(__dirname, '../../docs/grammar-example.cpg');

// Read the file content
const input = fs.readFileSync(examplePath, 'utf8');

// Create lexer instance and token stream
const lexer = createLexer(CharStreams.fromString(input));
const tokenStream = new CommonTokenStream(lexer);

// Create parser instance
const parser = new CPGLParser(tokenStream);

// Parse the input
console.log('\nParsing grammar-example.cpg:\n');
const tree = parser.cpgl();

// Print the parse tree
console.log('Parse Tree:');
console.log(tree.toStringTree(parser.ruleNames));
