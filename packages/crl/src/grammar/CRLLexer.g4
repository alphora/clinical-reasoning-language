lexer grammar CRLLexer;

// === Multi-word phrase tokens ===
RECOMMEND_ACTIVITY  : 'recommend activity';
USE_DECISION        : 'use decision';
TYPE_IS             : 'type is' -> mode(CONCEPT_MODE);
VALUE_TYPE_IS       : 'value type is' -> mode(VALUE_TYPE_MODE);
// `value element is` names the FHIR model-info property path of a representation's
// datum (`Observation.value`, `Patient.birthDate`). Diverges from `value type is`
// at char 6 ('e' vs 't') so there is no prefix conflict. Enters a dedicated mode
// because the value is a dotted path the DEFAULT/CONCEPT modes cannot lex.
VALUE_ELEMENT_IS    : 'value element is' -> mode(VALUE_ELEMENT_MODE);
// `value projection is` is the REP-LEVEL projector: it projects THIS representation's own
// datum to the concept's value (a type-crossing transformation, e.g. Patient.birthDate
// `dateTime` -> a `boolean` concept). Its OWN term — distinct from the concept-level
// `definition is` (a calculation over other concepts) — so line position never silently
// decides which you get; a bare `definition is` inside a representation is now a parse error.
// Completes the `value <facet> is` rep vocabulary (type / element / projection). No mode: the
// narrative that follows is lexed in DEFAULT_MODE exactly like `definition is`. Diverges from
// `value type is` / `value element is` at char 6 ('p'), so no prefix conflict.
VALUE_PROJECTION_IS : 'value projection is';
// `value from` names the concept's ANSWER OPTION SET — the coded values a user is OFFERED for this
// question. CONCEPT-LEVEL, because the answer slot is the concept's, not a representation's: 5 of the 9
// affected concepts have NO representation at all to hang it on.
// ⚠ NOT the same axis as `coded from`, which is REP-LOCAL and names which external records REPRESENT the
// concept (the retrieve scope). They coincide on some carriers and must be free to diverge — a smoking
// status concept's `coded from` names WHICH observation, while its answers are never/former/current.
// Diverges from `value type is` / `value element is` / `value projection is` at char 6 ('f'), so there is
// no prefix conflict. No mode: a terminology reference is lexed in DEFAULT exactly as `coded from`'s is.
VALUE_FROM          : 'value from';
PARAM_TYPE_IS       : 'param type is' -> mode(PARAMETER_TYPE_MODE);
EVIDENCE_IS         : 'evidence is';
META_IS             : 'meta is';
DEFINED_AS          : 'defined as';
CODED_FROM          : 'coded from';
DEFINITION_IS       : 'definition is';
// `shape is <Scalar|Record|RecordSet>` — the concept-level declaration of the cardinality
// of the concept's PUBLISHED value (#189 grammar+validation slice). Scalar is the default
// when omitted (builder-normalized). Enters a dedicated mode so the value is lexed against a
// closed allowlist (mirrors VALUE_TYPE_MODE). Concept-level only — there is no rep-level shape.
SHAPE_IS            : 'shape is' -> mode(SHAPE_MODE);
SOURCE_REPRESENTATION : 'source representation';
CODE_IS             : 'code is';
SYSTEM_IS           : 'system is';
VALUESET_IS         : 'valueset is';
ALL_BLOCK           : 'all:';
ANY_BLOCK           : 'any:';
FIRST_BLOCK         : 'first:';

// === Keywords ===
// `END` ('end') is the generic closer for a `then:` block body (replaces the
// former `END_WHEN` 'end when'). `OTHERWISE` ('otherwise') is the catch-all
// branch keyword. Both are also admitted as narrative words in `narrativeElement`
// (CRLParser.g4) so clinical prose like "at end of <period>" still parses.
ACTIVITY     : 'activity';
AND          : 'and';
AS           : 'as';
BECAUSE      : 'because';
CONCEPT      : 'concept';
CRITERION    : 'criterion';
DECISION     : 'decision';
END          : 'end';
// `exists` is the existence operator in a `defined as exists ("Concept")` body. It is
// ALSO admitted as a narrative word (see `narrativeElement`'s NWord list in
// CRLParser.g4) so clinical prose in a `definition is` body still parses. Declared
// before NARRATIVE_WORD; longest-match keeps kebab words like `exists-foo` as
// NARRATIVE_WORD (10 chars > 6).
EXISTS       : 'exists';
// === Reduction keywords (#189 grammar+validation slice) ===
// Anchor the dedicated count-reduction production (`definition is count <target> at least N`):
// a bare integer threshold is not a `narrativeElement` (a `quantity` requires a unit), so the
// production needs real tokens rather than narrative. `THIS` is the concept's OWN representation
// records as a reduction target (`ThisRecords`) — promoted to a first-class token so validators
// and walkers match a STRUCTURAL node, not narrative text. All are ALSO admitted as narrative
// words (see `narrativeElement`'s NWord list in CRLParser.g4) so clinical prose ("count of …",
// "in this setting", "at least 18 years") still parses; `visitNWord` maps each back to its own
// literal text, so every existing matcher (`isWord(el,"at")` + `isWord(el,"least")`, age/threshold
// patterns) is byte-identical at the element level. `at least` is TWO single-word tokens (not one
// multi-word token) so the count form is whitespace-insensitive like the rest of CRL and each word
// keeps its own source span. Declared before NARRATIVE_WORD so they win on tie (longest-match still
// keeps `atrium`/`leastwise` as NARRATIVE_WORD).
COUNT        : 'count';
AT           : 'at';
LEAST        : 'least';
THIS         : 'this';
INCLUDE      : 'include';
LIBRARY      : 'library';
NOT          : 'not';
ONLY_WHEN    : 'only when';
OR           : 'or';
OTHERWISE    : 'otherwise';
PARAMETER    : 'parameter';
REQUEST      : 'request' -> mode(ACTIVITY_MODE);
TERMINOLOGY  : 'terminology';
THEN         : 'then';
UNLESS       : 'unless';
WHEN         : 'when';
WITH         : 'with';

// === Inference operators (v0.6) ===
// sem-or / sem-and / sem-not in a concept's `defined as` body. These are SEMANTIC
// INFERENCE operators — they normalize ONE concept's representations into one fact,
// NOT boolean logic and NOT decision composition (#168). The uniform `sem-` prefix
// distinguishes them from in-arg disjunction/conjunction (lowercase or/and) and from
// narrative words. Hard rule: all sem-* operators carry the sem- prefix, no exceptions.
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

// ⭐ Punctuation, so `, then` can delimit narrative pipeline stages (#189 G3).
// ⚠ It MUST also be excluded from `DEFAULT_ErrorChar` (done below). That catch-all is greedy, so with `,`
// still in its set it matched `'kg/m2',` — EIGHT characters, beating SINGLE_QUOTED_STRING's seven — and
// ANTLR's longest-match rule handed back one InvalidToken. The comma silently poisoned the preceding unit.
COMMA : ',';

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
//
// Aligned to the CPG IG Activity Profiles table
// (https://build.fhir.org/ig/HL7/cqf-recommendations/profiles.html#activity-profiles).
// The allowlist covers every base FHIR resource referenced by an IG
// Request or Event profile, plus subject/contextual resources (Patient,
// Device, DocumentReference, Goal) that CRL authors reference even when
// they aren't directly tied to a CPG activity.
//
// See docs/cpg-ig-alignment.md for the full CRL↔IG mapping including
// which IG profiles map to which CRL concept types.
//
// Three IG Event-column resources are NOT here because CRL plans to
// model them via dedicated top-level declaration kinds rather than as
// `concept - type is X.`:
//   CPGMetricReport / MeasureReport       — CRL `metric` declaration (backlog)
//   CPGCaseSummary etc. / Composition     — CRL `summary` declaration (backlog)
//
// Consider adding (not yet warranted by the corpus):
// ImagingStudy (maybe- though DiagnosticReport and Observation likely cover most use cases without it)
// MolecularSequence (maybe- see ImagingStudy)
// GenomicStudy (maybe- see ImagingStudy)
//
// Consider adding for ERAS:
// Location (certain things need to happen in certain "locations" eg for ERAS, but their is a distinction between a "physical location" and the "role" it plays as part of a "business unit"- to be discussed)
// HealthcareService
// EncounterHistory (need to understand better where to use vs EpisodeOfCare for surgical "patient flow")
// Appointment
// AppointmentResponse
CONCEPT_TYPE
    : ~[ \t\r\n.:()]+ {
        const validTypes = [
            'AdverseEvent',
            'AllergyIntolerance',
            'Claim',
            'ClinicalImpression',
            'Communication',
            'CommunicationRequest',
            'Condition',
            'DetectedIssue',
            'Device',
            'DiagnosticReport',
            'DocumentReference',
            'Encounter',
            'EpisodeOfCare',
            'ExplanationOfBenefit',
            'FamilyMemberHistory',
            'Flag',
            'Goal',
            'ImagingStudy',
            'Immunization',
            'MedicationAdministration',
            'MedicationDispense',
            'MedicationRequest',
            'MedicationStatement',
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
            'date',
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

mode SHAPE_MODE;
// CONCEPT_SHAPE possibilities (case sensitive) — the declared cardinality of the concept's
// PUBLISHED value. `Scalar` = a single reduced value (the DEFAULT when `shape is` is omitted;
// builder-normalized). `Record` = a single selected record. `RecordSet` = the set of records.
// The extract pipeline (scripts/extractConceptShapes.js) mirrors this allowlist to
// generated/types/conceptShapes.json — the .g4 is the source of truth.
SHAPE_VALUE
    : ~[ \t\r\n.:()]+ {
        const validShapes = [
            'Scalar',
            'Record',
            'RecordSet'
        ];
        if (!validShapes.includes(this.text)) {
            this.text = JSON.stringify({
                errorType: 'InvalidConceptShape',
                value: this.text,
                validShapes
            });
            this.type = CRLLexer.ERROR;
        }
    }
    -> mode(DEFAULT_MODE)
    ;
SHAPE_WS
    : [ \t\r\n]+ -> skip
    ;
SHAPE_COMMENT_BLOCK
    : BLOCK_COMMENT -> skip
    ;

mode VALUE_ELEMENT_MODE;
// VALUE_ELEMENT_PATH — a FHIR model-info property path (ElementDefinition-style),
// e.g. `Observation.value`, `Patient.birthDate`, `ImagingStudy.started`. Captured as
// ONE token; the trailing structural `.` stays DOT because the optional
// `('.' segment)` needs a following letter to extend the path. Segment charset allows
// digits (`[A-Za-z][A-Za-z0-9]*`) though R4/R5 core element names are alpha.
// Choice-type `[x]`, slices and indexers are DELIBERATELY out of scope for increment 1.
// The lexer does NOT verify the path is resource-qualified or that the element exists
// — a single-segment path (`value`) lexes here and is REJECTED by Todo 2's validator,
// which checks the path against the declared `type`.
VALUE_ELEMENT_PATH
    : [A-Za-z] [A-Za-z0-9]* ('.' [A-Za-z] [A-Za-z0-9]*)* -> mode(DEFAULT_MODE)
    ;
// House error-recovery: a malformed run (`value[x]`, a digit-leading segment, a stray
// `(`/`)`/`:`) OR a stray leading `.` is captured, wrapped in the JSON error envelope for
// the lexer error listener, and control RETURNS to DEFAULT_MODE — so a bad path yields a
// structured diagnostic and clean recovery instead of a stuck mode. Unlike the other modes'
// catch-alls this alt1 excludes ONLY whitespace and `.`, so it also envelopes the
// structural delimiters `:()` (which those modes leave to raw recovery) — strictly cleaner.
// `.` is excluded from alt1 (so VALUE_ELEMENT_PATH wins on a valid path's internal dots) and
// handled by alt2 (a leading dot). A double-dot / bad second segment yields a valid prefix
// PATH + a trailing parse error, which is still an error, just at the parse layer.
VALUE_ELEMENT_ErrorChar
    : ( ~[ \t\r\n.]+ | '.' ) {
        this.text = JSON.stringify({
            errorType: 'InvalidToken',
            value: this.text
        });
        this.type = CRLLexer.ERROR;
    }
    -> mode(DEFAULT_MODE)
    ;
VALUE_ELEMENT_WS
    : [ \t\r\n]+ -> skip
    ;
VALUE_ELEMENT_COMMENT_BLOCK
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
            'Claim',
            'ClinicalImpression',
            'Communication',
            'CommunicationRequest',
            'Condition',
            'DetectedIssue',
            'Device',
            'DiagnosticReport',
            'DocumentReference',
            'Encounter',
            'EpisodeOfCare',
            'ExplanationOfBenefit',
            'FamilyMemberHistory',
            'Flag',
            'Goal',
            'ImagingStudy',
            'Immunization',
            'MedicationAdministration',
            'MedicationDispense',
            'MedicationRequest',
            'MedicationStatement',
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
            'date',
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
    : ~[ \t\r\n.:(),]+ {
        this.text = JSON.stringify({
            errorType: 'InvalidToken',
            value: this.text
        });
        this.type = CRLLexer.ERROR;
    }
    ;
