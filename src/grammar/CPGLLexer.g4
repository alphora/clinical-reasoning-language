lexer grammar CPGLLexer;

// Keywords
CONCEPT      : 'concept';
TYPE         : 'type';
VALUETYPE    : 'valuetype';
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
PERFORM      : 'perform';
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
    ;

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
    ;

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
    ; 