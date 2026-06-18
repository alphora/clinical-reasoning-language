import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";

/**
 * Helper function to generate token sequence for a single action block
 * @returns Array of token types for an action block
 * This only includes the repeating tokens.
 * example:
 * action "Indicate"
 *    request ServiceRequest
 */
export function getActionTokenSequence(): number[] {
  return [CRLLexer.REQUEST, CRLLexer.ACTIVITY_TYPE, CRLLexer.DOT];
}

/**
 * Helper function to generate token sequence for a concept type declaration
 * @returns Array of token types for a concept type declaration
 * example:
 * type is Observation.
 */
export function getCaseFeatureTokenSequence(): number[] {
  return [CRLLexer.TYPE_IS, CRLLexer.CONCEPT_TYPE, CRLLexer.DOT];
}

/**
 * Helper function to generate token sequence for a value type declaration
 * @returns Array of token types for a value type declaration
 * example:
 * value type is Quantity.
 */
export function getValueTypeTokenSequence(): number[] {
  return [CRLLexer.VALUE_TYPE_IS, CRLLexer.CONCEPT_VALUE_TYPE, CRLLexer.DOT];
}
