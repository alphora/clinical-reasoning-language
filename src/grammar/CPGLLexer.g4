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
NOT          : 'not';
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
// DO NOT remove as this is used by the lexer error listener.
ERROR        : 'error';

// Punctuation
COLON        : ':';
DOT          : '.';
LPAREN       : '(';
RPAREN       : ')';

QUOTED_STRING
    : '"' ( ~["\\\r\n] )* '"'
    ;

STRING
    : '"' ( '\\' . | ~["] )* '"'
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
    : [a-zA-Z]+ {
        const validTypes = [
            'CPGAdministerMedication',
            'CPGCollectInformation',
            'CPGCommunication',
            'CPGDispenseMedication',
            'CPGDocumentMedication',
            'CPGEnrollment',
            'CPGGenerateReport',
            'CPGHold',
            'CPGImmunization',
            'CPGMedicationRequest',
            'CPGProposeDiagnosis',
            'CPGRecordDetectedIssue',
            'CPGRecordInference',
            'CPGReportFlag',
            'CPGResume',
            'CPGServiceRequest',
            'CPGStop'
        ];
        if (!validTypes.includes(this.text)) {
            for (const listener of this._listeners) {
                if (listener.reportCustomError) {
                    listener.reportCustomError(
                        this._tokenStartLine,
                        this._tokenStartCharPositionInLine,
                        `Invalid activity type: ${this.text}`,
                        { validTypes, received: this.text }
                    );
                }
            }
        }
    }
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

// Error handling for unmatched characters in activity mode
ACTIVITY_ErrorChar
    : . {
        throw new Error(JSON.stringify({
            type: "LexicalError",
            line: this._tokenStartLine,
            column: this._tokenStartCharPositionInLine,
            message: `Invalid character in activity type: ${this.text}`
        }));
    }
    ;

mode CONCEPT_MODE;

// CONCEPT_TYPE possibilities (case sensitive)
CONCEPT_TYPE
    : [a-zA-Z]+ {
        const validTypes = [
            'Communication',
            'CommunicationRequest',
            'Condition',
            'QuestionnaireTask',
            'QuestionnaireResponse',
            'MedicationRequest',
            'MedicationDispense',
            'MedicationAdministration',
            'MedicationStatement',
            'ImmunizationRequest',
            'Immunization',
            'ServiceRequest',
            'Procedure',
            'Observation'
        ];
        if (!validTypes.includes(this.text)) {
            for (const listener of this._listeners) {
                if (listener.reportCustomError) {
                    listener.reportCustomError(
                        this._tokenStartLine,
                        this._tokenStartCharPositionInLine,
                        `Invalid concept type: ${this.text}`,
                        { validTypes, received: this.text }
                    );
                }
            }
        }
    }
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

// Error handling for unmatched characters in concept mode
CONCEPT_ErrorChar
    : . {
        throw new Error(JSON.stringify({
            type: "LexicalError",
            line: this._tokenStartLine,
            column: this._tokenStartCharPositionInLine,
            message: `Invalid character in concept type: ${this.text}`
        }));
    }
    ;

mode VALUE_TYPE_MODE;

// CONCEPT_VALUE_TYPE possibilities (case sensitive)
CONCEPT_VALUE_TYPE
    : [a-zA-Z]+ {
        const validTypes = [
            'Quantity',
            'CodeableConcept',
            'string',
            'boolean',
            'integer',
            'Range',
            'Ratio',
            'SampledData',
            'time',
            'dateTime',
            'Period',
            'Attachment'
        ];
        if (!validTypes.includes(this.text)) {
            for (const listener of this._listeners) {
                if (listener.reportCustomError) {
                    listener.reportCustomError(
                        this._tokenStartLine,
                        this._tokenStartCharPositionInLine,
                        `Invalid concept value type: ${this.text}`,
                        { validTypes, received: this.text }
                    );
                }
            }
        }
    }
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

// Error handling for unmatched characters in value type mode
VALUE_TYPE_ErrorChar
    : . {
        throw new Error(JSON.stringify({
            type: "LexicalError",
            line: this._tokenStartLine,
            column: this._tokenStartCharPositionInLine,
            message: `Invalid character in concept value type: ${this.text}`
        }));
    }
    ; 