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

// For actions, fhirtype specifies a FHIR resource type (e.g. ServiceRequest)
fhirtypeClause
    : 'fhirtype' IDENTIFIER NEWLINE
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

// For casefeatures, fhirtype is given as an identifier (e.g. Condition, Observation)
casefeatureFhirtypeClause
    : 'fhirtype' IDENTIFIER NEWLINE
    ;

urlClause
    : 'url' STRING NEWLINE
    ;

valuetypeClause
    : 'valuetype' IDENTIFIER NEWLINE
    ;

/*
 * Lexer Rules
 */

// A STRING is a quoted sequence (without embedded line breaks)
STRING: '"' (~["\r\n])* '"';

// IDENTIFIER: sequence of letters, digits, underscores, starting with a letter or underscore.
IDENTIFIER: [a-zA-Z_][a-zA-Z_0-9]* ;

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
