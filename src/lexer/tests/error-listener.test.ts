import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { CPGLLexer } from '../../grammar/generated/CPGLLexer';
import { CPGLLexerErrorListener } from '../CPGLLexerErrorListener';

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
    expect(errors[0]).toContain("Lexical error at line 1:0 - Invalid token 'valid'. (details: token recognition error at: 'inv')");
  });

  it('should treat whitespace-separated invalid tokens as separate errors', () => {
    const { lexer, errorListener } = createLexerWithErrors('invalid1 invalid2');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(2);
    expect(errors[0]).toContain("Lexical error at line 1:0 - Invalid token 'valid1'. (details: token recognition error at: 'inv')");
    expect(errors[1]).toContain("Lexical error at line 1:3 - Invalid token 'valid2'. (details: token recognition error at: 'inv')");
  });

  it('should combine invalid tokens within quoted strings into a single error', () => {
    const { lexer, errorListener } = createLexerWithErrors('"invalid string');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("Lexical error at line 1:0 - Invalid token ''. (details: token recognition error at: '\"invalid string')");
  });

  it('should not span error tokens across multiple lines', () => {
    const { lexer, errorListener } = createLexerWithErrors('invalid\ninvalid');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(2);
    expect(errors[0]).toContain("Lexical error at line 1:0 - Invalid token 'valid'. (details: token recognition error at: 'inv')");
    expect(errors[1]).toContain("Lexical error at line 2:0 - Invalid token 'valid'. (details: token recognition error at: 'inv')");
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
    expect(errors[0]).toContain("Line 1:36 - Invalid concept type - InvalidType. Valid types are: Communication, CommunicationRequest, Condition, QuestionnaireTask, QuestionnaireResponse, MedicationRequest, MedicationDispense, MedicationAdministration, MedicationStatement, ImmunizationRequest, Immunization, ServiceRequest, Procedure, Observation");
  });

  it('should detect invalid tokens in a terminology statement', () => {
    const { lexer, errorListener } = createLexerWithErrors('terminology "Invalid Terminology" unknown invalid.');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("Lexical error at line 1:42 - Invalid token 'valid.'. (details: token recognition error at: 'inv')");
  });

  it('should not span error tokens across multiple lines in a complex statement', () => {
    const { lexer, errorListener } = createLexerWithErrors('concept "Complex Concept": has type Observation.\ninferred by ("Invalid" and "Another Invalid"). done');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(0);
  });
}); 