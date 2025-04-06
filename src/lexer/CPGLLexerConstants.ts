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
/**
 * Custom Token Types for CPGL Lexer
 * 
 * This enum defines all token types used by our custom lexer implementation.
 * These values are independent of any generated lexer to avoid direct dependencies.
 */
export enum TokenTypes {
    // Basic tokens
    EOF = -1,
    INDENT = 1,
    DEDENT = 2,
    NEWLINE = 3,
    STRING = 4,

    // Keywords
    DECISION = 10,
    WHEN = 11,
    THEN = 12,
    DO = 13,
    USE = 14,
    ANY = 15,
    ALL = 16,
    NOT = 17,
    AND = 18,
    OR = 19,
    ACTION = 20,
    CASEFEATURE = 21,
    CASEFEATURECODE = 22,
    PROFILEURL = 23,
    FHIRTYPE = 24,
    VALUETYPE = 25,
    EXPRESSION = 26,

    // Parentheses
    LPAREN = 30,
    RPAREN = 31,

    // FHIR Types
    ACTION_FHIR_TYPE = 40,
    CASEFEATURE_FHIR_TYPE = 41,
    CONDITION_FHIR_TYPE = 42,
    OBSERVATION_FHIR_TYPE = 43,
    SERVICE_REQUEST_FHIR_TYPE = 44,
    MEDICATION_REQUEST_FHIR_TYPE = 45,

    // Value Types
    FHIR_VALUE_TYPE = 50,
    BOOLEAN_VALUE_TYPE = 51,
    DATETIME_VALUE_TYPE = 52,
    QUANTITY_VALUE_TYPE = 53,
    STRING_VALUE_TYPE = 54,
    INTEGER_VALUE_TYPE = 55,
    DECIMAL_VALUE_TYPE = 56,
    DATE_VALUE_TYPE = 57,
    TIME_VALUE_TYPE = 58,
    CODE_VALUE_TYPE = 59,
    CODING_VALUE_TYPE = 60,
    CODEABLECONCEPT_VALUE_TYPE = 61,
    RATIO_VALUE_TYPE = 62,
    PERIOD_VALUE_TYPE = 63,
    RANGE_VALUE_TYPE = 64,
    REFERENCE_VALUE_TYPE = 65
}

/**
 * Vocabulary for token name resolution
 */
export const Vocabulary = {
  maxTokenType: Math.max(...Object.values(TokenTypes).filter(x => typeof x === 'number')),
  getDisplayName: (tokenType: number): string => {
    const entry = Object.entries(TokenTypes).find(([_, value]) => value === tokenType);
    return entry ? entry[0] : 'UNKNOWN';
  },
  getLiteralName: (tokenType: number): string | null => {
    const name = Object.entries(TokenTypes).find(([_, value]) => value === tokenType)?.[0];
    return name ? name : null;
  },
  getSymbolicName: (tokenType: number): string | null => {
    const name = Object.entries(TokenTypes).find(([_, value]) => value === tokenType)?.[0];
    return name ? name : null;
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
  'CONDITION_FHIR_TYPE',
  'OBSERVATION_FHIR_TYPE',
  'SERVICE_REQUEST_FHIR_TYPE',
  'MEDICATION_REQUEST_FHIR_TYPE',
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