/* eslint-disable no-console */
import { CharStreams } from 'antlr4ts';

import { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';
import { CPGLLexer } from '../lexer/CPGLLexer';
import type { CPGLToken } from '../lexer/CPGLToken';

/**
 * Debug utility to help visualize how the lexer tokenizes input
 */
function debugLexer(input: string): void {
  console.log('Input:', input);
  console.log('Length:', input.length);
  console.log('Char codes:');

  // Print character codes for each character
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const code = input.charCodeAt(i);
    let display = char;

    // Make whitespace visible
    switch (char) {
      case ' ':
        display = '␣';
        break;
      case '\t':
        display = '⇥';
        break;
      case '\n':
        display = '↵';
        break;
      case '\r':
        display = '⏎';
        break;
    }

    console.log(`  ${i}: '${display}' (${code})`);
  }

  console.log('\nTokens:');

  // Create lexer and get tokens
  const lexer = new CPGLLexer(CharStreams.fromString(input));
  let token = lexer.nextToken();
  let tokenCount = 0;

  // Print each token
  while (token.type !== GeneratedLexer.EOF && tokenCount < 50) {
    const cpglToken = token as CPGLToken;
    console.log(
      `Token #${tokenCount + 1}: type=${token.type} (${cpglToken.typeName}), text="${token.text}"`,
    );
    token = lexer.nextToken();
    tokenCount++;
  }

  if (token.type === GeneratedLexer.EOF) {
    console.log('Reached EOF');
  } else {
    console.log('Token limit reached');
  }
}

// Example usage
const input = `decision "Test Decision"
    when "Condition 1" then
        do "Action 1"
    when "Condition 2" then
        do "Action 2"
        use "Another Decision"`;

debugLexer(input);
