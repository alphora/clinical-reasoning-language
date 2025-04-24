import { readFileSync } from 'fs';
import { join } from 'path';

import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../grammar/generated/antlr/CPGLLexer';
import { createLexer } from '../lexer/createLexer';

// Get the path to the grammar example file
const examplePath = join(__dirname, '../examples/cpgl/who/measles/IMMZ_All_Decisions.cpg');

// Read the file content
const input = readFileSync(examplePath, 'utf8');

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

// Check if pretty output is requested
const prettyOutput = process.argv.includes('--pretty');

if (!prettyOutput) {
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
