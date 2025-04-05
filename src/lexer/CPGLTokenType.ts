/**
 * Token types for the Clinical Practice Guideline Language (CPGL)
 */
export enum CPGLTokenType {
    // Special tokens
    EOF = -1,
    ERROR = 0,

    // Keywords (T__0 through T__10 in generated parser)
    DECISION = 1,      // T__0: 'decision'
    WHEN = 2,         // T__1: 'when'
    THEN = 3,         // T__2: 'then'
    DO = 4,           // T__3: 'do'
    USE = 5,          // T__4: 'use'
    ACTION = 6,       // T__5: 'action'
    FHIRTYPE = 7,     // T__6: 'fhirtype'
    CASEFEATURE = 8,  // T__7: 'casefeature'
    CODE = 9,         // T__8: 'code'
    URL = 10,         // T__9: 'url'
    VALUETYPE = 11,   // T__10: 'valuetype'

    // Literals and other tokens
    STRING = 12,
    IDENTIFIER = 13,
    NEWLINE = 14,
    WS = 15,
    COMMENT = 16,
    COMMENT_BLOCK = 17,
    INDENT = 18,
    DEDENT = 19,
    
    // Operators
    EQUALS = 20,
    NOT_EQUALS = 21,
    GT = 22,
    LT = 23,
    GTE = 24,
    LTE = 25,
    AND = 26,
    OR = 27,
    NOT = 28,
    
    // Punctuation
    LPAREN = 29,
    RPAREN = 30,
    LBRACKET = 31,
    RBRACKET = 32,
    LBRACE = 33,
    RBRACE = 34,
    COMMA = 35,
    COLON = 36,
    DOT = 37,
    
    // Additional tokens specific to clinical guidelines
    EVIDENCE_LEVEL = 38,
    RECOMMENDATION_STRENGTH = 39,
    CITATION = 40
} 