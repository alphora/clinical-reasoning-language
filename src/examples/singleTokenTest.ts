// Import the bare minimum
import { CharStreams } from 'antlr4ts';
import { CPGLLexer } from '../lexer/CPGLLexer';

// Create a simple input
const input = 'simple test';

// Log start
console.log('Starting single token test');

// Process with try/catch blocks
try {
    console.log('Creating char stream...');
    const chars = CharStreams.fromString(input);
    console.log('Char stream created successfully');
    
    console.log('Creating lexer...');
    const lexer = new CPGLLexer(chars);
    console.log('Lexer created successfully');
    
    console.log('Getting first token...');
    try {
        // Monitor execution with detailed steps
        console.log('Before nextToken call');
        const token = lexer.nextToken();
        console.log('After nextToken call, token:', token);
        
        if (token) {
            console.log('Token details:');
            console.log('- Type:', token.type);
            console.log('- Text:', token.text);
            console.log('- Line:', token.line);
            console.log('- Column:', token.charPositionInLine);
        } else {
            console.log('No token returned (null/undefined)');
        }
    } catch (tokenError) {
        console.error('Error getting token:', tokenError);
        if (tokenError instanceof Error) {
            console.error('Stack trace:', tokenError.stack);
        }
    }
} catch (error) {
    console.error('Setup error:', error);
    if (error instanceof Error) {
        console.error('Stack trace:', error.stack);
    }
}

console.log('Single token test completed'); 