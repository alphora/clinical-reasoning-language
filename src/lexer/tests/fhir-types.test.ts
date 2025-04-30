import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";
import { createLexer } from "../createLexer";

import {
  getActionTokenSequence,
  getCaseFeatureTokenSequence,
  getValueTypeTokenSequence,
} from "./fhir-types.helpers";

function verifyTokenSequence(
  input: string,
  expectedTokens: number[],
  expectedText: string[],
): void {
  const { lexer } = createLexer(input);
  const tokens: number[] = [];
  const text: string[] = [];

  let token = lexer.nextToken();
  while (token.type !== CRLLexer.EOF) {
    tokens.push(token.type);
    text.push(token.text ?? "");
    token = lexer.nextToken();
  }

  expect(tokens).toEqual(expectedTokens);
  expect(text).toEqual(expectedText);
}

describe("Action FHIR Types", () => {
  test("should recognize CPGServiceRequest", () => {
    const input = "perform CPGServiceRequest.";
    const expectedTokens = getActionTokenSequence();
    const expectedText = ["perform", "CPGServiceRequest", "."];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test("should recognize CPGImmunizationRequest", () => {
    const input = "perform CPGImmunizationRequest.";
    const expectedTokens = getActionTokenSequence();
    const expectedText = ["perform", "CPGImmunizationRequest", "."];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test("should recognize CPGProposeDiagnosis", () => {
    const input = "perform CPGProposeDiagnosis.";
    const expectedTokens = getActionTokenSequence();
    const expectedText = ["perform", "CPGProposeDiagnosis", "."];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test("should throw error for invalid action type", () => {
    const input = "perform InvalidActivity.";
    const { lexer, errorListener } = createLexer(input);
    while (lexer.nextToken().type !== CRLLexer.EOF) {
      /* empty */
    }
    const errors = errorListener.getErrors();
    expect(errors.length).toBeGreaterThan(0);
    const errorObj = errors[0];
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid activity type");
  });
});

describe("Case Feature FHIR Types", () => {
  test("should recognize Observation type", () => {
    const input = "type is Observation.";
    const expectedTokens = getCaseFeatureTokenSequence();
    const expectedText = ["type", "is", "Observation", "."];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test("should recognize Condition type", () => {
    const input = "type is Condition.";
    const expectedTokens = getCaseFeatureTokenSequence();
    const expectedText = ["type", "is", "Condition", "."];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test("should recognize MedicationRequest type", () => {
    const input = "type is MedicationRequest.";
    const expectedTokens = getCaseFeatureTokenSequence();
    const expectedText = ["type", "is", "MedicationRequest", "."];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test("should throw error for invalid case feature type", () => {
    const input = "type is InvalidType.";
    const { lexer, errorListener } = createLexer(input);
    while (lexer.nextToken().type !== CRLLexer.EOF) {
      /* empty */
    }
    const errors = errorListener.getErrors();
    expect(errors.length).toBeGreaterThan(0);
    const errorObj = errors[0];
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid concept type");
  });
});

describe("Concept Value Types", () => {
  test("should recognize Quantity value type", () => {
    const input = "valuetype is Quantity.";
    const expectedTokens = getValueTypeTokenSequence();
    const expectedText = ["valuetype", "is", "Quantity", "."];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test("should recognize CodeableConcept value type", () => {
    const input = "valuetype is CodeableConcept.";
    const expectedTokens = getValueTypeTokenSequence();
    const expectedText = ["valuetype", "is", "CodeableConcept", "."];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test("should recognize boolean value type", () => {
    const input = "valuetype is boolean.";
    const expectedTokens = getValueTypeTokenSequence();
    const expectedText = ["valuetype", "is", "boolean", "."];
    verifyTokenSequence(input, expectedTokens, expectedText);
  });

  test("should throw error for invalid value type", () => {
    const input = "valuetype is InvalidValueType.";
    const { lexer, errorListener } = createLexer(input);
    while (lexer.nextToken().type !== CRLLexer.EOF) {
      /* empty */
    }
    const errors = errorListener.getErrors();
    expect(errors.length).toBeGreaterThan(0);
    const errorObj = errors[0];
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid concept value type");
  });
});
