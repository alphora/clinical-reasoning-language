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
    : INDENT actionLine+ DEDENT
    ;

actionLine
    : fhirTypeClause
    | codeClause
    | urlClause
    ;

fhirTypeClause
    : 'fhirtype' ACTION_FHIR_TYPE NEWLINE
    ;

codeClause
    : 'code' STRING NEWLINE
    ;

urlClause
    : 'url' STRING NEWLINE
    ;

casefeature
    : 'casefeature' STRING NEWLINE casefeatureBlock?
    ;

casefeatureBlock
    : INDENT casefeatureLine+ DEDENT
    ;

casefeatureLine
    : casefeatureFhirTypeClause
    | casefeatureValueTypeClause
    ;

casefeatureFhirTypeClause
    : 'fhirtype' CASEFEATURE_FHIR_TYPE NEWLINE
    ;

casefeatureValueTypeClause
    : 'valuetype' FHIR_VALUE_TYPE NEWLINE
    ;

/*
 * Lexer Rules
 */

// Keywords
DECISION: 'decision';
WHEN: 'when';
THEN: 'then';
DO: 'do';
USE: 'use';
ACTION: 'action';
FHIRTYPE: 'fhirtype';
CASEFEATURE: 'casefeature';
CODE: 'code';
URL: 'url';
VALUETYPE: 'valuetype';

// Special tokens
NEWLINE: '\r'? '\n';
WS: [ \t]+ -> skip;
COMMENT: '//' ~[\r\n]* -> skip;
COMMENT_BLOCK: '/*' .*? '*/' -> skip;
INDENT: '    ' -> channel(HIDDEN);
DEDENT: -> channel(HIDDEN);

// FHIR types
ACTION_FHIR_TYPE: 'Appointment'
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
    | 'VisionPrescription';
CASEFEATURE_FHIR_TYPE: 'Condition' | 'Observation' | 'Procedure' | 'Encounter';
FHIR_VALUE_TYPE: 'boolean' | 'integer' | 'decimal' | 'string' | 'date' | 'dateTime' | 'time' | 'code' | 'uri';

// String literals
STRING: '"' (~["\\\r\n] | '\\' .)* '"';

// Error token
ERROR: .;
