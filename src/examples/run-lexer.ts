// Node.js built-in imports
import * as fs from 'fs';
import * as path from 'path';

// External imports
import { CharStreams } from 'antlr4ts';

// Internal imports
import { CPGLLexer } from '../grammar/generated/CPGLLexer';
import { CPGLLexerErrorListener } from '../lexer/CPGLLexerErrorListener';

// Get the path to the grammar example file
const examplePath = path.join(__dirname, '../../docs/grammar-example.cpg');

// Read the file content
const input = fs.readFileSync(examplePath, 'utf8');

// Create lexer instance
const lexer = new CPGLLexer(CharStreams.fromString(input));
lexer.removeErrorListeners();
lexer.addErrorListener(new CPGLLexerErrorListener());

// Get all tokens
console.log('\nTokenizing grammar-example.cpg:\n');
console.log('Line | Column | Type | Text');
console.log('-----|--------|------|------');

let token = lexer.nextToken();
let lastLine = 0;

while (token.type !== CPGLLexer.EOF) {
  // Only show tokens on the default channel (skip comments and whitespace)
  if (token.channel === 0) {
    // Add a blank line when we move to a new line
    if (token.line !== lastLine) {
      console.log();
      lastLine = token.line;
    }

    // Get token type name
    const typeName = lexer.vocabulary.getSymbolicName(token.type) ?? `Unknown (${token.type})`;

    // Print token info
    console.log(
      `${token.line.toString().padStart(4)} | ${token.charPositionInLine.toString().padStart(6)} | ${typeName.padEnd(20)} | "${token.text}"`,
    );
  }

  token = lexer.nextToken();
}
