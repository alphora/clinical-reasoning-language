/**
 * Token types for the Clinical Practice Guideline Language (CPGL)
 */
export enum CPGLTokenType {
    // Special tokens
    EOF = -1,
    ERROR = 0,
    UNKNOWN = 1,
    
    // Whitespace and indentation
    WS = 2,
    NEWLINE = 3,
    INDENT = 4,
    DEDENT = 5,
    
    // Literals
    IDENTIFIER = 6,
    NUMBER = 7,
    STRING = 8,
    
    // Comments
    SINGLE_LINE_COMMENT = 9,
    BLOCK_COMMENT = 10,
    
    // Keywords
    DECISION = 11,
    RECOMMENDATION = 12,
    CONDITION = 13,
    ACTION = 14,
    IF = 15,
    ELSE = 16,
    WHEN = 17,
    THEN = 18,
    WITH = 19,
    
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