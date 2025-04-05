grammar CPGL;

/*
 * Parser Rules
 */

file
    : (NEWLINE | WS)* statement* EOF
    ;

statement
    : decision
    | action
    | casefeature
    ;

decision
    : 'decision' STRING NEWLINE block
    ;

block
    : INDENT statementLine+ DEDENT
    ;

statementLine
    : whenClause
    | doClause
    | useClause
    ;

// A "when" clause: a condition that leads to a nested block.
whenClause
    : 'when' STRING 'then' NEWLINE block
    ;

// A "do" clause: a terminal action.
doClause
    : 'do' STRING (NEWLINE | EOF)
    ;

// A "use" clause: reference to another decision (subgraph).
useClause
    : 'use' STRING (NEWLINE | EOF)
    ;

action
    : 'action' STRING NEWLINE actionBlock?
    ;

actionBlock
    : INDENT actionBody DEDENT
    ;

actionBody
    : fhirtypeClause
    ;

// For actions, fhirtype specifies a FHIR resource type
fhirtypeClause
    : 'fhirtype' ACTION_FHIR_TYPE NEWLINE
    ;

casefeature
    : 'casefeature' STRING NEWLINE casefeatureBlock
    ;

casefeatureBlock
    : INDENT casefeatureBody DEDENT
    ;

casefeatureBody
    : ( codeClause
      | casefeatureFhirtypeClause
      | urlClause
      | valuetypeClause
      )+
    ;

codeClause
    : 'code' STRING NEWLINE
    ;

// For casefeatures, fhirtype is given as a FHIR resource type
casefeatureFhirtypeClause
    : 'fhirtype' CASEFEATURE_FHIR_TYPE NEWLINE
    ;

urlClause
    : 'url' STRING NEWLINE
    ;

valuetypeClause
    : 'valuetype' FHIR_VALUE_TYPE NEWLINE
    ;

/*
 * Lexer Rules
 */

// A STRING is a quoted sequence (without embedded line breaks)
STRING: '"' (~["\r\n])* '"';

// FHIR resource types for actions (request/order resources)
ACTION_FHIR_TYPE
    : 'Appointment'
    | 'AppointmentResponse'
    | 'CarePlan'
    | 'Claim'
    | 'CommunicationRequest'
    | 'Contract'
    | 'DeviceRequest'
    | 'EnrollmentRequest'
    | 'ImmunizationRecommendation'
    | 'MedicationRequest'
    | 'NutritionOrder'
    | 'ServiceRequest'
    | 'SupplyRequest'
    | 'Task'
    | 'VisionPrescription'
    ;

// FHIR resource types for case features (clinical observation resources)
CASEFEATURE_FHIR_TYPE
    : 'AllergyIntolerance'
    | 'Condition'
    | 'Procedure'
    | 'Observation'
    | 'Immunization'
    | 'MedicationDispense'
    | 'MedicationAdministration'
    | 'MedicationStatement'
    ;

// FHIR value types
FHIR_VALUE_TYPE
    : 'base64Binary'
    | 'boolean'
    | 'canonical'
    | 'code'
    | 'date'
    | 'dateTime'
    | 'decimal'
    | 'id'
    | 'instant'
    | 'integer'
    | 'markdown'
    | 'oid'
    | 'positiveInt'
    | 'string'
    | 'time'
    | 'unsignedInt'
    | 'uri'
    | 'url'
    | 'uuid'
    | 'xhtml'
    ;

// NEWLINE: one or more newline characters.
NEWLINE: ('\r'? '\n')+ ;

// Whitespace (spaces and tabs) are skipped.
WS: [ \t]+ -> skip ;

// Single-line comments: start with '//' and extend to end-of-line.
COMMENT: '//' ~[\r\n]* -> skip ;

// Block comments: start with '/*' and end with '*/'. Non-greedy.
COMMENT_BLOCK: '/*' .*? '*/' -> skip ;

/*
 * The following INDENT and DEDENT rules are placeholders.
 * In a real implementation, you would implement indentation tracking in your lexer.
 * For example, you might use a custom Lexer in Java or TypeScript to emit INDENT/DEDENT tokens.
 */
INDENT: '<INDENT>';
DEDENT: '<DEDENT>';
