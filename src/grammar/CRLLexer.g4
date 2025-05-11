lexer grammar CRLLexer;

// Keywords
ACTIVITY     : 'activity';
AND          : 'and';
BECAUSE      : 'because';
CODE         : 'code';
CONCEPT      : 'concept';
DECISION     : 'decision';
DONE         : 'done';
DO           : 'do';
NOT          : 'not';
OR           : 'or';
PERFORM      : 'perform' -> mode(ACTIVITY_MODE);
SYSTEM       : 'system';
TERMINOLOGY  : 'terminology';
THEN         : 'then';
VALUESET     : 'valueset';
WHEN         : 'when';
WITH         : 'with';
ERROR        : 'error'; // DO NOT remove as this is used by the lexer error listener.

// Punctuation
COLON        : ':';
DOT          : '.';
LPAREN       : '(';
RPAREN       : ')';

// Markdown header
HEADER: '#' ~[\r\n]* ;

// Empty string literal (two backticks with nothing in between)
EMPTY_STRING: '``' ;

// Dash for list items
DASH: '-' ;

// Block starters for 'all:' and 'any:'
ALL_BLOCK: 'all:' ;
ANY_BLOCK: 'any:' ;

// Multi-word phrase tokens for easier parsing
END_WHEN: 'end when' ;
RECOMMEND_ACTIVITY: 'recommend activity' ;
USE_DECISION: 'use decision' ;
TYPE_IS: 'type is' -> mode(CONCEPT_MODE);
VALUETYPE_IS: 'valuetype is' -> mode(VALUE_TYPE_MODE);
EVIDENCE_IS: 'evidence is' ;
INFERRED_FROM: 'inferred from' ;
CODED_FROM: 'coded from' ;
APPLY_PATTERN: 'apply pattern' ;

// Double-quoted identifier/reference
QUOTED_STRING
    : '"' ( ~["\\\r\n] )* '"'
    ;

// Backtick-quoted string literal (for markdown or free text)
BACKTICK_STRING
    : '`' ( ~[`\\] | '\\' . )* '`'
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
            'CPGCommunicationRequest',
            'CPGDispenseMedication',
            'CPGDocumentMedication',
            'CPGEnrollment',
            'CPGGenerateReport',
            'CPGImmunizationRequest',
            'CPGMedicationRequest',
            'CPGProposeDiagnosisTask',
            'CPGRecordDetectedIssue',
            'CPGRecordInference',
            'CPGReportFlagTask',
            'CPGServiceRequest'
        ];
        if (!validTypes.includes(this.text)) {
            for (const listener of this.getErrorListeners()) {
                if (typeof (listener as any).reportCustomError === 'function') {
                    (listener as any).reportCustomError(
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
        for (const listener of this.getErrorListeners()) {
            if (typeof (listener as any).reportCustomError === 'function') {
                (listener as any).reportCustomError(
                    this._tokenStartLine,
                    this._tokenStartCharPositionInLine,
                    `Invalid character in activity type: ${this.text}`,
                    { received: this.text }
                );
            }
        }
    }
    ;

mode CONCEPT_MODE;

CONCEPT_IS
    : 'is' -> type(IS)
    ;

// CONCEPT_TYPE possibilities (case sensitive)
// Consider adding:
// ImagingStudy (maybe- though DiagnosticReport and Observation likely cover most use cases without it)
// MolecularSequence (maybe- see ImagingStudy)
// GenomicStudy (maybe- see ImagingStudy)

// Consider adding for ERAS:
// Location (certain things need to happen in certain "locations" eg for ERAS, but their is a distinction between a "physical location" and the "role" it plays as part of a "business unit"- to be discussed)
// HealthcareService
// EpisodeOfCare
// EncounterHistory (need to understand better where to use vs EpisodeOfCare for surgical "patient flow")
// Appointment
// AppointmentResponse
CONCEPT_TYPE
    : [a-zA-Z]+ {
        const validTypes = [
            'AdverseEvent',
            'AllergyIntolerance',
            'ClinicalImpression',
            'Communication',
            'CommunicationRequest',
            'Condition',
            'DetectedIssue',
            'Device',
            'DiagnosticReport',
            'Encounter',
            'FamilyMemberHistory',
            'Goal',
            'Immunization',
            'MedicationAdministration',
            'MedicationDispense',
            'MedicationRequest',
            'NutritionIntake',
            'NutritionOrder',
            'Observation',
            'Procedure',
            'QuestionnaireResponse',
            'RiskAssessment',
            'ServiceRequest',
            'Task'
        ];
        if (!validTypes.includes(this.text)) {
            for (const listener of this.getErrorListeners()) {
                if (typeof (listener as any).reportCustomError === 'function') {
                    (listener as any).reportCustomError(
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
        for (const listener of this.getErrorListeners()) {
            if (typeof (listener as any).reportCustomError === 'function') {
                (listener as any).reportCustomError(
                    this._tokenStartLine,
                    this._tokenStartCharPositionInLine,
                    `Invalid character in concept type: ${this.text}`,
                    { received: this.text }
                );
            }
        }
    }
    ;

mode VALUE_TYPE_MODE;

VALUE_TYPE_IS
    : 'is' -> type(IS)
    ;

// CONCEPT_VALUE_TYPE possibilities (case sensitive)
CONCEPT_VALUE_TYPE
    : [a-zA-Z]+ {
        const validTypes = [
            'Attachment',
            'boolean',
            'CodeableConcept',
            'dateTime',
            'integer',
            'Period',
            'Quantity',
            'Range',
            'Ratio',
            'SampledData',
            'string',
            'time'
        ];
        if (!validTypes.includes(this.text)) {
            for (const listener of this.getErrorListeners()) {
                if (typeof (listener as any).reportCustomError === 'function') {
                    (listener as any).reportCustomError(
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
        for (const listener of this.getErrorListeners()) {
            if (typeof (listener as any).reportCustomError === 'function') {
                (listener as any).reportCustomError(
                    this._tokenStartLine,
                    this._tokenStartCharPositionInLine,
                    `Invalid character in concept value type: ${this.text}`,
                    { received: this.text }
                );
            }
        }
    }
    ; 