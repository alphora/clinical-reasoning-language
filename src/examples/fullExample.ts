/* eslint-disable no-console */
/**
 * Full example demonstrating CPGL lexer usage
 * 
 * IMPORTANT: This example demonstrates the correct usage of our custom lexer.
 * It should NOT use the generated lexer directly for token generation.
 */
import { CharStreams } from 'antlr4ts';
import { TokenTypes } from '../lexer/CPGLLexerConstants';
import { CPGLLexer } from '../lexer/CPGLLexer';
import { CPGLToken } from '../lexer/CPGLToken';

const input = `
decision "test"
  when "condition"
    then "action"
`;

const lexer = new CPGLLexer(CharStreams.fromString(input));
let count = 0;

console.log('Tokenizing input:');
console.log(input);

let token = lexer.nextToken() as CPGLToken;
while (token.type !== TokenTypes.EOF && count < 50) {
  console.log(`Token: ${token.typeName} = "${token.text}"`);
  token = lexer.nextToken() as CPGLToken;
  count++;
}

if (token.type === TokenTypes.EOF) {
  console.log('Reached end of input');
} else {
  console.log('Stopped after 50 tokens');
}
