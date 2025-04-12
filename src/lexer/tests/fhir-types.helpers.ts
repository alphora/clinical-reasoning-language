import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

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
 * Helper function to generate token sequence for a single casefeature block
 * @returns Array of token types for a casefeature block
 * This only includes the repeating tokens.
 * example:
 * concept "some other case feature"
 *    has type Observation.
 */
export function getCaseFeatureTokenSequence(): number[] {
  return [CPGLLexer.HAS, CPGLLexer.TYPE, CPGLLexer.CONCEPT_TYPE, CPGLLexer.DOT];
}

/**
 * Helper function to generate token sequence for a value type declaration
 * @returns Array of token types for a value type declaration
 * This only includes the repeating tokens.
 * example:
 * has valuetype Quantity.
 */
export function getValueTypeTokenSequence(): number[] {
  return [CPGLLexer.HAS, CPGLLexer.VALUETYPE, CPGLLexer.CONCEPT_VALUE_TYPE, CPGLLexer.DOT];
}
