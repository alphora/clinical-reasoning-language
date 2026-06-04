lexer grammar CRLLexer;

// === Multi-word phrase tokens ===
END_WHEN            : 'end when';
RECOMMEND_ACTIVITY  : 'recommend activity';
USE_DECISION        : 'use decision';
TYPE_IS             : 'type is' -> mode(CONCEPT_MODE);
VALUE_TYPE_IS       : 'value type is' -> mode(VALUE_TYPE_MODE);
PARAM_TYPE_IS       : 'param type is' -> mode(PARAMETER_TYPE_MODE);
EVIDENCE_IS         : 'evidence is';
META_IS             : 'meta is';
DEFINED_AS          : 'defined as';
CODED_FROM          : 'coded from';
DEFINITION_IS       : 'definition is';
CODE_IS             : 'code is';
SYSTEM_IS           : 'system is';
VALUESET_IS         : 'valueset is';
ALL_BLOCK           : 'all:';
ANY_BLOCK           : 'any:';

// === Keywords ===
ACTIVITY     : 'activity';
AND          : 'and';
AS           : 'as';
BECAUSE      : 'because';
CONCEPT      : 'concept';
DECISION     : 'decision';
INCLUDE      : 'include';
LIBRARY      : 'library';
NOT          : 'not';
OR           : 'or';
PARAMETER    : 'parameter';
REQUEST      : 'request' -> mode(ACTIVITY_MODE);
TERMINOLOGY  : 'terminology';
THEN         : 'then';
WHEN         : 'when';
WITH         : 'with';

// === Composition operators (v0.6) ===
// sem-or / sem-and / sem-not in concept's `defined as` composition.
// Uniform `sem-` prefix marks structural composition; distinguishes from
// in-arg disjunction/conjunction (which use lowercase or/and) and from
// narrative words. Hard rule: all structural composition operators carry
// the sem- prefix, no exceptions.
// Declared BEFORE NARRATIVE_WORD so 6-char `sem-or` matches SEM_OR not NARRATIVE_WORD.
SEM_OR       : 'sem-or';
SEM_AND      : 'sem-and';
SEM_NOT      : 'sem-not';

// === Narrative tokens (v0.5) ===
// Used in inference body narrative and in-arg quantity literals.
// TIME_UNIT must come BEFORE NARRATIVE_WORD so closed-set time units win on tie.
TIME_UNIT
    : 'years' | 'year' | 'months' | 'month' | 'weeks' | 'week'
    | 'days' | 'day' | 'hours' | 'hour' | 'minutes' | 'minute'
    | 'seconds' | 'second' | 'milliseconds' | 'millisecond'
    ;

// Quantity numeric literal. Accepts `30` and `30.5`. Trailing dot is the structural
// DOT (terminator) — the optional decimal portion requires at least one digit, so
// `18.` lexes as NUMBER(18) + DOT.
NUMBER       : [0-9]+ ('.' [0-9]+)?;

// Single-quoted string token. Used for UCUM units in quantity literals
// (e.g. `30 'mm[Hg]'`, `'kg/m2'`, `'a'`).
// Body excludes single-quote, CR, LF; `+` (not `*`) keeps empty `''` a lex error.
SINGLE_QUOTED_STRING : '\'' ~['\r\n]+ '\'';

// Catch-all lowercase narrative word, including kebab-case (`record-of`, `not-virtual`).
// Declared AFTER all specific lowercase keyword tokens (TIME_UNIT, AND, OR, NOT, WITH,
// SEM_*, etc.) so those win on tie. Uppercase rejected — author must quote (`"BMI"`).
NARRATIVE_WORD : [a-z]+ ('-' [a-z]+)*;

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
            'CPGCommunicationRequest',
            'CPGDispenseMedication',
            'CPGDocumentMedication',
            'CPGEnrollment',
            'CPGGenerateReport',
            'CPGImmunizationRequest',
            'CPGMedicationRequest',
            'CPGProposeDiagnosis',
            'CPGQuestionnaire',
            'CPGRecordDetectedIssue',
            'CPGRecordInference',
            'CPGReportFlag',
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
            'MedicationAdministration',
            'MedicationDispense',
            'MedicationRequest',
            'NutritionIntake',
            'NutritionOrder',
            'Observation',
            'Patient',
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

mode PARAMETER_TYPE_MODE;
// PARAMETER_TYPE possibilities (case sensitive) — union of CONCEPT_TYPE
// (FHIR resource types) and CONCEPT_VALUE_TYPE (FHIR data types).
// Hand-maintained here to match the existing extract pipeline direction
// (the .g4 is the source; the JSON is extracted from it). When either
// of the two source lists gains a new entry, this list must gain the
// same entry. The extract script (scripts/extractParameterTypes.js)
// verifies parameterTypes ⊇ conceptTypes ∪ conceptValueTypes at build
// time and fails the build on drift.
PARAMETER_TYPE
    : ~[ \t\r\n.:()]+ {
        const validTypes = [
            // Resources (mirrors CONCEPT_TYPE allowlist)
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
            'MedicationAdministration',
            'MedicationDispense',
            'MedicationRequest',
            'NutritionIntake',
            'NutritionOrder',
            'Observation',
            'Patient',
            'Procedure',
            'QuestionnaireResponse',
            'RiskAssessment',
            'ServiceRequest',
            'Task',
            // Data types (mirrors CONCEPT_VALUE_TYPE allowlist)
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
                errorType: 'InvalidParameterType',
                value: this.text,
                validTypes
            });
            this.type = CRLLexer.ERROR;
        }
    }
    -> mode(DEFAULT_MODE)
    ;
PARAMETER_TYPE_WS
    : [ \t\r\n]+ -> skip
    ;
PARAMETER_TYPE_COMMENT_BLOCK
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
