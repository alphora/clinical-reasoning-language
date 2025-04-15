// Node.js built-in imports
import * as fs from 'fs';
import * as path from 'path';

// External imports
import { CharStreams } from 'antlr4ts';

// Internal imports
import { CPGLLexer } from '../grammar/generated/CPGLLexer';
import { createLexer } from '../lexer/createLexer';

// Get the path to the grammar example file
const examplePath = path.join(__dirname, '../../docs/grammar-example.cpg');

// Read the file content
const input = fs.readFileSync(examplePath, 'utf8');

// Create lexer instance
const lexer = createLexer(CharStreams.fromString(input));

// Get all tokens
const tokens: Array<{
  line: number;
  column: number;
  type: string;
  text: string;
}> = [];

let token = lexer.nextToken();
while (token.type !== CPGLLexer.EOF) {
  // Only show tokens on the default channel (skip comments and whitespace)
  if (token.channel === 0) {
    // Get token type name
    const typeName = lexer.vocabulary.getSymbolicName(token.type) ?? `Unknown (${token.type})`;

    tokens.push({
      line: token.line,
      column: token.charPositionInLine,
      type: typeName,
      text: token.text ?? '',
    });
  }

  token = lexer.nextToken();
}

// Check if raw output is requested
const rawOutput = process.argv.includes('--raw');

if (rawOutput) {
  // Raw lexer output
  console.log(JSON.stringify(tokens, null, 2));
} else {
  // Pretty lexer output
  console.log('\nTokenizing grammar-example.cpg:\n');
  console.log('Line | Column | Type | Text');
  console.log('-----|--------|------|------');

  let lastLine = 0;
  tokens.forEach(token => {
    // Add a blank line when we move to a new line
    if (token.line !== lastLine) {
      console.log();
      lastLine = token.line;
    }

    // Print token info
    console.log(
      `${token.line.toString().padStart(4)} | ${token.column.toString().padStart(6)} | ${token.type.padEnd(20)} | "${token.text}"`,
    );
  });
}
