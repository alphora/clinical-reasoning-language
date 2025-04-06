/* eslint-disable no-console */
import { CharStreams } from 'antlr4ts';
import { TokenTypes } from '../lexer/CPGLLexerConstants';
import { CPGLLexer } from '../lexer/CPGLLexer';
import { CPGLToken } from '../lexer/CPGLToken';

/**
 * Debug utility for the CPGL lexer
 * 
 * IMPORTANT: This example demonstrates the correct usage of our custom lexer.
 * It should NOT use the generated lexer directly for token generation.
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
  let tokenCount = 0;

  // Print each token
  let token = lexer.nextToken() as CPGLToken;
  while (token.type !== TokenTypes.EOF && tokenCount < 50) {
    console.log(`Token: ${token.typeName} = "${token.text}"`);
    token = lexer.nextToken() as CPGLToken;
    tokenCount++;
  }

  if (token.type === TokenTypes.EOF) {
    console.log('Reached end of input');
  } else {
    console.log('Stopped after 50 tokens');
  }
}

// Example usage
const input = `
decision "test"
  when "condition"
    then "action"
`;

debugLexer(input);
