/**
 * Proxy object for accessing generated lexer constants
 * 
 * IMPORTANT: This file serves as a single source of truth for accessing
 * constants from the generated lexer. It should be used instead of directly
 * importing the generated lexer for constant access.
 * 
 * WARNING: Do not use the generated lexer directly for token generation.
 * Always use the custom CPGLLexer implementation for that purpose.
 */
import { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';

/**
 * Token type constants from the generated lexer
 * These are used for token type identification and should not be modified
 */
export const TokenTypes = {
  // Basic tokens
  EOF: GeneratedLexer.EOF,
  INDENT: GeneratedLexer.INDENT,
  DEDENT: GeneratedLexer.DEDENT,
  NEWLINE: GeneratedLexer.NEWLINE,
  STRING: GeneratedLexer.STRING,
  
  // Keywords
  DECISION: GeneratedLexer.DECISION,
  WHEN: GeneratedLexer.WHEN,
  THEN: GeneratedLexer.THEN,
  DO: GeneratedLexer.DO,
  USE: GeneratedLexer.USE,
  ANY: GeneratedLexer.ANY,
  ALL: GeneratedLexer.ALL,
  
  // FHIR types
  ACTION: GeneratedLexer.ACTION,
  ACTION_FHIR_TYPE: GeneratedLexer.ACTION_FHIR_TYPE,
  CASEFEATURE: GeneratedLexer.CASEFEATURE,
  CASEFEATURE_FHIR_TYPE: GeneratedLexer.CASEFEATURE_FHIR_TYPE,
  FHIR_VALUE_TYPE: GeneratedLexer.FHIR_VALUE_TYPE,
  FHIRTYPE: GeneratedLexer.FHIRTYPE,
  CASEFEATURECODE: GeneratedLexer.CASEFEATURECODE,
  PROFILEURL: GeneratedLexer.PROFILEURL,
  VALUETYPE: GeneratedLexer.VALUETYPE,
  
  // Error token
  ERROR: GeneratedLexer.ERROR
} as const;

/**
 * Vocabulary from the generated lexer
 * Used for token name resolution
 */
export const Vocabulary = GeneratedLexer.VOCABULARY;

/**
 * Rule names from the generated lexer
 * Used for debugging and error reporting
 */
export const RuleNames = GeneratedLexer.ruleNames;

/**
 * Channel names from the generated lexer
 * Used for token channel identification
 */
export const ChannelNames = GeneratedLexer.channelNames;

/**
 * Mode names from the generated lexer
 * Used for lexer mode identification
 */
export const ModeNames = GeneratedLexer.modeNames; 