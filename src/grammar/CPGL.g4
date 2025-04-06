grammar CPGL;

// ========================================================
// Parser Rules
// ========================================================

file
    : (statement NEWLINE?)* EOF
    ;

statement
    : decision
    | action
    | casefeature
    ;

// ----------------------------------------------------------------
// Decision Constructs
// ----------------------------------------------------------------

decision
    : 'decision' WS+ STRING NEWLINE decisionBlock
    ;

// A decisionBlock is one or more top-level when clauses.
decisionBlock
    : INDENT whenClause+ DEDENT
    ;

// A whenClause consists of a condition and a block that is either a
// group of nested whenClauses (with an optional qualifier) or terminal actions.
whenClause
    : 'when' WS+ STRING WS+ 'then' NEWLINE whenBlock
    ;

// A whenBlock can be either a nested group of conditions or a list of terminal actions.
whenBlock
    : nestedWhenBlock
    | terminalBlock
    ;

// A nestedWhenBlock is an indented block that may optionally begin with a qualifier
// and then contains one or more nested whenClause entries.
nestedWhenBlock
    : INDENT optionalQualifier? whenClause+ DEDENT
    ;

// A terminalBlock is an indented block containing one or more terminal actions.
terminalBlock
    : INDENT terminalAction+ DEDENT
    ;

// Terminal actions are either a doClause or a useClause.
terminalAction
    : doClause
    | useClause
    ;

// doClause and useClause are only permitted within a terminal block.
doClause
    : 'do' WS+ STRING NEWLINE
    ;

useClause
    : 'use' WS+ STRING NEWLINE
    ;

// A qualifier (either "any" or "all") to modify a group of nested whenClauses.
optionalQualifier
    : ('any' | 'all') NEWLINE
    ;

// ----------------------------------------------------------------
// Action and Casefeature Constructs
// ----------------------------------------------------------------

action
    : 'action' WS+ STRING NEWLINE actionBlock
    ;

// An actionBlock must have one and only one actionClause.
actionBlock
    : INDENT actionClause DEDENT
    ;

actionClause
    : 'fhirtype' WS+ ACTION_FHIR_TYPE NEWLINE
    ;

// A casefeature is defined by a keyword, a name, a newline, and a block,
// with an optional composite expression following.
casefeature
    : 'casefeature' WS+ STRING NEWLINE casefeatureBlock (compositeExpression NEWLINE)?
    ;

// A casefeatureBlock must have one and only one casefeatureClause.
casefeatureBlock
    : INDENT casefeatureClause DEDENT
    ;

casefeatureClause
    : 'casefeaturecode' WS+ STRING NEWLINE
    | 'fhirtype' WS+ CASEFEATURE_FHIR_TYPE NEWLINE
    | 'profileurl' WS+ STRING NEWLINE
    | 'valuetype' WS+ FHIR_VALUE_TYPE NEWLINE
    ;

// A composite boolean expression for advanced casefeature logic.
compositeExpression
    : '(' booleanExpr ')'
    ;

// Boolean expression rules (standard operator precedence).
booleanExpr
    : booleanTerm ( WS* OR WS* booleanTerm )*
    ;

booleanTerm
    : booleanFactor ( WS* AND WS* booleanFactor )*
    ;

booleanFactor
    : NOT WS* booleanFactor
    | '(' booleanExpr ')'
    | STRING
    ;

// ========================================================
// Lexer Rules
// ========================================================

// INDENT and DEDENT tokens are placeholders.
// A production-ready solution would use a custom lexer routine to track indent levels.
INDENT:  '    ';  // exactly 4 spaces for one indent level
DEDENT:  '<DEDENT>';

// NEWLINE matches one or more line breaks.
NEWLINE: ('\r'? '\n')+;

// WS matches whitespace (spaces and tabs) that are not part of indentation.
WS: [ \t]+ -> skip;

// Comments.
COMMENT: '//' ~[\r\n]* -> skip;
COMMENT_BLOCK: '/*' .*? '*/' -> skip;

// STRING: double-quoted string without embedded newlines.
STRING: '"' (~["\r\n])* '"';

// Boolean operators for composite expressions.
OR: 'OR';
AND: 'AND';
NOT: 'NOT';

// FHIR types for actions.
ACTION_FHIR_TYPE:
      'Appointment'
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

// FHIR types for casefeatures.
CASEFEATURE_FHIR_TYPE:
      'AllergyIntolerance'
    | 'Condition'
    | 'Procedure'
    | 'Observation'
    | 'Immunization'
    | 'MedicationDispense'
    | 'MedicationAdministration'
    | 'MedicationStatement'
    ;

// FHIR value types.
FHIR_VALUE_TYPE:
      'base64Binary'
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
