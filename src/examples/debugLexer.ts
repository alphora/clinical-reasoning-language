/* eslint-disable no-console */
import { CharStream, CharStreams } from 'antlr4ts';
import { CPGLLexer } from '../lexer/CPGLLexer';
import { CPGLTokenType } from '../lexer/CPGLTokenType';

console.log('Starting debug script');

// Create a simple input
const input = 'decision Test';
console.log(`Input: "${input}"`);

try {
    console.log('Creating char stream...');
    const chars: CharStream = CharStreams.fromString(input);
    console.log('Char stream created successfully');

    console.log('Creating lexer...');
    const lexer = new CPGLLexer(chars);
    console.log('Lexer created successfully');

    // Get tokens one by one with error handling
    console.log('Tokenizing...');
    
    let tokenCount = 0;
    let token;
    
    try {
        // Use a finite loop with a condition instead of "while (true)"
        const MAX_TOKENS = 20;
        while (tokenCount < MAX_TOKENS) {
            console.log(`Fetching token #${tokenCount + 1}...`);
            token = lexer.nextToken();
            
            if (!token) {
                console.log('Null token returned');
                break;
            }
            
            if (token.type === CPGLTokenType.EOF) {
                console.log('EOF token reached');
                break;
            }
            
            console.log(`Token #${tokenCount + 1}: type=${token.type} (${CPGLTokenType[token.type] || 'unknown'}), text="${token.text}"`);
            tokenCount++;
        }
    } catch (tokenError) {
        console.error('Error during token fetching:', tokenError);
    }
    
    console.log(`Tokenization complete. ${tokenCount} tokens found.`);
    
} catch (error) {
    console.error('Top-level error:', error);
}

console.log('Debug script completed'); 