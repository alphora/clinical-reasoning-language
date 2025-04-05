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
    : INDENT (qualifier NEWLINE INDENT)? statementLine+ DEDENT
    ;

qualifier
    : ANY
    | ALL
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
    : 'do' STRING NEWLINE
    ;

// A "use" clause: reference to another decision (subgraph).
useClause
    : 'use' STRING NEWLINE
    ;

action
    : 'action' STRING NEWLINE actionBlock (NEWLINE | EOF)
    ;

actionBlock
    : INDENT actionFhirTypeClause+ DEDENT
    ;

actionFhirTypeClause
    : 'fhirtype' ACTION_FHIR_TYPE NEWLINE
    ;

casefeature
    : 'casefeature' STRING NEWLINE casefeatureBlock (NEWLINE | EOF)
    ;

casefeatureBlock
    : INDENT casefeatureLine DEDENT
    ;

casefeatureLine
    : casefeatureCodeClause
    casefeatureFhirTypeClause
    casefeatureUrlClause
    casefeatureValueTypeClause
    | casefeatureCodeClause
    casefeatureFhirTypeClause
    casefeatureValueTypeClause
    casefeatureUrlClause
    | casefeatureCodeClause
    casefeatureUrlClause
    casefeatureFhirTypeClause
    casefeatureValueTypeClause
    | casefeatureCodeClause
    casefeatureUrlClause
    casefeatureValueTypeClause
    casefeatureFhirTypeClause
    | casefeatureCodeClause
    casefeatureValueTypeClause
    casefeatureFhirTypeClause
    casefeatureUrlClause
    | casefeatureCodeClause
    casefeatureValueTypeClause
    casefeatureUrlClause
    casefeatureFhirTypeClause
    | casefeatureFhirTypeClause
    casefeatureCodeClause
    casefeatureUrlClause
    casefeatureValueTypeClause
    | casefeatureFhirTypeClause
    casefeatureCodeClause
    casefeatureValueTypeClause
    casefeatureUrlClause
    | casefeatureFhirTypeClause
    casefeatureUrlClause
    casefeatureCodeClause
    casefeatureValueTypeClause
    | casefeatureFhirTypeClause
    casefeatureUrlClause
    casefeatureValueTypeClause
    casefeatureCodeClause
    | casefeatureFhirTypeClause
    casefeatureValueTypeClause
    casefeatureCodeClause
    casefeatureUrlClause
    | casefeatureFhirTypeClause
    casefeatureValueTypeClause
    casefeatureUrlClause
    casefeatureCodeClause
    | casefeatureUrlClause
    casefeatureCodeClause
    casefeatureFhirTypeClause
    casefeatureValueTypeClause
    | casefeatureUrlClause
    casefeatureCodeClause
    casefeatureValueTypeClause
    casefeatureFhirTypeClause
    | casefeatureUrlClause
    casefeatureFhirTypeClause
    casefeatureCodeClause
    casefeatureValueTypeClause
    | casefeatureUrlClause
    casefeatureFhirTypeClause
    casefeatureValueTypeClause
    casefeatureCodeClause
    | casefeatureUrlClause
    casefeatureValueTypeClause
    casefeatureFhirTypeClause
    casefeatureCodeClause
    | casefeatureValueTypeClause
    casefeatureCodeClause
    casefeatureFhirTypeClause
    casefeatureUrlClause
    | casefeatureValueTypeClause
    casefeatureCodeClause
    casefeatureUrlClause
    casefeatureFhirTypeClause
    | casefeatureValueTypeClause
    casefeatureFhirTypeClause
    casefeatureCodeClause
    casefeatureUrlClause
    | casefeatureValueTypeClause
    casefeatureFhirTypeClause
    casefeatureUrlClause
    casefeatureCodeClause
    | casefeatureValueTypeClause
    casefeatureUrlClause
    casefeatureCodeClause
    casefeatureFhirTypeClause
    | casefeatureValueTypeClause
    casefeatureUrlClause
    casefeatureFhirTypeClause
    casefeatureCodeClause
    ;

casefeatureCodeClause
    : 'code' STRING NEWLINE
    ;

casefeatureFhirTypeClause
    : 'fhirtype' CASEFEATURE_FHIR_TYPE NEWLINE
    ;

casefeatureUrlClause
    : 'url' STRING NEWLINE
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
VALUETYPE: 'valuetype';
CODE: 'code';
URL: 'url';
ANY: 'any';
ALL: 'all';

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
CASEFEATURE_FHIR_TYPE: 'AllergyIntolerance'
    | 'Condition'
    | 'Procedure'
    | 'Observation'
    | 'Immunization'
    | 'MedicationDispense'
    | 'MedicationAdministration'
    | 'MedicationStatement';
FHIR_VALUE_TYPE: 'base64Binary'
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
    | 'xhtml';

// Special tokens
NEWLINE: '\r'? '\n';
WS: [ \t]+ -> skip;
COMMENT: '//' ~[\r\n]* -> skip;
COMMENT_BLOCK: '/*' .*? '*/' -> skip;
INDENT: '    ' -> channel(HIDDEN);
DEDENT: -> channel(HIDDEN);

// String literals
STRING: '"' (~["])* '"';

// Error token
ERROR: .;
