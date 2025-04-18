import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { CPGLLexer } from '../../grammar/generated/CPGLLexer';
import { CPGLLexerErrorListener } from '../CPGLLexerErrorListener';
import { getAllTokens } from './index.test';

function createLexerWithErrors(input: string): { lexer: CPGLLexer, errorListener: CPGLLexerErrorListener } {
  const charStream = CharStreams.fromString(input);
  const lexer = new CPGLLexer(charStream);
  const errorListener = new CPGLLexerErrorListener();
  lexer.removeErrorListeners();
  lexer.addErrorListener(errorListener);
  return { lexer, errorListener };
}

describe('CPGLLexerErrorListener', () => {
  it('should detect individual invalid tokens', () => {
    const { lexer, errorListener } = createLexerWithErrors('invalid');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.message).toContain('Invalid token:');
    expect(errorObj.details.message).toContain('token recognition error');
  });

  it('should treat whitespace-separated invalid tokens as separate errors', () => {
    const { lexer, errorListener } = createLexerWithErrors('invalid1 invalid2');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(2);
    const errorObj1 = JSON.parse(errors[0]);
    const errorObj2 = JSON.parse(errors[1]);
    expect(errorObj1.type).toBe('LexicalError');
    expect(errorObj2.type).toBe('LexicalError');
    expect(errorObj1.message).toContain('Invalid token:');
    expect(errorObj2.message).toContain('Invalid token:');
    expect(errorObj1.details.message).toContain('token recognition error');
    expect(errorObj2.details.message).toContain('token recognition error');
  });

  it('should combine invalid tokens within quoted strings into a single error', () => {
    const { lexer, errorListener } = createLexerWithErrors('"invalid string');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.details.message).toContain('token recognition error');
  });

  it('should not span error tokens across multiple lines', () => {
    const { lexer, errorListener } = createLexerWithErrors('invalid\ninvalid');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(2);
    const errorObj1 = JSON.parse(errors[0]);
    const errorObj2 = JSON.parse(errors[1]);
    expect(errorObj1.type).toBe('LexicalError');
    expect(errorObj2.type).toBe('LexicalError');
    expect(errorObj1.message).toContain('Invalid token:');
    expect(errorObj2.message).toContain('Invalid token:');
  });
});

describe('CPGLLexerErrorListener with CPGL-specific input', () => {
  it('should detect invalid tokens in a decision statement', () => {
    const { lexer, errorListener } = createLexerWithErrors('decision "Invalid Decision": when "Invalid Concept" then do "Invalid Action". done');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(0);
  });

  it('should handle invalid tokens within a concept definition', () => {
    const { lexer, errorListener } = createLexerWithErrors('concept "Invalid Concept": has type InvalidType. done');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.message).toContain('Invalid concept type: InvalidType');
  });

  it('should detect invalid tokens in a terminology statement', () => {
    const { lexer, errorListener } = createLexerWithErrors('terminology "Invalid Terminology" unknown invalid.');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.message).toContain('Invalid token:');
  });

  it('should not span error tokens across multiple lines in a complex statement', () => {
    const { lexer, errorListener } = createLexerWithErrors('concept "Complex Concept": has type Observation.\ninferred by ("Invalid" and "Another Invalid"). done');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(0);
  });

  it('should detect invalid activity type', () => {
    const { lexer, errorListener } = createLexerWithErrors('perform invalidActivity');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.message).toContain('Invalid activity type: invalidActivity');
  });

  it('should handle invalid concept type', () => {
    const { lexer, errorListener } = createLexerWithErrors('concept "Invalid Concept": has type InvalidType. done');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.message).toContain('Invalid concept type: InvalidType');
  });

  it('should handle invalid concept value type', () => {
    const { lexer, errorListener } = createLexerWithErrors('concept "Invalid Concept": has valuetype InvalidValueType. done');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.message).toContain('Invalid concept value type: InvalidValueType');
  });

  it('should handle invalid character in activity type', () => {
    const { lexer, errorListener } = createLexerWithErrors('CPGAdministerMedication@');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.message).toContain('Invalid character in activity type:');
  });

  it('should handle invalid character in concept type', () => {
    const { lexer, errorListener } = createLexerWithErrors('Communication@');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.message).toContain('Invalid character in concept type:');
  });

  it('should handle invalid character in concept value type', () => {
    const { lexer, errorListener } = createLexerWithErrors('Quantity@');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.message).toContain('Invalid character in concept value type:');
  });

  it('[DEBUGGING] should print tokens for perform CPGAdministerMedication@', () => {
    const { lexer } = createLexerWithErrors('perform CPGAdministerMedication@');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const tokens = tokenStream.getTokens();
    for (const token of tokens) {
      // Print token type and text for debugging
      // eslint-disable-next-line no-console
      console.log(`[DEBUGGING] Token type: ${token.type}, text: '${token.text}'`);
    }
  });
}); 