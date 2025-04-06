/**
 * Lexer exports for the Clinical Practice Guideline Language
 * 
 * IMPORTANT: Always use the custom CPGLLexer for token generation.
 * The generated lexer is only exported for reference and should not be used directly.
 */

// Export our custom lexer implementation
export * from './CPGLLexer';

// WARNING: Only export the generated lexer for reference purposes
// Do not use it directly for token generation
export { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';
