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
    : '/*' .*? '*/' -> skip
    ;

// Error handling for unmatched characters
ErrorChar 
    : . {
        throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid character: ${this.text}`);
    }
    ;

mode ACTIVITY_MODE;

// ACTIVITY_TYPE possibilities (case sensitive)
ACTIVITY_TYPE
    : [a-zA-Z]+ { 
        const validTypes = [
            'AdministerMedicationActivity',
            'CollectInformationActivity',
            'CommunicationActivity',
            'DispenseMedicationActivity',
            'DocumentMedicationActivity',
            'EnrollmentActivity',
            'GenerateReportActivity',
            'HoldActivity',
            'ImmunizationActivity',
            'MedicationRequestActivity',
            'ProposeDiagnosisActivity',
            'RecordDetectedIssueActivity',
            'RecordInferenceActivity',
            'ReportFlag',
            'ResumeActivity',
            'ServiceRequestActivity',
            'StopActivity'
        ];
        if (!validTypes.includes(this.text)) {
            throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid activity type: ${this.text}. Valid types are: ${validTypes.join(', ')}`);
        }
    }
    -> mode(DEFAULT_MODE)
    ;

// Skip whitespace in activity mode
ACTIVITY_WS
    : [ \t\r\n]+ -> skip
    ;

// Error handling for unmatched characters in activity mode
ACTIVITY_ErrorChar 
    : . {
        throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid character in activity type: ${this.text}`);
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
            throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid concept type: ${this.text}. Valid types are: ${validTypes.join(', ')}`);
        }
    }
    -> mode(DEFAULT_MODE)
    ;

// Skip whitespace in concept mode
CONCEPT_WS
    : [ \t\r\n]+ -> skip
    ;

// Error handling for unmatched characters in concept mode
CONCEPT_ErrorChar 
    : . {
        throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid character in concept type: ${this.text}`);
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
            throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid concept value type: ${this.text}. Valid types are: ${validTypes.join(', ')}`);
        }
    }
    -> mode(DEFAULT_MODE)
    ;

// Skip whitespace in value type mode
VALUE_TYPE_WS
    : [ \t\r\n]+ -> skip
    ;

// Error handling for unmatched characters in value type mode
VALUE_TYPE_ErrorChar 
    : . {
        throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid character in value type: ${this.text}`);
    }
    ; 