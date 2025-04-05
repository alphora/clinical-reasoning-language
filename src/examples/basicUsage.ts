import { CharStreams } from 'antlr4ts';
import { CPGLLexer } from '../lexer/CPGLLexer';
import { CPGLTokenType } from '../lexer/CPGLTokenType';
import { CPGLParser } from '../parser/CPGLParser';

// Example 1: Basic lexer usage
function tokenizeInput(input: string) {
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = [];
    
    let token = lexer.nextToken();
    while (token.type !== CPGLTokenType.EOF) {
        tokens.push({
            type: CPGLTokenType[token.type],
            text: token.text
        });
        token = lexer.nextToken();
    }
    
    return tokens;
}

// Example 2: Basic parser usage
function parseInput(input: string) {
    const parser = new CPGLParser(input);
    parser.parse();
}

// Example usage
const exampleInput = `
decision "Test Decision"
  when "condition" then
    do "action1"
    do "action2"
  use "other_decision"
`;

console.log('=== Tokenizing Example ===');
const tokens = tokenizeInput(exampleInput);
console.log('Tokens:', JSON.stringify(tokens, null, 2));

console.log('\n=== Parsing Example ===');
parseInput(exampleInput); 