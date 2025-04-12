import { CharStream, CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

import {
  getActionTokenSequence,
  getCaseFeatureTokenSequence,
  getValueTypeTokenSequence,
} from './fhir-types.helpers';

function verifyTokenSequence(
  input: CharStream,
  expectedTokens: number[],
  expectedText: string[],
): void {
  const lexer = new CPGLLexer(input);
  const tokens = [];
  const text = [];

  let token = lexer.nextToken();
  while (token.type !== CPGLLexer.EOF) {
    tokens.push(token.type);
    text.push(token.text || '');
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
    verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
  });

  test('should recognize CPGImmunization', () => {
    const input = 'perform CPGImmunization.';
    const expectedTokens = getActionTokenSequence();
    const expectedText = ['perform', 'CPGImmunization', '.'];
    verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
  });

  test('should recognize CPGProposeDiagnosis', () => {
    const input = 'perform CPGProposeDiagnosis.';
    const expectedTokens = getActionTokenSequence();
    const expectedText = ['perform', 'CPGProposeDiagnosis', '.'];
    verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
  });

  test('should throw error for invalid action type', () => {
    const input = 'perform InvalidActivity.';
    expect(() => {
      const expectedTokens = getActionTokenSequence();
      const expectedText = ['perform', 'InvalidActivity', '.'];
      verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
    }).toThrow();
  });
});

describe('Case Feature FHIR Types', () => {
  test('should recognize Observation type', () => {
    const input = 'has type Observation.';
    const expectedTokens = getCaseFeatureTokenSequence();
    const expectedText = ['has', 'type', 'Observation', '.'];
    verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
  });

  test('should recognize Condition type', () => {
    const input = 'has type Condition.';
    const expectedTokens = getCaseFeatureTokenSequence();
    const expectedText = ['has', 'type', 'Condition', '.'];
    verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
  });

  test('should recognize MedicationRequest type', () => {
    const input = 'has type MedicationRequest.';
    const expectedTokens = getCaseFeatureTokenSequence();
    const expectedText = ['has', 'type', 'MedicationRequest', '.'];
    verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
  });

  test('should throw error for invalid case feature type', () => {
    const input = 'has type InvalidType.';
    expect(() => {
      const expectedTokens = getCaseFeatureTokenSequence();
      const expectedText = ['has', 'type', 'InvalidType', '.'];
      verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
    }).toThrow();
  });
});

describe('Concept Value Types', () => {
  test('should recognize Quantity value type', () => {
    const input = 'has valuetype Quantity.';
    const expectedTokens = getValueTypeTokenSequence();
    const expectedText = ['has', 'valuetype', 'Quantity', '.'];
    verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
  });

  test('should recognize CodeableConcept value type', () => {
    const input = 'has valuetype CodeableConcept.';
    const expectedTokens = getValueTypeTokenSequence();
    const expectedText = ['has', 'valuetype', 'CodeableConcept', '.'];
    verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
  });

  test('should recognize boolean value type', () => {
    const input = 'has valuetype boolean.';
    const expectedTokens = getValueTypeTokenSequence();
    const expectedText = ['has', 'valuetype', 'boolean', '.'];
    verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
  });

  test('should throw error for invalid value type', () => {
    const input = 'has valuetype InvalidValueType.';
    expect(() => {
      const expectedTokens = getValueTypeTokenSequence();
      const expectedText = ['has', 'valuetype', 'InvalidValueType', '.'];
      verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
    }).toThrow();
  });
});
