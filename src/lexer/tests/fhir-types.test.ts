import { CPGLLexer } from '../../grammar/generated/antlr/CPGLLexer';
import { createLexer } from '../createLexer';
import { CPGLLexerErrorListener } from '../CPGLLexerErrorListener';

import {
  getActionTokenSequence,
  getCaseFeatureTokenSequence,
  getValueTypeTokenSequence,
} from './fhir-types.helpers';

function verifyTokenSequence(
  input: string,
  expectedTokens: number[],
  expectedText: string[],
): void {
  const { lexer } = createLexer(input);
  const tokens: number[] = [];
  const text: string[] = [];

  let token = lexer.nextToken();
  while (token.type !== CPGLLexer.EOF) {
    tokens.push(token.type);
    text.push(token.text ?? '');
    token = lexer.nextToken();
  }

  expect(tokens).toEqual(expectedTokens);
  expect(text).toEqual(expectedText);
}

describe('Action FHIR Types', () => {
  test('should recognize CPGServiceRequest', () => {
    const input = 'perform CPGServiceRequest.';
    const expectedTokens = getActionTokenSequence();
    const expectedText = ['perform', 'CPGServiceRequest', '.'];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test('should recognize CPGImmunizationRequest', () => {
    const input = 'perform CPGImmunizationRequest.';
    const expectedTokens = getActionTokenSequence();
    const expectedText = ['perform', 'CPGImmunizationRequest', '.'];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test('should recognize CPGProposeDiagnosis', () => {
    const input = 'perform CPGProposeDiagnosis.';
    const expectedTokens = getActionTokenSequence();
    const expectedText = ['perform', 'CPGProposeDiagnosis', '.'];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test('should throw error for invalid action type', () => {
    const input = 'perform InvalidActivity.';
    const { lexer, errorListener } = createLexer(input);
    while (lexer.nextToken().type !== CPGLLexer.EOF) { /* empty */ }
    const errors = errorListener.getErrors();
    expect(errors.length).toBeGreaterThan(0);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.message).toContain('Invalid activity type');
  });
});

describe('Case Feature FHIR Types', () => {
  test('should recognize Observation type', () => {
    const input = 'has type Observation.';
    const expectedTokens = getCaseFeatureTokenSequence();
    const expectedText = ['has', 'type', 'Observation', '.'];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test('should recognize Condition type', () => {
    const input = 'has type Condition.';
    const expectedTokens = getCaseFeatureTokenSequence();
    const expectedText = ['has', 'type', 'Condition', '.'];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test('should recognize MedicationRequest type', () => {
    const input = 'has type MedicationRequest.';
    const expectedTokens = getCaseFeatureTokenSequence();
    const expectedText = ['has', 'type', 'MedicationRequest', '.'];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test('should throw error for invalid case feature type', () => {
    const input = 'has type InvalidType.';
    const { lexer, errorListener } = createLexer(input);
    while (lexer.nextToken().type !== CPGLLexer.EOF) { /* empty */ }
    const errors = errorListener.getErrors();
    expect(errors.length).toBeGreaterThan(0);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.message).toContain('Invalid concept type');
  });
});

describe('Concept Value Types', () => {
  test('should recognize Quantity value type', () => {
    const input = 'has valuetype Quantity.';
    const expectedTokens = getValueTypeTokenSequence();
    const expectedText = ['has', 'valuetype', 'Quantity', '.'];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test('should recognize CodeableConcept value type', () => {
    const input = 'has valuetype CodeableConcept.';
    const expectedTokens = getValueTypeTokenSequence();
    const expectedText = ['has', 'valuetype', 'CodeableConcept', '.'];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test('should recognize boolean value type', () => {
    const input = 'has valuetype boolean.';
    const expectedTokens = getValueTypeTokenSequence();
    const expectedText = ['has', 'valuetype', 'boolean', '.'];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test('should throw error for invalid value type', () => {
    const input = 'has valuetype InvalidValueType.';
    const { lexer, errorListener } = createLexer(input);
    while (lexer.nextToken().type !== CPGLLexer.EOF) { /* empty */ }
    const errors = errorListener.getErrors();
    expect(errors.length).toBeGreaterThan(0);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe('LexicalError');
    expect(errorObj.message).toContain('Invalid concept value type');
  });
});
