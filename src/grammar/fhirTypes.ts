/**
 * FHIR type definitions for the Clinical Practice Guideline Language
 *
 * IMPORTANT: This file uses the generated lexer ONLY for its static constants
 * and type definitions. It does not use the lexer for token generation.
 *
 * The generated lexer is used here because it contains the canonical definitions
 * of FHIR types that are part of the language specification.
 */
import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from './generated/CPGLLexer';

// Create a dummy lexer to extract the types
const dummyLexer = new CPGLLexer(CharStreams.fromString(''));

// Get all possible FHIR types from the lexer's vocabulary
const extractFhirTypes = (tokenType: number): Set<string> => {
  const types = new Set<string>();
  const vocabulary = dummyLexer.vocabulary;

  // Get all tokens of the specified type
  for (let i = 0; i < vocabulary.maxTokenType; i++) {
    const symbolicName = vocabulary.getSymbolicName(i);
    if (symbolicName && i === tokenType) {
      // Get the literal name for this token
      const literalName = vocabulary.getLiteralName(i);
      if (literalName) {
        // Remove quotes and add to set
        types.add(literalName.replace(/['"]/g, ''));
      }
    }
  }

  return types;
};

// Export the FHIR type sets
export const ACTION_FHIR_TYPES = extractFhirTypes(CPGLLexer.ACTIVITY_TYPE);
export const CASEFEATURE_FHIR_TYPES = extractFhirTypes(CPGLLexer.CONCEPT_TYPE);
export const FHIR_VALUE_TYPES = extractFhirTypes(CPGLLexer.CONCEPT_VALUE_TYPE);
