import { CPGLLexer } from "../../grammar/generated/antlr/CPGLLexer";

/**
 * Helper function to generate token sequence for a single action block
 * @returns Array of token types for an action block
 * This only includes the repeating tokens.
 * example:
 * action "Indicate"
 *    perform ServiceRequest
 */
export function getActionTokenSequence(): number[] {
  return [CPGLLexer.PERFORM, CPGLLexer.ACTIVITY_TYPE, CPGLLexer.DOT];
}

/**
 * Helper function to generate token sequence for a concept type declaration
 * @returns Array of token types for a concept type declaration
 * example:
 * type is Observation.
 */
export function getCaseFeatureTokenSequence(): number[] {
  return [CPGLLexer.TYPE, CPGLLexer.IS, CPGLLexer.CONCEPT_TYPE, CPGLLexer.DOT];
}

/**
 * Helper function to generate token sequence for a value type declaration
 * @returns Array of token types for a value type declaration
 * example:
 * valuetype is Quantity.
 */
export function getValueTypeTokenSequence(): number[] {
  return [CPGLLexer.VALUETYPE, CPGLLexer.IS, CPGLLexer.CONCEPT_VALUE_TYPE, CPGLLexer.DOT];
}
