lexer grammar CPGLLexer;

// Keywords
CONCEPT      : 'concept';
TYPE         : 'type' -> mode(CONCEPT_MODE);
VALUETYPE    : 'valuetype' -> mode(VALUE_TYPE_MODE);
TERMINOLOGY  : 'terminology';
PROVENANCE   : 'provenance';
INFERRED     : 'inferred';
AND          : 'and';
OR           : 'or';
DONE         : 'done';
HAS          : 'has';
BY           : 'by';
CODED        : 'coded';
VALUESET     : 'valueset';
PERFORM      : 'perform' -> mode(ACTIVITY_MODE);
ACTIVITY     : 'activity';
OF           : 'of';
SYSTEM       : 'system';
CODE         : 'code';
UNKNOWN      : 'unknown';
DO           : 'do';
USE          : 'use';
WHEN         : 'when';
THEN         : 'then';
ANY          : 'any';
ALL          : 'all';
DECISION     : 'decision';
ERROR        : 'error';

// Punctuation
COLON        : ':';
DOT          : '.';
LPAREN       : '(';
RPAREN       : ')';

// STRING: quoted string with error handling for unterminated strings
STRING
    : '"' ( ~["\\\r\n] )* ('"' | { 
        throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Unterminated string`);
    })
    ;

// IDENTIFIER: any sequence of letters that isn't a keyword or special type
IDENTIFIER
    : [a-zA-Z][a-zA-Z0-9_]*
    ;

// Block comment fragment
fragment BLOCK_COMMENT
    : '/*' .*? '*/'
    ;

// Skip whitespace.
WS
    : [ \t\r\n]+ -> skip
    ;

// Single-line comment.
COMMENT
    : '//' ~[\r\n]* -> skip
    ;

// Block comment.
COMMENT_BLOCK
    : BLOCK_COMMENT -> skip
    ;

mode ACTIVITY_MODE;

// ACTIVITY_TYPE possibilities (case sensitive)
ACTIVITY_TYPE
    : 'CPGAdministerMedication'
    | 'CPGCollectInformation'
    | 'CPGCommunication'
    | 'CPGDispenseMedication'
    | 'CPGDocumentMedication'
    | 'CPGEnrollment'
    | 'CPGGenerateReport'
    | 'CPGHold'
    | 'CPGImmunization'
    | 'CPGMedicationRequest'
    | 'CPGProposeDiagnosis'
    | 'CPGRecordDetectedIssue'
    | 'CPGRecordInference'
    | 'CPGReportFlag'
    | 'CPGResume'
    | 'CPGServiceRequest'
    | 'CPGStop'
    -> mode(DEFAULT_MODE)
    ;

// Skip whitespace in activity mode
ACTIVITY_WS
    : [ \t\r\n]+ -> skip
    ;

// Block comment in activity mode
ACTIVITY_COMMENT_BLOCK
    : BLOCK_COMMENT -> skip
    ;

// Any other character in activity mode becomes an IDENTIFIER
ACTIVITY_IDENTIFIER
    : [a-zA-Z][a-zA-Z0-9_]* -> mode(DEFAULT_MODE)
    ;

mode CONCEPT_MODE;

// CONCEPT_TYPE possibilities (case sensitive)
CONCEPT_TYPE
    : 'Communication'
    | 'CommunicationRequest'
    | 'Condition'
    | 'QuestionnaireTask'
    | 'QuestionnaireResponse'
    | 'MedicationRequest'
    | 'MedicationDispense'
    | 'MedicationAdministration'
    | 'MedicationStatement'
    | 'ImmunizationRequest'
    | 'Immunization'
    | 'ServiceRequest'
    | 'Procedure'
    | 'Observation'
    -> mode(DEFAULT_MODE)
    ;

// Skip whitespace in concept mode
CONCEPT_WS
    : [ \t\r\n]+ -> skip
    ;

// Block comment in concept mode
CONCEPT_COMMENT_BLOCK
    : BLOCK_COMMENT -> skip
    ;

// Any other character in concept mode becomes an IDENTIFIER
CONCEPT_IDENTIFIER
    : [a-zA-Z][a-zA-Z0-9_]* -> mode(DEFAULT_MODE)
    ;

mode VALUE_TYPE_MODE;

// CONCEPT_VALUE_TYPE possibilities (case sensitive)
CONCEPT_VALUE_TYPE
    : 'Quantity'
    | 'CodeableConcept'
    | 'string'
    | 'boolean'
    | 'integer'
    | 'Range'
    | 'Ratio'
    | 'SampledData'
    | 'time'
    | 'dateTime'
    | 'Period'
    | 'Attachment'
    -> mode(DEFAULT_MODE)
    ;

// Skip whitespace in value type mode
VALUE_TYPE_WS
    : [ \t\r\n]+ -> skip
    ;

// Block comment in value type mode
VALUE_TYPE_COMMENT_BLOCK
    : BLOCK_COMMENT -> skip
    ;

// Any other character in value type mode becomes an IDENTIFIER
VALUE_TYPE_IDENTIFIER
    : [a-zA-Z][a-zA-Z0-9_]* -> mode(DEFAULT_MODE)
    ; 