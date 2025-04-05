import { CPGLLexer } from '../lexer';
import { CPGLParser } from '../parser/CPGLParser';
import { CharStreams } from 'antlr4ts';

const input = `
decision "Test Decision"
  when "condition" then
    do "action1"
    do "action2"
  use "other_decision"
`;

console.log('=== Tokenizing Example ===');
const lexer = new CPGLLexer(CharStreams.fromString(input));
const tokens = [];
let token = lexer.nextToken();
while (token.type !== -1) { // -1 is EOF
    tokens.push({
        type: lexer.ruleNames[token.type - 1],
        text: token.text
    });
    token = lexer.nextToken();
}
console.log('Tokens:', JSON.stringify(tokens, null, 2));

console.log('\n=== Parsing Example ===');
const parser = new CPGLParser(input);
const ast = parser.parse();
console.log('AST:', JSON.stringify(ast, null, 2)); 