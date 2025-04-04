import { CharStreams } from 'antlr4ts';
import { CPGLLexer, CPGLTokenType } from '../lexer';

// Simple test to make sure the lexer is working correctly
const input = `decision Test`;

const chars = CharStreams.fromString(input);
const lexer = new CPGLLexer(chars);

// Try to get tokens
try {
    console.log('Starting tokenization...');
    let token = lexer.nextToken();
    console.log(`First token: type=${token.type}, text="${token.text}"`);
    
    token = lexer.nextToken();
    console.log(`Second token: type=${token.type}, text="${token.text}"`);
    
    token = lexer.nextToken();
    console.log(`Third token: type=${token.type}, text="${token.text}"`);
} catch (error) {
    console.error('Error during tokenization:', error);
} 