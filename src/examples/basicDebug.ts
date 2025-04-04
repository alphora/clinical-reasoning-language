// Import the bare minimum
import { CharStreams } from 'antlr4ts';
import { CPGLLexer } from '../lexer/CPGLLexer';

// Create a simple input
const input = 'simple test';

// Log start
console.log('Starting basic debug script');

// Try creating the CharStream
try {
    console.log('Creating char stream...');
    const chars = CharStreams.fromString(input);
    console.log('Char stream created successfully');
    
    // Try creating the lexer
    try {
        console.log('Creating lexer...');
        const lexer = new CPGLLexer(chars);
        console.log('Lexer created successfully');
        console.log('Lexer type:', typeof lexer);
        console.log('Lexer prototype chain:', Object.getPrototypeOf(lexer));
    } catch (lexerError) {
        console.error('Failed to create lexer:', lexerError);
    }
} catch (error) {
    console.error('Failed to create char stream:', error);
}

console.log('Basic debug script completed'); 