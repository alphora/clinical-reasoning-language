/* eslint-disable no-console */
import { CharStreams } from 'antlr4ts';

import { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';
import { CPGLLexer } from '../lexer/CPGLLexer';
import type { CPGLToken } from '../lexer/CPGLToken';

// Example CPGL document
const input = `decision "Test Decision"
    when "Condition 1" then
        do "Action 1"
    when "Condition 2" then
        do "Action 2"
        use "Another Decision"`;

console.log('Input:');
console.log(input);
console.log('\nTokens:');

// Create lexer and get tokens
const lexer = new CPGLLexer(CharStreams.fromString(input));
let token = lexer.nextToken();
let count = 0;

// Print each token
while (token.type !== GeneratedLexer.EOF && count < 50) {
  const cpglToken = token as CPGLToken;
  console.log(
    `Token #${count + 1}: type=${token.type} (${cpglToken.typeName}), text="${token.text}"`,
  );
  token = lexer.nextToken();
  count++;
}

if (token.type === GeneratedLexer.EOF) {
  console.log('Reached EOF');
} else {
  console.log('Token limit reached');
}
