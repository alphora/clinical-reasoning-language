import { TokenTypes } from '../CPGLLexerConstants';

/**
 * Helper function to generate token sequence for a single action block
 * @returns Array of token types for an action block
 * This only includes the repeating tokens.
 * example:
 * action "Indicate"
 *    fhirtype ServiceRequest
 */
export function getActionTokenSequence(): number[] {
  return [
    TokenTypes.INDENT,
    TokenTypes.FHIRTYPE,
    TokenTypes.ACTION_FHIR_TYPE,
    TokenTypes.NEWLINE,
    TokenTypes.DEDENT,
  ];
}

/**
 * Helper function to generate token sequence for a single casefeature block
 * @returns Array of token types for a casefeature block
 * This only includes the repeating tokens.
 * example:
 * casefeature "some other case feature"
 *    casefeaturecode "some-other-case-feature"
 *    fhirtype Observation
 *    profileurl "http://somecfprofile3-uri"
 *    valuetype Quantity
 */
export function getCaseFeatureTokenSequence(): number[] {
  return [
    TokenTypes.INDENT,
    TokenTypes.CASEFEATURECODE,
    TokenTypes.STRING,
    TokenTypes.NEWLINE,
    TokenTypes.FHIRTYPE,
    TokenTypes.CASEFEATURE_FHIR_TYPE,
    TokenTypes.NEWLINE,
    TokenTypes.PROFILEURL,
    TokenTypes.STRING,
    TokenTypes.NEWLINE,
    TokenTypes.VALUETYPE,
    TokenTypes.FHIR_VALUE_TYPE,
    TokenTypes.NEWLINE,
    TokenTypes.DEDENT,
  ];
}
