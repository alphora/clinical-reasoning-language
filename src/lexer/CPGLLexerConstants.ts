/**
 * Proxy object for accessing generated lexer constants
 * 
 * IMPORTANT: This file serves as a single source of truth for accessing
 * constants from the generated lexer. It should be used instead of directly
 * importing the generated lexer for constant access.
 * 
 * WARNING: Do not use the generated lexer directly for token generation.
 * Always use the custom CPGLLexer implementation for that purpose.
 * 
 * Note: Error handling in the lexer is done through exceptions rather than
 * error tokens. The lexer will throw an exception when it encounters invalid
 * input that cannot be tokenized.
 */
import { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';

/**
 * Token type constants for the CPGL lexer
 * 
 * These constants define all the token types needed to tokenize CPGL input
 * according to the grammar and example requirements.
 * 
 * ⚠️ IMPORTANT: This is a custom lexer implementation. DO NOT use the generated lexer files
 * from ANTLR (src/grammar/generated/*). The generated lexer is only used as a reference
 * for the grammar structure. All lexing functionality should be implemented in our custom
 * CPGLLexer class.
 */
export const TokenTypes = {
  // Basic tokens
  EOF: -1,
  INDENT: 1,
  DEDENT: 2,
  NEWLINE: 3,
  STRING: 4,
  
  // Keywords
  DECISION: 10,
  WHEN: 11,
  THEN: 12,
  DO: 13,
  USE: 14,
  ANY: 15,
  ALL: 16,
  ACTION: 17,
  FHIRTYPE: 18,
  CASEFEATURE: 19,
  CASEFEATURECODE: 20,
  PROFILEURL: 21,
  VALUETYPE: 22,
  EXPRESSION: 23,
  
  // Symbols
  LPAREN: 30,
  RPAREN: 31,
  
  // Boolean operators
  OR: 40,
  AND: 41,
  NOT: 42,
  
  // FHIR types
  ACTION_FHIR_TYPE: 50,
  CASEFEATURE_FHIR_TYPE: 51,
  FHIR_VALUE_TYPE: 52
} as const;

/**
 * Vocabulary for token name resolution
 */
export const Vocabulary = {
  getDisplayName: (tokenType: number): string => {
    const entry = Object.entries(TokenTypes).find(([_, value]) => value === tokenType);
    return entry ? entry[0] : 'UNKNOWN';
  }
};

/**
 * Rule names for debugging and error reporting
 */
export const RuleNames = [
  'INDENT',
  'DEDENT',
  'NEWLINE',
  'STRING',
  'DECISION',
  'WHEN',
  'THEN',
  'DO',
  'USE',
  'ANY',
  'ALL',
  'ACTION',
  'FHIRTYPE',
  'CASEFEATURE',
  'CASEFEATURECODE',
  'PROFILEURL',
  'VALUETYPE',
  'EXPRESSION',
  'LPAREN',
  'RPAREN',
  'OR',
  'AND',
  'NOT',
  'ACTION_FHIR_TYPE',
  'CASEFEATURE_FHIR_TYPE',
  'FHIR_VALUE_TYPE'
];

/**
 * Channel names for token channel identification
 */
export const ChannelNames = [
  'DEFAULT_TOKEN_CHANNEL',
  'HIDDEN'
];

/**
 * Mode names for lexer mode identification
 */
export const ModeNames = [
  'DEFAULT_MODE'
]; 