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

  // Operators
  PLUS = 27,
  MINUS = 28,
  MULT = 29,
  DIV = 30,
  EQ = 31,
  NEQ = 32,
  GT = 33,
  GTE = 34,
  LT = 35,
  LTE = 36,
  ASSIGN = 37,

  // Parentheses
  LPAREN = 40,
  RPAREN = 41,

  // FHIR Types
  ACTION_FHIR_TYPE = 50,
  CASEFEATURE_FHIR_TYPE = 51,
  FHIR_VALUE_TYPE = 60,
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
  },
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
  'PLUS',
  'MINUS',
  'MULT',
  'DIV',
  'EQ',
  'NEQ',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'ASSIGN',
  'LPAREN',
  'RPAREN',
  'OR',
  'AND',
  'NOT',
  'ACTION_FHIR_TYPE',
  'CASEFEATURE_FHIR_TYPE',
  'FHIR_VALUE_TYPE',
];

/**
 * Channel names for token channel identification
 */
export const ChannelNames = ['DEFAULT_TOKEN_CHANNEL', 'HIDDEN'];

/**
 * Mode names for lexer mode identification
 */
export const ModeNames = ['DEFAULT_MODE'];
