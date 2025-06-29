lexer grammar CRLLexer;

// === Multi-word phrase tokens ===
END_WHEN            : 'end when';
RECOMMEND_ACTIVITY  : 'recommend activity';
USE_DECISION        : 'use decision';
TYPE_IS             : 'type is' -> mode(CONCEPT_MODE);
VALUETYPE_IS        : 'valuetype is' -> mode(VALUE_TYPE_MODE);
EVIDENCE_IS         : 'evidence is';
META_IS             : 'meta is';
INFERRED_FROM       : 'inferred from';
CODED_FROM          : 'coded from';
APPLY_PATTERN       : 'apply pattern';
CODE_IS             : 'code is';
SYSTEM_IS           : 'system is';
VALUESET_IS         : 'valueset is';
ALL_BLOCK           : 'all:';
ANY_BLOCK           : 'any:';

// === Keywords ===
ACTIVITY     : 'activity';
AND          : 'and';
BECAUSE      : 'because';
CONCEPT      : 'concept';
DECISION     : 'decision';
NOT          : 'not';
OR           : 'or';
REQUEST      : 'request' -> mode(ACTIVITY_MODE);
TERMINOLOGY  : 'terminology';
THEN         : 'then';
WHEN         : 'when';
WITH         : 'with';

// === Punctuation ===
COLON        : ':';
DOT          : '.';
DASH         : '-';
LPAREN       : '(';
RPAREN       : ')';
HEADER       : '#' ~[\r\n]* ;

// === String Types ===
QUOTED_STRING
    : '"' ( ~["\\\r\n] )* '"' // valid quoted string
    | '"' ( ~["\\\r\n] )* { // unterminated quoted string
        this.text = JSON.stringify({
            errorType: 'InvalidToken',
            value: this.text
        });
        this.type = CRLLexer.ERROR;
    }
    ;

BACKTICK_STRING
    : '`' ( ~[`\\] | '\\' . )* '`' // valid backtick string
    | '`' ( ~[`\\] | '\\' . )* { // unterminated backtick string
        this.text = JSON.stringify({
            errorType: 'InvalidToken',
            value: this.text
        });
        this.type = CRLLexer.ERROR;
    }
    ;

// === Comments and Whitespace ===
fragment BLOCK_COMMENT
    : '/*' .*? '*/'
    ;

WS
    : [ \t\r\n]+ -> skip
    ;

COMMENT
    : '//' ~[\r\n]* -> skip
    ;

COMMENT_BLOCK
    : BLOCK_COMMENT -> skip
    ;

// === Error Handling ===
ERROR        : 'error'; // DO NOT remove as this is used by the lexer error listener.

// === Modes ===
mode ACTIVITY_MODE;

DO_NOT_PERFORM_DO             : 'do';
DO_NOT_PERFORM_NOT            : 'not';
DO_NOT_PERFORM_PERFORM        : 'perform';

// ACTIVITY_TYPE possibilities (case sensitive)
ACTIVITY_TYPE
    : ~[ \t\r\n.:()]+ {
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
            this.text = JSON.stringify({
                errorType: 'InvalidActivityType',
                value: this.text,
                validTypes
            });
            this.type = CRLLexer.ERROR;
        }
    }
    -> mode(DEFAULT_MODE)
    ;
ACTIVITY_WS
    : [ \t\r\n]+ -> skip
    ;
ACTIVITY_COMMENT_BLOCK
    : BLOCK_COMMENT -> skip
    ;

mode CONCEPT_MODE;

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
    : ~[ \t\r\n.:()]+ {
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
            'DocumentReference',
            'Encounter',
            'FamilyMemberHistory',
            'Goal',
            'Immunization',
            'ImagingStudy',
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
            this.text = JSON.stringify({
                errorType: 'InvalidConceptType',
                value: this.text,
                validTypes
            });
            this.type = CRLLexer.ERROR;
        }
    }
    -> mode(DEFAULT_MODE)
    ;
CONCEPT_WS
    : [ \t\r\n]+ -> skip
    ;
CONCEPT_COMMENT_BLOCK
    : BLOCK_COMMENT -> skip
    ;

mode VALUE_TYPE_MODE;
// CONCEPT_VALUE_TYPE possibilities (case sensitive)
CONCEPT_VALUE_TYPE
    : ~[ \t\r\n.:()]+ {
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
            this.text = JSON.stringify({
                errorType: 'InvalidConceptValueType',
                value: this.text,
                validTypes
            });
            this.type = CRLLexer.ERROR;
        }
    }
    -> mode(DEFAULT_MODE)
    ;
VALUE_TYPE_WS
    : [ \t\r\n]+ -> skip
    ;
VALUE_TYPE_COMMENT_BLOCK
    : BLOCK_COMMENT -> skip
    ;

mode DEFAULT_MODE;

// Catch-all error handling for unmatched characters in DEFAULT_MODE
DEFAULT_ErrorChar
    : ~[ \t\r\n.:()]+ {
        this.text = JSON.stringify({
            errorType: 'InvalidToken',
            value: this.text
        });
        this.type = CRLLexer.ERROR;
    }
    ;
