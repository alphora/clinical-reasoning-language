/**
 * Example usage of the Clinical Practice Guideline Language
 * 
 * IMPORTANT: Always use the custom CPGLLexer for token generation.
 * The generated lexer is only imported for reference purposes.
 * 
 * This example demonstrates the proper usage of our custom lexer
 * for tokenizing CPGL input.
 */
import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { TokenTypes } from '../lexer/CPGLLexerConstants';
import { CPGLLexer } from '../lexer/CPGLLexer';
import type { CPGLToken } from '../lexer/CPGLToken';
import { CPGLParser } from '../parser/CPGLParser';

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
while (token.type !== TokenTypes.EOF) {
  const cpglToken = token as CPGLToken;
  console.log(`Token: type=${token.type} (${cpglToken.typeName}), text="${token.text}"`);
  token = lexer.nextToken();
}
