/* eslint-disable no-console */
import { CharStreams } from 'antlr4ts';
import { CPGLLexer } from '../lexer/CPGLLexer';
import { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';
import { CPGLToken } from '../lexer/CPGLToken';

// Example usage of the CPGL lexer
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

// Print each token
while (token.type !== GeneratedLexer.EOF) {
    const cpglToken = token as CPGLToken;
    console.log(`Token: type=${token.type} (${cpglToken.typeName}), text="${token.text}"`);
    token = lexer.nextToken();
} 