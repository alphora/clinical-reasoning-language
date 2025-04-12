// Node.js built-in imports
import * as fs from 'fs';
import * as path from 'path';

// External imports
import { CharStreams, CommonTokenStream } from 'antlr4ts';

// Internal imports
import { CPGLLexer } from '../grammar/generated/CPGLLexer';
import { CPGLParser } from '../grammar/generated/CPGLParser';
import { CPGLLexerErrorListener } from '../lexer/CPGLLexerErrorListener';

// Get the path to the grammar example file
const examplePath = path.join(__dirname, '../../docs/grammar-example.cpg');

// Read the file content
const input = fs.readFileSync(examplePath, 'utf8');

// Create lexer instance with error listener
const lexer = new CPGLLexer(CharStreams.fromString(input));
lexer.removeErrorListeners();
lexer.addErrorListener(new CPGLLexerErrorListener());

// Create token stream
const tokenStream = new CommonTokenStream(lexer);

// Create parser instance
const parser = new CPGLParser(tokenStream);

// Parse the input
console.log('\nParsing grammar-example.cpg:\n');
const tree = parser.cpgl();

// Print the parse tree
console.log('Parse Tree:');
console.log(tree.toStringTree(parser.ruleNames));
